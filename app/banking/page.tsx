"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Loader2, Trash2, ChevronRight, Plus, Building2, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from "lucide-react";

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
  { icon: ArrowDownToLine, label: "Deposit",  desc: "Add funds to your account", key: "deposit"  },
  { icon: ArrowUpFromLine, label: "Withdraw", desc: "Move funds to your wallet",  key: "withdraw" },
  { icon: ArrowLeftRight,  label: "Convert",  desc: "Swap between currencies",    key: "convert"  },
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

        <div className="grid grid-cols-3 gap-4 mb-10">
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

// ── Account card ──────────────────────────────────────────────────────────────

function AccountCard({
  account,
  selected,
  onSelect,
  onRemove,
  removing,
}: {
  account:  ExternalAccount;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
  removing: boolean;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-colors ${
        selected ? "border-white/40 surface-3" : "border-default surface-2 hover-surface"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl surface-3 flex items-center justify-center shrink-0">
          <Building2 className="w-4 h-4 text-muted" strokeWidth={1.75} />
        </div>
        <div>
          <p className="text-sm font-semibold">{account.bank_name} ···{account.last_4}</p>
          <p className="text-xs text-muted">{account.account_name}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            account.status === "active"
              ? "bg-[#00c805]/10 text-[#00c805]"
              : "bg-white/10 text-muted"
          }`}
        >
          {account.status}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          disabled={removing}
          className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-400 transition-colors disabled:opacity-40"
        >
          {removing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Saved accounts view ───────────────────────────────────────────────────────

function SavedAccountsList({
  accounts,
  onRemove,
  onWithdraw,
  onAddNew,
}: {
  accounts:   ExternalAccount[];
  onRemove:   (id: string) => Promise<void>;
  onWithdraw: (id: string) => void;
  onAddNew:   () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removing,   setRemoving]   = useState<string | null>(null);

  const handleRemove = async (id: string) => {
    setRemoving(id);
    await onRemove(id);
    if (selectedId === id) setSelectedId(null);
    setRemoving(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted uppercase tracking-widest mb-4">Linked accounts</p>

      {accounts.map(account => (
        <AccountCard
          key={account.id}
          account={account}
          selected={selectedId === account.id}
          onSelect={() => setSelectedId(prev => prev === account.id ? null : account.id)}
          onRemove={() => handleRemove(account.id)}
          removing={removing === account.id}
        />
      ))}

      <div className="pt-2 space-y-2">
        <button
          onClick={() => selectedId && onWithdraw(selectedId)}
          disabled={!selectedId}
          className="w-full flex items-center justify-center gap-2 bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Withdraw from selected account
          <ChevronRight className="w-4 h-4" />
        </button>

        <button
          onClick={onAddNew}
          className="w-full flex items-center justify-center gap-2 surface-2 border border-default text-sm font-medium py-3 rounded-xl hover-surface transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add new account
        </button>
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
  const [accounts,  setAccounts]    = useState<ExternalAccount[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [showForm,  setShowForm]    = useState(false);

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
      ) : showForm ? (
        <AddAccountForm
          customerId={customerId}
          onSuccess={handleAdded}
          onCancel={accounts.length > 0 ? () => setShowForm(false) : undefined}
          showCancel={accounts.length > 0}
        />
      ) : (
        <SavedAccountsList
          accounts={accounts}
          onRemove={handleRemove}
          onWithdraw={id => console.log("withdraw from", id)}
          onAddNew={() => setShowForm(true)}
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

// ── Root ──────────────────────────────────────────────────────────────────────

type Page = "home" | "withdraw" | "deposit" | "convert";

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
    return <BankingHome user={user} onLogout={handleLogout} onNavigate={key => setPage(key as Page)} />;
  }

  if (view === "register") {
    return <RegisterForm onBack={() => setView("login")} onSuccess={u => { setUser(u); setView("login"); }} />;
  }

  return <LoginForm onSuccess={u => setUser(u)} onRegister={() => setView("register")} />;
}
