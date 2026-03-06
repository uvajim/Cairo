"use client";

import { useState, useEffect } from "react";

const PASSWORD = process.env.NEXT_PUBLIC_PREVIEW_PASSWORD ?? "";

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [input,    setInput]    = useState("");
  const [error,    setError]    = useState(false);
  const [ready,    setReady]    = useState(false);

  // Check sessionStorage on mount to avoid flash on page refresh
  useEffect(() => {
    if (sessionStorage.getItem("unlocked") === "1") setUnlocked(true);
    setReady(true);
  }, []);

  // If no password is configured, just render children
  if (!PASSWORD) return <>{children}</>;
  if (!ready)    return null;
  if (unlocked)  return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input === PASSWORD) {
      sessionStorage.setItem("unlocked", "1");
      setUnlocked(true);
    } else {
      setError(true);
      setInput("");
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-black">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 22H22L12 2ZM12 6L18 18H6L12 6Z" />
            </svg>
          </div>
          <span className="text-white text-xl font-bold tracking-tight">Maritime</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(false); }}
            placeholder="Enter password"
            autoFocus
            className={`w-full bg-[#1E1E24] border rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 outline-none transition-colors ${
              error ? "border-[#ff5000]" : "border-gray-700 focus:border-white/30"
            }`}
          />
          {error && (
            <p className="text-xs text-[#ff5000] text-center">Incorrect password</p>
          )}
          <button
            type="submit"
            className="w-full bg-white text-black text-sm font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
