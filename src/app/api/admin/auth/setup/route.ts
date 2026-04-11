import { NextResponse } from "next/server";
import { accountCount, createAccount } from "@/data/admin/accountsStore";
import {
  ADMIN_SESSION_COOKIE_NAME,
  adminSessionCookieSecure,
  signAdminSession,
} from "@/lib/adminJwt";
import { toSafeAccount } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** First-run only: create the initial superadmin. */
export async function POST(request: Request) {
  if (accountCount() > 0) {
    return NextResponse.json({ error: "Setup already completed." }, { status: 400 });
  }
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    displayName?: string;
  };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "Superadmin";
  if (!email || password.length < 8) {
    return NextResponse.json(
      { error: "Valid email and password (min 8 characters) required." },
      { status: 400 },
    );
  }
  try {
    const account = await createAccount({
      email,
      password,
      displayName: displayName || "Superadmin",
      isSuperadmin: true,
    });
    const token = await signAdminSession(account.id);
    const res = NextResponse.json({ ok: true, account: toSafeAccount(account) });
    res.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      path: "/",
      maxAge: 12 * 60 * 60,
      sameSite: "lax",
      secure: adminSessionCookieSecure(),
    });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Setup failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
