import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, and other static asset files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

const PUBLIC_ROUTE_PREFIXES = ["/sign-in", "/set-password", "/checkin"];

const SESSION_COOKIE_NAMES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function hasSessionCookie(request: NextRequest): boolean {
  for (const name of SESSION_COOKIE_NAMES) {
    const cookie = request.cookies.get(name);
    if (cookie) {
      try {
        const decoded = decodeURIComponent(cookie.value).trim();
        if (decoded.length > 0) {
          return true;
        }
      } catch {
        if (cookie.value.trim().length > 0) {
          return true;
        }
      }
    }
  }

  // Fallback check against raw cookie header
  const rawCookie = request.headers.get("cookie");
  if (rawCookie) {
    for (const name of SESSION_COOKIE_NAMES) {
      const match = rawCookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
      if (match && match[1]) {
        try {
          const val = decodeURIComponent(match[1]).trim();
          if (val.length > 0) {
            return true;
          }
        } catch {
          if (match[1].trim().length > 0) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  // 1. Exclude API endpoints, Next.js internals, and static assets with extensions
  if (
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname.startsWith("/_next/") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // 2. Exempt public pages from authentication checks
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // 3. Optimistic check: if session cookie is present, allow access
  if (hasSessionCookie(request)) {
    return NextResponse.next();
  }

  // 4. Redirect unauthenticated user to /sign-in?next=..., preserving path and query
  const target = `${pathname}${search}`;
  const signInUrl = request.nextUrl.clone();
  signInUrl.pathname = "/sign-in";
  signInUrl.search = "";
  signInUrl.searchParams.set("next", target);

  return NextResponse.redirect(signInUrl);
}

export default proxy;
