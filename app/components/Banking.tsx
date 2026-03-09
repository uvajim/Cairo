"use client";

import { useState, useEffect, useCallback } from "react";
import { usePlaidLink } from "react-plaid-link";
import {
  Landmark, RefreshCw, Loader2, Building2,
  ArrowDownLeft, ArrowUpRight, CheckCircle2,
} from "lucide-react";
import { useWallet } from "../contexts/WalletContext";
import { BACKEND_URL } from "../lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  name: string;
  mask: string;
  type: string;
  subtype: string;
  balanceCurrent: number;
  balanceAvailable?: number;
  currency: string;
}

interface Transfer {
  transferId: string;
  type: "debit" | "credit";
  amount: string;
  status: string;
  description?: string;
  createdAt: string;
  accountId?: string;
}

interface TransferResult {
  transferId: string;
  status: string;
  amount: string;
  type: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "pending"
      ? "bg-yellow-500/15 text-yellow-400"
      : status === "posted" || status === "settled"
      ? "bg-[#00c805]/15 text-[#00c805]"
      : "bg-[#ff5000]/15 text-[#ff5000]";
  return (
    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

// ── Plaid Link inner ──────────────────────────────────────────────────────────

function PlaidLinkInner({ token, walletAddress, onLinked, onCancel }: {
  token: string;
  walletAddress: string;
  onLinked: () => void;
  onCancel: () => void;
}) {
  const [exchanging, setExchanging] = useState(false);
  const [errMsg,     setErrMsg]     = useState<string | null>(null);

  const onSuccess = useCallback(async (public_token: string) => {
    setExchanging(true);
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/exchange-token`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress, public_token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Exchange failed.");
      onLinked();
    } catch (err: unknown) {
      setErrMsg(err instanceof Error ? err.message : "Bank link failed.");
      setExchanging(false);
    }
  }, [walletAddress, onLinked]);

  const { open, ready } = usePlaidLink({ token, onSuccess, onExit: onCancel });

  useEffect(() => { if (ready) open(); }, [ready, open]);

  if (exchanging) return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin" /> Linking account…
    </div>
  );

  if (errMsg) return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-[#ff5000]">{errMsg}</span>
      <button onClick={() => { setErrMsg(null); open(); }} disabled={!ready}
        className="text-xs font-bold text-gray-400 hover:text-white transition-colors">
        Retry
      </button>
      <button onClick={onCancel} className="text-xs text-gray-600 hover:text-white transition-colors">
        Cancel
      </button>
    </div>
  );

  return (
    <div className="flex items-center gap-3">
      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      <span className="text-sm text-gray-400">Opening Plaid…</span>
      <button onClick={() => open()} disabled={!ready}
        className="text-xs text-[#00c805] hover:text-[#00b004] transition-colors disabled:opacity-40">
        Click here if it didn&apos;t open
      </button>
    </div>
  );
}

// ── Transfer row ──────────────────────────────────────────────────────────────

function TransferRow({ transfer, accountName, onUpdate }: {
  transfer: Transfer;
  accountName?: string;
  onUpdate: (id: string, patch: Partial<Transfer>) => void;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const isDebit = transfer.type === "debit";

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/transfer/status`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ transferId: transfer.transferId }),
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
          isDebit ? "bg-[#00c805]/10 text-[#00c805]" : "bg-[#ff5000]/10 text-[#ff5000]"
        }`}>
          {isDebit ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-bold text-sm">{isDebit ? "ACH Deposit" : "ACH Withdrawal"}</span>
            <StatusBadge status={transfer.status} />
          </div>
          <p className="text-xs text-gray-500 truncate">
            {accountName ? `${accountName} · ` : ""}
            {transfer.description ?? `ID: ${transfer.transferId.slice(0, 8)}…`}
          </p>
        </div>

        <div className="text-right shrink-0 flex flex-col items-end gap-1">
          <p className={`font-bold text-sm ${isDebit ? "text-[#00c805]" : "text-[#ff5000]"}`}>
            {isDebit ? "+" : "−"}${parseFloat(transfer.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(transfer.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
          {transfer.status === "pending" && (
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-white transition-colors disabled:opacity-40">
              <RefreshCw className={`w-2.5 h-2.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ACH Transfer form ─────────────────────────────────────────────────────────

function TransferForm({ type, accounts, walletAddress, onSuccess }: {
  type: "deposit" | "withdraw";
  accounts: Account[];
  walletAddress: string;
  onSuccess: (result: TransferResult) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount,    setAmount]    = useState("");
  const [legalName, setLegalName] = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const endpoint = type === "deposit"
    ? `${BACKEND_URL}/api/plaid/transfer/deposit`
    : `${BACKEND_URL}/api/plaid/transfer/withdraw`;

  const amountNum = parseFloat(amount);
  const canSubmit = accountId && legalName.trim().length >= 2 && amountNum >= 1;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(endpoint, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          walletAddress,
          accountId,
          amount:    amountNum.toFixed(2),
          legalName: legalName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.reason ?? data.error ?? "Transfer failed.");
      onSuccess(data as TransferResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transfer failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Bank account</label>
        <select value={accountId} onChange={e => setAccountId(e.target.value)}
          className="w-full bg-[#2A2B30] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors appearance-none">
          {accounts.map(a => (
            <option key={a.id} value={a.id}>{a.name} ···{a.mask}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">Amount (USD)</label>
        <div className="bg-[#2A2B30] border border-gray-700 rounded-xl px-4 py-2.5 flex items-center gap-2 focus-within:border-white/30 transition-colors">
          <span className="text-gray-500 text-sm">$</span>
          <input type="number" min="1" step="0.01" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="bg-transparent text-sm text-white outline-none flex-1 w-0" />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-400 mb-1.5 block">
          Legal name <span className="text-gray-600">(required for ACH)</span>
        </label>
        <input type="text" placeholder="First Last"
          value={legalName} onChange={e => setLegalName(e.target.value)}
          className="w-full bg-[#2A2B30] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 transition-colors" />
      </div>

      {error && <p className="text-xs text-[#ff5000]">{error}</p>}

      <button onClick={handleSubmit} disabled={!canSubmit || loading}
        className={`w-full py-3 text-sm font-bold rounded-full transition-colors disabled:opacity-40 flex items-center justify-center gap-2 ${
          type === "deposit"
            ? "bg-[#00c805] text-black hover:bg-[#00b004]"
            : "bg-white text-black hover:bg-gray-200"
        }`}>
        {loading
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
          : type === "deposit"
          ? amountNum >= 1 ? `Deposit $${amountNum.toFixed(2)} via ACH` : "Deposit via ACH"
          : amountNum >= 1 ? `Withdraw $${amountNum.toFixed(2)} via ACH` : "Withdraw via ACH"
        }
      </button>

      <p className="text-[10px] text-gray-600 text-center">
        ACH transfers settle in 1–3 business days.
      </p>
    </div>
  );
}

// ── Main Banking component ────────────────────────────────────────────────────

export function Banking() {
  const { address } = useWallet();

  const [linkStatus,    setLinkStatus]    = useState<"checking" | "unlinked" | "linked">("checking");
  const [linkToken,     setLinkToken]     = useState<string | null>(null);
  const [fetchingToken, setFetchingToken] = useState(false);
  const [linkError,     setLinkError]     = useState<string | null>(null);

  const [accounts,         setAccounts]         = useState<Account[]>([]);
  const [accountsLoading,  setAccountsLoading]  = useState(false);
  const [transfers,        setTransfers]        = useState<Transfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(false);

  const [activeForm, setActiveForm] = useState<"deposit" | "withdraw">("deposit");
  const [formResult, setFormResult] = useState<TransferResult | null>(null);

  // ── Data fetchers ──────────────────────────────────────────────────────────

  const fetchAccounts = useCallback(async (addr: string) => {
    setAccountsLoading(true);
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/accounts`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress: addr }),
      });
      const data = await res.json();
      if (data.accounts) setAccounts(data.accounts);
    } catch { /* keep previous */ }
    finally { setAccountsLoading(false); }
  }, []);

  const fetchTransfers = useCallback(async (addr: string) => {
    setTransfersLoading(true);
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/transfer/history`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress: addr }),
      });
      const data = await res.json();
      if (data.transfers) setTransfers(data.transfers);
    } catch { /* keep previous */ }
    finally { setTransfersLoading(false); }
  }, []);

