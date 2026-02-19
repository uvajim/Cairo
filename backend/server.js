require('dotenv').config();

const express       = require('express');
const Alpaca        = require('@alpacahq/alpaca-trade-api');
const { HDNodeWallet } = require('ethers');

const app = express();
app.use(express.json());

// Allow requests from the Next.js dev server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const alpaca = new Alpaca({
  keyId:     process.env.APCA_API_KEY_ID,
  secretKey: process.env.APCA_API_SECRET_KEY,
  paper:     process.env.ALPACA_PAPER !== 'false',
});

// ─── In-memory asset cache (1-hour TTL for search) ───────────────────────────
let assetsCache   = null;
let assetsCachedAt = 0;

async function getActiveAssets() {
  if (assetsCache && Date.now() - assetsCachedAt < 3_600_000) return assetsCache;
  assetsCache    = await alpaca.getAssets({ status: 'active', asset_class: 'us_equity' });
  assetsCachedAt = Date.now();
  return assetsCache;
}

// ─── Parse structured error from Alpaca SDK ──────────────────────────────────
function parseAlpacaError(err) {
  const m = String(err.message ?? '').match(/code:\s*(\d+),\s*message:\s*(.*)/);
  if (m) return { code: parseInt(m[1], 10), message: m[2] };
  return { code: 500, message: err.message ?? 'Unknown error' };
}

// ─── GET /api/market/snapshot/:symbol ────────────────────────────────────────
app.get('/api/market/snapshot/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const snap = await alpaca.getSnapshot(symbol.toUpperCase());

    const price    = snap.LatestTrade?.Price  ?? snap.MinuteBar?.ClosePrice  ?? 0;
    const prevClose = snap.PrevDailyBar?.ClosePrice ?? 0;
    const change   = price - prevClose;

    res.json({
      price,
      change,
      changePercent: prevClose > 0 ? (change / prevClose) * 100 : 0,
      open:      snap.DailyBar?.OpenPrice  ?? 0,
      high:      snap.DailyBar?.HighPrice  ?? 0,
      low:       snap.DailyBar?.LowPrice   ?? 0,
      volume:    snap.DailyBar?.Volume     ?? 0,
      vwap:      snap.DailyBar?.VWAP       ?? 0,
      prevClose,
      bidPrice:  snap.LatestQuote?.BidPrice ?? 0,
      askPrice:  snap.LatestQuote?.AskPrice ?? 0,
    });
  } catch (err) {
    const { code, message } = parseAlpacaError(err);
    console.error(`[snapshot] ${req.params.symbol}:`, code, message);
    res.status(code).json({ error: message });
  }
});

// ─── GET /api/market/bars/:symbol?timeframe=5Min&start=YYYY-MM-DD ────────────
app.get('/api/market/bars/:symbol', async (req, res) => {
  try {
    const { symbol }  = req.params;
    const timeframe   = req.query.timeframe || '1Day';
    const start       = req.query.start     || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d.toISOString().split('T')[0];
    })();

    const gen  = alpaca.getBarsV2(symbol.toUpperCase(), { timeframe, start, feed: 'iex' });
    const bars = [];
    for await (const bar of gen) {
      bars.push({ time: bar.Timestamp, close: bar.ClosePrice });
    }
    res.json({ bars });
  } catch (err) {
    const { code, message } = parseAlpacaError(err);
    console.error(`[bars] ${req.params.symbol}:`, code, message);
    res.status(code).json({ error: message });
  }
});

// ─── GET /api/market/news/:symbol?limit=5 ────────────────────────────────────
app.get('/api/market/news/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const limit      = parseInt(req.query.limit, 10) || 5;
    const raw        = await alpaca.getNews({ symbols: [symbol.toUpperCase()], totalLimit: limit });
    const items      = Array.isArray(raw) ? raw : (raw.news ?? []);
    res.json({
      news: items.map(n => ({
        id:        n.id,
        headline:  n.headline,
        source:    n.source,
        url:       n.url,
        createdAt: n.created_at,
        imageUrl:  n.images?.[0]?.url ?? null,
      })),
    });
  } catch (err) {
    const { code, message } = parseAlpacaError(err);
    console.error(`[news] ${req.params.symbol}:`, code, message);
    res.status(code).json({ error: message });
  }
});

// ─── GET /api/market/asset/:symbol ───────────────────────────────────────────
app.get('/api/market/asset/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const a          = await alpaca.getAsset(symbol.toUpperCase());
    res.json({
      symbol:      a.symbol,
      name:        a.name,
      exchange:    a.exchange,
      assetClass:  a.class,
      tradable:    a.tradable,
      fractionable: a.fractionable,
    });
  } catch (err) {
    const { code, message } = parseAlpacaError(err);
    console.error(`[asset] ${req.params.symbol}:`, code, message);
    res.status(code).json({ error: message });
  }
});

