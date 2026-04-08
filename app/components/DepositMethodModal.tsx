"use client";

import { useState } from "react";
import { Wallet, Loader2, ArrowDownToLine } from "lucide-react";
import { useWriteContract, useChainId, useSwitchChain, usePublicClient } from "wagmi";
import { parseUnits, pad, maxUint256 } from "viem";
import { useTranslation } from "react-i18next";
import { useWallet } from "../contexts/WalletContext";
import {
  MARITIME_DEPOSIT_CONTRACT,
  SEPOLIA_STABLECOINS,
  ERC20_APPROVE_ABI,
  MARITIME_DEPOSIT_ABI,
  CONTRACT_ERROR_MESSAGES,
} from "../lib/config";

const PRESETS = [50, 100, 250, 500, 1000];

interface Props { onClose: () => void; }

export function DepositMethodModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { address, refreshBalance } = useWallet();

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
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const sepoliaClient = usePublicClient({ chainId: 11155111 });

  const handleDeposit = async () => {
    if (!depositAmount || depositAmount < 1 || !address || !sepoliaClient) return;
    setTxStep("approving"); setTxErrMsg(null); setSkipApprove(false);
    try {
      if (chainId !== 11155111) await switchChainAsync({ chainId: 11155111 });
      const tokenAddress = SEPOLIA_STABLECOINS[selectedToken];
      const rawAmount    = parseUnits(depositAmount.toString(), 6);
      const userId       = pad(address as `0x${string}`, { size: 32 });

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

  const backdropCloseable = txStep === "idle";

  return (
    <div
      className="fixed inset-0 modal-scrim backdrop-blur-sm z-50 flex items-center justify-center"
      onClick={backdropCloseable ? onClose : undefined}
    >
      <div
        className="surface-2 border border-default rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        {txStep === "idle" && (
          <>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-[#00c805]/10 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-[#00c805]" />
              </div>
              <h3 className="text-base font-bold">Add funds</h3>
            </div>
            <p className="text-xs text-gray-400 mb-5">{t("overview.depositQuestion")}</p>

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

            <button onClick={handleDeposit} disabled={!depositAmount || depositAmount < 1}
              className="w-full bg-[#00c805] text-black text-sm font-bold py-2.5 rounded-full hover:bg-[#00b004] transition-colors disabled:opacity-40">
              {depositAmount && depositAmount >= 1 ? `Deposit ${depositAmount} ${selectedToken}` : t("overview.continue")}
            </button>
          </>
        )}

        {/* ── Transaction progress ── */}
        {txStep !== "idle" && txStep !== "done" && (
          <div className="space-y-4">
            <h3 className="text-base font-bold">Depositing…</h3>
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

        {/* ── Success ── */}
        {txStep === "done" && (
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
