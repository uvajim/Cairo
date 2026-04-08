/**
 * SQLite database — activity index + portfolio history.
 *
 * Tables:
 *   activity            — one row per on-chain event (deposit / withdrawal / buy / sell)
 *   indexer_state       — key/value store for indexer progress (last_indexed_block)
 *   portfolio_snapshots — time-series portfolio value per wallet
 */

const Database = require('better-sqlite3');
const path     = require('path');

const db = new Database(path.join(__dirname, 'activity.db'));
db.pragma('journal_mode = WAL');   // safe for concurrent reads + single writer
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS activity (
    id           TEXT    PRIMARY KEY,
    wallet       TEXT    NOT NULL,
    kind         TEXT    NOT NULL,   -- deposit | withdrawal | buy | sell
    ticker       TEXT,               -- stock ticker (trades only)
    token        TEXT,               -- USDC | USDT (deposits/withdrawals only)
    amount       REAL    NOT NULL DEFAULT 0,   -- USD value (6-dec normalised)
    shares       REAL,               -- share qty (trades only, 6-dec normalised)
    tx_hash      TEXT    NOT NULL,
    block_number INTEGER NOT NULL,
    block_time   INTEGER NOT NULL    -- unix seconds
  );
  CREATE INDEX IF NOT EXISTS idx_activity_wallet ON activity(wallet COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_activity_block  ON activity(block_number);

  CREATE TABLE IF NOT EXISTS indexer_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    wallet      TEXT    NOT NULL,
    value       REAL    NOT NULL,
    recorded_at INTEGER NOT NULL,   -- unix seconds
    PRIMARY KEY (wallet, recorded_at)
  );
  CREATE INDEX IF NOT EXISTS idx_portfolio_wallet ON portfolio_snapshots(wallet COLLATE NOCASE, recorded_at);
`);

const stmtInsert = db.prepare(`
  INSERT OR IGNORE INTO activity
    (id, wallet, kind, ticker, token, amount, shares, tx_hash, block_number, block_time)
  VALUES
    (@id, @wallet, @kind, @ticker, @token, @amount, @shares, @tx_hash, @block_number, @block_time)
`);

const stmtByWallet = db.prepare(`
  SELECT * FROM activity
  WHERE wallet = ? COLLATE NOCASE
  ORDER BY block_number DESC, rowid DESC
`);

const stmtGetState = db.prepare(`SELECT value FROM indexer_state WHERE key = ?`);
const stmtSetState = db.prepare(`INSERT OR REPLACE INTO indexer_state (key, value) VALUES (?, ?)`);

function insertActivity(row) {
  stmtInsert.run(row);
}

function getActivityByWallet(wallet) {
  return stmtByWallet.all(wallet);
}

function getState(key, defaultValue = null) {
  const row = stmtGetState.get(key);
  return row ? row.value : defaultValue;
}

function setState(key, value) {
  stmtSetState.run(key, String(value));
}

// ── Portfolio snapshots ───────────────────────────────────────────────────────

const stmtUpsertSnapshot = db.prepare(`
  INSERT OR REPLACE INTO portfolio_snapshots (wallet, value, recorded_at)
  VALUES (?, ?, ?)
`);

const stmtLatestSnapshot = db.prepare(`
  SELECT value, recorded_at FROM portfolio_snapshots
  WHERE wallet = ? COLLATE NOCASE
  ORDER BY recorded_at DESC
  LIMIT 1
`);

const stmtSnapshotHistory = db.prepare(`
  SELECT value, recorded_at FROM portfolio_snapshots
  WHERE wallet = ? COLLATE NOCASE
    AND recorded_at >= ?
  ORDER BY recorded_at ASC
`);

function upsertSnapshot(wallet, value) {
  stmtUpsertSnapshot.run(wallet.toLowerCase(), value, Math.floor(Date.now() / 1000));
}

function getLatestSnapshot(wallet) {
  return stmtLatestSnapshot.get(wallet.toLowerCase()) ?? null;
}

function getSnapshotHistory(wallet, sinceSecs) {
  return stmtSnapshotHistory.all(wallet.toLowerCase(), sinceSecs);
}

module.exports = {
  insertActivity, getActivityByWallet,
  getState, setState,
  upsertSnapshot, getLatestSnapshot, getSnapshotHistory,
};
