/**
 * Trade API server — handles buy/sell offer signing for the Overseer contract.
 *
 * Accepts monetary amounts (USD) instead of share quantities.
 * Calculates shares internally from the current market price.
 *
 * POST /api/trade/buy  { user, ticker, amount }  → { offer, signature }
 * POST /api/trade/sell { user, ticker, amount }  → { offer, signature }
 *
 * amount: 6-decimal integer string (e.g. $1.50 → "1500000")
 *
 * Required env vars:
 *   SIGNER_PRIVATE_KEY   — EIP-712 signing key (must match Overseer's backend signer)
 *   OVERSEER_CONTRACT    — Overseer contract address
 *   CHAIN_ID             — EVM chain ID (default: 11155111 Sepolia)
 *   APCA_API_KEY_ID      — Alpaca API key
 *   APCA_API_SECRET_KEY  — Alpaca API secret
 *   PORT                 — HTTP port (default: 3001)
 */

const express = require('express');
const cors    = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

const CHAIN_ID          = Number(process.env.CHAIN_ID ?? 11155111);
const OVERSEER_CONTRACT = process.env.OVERSEER_CONTRACT;
const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
const ALPACA_KEY        = process.env.APCA_API_KEY_ID;
const ALPACA_SECRET     = process.env.APCA_API_SECRET_KEY;
const PORT              = Number(process.env.PORT ?? 3001);
const OFFER_TTL_SECS    = 120n; // offer valid for 2 minutes

if (!SIGNER_PRIVATE_KEY) throw new Error('SIGNER_PRIVATE_KEY is required');
if (!OVERSEER_CONTRACT)  throw new Error('OVERSEER_CONTRACT is required');

const signer = new ethers.Wallet(SIGNER_PRIVATE_KEY);

// EIP-712 domain — must match the Overseer contract's domain exactly
const domain = {
  name:              'Cairo',
  version:           '1',
  chainId:           CHAIN_ID,
  verifyingContract: OVERSEER_CONTRACT,
};

const BUY_TYPES = {
  BuyOffer: [
    { name: 'user',      type: 'address' },
    { name: 'ticker',    type: 'string'  },
    { name: 'shares',    type: 'uint256' },
    { name: 'mdtCost',   type: 'uint256' },
    { name: 'price',     type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce',     type: 'uint256' },
    { name: 'expiry',    type: 'uint256' },
  ],
};

const SELL_TYPES = {
  SellOffer: [
    { name: 'user',      type: 'address' },
    { name: 'ticker',    type: 'string'  },
    { name: 'shares',    type: 'uint256' },
    { name: 'mdtPayout', type: 'uint256' },
    { name: 'price',     type: 'uint256' },
    { name: 'timestamp', type: 'uint256' },
    { name: 'nonce',     type: 'uint256' },
    { name: 'expiry',    type: 'uint256' },
  ],
};

// Per-user nonce tracking (in-memory; use Redis/DB for multi-instance deployments)
const userNonces = new Map();

function nextNonce(user) {
  const n = (userNonces.get(user.toLowerCase()) ?? 0) + 1;
  userNonces.set(user.toLowerCase(), n);
  return BigInt(n);
}

// Fetch latest trade price from Alpaca
async function fetchPrice(ticker) {
  const url = `https://data.alpaca.markets/v2/stocks/${ticker}/snapshot`;
  const res = await fetch(url, {
    headers: {
      'APCA-API-KEY-ID':     ALPACA_KEY,
      'APCA-API-SECRET-KEY': ALPACA_SECRET,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Alpaca snapshot failed for ${ticker} (${res.status}): ${body}`);
  }

  const data = await res.json();
  const price = data.latestTrade?.p ?? data.latestQuote?.ap;
  if (!price) throw new Error(`No price available for ${ticker}`);
  return price; // USD float
}

function buildOfferJson(offer) {
  return Object.fromEntries(
    Object.entries(offer).map(([k, v]) => [k, v.toString()])
  );
}

// ── POST /api/trade ──────────────────────────────────────────────────────────
// Body: { walletAddress, ticker, amount, side: 'buy' | 'sell' }
// amount: 6-decimal USD integer string (e.g. $5.00 → "5000000")
app.post('/api/trade', async (req, res) => {
  try {
    const { walletAddress, ticker, amount, side } = req.body ?? {};
    if (!walletAddress || !ticker || !amount || !side) {
      return res.status(400).json({ error: 'Missing required fields: walletAddress, ticker, amount, side' });
    }
    if (side !== 'buy' && side !== 'sell') {
      return res.status(400).json({ error: 'side must be "buy" or "sell"' });
    }

    const amountRaw = BigInt(amount);
    if (amountRaw <= 0n) return res.status(400).json({ error: 'amount must be positive' });

    const priceUsd = await fetchPrice(ticker);
    const priceRaw = BigInt(Math.round(priceUsd * 1_000_000));

    // shares (6-dec) = amount_6dec * 1e6 / price_6dec
    const sharesRaw = (amountRaw * 1_000_000n) / priceRaw;

    const timestamp = BigInt(Math.floor(Date.now() / 1000));
    const nonce     = nextNonce(walletAddress);
    const expiry    = timestamp + OFFER_TTL_SECS;

    let offer, signature;
    if (side === 'buy') {
      offer     = { user: walletAddress, ticker, shares: sharesRaw, mdtCost: amountRaw, price: priceRaw, timestamp, nonce, expiry };
      signature = await signer.signTypedData(domain, BUY_TYPES, offer);
    } else {
      offer     = { user: walletAddress, ticker, shares: sharesRaw, mdtPayout: amountRaw, price: priceRaw, timestamp, nonce, expiry };
      signature = await signer.signTypedData(domain, SELL_TYPES, offer);
    }

    return res.json({ offer: buildOfferJson(offer), signature });
  } catch (err) {
    console.error(`[trade]`, err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Trade server listening on port ${PORT} (chain ${CHAIN_ID})`);
  console.log(`Signer address: ${signer.address}`);
});
