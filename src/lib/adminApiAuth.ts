import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AdminPermissionKey } from "@/data/admin/adminPermissions";
import {
  accountHasPermission,
  loadAccountById,
  normalizePermissions,
  type AdminAccountRecord,
} from "@/data/admin/accountsStore";
import { ADMIN_SESSION_COOKIE_NAME, verifyAdminSessionToken } from "./adminJwt";

export type SafeAdminAccount = Omit<AdminAccountRecord, "passwordHash">;

export function toSafeAccount(a: AdminAccountRecord): SafeAdminAccount {
  const { passwordHash: _, ...rest } = a;
  return { ...rest, permissions: normalizePermissions(rest.permissions) };
}

async function getTokenFromRequest(request: Request): Promise<string | null> {
  const fromCookie = request.headers.get("cookie");
  if (fromCookie) {
    const m = fromCookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return decodeURIComponent(m[1]);
  }
  return null;
}

export async function getAdminAccountFromRequest(request: Request): Promise<AdminAccountRecord | null> {
  const token = await getTokenFromRequest(request);
  if (!token) return null;
  const v = await verifyAdminSessionToken(token);
  if (!v) return null;
  return loadAccountById(v.sub);
}

/** Any authenticated admin (used for read-only settings, etc.). */
export async function requireApiSession(request: Request): Promise<AdminAccountRecord | NextResponse> {
  const a = await getAdminAccountFromRequest(request);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return a;
}

export async function requireApiPermission(
  request: Request,
  key: AdminPermissionKey,
): Promise<AdminAccountRecord | NextResponse> {
  const a = await getAdminAccountFromRequest(request);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!accountHasPermission(a, key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return a;
}

export async function requireSuperadmin(request: Request): Promise<AdminAccountRecord | NextResponse> {
  const a = await getAdminAccountFromRequest(request);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!a.isSuperadmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return a;
}

export async function requireApiAnyPermission(
  request: Request,
  keys: AdminPermissionKey[],
): Promise<AdminAccountRecord | NextResponse> {
  const a = await getAdminAccountFromRequest(request);
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (a.isSuperadmin) return a;
  if (keys.some((k) => accountHasPermission(a, k))) return a;
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Server Components: read session cookie via next/headers */
export async function getAdminAccountFromCookies(): Promise<AdminAccountRecord | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const v = await verifyAdminSessionToken(token);
  if (!v) return null;
  return loadAccountById(v.sub);
}
