"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  useAccount,
  useBalance,
  useDisconnect,
  useReadContract,
} from "wagmi";
import { formatUnits } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { MDT_TOKEN_CONTRACT, CHAIN_ID } from "../lib/config";

// Minimal ABI — only balanceOf needed
const MDT_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface WalletContextValue {
  address:         string | null;
  ethBalance:      number;
  usdBalance:      number;
  accountBalance:  number;
  ethPrice:        number;
  connecting:      boolean;
  walletError:     string | null;
  connect:         () => void;
  disconnect:      () => void;
  refreshBalance:  () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnecting } = useAccount();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const { open } = useAppKit();

  const address = wagmiAddress ?? null;

  // ETH balance from wagmi (used for header pill)
  const { data: balanceData } = useBalance({ address: wagmiAddress });
  const ethBalance = balanceData ? Number(balanceData.value) / 1e18 : 0;

  // MDT balance read directly from the contract (6 decimals) — always on Sepolia
  const { data: mdtRaw, refetch: refetchMdt } = useReadContract({
    address:  MDT_TOKEN_CONTRACT,
    abi:      MDT_ABI,
    chainId:  CHAIN_ID,
    functionName: "balanceOf",
    args:     wagmiAddress ? [wagmiAddress] : undefined,
    query:    { enabled: !!wagmiAddress, refetchInterval: 30_000 },
  });

  const accountBalance = mdtRaw !== undefined ? Number(formatUnits(mdtRaw, 6)) : 0;

  // Live ETH price from CoinGecko
  const [ethPrice,    setEthPrice]    = useState(0);
  const [walletError, setWalletError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        const res  = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
        );
        const data = await res.json();
        if (!cancelled) setEthPrice(data?.ethereum?.usd ?? 0);
      } catch { /* keep previous */ }
    };
    fetchPrice();
    const id = setInterval(fetchPrice, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const usdBalance = ethBalance * ethPrice;

  function connect() {
    setWalletError(null);
    open({ view: "Connect" });
  }

  function disconnect() {
    wagmiDisconnect();
  }

  return (
    <WalletContext.Provider
      value={{
        address,
        ethBalance,
        usdBalance,
        accountBalance,
        ethPrice,
        connecting:     isConnecting,
        walletError,
        connect,
        disconnect,
        refreshBalance: () => { refetchMdt(); },
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
