/**
 * Blockchain indexer — polls Sepolia for deposit / withdrawal / trade events
 * and writes them to SQLite via db.js.
 *
 * Required env vars:
 *   MARITIME_DEPOSIT_CONTRACT  — MaritimeDeposit contract address
 *   EQUITY_VAULT_ADDRESS       — EquityVault contract address
 *   TRADE_EXECUTOR_ADDRESS     — TradeExecutor address (for calldata decoding)
 *   CHAIN_ID                   — EVM chain ID (default: 11155111)
 *   INDEXER_START_BLOCK        — Block to start from on first run (default: latest-500000)
 */

const { ethers }                               = require('ethers');
const { insertActivity, getState, setState }   = require('./db');

// ── Config ────────────────────────────────────────────────────────────────────

const CHAIN_ID                  = Number(process.env.CHAIN_ID ?? 11155111);
const MARITIME_DEPOSIT_CONTRACT = process.env.MARITIME_DEPOSIT_CONTRACT;
const EQUITY_VAULT_ADDRESS      = process.env.EQUITY_VAULT_ADDRESS;
const TRADE_EXECUTOR_ADDRESS    = process.env.TRADE_EXECUTOR_ADDRESS;
const POLL_MS                   = 12_000;   // ~one Sepolia block
const CHUNK                     = 2_000;    // blocks per getLogs call (most nodes allow 10k; conservative)

if (!MARITIME_DEPOSIT_CONTRACT) {
  console.warn('[indexer] MARITIME_DEPOSIT_CONTRACT not set — deposits/withdrawals will not be indexed');
}
if (!EQUITY_VAULT_ADDRESS) {
  console.warn('[indexer] EQUITY_VAULT_ADDRESS not set — trades will not be indexed');
}

// ── Stablecoin reverse-lookup ─────────────────────────────────────────────────

const STABLECOIN = {
  '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': 'USDC',
  '0x7169d38820dfd117c3fa1f22a697dba58d90ba06': 'USDT',
};

// ── ABI fragments ─────────────────────────────────────────────────────────────

const depositIface = new ethers.Interface([
  'event Deposited(address indexed user, address indexed token, uint256 amount, bytes32 userId, uint256 timestamp)',
  'event Withdrawn(address indexed user, address indexed token, uint256 amount, uint256 timestamp)',
]);

const equityIface = new ethers.Interface([
  'event SharesMinted(address indexed to, string ticker, uint256 amount, address token)',
  'event SharesBurned(address indexed from, string ticker, uint256 amount, address token)',
]);

const tradeIface = new ethers.Interface([
  'function executeBuy(tuple(address user, string ticker, uint256 shares, uint256 mdtCost, uint256 nonce, uint256 expiry) p, bytes sig)',
  'function executeSell(tuple(address user, string ticker, uint256 shares, uint256 mdtPayout, uint256 nonce, uint256 expiry) p, bytes sig)',
]);

// ── Provider ──────────────────────────────────────────────────────────────────

function makeProvider() {
  const rpcs = [
    'https://rpc.ankr.com/eth_sepolia',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://rpc2.sepolia.org',
  ];
  return new ethers.FallbackProvider(
    rpcs.map(url => new ethers.JsonRpcProvider(url, CHAIN_ID)),
    CHAIN_ID,
  );
}

const provider = makeProvider();

// ── Helpers ───────────────────────────────────────────────────────────────────

const blockTimeCache = new Map();

