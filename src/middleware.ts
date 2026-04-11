import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const DEV_SECRET = "dev-insecure-admin-secret-min-16ch";

function secretBytes(): Uint8Array {
  const s = process.env.ADMIN_AUTH_SECRET || (process.env.NODE_ENV === "development" ? DEV_SECRET : "");
  if (!s || s.length < 16) return new TextEncoder().encode(DEV_SECRET);
  return new TextEncoder().encode(s);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/admin/auth/")) {
    return NextResponse.next();
  }

  if (!pathname.startsWith("/admin") && !pathname.startsWith("/api/admin")) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/admin/setup") ||
    pathname.startsWith("/admin/forbidden")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  try {
    await jwtVerify(token, secretBytes(), { algorithms: ["HS256"] });
  } catch {
    if (pathname.startsWith("/api/admin")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
