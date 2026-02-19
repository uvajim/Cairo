"use client";

import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Wallet, ArrowLeftRight, Droplet, Activity, Search } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useWallet } from "../contexts/WalletContext";
import { BACKEND_URL } from "../lib/config";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

const navItems = [
  { path: "/",         label: "Portfolio", icon: Wallet },
  { path: "/swap",     label: "Swap",      icon: ArrowLeftRight },
  { path: "/pools",    label: "Pools",     icon: Droplet },
  { path: "/activity", label: "Activity",  icon: Activity },
];

const shortAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { address, connecting, walletError, connect, disconnect } = useWallet();

  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showDrop,    setShowDrop]    = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  // Debounced fetch from /api/market/search
  useEffect(() => {
    const q = query.trim();
    if (!q) { setSuggestions([]); setShowDrop(false); return; }
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(`${BACKEND_URL}/api/market/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
        setShowDrop(true);
        setActiveIdx(-1);
      } catch { setSuggestions([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const navigate_to = (symbol: string) => {
    navigate(`/stock/${symbol}`);
    setQuery("");
    setSuggestions([]);
    setShowDrop(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIdx >= 0 && suggestions[activeIdx]) {
      navigate_to(suggestions[activeIdx].symbol);
    } else {
      const sym = query.trim().toUpperCase();
      if (sym) navigate_to(sym);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDrop || suggestions.length === 0) return;
    if (e.key === "ArrowDown")  { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")    { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, -1)); }
    if (e.key === "Escape")     { setShowDrop(false); setActiveIdx(-1); }
  };

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-black text-white selection:bg-gray-800">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-gray-900 bg-black sticky top-0 z-50">
        <div className="max-w-[1024px] mx-auto px-6">
          <div className="flex items-center justify-between h-16">

            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-black">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L2 22H22L12 2ZM12 6L18 18H6L12 6Z" />
                </svg>
              </div>
              <h1 className="text-xl font-bold tracking-tight">Maritime</h1>
            </div>

            {/* Desktop nav links */}
            <nav className="hidden md:flex gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm font-medium transition-colors hover:text-white ${
                    isActive(item.path) ? "text-white" : "text-gray-500"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Right: search + connect wallet */}
            <div className="flex items-center gap-4">
              <div ref={searchRef} className="hidden md:block relative">
                <form onSubmit={handleSearch} className="flex items-center relative">
                  <Search className="absolute left-3 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                    placeholder="Search stocks or company…"
                    className="bg-[#1E1E24] border border-transparent focus:border-white/20 rounded text-sm pl-8 pr-4 py-1.5 w-64 text-white placeholder-gray-500 transition-all outline-none"
                  />
                </form>

                {/* Suggestions dropdown */}
                {showDrop && suggestions.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 w-full bg-[#1A1B1F] border border-gray-800 rounded-lg shadow-xl overflow-hidden z-50">
                    {suggestions.map((s, i) => (
                      <button
                        key={s.symbol}
                        onMouseDown={() => navigate_to(s.symbol)}
                        onMouseEnter={() => setActiveIdx(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          i === activeIdx ? "bg-[#2A2B30]" : "hover:bg-[#2A2B30]"
                        }`}
                      >
                        <span className="text-xs font-bold text-white w-14 shrink-0">{s.symbol}</span>
                        <span className="text-xs text-gray-400 truncate flex-1">{s.name}</span>
                        <span className="text-xs text-gray-600 shrink-0">{s.exchange}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {walletError && (
                <span className="hidden md:block text-xs text-red-400 max-w-[140px] truncate" title={walletError}>
                  {walletError}
                </span>
              )}

              {/* ── Connect Wallet button — driven by WalletContext ── */}
              <button
                onClick={address ? disconnect : connect}
                disabled={connecting}
                className={`text-sm font-bold transition-colors disabled:opacity-50 ${
                  address
                    ? "flex items-center gap-1.5 bg-[#1E1E24] px-3 py-1.5 rounded-full hover:bg-gray-800"
                    : "text-[#00c805] hover:text-[#00b004]"
                }`}
              >
                {address && <span className="w-2 h-2 rounded-full bg-[#00c805] inline-block" />}
                {connecting ? "Connecting…" : address ? shortAddress(address) : "Connect Wallet"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile bottom nav ──────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1A1B1F] border-t border-gray-800 z-50">
        <div className="grid grid-cols-4">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 py-3 transition-colors ${
                isActive(item.path) ? "text-white" : "text-gray-500"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* ── Page content rendered by React Router ──────────────────────── */}
      <main className="pb-20 md:pb-8">
        <Outlet />
      </main>
    </div>
  );
}
