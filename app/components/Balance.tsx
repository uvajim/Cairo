"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, ArrowDownLeft,
  Loader2, ArrowDownCircle, ArrowUpCircle, Wallet, Landmark, CheckCircle2,
} from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { usePlaidLink } from "react-plaid-link";
import { useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain, usePublicClient, useSignTypedData } from "wagmi";
import { parseUnits, pad, maxUint256, formatUnits, parseAbiItem } from "viem";
import { useWallet } from "../contexts/WalletContext";
import {
  ACTIVITY_URL, BACKEND_URL,
  MARITIME_DEPOSIT_CONTRACT, SEPOLIA_STABLECOINS,
  ERC20_APPROVE_ABI, MARITIME_DEPOSIT_ABI, MARITIME_WITHDRAW_ABI,
  CONTRACT_ERROR_MESSAGES,
  DEPOSIT_INTENT_DOMAIN, DEPOSIT_INTENT_TYPES,
} from "../lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface AchAccount {
  id: string;
  name: string;
  mask: string;
  subtype: string;
}

interface AchTransfer {
  transferId: string;
  type: "debit" | "credit";
  amount: string;
  status: string;
  description?: string;
  createdAt: string;
}

interface FeedItem {
  id: string;
  kind: "order" | "ach" | "mdt";
  // order fields
  ticker?: string;
  side?: "buy" | "sell";
  qty?: string;
  alpacaOrderId?: string;
  tradeValue?: number;
  // ach fields
  achDirection?: "in" | "out";
  achStatus?: string;
  // mdt fields
  mdtDirection?: "in" | "out";
  txHash?: string;
  // common
  amount: number;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const feedCache: { address: string; items: FeedItem[] } = { address: "", items: [] };
const achAccountCache: { address: string; accounts: AchAccount[]; linked: boolean } = {
  address: "", accounts: [], linked: false,
};

const DEPOSITED_EVENT = parseAbiItem(
  "event Deposited(address indexed user, address indexed token, uint256 amount, bytes32 userId, uint256 timestamp)"
);
const WITHDRAWN_EVENT = parseAbiItem(
  "event Withdrawn(address indexed user, address indexed token, uint256 amount, uint256 timestamp)"
);

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Plaid Link inner — defined outside Balance to avoid re-creation ───────────

function PlaidLinkInner({ token, walletAddress, onLinked, onError }: {
  token: string;
  walletAddress: string;
  onLinked: () => void;
  onError: (msg: string) => void;
}) {
  const [exchanging, setExchanging] = useState(false);

  const onSuccess = useCallback(async (public_token: string) => {
    setExchanging(true);
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/exchange-token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, public_token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Exchange failed.");
      onLinked();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Bank link failed.");
      setExchanging(false);
    }
  }, [walletAddress, onLinked, onError]);

  const { open, ready } = usePlaidLink({ token, onSuccess });
  useEffect(() => { if (ready) open(); }, [ready, open]);

  return (
    <div className="flex items-center gap-2 text-sm text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin" />
      {exchanging ? "Linking account…" : (
        <>
          Opening Plaid…
          <button onClick={() => open()} disabled={!ready}
            className="text-xs text-[#00c805] hover:text-[#00b004] transition-colors disabled:opacity-40 ml-1">
            Click here if it didn&apos;t open
          </button>
        </>
      )}
    </div>
  );
}

// ── Method picker pill ─────────────────────────────────────────────────────────

