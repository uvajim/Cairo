import { type NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:3001";

// Headers that must never be forwarded to the upstream backend.
const DROP_REQUEST_HEADERS = new Set([
  "host",
  "cookie",              // raw browser cookies must not reach the backend; we inject trusted headers instead
  "authorization",
  "x-forwarded-for",
  "x-real-ip",
  "x-vercel-id",
  "x-vercel-deployment-url",
  "x-vercel-forwarded-for",
]);

// Headers that must never be forwarded back to the client.
const DROP_RESPONSE_HEADERS = new Set([
  "content-encoding", // Next.js re-encodes; avoid double-gzip
  "set-cookie",       // we manage session cookies here in the proxy, not in the backend
  "x-powered-by",
  "server",
]);

// Allowed path prefix — every proxied request must start with /api/
const API_PREFIX = "/api/";

const PB_AUTH_VERIFY  = "/api/portfolio-balance/auth/verify";
const PB_AUTH_LOGOUT  = "/api/portfolio-balance/auth/logout";
const PB_PREFIX       = "/api/portfolio-balance/";
const SESSION_COOKIE  = "maritime_session";

const BK_AUTH_LOGIN   = "/api/banking/auth/login";
const BK_AUTH_LOGOUT  = "/api/banking/auth/logout";
const BK_PREFIX       = "/api/banking/";
const BK_SESSION_COOKIE = "banking_session";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;

  // Only forward paths that start with /api/ and contain no path-traversal
  // sequences. req.nextUrl already normalises the URL, but double-check.
  if (!pathname.startsWith(API_PREFIX) || pathname.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Auth/verify — backend returns the token in the body; we set the HttpOnly
  //   cookie here using Next.js's own API so it reliably reaches the browser.
  if (req.method === "POST" && pathname === PB_AUTH_VERIFY) {
    const upstream = await fetch(`${BACKEND}${pathname}`, {
      method: "POST",
      headers: buildForwardHeaders(req),
      body: req.body,
      // @ts-expect-error — Node.js fetch supports duplex for streaming bodies
      duplex: "half",
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data?.token) {
      return NextResponse.json(data ?? { error: "verification failed" }, { status: upstream.status });
    }
    const res = NextResponse.json({ success: true });
    res.cookies.set(SESSION_COOKIE, data.token, {
      httpOnly: true,
      sameSite: "strict",
      secure:   process.env.NODE_ENV === "production",
      path:     "/api/portfolio-balance",
      maxAge:   24 * 60 * 60,
    });
    return res;
  }

  // ── Auth/logout — clear the cookie and notify the backend to invalidate the session.
  if (req.method === "POST" && pathname === PB_AUTH_LOGOUT) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const headers = buildForwardHeaders(req);
    if (token) headers.set("x-maritime-session", token);
    await fetch(`${BACKEND}${pathname}`, { method: "POST", headers }).catch(() => null);
    const res = NextResponse.json({ success: true });
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }

  // ── Banking login — backend returns { token, user }; proxy sets HttpOnly cookie.
  if (req.method === "POST" && pathname === BK_AUTH_LOGIN) {
    const upstream = await fetch(`${BACKEND}${pathname}`, {
      method: "POST",
      headers: buildForwardHeaders(req),
      body: req.body,
      // @ts-expect-error — Node.js fetch supports duplex for streaming bodies
      duplex: "half",
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data?.token) {
      return NextResponse.json(data ?? { error: "login failed" }, { status: upstream.status });
    }
    const res = NextResponse.json({ success: true, user: data.user });
    res.cookies.set(BK_SESSION_COOKIE, data.token, {
      httpOnly: true,
      sameSite: "strict",
      secure:   process.env.NODE_ENV === "production",
      path:     "/api/banking",
      maxAge:   24 * 60 * 60,
    });
    return res;
  }

  // ── Banking logout — clear the cookie and invalidate the session.
  if (req.method === "POST" && pathname === BK_AUTH_LOGOUT) {
    const token = req.cookies.get(BK_SESSION_COOKIE)?.value;
    const headers = buildForwardHeaders(req);
    if (token) headers.set("x-banking-session", token);
    await fetch(`${BACKEND}${pathname}`, { method: "POST", headers }).catch(() => null);
    const res = NextResponse.json({ success: true });
    res.cookies.delete(BK_SESSION_COOKIE);
    return res;
  }

  const forwardHeaders = buildForwardHeaders(req);

  // ── Inject session tokens as trusted internal headers.
  if (pathname.startsWith(PB_PREFIX)) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (token) forwardHeaders.set("x-maritime-session", token);
  }
  if (pathname.startsWith(BK_PREFIX)) {
    const token = req.cookies.get(BK_SESSION_COOKIE)?.value;
    if (token) forwardHeaders.set("x-banking-session", token);
  }

  const upstream = await fetch(`${BACKEND}${pathname}${search}`, {
    method:  req.method,
    headers: forwardHeaders,
    body:    req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error — Node.js fetch supports duplex for streaming bodies
    duplex:  "half",
  });

  const resHeaders = new Headers();
  for (const [key, value] of upstream.headers.entries()) {
    if (!DROP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      resHeaders.set(key, value);
    }
  }

  return new NextResponse(upstream.body, {
    status:  upstream.status,
    headers: resHeaders,
  });
}

function buildForwardHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of req.headers.entries()) {
    if (!DROP_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  }
  return headers;
}

export const GET     = proxy;
export const POST    = proxy;
export const PUT     = proxy;
export const PATCH   = proxy;
export const DELETE  = proxy;
export const OPTIONS = proxy;
