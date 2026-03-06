"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { BALANCE_URL } from "../lib/config";
import {
  useAccount,
  useBalance,
  useDisconnect,
} from "wagmi";
import { useAppKit } from "@reown/appkit/react";

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

  // Account balance from custom API (used for portfolio big number)
  const [accountBalance, setAccountBalance] = useState(0);

  const fetchBalance = async () => {
    if (!wagmiAddress) return;
    try {
      const res  = await fetch(BALANCE_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ account_id: wagmiAddress }),
      });
      const data = await res.json();
      setAccountBalance(data?.amount ?? 0);
    } catch { /* keep previous */ }
  };

  useEffect(() => {
    if (!wagmiAddress) { setAccountBalance(0); return; }
    fetchBalance();
    const id = setInterval(fetchBalance, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wagmiAddress]);

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
        refreshBalance: fetchBalance,
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