function MethodPicker({ value, onChange }: {
  value: "stablecoins" | "ach";
  onChange: (v: "stablecoins" | "ach") => void;
}) {
  return (
    <div className="flex gap-1 bg-black rounded-full p-1 w-fit">
      {(["stablecoins", "ach"] as const).map(m => (
        <button key={m} onClick={() => onChange(m)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${
            value === m ? "bg-white text-black" : "text-gray-400 hover:text-white"
          }`}>
          {m === "stablecoins"
            ? <><Wallet   className="w-3 h-3" /> Stablecoins</>
            : <><Landmark className="w-3 h-3" /> ACH Bank</>
          }
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const STABLECOIN_PRESETS = [50, 100, 250, 500, 1000];

export function Balance() {
  const { t } = useTranslation();
  const { address, usdBalance, accountBalance, connect, refreshBalance } = useWallet();

  // ── Panel visibility ───────────────────────────────────────────────────────
  const [showDepositPanel,  setShowDepositPanel]  = useState(false);
  const [showWithdrawPanel, setShowWithdrawPanel] = useState(false);

  // ── Method picker per panel ────────────────────────────────────────────────
  const [depositMethod,  setDepositMethod]  = useState<"stablecoins" | "ach">("stablecoins");
  const [withdrawMethod, setWithdrawMethod] = useState<"stablecoins" | "ach">("stablecoins");

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
  const { signTypedDataAsync } = useSignTypedData();
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
    setWdStep("done"); refreshBalance();
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

  // ── ACH shared state ───────────────────────────────────────────────────────
  type AchStatus = "idle" | "checking" | "linked" | "unlinked";
  const [achStatus,      setAchStatus]      = useState<AchStatus>("idle");
  const [achAccounts,    setAchAccounts]    = useState<AchAccount[]>([]);
  const [achLinkToken,   setAchLinkToken]   = useState<string | null>(null);
  const [achLinkLoading, setAchLinkLoading] = useState(false);
  const [achLinkError,   setAchLinkError]   = useState<string | null>(null);

  // ACH form fields (reused for both deposit and withdraw)
  const [achAccountId, setAchAccountId] = useState("");
  const [achAmount,    setAchAmount]    = useState("");
  const [achLegalName, setAchLegalName] = useState("");
  const [achLoading,   setAchLoading]   = useState(false);
  const [achSuccess,   setAchSuccess]   = useState(false);
  const [achError,     setAchError]     = useState<string | null>(null);

  const achAmountNum = parseFloat(achAmount);
  const achCanSubmit = achAccountId && achLegalName.trim().length >= 2 && achAmountNum >= 1;

  // Load ACH accounts when the ACH tab is first opened.
  // Uses a module-level cache so navigating away and back is instant.
  useEffect(() => {
    if (!address || achStatus !== "idle") return;
    const needsCheck =
      (showDepositPanel  && depositMethod  === "ach") ||
      (showWithdrawPanel && withdrawMethod === "ach");
    if (!needsCheck) return;

    // Serve from cache immediately if available
    if (achAccountCache.address === address) {
      if (achAccountCache.linked) {
        setAchAccounts(achAccountCache.accounts);
        if (achAccountCache.accounts.length > 0) setAchAccountId(achAccountCache.accounts[0].id);
        setAchStatus("linked");
      } else {
        setAchStatus("unlinked");
      }
      return;
    }

    // Cache miss — single fetch (accounts endpoint returns 404 if not linked)
    setAchStatus("checking");
    fetch(`${BACKEND_URL}/api/plaid/accounts`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    })
      .then(r => r.json())
      .then(data => {
        const list: AchAccount[] = data.accounts ?? [];
        achAccountCache.address  = address;
        achAccountCache.linked   = list.length > 0;
        achAccountCache.accounts = list;
        setAchAccounts(list);
        if (list.length > 0) setAchAccountId(list[0].id);
        setAchStatus(list.length > 0 ? "linked" : "unlinked");
      })
      .catch(() => setAchStatus("unlinked"));
  }, [showDepositPanel, showWithdrawPanel, depositMethod, withdrawMethod, achStatus, address]);

  const startPlaidLink = async () => {
    if (!address) return;
    setAchLinkLoading(true); setAchLinkError(null);
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/create-link-token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      if (data.link_token) setAchLinkToken(data.link_token);
      else setAchLinkError(data.error ?? "Failed to start bank connection.");
    } catch { setAchLinkError("Failed to start bank connection."); }
    finally { setAchLinkLoading(false); }
  };

  const onBankLinked = useCallback(async () => {
    setAchLinkToken(null);
    if (!address) return;
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/accounts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();
      const list: AchAccount[] = data.accounts ?? [];
      achAccountCache.address  = address;
      achAccountCache.linked   = true;
      achAccountCache.accounts = list;
      setAchAccounts(list);
      if (list.length > 0) setAchAccountId(list[0].id);
    } catch { /* keep empty */ }
    setAchStatus("linked");
  }, [address]);

  const handleAchTransfer = async (type: "deposit" | "withdraw") => {
    if (!achCanSubmit || !address) return;
    setAchLoading(true); setAchError(null);
    try {
      const amountStr = achAmountNum.toFixed(2);

      if (type === "deposit") {
        const intentTimestamp = BigInt(Math.floor(Date.now() / 1000));
        const signature = await signTypedDataAsync({
          domain:      DEPOSIT_INTENT_DOMAIN,
          types:       DEPOSIT_INTENT_TYPES,
          primaryType: "DepositIntent",
          message: {
            walletAddress: address as `0x${string}`,
            amount:        amountStr,
            timestamp:     intentTimestamp,
          },
        });
        const res = await fetch(`${BACKEND_URL}/api/plaid/transfer/deposit`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            accountId: achAccountId,
            amount: amountStr,
            legalName: achLegalName.trim(),
            intentTimestamp: intentTimestamp.toString(),
            signature,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.reason ?? data.error ?? "Transfer failed.");
      } else {
        const res = await fetch(`${BACKEND_URL}/api/plaid/transfer/withdraw`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: address,
            accountId: achAccountId,
            amount: amountStr,
            legalName: achLegalName.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.reason ?? data.error ?? "Transfer failed.");
      }
      setAchSuccess(true);
    } catch (err: unknown) {
      setAchError(err instanceof Error ? err.message : "Transfer failed.");
    } finally { setAchLoading(false); }
  };

  const resetAchForm = () => {
    setAchAmount(""); setAchLegalName("");
    setAchSuccess(false); setAchError(null);
  };

  // ── Activity feed (orders + ACH transfers + on-chain MDT events) ──────────
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setFeedItems([]); return; }
    if (feedCache.address === address && feedCache.items.length > 0) {
      setFeedItems(feedCache.items); return;
    }
    setLoading(true); setError(null);

    const client = sepoliaClient; // capture current value

    const fetchOrders = fetch(ACTIVITY_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    }).then(r => r.json()).then(d => (d.executedOrders ?? []) as Order[]).catch(() => [] as Order[]);

    const fetchAch = fetch(`${BACKEND_URL}/api/plaid/transfer/history`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: address }),
    }).then(r => r.json()).then(d => (d.transfers ?? []) as AchTransfer[]).catch(() => [] as AchTransfer[]);

    const fetchMdtDeposits = client
      ? client.getLogs({ address: MARITIME_DEPOSIT_CONTRACT, event: DEPOSITED_EVENT,
          args: { user: address as `0x${string}` }, fromBlock: "earliest" }).catch(() => [])
      : Promise.resolve([]);

    const fetchMdtWithdraws = client
      ? client.getLogs({ address: MARITIME_DEPOSIT_CONTRACT, event: WITHDRAWN_EVENT,
          args: { user: address as `0x${string}` }, fromBlock: "earliest" }).catch(() => [])
      : Promise.resolve([]);

    Promise.all([fetchOrders, fetchAch, fetchMdtDeposits, fetchMdtWithdraws])
      .then(([orders, achTransfers, depositedLogs, withdrawnLogs]) => {
        const items: FeedItem[] = [];

        for (const o of orders) {
          items.push({
            id: `order-${o.id}`,
            kind: "order",
            ticker: o.ticker,
            side: o.side,
            qty: o.qty,
            alpacaOrderId: o.alpacaOrderId,
            tradeValue: o.tradeValue ?? o.estimatedCost,
            amount: o.tradeValue ?? o.estimatedCost ?? 0,
            createdAt: o.createdAt,
          });
        }

        for (const t of achTransfers) {
          items.push({
            id: `ach-${t.transferId}`,
            kind: "ach",
            achDirection: t.type === "debit" ? "in" : "out",
            achStatus: t.status,
            amount: parseFloat(t.amount),
            createdAt: t.createdAt,
          });
        }

        for (const log of depositedLogs) {
          const args = (log as { args?: { amount?: bigint; timestamp?: bigint }; transactionHash?: `0x${string}` }).args;
          items.push({
            id: `mdt-d-${(log as { transactionHash?: string }).transactionHash ?? Math.random()}`,
            kind: "mdt",
            mdtDirection: "in",
            amount: args?.amount != null ? Number(formatUnits(args.amount, 6)) : 0,
            createdAt: args?.timestamp != null ? new Date(Number(args.timestamp) * 1000).toISOString() : new Date().toISOString(),
            txHash: (log as { transactionHash?: `0x${string}` }).transactionHash ?? undefined,
          });
        }

        for (const log of withdrawnLogs) {
          const args = (log as { args?: { amount?: bigint; timestamp?: bigint }; transactionHash?: `0x${string}` }).args;
          items.push({
            id: `mdt-w-${(log as { transactionHash?: string }).transactionHash ?? Math.random()}`,
            kind: "mdt",
            mdtDirection: "out",
            amount: args?.amount != null ? Number(formatUnits(args.amount, 6)) : 0,
            createdAt: args?.timestamp != null ? new Date(Number(args.timestamp) * 1000).toISOString() : new Date().toISOString(),
            txHash: (log as { transactionHash?: `0x${string}` }).transactionHash ?? undefined,
          });
        }

        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        feedCache.address = address;
        feedCache.items = items;
        setFeedItems(items);
      })
      .catch(() => setError("loadError"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // ── ACH section (shared JSX used in both panels) ──────────────────────────
  const renderAchSection = (panelType: "deposit" | "withdraw") => {
    if (achStatus === "checking") return (
      <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking bank connection…
      </div>
    );

    if (achStatus === "unlinked") return (
      <div className="space-y-3 py-2">
        <p className="text-sm text-gray-400">No bank account linked yet.</p>
        {achLinkError && <p className="text-xs text-[#ff5000]">{achLinkError}</p>}
        {achLinkToken ? (
          <PlaidLinkInner
            token={achLinkToken}
            walletAddress={address!}
            onLinked={onBankLinked}
            onError={msg => { setAchLinkError(msg); setAchLinkToken(null); }}
          />
        ) : (
          <button onClick={startPlaidLink} disabled={achLinkLoading}
            className="flex items-center gap-2 bg-[#00c805] text-black text-sm font-bold px-5 py-2.5 rounded-full hover:bg-[#00b004] transition-colors disabled:opacity-40">
            {achLinkLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Landmark className="w-4 h-4" />
            }
            Connect Bank
          </button>
        )}
      </div>
    );

    // linked
    if (achSuccess) return (
      <div className="flex flex-col items-center py-4 gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-[#00c805]/15 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-[#00c805]" />
        </div>
        <div>
          <p className="font-bold text-sm">Transfer submitted</p>
          <p className="text-xs text-gray-400 mt-0.5">ACH settles in 1–3 business days.</p>
        </div>
        <button onClick={resetAchForm}
          className="text-xs font-bold text-gray-400 hover:text-white transition-colors">
          New transfer
        </button>
      </div>
    );

    // If the user picked "Add bank account", show Plaid Link inline
    if (achLinkToken) return (
      <div className="space-y-3 py-2">
        {achLinkError && <p className="text-xs text-[#ff5000]">{achLinkError}</p>}
        <PlaidLinkInner
          token={achLinkToken}
          walletAddress={address!}
          onLinked={onBankLinked}
          onError={msg => { setAchLinkError(msg); setAchLinkToken(null); }}
        />
      </div>
    );

    return (
      <div className="space-y-3">
        {achAccounts.length > 0 ? (
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Account</label>
            <select
              value={achAccountId}
              onChange={e => {
                if (e.target.value === "__add__") {
                  startPlaidLink();
                } else {
                  setAchAccountId(e.target.value);
                }
              }}
              className="w-full bg-black border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-white/30 transition-colors appearance-none">
              {achAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} ···{a.mask}</option>
              ))}
              <option value="__add__">+ Add bank account</option>
            </select>
            {achLinkLoading && (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                <Loader2 className="w-3 h-3 animate-spin" /> Connecting to Plaid…
              </div>
            )}
            {achLinkError && <p className="text-xs text-[#ff5000] mt-1">{achLinkError}</p>}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No accounts found.</p>
        )}

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">Amount (USD)</label>
          <div className="bg-black border border-gray-700 rounded-xl px-4 py-3 flex items-center gap-2 focus-within:border-white/30 transition-colors">
            <span className="text-gray-500 text-sm">$</span>
            <input type="number" min="1" step="0.01" placeholder="0.00"
              value={achAmount} onChange={e => setAchAmount(e.target.value)}
              className="bg-transparent text-2xl font-bold text-white outline-none flex-1 w-0" />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1.5 block">
            Legal name <span className="text-gray-600">(required for ACH)</span>
          </label>
          <input type="text" placeholder="First Last"
            value={achLegalName} onChange={e => setAchLegalName(e.target.value)}
            className="w-full bg-black border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 transition-colors" />
        </div>

        {achError && <p className="text-xs text-[#ff5000]">{achError}</p>}

        <button onClick={() => handleAchTransfer(panelType)}
          disabled={!achCanSubmit || achLoading}
          className={`w-full py-3 text-sm font-bold rounded-full transition-colors disabled:opacity-40 flex items-center justify-center gap-2 ${
            panelType === "deposit"
              ? "bg-[#00c805] text-black hover:bg-[#00b004]"
              : "bg-white text-black hover:bg-gray-200"
          }`}>
          {achLoading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
            : panelType === "deposit"
            ? achAmountNum >= 1 ? `Deposit $${achAmountNum.toFixed(2)} via ACH` : "Deposit"
            : achAmountNum >= 1 ? `Withdraw $${achAmountNum.toFixed(2)} via ACH` : "Withdraw"
          }
        </button>
        <p className="text-[10px] text-gray-600 text-center">
          ACH transfers settle in 1–3 business days.
        </p>
      </div>
    );
  };

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!address) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
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
            onClick={() => {
              setShowDepositPanel(p => !p);
              setShowWithdrawPanel(false);
              setTxStep("idle"); setTxErrMsg(null); setSkipApprove(false); setDepositTxHash(undefined);
              setSelectedAmount(null); setCustomAmount("");
              resetAchForm();
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
              resetAchForm();
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
        <div className="bg-[#1E1E24] rounded-2xl px-6 py-5 mb-3 space-y-5">
          {/* Method picker — hide while tx is in progress */}
          {txStep === "idle" && (
            <MethodPicker value={depositMethod}
              onChange={m => { setDepositMethod(m); setTxStep("idle"); setTxErrMsg(null); resetAchForm(); if (m === "ach" && achStatus === "idle") { /* useEffect will fire */ } }} />
          )}

          {/* ── Stablecoin deposit ── */}
          {depositMethod === "stablecoins" && (
            <>
              {txStep === "idle" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {STABLECOIN_PRESETS.map(p => (
                      <button key={p} onClick={() => { setSelectedAmount(p); setCustomAmount(""); }}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedAmount === p ? "bg-white text-black" : "bg-[#2A2B30] text-gray-300 hover:bg-gray-700"}`}>
                        ${p}
                      </button>
                    ))}
                    <button onClick={() => { setSelectedAmount(null); setCustomAmount(""); }}
                      className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedAmount === null && customAmount === "" ? "bg-white text-black" : "bg-[#2A2B30] text-gray-300 hover:bg-gray-700"}`}>
                      {t("overview.other")}
                    </button>
                  </div>
                  {selectedAmount === null && (
                    <input type="number" min="1" placeholder={t("overview.enterAmount")} value={customAmount}
                      onChange={e => setCustomAmount(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30" />
                  )}
                  <div className="flex gap-2">
                    {(["USDC", "USDT"] as const).map(tok => (
                      <button key={tok} onClick={() => setSelectedToken(tok)}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedToken === tok ? "bg-white text-black" : "bg-[#2A2B30] text-gray-300 hover:bg-gray-700"}`}>
                        {tok}
                      </button>
                    ))}
                  </div>
                  {chainId !== 11155111 && depositAmount && depositAmount > 0 && (
                    <p className="text-xs text-yellow-400">You&apos;ll be prompted to switch to Sepolia.</p>
                  )}
                  <button onClick={handleWeb3Deposit} disabled={!depositAmount || depositAmount < 1}
                    className="w-full py-3 bg-[#00c805] text-black text-sm font-bold rounded-full hover:bg-[#00b004] transition-colors disabled:opacity-40">
                    {depositAmount && depositAmount >= 1 ? `Deposit ${depositAmount} ${selectedToken}` : t("overview.continue")}
                  </button>
                </div>
              )}

              {txStep !== "idle" && txStep !== "done" && (
                <div className="space-y-4">
                  {/* Step 1: Approve — hidden when allowance was already sufficient */}
                  {!skipApprove && (
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold
                        ${txStep === "depositing" ? "bg-[#00c805] text-black" : txStep === "approving" ? "bg-white text-black" : "bg-[#2A2B30] text-gray-500"}`}>
                        {txStep === "depositing" ? "✓" : "1"}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${txStep === "approving" ? "text-white" : "text-gray-500"}`}>
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
                      ${txStep === "depositing" ? "bg-white text-black" : "bg-[#2A2B30] text-gray-500"}`}>
                      {skipApprove ? "1" : "2"}
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${txStep === "depositing" ? "text-white" : "text-gray-500"}`}>
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
                        className="text-xs text-gray-400 hover:text-white transition-colors">Try again</button>
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
                      className="text-xs font-mono text-gray-500 hover:text-white transition-colors break-all">
                      {depositTxHash.slice(0, 10)}…{depositTxHash.slice(-8)}
                    </a>
                  )}
                  <button onClick={() => { setTxStep("idle"); setShowDepositPanel(false); }}
                    className="text-xs font-bold text-gray-400 hover:text-white transition-colors">Close</button>
                </div>
              )}
            </>
          )}

          {/* ── ACH deposit ── */}
          {depositMethod === "ach" && renderAchSection("deposit")}
        </div>
      )}

      {/* ── Withdraw panel ── */}
      {showWithdrawPanel && (
        <div className="bg-[#1E1E24] rounded-2xl px-6 py-5 mb-3 space-y-5">
          <MethodPicker value={withdrawMethod}
            onChange={m => { setWithdrawMethod(m); setWithdrawAmount(""); setWdStep("idle"); setWdErrMsg(null); resetAchForm(); }} />

          {/* ── Stablecoin withdraw ── */}
          {withdrawMethod === "stablecoins" && (
            <>
              {wdStep === "idle" && (
                <div className="space-y-4">
                  {/* Token picker */}
                  <div className="flex gap-2">
                    {(["USDC", "USDT"] as const).map(tok => (
                      <button key={tok} onClick={() => setWithdrawToken(tok)}
                        className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
                          withdrawToken === tok ? "bg-white text-black" : "bg-[#2A2B30] text-gray-300 hover:bg-gray-700"
                        }`}>
                        {tok}
                      </button>
                    ))}
                  </div>
                  <div className="bg-black border border-gray-700 rounded-xl px-4 py-3 focus-within:border-white/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-sm">$</span>
                      <input type="number" min="0" step="any" placeholder="0.00"
                        value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
                        className="bg-transparent text-2xl font-bold text-white outline-none flex-1 w-0" />
                      <button onClick={() => setWithdrawAmount(maxWithdrawable.toFixed(2))}
                        className="text-xs font-bold text-[#00c805] hover:text-[#00b004] transition-colors shrink-0">
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
                  {wdErrMsg && <p className="text-xs text-[#ff5000]">{wdErrMsg}</p>}
                  <button onClick={handleStablecoinWithdraw} disabled={!canWithdraw}
                    className="w-full py-3 bg-white text-black text-sm font-bold rounded-full hover:bg-gray-200 transition-colors disabled:opacity-40">
                    {withdrawNum > 0
                      ? `Withdraw ${withdrawNum.toFixed(2)} ${withdrawToken}`
                      : "Withdraw"}
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
                    className="text-xs text-gray-400 hover:text-white transition-colors">
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
                      className="text-xs font-mono text-gray-500 hover:text-white transition-colors break-all">
                      {withdrawHash.slice(0, 10)}…{withdrawHash.slice(-8)}
                    </a>
                  )}
                  <button onClick={() => { setWdStep("idle"); setShowWithdrawPanel(false); }}
                    className="text-xs font-bold text-gray-400 hover:text-white transition-colors">
                    Close
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── ACH withdraw ── */}
          {withdrawMethod === "ach" && renderAchSection("withdraw")}
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
        <h3 className="text-xl font-medium mb-4">{t("balance.activity")}</h3>

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
          <div className="bg-[#1A1B1F] rounded-2xl overflow-hidden divide-y divide-gray-800">
            {feedItems.map(item => {
              // ── Stock/cash orders ────────────────────────────────────────────
              if (item.kind === "order") {
                const isDeposit    = item.ticker === "Deposit";
                const isWithdrawal = item.ticker === "Withdrawal";
                const isCash       = isDeposit || isWithdrawal;
                const isBuy        = !isCash && (item.side === "buy" || (!item.side && item.tradeValue !== undefined));
                const qty          = parseFloat(item.qty ?? "0");
                const iconColor    = isDeposit    ? "bg-[#00c805]/10 text-[#00c805]"
                                   : isWithdrawal ? "bg-[#ff5000]/10 text-[#ff5000]"
                                   : isBuy        ? "bg-[#00c805]/10 text-[#00c805]"
                                   :                "bg-[#ff5000]/10 text-[#ff5000]";
                const icon         = isDeposit    ? <ArrowDownCircle className="w-4 h-4" />
                                   : isWithdrawal ? <ArrowUpCircle   className="w-4 h-4" />
                                   : isBuy        ? <ArrowUpRight    className="w-4 h-4" />
                                   :                <ArrowDownLeft   className="w-4 h-4" />;
                const valueColor   = isDeposit    ? "text-[#00c805]"
                                   : isWithdrawal ? "text-[#ff5000]"
                                   : isBuy        ? "text-[#ff5000]" : "text-[#00c805]";
                return (
                  <div key={item.id} className="p-5 hover:bg-gray-800/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconColor}`}>{icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {isCash
                            ? <span className="font-bold text-sm">{item.ticker}</span>
                            : <Link to={`/stock/${item.ticker}`} className="font-bold text-sm hover:text-[#00c805] transition-colors">{item.ticker}</Link>
                          }
                          {!isCash && (
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isBuy ? "bg-[#00c805]/15 text-[#00c805]" : "bg-[#ff5000]/15 text-[#ff5000]"}`}>
                              {isBuy ? "BUY" : "SELL"}
                            </span>
                          )}
                        </div>
                        {item.alpacaOrderId && (
                          <p className="text-xs text-gray-500 font-mono">ID: {item.alpacaOrderId.split("-")[0]}…</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-sm ${valueColor}`}>
                          {isDeposit ? "+" : "−"}${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {!isCash && <p className="text-xs text-gray-400">{t("balance.shares", { count: qty })}</p>}
                        <p className="text-xs text-gray-500 mt-0.5">{relativeTime(item.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── ACH bank transfers ───────────────────────────────────────────
              if (item.kind === "ach") {
                const isIn     = item.achDirection === "in";
                const settled  = item.achStatus === "settled" || item.achStatus === "funds_available";
                return (
                  <div key={item.id} className="p-5 hover:bg-gray-800/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isIn ? "bg-[#00c805]/10 text-[#00c805]" : "bg-[#ff5000]/10 text-[#ff5000]"}`}>
                        <Landmark className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm">{isIn ? "ACH Deposit" : "ACH Withdrawal"}</span>
                          {!settled && (
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">PENDING</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">Settles in 1–3 business days</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-sm ${isIn ? "text-[#00c805]" : "text-[#ff5000]"}`}>
                          {isIn ? "+" : "−"}${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{relativeTime(item.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              // ── On-chain MDT events ──────────────────────────────────────────
              if (item.kind === "mdt") {
                const isIn = item.mdtDirection === "in";
                return (
                  <div key={item.id} className="p-5 hover:bg-gray-800/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isIn ? "bg-[#00c805]/10 text-[#00c805]" : "bg-[#ff5000]/10 text-[#ff5000]"}`}>
                        <Wallet className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-sm">{isIn ? "Crypto Deposit" : "Crypto Withdrawal"}</span>
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${isIn ? "bg-[#00c805]/15 text-[#00c805]" : "bg-[#ff5000]/15 text-[#ff5000]"}`}>
                            {isIn ? "+MDT" : "−MDT"}
                          </span>
                        </div>
                        {item.txHash && (
                          <a href={`https://sepolia.etherscan.io/tx/${item.txHash}`} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-mono text-gray-500 hover:text-white transition-colors">
                            {item.txHash.slice(0, 8)}…{item.txHash.slice(-6)}
                          </a>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-bold text-sm ${isIn ? "text-[#00c805]" : "text-[#ff5000]"}`}>
                          {isIn ? "+" : "−"}{item.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDT
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{relativeTime(item.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
