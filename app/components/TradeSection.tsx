"use client";

import { useState } from "react";

interface TradeOrder {
  id: string;
  status: string;
  symbol: string;
  qty: string;
  side: string;
}

// Calls POST /api/trade on the Express backend.
// The backend submits a Fill-or-Kill (FOK) market buy of 0.001 BTC/USD
// via the Alpaca SDK: { type: 'market', time_in_force: 'fok' }.
export default function TradeSection() {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<TradeOrder | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTrade = async () => {
    setLoading(true);
    setError(null);
    setOrder(null);
    try {
      const res = await fetch(`/api/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: "BTC/USD", amount: 0.001, side: "buy" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Order rejected");
      setOrder(json.order);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <p className="card-step">03</p>
      <h2 className="card-title">Swap for BTC</h2>
      <p className="card-sub">
        Submits a Fill-or-Kill market buy of 0.001 BTC/USD via Alpaca. The
        order executes fully or is cancelled immediately — no partial fills.
      </p>

      <button
        className="btn btn-orange"
        onClick={handleTrade}
        disabled={loading}
      >
        {loading ? "Submitting…" : "Swap for BTC"}
      </button>

      {error && <p className="error-text mt-3">{error}</p>}

      {order && (
        <div className="result-box mt-4">
          <span className="result-label">Order Created</span>
          <span className="mono-text">ID: {order.id}</span>
          <span className="mono-text">Status: {order.status}</span>
          <span className="mono-text">
            {order.side?.toUpperCase()} {order.qty} {order.symbol}
          </span>
        </div>
      )}
    </div>
  );
}