  useEffect(() => {
    if (!address) { setLinkStatus("unlinked"); return; }
    setLinkStatus("checking");
    fetch(`${BACKEND_URL}/api/plaid/linked`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ walletAddress: address }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.linked) {
          setLinkStatus("linked");
          fetchAccounts(address);
          fetchTransfers(address);
        } else {
          setLinkStatus("unlinked");
        }
      })
      .catch(() => setLinkStatus("unlinked"));
  }, [address, fetchAccounts, fetchTransfers]);

  // ── Plaid Link flow ────────────────────────────────────────────────────────

  const startLink = async () => {
    if (!address) return;
    setFetchingToken(true);
    setLinkError(null);
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/create-link-token`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (data.link_token) setLinkToken(data.link_token);
      else setLinkError(data.error ?? "Failed to start bank connection.");
    } catch {
      setLinkError("Failed to start bank connection.");
    } finally {
      setFetchingToken(false);
    }
  };

  const onLinked = useCallback(() => {
    setLinkToken(null);
    setLinkStatus("linked");
    if (address) {
      fetchAccounts(address);
      fetchTransfers(address);
    }
  }, [address, fetchAccounts, fetchTransfers]);

  const handleTransferSuccess = (result: TransferResult) => {
    setFormResult(result);
    const newTransfer: Transfer = {
      transferId: result.transferId,
      type:       result.type as "debit" | "credit",
      amount:     result.amount,
      status:     result.status,
      createdAt:  result.createdAt,
    };
    setTransfers(prev => [newTransfer, ...prev]);
  };

  const updateTransfer = (id: string, patch: Partial<Transfer>) => {
    setTransfers(prev => prev.map(t => t.transferId === id ? { ...t, ...patch } : t));
  };

  // ── No wallet ──────────────────────────────────────────────────────────────

  if (!address) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold mb-1">Banking</h2>
        <p className="text-gray-400 text-sm mb-8">ACH bank transfers via Plaid</p>
        <div className="flex flex-col items-center justify-center py-16 border border-gray-800 rounded-2xl">
          <p className="text-gray-400 text-sm">Connect your wallet to link a bank account.</p>
        </div>
      </div>
    );
  }

  if (linkStatus === "checking") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold mb-8">Banking</h2>
        <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Checking bank connection…</span>
        </div>
      </div>
    );
  }

  // ── State A: Not linked ────────────────────────────────────────────────────

  if (linkStatus === "unlinked") {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h2 className="text-3xl font-bold mb-1">Banking</h2>
        <p className="text-gray-400 text-sm mb-8">ACH bank transfers via Plaid</p>

        <div className="flex flex-col items-center justify-center py-16 text-center border border-gray-800 rounded-2xl gap-6">
          <div className="w-16 h-16 rounded-full bg-[#1E1E24] flex items-center justify-center">
            <Building2 className="w-7 h-7 text-gray-400" />
          </div>
          <div>
            <p className="font-semibold mb-1">No bank account connected</p>
            <p className="text-gray-400 text-sm max-w-xs">
              Link your bank to deposit and withdraw funds via ACH transfer.
            </p>
          </div>

          {linkError && <p className="text-xs text-[#ff5000]">{linkError}</p>}

          {linkToken ? (
            <PlaidLinkInner
              token={linkToken}
              walletAddress={address}
              onLinked={onLinked}
              onCancel={() => setLinkToken(null)}
            />
          ) : (
            <button onClick={startLink} disabled={fetchingToken}
              className="flex items-center gap-2 bg-[#00c805] text-black text-sm font-bold px-6 py-3 rounded-full hover:bg-[#00b004] transition-colors disabled:opacity-40">
              {fetchingToken
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Landmark className="w-4 h-4" />
              }
              Connect Bank
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── State B: Linked ───────────────────────────────────────────────────────

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a.name]));

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold mb-1">Banking</h2>
          <p className="text-gray-400 text-sm">ACH bank transfers via Plaid</p>
        </div>
        <button onClick={startLink} disabled={fetchingToken}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40">
          <Landmark className="w-4 h-4" />
          Add account
        </button>
      </div>

      {linkToken && (
        <PlaidLinkInner
          token={linkToken}
          walletAddress={address}
          onLinked={onLinked}
          onCancel={() => setLinkToken(null)}
        />
      )}

      {/* ── Accounts ── */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Accounts</h3>
        {accountsLoading ? (
          <div className="flex items-center gap-2 py-6 text-gray-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts…
          </div>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No accounts found.</p>
        ) : (
          <div className="space-y-3">
            {accounts.map(acct => (
              <div key={acct.id} className="bg-[#1E1E24] rounded-2xl px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Landmark className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{acct.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{acct.subtype} ···{acct.mask}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">
                    ${(acct.balanceCurrent ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  {acct.balanceAvailable != null && (
                    <p className="text-xs text-gray-400">
                      ${acct.balanceAvailable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} available
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── ACH Deposit / Withdraw ── */}
      {accounts.length > 0 && (
        <div className="bg-[#1E1E24] rounded-2xl p-6">

          {/* ACH badge */}
          <div className="flex items-center gap-2 mb-5">
            <span className="flex items-center gap-1.5 text-xs font-bold bg-blue-500/10 text-blue-400 px-2.5 py-1 rounded-full">
              <Landmark className="w-3 h-3" /> ACH Transfer
            </span>
            <span className="text-xs text-gray-500">Settles in 1–3 business days</span>
          </div>

          {/* Deposit | Withdraw toggle */}
          <div className="flex gap-1 bg-black rounded-full p-1 mb-5 w-fit">
            {(["deposit", "withdraw"] as const).map(tab => (
              <button key={tab}
                onClick={() => { setActiveForm(tab); setFormResult(null); }}
                className={`px-5 py-1.5 rounded-full text-sm font-bold capitalize transition-colors ${
                  activeForm === tab ? "bg-white text-black" : "text-gray-400 hover:text-white"
                }`}>
                {tab}
              </button>
            ))}
          </div>

          {formResult ? (
            <div className="flex flex-col items-center py-4 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-[#00c805]/15 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-[#00c805]" />
              </div>
              <div>
                <p className="font-bold mb-1">ACH transfer submitted</p>
                <p className="text-xs text-gray-400">Settles in 1–3 business days.</p>
                <p className="text-xs text-gray-600 mt-1 font-mono">{formResult.transferId}</p>
              </div>
              <button onClick={() => setFormResult(null)}
                className="mt-2 text-sm font-bold text-white hover:text-gray-300 transition-colors">
                New transfer
              </button>
            </div>
          ) : (
            <TransferForm
              key={activeForm}
              type={activeForm}
              accounts={accounts}
              walletAddress={address}
              onSuccess={handleTransferSuccess}
            />
          )}
        </div>
      )}

      {/* ── Transfer history ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Transfer History</h3>
          {address && (
            <button onClick={() => fetchTransfers(address)} disabled={transfersLoading}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-40">
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
          <div className="bg-[#1A1B1F] rounded-2xl overflow-hidden divide-y divide-gray-800">
            {transfers.map(t => (
              <TransferRow
                key={t.transferId}
                transfer={t}
                accountName={t.accountId ? accountMap[t.accountId] : undefined}
                onUpdate={updateTransfer}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
