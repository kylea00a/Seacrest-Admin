import { NextResponse } from "next/server";
import { rebuildOrdersSearchIndexAll } from "@/data/admin/ordersSearchIndex";
import { requireApiAnyPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Explicit full rebuild (superadmin-style wait; run from deploy script when possible). */
export async function POST(req: Request) {
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;

  const count = await rebuildOrdersSearchIndexAll();
  return NextResponse.json({ ok: true, count });
}
