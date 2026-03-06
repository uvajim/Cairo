"use client";

import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Loader2 } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import { Link } from 'react-router';

const ACTIVITY_URL = 'https://get-activity-266596137006.us-west4.run.app';

interface Order {
  id: string;
  ticker: string;
  qty: string;
  side?: 'buy' | 'sell';
  tradeValue?: number;
  estimatedCost?: number;
  status: string;
  alpacaOrderId: string;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}


export function Activity() {
  const { address } = useWallet();
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setOrders([]); return; }
    setLoading(true);
    setError(null);
    fetch(ACTIVITY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ walletAddress: address }),
    })
      .then(r => r.json())
      .then(data => setOrders(data.executedOrders ?? []))
      .catch(() => setError('Failed to load activity.'))
      .finally(() => setLoading(false));
  }, [address]);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h2 className="text-3xl font-bold mb-1">Activity</h2>
        <p className="text-gray-400 text-sm">Your order history</p>
      </div>

      {!address && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm">Connect your wallet to see your activity</p>
        </div>
      )}

      {address && loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading orders…</span>
        </div>
      )}

      {address && error && (
        <p className="text-sm text-[#ff5000] text-center py-8">{error}</p>
      )}

      {address && !loading && !error && orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm">No orders yet</p>
        </div>
      )}

      {orders.length > 0 && (
        <div className="bg-[#1A1B1F] rounded-2xl overflow-hidden divide-y divide-gray-800">
          {orders.map(order => {
            const isBuy  = order.side === 'buy' || (!order.side && order.estimatedCost !== undefined);
            const value  = order.tradeValue ?? order.estimatedCost ?? 0;
            const qty    = parseFloat(order.qty);

            return (
              <div key={order.id} className="p-5 hover:bg-gray-800/40 transition-colors">
                <div className="flex items-center gap-4">
                  {/* Direction icon */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                    isBuy ? 'bg-[#00c805]/10 text-[#00c805]' : 'bg-[#ff5000]/10 text-[#ff5000]'
                  }`}>
                    {isBuy
                      ? <ArrowUpRight className="w-4 h-4" />
                      : <ArrowDownLeft className="w-4 h-4" />}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Link
                        to={`/stock/${order.ticker}`}
                        className="font-bold text-sm hover:text-[#00c805] transition-colors"
                      >
                        {order.ticker}
                      </Link>
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                        isBuy ? 'bg-[#00c805]/15 text-[#00c805]' : 'bg-[#ff5000]/15 text-[#ff5000]'
                      }`}>
                        {isBuy ? 'BUY' : 'SELL'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono">
                      ID: {order.alpacaOrderId.split('-')[0]}…
                    </p>
                  </div>

                  {/* Right: value + meta */}
                  <div className="text-right shrink-0">
                    <p className={`font-bold text-sm ${isBuy ? 'text-[#ff5000]' : 'text-[#00c805]'}`}>
                      {isBuy ? '−' : '+'}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-400">
                      {qty} share{qty !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{relativeTime(order.createdAt)}</p>
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
