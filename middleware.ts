import { NextRequest, NextResponse } from "next/server";

const GEO_BLOCK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Not Available — Maritime</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0a0a0a;
      color: #ededed;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .card {
      width: 100%;
      max-width: 400px;
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 20px;
      padding: 40px 32px 36px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .logo {
      width: 56px;
      height: 56px;
      object-fit: contain;
      margin-bottom: 16px;
    }

    .brand {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #ededed;
      margin-bottom: 28px;
    }

    .divider {
      width: 100%;
      height: 1px;
      background: #1f2937;
      margin-bottom: 28px;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ff500018;
      color: #ff5000;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid #ff500030;
      margin-bottom: 20px;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #ff5000;
    }

    h1 {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #f1f5f9;
      margin-bottom: 12px;
      line-height: 1.2;
    }

    p {
      font-size: 14px;
      color: #9ca3af;
      line-height: 1.65;
      max-width: 300px;
    }

    footer {
      margin-top: 32px;
      font-size: 11px;
      color: #374151;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="/maritime.png" alt="Maritime" />
    <div class="brand">Maritime</div>
    <div class="divider"></div>
    <div class="status-badge">
      <span class="status-dot"></span>
      Unavailable in your region
    </div>
    <h1>Service Not Available</h1>
    <p>Maritime Exchange is not accessible from the United States due to regulatory requirements.</p>
  </div>
  <footer>HTTP 451 &mdash; Unavailable For Legal Reasons</footer>
</body>
</html>`;

const GEO_BYPASS_PASSWORD = process.env.GEO_BYPASS_PASSWORD ?? "";
const GEO_BYPASS_COOKIE = "geo_bypass";

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // If a bypass password is provided in the query string, validate and set cookie
  const unlockParam = searchParams.get("geo_unlock");
  if (GEO_BYPASS_PASSWORD && unlockParam !== null) {
    if (unlockParam === GEO_BYPASS_PASSWORD) {
      const url = request.nextUrl.clone();
      url.searchParams.delete("geo_unlock");
      const response = NextResponse.redirect(url);
      response.cookies.set(GEO_BYPASS_COOKIE, GEO_BYPASS_PASSWORD, {
        httpOnly: true,
        sameSite: "strict",
        path: "/",
        // Session cookie — expires when browser closes
      });
      return response;
    }
    // Wrong password — fall through to normal geo check
  }

  // If valid bypass cookie is present, skip geo check
  const bypassCookie = request.cookies.get(GEO_BYPASS_COOKIE)?.value;
  if (GEO_BYPASS_PASSWORD && bypassCookie === GEO_BYPASS_PASSWORD) {
    return NextResponse.next();
  }

  const country =
    request.geo?.country ??
    request.headers.get("x-vercel-ip-country") ??
    request.headers.get("cf-ipcountry");

  if (country === "US") {
    return new NextResponse(GEO_BLOCK_HTML, {
      status: 451,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)"],
};
