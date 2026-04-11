import { NextResponse } from "next/server";
import { createAccount, deleteAccount, listAccounts, updateAccount } from "@/data/admin/accountsStore";
import type { AdminPermissionKey } from "@/data/admin/adminPermissions";
import { ADMIN_PERMISSION_KEYS } from "@/data/admin/adminPermissions";
import { requireSuperadmin, toSafeAccount } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const gate = await requireSuperadmin(request);
  if (gate instanceof NextResponse) return gate;
  const rows = listAccounts().map(toSafeAccount);
  return NextResponse.json({ accounts: rows });
}

export async function POST(request: Request) {
  const gate = await requireSuperadmin(request);
  if (gate instanceof NextResponse) return gate;
  const body = (await request.json()) as {
    email?: string;
    password?: string;
    displayName?: string;
    isSuperadmin?: boolean;
    permissions?: Partial<Record<AdminPermissionKey, boolean>>;
  };
  try {
    const account = await createAccount({
      email: body.email ?? "",
      password: body.password ?? "",
      displayName: body.displayName ?? "",
      isSuperadmin: Boolean(body.isSuperadmin),
      permissions: body.permissions,
    });
    return NextResponse.json({ account: toSafeAccount(account) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create account.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireSuperadmin(request);
  if (gate instanceof NextResponse) return gate;
  const body = (await request.json()) as {
    id?: string;
    displayName?: string;
    isSuperadmin?: boolean;
    permissions?: Partial<Record<AdminPermissionKey, boolean>>;
    password?: string;
  };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  if (gate.id === id && typeof body.isSuperadmin === "boolean" && !body.isSuperadmin) {
    const others = listAccounts().filter((a) => a.id !== id && a.isSuperadmin);
    if (others.length === 0) {
      return NextResponse.json(
        { error: "Cannot remove the last superadmin." },
        { status: 400 },
      );
    }
  }

  const next = updateAccount(id, {
    displayName: body.displayName,
    isSuperadmin: body.isSuperadmin,
    permissions: body.permissions,
    password: body.password,
  });
  if (!next) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({ account: toSafeAccount(next) });
}

export async function DELETE(request: Request) {
  const gate = await requireSuperadmin(request);
  if (gate instanceof NextResponse) return gate;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  if (gate.id === id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const target = listAccounts().find((a) => a.id === id);
  if (target?.isSuperadmin) {
    const supers = listAccounts().filter((a) => a.isSuperadmin);
    if (supers.length <= 1) {
      return NextResponse.json({ error: "Cannot delete the only superadmin." }, { status: 400 });
    }
  }

  const ok = deleteAccount(id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
