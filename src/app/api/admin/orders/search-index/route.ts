import { NextResponse } from "next/server";
import { loadOrdersSearchIndex } from "@/data/admin/storage";
import { requireApiAnyPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lightweight status only — never rebuild here (avoids nginx 502 timeouts). */
export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;

  const file = loadOrdersSearchIndex();
  return NextResponse.json({
    builtAt: file.builtAt || null,
    count: file.entries.length,
    ready: file.entries.length > 0,
  });
}