// ─── GET /api/market/search?q=QUERY ──────────────────────────────────────────
app.get('/api/market/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim().toUpperCase();
    if (!q) return res.json({ results: [] });

    const assets  = await getActiveAssets();
    const results = assets
      .filter(a => a.symbol.startsWith(q) || a.name.toUpperCase().includes(q))
      .sort((a, b) => {
        const aExact = a.symbol === q ? -1 : a.symbol.startsWith(q) ? 0 : 1;
        const bExact = b.symbol === q ? -1 : b.symbol.startsWith(q) ? 0 : 1;
        return aExact - bExact;
      })
      .slice(0, 8)
      .map(a => ({ symbol: a.symbol, name: a.name, exchange: a.exchange }));

    res.json({ results });
  } catch (err) {
    console.error('[search]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/market/snapshots?symbols=AAPL,TSLA ─────────────────────────────
app.get('/api/market/snapshots', async (req, res) => {
  try {
    const symbols = (req.query.symbols || '')
      .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return res.json({});

    const snaps  = await alpaca.getSnapshots(symbols);
    const result = {};
    const list   = Array.isArray(snaps) ? snaps : Object.values(snaps);
    for (const snap of list) {
      const sym      = snap.symbol ?? snap.Symbol;
      const price    = snap.LatestTrade?.Price ?? snap.MinuteBar?.ClosePrice ?? 0;
      const prevClose = snap.PrevDailyBar?.ClosePrice ?? 0;
      result[sym] = {
        price,
        change:        price - prevClose,
        changePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      };
    }
    res.json(result);
  } catch (err) {
    const { code, message } = parseAlpacaError(err);
    console.error('[snapshots]', code, message);
    res.status(code).json({ error: message });
  }
});

// ─── GET /api/market/crypto?ids=bitcoin,ethereum ─────────────────────────────
app.get('/api/market/crypto', async (req, res) => {
  try {
    const ids = req.query.ids || 'bitcoin';
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const data = await fetch(url).then(r => r.json());
    const result = {};
    for (const [id, info] of Object.entries(data)) {
      const price = info.usd ?? 0;
      result[id] = {
        price,
        change:        (price * (info.usd_24h_change ?? 0)) / 100,
        changePercent: info.usd_24h_change ?? 0,
      };
    }
    res.json(result);
  } catch (err) {
    console.error('[crypto]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/market/eth-history?days=1 ──────────────────────────────────────
// Returns { points: [{ time: string, value: number }] } for the Portfolio chart
app.get('/api/market/eth-history', async (req, res) => {
  try {
    const days     = parseInt(req.query.days, 10) || 1;
    const interval = days <= 1 ? 'hourly' : days <= 90 ? 'daily' : 'daily';
    const url      = `https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=${days}&interval=${interval}`;
    const data     = await fetch(url).then(r => r.json());

    const points = (data.prices ?? []).map(([ts, price]) => {
      const d = new Date(ts);
      let label;
      if (days <= 1) {
        label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (days <= 7) {
        label = d.toLocaleDateString([], { weekday: 'short' }) + ' ' +
                d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      }
      return { time: label, value: Math.round(price * 100) / 100 };
    });

    res.json({ points });
  } catch (err) {
    console.error('[eth-history]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/transaction ────────────────────────────────────────────────────
// Mirrors the Firebase doTransaction function for local dev.
// Requires WALLET_MNEMONIC in .env.
//
// Body: { requestedTicker, paymentStablecoin, unitsRequested, recipientAddress }
// Returns: { depositAddress, marketPriceLocked, billTotal, currency }

let walletIndex  = 0;                      // HD wallet derivation counter
const pendingOrders = new Map();           // in-memory ledger (use Firestore in prod)

app.options('/api/transaction', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.sendStatus(204);
});

app.post('/api/transaction', async (req, res) => {
  try {
    const { requestedTicker, paymentStablecoin, unitsRequested, recipientAddress } = req.body;

    if (!requestedTicker || !paymentStablecoin || !unitsRequested || !recipientAddress) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const mnemonic = process.env.WALLET_MNEMONIC;
    if (!mnemonic) {
      return res.status(500).json({ error: 'WALLET_MNEMONIC not configured in .env' });
    }

    // 1. Validate ticker via Alpaca asset lookup
    let asset;
    try {
      asset = await alpaca.getAsset(requestedTicker.toUpperCase());
    } catch {
      return res.status(404).json({ error: `Ticker "${requestedTicker}" not found.` });
    }
    if (!asset.tradable) {
      return res.status(400).json({ error: `${requestedTicker} is not currently tradable.` });
    }

    // 2. Fetch real-time market price
    const snap       = await alpaca.getSnapshot(requestedTicker.toUpperCase());
    const marketPrice = snap.LatestTrade?.Price ?? snap.MinuteBar?.ClosePrice ?? 0;
    if (marketPrice <= 0) {
      return res.status(503).json({ error: 'Could not fetch a live price. Market may be closed.' });
    }

    // 3. Calculate total bill
    const billTotal = Math.round(marketPrice * unitsRequested * 100) / 100;

    // 4. Derive next unique deposit address from HD wallet
    const nextIndex    = ++walletIndex;
    const masterNode   = HDNodeWallet.fromPhrase(mnemonic);
    const depositWallet = masterNode.derivePath(`m/44'/60'/0'/0/${nextIndex}`);
    const depositAddress = depositWallet.address;

    // 5. Store the order (swap Map for Firestore in production)
    pendingOrders.set(depositAddress.toLowerCase(), {
      requestedTicker:   requestedTicker.toUpperCase(),
      unitsToDispense:   unitsRequested,
      lockedPricePerUnit: marketPrice,
      paymentExpected:   billTotal,
      paymentStablecoin: paymentStablecoin.toUpperCase(),
      recipient:         recipientAddress,
      status:            'awaiting_payment',
      derivationIndex:   nextIndex,
      createdAt:         new Date().toISOString(),
    });

    // 6. Return the invoice
    res.json({ depositAddress, marketPriceLocked: marketPrice, billTotal, currency: paymentStablecoin.toUpperCase() });

  } catch (err) {
    const { code, message } = parseAlpacaError(err);
    console.error('[transaction]', code, message);
    res.status(code).json({ error: message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Market API listening on http://localhost:${PORT}`));
