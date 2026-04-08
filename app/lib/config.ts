// Alpaca market-data proxy (snapshot, bars, search, etc.) — still routed
// through the Next.js backend to keep API keys server-side.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "https://cairo-backend-production-67f8.up.railway.app";

// Maritime Stack backend — trade offers, balances, ticker info.
export const MARITIME_API_URL = process.env.NEXT_PUBLIC_MARITIME_API_URL ?? "https://cairo-backend-production-67f8.up.railway.app";
export const PORTFOLIO_BALANCE_API_URL = `${MARITIME_API_URL}/api/portfolio-balance`;

// ── Railway backend routes ────────────────────────────────────────────────────
export const ASSETS_URL    = `${BACKEND_URL}/api/holdings`;
export const BALANCE_URL   = `${BACKEND_URL}/api/account`;
export const ACTIVITY_URL  = `${BACKEND_URL}/api/activity`;

// ── Still on Cloud Run ────────────────────────────────────────────────────────
export const DEPOSIT_URL  = "https://maritime-deposit-service-266596137006.us-south1.run.app";
export const WITHDRAW_URL = "https://withdrawl-funds-266596137006.us-west4.run.app";

// ── Trade execution is handled by TradeExecutor (see TRADE_EXECUTOR_ADDRESS below)

// ── TradeExecutor contract (Sepolia testnet) ──────────────────────────────────
// User submits signed trade params here and pays gas.
export const TRADE_EXECUTOR_ADDRESS =
  (process.env.NEXT_PUBLIC_TRADE_EXECUTOR_ADDRESS ?? "0xfBB81aD3638708d1FA43Be0E4891EC434a85908C") as `0x${string}`;

export const TRADE_EXECUTOR_ABI = [
  {
    name: "executeBuy",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p", type: "tuple",
        components: [
          { name: "user",    type: "address" },
          { name: "ticker",  type: "string"  },
          { name: "shares",  type: "uint256" },
          { name: "mdtCost", type: "uint256" },
          { name: "nonce",   type: "uint256" },
          { name: "expiry",  type: "uint256" },
        ],
      },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "executeSell",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p", type: "tuple",
        components: [
          { name: "user",      type: "address" },
          { name: "ticker",    type: "string"  },
          { name: "shares",    type: "uint256" },
          { name: "mdtPayout", type: "uint256" },
          { name: "nonce",     type: "uint256" },
          { name: "expiry",    type: "uint256" },
        ],
      },
      { name: "sig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    name: "nonces",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

// ── EquityVault ERC-20 factory contract (Sepolia testnet) ─────────────────────
// Deploys a ShareToken ERC-20 per ticker on first mint.
// Canonical source of truth for all equity share balances.
export const EQUITY_VAULT_ADDRESS =
  (process.env.NEXT_PUBLIC_EQUITY_VAULT_ADDRESS ?? "0x28936C93D9cFbC22b9B4F438216A886f4844426a") as `0x${string}`;

// MDT token contract — separate from the DepositGateway (MaritimeDeposit).
export const MDT_TOKEN_CONTRACT =
  (process.env.NEXT_PUBLIC_MDT_TOKEN_CONTRACT ?? process.env.NEXT_PUBLIC_MOCK_MDT_CONTRACT) as `0x${string}`;

// ERC-20 stablecoin contract addresses (Ethereum mainnet).
export const STABLECOIN_ADDRESSES: Record<string, string> = {
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
};

// ── MaritimeDeposit contract (Sepolia testnet) ────────────────────────────────
// The contract address is also the MDT token address (no separate token contract).
// Set NEXT_PUBLIC_MARITIME_DEPOSIT_CONTRACT in your .env.local after deploying.
export const MARITIME_DEPOSIT_CONTRACT =
  process.env.NEXT_PUBLIC_MARITIME_DEPOSIT_CONTRACT as `0x${string}`;

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);

const EXPLORER_ROOTS: Record<number, string> = {
  1:        'https://etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
  8453:     'https://basescan.org',
  84532:    'https://sepolia.basescan.org',
};
export const EXPLORER_URL = EXPLORER_ROOTS[CHAIN_ID] ?? 'https://etherscan.io';

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


// ── EquityVault ABI ───────────────────────────────────────────────────────────
export const EQUITY_VAULT_ABI = [
  {
    name: "balanceOfTicker",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "ticker",  type: "string"  },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    // Returns the ERC-20 ShareToken address for a ticker (address(0) if never minted)
    name: "tokenForTicker",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "ticker", type: "string" }],
    outputs: [{ type: "address" }],
  },
  {
    // Returns the ticker string at index i in the allTickers array
    name: "allTickers",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ type: "string" }],
  },
  {
    // Total number of distinct tickers ever minted
    name: "tickerCount",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "frozen",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    name: "SharesMinted",
    type: "event",
    inputs: [
      { name: "to",     type: "address", indexed: true  },
      { name: "ticker", type: "string",  indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "token",  type: "address", indexed: false },
    ],
  },
  {
    name: "SharesBurned",
    type: "event",
    inputs: [
      { name: "from",   type: "address", indexed: true  },
      { name: "ticker", type: "string",  indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "token",  type: "address", indexed: false },
    ],
  },
] as const;

// ── EIP-712 DepositIntent (shared by all deposit UI + backend verification) ───
export const DEPOSIT_INTENT_DOMAIN = {
  name:              "Cairo",
  version:           "1",
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
  // Deposit / withdrawal errors
  UnsupportedToken:         "Only USDC and USDT are supported.",
  BelowMinimum:             "Amount is below the minimum deposit.",
  InsufficientVaultBalance: "Vault balance too low. Try again later.",
  InsufficientAllowance:    "Approve the contract to spend your tokens first.",
  TransferFailed:           "Token transfer failed.",
  // Trade errors (TradeExecutor)
  CallerNotUser:            "Connected wallet does not match the requested address.",
  InvalidBackendSignature:  "Offer is invalid — request a new one.",
  PriceReportStale:         "Offer expired before submission — request a new one.",
  PriceOutOfTolerance:      "Offer is inconsistent — request a new one.",
  InvalidNonce:             "Another trade landed first — request a new one.",
  OfferExpired:             "Offer timed out — request a new one.",
  // Shared errors
  InsufficientBalance:      "Not enough MDT — deposit more stablecoins first.",
  AccountFrozen:            "This account is restricted.",
};
