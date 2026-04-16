"use client";

import { useState, useEffect } from "react";

const DEFAULT_PASSWORD = process.env.NEXT_PUBLIC_PREVIEW_PASSWORD ?? "";

export function PasswordGate({
  children,
  label = "Maritime",
  password,
  storageKey = "unlocked",
}: {
  children: React.ReactNode;
  label?: string;
  /** Override the password to check (defaults to NEXT_PUBLIC_PREVIEW_PASSWORD). */
  password?: string;
  /** sessionStorage key used to persist the unlocked state. */
  storageKey?: string;
}) {
  const PASSWORD = password ?? DEFAULT_PASSWORD;
  const [unlocked, setUnlocked] = useState(false);
  const [input,    setInput]    = useState("");
  const [error,    setError]    = useState(false);
  const [ready,    setReady]    = useState(false);

  // Check sessionStorage on mount to avoid flash on page refresh
  useEffect(() => {
    if (sessionStorage.getItem(storageKey) === "1") setUnlocked(true);
    setReady(true);
  }, [storageKey]);

  // If no password is configured, just render children
  if (!PASSWORD) return <>{children}</>;
  if (!ready)    return null;
  if (unlocked)  return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === PASSWORD) {
      sessionStorage.setItem(storageKey, "1");
      setUnlocked(true);
    } else {
      setError(true);
      setInput("");
    }
  };

  return (
    <div className="min-h-screen app-bg app-fg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center gap-3 mb-10">
          <img src="/maritime.png" alt="Maritime" className="logo-maritime w-16 h-16 object-contain" />
          <span className="app-fg text-xl font-bold tracking-tight">{label}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false); }}
            placeholder="Enter password"
            autoFocus
            className={`w-full surface-2 border rounded-xl px-4 py-3 app-fg text-sm placeholder:text-muted outline-none transition-colors ${
              error ? "border-[#ff5000]" : "border-default focus:border-[#00c805]/50"
            }`}
          />
          {error && (
            <p className="text-xs text-[#ff5000] text-center">Incorrect password</p>
          )}
          <button
            type="submit"
            className="w-full bg-[#111827] text-white text-sm font-bold py-3 rounded-xl hover:bg-[#1f2937] transition-colors"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
