const { onRequest } = require("firebase-functions/v2/https");
const { HDNodeWallet } = require("ethers");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Alpaca = require("@alpacahq/alpaca-trade-api");

if (!admin.apps.length) { admin.initializeApp(); }
const db = admin.firestore();

// Pulling your keys safely from Secret Manager
const mnemonicSecret = defineSecret("WALLET_MNEMONIC");
const alpacaKey = defineSecret("ALPACA_API_KEY");
const alpacaSecret = defineSecret("ALPACA_SECRET_KEY");

exports.doTransaction = onRequest({ secrets: [mnemonicSecret, alpacaKey, alpacaSecret] }, async (req, res) => {
  try {
    const { requestedTicker, paymentStablecoin, unitsRequested, recipientAddress } = req.body;

    if (!requestedTicker || !paymentStablecoin || !unitsRequested || !recipientAddress) {
      return res.status(400).send("Missing required fields.");
    }

    const assetQuery = await db.collection("assets").where("ticker", "==", requestedTicker.toUpperCase()).limit(1).get();
    if (assetQuery.empty) return res.status(404).send("Token not found in machine.");

    const alpaca = new Alpaca({
      keyId:     alpacaKey.value(),
      secretKey: alpacaSecret.value(),
      paper:     process.env.ALPACA_PAPER !== 'false',
    });

    const latestTrade = await alpaca.getLatestTrade(requestedTicker.toUpperCase());
    const marketPrice = latestTrade.Price;
    const requiredPayment = marketPrice * unitsRequested;

    // 4. Generate the unique Deposit Address
    const counterRef = db.collection("system").doc("counters");
    const nextIndex = await db.runTransaction(async (t) => {
      const doc = await t.get(counterRef);
      const newIndex = (doc.exists ? doc.data().walletIndex : 0) + 1;
      t.set(counterRef, { walletIndex: newIndex }, { merge: true });
      return newIndex;
    });

    const masterNode = HDNodeWallet.fromPhrase(mnemonicSecret.value());
    const depositWallet = masterNode.derivePath(`m/44'/60'/0'/0/${nextIndex}`);

    await db.collection("pending_orders").doc(depositWallet.address.toLowerCase()).set({
      requestedTicker: requestedTicker.toUpperCase(),
      unitsToDispense: unitsRequested,
      lockedPricePerUnit: marketPrice,
      paymentExpected: requiredPayment,
      paymentStablecoin: paymentStablecoin.toUpperCase(),
      recipient: recipientAddress,
      status: "awaiting_payment",
      derivationIndex: nextIndex,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.status(200).send({
      depositAddress: depositWallet.address,
      marketPriceLocked: marketPrice,
      billTotal: requiredPayment,
      currency: paymentStablecoin
    });

  } catch (error) {
    console.error("Pricing or Generation Error:", error);
    res.status(500).send("Error generating invoice.");
  }
});