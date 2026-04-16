"use client";

import { useState, useEffect } from "react";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Building2,
  ArrowUpFromLine,
  ArrowLeftRight,
  Copy,
  Check,
  UserCircle,
  Wallet,
  WalletCards,
  ChevronDown,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  email:      string;
  name:       string;
  customerId: string | null;
}

interface ExternalAccount {
  id:           string;
  account_name: string;
  bank_name:    string;
  last_4:       string;
  status:       string;
}

type LoginStep = "email" | "password";
type View      = "login" | "register";

// ── Shared input style ────────────────────────────────────────────────────────

const input = (error = false) =>
  `w-full surface-2 border rounded-xl px-4 py-3 app-fg text-sm placeholder:text-muted outline-none transition-colors ${
    error ? "border-[#ff5000]" : "border-default focus:border-white/30"
  }`;

// ── Banking dashboard ─────────────────────────────────────────────────────────
// ── Banking home (tile grid) ──────────────────────────────────────────────────

const HOME_TILES = [
  { icon: UserCircle,      label: "Account",    desc: "Manage your wallets",              key: "account"    },
  { icon: ArrowUpFromLine, label: "Withdraw",   desc: "Move funds to fiat",               key: "withdraw"   },
  { icon: Wallet,          label: "Balances",   desc: "View your token balances",         key: "balances"   },
  { icon: WalletCards,     label: "Debit Card", desc: "Use stablecoins to create a card", key: "debit_card" },
];

