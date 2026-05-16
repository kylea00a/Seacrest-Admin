import { NextResponse } from "next/server";
import { rebuildOrdersSearchIndexAll } from "@/data/admin/ordersSearchIndex";
import { loadOrdersSearchIndex } from "@/data/admin/storage";
import { requireApiAnyPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  let file = loadOrdersSearchIndex();

  if (url.searchParams.get("rebuild") === "1" || file.entries.length === 0) {
    const count = await rebuildOrdersSearchIndexAll();
    file = loadOrdersSearchIndex();
    return NextResponse.json({
      builtAt: file.builtAt,
      entries: file.entries,
      count,
      rebuilt: true,
    });
  }

  return NextResponse.json({
    builtAt: file.builtAt,
    entries: file.entries,
    count: file.entries.length,
    rebuilt: false,
  });
}
