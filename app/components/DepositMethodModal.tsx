"use client";

import { useState, useEffect, useCallback } from "react";
import { Landmark, Wallet, Loader2, ArrowDownToLine, CheckCircle2 } from "lucide-react";
import { useWriteContract, useChainId, useSwitchChain, usePublicClient, useSignTypedData } from "wagmi";
import { parseUnits, pad, maxUint256 } from "viem";
import { usePlaidLink } from "react-plaid-link";
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

interface Account {
  id: string;
  name: string;
  mask: string;
  subtype: string;
}

interface TransferResult {
  transferId: string;
  status: string;
  amount: string;
}

interface Props { onClose: () => void; }

// ── Plaid Link inner — auto-opens when mounted ────────────────────────────────
function PlaidLinkFlow({ token, walletAddress, onDone, onError }: {
  token: string;
  walletAddress: string;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [exchanging, setExchanging] = useState(false);

  const onSuccess = useCallback(async (public_token: string) => {
    setExchanging(true);
    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/exchange-token`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ walletAddress, public_token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Token exchange failed.");
      onDone();
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : "Bank link failed.");
    }
  }, [walletAddress, onDone, onError]);

  const { open, ready } = usePlaidLink({ token, onSuccess });
  useEffect(() => { if (ready) open(); }, [ready, open]);

  if (exchanging) return (
    <div className="flex flex-col items-center py-8 gap-3">
      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      <p className="text-sm text-gray-400">Linking account…</p>
    </div>
  );

  return (
    <div className="flex flex-col items-center py-8 gap-3">
      <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      <p className="text-sm text-gray-400">Opening Plaid…</p>
      <button onClick={() => open()} disabled={!ready}
        className="text-xs text-[#00c805] hover:text-[#00b004] transition-colors mt-1 disabled:opacity-40">
        Click here if it didn&apos;t open
      </button>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export function DepositMethodModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { address, refreshBalance } = useWallet();

  const [method, setMethod] = useState<"web3" | "bank" | null>(null);

  // ── Bank sub-state ─────────────────────────────────────────────────────────
  // "checking"  = calling /api/plaid/linked
  // "unlinked"  = not linked yet → run Plaid Link flow
  // "linked"    = already linked → show ACH form
  type BankState = "checking" | "unlinked" | "linked";
  const [bankState, setBankState] = useState<BankState>("checking");

  // Plaid Link (unlinked path)
  const [linkToken,    setLinkToken]    = useState<string | null>(null);
  const [linkFetching, setLinkFetching] = useState(false);
  const [linkError,    setLinkError]    = useState<string | null>(null);
  const [linkDone,     setLinkDone]     = useState(false); // exchange succeeded

  // ACH form (linked path)
  const [accounts,        setAccounts]        = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [achForm,         setAchForm]         = useState<"deposit" | "withdraw">("deposit");
  const [achAccountId,    setAchAccountId]    = useState("");
  const [achAmount,       setAchAmount]       = useState("");
  const [achLegalName,    setAchLegalName]    = useState("");
  const [achLoading,      setAchLoading]      = useState(false);
  const [achStep,         setAchStep]         = useState<"signing" | "submitting" | null>(null);
  const [achResult,       setAchResult]       = useState<TransferResult | null>(null);
  const [achError,        setAchError]        = useState<string | null>(null);

  // ── Triggered when user picks "Bank Account" ───────────────────────────────
  const selectBank = useCallback(async () => {
    if (!address) return;
    setMethod("bank");
    setBankState("checking");
    setLinkToken(null);
    setLinkError(null);
    setLinkDone(false);
    setAchResult(null);
    setAchError(null);

    try {
      const res  = await fetch(`${BACKEND_URL}/api/plaid/linked`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ walletAddress: address }),
      });
      const data = await res.json();

      if (data.linked) {
        // Already linked — fetch accounts then show ACH form
        setBankState("linked");
        setAccountsLoading(true);
        try {
          const acctRes  = await fetch(`${BACKEND_URL}/api/plaid/accounts`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body:   JSON.stringify({ walletAddress: address }),
          });
          const acctData = await acctRes.json();
          const list: Account[] = acctData.accounts ?? [];
          setAccounts(list);
          if (list.length > 0) setAchAccountId(list[0].id);
        } catch { /* keep empty */ }
        finally { setAccountsLoading(false); }
      } else {
        // Not linked — start Plaid Link
        setBankState("unlinked");
        setLinkFetching(true);
        const ltRes  = await fetch(`${BACKEND_URL}/api/plaid/create-link-token`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body:   JSON.stringify({ walletAddress: address }),
        });
        const ltData = await ltRes.json();
        if (ltData.link_token) setLinkToken(ltData.link_token);
        else setLinkError(ltData.error ?? "Failed to start bank connection.");
        setLinkFetching(false);
      }
    } catch {
      setBankState("unlinked");
      setLinkError("Failed to check bank connection.");
    }
  }, [address]);

  const resetBank = () => {
    setBankState("checking");
    setLinkToken(null); setLinkFetching(false); setLinkError(null); setLinkDone(false);
    setAccounts([]); setAchResult(null); setAchError(null);
    setAchAmount(""); setAchLegalName("");
  };

  const handleBack = () => { setMethod(null); resetBank(); };

  // ── ACH transfer submit ────────────────────────────────────────────────────
  const achAmountNum = parseFloat(achAmount);
  const achCanSubmit = achAccountId && achLegalName.trim().length >= 2 && achAmountNum >= 1;


  const handleAchSubmit = async () => {
    if (!achCanSubmit || !address) return;
    setAchLoading(true);
    setAchError(null);
    setAchStep(null);

    if (achForm === "deposit") {
      // ── Deposit: EIP-712 sign → /api/transfer/create ─────────────────────
      try {
        const amount    = achAmountNum.toFixed(2);
        const timestamp = BigInt(Math.floor(Date.now() / 1000));

        setAchStep("signing");
        const signature = await signTypedDataAsync({
          domain:      DEPOSIT_INTENT_DOMAIN,
          types:       DEPOSIT_INTENT_TYPES,
          primaryType: "DepositIntent",
          message: {
            walletAddress: address as `0x${string}`,
            amount,
            timestamp,
          },
        });

        setAchStep("submitting");
        const res  = await fetch(`${BACKEND_URL}/api/plaid/transfer/deposit`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body:   JSON.stringify({
            walletAddress: address,
            accountId:     achAccountId,
            amount,
            legalName:     achLegalName.trim(),
            intentTimestamp: timestamp.toString(),
            signature,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.reason ?? data.error ?? "Transfer failed.");
        setAchResult(data as TransferResult);
      } catch (err: unknown) {
        setAchError(err instanceof Error ? err.message : "Transfer failed.");
      } finally {
        setAchLoading(false);
        setAchStep(null);
      }
    } else {
      // ── Withdraw: existing unsigned path ─────────────────────────────────
      try {
        const res  = await fetch(`${BACKEND_URL}/api/plaid/transfer/withdraw`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body:   JSON.stringify({
            walletAddress: address,
            accountId:     achAccountId,
            amount:        achAmountNum.toFixed(2),
            legalName:     achLegalName.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.reason ?? data.error ?? "Transfer failed.");
        setAchResult(data as TransferResult);
      } catch (err: unknown) {
        setAchError(err instanceof Error ? err.message : "Transfer failed.");
      } finally {
        setAchLoading(false);
        setAchStep(null);
      }
    }
  };

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

  const backdropCloseable = txStep === "idle" && !linkDone && !achResult;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={backdropCloseable ? onClose : undefined}
    >
      <div
        className="bg-[#1E1E24] rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Method selection ── */}
        {!method && (
          <>
            <h3 className="text-base font-bold mb-1">Add funds</h3>
            <p className="text-xs text-gray-400 mb-5">Choose how you want to deposit</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setMethod("web3")}
                className="flex flex-col items-center justify-center gap-3 bg-[#2A2B30] hover:bg-[#333540] border border-gray-700 hover:border-white/20 rounded-2xl px-4 py-6 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-[#00c805]/10 flex items-center justify-center group-hover:bg-[#00c805]/20 transition-colors">
                  <Wallet className="w-6 h-6 text-[#00c805]" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold">Web3 Wallet</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">USDC · USDT</p>
                </div>
              </button>

              <button onClick={selectBank}
                className="flex flex-col items-center justify-center gap-3 bg-[#2A2B30] hover:bg-[#333540] border border-gray-700 hover:border-white/20 rounded-2xl px-4 py-6 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                  <Landmark className="w-6 h-6 text-blue-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold">Bank Account</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">ACH · Wire</p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── Bank: checking link status ── */}
        {method === "bank" && bankState === "checking" && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
            <p className="text-sm text-gray-400">Checking bank connection…</p>
          </div>
        )}

        {/* ── Bank: not linked → Plaid Link flow ── */}
        {method === "bank" && bankState === "unlinked" && !linkDone && (
          <>
            <button onClick={handleBack} className="text-xs text-gray-500 hover:text-white mb-4 transition-colors">
              ← Back
            </button>
            <h3 className="text-base font-bold mb-1">Connect Bank</h3>
            <p className="text-xs text-gray-400 mb-5">Securely link your account via Plaid</p>

            {linkFetching && (
              <div className="flex flex-col items-center py-8 gap-3">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                <p className="text-sm text-gray-400">Preparing secure connection…</p>
              </div>
            )}
            {linkError && (
              <div className="space-y-3 py-4">
                <p className="text-xs text-[#ff5000]">{linkError}</p>
                <button onClick={() => { setLinkError(null); selectBank(); }}
                  className="text-xs font-bold text-gray-400 hover:text-white transition-colors">
                  Try again
                </button>
              </div>
            )}
            {linkToken && !linkError && (
              <PlaidLinkFlow
                token={linkToken}
                walletAddress={address!}
                onDone={() => setLinkDone(true)}
                onError={msg => { setLinkError(msg); setLinkToken(null); }}
              />
            )}
          </>
        )}

        {/* ── Bank: Plaid Link just completed → success ── */}
        {method === "bank" && bankState === "unlinked" && linkDone && (
          <div className="flex flex-col items-center py-4 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-[#00c805]/15 flex items-center justify-center">
              <Landmark className="w-6 h-6 text-[#00c805]" />
            </div>
            <p className="font-bold">Bank account connected!</p>
            <p className="text-xs text-gray-400">View your accounts in the Banking tab.</p>
            <button onClick={onClose} className="mt-2 text-sm font-bold text-white hover:text-gray-300 transition-colors">
              Close
            </button>
          </div>
        )}

        {/* ── Bank: already linked → ACH form ── */}
        {method === "bank" && bankState === "linked" && (
          <>
            <button onClick={handleBack} className="text-xs text-gray-500 hover:text-white mb-4 transition-colors">
              ← Back
            </button>

            {accountsLoading ? (
              <div className="flex flex-col items-center py-10 gap-3">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                <p className="text-sm text-gray-400">Loading accounts…</p>
              </div>
            ) : achResult ? (
              /* ACH success */
              <div className="flex flex-col items-center py-4 gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-[#00c805]/15 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-[#00c805]" />
                </div>
                <div>
                  <p className="font-bold mb-1">Transfer submitted</p>
                  <p className="text-xs text-gray-400">ACH takes 1–3 business days to settle.</p>
                  <p className="text-xs text-gray-600 mt-1 font-mono">{achResult.transferId}</p>
                </div>
                <button onClick={onClose} className="mt-2 text-sm font-bold text-white hover:text-gray-300 transition-colors">
                  Close
                </button>
              </div>
            ) : (
              /* ACH form */
              <div className="space-y-4">
                {/* Deposit / Withdraw toggle */}
                <div className="flex gap-1 bg-black rounded-full p-1 w-fit">
                  {(["deposit", "withdraw"] as const).map(tab => (
                    <button key={tab}
                      onClick={() => { setAchForm(tab); setAchError(null); }}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold capitalize transition-colors ${
                        achForm === tab ? "bg-white text-black" : "text-gray-400 hover:text-white"
                      }`}>
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Account selector */}
                {accounts.length > 0 ? (
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Account</label>
                    <select value={achAccountId} onChange={e => setAchAccountId(e.target.value)}
                      className="w-full bg-[#2A2B30] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white/30 transition-colors appearance-none">
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ···{a.mask}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No accounts found.</p>
                )}

                {/* Amount */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Amount (USD)</label>
                  <div className="bg-[#2A2B30] border border-gray-700 rounded-xl px-3 py-2.5 flex items-center gap-2 focus-within:border-white/30 transition-colors">
                    <span className="text-gray-500 text-sm">$</span>
                    <input type="number" min="1" step="0.01" placeholder="0.00"
                      value={achAmount} onChange={e => setAchAmount(e.target.value)}
                      className="bg-transparent text-sm text-white outline-none flex-1 w-0" />
                  </div>
                </div>

                {/* Legal name */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">
                    Legal name <span className="text-gray-600">(required for ACH)</span>
                  </label>
                  <input type="text" placeholder="First Last"
                    value={achLegalName} onChange={e => setAchLegalName(e.target.value)}
                    className="w-full bg-[#2A2B30] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 transition-colors" />
                </div>

                {achError && <p className="text-xs text-[#ff5000]">{achError}</p>}

                <button onClick={handleAchSubmit} disabled={!achCanSubmit || achLoading}
                  className={`w-full py-3 text-sm font-bold rounded-full transition-colors disabled:opacity-40 flex items-center justify-center gap-2 ${
                    achForm === "deposit"
                      ? "bg-[#00c805] text-black hover:bg-[#00b004]"
                      : "bg-white text-black hover:bg-gray-200"
                  }`}>
                  {achStep === "signing"
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Sign in wallet…</>
                    : achStep === "submitting"
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                    : achForm === "deposit"
                    ? achAmountNum >= 1 ? `Deposit $${achAmountNum.toFixed(2)}` : "Deposit"
                    : achAmountNum >= 1 ? `Withdraw $${achAmountNum.toFixed(2)}` : "Withdraw"
                  }
                </button>
                <p className="text-[10px] text-gray-600 text-center">
                  ACH transfers settle in 1–3 business days.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Web3: amount + continue ── */}
        {method === "web3" && txStep === "idle" && (
          <>
            <button onClick={handleBack} className="text-xs text-gray-500 hover:text-white mb-4 transition-colors">
              ← Back
            </button>
            <p className="text-sm font-semibold mb-4">{t("overview.depositQuestion")}</p>

            <div className="flex flex-wrap gap-2 mb-4">
              {PRESETS.map(p => (
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
                className="w-full bg-[#2A2B30] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-white/30 mb-4" />
            )}

            <div className="flex gap-2 mb-4">
              {(["USDC", "USDT"] as const).map(tok => (
                <button key={tok} onClick={() => setSelectedToken(tok)}
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${selectedToken === tok ? "bg-white text-black" : "bg-[#2A2B30] text-gray-300 hover:bg-gray-700"}`}>
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
              <div className="space-y-2 pt-1">
                <p className="text-xs text-[#ff5000]">{txErrMsg ?? "Transaction failed."}</p>
                <button onClick={() => { setTxStep("idle"); setTxErrMsg(null); }}
                  className="text-xs text-gray-400 hover:text-white transition-colors">
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
                className="text-xs font-mono text-gray-500 hover:text-white transition-colors break-all">
                {depositTxHash.slice(0, 10)}…{depositTxHash.slice(-8)}
              </a>
            )}
            <button onClick={onClose} className="mt-2 text-sm font-bold text-white hover:text-gray-300 transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
