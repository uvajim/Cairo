"use client";

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router';
import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useTranslation } from 'react-i18next';
import { PortfolioChart } from './PortfolioChart';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Newspaper, XCircle } from 'lucide-react';
import { useWallet } from '../contexts/WalletContext';
import { BACKEND_URL, ASSETS_URL, TRADE_URL } from '../lib/config';

const timeRanges = ['1D', '1W', '1M', '3M', '1Y'];

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

interface Asset {
  symbol: string;
  name: string;
  exchange: string;
  assetClass: string;
  tradable: boolean;
  fractionable: boolean;
}


function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

// ─── Inner component — remounted via key={symbol} so state resets on nav ───
function StockDetailContent({ symbol }: { symbol: string }) {
  const { t } = useTranslation();
  const [selectedRange, setSelectedRange] = useState('1D');
  const [orderType, setOrderType]         = useState<'buy' | 'sell'>('buy');
  const [shares,    setShares]            = useState('');

  // Order state machine
  type OrderStep = 'input' | 'sending' | 'paid' | 'error';
  const [orderStep,  setOrderStep]  = useState<OrderStep>('input');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderId,    setOrderId]    = useState<string | null>(null);

  // wagmi — wallet connection
  const { address, isConnected }   = useAccount();
  const { open: openWcModal }      = useAppKit();

  const { accountBalance, refreshBalance } = useWallet();

  // Shares of this symbol currently held by the user
  const [ownedShares, setOwnedShares] = useState(0);

  const refreshOwnedShares = () => {
    if (!address) return;
    fetch(ASSETS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: address }),
    })
      .then(r => r.json())
      .then(data => setOwnedShares(data?.holdings?.[symbol] ?? 0))
      .catch(() => {});
  };

  useEffect(() => {
    if (!address) { setOwnedShares(0); return; }
    refreshOwnedShares();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, symbol]);

  // Data state
  const [loading,      setLoading]      = useState(true);
  const [barsLoading,  setBarsLoading]  = useState(true);
  const [snapshot,     setSnapshot]     = useState<Snapshot | null>(null);
  const [bars,         setBars]         = useState<Bar[]>([]);
  const [asset,        setAsset]        = useState<Asset | null>(null);

  const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
  const [hoveredTime,  setHoveredTime]  = useState<string | null>(null);

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

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/market/asset/${symbol}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setAsset(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const { timeframe, daysBack } = TIMEFRAME_MAP[selectedRange] ?? TIMEFRAME_MAP['1D'];
    setBars([]);
    setBarsLoading(true);

    const start = new Date();
    start.setDate(start.getDate() - daysBack);
    const startParam = start.toISOString().split('T')[0];

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

  const insufficientFunds  = orderType === 'buy'  && isConnected && sharesNum > 0 && estimatedCost > accountBalance;
  const insufficientShares = orderType === 'sell' && isConnected && sharesNum > 0 && sharesNum > ownedShares;
  const isSubmitDisabled   = sharesNum <= 0 || insufficientFunds || insufficientShares;

  async function handleExecuteTrade() {
    if (sharesNum <= 0) return;

    if (!isConnected || !address) {
      openWcModal({ view: 'Connect' });
      return;
    }

    setOrderStep('sending');
    setOrderError(null);

    try {
      // Point this to your new Cloud Run endpoint or backend proxy
      const response = await fetch(TRADE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: symbol,
          qty: sharesNum,
          walletAddress: address,
          side: orderType,
        })
      });

      // Handle the custom HTTP status codes we set up in the Cloud Function
      if (!response.ok) {
        if (response.status === 402) {
          throw new Error('Insufficient funds in your account. Please deposit more.');
        } else if (response.status === 404) {
          throw new Error('Account not found. Please make a deposit first.');
        } else {
          const errText = await response.text();
          throw new Error(errText || 'Failed to execute trade.');
        }
      }

      const data = await response.json();

      setOrderId(data.orderId); // Save Alpaca Order ID
      setOrderStep('paid');
      refreshBalance();
      refreshOwnedShares();

    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'An error occurred while placing the order.');
      setOrderStep('error');
    }
  }

  function resetOrder() {
    setOrderStep('input');
    setShares('');
    setOrderError(null);
    setOrderId(null);
  }

  const stats = snapshot ? [
    { label: t('stock.highToday'), value: `$${snapshot.high.toFixed(2)}`      },
    { label: t('stock.lowToday'),  value: `$${snapshot.low.toFixed(2)}`       },
    { label: t('stock.openPrice'), value: `$${snapshot.open.toFixed(2)}`      },
    { label: t('stock.prevClose'), value: `$${snapshot.prevClose.toFixed(2)}` },
    { label: t('stock.volume'),    value: formatVolume(snapshot.volume)        },
    { label: t('stock.vwap'),      value: `$${snapshot.vwap.toFixed(2)}`      },
    { label: t('stock.bid'),       value: `$${snapshot.bidPrice.toFixed(2)}`  },
    { label: t('stock.ask'),       value: `$${snapshot.askPrice.toFixed(2)}`  },
  ] : [];

  return (
      <>
        <div className="bg-black text-white font-sans min-h-screen selection:bg-gray-800">
          <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">

            {/* Main content */}
            <div className="flex flex-col">

              {/* Back */}
              <Link to="/" className="mb-4 inline-flex items-center text-gray-400 hover:text-white transition-colors w-fit">
                <ArrowLeft className="w-4 h-4 mr-1" />
                <span className="text-sm font-medium">{t('stock.back')}</span>
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
                      {isPositive ? '+' : ''}${change.toFixed(2)} ({Math.abs(changePercent).toFixed(2)}%) {t('stock.today')}
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
                    <h3 className="text-xl font-medium mb-4">{t('stock.stats')}</h3>
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

              {/* News & About */}
              <div className="border-b border-gray-800 pb-8 mb-8">
                <div className="flex items-center gap-2 mb-4">
                  <Newspaper className="w-5 h-5 text-gray-400" />
                  <h3 className="text-xl font-medium">{t('stock.newsInfo')}</h3>
                </div>
                {asset && (
                  <p className="text-sm text-gray-400 leading-relaxed mb-4">
                    {t('stock.tradesOn', { name: asset.name, exchange: asset.exchange })} <strong className="text-white">{asset.symbol}</strong>.
                    {asset.fractionable ? t('stock.fractional') : ''}
                  </p>
                )}
                <a
                  href={`https://finance.yahoo.com/quote/${symbol}/profile/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#00c805] hover:text-[#00b004] transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('stock.learnMore')}
                </a>
              </div>

              {/* Your Position */}
              {isConnected && (
                <div>
                  <h3 className="text-xl font-medium mb-4">{t('stock.yourPosition')}</h3>
                  {ownedShares > 0 ? (
                    <div className="bg-[#1E1E24] rounded-xl p-5 space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">{t('stock.sharesOwned')}</span>
                        <span className="text-sm font-bold">{ownedShares}</span>
                      </div>
                      <div className="flex justify-between items-center border-t border-gray-700 pt-4">
                        <span className="text-sm text-gray-400">{t('stock.totalValue')}</span>
                        <span className="text-sm font-bold">
                          {price > 0
                            ? `$${(ownedShares * price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">{t('stock.noShares', { symbol })}</p>
                  )}
                </div>
              )}

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
                              <span className="text-xs text-gray-400 mb-1">{t('stock.shares')}</span>
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

                          <div className="flex justify-between text-sm">
                            <span className="text-gray-400">{t('stock.estCost')}</span>
                            <span className="font-bold">
                        {sharesNum > 0 ? `$${estimatedCost.toFixed(2)}` : '—'}
                      </span>
                          </div>

                          {isConnected && orderType === 'buy' && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">{t('stock.available')}</span>
                              <span className={`font-bold ${insufficientFunds ? 'text-[#ff5000]' : 'text-gray-300'}`}>
                                ${accountBalance.toFixed(2)}
                              </span>
                            </div>
                          )}

                          {isConnected && orderType === 'sell' && (
                            <div className="flex justify-between text-sm">
                              <span className="text-gray-400">{t('stock.youOwn')}</span>
                              <span className={`font-bold ${insufficientShares ? 'text-[#ff5000]' : 'text-gray-300'}`}>
                                {t('stock.shares', { count: ownedShares })}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="border-t border-gray-700 pt-4">
                          <div className="flex justify-between text-xs text-gray-500 mb-4">
                            <span>{t('stock.marketPrice')}</span>
                            <span>{loading ? '—' : `$${price.toFixed(2)} ${t('stock.perShare')}`}</span>
                          </div>
                          <button
                              onClick={handleExecuteTrade}
                              disabled={isSubmitDisabled}
                              className="w-full py-3.5 bg-[#00c805] hover:bg-[#00b004] text-black font-bold rounded-full transition-colors disabled:opacity-40"
                          >
                            {isConnected ? t('stock.submitOrder') : t('stock.connectWallet')}
                          </button>
                          {insufficientFunds && (
                            <p className="text-xs text-[#ff5000] text-center mt-2">
                              {t('stock.notEnoughFunds', { cost: estimatedCost.toFixed(2) })}
                            </p>
                          )}
                          {insufficientShares && (
                            <p className="text-xs text-[#ff5000] text-center mt-2">
                              {t('stock.onlyOwn', { count: ownedShares, symbol })}
                            </p>
                          )}
                        </div>
                      </>
                  )}

                  {/* ── Sending ── */}
                  {orderStep === 'sending' && (
                      <div className="flex flex-col items-center py-8 gap-3">
                        <Loader2 className="w-8 h-8 text-[#00c805] animate-spin" />
                        <p className="text-sm text-gray-400">{t('stock.executing')}</p>
                      </div>
                  )}

                  {/* ── Success ── */}
                  {orderStep === 'paid' && (
                      <div className="flex flex-col items-center py-6 gap-4 text-center">
                        <CheckCircle2 className="w-10 h-10 text-[#00c805]" />
                        <div>
                          <p className="font-bold text-white mb-1">
                            {orderType === 'buy' ? t('stock.buySubmitted') : t('stock.sellSubmitted')}
                          </p>
                          <p className="text-xs text-gray-400">
                            {t('stock.orderDetails', { qty: sharesNum, symbol, cost: estimatedCost.toFixed(2) })}
                          </p>
                        </div>
                        {orderId && (
                            <div className="text-xs text-gray-500 font-mono mt-2">
                              {t('stock.orderId', { id: orderId.split('-')[0] })}
                            </div>
                        )}
                        <button
                            onClick={resetOrder}
                            className="mt-4 w-full py-2.5 text-sm font-bold border border-gray-700 rounded-full hover:bg-gray-800 transition-colors"
                        >
                          {t('stock.newOrder')}
                        </button>
                      </div>
                  )}

                  {/* ── Error ── */}
                  {orderStep === 'error' && (
                      <div className="flex flex-col items-center py-6 gap-4 text-center">
                        <XCircle className="w-10 h-10 text-[#ff5000]" />
                        <div>
                          <p className="font-bold text-white mb-1">{t('stock.tradeFailed')}</p>
                          <p className="text-xs text-gray-400 break-words">{orderError}</p>
                        </div>
                        <button
                            onClick={resetOrder}
                            className="w-full py-2.5 text-sm font-bold border border-gray-700 rounded-full hover:bg-gray-800 transition-colors"
                        >
                          {t('stock.tryAgain')}
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

export function StockDetail() {
  const { symbol = '' } = useParams();
  return <StockDetailContent key={symbol} symbol={symbol} />;
}