async function getBlockTime(blockNumber) {
  if (blockTimeCache.has(blockNumber)) return blockTimeCache.get(blockNumber);
  try {
    const block = await provider.getBlock(blockNumber);
    const ts    = block ? Number(block.timestamp) : Math.floor(Date.now() / 1000);
    blockTimeCache.set(blockNumber, ts);
    // Keep cache bounded
    if (blockTimeCache.size > 500) {
      const oldest = blockTimeCache.keys().next().value;
      blockTimeCache.delete(oldest);
    }
    return ts;
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

async function decodeMdtAmount(txHash, side) {
  if (!TRADE_EXECUTOR_ADDRESS) return 0;
  try {
    const tx      = await provider.getTransaction(txHash);
    if (!tx) return 0;
    const decoded = tradeIface.parseTransaction({ data: tx.data });
    if (!decoded) return 0;
    const p   = decoded.args[0];
    const raw = side === 'buy' ? p.mdtCost : p.mdtPayout;
    return Number(raw) / 1_000_000;
  } catch {
    return 0;
  }
}

// ── Core indexing ─────────────────────────────────────────────────────────────

async function processChunk(fromBlock, toBlock) {
  const queries = [];

  if (MARITIME_DEPOSIT_CONTRACT) {
    queries.push(
      provider.getLogs({
        address:   MARITIME_DEPOSIT_CONTRACT,
        topics:    [depositIface.getEvent('Deposited').topicHash],
        fromBlock, toBlock,
      }),
      provider.getLogs({
        address:   MARITIME_DEPOSIT_CONTRACT,
        topics:    [depositIface.getEvent('Withdrawn').topicHash],
        fromBlock, toBlock,
      }),
    );
  } else {
    queries.push(Promise.resolve([]), Promise.resolve([]));
  }

  if (EQUITY_VAULT_ADDRESS) {
    queries.push(
      provider.getLogs({
        address:   EQUITY_VAULT_ADDRESS,
        topics:    [equityIface.getEvent('SharesMinted').topicHash],
        fromBlock, toBlock,
      }),
      provider.getLogs({
        address:   EQUITY_VAULT_ADDRESS,
        topics:    [equityIface.getEvent('SharesBurned').topicHash],
        fromBlock, toBlock,
      }),
    );
  } else {
    queries.push(Promise.resolve([]), Promise.resolve([]));
  }

  const [depositedLogs, withdrawnLogs, mintedLogs, burnedLogs] = await Promise.all(queries);

  const total = depositedLogs.length + withdrawnLogs.length + mintedLogs.length + burnedLogs.length;
  if (total === 0) return;

  // Pre-fetch block timestamps for all unique blocks in one pass
  const allBlocks = [...new Set([
    ...depositedLogs, ...withdrawnLogs, ...mintedLogs, ...burnedLogs,
  ].map(l => l.blockNumber))];
  await Promise.all(allBlocks.map(bn => getBlockTime(bn)));

  // ── Deposits ────────────────────────────────────────────────────────────────
  for (const log of depositedLogs) {
    try {
      const { user, token, amount, timestamp } = depositIface.parseLog(log).args;
      insertActivity({
        id:           `deposit-${log.transactionHash}`,
        wallet:       user.toLowerCase(),
        kind:         'deposit',
        ticker:       null,
        token:        STABLECOIN[token.toLowerCase()] ?? 'USDC',
        amount:       Number(amount) / 1_000_000,
        shares:       null,
        tx_hash:      log.transactionHash,
        block_number: log.blockNumber,
        block_time:   Number(timestamp) || await getBlockTime(log.blockNumber),
      });
    } catch (e) { console.error('[indexer] Deposited parse error:', e.message); }
  }

  // ── Withdrawals ─────────────────────────────────────────────────────────────
  for (const log of withdrawnLogs) {
    try {
      const { user, token, amount, timestamp } = depositIface.parseLog(log).args;
      insertActivity({
        id:           `withdrawal-${log.transactionHash}`,
        wallet:       user.toLowerCase(),
        kind:         'withdrawal',
        ticker:       null,
        token:        STABLECOIN[token.toLowerCase()] ?? 'USDC',
        amount:       Number(amount) / 1_000_000,
        shares:       null,
        tx_hash:      log.transactionHash,
        block_number: log.blockNumber,
        block_time:   Number(timestamp) || await getBlockTime(log.blockNumber),
      });
    } catch (e) { console.error('[indexer] Withdrawn parse error:', e.message); }
  }

  // ── Buys (SharesMinted) — decode MDT cost from calldata ─────────────────────
  await Promise.all(mintedLogs.map(async log => {
    try {
      const { to, ticker, amount } = equityIface.parseLog(log).args;
      const mdtAmount = await decodeMdtAmount(log.transactionHash, 'buy');
      insertActivity({
        id:           `buy-${log.transactionHash}`,
        wallet:       to.toLowerCase(),
        kind:         'buy',
        ticker:       ticker,
        token:        null,
        amount:       mdtAmount,
        shares:       Number(amount) / 1_000_000,
        tx_hash:      log.transactionHash,
        block_number: log.blockNumber,
        block_time:   await getBlockTime(log.blockNumber),
      });
    } catch (e) { console.error('[indexer] SharesMinted parse error:', e.message); }
  }));

  // ── Sells (SharesBurned) — decode MDT payout from calldata ──────────────────
  await Promise.all(burnedLogs.map(async log => {
    try {
      const { from, ticker, amount } = equityIface.parseLog(log).args;
      const mdtAmount = await decodeMdtAmount(log.transactionHash, 'sell');
      insertActivity({
        id:           `sell-${log.transactionHash}`,
        wallet:       from.toLowerCase(),
        kind:         'sell',
        ticker:       ticker,
        token:        null,
        amount:       mdtAmount,
        shares:       Number(amount) / 1_000_000,
        tx_hash:      log.transactionHash,
        block_number: log.blockNumber,
        block_time:   await getBlockTime(log.blockNumber),
      });
    } catch (e) { console.error('[indexer] SharesBurned parse error:', e.message); }
  }));

  console.log(`[indexer] blocks ${fromBlock}–${toBlock}: ${total} event(s) stored`);
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

let running = false;

async function poll() {
  if (running) return;
  running = true;
  try {
    const latestBlock = Number(await provider.getBlockNumber());

    // On first run default to latest-500000 (~2 years) unless overridden
    const defaultStart = Math.max(0, latestBlock - 500_000);
    const configStart  = process.env.INDEXER_START_BLOCK != null
      ? Number(process.env.INDEXER_START_BLOCK)
      : defaultStart;

    const lastIndexed = Number(getState('last_indexed_block', String(configStart - 1)));
    const nextBlock   = lastIndexed + 1;

    if (nextBlock > latestBlock) return;

    for (let from = nextBlock; from <= latestBlock; from += CHUNK) {
      const to = Math.min(from + CHUNK - 1, latestBlock);
      await processChunk(from, to);
      setState('last_indexed_block', to);
    }
  } catch (err) {
    console.error('[indexer] poll error:', err.message);
  } finally {
    running = false;
  }
}

function start() {
  console.log('[indexer] Starting…');
  poll();
  setInterval(poll, POLL_MS);
}

module.exports = { start };
