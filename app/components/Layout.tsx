"use client";

import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { Globe, Search, CircleDollarSign, LayoutDashboard, PieChart, Smartphone, Moon, Sun, Monitor } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWallet } from "../contexts/WalletContext";
import { BACKEND_URL } from "../lib/config";
import "../lib/i18n";
import { LANGUAGES } from "../lib/i18n";
import { useCurrency, CURRENCIES } from "../contexts/CurrencyContext";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
}

const NAV_KEYS = [
  { path: "/",            key: "nav.overview",  icon: LayoutDashboard  },
  { path: "/portfolio",   key: "nav.portfolio", icon: PieChart         },
  { path: "/balance",     key: "nav.balance",   icon: CircleDollarSign },
  { path: "/get-wallet",  key: "nav.getApp",    icon: Smartphone       },
];

const shortAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
type ThemeChoice = "system" | "light" | "dark";

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { address, connecting, walletError, connect, disconnect } = useWallet();

  const [query,       setQuery]       = useState("");
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showDrop,    setShowDrop]    = useState(false);
  const [activeIdx,   setActiveIdx]   = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);

  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const [copiedNav, setCopiedNav] = useState(false);
  function copyAddressNav() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopiedNav(true);
    setTimeout(() => setCopiedNav(false), 2000);
  }

  const [showLangMenu, setShowLangMenu] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const [showCurrencyMenu, setShowCurrencyMenu] = useState(false);
  const currencyMenuRef = useRef<HTMLDivElement>(null);
  const { currency, setCurrency } = useCurrency();
  const [themeChoice, setThemeChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = localStorage.getItem("maritime-theme");
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeChoice(stored);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = themeChoice === "system" ? (media.matches ? "dark" : "light") : themeChoice;
      const cls = resolved === "dark" ? "theme-dark" : "theme-light";
      document.documentElement.classList.remove("theme-light", "theme-dark");
      document.documentElement.classList.add(cls);
      document.body.classList.remove("theme-light", "theme-dark");
      document.body.classList.add(cls);
      document.documentElement.style.colorScheme = resolved;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [themeChoice]);

  const cycleTheme = () => {
    const next: ThemeChoice =
      themeChoice === "system" ? "light" : themeChoice === "light" ? "dark" : "system";
    setThemeChoice(next);
    localStorage.setItem("maritime-theme", next);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (walletMenuRef.current && !walletMenuRef.current.contains(e.target as Node)) {
        setShowWalletMenu(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
      if (currencyMenuRef.current && !currencyMenuRef.current.contains(e.target as Node)) {
        setShowCurrencyMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
    <div className="min-h-screen app-bg app-fg selection:bg-gray-800">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-default surface-1 sticky top-0 z-50">
        <div className="max-w-[1024px] mx-auto px-6">
          <div className="flex items-center h-16">

            {/* Logo — fixed to the left */}
            <div className="flex items-center gap-2 mr-16">
              <img src="/maritime.png" alt="Maritime" className="logo-maritime w-8 h-8 object-contain" />
              <h1 className="text-xl font-bold tracking-tight">Maritime</h1>
            </div>

            {/* Desktop nav links */}
            <nav className="hidden md:flex items-center gap-6">
              {NAV_KEYS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive(item.path) ? "app-fg" : "text-muted"
                  }`}
                >
                  {t(item.key)}
                </Link>
              ))}
            </nav>

            {/* Right: search + lang + connect wallet — flex-1 justify-end */}
            <div className="flex items-center gap-4 flex-1 justify-end pl-8">
              <div ref={searchRef} className="hidden md:block relative">
                <form onSubmit={handleSearch} className="flex items-center relative">
                  <Search className="absolute left-3 w-3.5 h-3.5 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => suggestions.length > 0 && setShowDrop(true)}
                    placeholder={t("nav.searchPlaceholder")}
                    className="surface-2 border border-transparent focus:border-white/20 rounded text-sm pl-8 pr-4 py-1.5 w-64 app-fg placeholder:text-muted transition-all outline-none"
                  />
                </form>

                {/* Suggestions dropdown */}
                {showDrop && suggestions.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 w-full surface-3 border border-default rounded-lg shadow-xl overflow-hidden z-50">
                    {suggestions.map((s, i) => (
                      <button
                        key={s.symbol}
                        onMouseDown={() => navigate_to(s.symbol)}
                        onMouseEnter={() => setActiveIdx(i)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                          i === activeIdx ? "surface-2" : "hover-surface"
                        }`}
                      >
                        <span className="text-xs font-bold app-fg w-14 shrink-0">{s.symbol}</span>
                        <span className="text-xs text-muted truncate flex-1">{s.name}</span>
                        <span className="text-xs text-soft shrink-0">{s.exchange}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Language switcher */}
              <div ref={langMenuRef} className="hidden md:block relative">
                <button
                  onClick={() => setShowLangMenu(v => !v)}
                  className="flex items-center gap-1 text-muted transition-colors text-sm"
                  title="Language"
                >
                  <Globe className="w-4 h-4" />
                  <span className="font-medium">{LANGUAGES[i18n.language] ?? "EN"}</span>
                </button>
                {showLangMenu && (
                  <div className="absolute top-full right-0 mt-2 w-36 surface-2 border border-default rounded-xl shadow-xl overflow-y-auto max-h-64 z-50">
                    {Object.entries(LANGUAGES).map(([code, label]) => (
                      <button
                        key={code}
                        onClick={() => { i18n.changeLanguage(code); setShowLangMenu(false); }}
                        className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover-surface flex items-center justify-between ${
                          i18n.language === code ? "app-fg font-bold" : "text-muted"
                        }`}
                      >
                        {label}
                        {i18n.language === code && <span className="text-[#00c805]">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Currency picker */}
              <div ref={currencyMenuRef} className="hidden md:block relative">
                <button
                  onClick={() => setShowCurrencyMenu(v => !v)}
                  className="flex items-center gap-1 text-muted transition-colors text-sm font-medium"
                  title="Currency"
                >
                  {currency}
                </button>
                {showCurrencyMenu && (
                  <div className="absolute top-full right-0 mt-2 w-28 surface-2 border border-default rounded-xl shadow-xl overflow-y-auto max-h-64 z-50">
                    {CURRENCIES.map(c => (
                      <button
                        key={c}
                        onClick={() => { setCurrency(c); setShowCurrencyMenu(false); }}
                        className={`w-full px-4 py-2.5 text-sm text-left transition-colors hover-surface flex items-center justify-between ${
                          currency === c ? "app-fg font-bold" : "text-muted"
                        }`}
                      >
                        {c}
                        {currency === c && <span className="text-[#00c805]">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={cycleTheme}
                className="hidden md:flex items-center gap-1 text-muted transition-colors text-sm"
                title={`Theme: ${themeChoice}`}
              >
                {themeChoice === "light" ? <Sun className="w-4 h-4" /> : themeChoice === "dark" ? <Moon className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
              </button>

              {walletError && (
                <span className="hidden md:block text-xs text-red-400 max-w-[140px] truncate" title={walletError}>
                  {walletError}
                </span>
              )}

              {/* ── Connect Wallet button — driven by WalletContext ── */}
              {connecting ? (
                <span className="text-sm font-bold text-gray-400">{t("nav.connecting")}</span>
              ) : address ? (
                <div ref={walletMenuRef} className="relative flex items-center">
                  {/* Address pill — sits on top */}
                  <button
                    onClick={() => setShowWalletMenu(v => !v)}
                    className="flex items-center gap-1.5 surface-3 border border-default px-3 py-1.5 rounded-full text-sm font-bold hover-surface transition-colors z-10 relative app-fg"
                  >
                    <span className="w-2 h-2 rounded-full bg-[#00c805] inline-block" />
                    {shortAddress(address)}
                  </button>

                  {/* Dropdown */}
                  {showWalletMenu && (
                    <div className="absolute top-full right-0 mt-2 w-44 surface-2 border border-default rounded-xl shadow-xl overflow-hidden z-50">
                      <button
                        onClick={() => { copyAddressNav(); }}
                        className="w-full px-4 py-3 text-sm font-semibold text-muted hover-surface transition-colors text-left"
                      >
                        {copiedNav ? "Copied!" : t("nav.copyAddress")}
                      </button>
                      <button
                        onClick={() => { disconnect(); setShowWalletMenu(false); }}
                        className="w-full px-4 py-3 text-sm font-semibold text-[#ff5000] hover-surface transition-colors text-left"
                      >
                        {t("nav.disconnect")}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={connect}
                  className="text-sm font-bold text-[#00c805] hover:text-[#00b004] transition-colors"
                >
                  {t("nav.connectWallet")}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile bottom nav ──────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 surface-3 border-t border-default z-50">
        <div className="grid grid-cols-6">
          {NAV_KEYS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center gap-1 py-3 transition-colors ${
                isActive(item.path) ? "app-fg" : "text-muted"
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{t(item.key)}</span>
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
