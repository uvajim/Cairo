"use client";

import { useState } from "react";

interface DepositResult {
  address: string;
}

// Calls POST /api/generate-wallet on the Express backend.
// ethers.js derives a random EVM wallet server-side and returns the address
// as the funding destination for the user's USDC transfer.
export default function DepositSection() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DepositResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeposit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/generate-wallet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setResult(json);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <p className="card-step">02</p>
      <h2 className="card-title">Deposit 1,000 USDC</h2>
      <p className="card-sub">
        Generates a secure EVM deposit address. Send ERC-20 USDC on Ethereum,
        Arbitrum, or Base to fund your trading account.
      </p>

      <button
        className="btn btn-indigo"
        onClick={handleDeposit}
        disabled={loading}
      >
        {loading ? "Generating…" : "Deposit 1,000 USDC"}
      </button>

      {error && <p className="error-text mt-3">{error}</p>}

      {result && (
        <div className="result-box mt-4">
          <span className="result-label">Send USDC to this address</span>
          <span className="mono-text break-all">{result.address}</span>
          <span className="warning-text mt-2 block">
            ⚠ Only send ERC-20 USDC. Do not send ETH or other tokens.
          </span>
        </div>
      )}
    </div>
  );
}
