// @walletconnect/react-native-compat MUST be the very first import.
// It installs polyfills for TextEncoder, Buffer, crypto.getRandomValues, and
// the URL class that WalletConnect requires before any of its own code runs.
import '@walletconnect/react-native-compat';

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  WalletConnectModal,
  useWalletConnectModal,
} from '@walletconnect/modal-react-native';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Get a free Project ID at https://cloud.walletconnect.com
const PROJECT_ID = 'YOUR_WALLETCONNECT_PROJECT_ID';

// Metadata shown to wallets during the connection request.
const PROVIDER_METADATA = {
  name: 'Maritime Exchange',
  description: 'Maritime Hybrid Decentralised Exchange',
  url: 'https://maritime.exchange',
  icons: ['https://maritime.exchange/icon.png'],
  redirect: {
    // Must match the `scheme` set in app.json.
    native: 'maritime://',
    universal: 'https://maritime.exchange',
  },
};

// Backend base URL.
// On Android emulator use http://10.0.2.2:3001 instead of localhost.
const BACKEND_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:3001'
    : 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Section 1 — Connect Wallet
//
// useWalletConnectModal() works because <WalletConnectModal> is rendered at
// the root of this component tree below, wiring up the internal state.
// ---------------------------------------------------------------------------
function ConnectWalletSection() {
  const { open, isConnected, address } = useWalletConnectModal();

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>1. Connect Wallet</Text>
      <Text style={styles.cardSubtitle}>
        {isConnected
          ? 'Session active — your wallet is linked.'
          : 'Deep-link MetaMask or Phantom via WalletConnect v2.'}
      </Text>

      {isConnected && address ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Connected address</Text>
          <Text style={styles.monoText}>{address}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={[styles.button, isConnected && styles.buttonSuccess]}
        onPress={open}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {isConnected ? 'Wallet Connected ✓' : 'Connect Wallet'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Deposit USDC
//
// Calls POST /api/generate-wallet on the backend.
// The backend uses ethers.js to derive a random EVM address and returns it
// as the deposit destination for the user's USDC transfer.
// ---------------------------------------------------------------------------
function DepositSection() {
  const [loading, setLoading] = useState(false);
  const [depositAddress, setDepositAddress] = useState(null);

  const handleDeposit = async () => {
    setLoading(true);
    setDepositAddress(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/generate-wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Request failed');
      setDepositAddress(json.address);
    } catch (err) {
      Alert.alert('Deposit Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>2. Deposit 1,000 USDC</Text>
      <Text style={styles.cardSubtitle}>
        Generates a secure EVM deposit address. Send ERC-20 USDC to fund your
        trading account.
      </Text>

      <TouchableOpacity
        style={[styles.button, styles.buttonDeposit]}
        onPress={handleDeposit}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Deposit 1,000 USDC</Text>
        )}
      </TouchableOpacity>

      {depositAddress ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Send USDC to this address</Text>
          <Text style={styles.monoText}>{depositAddress}</Text>
          <Text style={styles.warningText}>
            ⚠️  Only send ERC-20 USDC on Ethereum, Arbitrum, or Base.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Swap for BTC
//
// Calls POST /api/trade on the backend.
// The backend translates this into a Fill-or-Kill market order via the
// Alpaca SDK: { symbol: 'BTC/USD', qty: 0.001, side: 'buy', type: 'market',
//               time_in_force: 'fok' }
// ---------------------------------------------------------------------------
function TradeSection() {
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState(null);

  const handleTrade = async () => {
    setLoading(true);
    setOrder(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: 'BTC/USD',
          amount: 0.001, // qty in BTC
          side: 'buy',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Order rejected');
      setOrder(json.order);
    } catch (err) {
      Alert.alert('Trade Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>3. Swap for BTC</Text>
      <Text style={styles.cardSubtitle}>
        Submits a Fill-or-Kill market buy of 0.001 BTC/USD via Alpaca.
      </Text>

      <TouchableOpacity
        style={[styles.button, styles.buttonTrade]}
        onPress={handleTrade}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Swap for BTC</Text>
        )}
      </TouchableOpacity>

      {order ? (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Order submitted</Text>
          <Text style={styles.monoText}>ID: {order.id}</Text>
          <Text style={styles.monoText}>Status: {order.status}</Text>
          <Text style={styles.monoText}>
            {order.side?.toUpperCase()} {order.qty} {order.symbol}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Root App component
// ---------------------------------------------------------------------------
export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>MARITIME</Text>
          <Text style={styles.appTagline}>Maritime Hybrid Exchange</Text>
        </View>

        {/* Three feature sections */}
        <ConnectWalletSection />
        <DepositSection />
        <TradeSection />
      </ScrollView>

      {/*
        WalletConnectModal must be rendered once at the root.
        It manages its own internal state; useWalletConnectModal() in any
        child component reads from that state.
      */}
      <WalletConnectModal
        projectId={PROJECT_ID}
        providerMetadata={PROVIDER_METADATA}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles — dark maritime theme
// ---------------------------------------------------------------------------
const NAVY = '#0A0E1A';
const CARD = '#111827';
const ACCENT = '#00C2FF';
const GREEN = '#10B981';
const AMBER = '#F59E0B';
const TEXT = '#F1F5F9';
const MUTED = '#94A3B8';
const BORDER = '#1E293B';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: NAVY,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 8,
  },
  appName: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 6,
    color: ACCENT,
  },
  appTagline: {
    fontSize: 13,
    color: MUTED,
    letterSpacing: 2,
    marginTop: 4,
    textTransform: 'uppercase',
  },

  // Cards
  card: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 19,
    marginBottom: 16,
  },

  // Buttons
  button: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonSuccess: {
    backgroundColor: GREEN,
  },
  buttonDeposit: {
    backgroundColor: '#6366F1', // indigo
  },
  buttonTrade: {
    backgroundColor: '#F97316', // orange
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },

  // Result boxes
  resultBox: {
    marginTop: 14,
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  resultLabel: {
    fontSize: 11,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  monoText: {
    fontSize: 12,
    color: ACCENT,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 2,
  },
  warningText: {
    fontSize: 11,
    color: AMBER,
    marginTop: 8,
    lineHeight: 16,
  },
});
