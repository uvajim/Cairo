"use client";

import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, ArrowDownToLine, ArrowUpFromLine, Loader2, ExternalLink } from 'lucide-react';
import { usePublicClient } from 'wagmi';
import { formatUnits } from 'viem';
import { useWallet } from '../contexts/WalletContext';
import { Link } from 'react-router';
import {
  EQUITY_VAULT_ADDRESS,
  EQUITY_VAULT_ABI,
  MDT_TOKEN_CONTRACT,
  CHAIN_ID,
  EXPLORER_URL,
} from '../lib/config';

const ERC20_TRANSFER_EVENT = [
  {
    name:   'Transfer',
    type:   'event',
    inputs: [
      { name: 'from',  type: 'address', indexed: true  },
      { name: 'to',    type: 'address', indexed: true  },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// ~10 000 Sepolia blocks ≈ 33 hours; safe limit for most public RPC providers
const LOOK_BACK = 10_000n;

interface ActivityItem {
  type:        'buy' | 'sell' | 'deposit' | 'withdraw';
  ticker?:     string;
  shares?:     number;
  mdtAmount:   number;
  txHash:      `0x${string}`;
  blockNumber: bigint;
  timestamp:   number;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Activity() {
  const { address } = useWallet();
  const publicClient = usePublicClient({ chainId: CHAIN_ID });

  const [items,   setItems]   = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!address || !publicClient) { setItems([]); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const latest    = await publicClient.getBlockNumber();
        const fromBlock = latest > LOOK_BACK ? latest - LOOK_BACK : 0n;
        const addr      = address as `0x${string}`;

        const [mintLogs, burnLogs, mdtInLogs, mdtOutLogs] = await Promise.all([
          // Shares minted to user → buy settled
          publicClient.getContractEvents({
            address:   EQUITY_VAULT_ADDRESS,
            abi:       EQUITY_VAULT_ABI,
            eventName: 'SharesMinted',
            args:      { to: addr },
            fromBlock,
            toBlock:   'latest',
          }),
          // Shares burned from user → sell settled
          publicClient.getContractEvents({
            address:   EQUITY_VAULT_ADDRESS,
            abi:       EQUITY_VAULT_ABI,
            eventName: 'SharesBurned',
            args:      { from: addr },
            fromBlock,
            toBlock:   'latest',
          }),
          // MDT minted to user → deposit
          publicClient.getContractEvents({
            address:   MDT_TOKEN_CONTRACT,
            abi:       ERC20_TRANSFER_EVENT,
            eventName: 'Transfer',
            args:      { from: ZERO_ADDRESS, to: addr },
            fromBlock,
            toBlock:   'latest',
          }),
          // MDT burned from user → withdrawal
          publicClient.getContractEvents({
            address:   MDT_TOKEN_CONTRACT,
            abi:       ERC20_TRANSFER_EVENT,
            eventName: 'Transfer',
            args:      { from: addr, to: ZERO_ADDRESS },
            fromBlock,
            toBlock:   'latest',
          }),
        ]);

        if (cancelled) return;

        // Trade tx hashes — used to skip MDT mint/burn events that are
        // already represented by SharesMinted/SharesBurned
        const tradeTxHashes = new Set([
          ...mintLogs.map(l => l.transactionHash),
          ...burnLogs.map(l => l.transactionHash),
        ]);

        const filteredMdtIn  = mdtInLogs .filter(l => !tradeTxHashes.has(l.transactionHash));
        const filteredMdtOut = mdtOutLogs.filter(l => !tradeTxHashes.has(l.transactionHash));

        // Fetch block timestamps for all unique blocks in one pass
        const uniqueBlocks = new Set([
          ...mintLogs        .map(l => l.blockNumber!),
          ...burnLogs        .map(l => l.blockNumber!),
          ...filteredMdtIn   .map(l => l.blockNumber!),
          ...filteredMdtOut  .map(l => l.blockNumber!),
        ]);

        const blockTimestamps = new Map<bigint, number>();
        await Promise.all([...uniqueBlocks].map(async (bn) => {
          const block = await publicClient.getBlock({ blockNumber: bn });
          blockTimestamps.set(bn, Number(block.timestamp) * 1000);
        }));

        if (cancelled) return;

        const result: ActivityItem[] = [];

        for (const log of mintLogs) {
          result.push({
            type:        'buy',
            ticker:      log.args.ticker,
            shares:      Number(log.args.amount) / 1_000_000,
            mdtAmount:   0,
            txHash:      log.transactionHash!,
            blockNumber: log.blockNumber!,
            timestamp:   blockTimestamps.get(log.blockNumber!) ?? 0,
          });
        }

        for (const log of burnLogs) {
          result.push({
            type:        'sell',
            ticker:      log.args.ticker,
            shares:      Number(log.args.amount) / 1_000_000,
            mdtAmount:   0,
            txHash:      log.transactionHash!,
            blockNumber: log.blockNumber!,
            timestamp:   blockTimestamps.get(log.blockNumber!) ?? 0,
          });
        }

        for (const log of filteredMdtIn) {
          result.push({
            type:        'deposit',
            mdtAmount:   Number(formatUnits(log.args.value!, 6)),
            txHash:      log.transactionHash!,
            blockNumber: log.blockNumber!,
            timestamp:   blockTimestamps.get(log.blockNumber!) ?? 0,
          });
        }

        for (const log of filteredMdtOut) {
          result.push({
            type:        'withdraw',
            mdtAmount:   Number(formatUnits(log.args.value!, 6)),
            txHash:      log.transactionHash!,
            blockNumber: log.blockNumber!,
            timestamp:   blockTimestamps.get(log.blockNumber!) ?? 0,
          });
        }

        result.sort((a, b) => Number(b.blockNumber - a.blockNumber));
        setItems(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load activity.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [address, publicClient]);

  const typeConfig = {
    buy:      { label: 'BUY',      icon: ArrowUpRight,       color: '#00c805', bgColor: 'bg-[#00c805]/10' },
    sell:     { label: 'SELL',     icon: ArrowDownLeft,      color: '#ff5000', bgColor: 'bg-[#ff5000]/10' },
    deposit:  { label: 'DEPOSIT',  icon: ArrowDownToLine,    color: '#00c805', bgColor: 'bg-[#00c805]/10' },
    withdraw: { label: 'WITHDRAW', icon: ArrowUpFromLine,    color: '#ff5000', bgColor: 'bg-[#ff5000]/10' },
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-1">Activity</h2>
        <p className="text-muted text-sm">On-chain history from the last ~33 hours</p>
      </div>

      {!address && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-default rounded-2xl">
          <p className="text-muted text-sm">Connect your wallet to see your activity</p>
        </div>
      )}

      {address && loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading on-chain activity…</span>
        </div>
      )}

      {address && error && (
        <p className="text-sm text-[#ff5000] text-center py-8">{error}</p>
      )}

      {address && !loading && !error && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-default rounded-2xl">
          <p className="text-muted text-sm">No on-chain activity in the last ~33 hours</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="surface-3 border border-default rounded-2xl overflow-hidden divide-y divide-default">
          {items.map(item => {
            const cfg  = typeConfig[item.type];
            const Icon = cfg.icon;

            return (
              <div key={item.txHash + item.type} className="p-5 hover-surface transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${cfg.bgColor}`}>
                    <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {item.ticker ? (
                        <Link
                          to={`/stock/${item.ticker}`}
                          className="font-bold text-sm hover:text-[#00c805] transition-colors"
                        >
                          {item.ticker}
                        </Link>
                      ) : (
                        <span className="font-bold text-sm">MDT</span>
                      )}
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded"
                        style={{ color: cfg.color, background: `${cfg.color}22` }}
                      >
                        {cfg.label}
                      </span>
                    </div>
                    <a
                      href={`${EXPLORER_URL}/tx/${item.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted hover:text-white transition-colors font-mono"
                    >
                      {item.txHash.slice(0, 10)}…{item.txHash.slice(-6)}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <div className="text-right shrink-0">
                    {item.ticker && item.shares !== undefined && (
                      <p className="font-bold text-sm">
                        {item.shares} share{item.shares !== 1 ? 's' : ''}
                      </p>
                    )}
                    {!item.ticker && item.mdtAmount > 0 && (
                      <p className="font-bold text-sm">
                        {item.type === 'deposit' ? '+' : '−'}
                        {item.mdtAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDT
                      </p>
                    )}
                    <p className="text-xs text-muted mt-0.5">
                      {item.timestamp ? relativeTime(item.timestamp) : `#${item.blockNumber}`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
