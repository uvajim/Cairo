/**
 * PostgreSQL database — activity index + portfolio history.
 *
 * Requires DATABASE_URL env var (Railway injects this automatically when
 * the Postgres plugin is added to the project).
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS activity (
      id           TEXT   PRIMARY KEY,
      wallet       TEXT   NOT NULL,
      kind         TEXT   NOT NULL,
      ticker       TEXT,
      token        TEXT,
      amount       REAL   NOT NULL DEFAULT 0,
      shares       REAL,
      tx_hash      TEXT   NOT NULL,
      block_number BIGINT NOT NULL,
      block_time   BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_wallet ON activity(LOWER(wallet));
    CREATE INDEX IF NOT EXISTS idx_activity_block  ON activity(block_number);

    CREATE TABLE IF NOT EXISTS indexer_state (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      wallet      TEXT   NOT NULL,
      value       REAL   NOT NULL,
      recorded_at BIGINT NOT NULL,
      PRIMARY KEY (wallet, recorded_at)
    );
    CREATE INDEX IF NOT EXISTS idx_portfolio_wallet
      ON portfolio_snapshots(LOWER(wallet), recorded_at);
  `);
  console.log('[db] Schema ready');
}

// ── Activity ──────────────────────────────────────────────────────────────────

async function insertActivity(row) {
  await pool.query(
    `INSERT INTO activity
       (id, wallet, kind, ticker, token, amount, shares, tx_hash, block_number, block_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (id) DO NOTHING`,
    [row.id, row.wallet, row.kind, row.ticker ?? null, row.token ?? null,
     row.amount, row.shares ?? null, row.tx_hash, row.block_number, row.block_time],
  );
}

async function getActivityByWallet(wallet) {
  const { rows } = await pool.query(
    `SELECT * FROM activity
     WHERE LOWER(wallet) = LOWER($1)
     ORDER BY block_number DESC, id DESC`,
    [wallet],
  );
  return rows;
}

// ── Indexer state ─────────────────────────────────────────────────────────────

async function getState(key, defaultValue = null) {
  const { rows } = await pool.query(
    `SELECT value FROM indexer_state WHERE key = $1`, [key],
  );
  return rows.length ? rows[0].value : defaultValue;
}

async function setState(key, value) {
  await pool.query(
    `INSERT INTO indexer_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)],
  );
}

// ── Portfolio snapshots ───────────────────────────────────────────────────────

async function upsertSnapshot(wallet, value) {
  await pool.query(
    `INSERT INTO portfolio_snapshots (wallet, value, recorded_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (wallet, recorded_at) DO UPDATE SET value = EXCLUDED.value`,
    [wallet.toLowerCase(), value, Math.floor(Date.now() / 1000)],
  );
}

async function getLatestSnapshot(wallet) {
  const { rows } = await pool.query(
    `SELECT value, recorded_at FROM portfolio_snapshots
     WHERE LOWER(wallet) = LOWER($1)
     ORDER BY recorded_at DESC LIMIT 1`,
    [wallet],
  );
  return rows.length ? rows[0] : null;
}

async function getSnapshotHistory(wallet, sinceSecs) {
  const { rows } = await pool.query(
    `SELECT value, recorded_at FROM portfolio_snapshots
     WHERE LOWER(wallet) = LOWER($1) AND recorded_at >= $2
     ORDER BY recorded_at ASC`,
    [wallet, sinceSecs],
  );
  return rows;
}

module.exports = {
  init,
  insertActivity, getActivityByWallet,
  getState, setState,
  upsertSnapshot, getLatestSnapshot, getSnapshotHistory,
};
