"use client";

import { useState } from "react";

// Uses window.ethereum (MetaMask / any injected EIP-1193 provider) for the
// web build. The WalletConnect v2 modal lives in frontend/ (React Native).
export default function ConnectWalletSection() {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setError(null);
    if (typeof window === "undefined" || !("ethereum" in window)) {
      setError("No Web3 wallet detected. Please install MetaMask.");
      return;
    }
    setLoading(true);
    try {
      const accounts = await (
        window.ethereum as { request: (args: { method: string }) => Promise<string[]> }
      ).request({ method: "eth_requestAccounts" });
      setAddress(accounts[0]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Connection rejected.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => setAddress(null);

  return (
    <div className="card">
      <p className="card-step">01</p>
      <h2 className="card-title">Connect Wallet</h2>
      <p className="card-sub">
        Link your EVM wallet via MetaMask (web) or WalletConnect v2 on mobile.
      </p>

      {address && (
        <div className="result-box mb-4">
          <span className="result-label">Connected address</span>
          <span className="mono-text break-all">{address}</span>
        </div>
      )}

      {error && <p className="error-text mb-3">{error}</p>}

      <button
        className={`btn ${address ? "btn-success" : "btn-primary"}`}
        onClick={address ? handleDisconnect : handleConnect}
        disabled={loading}
      >
        {loading ? "Requesting…" : address ? "Disconnect" : "Connect Wallet"}
      </button>
    </div>
  );
}
