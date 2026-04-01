const functions = require('@google-cloud/functions-framework');
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { Firestore } = require('@google-cloud/firestore');
const { importJWK, jwtVerify, decodeProtectedHeader } = require('jose');
const crypto = require('crypto');

// ── Initialization ─────────────────────────────────────────────────────────────
const firestore = new Firestore();
const STATE_DOC_REF = firestore.collection('plaid_webhooks').doc('transfer_sync_state');

const plaidClient = new PlaidApi(
  new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
    },
  })
);

// ── Plaid JWS Webhook Verification ───────────────────────────────────────────
const jwkCache = new Map(); // kid → { key, expiresAt }

async function getPlaidKey(kid) {
  const hit = jwkCache.get(kid);
  if (hit && hit.expiresAt > Date.now()) return hit.key;

  const { data } = await plaidClient.webhookVerificationKeyGet({ key_id: kid });
  const key = await importJWK(data.key, 'ES256');
  jwkCache.set(kid, { key, expiresAt: Date.now() + 5 * 60_000 });

  return key;
}

async function verifyPlaidSignature(req) {
  if ((process.env.PLAID_ENV || 'sandbox') === 'sandbox') return true;

  const token = req.headers['plaid-verification'];
  if (!token) return false;

  try {
    const { kid } = decodeProtectedHeader(token);
    const key = await getPlaidKey(kid);
    const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'] });

    // CRITICAL: Hash the raw, unparsed buffer provided by Google Cloud Functions
    const bodyHash = crypto.createHash('sha256').update(req.rawBody).digest('hex');

    return payload.request_body_sha256 === bodyHash;
  } catch (err) {
    console.error('Plaid signature verification failed:', err.message);
    return false;
  }
}

// ── Minting Logic (Relayer) ──────────────────────────────────────────────────
async function mintForTransfer(transferId) {
  // 1. Look up the original transfer intent and user signature
  const transferDoc = await firestore.collection('plaid_transfers').doc(transferId).get();

  if (!transferDoc.exists) {
    throw new Error(`Transfer ${transferId} not found in Firestore. Cannot mint.`);
  }

  // `userSignature`  = EIP-712 sig the user produced when initiating the deposit
  // `intentTimestamp` = the Unix timestamp that was signed (stored as `timestamp` in Firestore)
  const { walletAddress, amount, userSignature, intentSignature, timestamp: intentTimestamp } = transferDoc.data();
  const eip712Sig = userSignature || intentSignature || null;

  if (!eip712Sig || !intentTimestamp) {
    throw new Error(`Transfer ${transferId} is missing userSignature or intentTimestamp — cannot mint.`);
  }

  // Fresh timestamp for replay-attack protection on the mint request itself.
  // (intentTimestamp is days old by the time ACH settles — it cannot be used here.)
  const mintTimestamp = Date.now();

  // HMAC covers only the 4 canonical fields — userSignature/intentTimestamp are NOT included.
  const canonicalPayload = { walletAddress, amount, transferId, timestamp: mintTimestamp };
  const hmac = crypto
    .createHmac('sha256', process.env.MINT_SIGNING_SECRET)
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');

  const body = { ...canonicalPayload, userSignature: eip712Sig, intentTimestamp };
  const bodyStr = JSON.stringify(body);

  // 3. Relay to backend
  const mintRes = await fetch(`${process.env.BACKEND_URL}/api/mint`, {
    method: 'POST',
    headers: {
      'Content-Type':    'application/json',
      'X-Cairo-Signature': hmac,
    },
    body: bodyStr,
  });

  if (!mintRes.ok) {
    const errText = await mintRes.text();
    throw new Error(`Backend rejected mint for ${transferId}: ${errText}`);
  }

  const result = await mintRes.json();
  console.log(`Minted ${amount} MDT to ${walletAddress}. TxHash: ${result.txHash}`);
}

// ── Main Webhook Handler ─────────────────────────────────────────────────────
functions.http('plaidWebhook', async (req, res) => {
  if (req.method === 'GET') return res.status(200).send('ok');

  if (req.method === 'POST') {
    if (!(await verifyPlaidSignature(req))) {
      console.error('Rejected webhook: invalid Plaid signature');
      return res.status(401).send('Unauthorized');
    }

    const { webhook_type, webhook_code } = req.body || {};

    if (webhook_type === 'TRANSFER' && webhook_code === 'TRANSFER_EVENTS_UPDATE') {
      try {
        const stateDoc = await STATE_DOC_REF.get();
        let latestEventId = stateDoc.exists ? (stateDoc.data().latestEventId || 0) : 0;
        let processedIdsSet = stateDoc.exists && stateDoc.data().processedIds
          ? new Set(stateDoc.data().processedIds)
          : new Set();

        let hasMore = true;
        let madeChanges = false;
        let batchFailed = false;

        while (hasMore) {
          const syncResponse = await plaidClient.transferEventSync({
            after_id: latestEventId,
            count: 100,
          });

          const events = syncResponse.data.transfer_events || [];

          for (const event of events) {
            if (processedIdsSet.has(event.event_id)) {
              console.log(`Skipping event ${event.event_id}: already processed`);
              continue;
            }

            console.log(`Transfer ${event.transfer_id} → ${event.event_type}`);

            try {
              if (event.event_type === 'funds_available') {
                await mintForTransfer(event.transfer_id);
              }

              // Only update cursor if the minting logic SUCCEEDED
              processedIdsSet.add(event.event_id);
              madeChanges = true;
              if (event.event_id > latestEventId) latestEventId = event.event_id;

            } catch (processError) {
              console.error(`Failed processing event ${event.event_id}:`, processError.message);
              batchFailed = true;
              break; // Stop processing this batch so we don't skip over failed events
            }
          }

          if (batchFailed) break; // Break out of the while loop entirely to save state
          hasMore = syncResponse.data.has_more === true;
        }

        // Save whatever progress we DID make before a potential crash
        if (madeChanges) {
          await STATE_DOC_REF.set(
            { latestEventId, processedIds: Array.from(processedIdsSet) },
            { merge: true }
          );
        }

        // If the batch failed partway through, return 500 so Plaid retries the webhook
        if (batchFailed) {
          return res.status(500).send('Partial failure, requesting retry');
        }

        return res.status(200).send('ok');
      } catch (e) {
        console.error('Transfer sync system error:', e.response?.data ?? e.message);
        return res.status(500).send('error');
      }
    }

    return res.status(200).send('ignored');
  }

  return res.status(405).send('Method Not Allowed');
});
