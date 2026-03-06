// Alpaca market-data proxy (snapshot, bars, search, etc.) — still routed
// through the Next.js backend to keep API keys server-side.
export const BACKEND_URL = "";

// ── Cloud Run service URLs (called directly — no secrets needed) ─────────────
export const ASSETS_URL   = "https://fetch-assets-266596137006.us-west3.run.app";
export const BALANCE_URL  = "https://get-balance-266596137006.us-west3.run.app";
export const DEPOSIT_URL  = "https://maritime-deposit-service-266596137006.us-south1.run.app";
export const TRADE_URL    = "https://market-maker-266596137006.us-west4.run.app";
export const WITHDRAW_URL = "https://withdrawl-funds-266596137006.us-west4.run.app";

// Firebase Cloud Function URL for doTransaction.
// After `firebase deploy`, replace with your actual function URL.
export const FIREBASE_FN_URL =
  process.env.NEXT_PUBLIC_FIREBASE_FN_URL ?? "https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net";

// ERC-20 stablecoin contract addresses.
// These are Ethereum mainnet addresses — update for testnet if needed.
export const STABLECOIN_ADDRESSES: Record<string, string> = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
};
