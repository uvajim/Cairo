"use client";

import { useEffect } from "react";

const GEO_BYPASS_COOKIE = "geo_bypass";

/**
 * Reads ?geo_unlock=<password> from the URL on the client, sets the bypass
 * cookie, then removes the param with history.replaceState — no page reload,
 * no server redirect.
 *
 * Doing this client-side means email pre-fetchers can never "consume" the
 * link: the param survives until the real user's browser loads the page.
 */
export function GeoUnlockHandler() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const unlock = params.get("geo_unlock");
    if (!unlock) return;

    // Scope the cookie to the root domain so it works on both www and apex.
    // On localhost there's no dot in the hostname so we skip the domain attr.
    const hostname  = window.location.hostname;
    const parts     = hostname.split(".");
    const rootDomain = parts.length >= 2
      ? "." + parts.slice(-2).join(".")
      : "";
    const domainAttr = rootDomain ? `; domain=${rootDomain}` : "";

    document.cookie =
      `${GEO_BYPASS_COOKIE}=${encodeURIComponent(unlock)}; path=/${domainAttr}; SameSite=Strict`;

    // Clean the URL without a reload
    params.delete("geo_unlock");
    const qs     = params.toString();
    const newUrl = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState({}, "", newUrl);
  }, []);

  return null;
}
