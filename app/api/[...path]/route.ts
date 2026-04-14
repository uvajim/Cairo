import { type NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:3001";

// Headers that must never be forwarded to the upstream backend.
const DROP_REQUEST_HEADERS = new Set([
  "host",
  "cookie",
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
  "set-cookie",
  "x-powered-by",
  "server",
]);

// Allowed path prefix — every proxied request must start with /api/
const API_PREFIX = "/api/";

async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;

  // Only forward paths that start with /api/ and contain no path-traversal
  // sequences. req.nextUrl already normalises the URL, but double-check.
  if (!pathname.startsWith(API_PREFIX) || pathname.includes("..")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const target = `${BACKEND}${pathname}${search}`;

  // Strip client-supplied headers that could leak credentials or spoof
  // internal metadata; only forward innocuous transport/content headers.
  const forwardHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    if (!DROP_REQUEST_HEADERS.has(key.toLowerCase())) {
      forwardHeaders.set(key, value);
    }
  }

  const upstream = await fetch(target, {
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

export const GET     = proxy;
export const POST    = proxy;
export const PUT     = proxy;
export const PATCH   = proxy;
export const DELETE  = proxy;
export const OPTIONS = proxy;
