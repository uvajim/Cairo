"use client";

import { useState } from 'react';

interface Props {
  ticker:      string;
  shares:      number;
  price:       number;
  billTotal:   number;
  currency:    string;
  onConfirm:   () => void;
  onClose:     () => void;
}

const WALLETS = [
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: (
      <svg viewBox="0 0 35 33" className="w-7 h-7">
        <g fillRule="nonzero">
          <polygon fill="#E17726" points="32.9 1 19.6 10.7 22 4.6"/>
          <polygon fill="#E27625" points="2.1 1 15.3 10.8 13 4.6"/>
          <polygon fill="#E27625" points="28.1 23.5 24.4 29.1 32.2 31.3 34.5 23.6"/>
          <polygon fill="#E27625" points="0.5 23.6 2.8 31.3 10.6 29.1 6.9 23.5"/>
          <polygon fill="#E27625" points="10.2 14.3 7.9 17.8 15.6 18.2 15.4 9.9"/>
          <polygon fill="#E27625" points="24.8 14.3 19.5 9.8 19.4 18.2 27.1 17.8"/>
          <polygon fill="#E27625" points="10.6 29.1 15.2 26.8 11.2 23.7"/>
          <polygon fill="#E27625" points="19.8 26.8 24.4 29.1 23.8 23.7"/>
          <polygon fill="#D5BFB2" points="24.4 29.1 19.8 26.8 20.2 30 20.1 31.2"/>
          <polygon fill="#D5BFB2" points="10.6 29.1 14.9 31.2 14.8 30 15.2 26.8"/>
          <polygon fill="#233447" points="15 21.3 11.1 20.2 13.8 19 "/>
          <polygon fill="#233447" points="20 21.3 21.2 19 23.9 20.2"/>
          <polygon fill="#CC6228" points="10.6 29.1 11.3 23.5 6.9 23.6"/>
          <polygon fill="#CC6228" points="23.7 23.5 24.4 29.1 28.1 23.6"/>
          <polygon fill="#CC6228" points="27.1 17.8 19.4 18.2 20 21.3 21.2 19 23.9 20.2"/>
          <polygon fill="#CC6228" points="11.1 20.2 13.8 19 15 21.3 7.9 17.8"/>
          <polygon fill="#E27525" points="7.9 17.8 11.2 23.7 11.1 20.2"/>
          <polygon fill="#E27525" points="23.9 20.2 23.8 23.7 27.1 17.8"/>
          <polygon fill="#E27525" points="19.4 18.2 19.8 26.8 20.1 21.8 "/>
          <polygon fill="#E27525" points="15.6 18.2 15 21.8 15.2 26.8"/>
          <polygon fill="#F5841F" points="15.2 26.8 19.8 26.8 19.4 18.2 15.6 18.2"/>
        </g>
      </svg>
    ),
  },
  {
    id: 'exodus',
    name: 'Exodus',
    icon: (
      <svg viewBox="0 0 40 40" className="w-7 h-7">
        <defs>
          <linearGradient id="exG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0B46F9"/>
            <stop offset="100%" stopColor="#BBFBE0"/>
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="10" fill="url(#exG)"/>
        <path d="M20 8l10 6v6l-10 6-10-6v-6z" fill="white" fillOpacity=".9"/>
        <path d="M20 22v10l-10-6v-6z" fill="white" fillOpacity=".5"/>
        <path d="M20 22v10l10-6v-6z" fill="white" fillOpacity=".7"/>
      </svg>
    ),
  },
  {
    id: 'uniswap',
    name: 'Uniswap Wallet',
    icon: (
      <svg viewBox="0 0 40 40" className="w-7 h-7">
        <rect width="40" height="40" rx="10" fill="#FF007A"/>
        <text x="20" y="27" textAnchor="middle" fontSize="20" fill="white">🦄</text>
      </svg>
    ),
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    icon: (
      <svg viewBox="0 0 40 40" className="w-7 h-7">
        <rect width="40" height="40" rx="10" fill="#0052FF"/>
        <rect x="11" y="11" width="18" height="18" rx="9" fill="white"/>
        <rect x="15" y="17" width="10" height="6" rx="1" fill="#0052FF"/>
      </svg>
    ),
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    icon: (
      <svg viewBox="0 0 40 40" className="w-7 h-7">
        <rect width="40" height="40" rx="10" fill="#3375BB"/>
        <path d="M20 8c0 0 10 3.5 10 11.5 0 6.5-4.5 12-10 13C14.5 31.5 10 26 10 19.5 10 11.5 20 8 20 8z" fill="white"/>
      </svg>
    ),
  },
];

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// fake deposit address for demo
const DEMO_ADDRESS = '0x742d35Cc6634C0532925a3b8D4C9B7E3f1a2b3c4';

