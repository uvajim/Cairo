"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSignTypedData } from "wagmi";
import {
  QrCode, RefreshCw, Loader2,
  ArrowDownLeft, ArrowUpRight, CheckCircle2,
} from "lucide-react";
import { useWallet } from "../contexts/WalletContext";
import { BACKEND_URL, DEPOSIT_INTENT_DOMAIN, DEPOSIT_INTENT_TYPES } from "../lib/config";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WeChatAccount {
  openId: string;
  nickname: string;
  avatarUrl?: string;
}

interface Transfer {
  transferId: string;
  type: "debit" | "credit";
  amount: string;
  status: string;
  description?: string;
  createdAt: string;
}

interface TransferResult {
  transferId: string;
  status: string;
  amount: string;
  type: string;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "pending"
      ? "bg-yellow-500/15 text-yellow-400"
      : status === "paid" || status === "settled"
      ? "bg-[#07C160]/15 text-[#07C160]"
      : "bg-[#ff5000]/15 text-[#ff5000]";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

// ── WeChat Link QR Flow ────────────────────────────────────────────────────────

function WeChatLinkFlow({ walletAddress, onLinked, onCancel }: {
  walletAddress: string;
  onLinked: () => void;
  onCancel: () => void;
}) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/wechat/create-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.qr_code_url) {
          setQrCodeUrl(data.qr_code_url);
          setSessionId(data.session_id);
        } else {
          setError(data.error ?? "Failed to generate QR code.");
        }
      })
      .catch(() => setError("Failed to generate QR code."));
  }, [walletAddress]);

  useEffect(() => {
    if (!sessionId) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/wechat/link-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, walletAddress }),
        });
        const data = await res.json();
        if (data.linked) {
          clearInterval(pollRef.current!);
          onLinked();
        }
      } catch { /* keep polling */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionId, walletAddress, onLinked]);

  if (error) return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-[#ff5000]">{error}</span>
      <button onClick={onCancel} className="text-xs text-gray-600 hover:app-fg transition-colors">
        Cancel
      </button>
    </div>
  );

  if (!qrCodeUrl) return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin" /> Generating QR code…
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="bg-white p-3 rounded-xl">
        <img src={qrCodeUrl} alt="Scan with WeChat" className="w-40 h-40" />
      </div>
      <p className="text-sm text-gray-400 text-center">
        Open <span className="app-fg font-semibold">WeChat</span> and scan to connect your account
      </p>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        Waiting for scan…
      </div>
      <button onClick={onCancel} className="text-xs text-gray-600 hover:app-fg transition-colors">
        Cancel
      </button>
    </div>
  );
}

// ── Transfer Row ───────────────────────────────────────────────────────────────

function TransferRow({ transfer, onUpdate }: {
  transfer: Transfer;
  onUpdate: (id: string, patch: Partial<Transfer>) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const isDebit = transfer.type === "debit";

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/wechat/transfer/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transferId: transfer.transferId }),
      });
      const data = await res.json();
      onUpdate(transfer.transferId, { status: data.status, amount: data.amount });
    } catch { /* keep previous */ }
    finally { setRefreshing(false); }
  };

  return (
    <div className="p-5 hover:bg-gray-800/40 transition-colors">
      <div className="flex items-center gap-4">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
          isDebit ? "bg-[#07C160]/10 text-[#07C160]" : "bg-[#ff5000]/10 text-[#ff5000]"
        }`}>
          {isDebit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-bold text-sm">{isDebit ? "WeChat Deposit" : "WeChat Withdrawal"}</span>
            <StatusBadge status={transfer.status} />
          </div>
          <p className="text-xs text-gray-500 truncate">
            {transfer.description ?? `ID: ${transfer.transferId.slice(0, 8)}…`}
          </p>
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <p className={`font-bold text-sm ${isDebit ? "text-[#07C160]" : "text-[#ff5000]"}`}>
            {isDebit ? "+" : "−"}${parseFloat(transfer.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(transfer.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          {transfer.status === "pending" && (
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:app-fg transition-colors disabled:opacity-40">
              <RefreshCw className={`w-2.5 h-2.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Transfer Form ──────────────────────────────────────────────────────────────

