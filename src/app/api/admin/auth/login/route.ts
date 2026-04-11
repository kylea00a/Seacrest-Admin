import { NextResponse } from "next/server";
import { loadAccountByEmail, verifyPassword } from "@/data/admin/accountsStore";
import { ADMIN_SESSION_COOKIE_NAME, signAdminSession } from "@/lib/adminJwt";
import { toSafeAccount } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required." }, { status: 400 });
  }
  const account = loadAccountByEmail(email);
  if (!account) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  const ok = await verifyPassword(account, password);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  const token = await signAdminSession(account.id);
  const res = NextResponse.json({ ok: true, account: toSafeAccount(account) });
  res.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    maxAge: 12 * 60 * 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
