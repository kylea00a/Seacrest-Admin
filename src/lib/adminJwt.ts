import { SignJWT, jwtVerify } from "jose";

const COOKIE = "admin_session";

function getSecret(): Uint8Array {
  const s =
    process.env.ADMIN_AUTH_SECRET ||
    (process.env.NODE_ENV === "development" ? "dev-insecure-admin-secret-min-16ch" : "");
  if (!s || s.length < 16) {
    throw new Error(
      "ADMIN_AUTH_SECRET is missing or shorter than 16 characters. On a server (e.g. droplet), set it in the process environment or a .env file loaded at startup — not only on your laptop.",
    );
  }
  return new TextEncoder().encode(s);
}

export async function signAdminSession(accountId: string): Promise<string> {
  return new SignJWT({ sub: accountId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getSecret());
}

export async function verifyAdminSessionToken(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ["HS256"] });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) return null;
    return { sub };
  } catch {
    return null;
  }
}

/**
 * Browsers ignore `Secure` cookies on plain HTTP. In production behind HTTP only (no TLS),
 * set `ADMIN_SESSION_INSECURE_HTTP=1` so login can set the session cookie.
 */
export function adminSessionCookieSecure(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.ADMIN_SESSION_INSECURE_HTTP === "1") return false;
  return true;
}

export { COOKIE as ADMIN_SESSION_COOKIE_NAME };