export function WalletConfirmModal({ ticker, shares, price, billTotal, currency, onConfirm, onClose }: Props) {
  const [step, setStep] = useState<'select' | 'confirm'>('select');
  const [selectedWallet, setSelectedWallet] = useState<string>('');
  const gas = (1.8 + (billTotal % 7) * 0.11).toFixed(2);

  function selectWallet(id: string, name: string) {
    setSelectedWallet(name);
    setStep('confirm');
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-sm bg-[#141414] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >

        {/* ── STEP 1 : Wallet selection ── */}
        {step === 'select' && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#3B99FC] flex items-center justify-center">
                  <svg viewBox="0 0 40 25" fill="white" className="w-5 h-3">
                    <path d="M8.19 4.78C14.72-1.59 25.28-1.59 31.81 4.78l.76.74a.78.78 0 010 1.12l-2.6 2.53a.41.41 0 01-.57 0l-1.05-1.02c-4.5-4.38-11.8-4.38-16.3 0L10.8 9.2a.41.41 0 01-.57 0L7.63 6.67a.78.78 0 010-1.12l.56-.77zm14.7 13.72l-2.35 2.29a.41.41 0 01-.58 0L13.7 14.6a.2.2 0 00-.28 0l-6.26 6.19a.41.41 0 01-.57 0l-2.6-2.53a.78.78 0 010-1.12L10.25 11a.41.41 0 01.57 0l6.26 6.19a.2.2 0 00.28 0l6.26-6.19a.41.41 0 01.57 0l6.26 6.12a.78.78 0 010 1.12l-2.6 2.53a.41.41 0 01-.57 0l-6.26-6.19a.2.2 0 00-.27.02z"/>
                  </svg>
                </div>
                <span className="text-sm font-semibold text-white">Connect Wallet</span>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:bg-white/20 transition-colors"
              >
                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* Subtitle */}
            <div className="px-5 py-3 border-b border-white/8">
              <p className="text-xs text-gray-400">
                Choose your wallet to sign the transaction for{' '}
                <span className="font-semibold text-white">{shares} {ticker}</span>
              </p>
            </div>

            {/* Wallet list */}
            <div className="px-3 py-3 space-y-1">
              {WALLETS.map(w => (
                <button
                  key={w.id}
                  onClick={() => selectWallet(w.id, w.name)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-white/8 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                    {w.icon}
                  </div>
                  <span className="text-sm font-semibold text-white">{w.name}</span>
                  <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-gray-600 ml-auto">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>

            <div className="px-5 pb-5 pt-2">
              <p className="text-center text-[10px] text-gray-600">
                By connecting you agree to the{' '}
                <span className="text-gray-400 underline cursor-pointer">Terms of Service</span>
              </p>
            </div>
          </>
        )}

        {/* ── STEP 2 : Transaction confirmation ── */}
        {step === 'confirm' && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/8">
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setStep('select')}
                  className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:bg-white/20 transition-colors"
                >
                  <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                    <path d="M8 1L3 6l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <div>
                  <p className="text-[10px] text-gray-500 leading-none mb-0.5">{selectedWallet}</p>
                  <p className="text-sm font-semibold text-white leading-none">Transaction Request</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:bg-white/20 transition-colors"
              >
                <svg viewBox="0 0 12 12" fill="none" className="w-3 h-3">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            {/* App identity */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00c805] to-[#00a004] flex items-center justify-center text-black font-bold text-lg shrink-0">
                D
              </div>
              <div>
                <p className="text-sm font-semibold text-white">maritime.app</p>
                <p className="text-xs text-gray-400">wants to make a transaction</p>
              </div>
              <div className="ml-auto flex items-center gap-1 bg-green-500/10 border border-green-500/20 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                <span className="text-[10px] text-green-400 font-medium">Verified</span>
              </div>
            </div>

            {/* Transfer details */}
            <div className="px-5 py-4 space-y-3">
              <div className="bg-white/5 rounded-2xl p-4">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-3">Transfer</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#2775CA] flex items-center justify-center text-white font-bold text-sm shrink-0">
                    {currency === 'USDT' ? '₮' : '$'}
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">
                      {billTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      <span className="text-sm font-semibold text-gray-400 ml-1.5">{currency}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {shares} {ticker} @ ${price.toFixed(2)}/share
                    </p>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-white/8 flex items-center gap-2">
                  <span className="text-xs text-gray-500">To</span>
                  <span className="text-xs font-mono text-gray-300 ml-auto">{shortAddr(DEMO_ADDRESS)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 mb-1">Network</p>
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-[#627EEA] shrink-0" />
                    <span className="text-sm font-semibold text-white">Ethereum</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 mb-1">Network fee</p>
                  <p className="text-sm font-semibold text-white">~${gas}</p>
                </div>
              </div>

              <div className="bg-white/3 border border-white/6 rounded-xl px-3 py-2.5 flex items-start gap-2">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-gray-600 mt-0.5 shrink-0">
                  <path fillRule="evenodd" d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 3.5a.75.75 0 011.5 0v4a.75.75 0 01-1.5 0v-4zm.75 7a.875.875 0 100-1.75.875.875 0 000 1.75z"/>
                </svg>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  <span className="font-mono">transfer(address,uint256)</span> — ERC-20 token transfer to the Maritime liquidity vault.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 px-5 pb-6 pt-2">
              <button
                onClick={onClose}
                className="py-3.5 rounded-2xl bg-white/8 hover:bg-white/12 text-white font-semibold text-sm transition-colors"
              >
                Reject
              </button>
              <button
                onClick={onConfirm}
                className="py-3.5 rounded-2xl bg-[#3B99FC] hover:bg-[#2d88eb] text-white font-semibold text-sm transition-colors"
              >
                Confirm
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
