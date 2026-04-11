import { SignJWT, jwtVerify } from "jose";

const COOKIE = "admin_session";

function getSecret(): Uint8Array {
  const s =
    process.env.ADMIN_AUTH_SECRET ||
    (process.env.NODE_ENV === "development" ? "dev-insecure-admin-secret-min-16ch" : "");
  if (!s || s.length < 16) {
    throw new Error(
      "Set ADMIN_AUTH_SECRET in .env.local (at least 16 characters) for admin authentication.",
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

export { COOKIE as ADMIN_SESSION_COOKIE_NAME };
