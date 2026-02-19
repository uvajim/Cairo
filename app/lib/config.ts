// Shared backend URL.
// Make sure `cd backend && npm start` is running.
export const BACKEND_URL = "http://localhost:3001";

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
