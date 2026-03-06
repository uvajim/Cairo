"use client";

import { useState, useEffect } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, ArrowDownLeft, Loader2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useWallet } from "../contexts/WalletContext";
import { DEPOSIT_URL, WITHDRAW_URL } from "../lib/config";

const shortAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

const ACTIVITY_URL = "https://get-activity-266596137006.us-west4.run.app";

interface Order {
  id: string;
  ticker: string;
  qty: string;
  side?: "buy" | "sell";
  tradeValue?: number;
  estimatedCost?: number;
  status: string;
  alpacaOrderId: string;
  createdAt: string;
}

// Module-level cache — survives tab switches within the same session
const activityCache: { address: string; orders: Order[] } = { address: "", orders: [] };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function Balance() {
  const { t } = useTranslation();
  const { address, usdBalance, accountBalance, connect, refreshBalance } = useWallet();

  // Deposit state
  const PRESETS = [50, 100, 250, 500, 1000];
  const [showDepositPanel,  setShowDepositPanel]  = useState(false);
  const [selectedAmount,    setSelectedAmount]    = useState<number | null>(null);
  const [customAmount,      setCustomAmount]       = useState("");
  const [depositLoading,    setDepositLoading]    = useState(false);
  const [depositError,      setDepositError]      = useState(false);
  const depositAmount = selectedAmount ?? (customAmount ? Number(customAmount) : null);

  const handleDeposit = async () => {
    if (!depositAmount || depositAmount <= 0) return;
    setDepositLoading(true);
    setDepositError(false);
    try {
      const res  = await fetch(DEPOSIT_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ amount: depositAmount, address }),
      });
      const json = await res.json();
      if (json.invoice_url) {
        window.open(json.invoice_url, "_blank", "noopener,noreferrer");
      } else {
        setDepositError(true);
      }
    } catch {
      setDepositError(true);
    } finally {
      setDepositLoading(false);
    }
  };

  // Withdraw state
  const [showWithdrawPanel, setShowWithdrawPanel] = useState(false);
  const [withdrawAmount, setWithdrawAmount]       = useState("");
  const [withdrawing, setWithdrawing]             = useState(false);

  // Floor to cents to avoid float precision issues (e.g. 49.995 → 49.99)
  const maxWithdrawable = Math.floor(accountBalance * 100) / 100;
  const withdrawNum     = parseFloat(withdrawAmount) || 0;
  const remaining       = accountBalance - withdrawNum;
  // Small epsilon so typing the exact floored value is never blocked
  const isOverMax       = withdrawNum > maxWithdrawable + 0.001;
  const canSubmit       = withdrawNum > 0 && !isOverMax;

  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  const handleWithdraw = async () => {
    if (!canSubmit) return;
    setWithdrawing(true);
    setWithdrawError(null);
    try {
      const res  = await fetch(WITHDRAW_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress: address, amount: withdrawNum }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Withdrawal failed.");
      setShowWithdrawPanel(false);
      setWithdrawAmount("");
      refreshBalance();
    } catch (err: unknown) {
      setWithdrawError(err instanceof Error ? err.message : "Withdrawal failed.");
    } finally {
      setWithdrawing(false);
    }
  };

  // Activity state
  const [orders,  setOrders]  = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setOrders([]); return; }

    // Serve from cache if we already fetched for this address
    if (activityCache.address === address && activityCache.orders.length > 0) {
      setOrders(activityCache.orders);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(ACTIVITY_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ walletAddress: address }),
    })
      .then(r => r.json())
      .then(data => {
        const orders = data.executedOrders ?? [];
        activityCache.address = address;
        activityCache.orders  = orders;
        setOrders(orders);
      })
      .catch(() => setError("loadError"))
      .finally(() => setLoading(false));
  }, [address]);

  if (!address) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-1">{t("balance.title")}</h2>
          <p className="text-gray-400 text-sm">{t("balance.subtitle")}</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm mb-4">{t("balance.connectPrompt")}</p>
          <button
            onClick={connect}
            className="text-sm font-bold text-[#00c805] hover:text-[#00b004] transition-colors"
          >
            {t("balance.connectLink")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-1">{t("balance.title")}</h2>
        <p className="text-gray-400 text-sm">{t("balance.subtitle")}</p>
      </div>

      {/* Big balance card */}
      <div className="bg-[#1E1E24] rounded-2xl px-8 py-8 mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-2">{t("balance.totalAccount")}</p>
          <p className="text-4xl font-bold tracking-tight">
            ${accountBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-sm text-gray-500 mt-1">{t("balance.availableToTrade")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowDepositPanel(p => !p); setDepositError(false); setShowWithdrawPanel(false); }}
            className="flex items-center gap-2 bg-[#00c805] text-black text-sm font-bold px-5 py-2.5 rounded-full hover:bg-[#00b004] transition-colors"
          >
            <ArrowUpFromLine className="w-4 h-4" />
            {t("overview.deposit")}
          </button>
          <button
            onClick={() => { setShowWithdrawPanel(p => !p); setWithdrawAmount(""); setShowDepositPanel(false); }}
            disabled={accountBalance <= 0}
            className="flex items-center gap-2 bg-white text-black text-sm font-bold px-5 py-2.5 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-40"
          >
            <ArrowDownToLine className="w-4 h-4" />
            {t("balance.withdraw")}
          </button>
        </div>
      </div>

      {/* Deposit panel */}
      {showDepositPanel && (
        <div className="bg-[#1E1E24] rounded-2xl px-6 py-5 mb-3 space-y-4">
          <p className="text-sm font-semibold">{t("overview.depositQuestion")}</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => { setSelectedAmount(p); setCustomAmount(""); }}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                  selectedAmount === p ? "bg-white text-black" : "bg-[#2A2B30] text-gray-300 hover:bg-gray-700"
                }`}
              >
                ${p}
              </button>
            ))}
            <button
              onClick={() => { setSelectedAmount(null); setCustomAmount(""); }}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                selectedAmount === null && customAmount === "" ? "bg-white text-black" : "bg-[#2A2B30] text-gray-300 hover:bg-gray-700"
              }`}
            >
              {t("overview.other")}
            </button>
          </div>
          {selectedAmount === null && (
            <input
              type="number"
              min="1"
              placeholder={t("overview.enterAmount")}
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              className="w-full bg-[#2A2B30] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30"
            />
          )}
          {depositError && (
            <p className="text-red-400 text-sm">{t("overview.depositError")}</p>
          )}
          <button
            onClick={handleDeposit}
            disabled={depositLoading || !depositAmount || depositAmount <= 0}
            className="w-full bg-white text-black text-sm font-bold py-2.5 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-40"
          >
            {depositLoading ? t("overview.generatingLink") : depositAmount ? t("overview.continueAmount", { amount: depositAmount }) : t("overview.continue")}
          </button>
        </div>
      )}

      {/* Withdraw panel */}
      {showWithdrawPanel && (
        <div className="bg-[#1E1E24] rounded-2xl px-6 py-5 mb-3 space-y-4">
          <p className="text-sm font-semibold">{t("balance.withdrawQuestion")}</p>
          <div className="bg-black border border-gray-700 rounded-xl px-4 py-3 focus-within:border-white/30 transition-colors">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={e => setWithdrawAmount(e.target.value)}
                className="bg-transparent text-2xl font-bold text-white outline-none flex-1 w-0"
              />
              <button
                onClick={() => setWithdrawAmount(maxWithdrawable.toFixed(2))}
                className="text-xs font-bold text-[#00c805] hover:text-[#00b004] transition-colors shrink-0"
              >
                {t("balance.max")}
              </button>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">{t("balance.buyingPowerRemaining")}</span>
            <span className={`font-bold ${isOverMax ? "text-[#ff5000]" : "text-gray-300"}`}>
              ${Math.max(remaining, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          {isOverMax && (
            <p className="text-xs text-[#ff5000]">
              {t("balance.exceedsBalance", { max: maxWithdrawable.toFixed(2) })}
            </p>
          )}
          {withdrawError && (
            <p className="text-xs text-[#ff5000]">{withdrawError}</p>
          )}
          <button
            onClick={handleWithdraw}
            disabled={!canSubmit || withdrawing}
            className="w-full py-3 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-200 transition-colors disabled:opacity-40"
          >
            {withdrawing ? t("balance.processing") : t("balance.withdrawButton", { amount: withdrawNum > 0 ? withdrawNum.toFixed(2) : "0.00" })}
          </button>
        </div>
      )}

      {/* Wallet address row */}
      <div className="bg-[#1E1E24] rounded-2xl px-6 py-5 mb-8 flex items-center justify-between">
        <span className="text-sm text-gray-400">{t("balance.walletAddress")}</span>
        <div className="flex items-center">
          <div className="bg-black px-3 py-1.5 rounded-full text-sm text-gray-300 font-normal pr-6 -mr-4 z-0 border border-gray-800">
            {usdBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </div>
          <div className="flex items-center gap-1.5 bg-[#2A2B30] border border-gray-700 px-3 py-1.5 rounded-full text-sm font-bold z-10 relative">
            <span className="w-2 h-2 rounded-full bg-[#00c805] inline-block" />
            {address}
          </div>
        </div>
      </div>

      {/* Debit card teaser */}
      <div className="relative bg-[#1E1E24] rounded-2xl overflow-hidden mb-8">
        {/* Background gradient accent */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#00c805]/10 via-transparent to-transparent pointer-events-none" />

        <div className="relative px-6 py-5 flex items-center gap-4">
          {/* Mini card mockup */}
          <div className="shrink-0 w-12 h-8 rounded-md bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600 flex flex-col justify-between p-1 shadow-lg">
            <div className="w-4 h-2.5 rounded-sm bg-yellow-400/80" />
            <div className="flex gap-0.5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />
              ))}
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-bold text-sm truncate">{t("balance.debitCardTitle")}</p>
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#00c805]/15 text-[#00c805] uppercase tracking-wide">
                {t("balance.debitCardBadge")}
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate">
              {t("balance.debitCardDesc")}
            </p>
          </div>
        </div>
      </div>

      {/* Activity section */}
      <div>
        <h3 className="text-xl font-medium mb-4">{t("balance.activity")}</h3>

        {loading && (
          <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t("balance.loading")}</span>
          </div>
        )}

        {error && (
          <p className="text-sm text-[#ff5000] text-center py-8">{t("balance.loadError")}</p>
        )}

        {!loading && !error && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center border border-gray-800 rounded-2xl">
            <p className="text-gray-400 text-sm">{t("balance.noOrders")}</p>
          </div>
        )}

        {orders.length > 0 && (
          <div className="bg-[#1A1B1F] rounded-2xl overflow-hidden divide-y divide-gray-800">
            {orders.map(order => {
              const isDeposit    = order.ticker === "Deposit";
              const isWithdrawal = order.ticker === "Withdrawal";
              const isCash       = isDeposit || isWithdrawal;
              const isBuy        = !isCash && (order.side === "buy" || (!order.side && order.estimatedCost !== undefined));
              const value        = order.tradeValue ?? order.estimatedCost ?? 0;
              const qty          = parseFloat(order.qty);

              // Icon + colour
              const iconColor = isDeposit ? "bg-[#00c805]/10 text-[#00c805]"
                              : isWithdrawal ? "bg-[#ff5000]/10 text-[#ff5000]"
                              : isBuy ? "bg-[#00c805]/10 text-[#00c805]"
                              : "bg-[#ff5000]/10 text-[#ff5000]";
              const icon = isDeposit    ? <ArrowDownCircle className="w-4 h-4" />
                         : isWithdrawal ? <ArrowUpCircle   className="w-4 h-4" />
                         : isBuy        ? <ArrowUpRight    className="w-4 h-4" />
                         :                <ArrowDownLeft   className="w-4 h-4" />;

              // Value sign + colour
              const valueColor = isDeposit ? "text-[#00c805]"
                               : isWithdrawal ? "text-[#ff5000]"
                               : isBuy ? "text-[#ff5000]" : "text-[#00c805]";
              const valueSign  = isDeposit ? "+" : "−";

              return (
                <div key={order.id} className="p-5 hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconColor}`}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isCash ? (
                          <span className="font-bold text-sm">{order.ticker}</span>
                        ) : (
                          <Link
                            to={`/stock/${order.ticker}`}
                            className="font-bold text-sm hover:text-[#00c805] transition-colors"
                          >
                            {order.ticker}
                          </Link>
                        )}
                        {!isCash && (
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            isBuy ? "bg-[#00c805]/15 text-[#00c805]" : "bg-[#ff5000]/15 text-[#ff5000]"
                          }`}>
                            {isBuy ? "BUY" : "SELL"}
                          </span>
                        )}
                      </div>
                      {order.alpacaOrderId && (
                        <p className="text-xs text-gray-500 font-mono">
                          ID: {order.alpacaOrderId.split("-")[0]}…
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`font-bold text-sm ${valueColor}`}>
                        {valueSign}${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {!isCash && (
                        <p className="text-xs text-gray-400">{t("balance.shares", { count: qty })}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">{relativeTime(order.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
