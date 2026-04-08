"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, ArrowDownLeft,
  Loader2, ArrowDownCircle, ArrowUpCircle, CheckCircle2,
} from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, usePublicClient } from "wagmi";
import { parseUnits, pad, maxUint256 } from "viem";
import { useWallet } from "../contexts/WalletContext";
import { useCurrency } from "../contexts/CurrencyContext";
import {
  MARITIME_DEPOSIT_CONTRACT, SEPOLIA_STABLECOINS,
  ERC20_APPROVE_ABI, MARITIME_DEPOSIT_ABI, MARITIME_WITHDRAW_ABI,
  CONTRACT_ERROR_MESSAGES,
  ACTIVITY_URL,
} from "../lib/config";

const TOKEN_LOGOS: Record<"USDC" | "USDT", string> = {
  USDC: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  USDT: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedItem {
  id: string;
  kind: "deposit" | "withdrawal" | "buy" | "sell";
  ticker?: string;
  shares?: number;
  token?: "USDC" | "USDT";
  amount: number;
  txHash?: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const feedCache: { address: string; items: FeedItem[] } = { address: "", items: [] };

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Main component ────────────────────────────────────────────────────────────

const STABLECOIN_PRESETS = [50, 100, 250, 500, 1000];

export function Balance() {
  const { t } = useTranslation();
  const { formatPrice } = useCurrency();
  const { address, usdBalance, accountBalance, connect, refreshBalance } = useWallet();

  const [copied, setCopied] = useState(false);
  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Panel visibility ───────────────────────────────────────────────────────
  const [showDepositPanel,  setShowDepositPanel]  = useState(false);
  const [showWithdrawPanel, setShowWithdrawPanel] = useState(false);

  // ── Stablecoin deposit (web3) ──────────────────────────────────────────────
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount,   setCustomAmount]   = useState("");
  const [selectedToken,  setSelectedToken]  = useState<"USDC" | "USDT">("USDC");
  const depositAmount = selectedAmount ?? (customAmount ? Number(customAmount) : null);

  type TxStep = "idle" | "approving" | "depositing" | "done" | "error";
  const [txStep,       setTxStep]       = useState<TxStep>("idle");
  const [txErrMsg,     setTxErrMsg]     = useState<string | null>(null);
  const [skipApprove,  setSkipApprove]  = useState(false);
  const [depositTxHash, setDepositTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const sepoliaClient = usePublicClient({ chainId: 11155111 });

  const handleWeb3Deposit = async () => {
    if (!depositAmount || depositAmount < 1 || !address || !sepoliaClient) return;
    setTxStep("approving"); setTxErrMsg(null); setSkipApprove(false);
    try {
      if (chainId !== 11155111) await switchChainAsync({ chainId: 11155111 });
      const tokenAddress = SEPOLIA_STABLECOINS[selectedToken];
      const rawAmount    = parseUnits(depositAmount.toString(), 6);
      const userId       = pad(address as `0x${string}`, { size: 32 });

      // Check existing allowance — skip approve if already sufficient
      const currentAllowance = await sepoliaClient.readContract({
        address: tokenAddress, abi: ERC20_APPROVE_ABI,
        functionName: "allowance", args: [address as `0x${string}`, MARITIME_DEPOSIT_CONTRACT],
      });
      if (currentAllowance < rawAmount) {
        const approveHash = await writeContractAsync({
          address: tokenAddress, abi: ERC20_APPROVE_ABI,
          functionName: "approve", args: [MARITIME_DEPOSIT_CONTRACT, maxUint256],
          gas: 100_000n,
        });
        await sepoliaClient.waitForTransactionReceipt({ hash: approveHash });
      } else {
        setSkipApprove(true);
      }

      setTxStep("depositing");
      const depositHash = await writeContractAsync({
        address: MARITIME_DEPOSIT_CONTRACT, abi: MARITIME_DEPOSIT_ABI,
        functionName: "deposit", args: [tokenAddress, rawAmount, userId],
        gas: 200_000n,
      });
      await sepoliaClient.waitForTransactionReceipt({ hash: depositHash });

      setDepositTxHash(depositHash);
      setTxStep("done");
      refreshBalance();
      refreshFeed();
    } catch (err: unknown) {
      setTxStep("error");
      const e = err as { shortMessage?: string; message?: string; revert?: { name?: string }; reason?: string };
      const revertName = e?.revert?.name ?? e?.reason ?? "";
      setTxErrMsg(CONTRACT_ERROR_MESSAGES[revertName] ?? e?.shortMessage ?? e?.message ?? "Failed.");
    }
  };

  // ── Stablecoin withdraw ────────────────────────────────────────────────────
  const maxWithdrawable  = Math.floor(accountBalance * 100) / 100;
  const [withdrawAmount,  setWithdrawAmount]  = useState("");
  const [withdrawToken,   setWithdrawToken]   = useState<"USDC" | "USDT">("USDC");
  const [withdrawHash,    setWithdrawHash]    = useState<`0x${string}` | undefined>();
  type WdStep = "idle" | "pending" | "done" | "error";
  const [wdStep,    setWdStep]    = useState<WdStep>("idle");
  const [wdErrMsg,  setWdErrMsg]  = useState<string | null>(null);

  const { isSuccess: withdrawConfirmed } = useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (!withdrawConfirmed || wdStep !== "pending") return;
    setWdStep("done"); refreshBalance(); refreshFeed();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawConfirmed]);

  const withdrawNum  = parseFloat(withdrawAmount) || 0;
  const remaining    = accountBalance - withdrawNum;
  const isOverMax    = withdrawNum > maxWithdrawable + 0.001;
  const canWithdraw  = withdrawNum > 0 && !isOverMax;

  const handleStablecoinWithdraw = async () => {
    if (!canWithdraw || !address || !sepoliaClient) return;
    setWdStep("pending"); setWdErrMsg(null); setWithdrawHash(undefined);
    try {
      if (chainId !== 11155111) await switchChainAsync({ chainId: 11155111 });
      const tokenAddress = SEPOLIA_STABLECOINS[withdrawToken];
      const rawAmount    = parseUnits(withdrawNum.toString(), 6);

      // Pre-check vault liquidity before sending the transaction
      const vaultBal = await sepoliaClient.readContract({
        address: MARITIME_DEPOSIT_CONTRACT, abi: MARITIME_WITHDRAW_ABI,
        functionName: "vaultBalance", args: [tokenAddress],
      });
      if (vaultBal < rawAmount) {
        setWdStep("error");
        setWdErrMsg("Vault balance too low. Try again later.");
        return;
      }

      const hash = await writeContractAsync({
        address: MARITIME_DEPOSIT_CONTRACT, abi: MARITIME_WITHDRAW_ABI,
        functionName: "withdraw", args: [tokenAddress, rawAmount],
        gas: 200_000n,
      });
      setWithdrawHash(hash);
    } catch (err: unknown) {
      setWdStep("error");
      const e = err as { shortMessage?: string; message?: string; revert?: { name?: string }; reason?: string };
      const revertName = e?.revert?.name ?? e?.reason ?? "";
      setWdErrMsg(CONTRACT_ERROR_MESSAGES[revertName] ?? e?.shortMessage ?? e?.message ?? "Withdrawal failed.");
    }
  };

  // ── Activity feed — backend-indexed ──────────────────────────────────────
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [fetchKey,  setFetchKey]  = useState(0);

  const refreshFeed = useCallback(() => {
    feedCache.address = "";
    feedCache.items   = [];
    setFetchKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!address) { setFeedItems([]); return; }

    // Serve from cache to avoid blanking the list on tab switch
    if (feedCache.address === address && feedCache.items.length > 0) {
      setFeedItems(feedCache.items);
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(ACTIVITY_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ walletAddress: address }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        const items: FeedItem[] = data.activity ?? [];
        feedCache.address = address;
        feedCache.items   = items;
        setFeedItems(items);
      })
      .catch(() => { if (!cancelled) setError("loadError"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [address, fetchKey]);

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!address) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8 app-fg">
        <div className="mb-6">
          <h2 className="text-3xl font-bold mb-1">{t("balance.title")}</h2>
          <p className="text-gray-400 text-sm">{t("balance.subtitle")}</p>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm mb-4">{t("balance.connectPrompt")}</p>
          <button onClick={connect}
            className="text-sm font-bold text-[#00c805] hover:text-[#00b004] transition-colors">
            {t("balance.connectLink")}
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 app-fg">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-1">{t("balance.title")}</h2>
        <p className="text-gray-400 text-sm">{t("balance.subtitle")}</p>
      </div>

      {/* Big balance card */}
      <div className="surface-2 border border-default rounded-2xl px-8 py-8 mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-400 mb-2">{t("balance.totalAccount")}</p>
          <p className="text-4xl font-bold tracking-tight">
            {formatPrice(accountBalance)}
          </p>
          <p className="text-sm text-gray-500 mt-1">{t("balance.availableToTrade")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowDepositPanel(p => !p);
              setShowWithdrawPanel(false);
              setTxStep("idle"); setTxErrMsg(null); setSkipApprove(false); setDepositTxHash(undefined);
              setSelectedAmount(null); setCustomAmount("");
            }}
            className="flex items-center gap-2 bg-[#00c805] text-black text-sm font-bold px-5 py-2.5 rounded-full hover:bg-[#00b004] transition-colors"
          >
            <ArrowUpFromLine className="w-4 h-4" />
            {t("overview.deposit")}
          </button>
          <button
            onClick={() => {
              setShowWithdrawPanel(p => !p);
              setShowDepositPanel(false);
              setWithdrawAmount(""); setWdStep("idle"); setWdErrMsg(null);
            }}
            disabled={accountBalance <= 0}
            className="flex items-center gap-2 bg-white text-black text-sm font-bold px-5 py-2.5 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-40"
          >
            <ArrowDownToLine className="w-4 h-4" />
            {t("balance.withdraw")}
          </button>
        </div>
      </div>

      {/* ── Deposit panel ── */}
      {showDepositPanel && (
        <div className="surface-2 border border-default rounded-2xl px-6 py-5 mb-3 space-y-5">
          <>
              {txStep === "idle" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {STABLECOIN_PRESETS.map(p => (
                      <button key={p} onClick={() => { setSelectedAmount(p); setCustomAmount(""); }}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedAmount === p ? "bg-white text-black" : "surface-3 border border-default text-gray-300 hover:bg-gray-700"}`}>
                        ${p}
                      </button>
                    ))}
                    <button onClick={() => { setSelectedAmount(null); setCustomAmount(""); }}
                      className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedAmount === null && customAmount === "" ? "bg-white text-black" : "surface-3 border border-default text-gray-300 hover:bg-gray-700"}`}>
                      {t("overview.other")}
                    </button>
                  </div>
                  {selectedAmount === null && (
                    <input type="number" min="1" placeholder={t("overview.enterAmount")} value={customAmount}
                      onChange={e => setCustomAmount(e.target.value)}
                      className="w-full surface-1 border border-default rounded-xl px-4 py-2.5 text-sm app-fg placeholder:text-muted outline-none focus:border-[#00c805]/40" />
                  )}
                  <div className="flex gap-2">
                    {(["USDC", "USDT"] as const).map(tok => (
                      <button key={tok} onClick={() => setSelectedToken(tok)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedToken === tok ? "bg-white text-black" : "surface-3 border border-default text-gray-300 hover:bg-gray-700"}`}>
                        <img src={TOKEN_LOGOS[tok]} alt={tok} className="w-4 h-4 rounded-full" />
                        {tok}
                      </button>
                    ))}
                  </div>
                  {chainId !== 11155111 && depositAmount && depositAmount > 0 && (
                    <p className="text-xs text-yellow-400">You&apos;ll be prompted to switch to Sepolia.</p>
                  )}
                  <button onClick={handleWeb3Deposit} disabled={!depositAmount || depositAmount < 1}
                    className="w-full py-3 bg-[#00c805] text-black text-sm font-bold rounded-full hover:bg-[#00b004] transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
                    {depositAmount && depositAmount >= 1 ? (
                      <>Deposit {depositAmount} <img src={TOKEN_LOGOS[selectedToken]} alt={selectedToken} className="w-4 h-4 rounded-full" /> {selectedToken}</>
                    ) : t("overview.continue")}
                  </button>
                </div>
              )}

              {txStep !== "idle" && txStep !== "done" && (
                <div className="space-y-4">
                  {/* Step 1: Approve — hidden when allowance was already sufficient */}
                  {!skipApprove && (
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                        ${txStep === "depositing" ? "bg-[#00c805] text-black" : txStep === "approving" ? "bg-white text-black" : "surface-3 border border-default text-gray-500"}`}>
                        {txStep === "depositing" ? "✓" : "1"}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold flex items-center gap-1.5 ${txStep === "approving" ? "app-fg" : "text-gray-500"}`}>
                          Approve <img src={TOKEN_LOGOS[selectedToken]} alt={selectedToken} className="w-4 h-4 rounded-full" /> {selectedToken}
                        </p>
                        {txStep === "approving" && <p className="text-xs text-gray-400">Waiting for wallet…</p>}
                        {txStep === "depositing" && <p className="text-xs text-gray-400">Confirmed</p>}
                      </div>
                      {txStep === "approving" && <Loader2 className="w-4 h-4 animate-spin text-gray-400 ml-auto" />}
                    </div>
                  )}
                  {/* Step 2 (or 1 if skipped approve): Deposit */}
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                      ${txStep === "depositing" ? "bg-white text-black" : "surface-3 border border-default text-gray-500"}`}>
                      {skipApprove ? "1" : "2"}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${txStep === "depositing" ? "app-fg" : "text-gray-500"}`}>
                        Confirm deposit
                      </p>
                      {txStep === "depositing" && <p className="text-xs text-gray-400">Waiting for wallet…</p>}
                    </div>
                    {txStep === "depositing" && <Loader2 className="w-4 h-4 animate-spin text-gray-400 ml-auto" />}
                  </div>
                  {txStep === "error" && (
                    <div className="space-y-2">
                      <p className="text-xs text-[#ff5000]">{txErrMsg ?? "Transaction failed."}</p>
                      <button onClick={() => { setTxStep("idle"); setTxErrMsg(null); }}
                        className="text-xs text-gray-400 hover:app-fg transition-colors">Try again</button>
                    </div>
                  )}
                </div>
              )}

              {txStep === "done" && (
                <div className="flex flex-col items-center py-4 gap-3 text-center">
                  <div className="w-10 h-10 rounded-full bg-[#00c805]/15 flex items-center justify-center">
                    <ArrowDownToLine className="w-5 h-5 text-[#00c805]" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Deposit confirmed!</p>
                    <p className="text-xs text-gray-400 mt-0.5">Your balance will update shortly.</p>
                  </div>
                  {depositTxHash && (
                    <a href={`https://sepolia.etherscan.io/tx/${depositTxHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono text-gray-500 hover:app-fg transition-colors break-all">
                      {depositTxHash.slice(0, 10)}…{depositTxHash.slice(-8)}
                    </a>
                  )}
                  <button onClick={() => { setTxStep("idle"); setShowDepositPanel(false); }}
                    className="text-xs font-bold text-gray-400 hover:app-fg transition-colors">Close</button>
                </div>
              )}
          </>

        </div>
      )}

      {/* ── Withdraw panel ── */}
      {showWithdrawPanel && (
        <div className="surface-2 border border-default rounded-2xl px-6 py-5 mb-3 space-y-5">
          <>
              {wdStep === "idle" && (
                <div className="space-y-4">
                  {/* Token picker */}
                  <div className="flex gap-2">
                    {(["USDC", "USDT"] as const).map(tok => (
                      <button key={tok} onClick={() => setWithdrawToken(tok)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                          withdrawToken === tok ? "bg-white text-black" : "surface-3 border border-default text-gray-300 hover:bg-gray-700"
                        }`}>
                        <img src={TOKEN_LOGOS[tok]} alt={tok} className="w-4 h-4 rounded-full" />
                        {tok}
                      </button>
                    ))}
                  </div>
                  <div className="surface-1 border border-default rounded-xl px-4 py-3 focus-within:border-[#00c805]/40 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-sm">$</span>
                      <input type="number" min="0" step="any" placeholder="0.00"
                        value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
                        className="bg-transparent text-2xl font-bold app-fg outline-none flex-1 w-0" />
                      <button onClick={() => setWithdrawAmount(maxWithdrawable.toFixed(2))}
                        className="text-xs font-bold text-[#00c805] hover:text-[#00b004] transition-colors shrink-0">
                        {t("balance.max")}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">{t("balance.buyingPowerRemaining")}</span>
                    <span className={`font-bold ${isOverMax ? "text-[#ff5000]" : "text-gray-300"}`}>
                      {formatPrice(Math.max(remaining, 0))}
                    </span>
                  </div>
                  {isOverMax && (
                    <p className="text-xs text-[#ff5000]">
                      {t("balance.exceedsBalance", { max: maxWithdrawable.toFixed(2) })}
                    </p>
                  )}
                  {wdErrMsg && <p className="text-xs text-[#ff5000]">{wdErrMsg}</p>}
                  <button onClick={handleStablecoinWithdraw} disabled={!canWithdraw}
                    className="w-full py-3 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-200 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5">
                    {withdrawNum > 0 ? (
                      <>Withdraw {withdrawNum.toFixed(2)} <img src={TOKEN_LOGOS[withdrawToken]} alt={withdrawToken} className="w-4 h-4 rounded-full" /> {withdrawToken}</>
                    ) : "Withdraw"}
                  </button>
                </div>
              )}

              {wdStep === "pending" && (
                <div className="flex items-center gap-3 py-4 text-gray-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Waiting for confirmation…
                </div>
              )}

              {wdStep === "error" && (
                <div className="space-y-2 py-2">
                  <p className="text-xs text-[#ff5000]">{wdErrMsg}</p>
                  <button onClick={() => { setWdStep("idle"); setWdErrMsg(null); }}
                    className="text-xs text-gray-400 hover:app-fg transition-colors">
                    Try again
                  </button>
                </div>
              )}

              {wdStep === "done" && (
                <div className="flex flex-col items-center py-4 gap-3 text-center">
                  <div className="w-10 h-10 rounded-full bg-[#00c805]/15 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-[#00c805]" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">Withdrawal confirmed!</p>
                    <p className="text-xs text-gray-400 mt-0.5">Your balance will update shortly.</p>
                  </div>
                  {withdrawHash && (
                    <a href={`https://sepolia.etherscan.io/tx/${withdrawHash}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono text-gray-500 hover:app-fg transition-colors break-all">
                      {withdrawHash.slice(0, 10)}…{withdrawHash.slice(-8)}
                    </a>
                  )}
                  <button onClick={() => { setWdStep("idle"); setShowWithdrawPanel(false); }}
                    className="text-xs font-bold text-gray-400 hover:app-fg transition-colors">
                    Close
                  </button>
                </div>
              )}
          </>

        </div>
      )}

      {/* Wallet address row */}
      <div className="surface-2 border border-default rounded-2xl px-6 py-5 mb-8 flex items-center justify-between">
        <span className="text-sm text-gray-400">{t("balance.walletAddress")}</span>
        <div className="flex items-center">
          <button
            onClick={copyAddress}
            className="flex items-center gap-1.5 surface-3 border border-default px-3 py-1.5 rounded-full text-sm font-bold z-10 relative hover-surface transition-colors cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-[#00c805] inline-block" />
            {copied ? "Copied!" : address}
          </button>
        </div>
      </div>

      {/* Debit card teaser */}
      <div className="relative surface-2 border border-default rounded-2xl overflow-hidden mb-8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00c805]/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative px-6 py-5 flex items-center gap-4">
          <div className="shrink-0 w-12 h-8 rounded-md bg-gradient-to-br from-gray-700 to-gray-900 border border-gray-600 flex flex-col justify-between p-1 shadow-lg">
            <div className="w-4 h-2.5 rounded-sm bg-yellow-400/80" />
            <div className="flex gap-0.5">
              {[...Array(4)].map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-gray-400" />)}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-bold text-sm truncate">{t("balance.debitCardTitle")}</p>
              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#00c805]/15 text-[#00c805] uppercase tracking-wide">
                {t("balance.debitCardBadge")}
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate">{t("balance.debitCardDesc")}</p>
          </div>
        </div>
      </div>

      {/* Activity section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-medium">{t("balance.activity")}</h3>
          <button
            onClick={refreshFeed}
            disabled={loading}
            className="text-xs text-gray-500 hover:app-fg transition-colors disabled:opacity-40 flex items-center gap-1"
            title="Refresh"
          >
            <span className={loading ? "animate-spin inline-block" : ""}>↻</span>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-10 gap-3 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">{t("balance.loading")}</span>
          </div>
        )}
        {error && <p className="text-sm text-[#ff5000] text-center py-8">{t("balance.loadError")}</p>}
        {!loading && !error && feedItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center border border-gray-800 rounded-2xl">
            <p className="text-gray-400 text-sm">{t("balance.noOrders")}</p>
          </div>
        )}

        {feedItems.length > 0 && (
          <div className="surface-3 border border-default rounded-2xl overflow-hidden divide-y divide-gray-800">
            {feedItems.map(item => {
              const isDeposit    = item.kind === "deposit";
              const isWithdrawal = item.kind === "withdrawal";
              const isBuy        = item.kind === "buy";
              const isSell       = item.kind === "sell";
              const isCash       = isDeposit || isWithdrawal;

              const iconBg = isDeposit ? "bg-[#00c805]/10 text-[#00c805]"
                           : isWithdrawal ? "bg-[#ff5000]/10 text-[#ff5000]"
                           : isBuy  ? "bg-[#00c805]/10 text-[#00c805]"
                           :          "bg-[#ff5000]/10 text-[#ff5000]";

              const icon = isDeposit    ? <ArrowDownCircle className="w-4 h-4" />
                         : isWithdrawal ? <ArrowUpCircle   className="w-4 h-4" />
                         : isBuy        ? <ArrowUpRight    className="w-4 h-4" />
                         :                <ArrowDownLeft   className="w-4 h-4" />;

              const explorerBase = "https://sepolia.etherscan.io";

              return (
                <div key={item.id} className="p-5 hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-center gap-4">

                    {/* Icon */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
                      {icon}
                    </div>

                    {/* Label + tx link */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {isCash ? (
                          <div className="flex items-center gap-1.5">
                            {item.token && (
                              <img src={TOKEN_LOGOS[item.token]} alt={item.token} className="w-4 h-4 rounded-full" />
                            )}
                            <span className="font-bold text-sm">
                              {isDeposit ? "Deposit" : "Withdrawal"}
                            </span>
                            {item.token && (
                              <span className="text-xs text-gray-400">{item.token}</span>
                            )}
                          </div>
                        ) : (
                          <>
                            {item.ticker
                              ? <Link to={`/stock/${item.ticker}`} className="font-bold text-sm hover:text-[#00c805] transition-colors">{item.ticker}</Link>
                              : <span className="font-bold text-sm">Trade</span>
                            }
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isBuy ? "bg-[#00c805]/15 text-[#00c805]" : "bg-[#ff5000]/15 text-[#ff5000]"}`}>
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                          </>
                        )}
                      </div>
                      {item.txHash && (
                        <a href={`${explorerBase}/tx/${item.txHash}`} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-mono text-gray-500 hover:app-fg transition-colors">
                          {item.txHash.slice(0, 8)}…{item.txHash.slice(-6)}
                        </a>
                      )}
                    </div>

                    {/* Amount + time */}
                    <div className="text-right shrink-0">
                      {isCash ? (
                        <p className={`font-bold text-sm ${isDeposit ? "text-[#00c805]" : "text-[#ff5000]"}`}>
                          {isDeposit ? "+" : "−"}{formatPrice(item.amount)}
                        </p>
                      ) : (
                        <>
                          <p className={`font-bold text-sm ${isBuy ? "text-[#ff5000]" : "text-[#00c805]"}`}>
                            {isBuy ? "−" : "+"}{item.amount > 0 ? formatPrice(item.amount) : "—"}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.shares != null ? t("balance.shares", { count: item.shares }) : ""}
                          </p>
                        </>
                      )}
                      <p className="text-xs text-gray-500 mt-0.5">{relativeTime(item.createdAt)}</p>
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
