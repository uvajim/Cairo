import { NextRequest, NextResponse } from "next/server";

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
    return new NextResponse(
      "This service is not available in the United States.",
      { status: 451 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
