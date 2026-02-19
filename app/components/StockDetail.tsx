"use client";

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { useAccount, useWriteContract } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { parseUnits, erc20Abi, getAddress } from 'viem';
import { PortfolioChart } from './PortfolioChart';
import { ArrowLeft, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import { BACKEND_URL, STABLECOIN_ADDRESSES } from '../lib/config';

const timeRanges = ['1D', '1W', '1M', '3M', '1Y'];

// timeframe: Alpaca bar resolution
// daysBack:  how far back to set the `start` date sent to the backend
const TIMEFRAME_MAP: Record<string, { timeframe: string; daysBack: number }> = {
  '1D': { timeframe: '5Min',  daysBack: 1   },
  '1W': { timeframe: '1Hour', daysBack: 7   },
  '1M': { timeframe: '1Day',  daysBack: 30  },
  '3M': { timeframe: '1Day',  daysBack: 90  },
  '1Y': { timeframe: '1Day',  daysBack: 365 },
};

interface Snapshot {
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  vwap: number;
  prevClose: number;
  bidPrice: number;
  askPrice: number;
}

interface Bar {
  time: string;
  close: number;
}

interface NewsItem {
  id: number;
  headline: string;
  source: string;
  url: string;
  createdAt: string;
  imageUrl: string | null;
}

interface Asset {
  symbol: string;
  name: string;
  exchange: string;
  assetClass: string;
  tradable: boolean;
  fractionable: boolean;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

// ─── Inner component — remounted via key={symbol} so state resets on nav ───
function StockDetailContent({ symbol }: { symbol: string }) {
  const [selectedRange, setSelectedRange] = useState('1D');
  const [orderType, setOrderType]         = useState<'buy' | 'sell'>('buy');
  const [shares,    setShares]            = useState('');
  const [stablecoin, setStablecoin]       = useState<'USDC' | 'USDT'>('USDC');

  // Order state machine
  type OrderStep = 'input' | 'sending' | 'paid' | 'error';
  const [orderStep,  setOrderStep]  = useState<OrderStep>('input');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [txHash,     setTxHash]     = useState<string | null>(null);

  // wagmi — wallet connection + write
  const { address, isConnected }   = useAccount();
  const { open: openWcModal }      = useAppKit();
  const { writeContractAsync }     = useWriteContract();

  useWallet(); // keep WalletContext alive (portfolio balance polling)

  // Data state — starts as loading (true) thanks to the key remount
  const [loading,      setLoading]      = useState(true);
  const [barsLoading,  setBarsLoading]  = useState(true);
  const [snapshot,     setSnapshot]     = useState<Snapshot | null>(null);
  const [bars,         setBars]         = useState<Bar[]>([]);
  const [news,         setNews]         = useState<NewsItem[]>([]);
  const [asset,        setAsset]        = useState<Asset | null>(null);

  // Chart hover — crosshair price shown in header (Yahoo Finance style)
  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  const [hoveredTime,  setHoveredTime]  = useState<string | null>(null);

  // Fetch snapshot (price / stats) — runs once, then polls every 15 s
  useEffect(() => {
    let cancelled = false;

    const fetchSnapshot = () =>
      fetch(`${BACKEND_URL}/api/market/snapshot/${symbol}`)
        .then(r => r.json())
        .then(data => {
          if (cancelled) return;
          if (data.error) { console.error(`[snapshot] ${symbol}:`, data.error); return; }
          setSnapshot(data);
        })
        .catch(err => console.error(`[snapshot] fetch failed:`, err));

    fetchSnapshot();
    const id = setInterval(fetchSnapshot, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch news and asset metadata once on mount
  useEffect(() => {
    Promise.allSettled([
      fetch(`${BACKEND_URL}/api/market/news/${symbol}?limit=5`).then(r => r.json()),
      fetch(`${BACKEND_URL}/api/market/asset/${symbol}`).then(r => r.json()),
    ]).then(([newsRes, assetRes]) => {
      if (newsRes.status  === 'fulfilled' && !newsRes.value.error)  setNews(newsRes.value.news ?? []);
      if (assetRes.status === 'fulfilled' && !assetRes.value.error) setAsset(assetRes.value);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch bars whenever the time range changes — clear stale data immediately
  useEffect(() => {
    const { timeframe, daysBack } = TIMEFRAME_MAP[selectedRange] ?? TIMEFRAME_MAP['1D'];
    setBars([]);
    setBarsLoading(true);

    const start = new Date();
    start.setDate(start.getDate() - daysBack);
    const startParam = start.toISOString().split('T')[0]; // YYYY-MM-DD

    fetch(`${BACKEND_URL}/api/market/bars/${symbol}?timeframe=${timeframe}&start=${startParam}`)
      .then(r => r.json())
      .then(data => { if (data.bars) setBars(data.bars); })
      .catch(() => {})
      .finally(() => setBarsLoading(false));
  }, [symbol, selectedRange]);

  const price         = snapshot?.price         ?? 0;
  const change        = snapshot?.change        ?? 0;
  const changePercent = snapshot?.changePercent ?? 0;
  const isPositive    = change >= 0;
  const activeColor   = isPositive ? '#00c805' : '#ff5000';

  const chartData = bars.map(b => {
    const d = new Date(b.time);
    let label: string;
    if (selectedRange === '1D') {
      label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (selectedRange === '1W') {
      label = d.toLocaleDateString([], { weekday: 'short' }) + ' ' +
              d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      label = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return { time: label, value: b.close };
  });

  // ── Order handlers ───────────────────────────────────────────────────────
  const sharesNum = parseFloat(shares || '0');
  const estimatedCost = sharesNum * price;

  async function handleReview() {
    if (sharesNum <= 0) return;
    // Not connected → open WalletConnect picker first
    if (!isConnected || !address) {
      openWcModal({ view: 'Connect' });
      return;
    }
    setOrderStep('sending');
    setOrderError(null);
    try {
      const tokenAddress = STABLECOIN_ADDRESSES[stablecoin] as `0x${string}`;
      const depositAddr  = getAddress('0x742d35cc6634c0532925a3b8d4c9b7e3f1a2b3c4');
      const hash = await writeContractAsync({
        address:      tokenAddress,
        abi:          erc20Abi,
        functionName: 'transfer',
        args: [
          depositAddr,
          parseUnits(estimatedCost.toFixed(6), 6),
        ],
        // Skip wagmi's pre-flight simulation so the request goes straight to
        // the wallet's own confirmation screen instead of failing locally.
        gas: BigInt(100_000),
      });
      setTxHash(hash);
      setOrderStep('paid');
    } catch (err: any) {
      setOrderError(err?.shortMessage ?? err?.message ?? 'Transaction rejected.');
      setOrderStep('error');
    }
  }

  function resetOrder() {
    setOrderStep('input');
    setShares('');
    setOrderError(null);
    setTxHash(null);
  }

  const stats = snapshot ? [
    { label: 'High Today', value: `$${snapshot.high.toFixed(2)}`      },
    { label: 'Low Today',  value: `$${snapshot.low.toFixed(2)}`       },
    { label: 'Open Price', value: `$${snapshot.open.toFixed(2)}`      },
    { label: 'Prev Close', value: `$${snapshot.prevClose.toFixed(2)}` },
    { label: 'Volume',     value: formatVolume(snapshot.volume)        },
    { label: 'VWAP',       value: `$${snapshot.vwap.toFixed(2)}`      },
    { label: 'Bid',        value: `$${snapshot.bidPrice.toFixed(2)}`  },
    { label: 'Ask',        value: `$${snapshot.askPrice.toFixed(2)}`  },
  ] : [];

  return (
    <>
    <div className="bg-black text-white font-sans min-h-screen selection:bg-gray-800">
      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-12">

        {/* Main content */}
        <div className="flex flex-col">

          {/* Back */}
          <Link to="/" className="mb-4 inline-flex items-center text-gray-400 hover:text-white transition-colors w-fit">
            <ArrowLeft className="w-4 h-4 mr-1" />
            <span className="text-sm font-medium">Portfolio</span>
          </Link>

          {/* Header */}
          <header className="mb-6">
            <h1 className="text-3xl font-bold mb-1">
              {asset?.name ? `${asset.name} (${symbol})` : symbol}
            </h1>
            {loading ? (
              <div className="h-12 w-40 bg-gray-800 animate-pulse rounded mt-2" />
            ) : (
              <>
                <h2 className="text-4xl font-bold tracking-tight">
                  ${(hoveredPrice ?? price).toFixed(2)}
                </h2>
                {hoveredTime ? (
                  <p className="text-sm text-gray-400 mt-1">{hoveredTime}</p>
                ) : (
                  <div className={`flex items-center text-sm font-medium mt-1 ${isPositive ? 'text-[#00c805]' : 'text-[#ff5000]'}`}>
                    <span>
                      {isPositive ? '+' : ''}${change.toFixed(2)} ({Math.abs(changePercent).toFixed(2)}%) Today
                    </span>
                  </div>
                )}
              </>
            )}
          </header>

          {/* Chart */}
          <div className="mb-8 relative">
            {barsLoading ? (
              <div className="h-[300px] w-full bg-gray-900/40 animate-pulse rounded-xl" />
            ) : (
              <PortfolioChart
                color={activeColor}
                showReferenceLine={true}
                data={chartData.length > 0 ? chartData : undefined}
                onHover={(v, t) => { setHoveredPrice(v); setHoveredTime(t); }}
              />
            )}
            <div className="flex justify-between items-center mt-6 border-b border-gray-800 pb-4">
              <div className="flex gap-1">
                {timeRanges.map((range) => (
                  <button
                    key={range}
                    onClick={() => setSelectedRange(range)}
                    className="px-3 py-1 text-xs font-bold rounded hover:bg-gray-800 transition-colors"
                    style={{ color: selectedRange === range ? activeColor : '#9CA3AF' }}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Stats */}
          {stats.length > 0 && (
            <div className="border-b border-gray-800 pb-8 mb-8">
              <h3 className="text-xl font-medium mb-4">Stats</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-4">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="text-sm text-gray-400 mb-1">{stat.label}</div>
                    <div className="text-sm font-medium">{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* About */}
          {asset && (
            <div className="border-b border-gray-800 pb-8 mb-8">
              <h3 className="text-xl font-medium mb-4">About</h3>
              <p className="text-sm text-gray-300 leading-relaxed">
                {asset.name} trades on the {asset.exchange} exchange under the ticker <strong>{asset.symbol}</strong>.
                Asset class: {asset.assetClass}.
                {asset.fractionable ? ' Fractional shares are supported.' : ''}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="bg-[#1E1E24] px-3 py-1 rounded-full text-sm font-bold">{asset.exchange}</div>
                <div className="bg-[#1E1E24] px-3 py-1 rounded-full text-sm font-bold capitalize">{asset.assetClass}</div>
                {asset.tradable && (
                  <div className="bg-[#1E1E24] px-3 py-1 rounded-full text-sm font-bold text-[#00c805]">Tradable</div>
                )}
              </div>
            </div>
          )}

          {/* News */}
          <div>
            <h3 className="text-xl font-medium mb-4">News</h3>
            {news.length === 0 && !loading && (
              <p className="text-sm text-gray-500">No recent news.</p>
            )}
            <div className="space-y-4">
              {news.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-4 p-4 hover:bg-[#1E1E24] rounded-xl transition-colors -mx-4"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="w-16 h-16 object-cover rounded-lg shrink-0 bg-gray-800"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-800 rounded-lg shrink-0" />
                  )}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-gray-300">{item.source}</span>
                      <span className="text-gray-500 text-xs">• {relativeTime(item.createdAt)}</span>
                    </div>
                    <h4 className="font-medium text-sm leading-snug">{item.headline}</h4>
                  </div>
                </a>
              ))}
            </div>
          </div>

        </div>

        {/* Right sidebar — Buy / Sell panel */}
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <div className="bg-[#1E1E24] rounded-xl p-6 border border-gray-800">

              {/* ── Input step ── */}
              {orderStep === 'input' && (
                <>
                  {/* Buy / Sell tabs */}
                  <div className="flex border-b border-gray-700 mb-6">
                    {(['buy', 'sell'] as const).map(side => (
                      <button
                        key={side}
                        onClick={() => setOrderType(side)}
                        className={`flex-1 pb-3 text-sm font-bold transition-colors relative capitalize ${
                          orderType === side ? 'text-[#00c805]' : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {side}
                        {orderType === side && (
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#00c805]" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Shares input */}
                  <div className="space-y-4 mb-6">
                    <div className="bg-black border border-gray-700 rounded-lg p-3 focus-within:border-[#00c805] transition-colors">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400 mb-1">Shares</span>
                        <span className="text-xs text-gray-500">{symbol}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="0"
                        value={shares}
                        onChange={e => setShares(e.target.value)}
                        className="bg-transparent text-2xl font-bold text-white outline-none w-full"
                      />
                    </div>

                    {/* Stablecoin selector */}
                    <div>
                      <span className="text-xs text-gray-400 block mb-2">Pay with</span>
                      <div className="flex gap-2">
                        {(['USDC', 'USDT'] as const).map(coin => (
                          <button
                            key={coin}
                            onClick={() => setStablecoin(coin)}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${
                              stablecoin === coin
                                ? 'border-[#00c805] text-[#00c805] bg-[#00c805]/10'
                                : 'border-gray-700 text-gray-400 hover:border-gray-500'
                            }`}
                          >
                            {coin}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Est. Cost</span>
                      <span className="font-bold">
                        {sharesNum > 0 ? `${estimatedCost.toFixed(2)} ${stablecoin}` : '—'}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-gray-700 pt-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-4">
                      <span>Market Price</span>
                      <span>{loading ? '—' : `$${price.toFixed(2)} / share`}</span>
                    </div>
                    <button
                      onClick={handleReview}
                      disabled={sharesNum <= 0}
                      className="w-full py-3.5 bg-[#00c805] hover:bg-[#00b004] text-black font-bold rounded-full transition-colors disabled:opacity-40"
                    >
                      {isConnected ? 'Buy with Wallet' : 'Connect Wallet'}
                    </button>
                  </div>
                </>
              )}

              {/* ── Sending ── */}
              {orderStep === 'sending' && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <Loader2 className="w-8 h-8 text-[#00c805] animate-spin" />
                  <p className="text-sm text-gray-400">Approve in your wallet…</p>
                </div>
              )}

              {/* ── Success ── */}
              {orderStep === 'paid' && (
                <div className="flex flex-col items-center py-6 gap-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-[#00c805]" />
                  <div>
                    <p className="font-bold text-white mb-1">Order submitted!</p>
                    <p className="text-xs text-gray-400">
                      {sharesNum} {symbol} · {estimatedCost.toFixed(2)} {stablecoin}
                    </p>
                  </div>
                  {txHash && (
                    <a
                      href={`https://etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#00c805] font-mono underline break-all"
                    >
                      {txHash.slice(0, 10)}…{txHash.slice(-6)}
                    </a>
                  )}
                  <button
                    onClick={resetOrder}
                    className="mt-2 w-full py-2.5 text-sm font-bold border border-gray-700 rounded-full hover:bg-gray-800 transition-colors"
                  >
                    New Order
                  </button>
                </div>
              )}

              {/* ── Error ── */}
              {orderStep === 'error' && (
                <div className="flex flex-col items-center py-6 gap-4 text-center">
                  <XCircle className="w-10 h-10 text-[#ff5000]" />
                  <div>
                    <p className="font-bold text-white mb-1">Transaction failed</p>
                    <p className="text-xs text-gray-400 break-words">{orderError}</p>
                  </div>
                  <button
                    onClick={resetOrder}
                    className="w-full py-2.5 text-sm font-bold border border-gray-700 rounded-full hover:bg-gray-800 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>

    </>
  );
}

// Outer shell — passes key={symbol} so StockDetailContent remounts (and resets
// all state to initial values) whenever the user navigates to a different ticker.
export function StockDetail() {
  const { symbol = '' } = useParams();
  return <StockDetailContent key={symbol} symbol={symbol} />;
}
