// Alpaca market-data proxy (snapshot, bars, search, etc.) — still routed
// through the Next.js backend to keep API keys server-side.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://cairo-backend-production-67f8.up.railway.app";

// ── Railway backend routes ────────────────────────────────────────────────────
export const ASSETS_URL    = `${BACKEND_URL}/api/holdings`;
export const BALANCE_URL   = `${BACKEND_URL}/api/account`;
export const ACTIVITY_URL  = `${BACKEND_URL}/api/activity`;

// ── Still on Cloud Run ────────────────────────────────────────────────────────
export const DEPOSIT_URL  = "https://maritime-deposit-service-266596137006.us-south1.run.app";
export const TRADE_URL    = "https://market-maker-266596137006.us-west4.run.app";
export const WITHDRAW_URL = "https://withdrawl-funds-266596137006.us-west4.run.app";

// ERC-20 stablecoin contract addresses (Ethereum mainnet).
export const STABLECOIN_ADDRESSES: Record<string, string> = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
};

// ── MaritimeDeposit contract (Sepolia testnet) ────────────────────────────────
// The contract address is also the MDT token address (no separate token contract).
// Set NEXT_PUBLIC_MARITIME_DEPOSIT_CONTRACT in your .env.local after deploying.
export const MARITIME_DEPOSIT_CONTRACT =
  (process.env.NEXT_PUBLIC_MARITIME_DEPOSIT_CONTRACT ??
   "0x8B8D2db1b4b234fe3EDD4704159Bd798944957b5") as `0x${string}`;

export const SEPOLIA_STABLECOINS: Record<string, `0x${string}`> = {
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  USDT: "0x7169D38820dfd117C3FA1f22a697dBA58d90BA06",
};

// Minimal ERC-20 ABI (approve + allowance)
export const ERC20_APPROVE_ABI = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value",   type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

// MaritimeDeposit ABI — withdraw(address token, uint256 amount)
// MDT moves to the contract (not burned). No approve step needed.
export const MARITIME_WITHDRAW_ABI = [
  {
    name: "withdraw",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token",  type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "vaultBalance",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// MaritimeDeposit ABI — deposit(address token, uint256 amount, bytes32 userId)
export const MARITIME_DEPOSIT_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token",  type: "address" },
      { name: "amount", type: "uint256" },
      { name: "userId", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

// ── EIP-712 DepositIntent (shared by all deposit UI + backend verification) ───
export const DEPOSIT_INTENT_DOMAIN = {
  name:              "Cairo",
  version:           "1",
  chainId:           11155111n,
  verifyingContract: MARITIME_DEPOSIT_CONTRACT,
} as const;

export const DEPOSIT_INTENT_TYPES = {
  DepositIntent: [
    { name: "walletAddress", type: "address" },
    { name: "amount",        type: "string"  },
    { name: "timestamp",     type: "uint256" },
  ],
} as const;

// Friendly messages for contract revert names
export const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  UnsupportedToken:         "Only USDC and USDT are supported.",
  BelowMinimum:             "Amount is below the minimum deposit.",
  InsufficientVaultBalance: "Vault balance too low. Try again later.",
  InsufficientBalance:      "Insufficient MDT balance.",
  InsufficientAllowance:    "Approve the contract to spend your tokens first.",
  TransferFailed:           "Token transfer failed.",
};
