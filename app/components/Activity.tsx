"use client";

import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, ArrowDownToLine, ArrowUpFromLine, Loader2, ExternalLink } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import { Link } from 'react-router';
import { EXPLORER_URL } from '../lib/config';

interface ActivityItem {
  type:        'buy' | 'sell' | 'deposit' | 'withdraw';
  ticker?:     string;
  shares?:     number;
  mdtAmount:   number;
  txHash:      string;
  blockNumber: number;
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

const typeConfig = {
  buy:      { label: 'BUY',      icon: ArrowUpRight,    color: '#00c805', bgColor: 'bg-[#00c805]/10' },
  sell:     { label: 'SELL',     icon: ArrowDownLeft,   color: '#ff5000', bgColor: 'bg-[#ff5000]/10' },
  deposit:  { label: 'DEPOSIT',  icon: ArrowDownToLine, color: '#00c805', bgColor: 'bg-[#00c805]/10' },
  withdraw: { label: 'WITHDRAW', icon: ArrowUpFromLine, color: '#ff5000', bgColor: 'bg-[#ff5000]/10' },
};

export function Activity() {
  const { address } = useWallet();

  const [items,   setItems]   = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setItems([]); return; }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res  = await fetch(`/api/activity?walletAddress=${address}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (!cancelled) setItems(data.activity ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load activity.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [address]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-1">Activity</h2>
        <p className="text-muted text-sm">Full on-chain history — MDT and equity tokens</p>
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
          <p className="text-muted text-sm">No on-chain activity found</p>
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
                        {item.shares.toLocaleString('en-US', { maximumFractionDigits: 6 })} share{item.shares !== 1 ? 's' : ''}
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