function TransferForm({ type, walletAddress, onSuccess }: {
  type: "deposit" | "withdraw";
  walletAddress: string;
  onSuccess: (result: TransferResult) => void;
}) {
  type FormStep = "form" | "signing" | "submitting" | "qr";
  const [step,       setStep]       = useState<FormStep>("form");
  const [amount,     setAmount]     = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [qrCodeUrl,  setQrCodeUrl]  = useState<string | null>(null);
  const [orderId,    setOrderId]    = useState<string | null>(null);

  const { signTypedDataAsync } = useSignTypedData();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const amountNum = parseFloat(amount);
  const canSubmit = amountNum >= 1 && step === "form";

  useEffect(() => {
    if (step !== "qr" || !orderId) return;
    const captured = amountNum;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/wechat/transfer/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transferId: orderId }),
        });
        const data = await res.json();
        if (data.status === "paid" || data.status === "settled") {
          clearInterval(pollRef.current!);
          onSuccess({
            transferId: orderId,
            status:     data.status,
            amount:     captured.toFixed(2),
            type:       "debit",
            createdAt:  new Date().toISOString(),
          });
        }
      } catch { /* keep polling */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [step, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    const amountStr       = amountNum.toFixed(2);
    const intentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    try {
      setStep("signing");
      const signature = await signTypedDataAsync({
        domain:      DEPOSIT_INTENT_DOMAIN,
        types:       DEPOSIT_INTENT_TYPES,
        primaryType: "DepositIntent",
        message: {
          walletAddress: walletAddress as `0x${string}`,
          amount:        amountStr,
          timestamp:     intentTimestamp,
        },
      });

      setStep("submitting");
      const endpoint = type === "deposit"
        ? `${BACKEND_URL}/api/wechat/transfer/deposit`
        : `${BACKEND_URL}/api/wechat/transfer/withdraw`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          amount:          amountStr,
          signature,
          intentTimestamp: intentTimestamp.toString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason ?? data.error ?? "Transfer failed.");

      if (type === "deposit") {
        setQrCodeUrl(data.qr_code_url);
        setOrderId(data.transferId);
        setStep("qr");
      } else {
        onSuccess(data as TransferResult);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
      setStep("form");
    }
  };

  if (step === "qr" && qrCodeUrl) {
    return (
      <div className="flex flex-col items-center gap-4 py-2">
        <p className="text-sm font-semibold">Scan to pay ${amountNum.toFixed(2)}</p>
        <div className="bg-white p-3 rounded-xl">
          <img src={qrCodeUrl} alt="Scan with WeChat Pay" className="w-40 h-40" />
        </div>
        <p className="text-xs text-gray-400 text-center">
          Open <span className="app-fg font-semibold">WeChat</span> and scan to complete payment
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Waiting for payment…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Amount (USD)</label>
        <div className="surface-3 border border-default border border-gray-700 rounded-xl px-4 py-2.5 flex items-center gap-2 focus-within:border-white/30 transition-colors">
          <span className="text-gray-500 text-sm">$</span>
          <input
            type="number" min="1" step="0.01" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            disabled={step !== "form"}
            className="bg-transparent text-sm app-fg outline-none flex-1 w-0"
          />
        </div>
      </div>

      {error && <p className="text-xs text-[#ff5000]">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className={`w-full py-3 text-sm font-bold rounded-full transition-colors disabled:opacity-40 flex items-center justify-center gap-2 ${
          type === "deposit"
            ? "bg-[#07C160] text-white hover:bg-[#06AE55]"
            : "bg-white text-black hover:bg-gray-200"
        }`}
      >
        {step === "signing"
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Sign in wallet…</>
          : step === "submitting"
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
          : type === "deposit"
          ? amountNum >= 1 ? `Deposit $${amountNum.toFixed(2)} via WeChat` : "Deposit via WeChat"
          : amountNum >= 1 ? `Withdraw $${amountNum.toFixed(2)} via WeChat` : "Withdraw via WeChat"
        }
      </button>

      <p className="text-[10px] text-gray-600 text-center">
        {type === "deposit"
          ? "A QR code will appear for you to scan with WeChat."
          : "Funds will be sent to your linked WeChat wallet within 1–2 business days."
        }
      </p>
    </div>
  );
}

// ── Main WeChatPay Component ───────────────────────────────────────────────────

export function WeChatPay() {
  const { address } = useWallet();

  const [linkStatus,   setLinkStatus]   = useState<"checking" | "unlinked" | "linked">("checking");
  const [showLinkFlow, setShowLinkFlow] = useState(false);

  const [account,          setAccount]          = useState<WeChatAccount | null>(null);
  const [transfers,        setTransfers]        = useState<Transfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);

  const [activeForm, setActiveForm] = useState<"deposit" | "withdraw">("deposit");
  const [formResult, setFormResult] = useState<TransferResult | null>(null);

  const fetchTransfers = useCallback(async (addr: string) => {
    setTransfersLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/wechat/transfer/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: addr }),
      });
      const data = await res.json();
      if (data.transfers) setTransfers(data.transfers);
    } catch { /* keep previous */ }
    finally { setTransfersLoading(false); }
  }, []);

  const checkLinked = useCallback(async (addr: string) => {
    const res  = await fetch(`${BACKEND_URL}/api/wechat/linked`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: addr }),
    });
    const data = await res.json();
    if (data.linked) {
      setLinkStatus("linked");
      if (data.account) setAccount(data.account);
      fetchTransfers(addr);
    } else {
      setLinkStatus("unlinked");
    }
  }, [fetchTransfers]);

  useEffect(() => {
    if (!address) { setLinkStatus("unlinked"); return; }
    setLinkStatus("checking");
    checkLinked(address).catch(() => setLinkStatus("unlinked"));
  }, [address, checkLinked]);

  const onLinked = useCallback(() => {
    setShowLinkFlow(false);
    if (address) checkLinked(address).catch(() => {});
  }, [address, checkLinked]);

  const handleTransferSuccess = useCallback((result: TransferResult) => {
    setFormResult(result);
    setTransfers(prev => [{
      transferId: result.transferId,
      type:       result.type as "debit" | "credit",
      amount:     result.amount,
      status:     result.status,
      createdAt:  result.createdAt,
    }, ...prev]);
  }, []);

  const updateTransfer = (id: string, patch: Partial<Transfer>) => {
    setTransfers(prev => prev.map(t => t.transferId === id ? { ...t, ...patch } : t));
  };

  if (!address) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold mb-1">WeChat Pay</h2>
        <p className="text-gray-400 text-sm mb-8">Deposit and withdraw via WeChat Pay</p>
        <div className="flex flex-col items-center justify-center py-16 border border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm">Connect your wallet to link WeChat Pay.</p>
        </div>
      </div>
    );
  }

  if (linkStatus === "checking") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold mb-8">WeChat Pay</h2>
        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Checking WeChat connection…</span>
        </div>
      </div>
    );
  }

  // ── State A: Not linked ──────────────────────────────────────────────────────

  if (linkStatus === "unlinked") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold mb-1">WeChat Pay</h2>
        <p className="text-gray-400 text-sm mb-8">Deposit and withdraw via WeChat Pay</p>

        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl gap-6">
          <div className="w-16 h-16 rounded-full surface-2 border border-default flex items-center justify-center">
            <QrCode className="w-7 h-7 text-gray-400" />
          </div>
          <div>
            <p className="font-semibold mb-1">No WeChat account connected</p>
            <p className="text-gray-400 text-sm max-w-xs">
              Link your WeChat to deposit and withdraw funds instantly.
            </p>
          </div>

          {showLinkFlow ? (
            <WeChatLinkFlow
              walletAddress={address}
              onLinked={onLinked}
              onCancel={() => setShowLinkFlow(false)}
            />
          ) : (
            <button
              onClick={() => setShowLinkFlow(true)}
              className="flex items-center gap-2 bg-[#07C160] text-white text-sm font-bold px-6 py-3 rounded-full hover:bg-[#06AE55] transition-colors"
            >
              <QrCode className="w-4 h-4" />
              Connect WeChat
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── State B: Linked ──────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-1">WeChat Pay</h2>
          <p className="text-gray-400 text-sm">Deposit and withdraw via WeChat Pay</p>
        </div>
        {!showLinkFlow && (
          <button
            onClick={() => setShowLinkFlow(true)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:app-fg transition-colors"
          >
            <QrCode className="w-4 h-4" />
            Add account
          </button>
        )}
      </div>

      {showLinkFlow && (
        <div className="surface-2 border border-default rounded-2xl p-6">
          <WeChatLinkFlow
            walletAddress={address}
            onLinked={onLinked}
            onCancel={() => setShowLinkFlow(false)}
          />
        </div>
      )}

      {/* Account card */}
      {account && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Account</h3>
          <div className="surface-2 border border-default rounded-2xl px-6 py-4 flex items-center gap-4">
            {account.avatarUrl ? (
              <img src={account.avatarUrl} alt={account.nickname} className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#07C160]/10 flex items-center justify-center shrink-0">
                <QrCode className="w-5 h-5 text-[#07C160]" />
              </div>
            )}
            <div>
              <p className="font-bold text-sm">{account.nickname}</p>
              <p className="text-xs text-gray-400">WeChat Pay · {account.openId.slice(0, 8)}…</p>
            </div>
          </div>
        </div>
      )}

      {/* Transfer form */}
      <div className="surface-2 border border-default rounded-2xl p-6">

        {/* WeChat badge */}
        <div className="flex items-center gap-2 mb-5">
          <span className="flex items-center gap-1.5 text-xs font-bold bg-[#07C160]/10 text-[#07C160] px-2.5 py-1 rounded-full">
            <QrCode className="w-3 h-3" /> WeChat Pay
          </span>
          <span className="text-xs text-gray-500">Instant deposit · 1–2 day withdrawal</span>
        </div>

        {/* Deposit | Withdraw toggle */}
        <div className="flex gap-1 surface-3 rounded-full p-1 mb-5 w-fit">
          {(["deposit", "withdraw"] as const).map(tab => (
            <button key={tab}
              onClick={() => { setActiveForm(tab); setFormResult(null); }}
              className={`px-5 py-1.5 rounded-full text-sm font-bold capitalize transition-colors ${
                activeForm === tab ? "bg-white text-black" : "text-gray-400 hover:app-fg"
              }`}>
              {tab}
            </button>
          ))}
        </div>

        {formResult ? (
          <div className="flex flex-col items-center py-4 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#07C160]/15 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-[#07C160]" />
            </div>
            <div>
              <p className="font-bold mb-1">
                {activeForm === "deposit" ? "Payment confirmed!" : "Withdrawal submitted"}
              </p>
              <p className="text-xs text-gray-400">
                {activeForm === "deposit"
                  ? "Your balance will update shortly."
                  : "Funds will arrive in your WeChat wallet within 1–2 business days."
                }
              </p>
              <p className="text-xs text-gray-600 mt-1 font-mono">{formResult.transferId}</p>
            </div>
            <button onClick={() => setFormResult(null)}
              className="mt-2 text-sm font-bold app-fg hover:text-gray-300 transition-colors">
              New transfer
            </button>
          </div>
        ) : (
          <TransferForm
            key={activeForm}
            type={activeForm}
            walletAddress={address}
            onSuccess={handleTransferSuccess}
          />
        )}
      </div>

      {/* Transfer history */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Transfer History</h3>
          {address && (
            <button onClick={() => fetchTransfers(address)} disabled={transfersLoading}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:app-fg transition-colors disabled:opacity-40">
              <RefreshCw className={`w-3 h-3 ${transfersLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>

        {transfersLoading ? (
          <div className="flex items-center gap-2 py-6 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading transfers…
          </div>
        ) : transfers.length === 0 ? (
          <div className="border border-gray-800 rounded-2xl py-10 text-center">
            <p className="text-gray-500 text-sm">No transfers yet.</p>
          </div>
        ) : (
          <div className="surface-3 border border-default rounded-2xl overflow-hidden divide-y divide-gray-800">
            {transfers.map(t => (
              <TransferRow key={t.transferId} transfer={t} onUpdate={updateTransfer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
