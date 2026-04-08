"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Wallet, Loader2, ArrowDownToLine, CheckCircle2, QrCode } from "lucide-react";
import { useWriteContract, useChainId, useSwitchChain, usePublicClient, useSignTypedData } from "wagmi";
import { parseUnits, pad, maxUint256 } from "viem";
import { useTranslation } from "react-i18next";
import { useWallet } from "../contexts/WalletContext";
import {
  BACKEND_URL,
  MARITIME_DEPOSIT_CONTRACT,
  SEPOLIA_STABLECOINS,
  ERC20_APPROVE_ABI,
  MARITIME_DEPOSIT_ABI,
  CONTRACT_ERROR_MESSAGES,
  DEPOSIT_INTENT_DOMAIN,
  DEPOSIT_INTENT_TYPES,
} from "../lib/config";

const PRESETS = [50, 100, 250, 500, 1000];

interface TransferResult {
  transferId: string;
  status: string;
  amount: string;
}

interface Props { onClose: () => void; }

// ── WeChat Link inner — fetches QR on mount, polls until linked ───────────────
function WeChatLinkFlow({ walletAddress, onDone, onError }: {
  walletAddress: string;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/wechat/create-session`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.qr_code_url) { setQrCodeUrl(data.qr_code_url); setSessionId(data.session_id); }
        else onError(data.error ?? "Failed to generate QR code.");
      })
      .catch(() => onError("Failed to generate QR code."));
  }, [walletAddress, onError]);

  useEffect(() => {
    if (!sessionId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${BACKEND_URL}/api/wechat/link-status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, walletAddress }),
        });
        const data = await res.json();
        if (data.linked) { clearInterval(pollRef.current!); onDone(); }
      } catch { /* keep polling */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, walletAddress, onDone]);

  if (!qrCodeUrl) return (
    <div className="flex flex-col items-center py-8 gap-3">
      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      <p className="text-sm text-gray-400">Generating QR code…</p>
    </div>
  );

  return (
    <div className="flex flex-col items-center py-2 gap-4">
      <p className="text-sm text-gray-400">Scan with WeChat to connect your account</p>
      <div className="bg-white p-2 rounded-xl">
        <img src={qrCodeUrl} alt="Scan with WeChat" className="w-36 h-36" />
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        Waiting for scan…
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function DepositMethodModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { address, refreshBalance } = useWallet();

  const [method, setMethod] = useState<"web3" | "wechat" | null>(null);

  // ── WeChat sub-state ────────────────────────────────────────────────────────
  type WeChatState = "checking" | "unlinked" | "linked";
  const [wechatState,   setWechatState]   = useState<WeChatState>("checking");
  const [wechatLinkDone, setWechatLinkDone] = useState(false);
  const [wechatLinkErr,  setWechatLinkErr]  = useState<string | null>(null);

  const [wechatAmount,  setWechatAmount]  = useState("");
  const [wechatLoading, setWechatLoading] = useState(false);
  const [wechatStep,    setWechatStep]    = useState<"signing" | "submitting" | "qr" | null>(null);
  const [wechatPayQr,   setWechatPayQr]   = useState<string | null>(null);
  const [wechatOrderId, setWechatOrderId] = useState<string | null>(null);
  const [wechatResult,  setWechatResult]  = useState<TransferResult | null>(null);
  const [wechatError,   setWechatError]   = useState<string | null>(null);
  const wechatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── WeChat payment polling (once QR is shown) ──────────────────────────────
  useEffect(() => {
    if (wechatStep !== "qr" || !wechatOrderId) return;
    const captured = parseFloat(wechatAmount);
    wechatPollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`${BACKEND_URL}/api/wechat/transfer/status`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transferId: wechatOrderId }),
        });
        const data = await res.json();
        if (data.status === "paid" || data.status === "settled") {
          clearInterval(wechatPollRef.current!);
          setWechatResult({ transferId: wechatOrderId, status: data.status, amount: captured.toFixed(2) });
          setWechatStep(null);
          refreshBalance();
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => { if (wechatPollRef.current) clearInterval(wechatPollRef.current); };
  }, [wechatStep, wechatOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Triggered when user picks "WeChat Pay" ─────────────────────────────────
  const selectWeChat = useCallback(async () => {
    if (!address) return;
    setMethod("wechat");
    setWechatState("checking");
    setWechatLinkDone(false); setWechatLinkErr(null);
    setWechatResult(null); setWechatError(null); setWechatAmount("");
    try {
      const res  = await fetch(`${BACKEND_URL}/api/wechat/linked`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      setWechatState(data.linked ? "linked" : "unlinked");
    } catch {
      setWechatState("unlinked");
    }
  }, [address]);

  // ── WeChat deposit submit ───────────────────────────────────────────────────
  const handleWeChatDeposit = async () => {
    if (!address) return;
    const amountNum = parseFloat(wechatAmount);
    if (amountNum < 1) return;
    setWechatLoading(true); setWechatError(null);
    const amountStr       = amountNum.toFixed(2);
    const intentTimestamp = BigInt(Math.floor(Date.now() / 1000));
    try {
      setWechatStep("signing");
      const signature = await signTypedDataAsync({
        domain:      DEPOSIT_INTENT_DOMAIN,
        types:       DEPOSIT_INTENT_TYPES,
        primaryType: "DepositIntent",
        message: { walletAddress: address as `0x${string}`, amount: amountStr, timestamp: intentTimestamp },
      });
      setWechatStep("submitting");
      const res  = await fetch(`${BACKEND_URL}/api/wechat/transfer/deposit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, amount: amountStr, signature, intentTimestamp: intentTimestamp.toString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason ?? data.error ?? "Transfer failed.");
      setWechatPayQr(data.qr_code_url);
      setWechatOrderId(data.transferId);
      setWechatStep("qr");
    } catch (err: unknown) {
      setWechatError(err instanceof Error ? err.message : "Transfer failed.");
      setWechatStep(null);
    } finally {
      setWechatLoading(false);
    }
  };

  const resetWeChat = () => {
    setWechatState("checking"); setWechatLinkDone(false); setWechatLinkErr(null);
    setWechatAmount(""); setWechatStep(null); setWechatPayQr(null);
    setWechatOrderId(null); setWechatResult(null); setWechatError(null);
    if (wechatPollRef.current) clearInterval(wechatPollRef.current);
  };

  const handleBack = () => { setMethod(null); resetWeChat(); };

  // ── Web3 flow ──────────────────────────────────────────────────────────────
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount,   setCustomAmount]   = useState("");
  const [selectedToken,  setSelectedToken]  = useState<"USDC" | "USDT">("USDC");
  const depositAmount = selectedAmount ?? (customAmount ? Number(customAmount) : null);

  type TxStep = "idle" | "approving" | "depositing" | "done" | "error";
  const [txStep,        setTxStep]        = useState<TxStep>("idle");
  const [txErrMsg,      setTxErrMsg]      = useState<string | null>(null);
  const [skipApprove,   setSkipApprove]   = useState(false);
  const [depositTxHash, setDepositTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const sepoliaClient = usePublicClient({ chainId: 11155111 });

  const handleWeb3Continue = async () => {
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
    } catch (err: unknown) {
      setTxStep("error");
      const e = err as { shortMessage?: string; message?: string; revert?: { name?: string }; reason?: string };
      const revertName = e?.revert?.name ?? e?.reason ?? "";
      setTxErrMsg(CONTRACT_ERROR_MESSAGES[revertName] ?? e?.shortMessage ?? e?.message ?? "Failed.");
    }
  };

  const backdropCloseable = txStep === "idle" && !wechatResult && wechatStep === null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 modal-scrim backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={backdropCloseable ? onClose : undefined}
    >
      <div
        className="surface-2 border border-default rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Method selection ── */}
        {!method && (
          <>
            <h3 className="text-base font-bold mb-1">Add funds</h3>
            <p className="text-xs text-gray-400 mb-5">Choose how you want to deposit</p>
            <div className="flex flex-col gap-3 mb-3">
              <button onClick={() => setMethod("web3")}
                className="flex flex-col items-center justify-center gap-3 surface-3 border border-default hover-surface border border-gray-700 hover:border-white/20 rounded-2xl px-4 py-6 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-[#00c805]/10 flex items-center justify-center group-hover:bg-[#00c805]/20 transition-colors">
                  <Wallet className="w-6 h-6 text-[#00c805]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold">Web3 Wallet</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">USDC · USDT</p>
                </div>
              </button>
            </div>

            <button onClick={selectWeChat}
              className="w-full flex items-center gap-4 surface-3 border border-default hover-surface border border-gray-700 hover:border-white/20 rounded-2xl px-4 py-4 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-[#07C160]/10 flex items-center justify-center group-hover:bg-[#07C160]/20 transition-colors shrink-0">
                <QrCode className="w-5 h-5 text-[#07C160]" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold">WeChat Pay</p>
                <p className="text-[10px] text-gray-400 mt-0.5">Scan QR · Instant</p>
              </div>
            </button>
          </>
        )}

        {/* ── WeChat: checking link status ── */}
        {method === "wechat" && wechatState === "checking" && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-sm text-gray-400">Checking WeChat connection…</p>
          </div>
        )}

        {/* ── WeChat: not linked → QR link flow ── */}
        {method === "wechat" && wechatState === "unlinked" && !wechatLinkDone && (
          <>
            <button onClick={handleBack} className="text-xs text-gray-500 hover:app-fg mb-4 transition-colors">
              ← Back
            </button>
            <h3 className="text-base font-bold mb-1">Connect WeChat</h3>
            <p className="text-xs text-gray-400 mb-5">Scan with WeChat to link your account</p>
            {wechatLinkErr ? (
              <div className="space-y-3 py-4">
                <p className="text-xs text-[#ff5000]">{wechatLinkErr}</p>
                <button onClick={() => { setWechatLinkErr(null); selectWeChat(); }}
                  className="text-xs font-bold text-gray-400 hover:app-fg transition-colors">
                  Try again
                </button>
              </div>
            ) : (
              <WeChatLinkFlow
                walletAddress={address!}
                onDone={() => setWechatLinkDone(true)}
                onError={msg => setWechatLinkErr(msg)}
              />
            )}
          </>
        )}

        {/* ── WeChat: link just completed → success ── */}
        {method === "wechat" && wechatState === "unlinked" && wechatLinkDone && (
          <div className="flex flex-col items-center py-4 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#07C160]/15 flex items-center justify-center">
              <QrCode className="w-6 h-6 text-[#07C160]" />
            </div>
            <p className="font-bold">WeChat account connected!</p>
            <p className="text-xs text-gray-400">View your account in the WeChat Pay tab.</p>
            <button onClick={onClose} className="mt-2 text-sm font-bold app-fg hover:opacity-80 transition-colors">
              Close
            </button>
          </div>
        )}

        {/* ── WeChat: linked → deposit success ── */}
        {method === "wechat" && wechatState === "linked" && wechatResult && (
          <div className="flex flex-col items-center py-4 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#07C160]/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-[#07C160]" />
            </div>
            <div>
              <p className="font-bold mb-1">Payment confirmed!</p>
              <p className="text-xs text-gray-400">Your balance will update shortly.</p>
              <p className="text-xs text-gray-600 mt-1 font-mono">{wechatResult.transferId}</p>
            </div>
            <button onClick={onClose} className="mt-2 text-sm font-bold app-fg hover:opacity-80 transition-colors">
              Close
            </button>
          </div>
        )}

        {/* ── WeChat: linked → QR payment ── */}
        {method === "wechat" && wechatState === "linked" && !wechatResult && wechatStep === "qr" && wechatPayQr && (
          <>
            <button onClick={handleBack} className="text-xs text-gray-500 hover:app-fg mb-4 transition-colors">
              ← Back
            </button>
            <div className="flex flex-col items-center gap-4 py-2">
              <p className="text-sm font-semibold">Scan to pay ${parseFloat(wechatAmount).toFixed(2)}</p>
              <div className="bg-white p-2 rounded-xl">
                <img src={wechatPayQr} alt="Scan with WeChat Pay" className="w-36 h-36" />
              </div>
              <p className="text-xs text-gray-400 text-center">
                Open <span className="app-fg font-semibold">WeChat</span> and scan to complete payment
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                Waiting for payment…
              </div>
            </div>
          </>
        )}

        {/* ── WeChat: linked → deposit form ── */}
        {method === "wechat" && wechatState === "linked" && !wechatResult && wechatStep !== "qr" && (
          <>
            <button onClick={handleBack} className="text-xs text-gray-500 hover:app-fg mb-4 transition-colors">
              ← Back
            </button>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold bg-[#07C160]/10 text-[#07C160] px-2.5 py-1 rounded-full">
                  <QrCode className="w-3 h-3" /> WeChat Pay
                </span>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block">Amount (USD)</label>
                <div className="surface-3 border border-default rounded-xl px-3 py-2.5 flex items-center gap-2 focus-within:border-white/30 transition-colors">
                  <span className="text-gray-500 text-sm">$</span>
                  <input type="number" min="1" step="0.01" placeholder="0.00"
                    value={wechatAmount} onChange={e => setWechatAmount(e.target.value)}
                    className="bg-transparent text-sm app-fg outline-none flex-1 w-0" />
                </div>
              </div>
              {wechatError && <p className="text-xs text-[#ff5000]">{wechatError}</p>}
              <button
                onClick={handleWeChatDeposit}
                disabled={parseFloat(wechatAmount) < 1 || wechatLoading}
                className="w-full py-3 text-sm font-bold rounded-full transition-colors disabled:opacity-40 flex items-center justify-center gap-2 bg-[#07C160] text-white hover:bg-[#06AE55]"
              >
                {wechatStep === "signing"
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sign in wallet…</>
                  : wechatStep === "submitting"
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  : parseFloat(wechatAmount) >= 1
                  ? `Deposit $${parseFloat(wechatAmount).toFixed(2)} via WeChat`
                  : "Deposit via WeChat"
                }
              </button>
              <p className="text-[10px] text-gray-600 text-center">
                A QR code will appear for you to scan with WeChat.
              </p>
            </div>
          </>
        )}

        {/* ── Web3: amount + continue ── */}
        {method === "web3" && txStep === "idle" && (
          <>
            <button onClick={handleBack} className="text-xs text-gray-500 hover:app-fg mb-4 transition-colors">
              ← Back
            </button>
            <p className="text-sm font-semibold mb-4">{t("overview.depositQuestion")}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              {PRESETS.map(p => (
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
                className="w-full surface-3 border border-default rounded-xl px-4 py-2.5 text-sm app-fg placeholder:text-muted outline-none focus:border-[#00c805]/40 mb-4" />
            )}

            <div className="flex gap-2 mb-4">
              {(["USDC", "USDT"] as const).map(tok => (
                <button key={tok} onClick={() => setSelectedToken(tok)}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedToken === tok ? "bg-white text-black" : "surface-3 border border-default text-gray-300 hover:bg-gray-700"}`}>
                  {tok}
                </button>
              ))}
            </div>

            {chainId !== 11155111 && depositAmount && depositAmount > 0 && (
              <p className="text-xs text-yellow-400 mb-3">You&apos;ll be prompted to switch to Sepolia.</p>
            )}

            <button onClick={handleWeb3Continue} disabled={!depositAmount || depositAmount < 1}
              className="w-full bg-white text-black text-sm font-bold py-2.5 rounded-full hover:bg-gray-200 transition-colors disabled:opacity-40">
              {depositAmount && depositAmount >= 1 ? `Deposit ${depositAmount} ${selectedToken}` : t("overview.continue")}
            </button>
          </>
        )}

        {/* ── Web3 transaction progress ── */}
        {method === "web3" && txStep !== "idle" && txStep !== "done" && (
          <div className="space-y-4">
            <h3 className="text-base font-bold">Depositing…</h3>
            {/* Step 1: Approve — hidden when allowance was already sufficient */}
            {!skipApprove && (
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                  ${txStep === "depositing" ? "bg-[#00c805] text-black" : txStep === "approving" ? "bg-white text-black" : "surface-3 border border-default text-gray-500"}`}>
                  {txStep === "depositing" ? "✓" : "1"}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${txStep === "approving" ? "app-fg" : "text-gray-500"}`}>
                    {`Approve ${selectedToken}`}
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
              <div className="space-y-2 pt-1">
                <p className="text-xs text-[#ff5000]">{txErrMsg ?? "Transaction failed."}</p>
                <button onClick={() => { setTxStep("idle"); setTxErrMsg(null); }}
                  className="text-xs text-gray-400 hover:app-fg transition-colors">
                  Try again
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Web3 success ── */}
        {method === "web3" && txStep === "done" && (
          <div className="flex flex-col items-center py-4 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#00c805]/15 flex items-center justify-center">
              <ArrowDownToLine className="w-6 h-6 text-[#00c805]" />
            </div>
            <p className="font-bold">Deposit confirmed!</p>
            <p className="text-xs text-gray-400">Your balance will update shortly.</p>
            {depositTxHash && (
              <a href={`https://sepolia.etherscan.io/tx/${depositTxHash}`} target="_blank" rel="noopener noreferrer"
                className="text-xs font-mono text-gray-500 hover:app-fg transition-colors break-all">
                {depositTxHash.slice(0, 10)}…{depositTxHash.slice(-8)}
              </a>
            )}
            <button onClick={onClose} className="mt-2 text-sm font-bold app-fg hover:opacity-80 transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
