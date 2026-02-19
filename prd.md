# Product Requirements Document: Maritime Exchange (Dhow)

## 1. Product Overview & Vision
The goal is to build a hybrid, highly performant decentralized exchange interface. It combines the non-custodial, permissionless UX of a Uniswap-style automated market maker with the deep liquidity, fiat-bridging, and multi-asset capabilities of a centralized brokerage.

Users will connect their self-custody wallets, deposit EVM/SPL stablecoins, and seamlessly execute trades across crypto assets using real-time market data powered by Alpaca.

---

## 2. Core Architecture Stack
To ensure maximum portability and maintain a container-first approach, the infrastructure strictly utilizes Dockerized deployments and open-source standards.

* **Frontend:** React Native (iOS/Android).
* **Web3 Bridge:** WalletConnect v2 (AppKit).
* **Backend Compute:** Google Cloud Platform (GCP) - Cloud Run & Compute Engine.
* **Brokerage/Liquidity SDK:** `@alpacahq/alpaca-trade-api` (Node.js).
* **Database:** PostgreSQL (Google Cloud SQL) & Redis (Memorystore).

---

## 3. Feature Specifications

### 3.1 Web3 Wallet Integration (WalletConnect v2)
The frontend natively supports deep-linking to external self-custody wallets (MetaMask, Phantom) without requiring users to import private keys.

* **Framework:** `@walletconnect/modal-react-native`.
* **Chain Support:** * EVM (Ethereum Mainnet, Arbitrum, Base) for ERC-20 stablecoins.
    * Solana (Mainnet-Beta) for SPL stablecoins.
* **Requirements:** * Implement `@walletconnect/react-native-compat` for necessary React Native polyfills (crypto, text-encoding).
    * Global session state management to persist connections across app restarts.
    * EIP-1193 standard provider interface for signing messages and submitting funding transactions.

### 3.2 Alpaca Integration (`@alpacahq/alpaca-trade-api`)
The Node.js backend on GCP will utilize the official Alpaca SDK as the primary execution and data routing engine. The SDK will be initialized securely using environment variables (`APCA_API_KEY_ID`, `APCA_API_SECRET_KEY`) pulled from Google Secret Manager.

* **Real-Time Market Data (WebSockets):** * The GCP backend will establish a persistent connection using `alpaca.crypto_stream_v2`.
    * Subscribe to live ticks using `websocket.subscribeForTrades(['BTC/USD', 'ETH/USD'])` and `websocket.subscribeForBars()`.
    * These events will be piped from the backend to the React Native frontend via a dedicated WebSocket to power the live charting UI.
* **Historical Data (REST):**
    * On initial app load, the backend will call `alpaca.getCryptoBars()` to fetch historical candlestick data and hydrate the charts before the live stream takes over.
* **Trade Execution:**
    * User swap requests from the frontend will hit a Cloud Run endpoint, which translates the request into an `alpaca.createOrder()` execution.
    * **Parameters:** Support for `{ symbol: 'BTC/USD', qty: amount, side: 'buy', type: 'market', time