function BankingHome({ user, onLogout, onNavigate }: { user: User; onLogout: () => void; onNavigate: (key: string) => void }) {
  return (
    <div className="min-h-screen app-bg app-fg font-sans flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <div className="flex flex-col items-center mb-12">
          <img src="/maritime.png" alt="Maritime" className="w-14 h-14 object-contain mb-4" />
          <h1 className="text-2xl font-bold tracking-tight">Banking</h1>
          {user.name && <p className="text-sm text-muted mt-1">Welcome back, {user.name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4 mb-10">
          {HOME_TILES.map(({ icon: Icon, label, desc, key }) => (
            <button
              key={key}
              onClick={() => onNavigate(key)}
              className="flex flex-col items-center gap-3 p-6 surface-2 border border-default rounded-2xl hover-surface transition-colors text-center group"
            >
              <div className="w-12 h-12 rounded-xl surface-3 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted mt-0.5 leading-snug">{desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="text-center">
          <button onClick={onLogout} className="text-xs text-muted hover:text-white transition-colors">
            Sign out of {user.email}
          </button>
        </div>
      </div>
    </div>
  );
}


function Shell({ email, onLogout, onBack, title, children }: { email: string; onLogout: () => void; onBack?: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen app-bg app-fg font-sans px-6 py-12">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            {onBack && (
              <button onClick={onBack} className="p-1.5 -ml-1.5 rounded-lg hover-surface transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <img src="/maritime.png" alt="Maritime" className="w-8 h-8 object-contain" />
            <span className="text-base font-bold tracking-tight">{title}</span>
          </div>
          <button onClick={onLogout} className="text-xs text-muted hover:text-white transition-colors">
            Sign out
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Add account form ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  firstName: "", lastName: "", bankName: "", accountName: "",
  routingNumber: "", accountNumber: "", checkingOrSavings: "checking",
  street: "", city: "", state: "", postalCode: "",
};

function AddAccountForm({
  customerId,
  onSuccess,
  onCancel,
  showCancel,
}: {
  customerId: string;
  onSuccess:  (account: ExternalAccount) => void;
  onCancel?:  () => void;
  showCancel: boolean;
}) {
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/bridge/external-accounts", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ ...form, customerId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? data?.message ?? "Failed to add account");
      } else {
        onSuccess(data);
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {showCancel && onCancel && (
        <button type="button" onClick={onCancel}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to accounts
        </button>
      )}

      {/* Personal */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Personal info</p>
        <div className="grid grid-cols-2 gap-3">
          <input placeholder="First name" value={form.firstName} onChange={set("firstName")} required className={input()} />
          <input placeholder="Last name"  value={form.lastName}  onChange={set("lastName")}  required className={input()} />
        </div>
      </div>

      {/* Bank */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Bank details</p>
        <div className="space-y-3">
          <input placeholder="Bank name (e.g. Chase)"    value={form.bankName}    onChange={set("bankName")}    required className={input()} />
          <input placeholder="Account label (e.g. My Checking)" value={form.accountName} onChange={set("accountName")} required className={input()} />
          <select value={form.checkingOrSavings} onChange={set("checkingOrSavings")}
            className="w-full surface-2 border border-default rounded-xl px-4 py-3 app-fg text-sm outline-none transition-colors focus:border-white/30"
          >
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </select>
        </div>
      </div>

      {/* Account numbers */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Account numbers</p>
        <div className="space-y-3">
          <input placeholder="Routing number (9 digits)" value={form.routingNumber} onChange={set("routingNumber")} required pattern="\d{9}" className={input()} />
          <input placeholder="Account number"            value={form.accountNumber} onChange={set("accountNumber")} required className={input()} />
        </div>
      </div>

      {/* Address */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Billing address</p>
        <div className="space-y-3">
          <input placeholder="Street address" value={form.street}     onChange={set("street")}     required className={input()} />
          <input placeholder="City"           value={form.city}       onChange={set("city")}       required className={input()} />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="State (e.g. NY)" value={form.state}      onChange={set("state")}      required className={input()} />
            <input placeholder="ZIP code"         value={form.postalCode} onChange={set("postalCode")} required className={input()} />
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-[#ff5000] text-center">{error}</p>}

      <button type="submit" disabled={loading}
        className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Save account
      </button>
    </form>
  );
}

// ── Withdraw form ─────────────────────────────────────────────────────────────

interface TransferResult {
  id:                        string;
  state:                     string;
  source_deposit_instructions: {
    payment_rail: string;
    amount:       string;
    currency:     string;
    to_address:   string;
    from_address?: string;
  };
}

const CHAINS = [
  { value: "ethereum", label: "Ethereum" },
  { value: "solana",   label: "Solana"   },
];

const CURRENCIES = [
  { value: "usdc",  label: "USDC"  },
  { value: "usdt",  label: "USDT"  },
  { value: "pyusd", label: "PYUSD" },
  { value: "dai",   label: "DAI"   },
  { value: "eurc",  label: "EURC"  },
];

const RAILS = [
  { value: "ach_push", label: "ACH",  desc: "1–3 business days" },
  { value: "wire",     label: "Wire", desc: "Same day"          },
];

type SourceMode = "wallet" | "external";

function WithdrawForm({
  accounts,
  customerId,
  onBack,
  onSuccess,
  onAddAccount,
}: {
  accounts:     ExternalAccount[];
  customerId:   string | null;
  onBack:       () => void;
  onSuccess:    (result: TransferResult) => void;
  onAddAccount: () => void;
}) {
  const [sourceMode,     setSourceMode]     = useState<SourceMode>("wallet");
  const [selectedId,     setSelectedId]     = useState<string>(accounts[0]?.id ?? "");
  const [amount,         setAmount]         = useState("");
  const [rail,           setRail]           = useState("ach_push");
  const [error,          setError]          = useState("");
  const [loading,        setLoading]        = useState(false);

  // wallet-source state
  const [wallets,        setWallets]        = useState<BridgeWallet[]>([]);
  const [walletsReady,   setWalletsReady]   = useState(false);
  const [selectedBal,    setSelectedBal]    = useState<SelectedBalance | null>(null);

  // external-source state
  const [chain,          setChain]          = useState("ethereum");
  const [currency,       setCurrency]       = useState("usdc");
  const [fromAddress,    setFromAddress]    = useState("");
  const [anyFromAddress, setAnyFromAddress] = useState(true);

  useEffect(() => {
    if (!customerId) return;
    loadWalletsWithBalances(customerId)
      .then(setWallets)
      .finally(() => setWalletsReady(true));
  }, [customerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId) { setError("Please select a destination account"); return; }
    setError("");
    setLoading(true);
    try {
      let body: Record<string, unknown>;
      if (sourceMode === "wallet") {
        if (!selectedBal) { setError("Select a token from your wallets"); setLoading(false); return; }
        body = {
          amount,
          customerId:        customerId ?? "",
          walletId:          selectedBal.walletId,
          walletCurrency:    selectedBal.currency,
          externalAccountId: selectedId,
          destinationRail:   rail,
        };
      } else {
        if (!anyFromAddress && !fromAddress) { setError("Enter your wallet address or enable any-address mode"); setLoading(false); return; }
        body = {
          amount,
          customerId:          customerId ?? "",
          sourceChain:         chain,
          sourceCurrency:      currency,
          fromAddress:         anyFromAddress ? undefined : fromAddress,
          allowAnyFromAddress: anyFromAddress,
          externalAccountId:   selectedId,
          destinationRail:     rail,
        };
      }
      const res = await fetch("/api/bridge/transfers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.message ?? data?.error ?? "Transfer failed"); }
      else         { onSuccess(data as TransferResult); }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  const selectCls = "w-full surface-2 border border-default rounded-xl px-4 py-3 app-fg text-sm outline-none transition-colors focus:border-white/30 app-bg";

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <div className="flex flex-col items-center justify-center py-12 text-center border border-default rounded-2xl">
          <Building2 className="w-8 h-8 text-muted mb-3" strokeWidth={1.5} />
          <p className="text-sm font-semibold mb-1">No bank account linked</p>
          <p className="text-xs text-muted mb-5 max-w-xs">Link a bank account to start withdrawing funds.</p>
          <button onClick={onAddAccount}
            className="flex items-center gap-2 bg-white text-black text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-gray-200 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add bank account
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Source toggle */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Source</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            { key: "wallet",   label: "My Bridge wallets", desc: "Use stablecoin balance" },
            { key: "external", label: "External wallet",   desc: "Send crypto to Bridge"  },
          ] as { key: SourceMode; label: string; desc: string }[]).map(opt => (
            <button key={opt.key} type="button" onClick={() => setSourceMode(opt.key)}
              className={`flex flex-col items-start p-3 rounded-2xl border transition-colors text-left ${
                sourceMode === opt.key ? "border-white/40 surface-3" : "border-default surface-2 hover-surface"
              }`}
            >
              <p className="text-xs font-semibold">{opt.label}</p>
              <p className="text-[10px] text-muted mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Wallet source */}
      {sourceMode === "wallet" && (
        <div>
          <p className="text-xs text-muted uppercase tracking-widest mb-3">From wallet</p>
          {!walletsReady ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-muted" />
            </div>
          ) : (
            <WalletBalanceDropdown wallets={wallets} selected={selectedBal} onSelect={setSelectedBal} />
          )}
        </div>
      )}

      {/* External source */}
      {sourceMode === "external" && (
        <div>
          <p className="text-xs text-muted uppercase tracking-widest mb-3">Source crypto</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select value={chain} onChange={e => setChain(e.target.value)} className={selectCls}>
              {CHAINS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectCls}>
              {CURRENCIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div onClick={() => setAnyFromAddress(p => !p)}
              className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${anyFromAddress ? "bg-white" : "bg-white/20"}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${anyFromAddress ? "translate-x-4" : "translate-x-0.5"}`} />
            </div>
            <span className="text-xs text-muted">Accept from any wallet address</span>
          </label>
          {!anyFromAddress && (
            <input
              placeholder={chain === "solana" ? "Your Solana address" : "Your Ethereum address (0x…)"}
              value={fromAddress} onChange={e => setFromAddress(e.target.value)}
              className={`${input()} mt-3`}
            />
          )}
        </div>
      )}

      {/* Amount */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Amount (USD)</p>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
          <input type="number" min="0.01" step="0.01" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)} required
            className={`${input()} pl-8`}
          />
        </div>
      </div>

      {/* Destination bank */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Destination account</p>
        <div className="space-y-2">
          {accounts.map(account => (
            <div key={account.id} onClick={() => setSelectedId(account.id)}
              className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer transition-colors ${
                selectedId === account.id ? "border-white/40 surface-3" : "border-default surface-2 hover-surface"
              }`}
            >
              <div className="w-9 h-9 rounded-xl surface-3 flex items-center justify-center shrink-0">
                <Building2 className="w-4 h-4 text-muted" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{account.bank_name} ···{account.last_4}</p>
                <p className="text-xs text-muted">{account.account_name}</p>
              </div>
              <div className={`w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${
                selectedId === account.id ? "border-white bg-white" : "border-white/20"
              }`} />
            </div>
          ))}
          <button type="button" onClick={onAddAccount}
            className="flex items-center gap-2 text-xs text-muted hover:text-white transition-colors pt-1 pl-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add another account
          </button>
        </div>
      </div>

      {/* Delivery method */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Delivery method</p>
        <div className="grid grid-cols-2 gap-3">
          {RAILS.map(r => (
            <button key={r.value} type="button" onClick={() => setRail(r.value)}
              className={`flex flex-col items-start p-4 rounded-2xl border transition-colors text-left ${
                rail === r.value ? "border-white/40 surface-3" : "border-default surface-2 hover-surface"
              }`}
            >
              <p className="text-sm font-semibold">{r.label}</p>
              <p className="text-xs text-muted mt-0.5">{r.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-[#ff5000] text-center">{error}</p>}

      <button type="submit" disabled={loading}
        className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Confirm withdrawal
      </button>
    </form>
  );
}

// ── Deposit instructions (post-transfer) ──────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="p-1.5 rounded-lg hover-surface transition-colors text-muted hover:text-white shrink-0">
      {copied ? <Check className="w-3.5 h-3.5 text-[#00c805]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function TransferSuccess({ result, onDone }: { result: TransferResult; onDone: () => void }) {
  const instr    = result.source_deposit_instructions;
  const toAddr   = instr?.to_address ?? "";
  const amount   = instr?.amount ?? "";
  const currency = instr?.currency?.toUpperCase() ?? "";
  const chain    = instr?.payment_rail ?? "";

  return (
    <div className="space-y-6">
      {/* Status */}
      <div className="flex flex-col items-center text-center pt-4 pb-2">
        <div className="w-12 h-12 rounded-full bg-[#00c805]/10 flex items-center justify-center mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00c805]" />
        </div>
        <p className="text-base font-bold">Transfer created</p>
        <p className="text-xs text-muted mt-1">Send crypto to the address below to complete your withdrawal</p>
      </div>

      {/* QR */}
      {toAddr && (
        <div className="flex justify-center">
          <div className="p-4 bg-white rounded-2xl">
            <QRCodeSVG value={toAddr} size={180} />
          </div>
        </div>
      )}

      {/* Deposit address */}
      <div className="surface-2 border border-default rounded-2xl p-4 space-y-3">
        <div>
          <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Send to address</p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono break-all flex-1">{toAddr}</p>
            {toAddr && <CopyButton text={toAddr} />}
          </div>
        </div>

        {amount && currency && (
          <div className="border-t border-default pt-3">
            <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Amount to send</p>
            <p className="text-sm font-bold">{amount} <span className="text-muted font-normal">{currency}</span></p>
          </div>
        )}

        {chain && (
          <div className="border-t border-default pt-3">
            <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Network</p>
            <p className="text-sm font-medium capitalize">{chain}</p>
          </div>
        )}

        <div className="border-t border-default pt-3">
          <p className="text-[10px] text-muted uppercase tracking-widest mb-1">Transfer ID</p>
          <p className="text-xs font-mono text-muted break-all">{result.id}</p>
        </div>
      </div>

      <p className="text-xs text-muted text-center leading-relaxed">
        Bridge will detect your deposit and deliver USD to your linked bank account.
      </p>

      <button onClick={onDone}
        className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// ── Banking dashboard (post-login) ────────────────────────────────────────────

// ── Create Bridge customer profile ───────────────────────────────────────────

const EMPTY_PROFILE = {
  firstName: "", lastName: "", email: "", birthDate: "",
  street: "", streetLine2: "", city: "", subdivision: "", postalCode: "",
  ssn: "", signedAgreementId: "",
};

function CreateProfileForm({ onSuccess }: { onSuccess: (customerId: string) => void }) {
  const [form,    setForm]    = useState(EMPTY_PROFILE);
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const set = (f: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [f]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/bridge/customers", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ ...form, country: "USA" }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? "Verification failed — check your information and try again"); return; }
      onSuccess(data.customerId);
    } catch { setError("Network error — please try again"); }
    finally  { setLoading(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-sm text-muted leading-relaxed">
        To link a bank account, we need to verify your identity with our banking partner.
        Your information is transmitted securely and never stored on our servers.
      </p>

      {/* Personal */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Personal info</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="First name"    value={form.firstName} onChange={set("firstName")} required className={input()} />
            <input placeholder="Last name"     value={form.lastName}  onChange={set("lastName")}  required className={input()} />
          </div>
          <input type="email" placeholder="Email address" value={form.email}     onChange={set("email")}     required className={input()} />
          <input type="date"  placeholder="Date of birth" value={form.birthDate} onChange={set("birthDate")} required className={input()} />
        </div>
      </div>

      {/* Address */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Residential address</p>
        <div className="space-y-3">
          <input placeholder="Street address"      value={form.street}      onChange={set("street")}      required className={input()} />
          <input placeholder="Apt / Suite (optional)" value={form.streetLine2} onChange={set("streetLine2")}         className={input()} />
          <input placeholder="City"                value={form.city}        onChange={set("city")}        required className={input()} />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="State (e.g. NY)"   value={form.subdivision} onChange={set("subdivision")} required className={input()} />
            <input placeholder="ZIP code"           value={form.postalCode}  onChange={set("postalCode")}  required className={input()} />
          </div>
        </div>
      </div>

      {/* ID */}
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-3">Identity verification</p>
        <div className="space-y-3">
          <input
            placeholder="Social Security Number (xxx-xx-xxxx)"
            value={form.ssn}
            onChange={set("ssn")}
            required
            pattern="\d{3}-\d{2}-\d{4}"
            autoComplete="off"
            className={input()}
          />
          <input
            placeholder="Signed Agreement ID (from Bridge ToS)"
            value={form.signedAgreementId}
            onChange={set("signedAgreementId")}
            required
            className={input()}
          />
        </div>
      </div>

      {error && <p className="text-xs text-[#ff5000] text-center">{error}</p>}

      <button type="submit" disabled={loading}
        className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        Verify identity
      </button>
    </form>
  );
}

// ── Banking dashboard ─────────────────────────────────────────────────────────

function BankingDashboard({ user: initialUser, onLogout, onBack }: { user: User; onLogout: () => void; onBack: () => void }) {
  const [customerId, setCustomerId] = useState<string | null>(initialUser.customerId);
  const [accounts,   setAccounts]   = useState<ExternalAccount[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false); // add-account form
  const [transferResult, setTransferResult] = useState<TransferResult | null>(null);

  useEffect(() => {
    if (!customerId) { setLoading(false); return; }
    fetch(`/api/bridge/external-accounts/${customerId}`, { credentials: "include" })
      .then(r => r.json())
      .then(body => {
        const data = body.data ?? [];
        setAccounts(data);
        setShowForm(data.length === 0);
      })
      .catch(() => setShowForm(true))
      .finally(() => setLoading(false));
  }, [customerId]);

  const handleRemove = async (accountId: string) => {
    await fetch(`/api/bridge/external-accounts/${customerId}/${accountId}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => null);
    setAccounts(prev => {
      const next = prev.filter(a => a.id !== accountId);
      if (next.length === 0) setShowForm(true);
      return next;
    });
  };

  const handleAdded = (account: ExternalAccount) => {
    setAccounts(prev => [...prev, account]);
    setShowForm(false);
  };

  return (
    <Shell email={initialUser.email} onLogout={onLogout} onBack={onBack} title="Withdraw">
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted" />
        </div>
      ) : transferResult !== null ? (
        <TransferSuccess
          result={transferResult}
          onDone={() => { setTransferResult(null); setShowForm(false); }}
        />
      ) : showForm ? (
        <AddAccountForm
          customerId={customerId}
          onSuccess={handleAdded}
          onCancel={() => setShowForm(false)}
          showCancel={true}
        />
      ) : (
        <WithdrawForm
          accounts={accounts}
          customerId={customerId}
          onBack={onBack}
          onSuccess={result => setTransferResult(result)}
          onAddAccount={() => setShowForm(true)}
        />
      )}
    </Shell>
  );
}

// ── Login (two-step: email → password) ───────────────────────────────────────

function LoginForm({ onSuccess, onRegister }: { onSuccess: (user: User) => void; onRegister: () => void }) {
  const [step,     setStep]     = useState<LoginStep>("email");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleEmailNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError("");
    setStep("password");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/banking/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? "Login failed"); setPassword(""); }
      else          { onSuccess(data.user); }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen app-bg app-fg font-sans flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <img src="/maritime.png" alt="Maritime" className="w-14 h-14 object-contain mb-4" />
          <span className="text-xl font-bold tracking-tight">Banking</span>
        </div>

        {step === "email" ? (
          <>
            <form onSubmit={handleEmailNext} className="space-y-3">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email address" autoFocus required className={input()} />
              <button type="submit"
                className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
              >
                Next
              </button>
            </form>
            <p className="text-center text-xs text-muted mt-4">
              Don&apos;t have an account?{" "}
              <button onClick={onRegister} className="text-white hover:underline font-medium">
                Create one
              </button>
            </p>
          </>
        ) : (
          <form onSubmit={handleLogin} className="space-y-3">
            <button type="button"
              onClick={() => { setStep("email"); setPassword(""); setError(""); }}
              className="flex items-center gap-2 w-full surface-2 border border-default rounded-xl px-4 py-3 text-sm text-muted hover-surface transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{email}</span>
            </button>
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
              placeholder="Password" autoFocus required className={input(!!error)} />
            {error && <p className="text-xs text-[#ff5000] text-center">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Log in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Register form (two steps: credentials → KYC) ─────────────────────────────

type RegisterStep = "credentials" | "kyc";

function RegisterForm({ onSuccess, onBack }: { onSuccess: (user: User) => void; onBack: () => void }) {
  const [step,     setStep]     = useState<RegisterStep>("credentials");
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res  = await fetch("/api/banking/auth/register", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setError(data?.error ?? "Registration failed"); return; }
      // Now log in to get a session, then advance to KYC step
      const loginRes  = await fetch("/api/banking/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "include", body: JSON.stringify({ email, password }),
      });
      const loginData = await loginRes.json().catch(() => null);
      if (!loginRes.ok) { setError(loginData?.error ?? "Login after registration failed"); return; }
      setStep("kyc");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  if (step === "kyc") {
    return (
      <div className="min-h-screen app-bg app-fg font-sans px-6 py-12">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-10">
            <img src="/maritime.png" alt="Maritime" className="w-8 h-8 object-contain" />
            <span className="text-base font-bold tracking-tight">Verify identity</span>
          </div>
          <CreateProfileForm
            onSuccess={customerId =>
              onSuccess({ email, name, customerId })
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg app-fg font-sans flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <img src="/maritime.png" alt="Maritime" className="w-14 h-14 object-contain mb-4" />
          <span className="text-xl font-bold tracking-tight">Create account</span>
        </div>
        <form onSubmit={handleCredentials} className="space-y-3">
          <input type="text"     value={name}     onChange={e => setName(e.target.value)}     placeholder="Full name"       autoFocus className={input()} />
          <input type="email"    value={email}    onChange={e => setEmail(e.target.value)}    placeholder="Email address"   required  className={input()} />
          <input type="password" value={password} onChange={e => { setPassword(e.target.value); setError(""); }} placeholder="Password" required className={input(!!error)} />
          {error && <p className="text-xs text-[#ff5000] text-center">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Continue
          </button>
          <p className="text-center text-xs text-muted pt-1">
            Already have an account?{" "}
            <button type="button" onClick={onBack} className="text-white hover:underline font-medium">
              Log in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

// ── Balances ──────────────────────────────────────────────────────────────────

function aggregateByToken(wallets: BridgeWallet[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const wallet of wallets) {
    for (const b of wallet.balances ?? []) {
      totals[b.currency] = (totals[b.currency] ?? 0) + parseFloat(b.balance);
    }
  }
  return totals;
}

function totalUSD(wallets: BridgeWallet[]): number {
  return Object.values(aggregateByToken(wallets)).reduce((sum, v) => sum + v, 0);
}

function WalletCard({ wallet }: { wallet: BridgeWallet }) {
  const nonZero = (wallet.balances ?? []).filter(b => parseFloat(b.balance) > 0);
  return (
    <div className="surface-2 border border-default rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold capitalize">{wallet.chain}</p>
          <p className="text-xs text-muted font-mono truncate max-w-[200px]">{wallet.address}</p>
        </div>
      </div>
      {nonZero.length === 0 ? (
        <p className="text-xs text-muted">No balance</p>
      ) : (
        nonZero.map(b => (
          <div key={b.currency} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-white/10">{b.currency}</span>
              <span className="text-xs text-muted">{b.chain}</span>
            </div>
            <span className="text-sm font-mono font-semibold">
              {parseFloat(b.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function TotalBalanceSummary({ wallets }: { wallets: BridgeWallet[] }) {
  const totals     = aggregateByToken(wallets);
  const entries    = Object.entries(totals).filter(([, v]) => v > 0);
  const grandTotal = totalUSD(wallets);
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-3xl font-bold">
          ${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <p className="text-xs text-muted mt-1">Total balance</p>
      </div>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-xs text-muted text-center py-4">No token balances yet</p>
        ) : (
          entries.map(([currency, amount]) => (
            <div key={currency} className="flex items-center justify-between surface-2 border border-default rounded-xl px-4 py-3">
              <span className="text-sm font-bold uppercase">{currency}</span>
              <span className="text-sm font-mono">
                {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BalancesPage({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const [wallets, setWallets] = useState<BridgeWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [view,    setView]    = useState<"summary" | "wallets">("summary");

  useEffect(() => {
    async function load() {
      try {
        const listRes      = await fetch(`/api/bridge/customers/${customerId}/wallets`, { credentials: "include" });
        const { data = [] } = await listRes.json();
        const detailed     = await Promise.all(
          data.map((w: BridgeWallet) =>
            fetch(`/api/bridge/customers/${customerId}/wallets/${w.id}`, { credentials: "include" }).then(r => r.json())
          )
        );
        setWallets(detailed);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [customerId]);

  return (
    <div className="min-h-screen app-bg app-fg font-sans flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onBack} className="p-2 rounded-xl hover-surface transition-colors -ml-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <img src="/maritime.png" alt="Maritime" className="w-7 h-7 object-contain" />
            <span className="text-base font-bold tracking-tight">Balances</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex gap-2">
              {(["summary", "wallets"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors capitalize ${
                    view === v ? "bg-white text-black" : "surface-2 border border-default text-muted hover-surface"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            {view === "summary" ? (
              <TotalBalanceSummary wallets={wallets} />
            ) : (
              <div className="space-y-3">
                {wallets.length === 0 ? (
                  <p className="text-xs text-muted text-center py-8">No wallets found</p>
                ) : (
                  wallets.map(w => <WalletCard key={w.id} wallet={w} />)
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Account / Wallets ─────────────────────────────────────────────────────────

interface WalletBalance {
  balance:          string;
  currency:         string;
  chain:            string;
  contract_address: string;
}

interface BridgeWallet {
  id:       string;
  chain:    string;
  address:  string;
  status?:  string;
  balances: WalletBalance[];
}

interface SelectedBalance {
  walletId: string;
  chain:    string;
  address:  string;
  currency: string;
  balance:  string;
}

const WALLET_CHAINS = ["base", "ethereum", "solana", "tempo", "tron"] as const;

async function loadWalletsWithBalances(customerId: string): Promise<BridgeWallet[]> {
  const listRes  = await fetch(`/api/bridge/customers/${customerId}/wallets`, { credentials: "include" });
  const listBody = await listRes.json();
  const wallets: BridgeWallet[] = (listBody.data ?? []).map((w: BridgeWallet) => ({
    ...w,
    balances: w.balances ?? [],
  }));
  return wallets;
}

function WalletBalanceDropdown({ wallets, selected, onSelect }: {
  wallets:  BridgeWallet[];
  selected: SelectedBalance | null;
  onSelect: (b: SelectedBalance) => void;
}) {
  const [open, setOpen] = useState(false);

  const options: SelectedBalance[] = wallets.flatMap(w =>
    (w.balances ?? [])
      .map(b => ({
        walletId: w.id,
        chain:    w.chain,
        address:  w.address,
        currency: b.currency,
        balance:  b.balance,
      }))
  );

  const fmt = (v: string) =>
    parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });

  return (
    <div className="relative">
      {/* Trigger */}
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between surface-2 border border-default rounded-xl px-4 py-3 text-sm"
      >
        {selected ? (
          <div className="flex items-center justify-between flex-1 mr-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/10">
                {selected.currency}
              </span>
              <span className="text-xs text-muted capitalize">{selected.chain}</span>
            </div>
            <span className="font-mono text-sm font-semibold">{fmt(selected.balance)}</span>
          </div>
        ) : (
          <span className="text-muted text-sm">Select token to send</span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-10 mt-1 w-full surface-2 border border-default rounded-xl overflow-hidden shadow-xl">
          {options.length === 0 ? (
            <p className="text-xs text-muted px-4 py-4 text-center">No token balances found</p>
          ) : (
            options.map((opt, i) => (
              <button key={i} type="button"
                onClick={() => { onSelect(opt); setOpen(false); }}
                className={`w-full flex items-center justify-between px-4 py-3 text-sm transition-colors border-b border-default last:border-0 ${
                  selected?.walletId === opt.walletId && selected?.currency === opt.currency
                    ? "surface-3"
                    : "hover-surface"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/10 shrink-0">
                    {opt.currency}
                  </span>
                  <div className="text-left">
                    <p className="text-xs font-medium capitalize">{opt.chain}</p>
                    <p className="text-[10px] text-muted font-mono">
                      {opt.address.slice(0, 6)}…{opt.address.slice(-4)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono font-semibold">{fmt(opt.balance)}</p>
                  <p className="text-[10px] text-muted uppercase">{opt.currency}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SendForm({ customerId }: { customerId: string }) {
  const [wallets,      setWallets]      = useState<BridgeWallet[]>([]);
  const [walletsReady, setWalletsReady] = useState(false);
  const [selected,     setSelected]     = useState<SelectedBalance | null>(null);
  const [amount,       setAmount]       = useState("");
  const [toAddr,       setToAddr]       = useState("");
  const [destChain,    setDestChain]    = useState("ethereum");
  const [destCurrency, setDestCurrency] = useState("usdc");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [txn,          setTxn]          = useState<{ id: string; status?: string } | null>(null);

  useEffect(() => {
    loadWalletsWithBalances(customerId)
      .then(setWallets)
      .finally(() => setWalletsReady(true));
  }, [customerId]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch("/api/bridge/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          amount,
          customerId,
          walletId:       selected.walletId,
          sourceCurrency: selected.currency,
          destChain,
          destCurrency,
          toAddress: toAddr,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? data.message ?? "Transfer failed"); return; }
      setTxn(data);
    } catch { setError("Network error — please try again"); }
    finally  { setLoading(false); }
  };

  if (txn) {
    return (
      <div className="text-center space-y-2 py-8">
        <div className="w-10 h-10 rounded-full bg-[#00c805]/10 flex items-center justify-center mx-auto mb-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00c805]" />
        </div>
        <p className="text-sm font-semibold">Transfer submitted</p>
        <p className="text-xs text-muted font-mono break-all">{txn.id}</p>
        {txn.status && <p className="text-xs text-muted capitalize">{txn.status}</p>}
        <button onClick={() => { setTxn(null); setAmount(""); setToAddr(""); setSelected(null); }}
          className="text-xs text-muted hover:text-white transition-colors mt-4 block mx-auto"
        >
          Send another
        </button>
      </div>
    );
  }

  if (!walletsReady) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted" /></div>;
  }

  return (
    <form onSubmit={handleSend} className="space-y-4">
      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-2">From</p>
        <WalletBalanceDropdown wallets={wallets} selected={selected} onSelect={setSelected} />
      </div>

      <input
        placeholder="Amount (e.g. 10.00)"
        value={amount} onChange={e => setAmount(e.target.value)}
        required type="number" min="0" step="any"
        className="w-full surface-2 border border-default rounded-xl px-4 py-3 text-sm"
      />

      <div>
        <p className="text-xs text-muted uppercase tracking-widest mb-2">To</p>
        <input
          placeholder="Recipient address"
          value={toAddr} onChange={e => setToAddr(e.target.value)}
          required
          className="w-full surface-2 border border-default rounded-xl px-4 py-3 text-sm mb-3"
        />
        <div className="grid grid-cols-2 gap-3">
          <select value={destChain} onChange={e => setDestChain(e.target.value)}
            className="surface-2 border border-default rounded-xl px-4 py-3 text-sm app-bg app-fg"
          >
            <option value="ethereum">Ethereum</option>
            <option value="base">Base</option>
            <option value="solana">Solana</option>
            <option value="tron">Tron</option>
            <option value="tempo">Tempo</option>
          </select>
          <input
            placeholder="Receive as (e.g. usdc)"
            value={destCurrency} onChange={e => setDestCurrency(e.target.value)}
            required
            className="surface-2 border border-default rounded-xl px-4 py-3 text-sm"
          />
        </div>
      </div>

      {error && <p className="text-xs text-[#ff5000] text-center">{error}</p>}

      <button type="submit" disabled={loading || !selected}
        className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-30 flex items-center justify-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Sending…" : `Send ${selected?.currency.toUpperCase() ?? ""}`}
      </button>
    </form>
  );
}

function AccountPage({ user, onBack, onSend }: { user: User; onBack: () => void; onSend: () => void }) {
  const [wallets,    setWallets]    = useState<BridgeWallet[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [creating,   setCreating]   = useState(false);
  const [chain,      setChain]      = useState<string>("base");
  const [error,      setError]      = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!user.customerId) { setLoading(false); return; }
    loadWalletsWithBalances(user.customerId)
      .then(setWallets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.customerId]);

  const handleCreate = async () => {
    if (!user.customerId) return;
    setCreating(true);
    setError("");
    try {
      const res = await fetch(`/api/bridge/customers/${user.customerId}/wallets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ chain }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to create wallet"); return; }
      // fetch the detail to get balances shape
      setWallets(prev => [...prev, { ...data, balances: data.balances ?? [] }]);
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen app-bg app-fg font-sans flex flex-col items-center px-6 py-10">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onBack} className="p-2 rounded-xl hover-surface transition-colors -ml-2">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-3">
            <img src="/maritime.png" alt="Maritime" className="w-7 h-7 object-contain" />
            <span className="text-base font-bold tracking-tight">Wallets</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-5 h-5 animate-spin text-muted" />
          </div>
        ) : (
          <>
            {wallets.length === 0 ? (
              <div className="flex flex-col items-center text-center py-16 gap-4">
                <div className="w-14 h-14 rounded-2xl surface-2 border border-default flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-muted" />
                </div>
                <div>
                  <p className="text-sm font-semibold">No wallets yet</p>
                  <p className="text-xs text-muted mt-1">Create a wallet to get a deposit address on any supported chain</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3 mb-8">
                {wallets.map(w => {
                  const expanded = expandedId === w.id;
                  const hasBalances = (w.balances ?? []).length > 0;
                  return (
                    <div key={w.id} className="surface-2 border border-default rounded-2xl overflow-hidden">
                      {/* Collapsed header — always visible */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : w.id)}
                        className="w-full flex items-center justify-between px-4 py-4 hover-surface transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg surface-3 flex items-center justify-center shrink-0">
                            <Wallet className="w-4 h-4 text-muted" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold capitalize">{w.chain}</p>
                            <p className="text-xs text-muted font-mono">
                              {w.address ? `${w.address.slice(0, 6)}…${w.address.slice(-4)}` : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {hasBalances && (
                            <div className="text-right">
                              {w.balances.map((b, i) => (
                                <p key={i} className="text-xs font-mono">
                                  {b.balance} <span className="uppercase text-muted">{b.currency}</span>
                                </p>
                              ))}
                            </div>
                          )}
                          <ChevronDown className={`w-4 h-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {/* Expanded detail */}
                      {expanded && (
                        <div className="border-t border-default px-4 pb-4 pt-4 space-y-4">
                          {/* Address */}
                          <div>
                            <p className="text-[10px] text-muted uppercase tracking-widest mb-1.5">Address</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-mono break-all flex-1 text-muted">{w.address}</p>
                              <CopyButton text={w.address} />
                            </div>
                          </div>

                          {/* Balances */}
                          {hasBalances && (
                            <div>
                              <p className="text-[10px] text-muted uppercase tracking-widest mb-2">Balances</p>
                              <div className="space-y-1.5">
                                {w.balances.map((b, i) => (
                                  <div key={i} className="flex items-center justify-between">
                                    <span className="text-xs uppercase font-medium">{b.currency}</span>
                                    <span className="text-xs font-mono">{b.balance}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* QR */}
                          <div className="flex justify-center">
                            <div className="p-3 bg-white rounded-xl">
                              <QRCodeSVG value={w.address} size={120} />
                            </div>
                          </div>

                          {/* Send button */}
                          <button
                            type="button"
                            onClick={onSend}
                            className="w-full flex items-center justify-center gap-2 bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                          >
                            <ArrowLeftRight className="w-4 h-4" />
                            Send from this wallet
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Create wallet */}
            <div className="surface-2 border border-default rounded-2xl p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Create new wallet</p>
              <div className="grid grid-cols-5 gap-2">
                {WALLET_CHAINS.map(c => (
                  <button key={c} type="button" onClick={() => setChain(c)}
                    className={`py-2 rounded-xl border text-xs font-medium transition-colors capitalize ${
                      chain === c ? "border-white/40 surface-3 text-white" : "border-default surface-2 text-muted hover-surface"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {error && <p className="text-xs text-[#ff5000]">{error}</p>}
              <button onClick={handleCreate} disabled={creating || !user.customerId}
                className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                <Plus className="w-4 h-4" />
                Create {chain} wallet
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

type Page = "home" | "withdraw" | "account" | "send" | "balances";

export default function BankingPage() {
  const [view,  setView]  = useState<View>("login");
  const [user,  setUser]  = useState<User | null>(null);
  const [page,  setPage]  = useState<Page>("home");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/banking/auth/me", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.email) setUser(data); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const handleLogout = async () => {
    await fetch("/api/banking/auth/logout", { method: "POST", credentials: "include" }).catch(() => null);
    setUser(null);
    setView("login");
    setPage("home");
  };

  if (!ready) return null;

  if (user) {
    if (page === "withdraw") {
      return (
        <BankingDashboard
          user={user}
          onLogout={handleLogout}
          onBack={() => setPage("home")}
        />
      );
    }
    if (page === "account") {
      return <AccountPage user={user} onBack={() => setPage("home")} onSend={() => setPage("send")} />;
    }
    if (page === "balances") {
      return <BalancesPage customerId={user.customerId!} onBack={() => setPage("home")} />;
    }
    if (page === "send") {
      return (
        <div className="min-h-screen app-bg app-fg font-sans flex flex-col items-center px-6 py-10">
          <div className="w-full max-w-lg">
            <div className="flex items-center gap-3 mb-8">
              <button onClick={() => setPage("home")} className="p-2 rounded-xl hover-surface transition-colors -ml-2">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-3">
                <img src="/maritime.png" alt="Maritime" className="w-7 h-7 object-contain" />
                <span className="text-base font-bold tracking-tight">Send</span>
              </div>
            </div>
            <SendForm customerId={user.customerId!} />
          </div>
        </div>
      );
    }
    return <BankingHome user={user} onLogout={handleLogout} onNavigate={key => setPage(key as Page)} />;
  }

  if (view === "register") {
    return <RegisterForm onBack={() => setView("login")} onSuccess={u => { setUser(u); setView("login"); }} />;
  }

  return <LoginForm onSuccess={u => setUser(u)} onRegister={() => setView("register")} />;
}
