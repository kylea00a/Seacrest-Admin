import { NextResponse } from "next/server";
import { hydrateOrdersFromIndexMatches } from "@/data/admin/ordersSearchHydrate";
import { rebuildOrdersSearchIndexAll } from "@/data/admin/ordersSearchIndex";
import { loadOrderClaims, loadOrdersSearchIndex } from "@/data/admin/storage";
import type { OrdersSearchIndexEntry } from "@/data/admin/types";
import { orderMatchesSearch } from "@/lib/orderSearchMatch";
import { requireApiAnyPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  if (!qRaw) {
    return NextResponse.json({ rows: [], count: 0, q: qRaw, claims: loadOrderClaims() });
  }

  const limit = Math.min(2000, Math.max(1, Number(url.searchParams.get("limit") ?? 1500) || 1500));

  let file = loadOrdersSearchIndex();
  if (file.entries.length === 0) {
    await rebuildOrdersSearchIndexAll();
    file = loadOrdersSearchIndex();
  }

  const matches: OrdersSearchIndexEntry[] = [];
  for (const e of file.entries) {
    if (matches.length >= limit) break;
    if (orderMatchesSearch(qRaw, e.searchBlob)) matches.push(e);
  }

  const rows = await hydrateOrdersFromIndexMatches(matches);
  const claims = loadOrderClaims();

  return NextResponse.json({
    rows,
    count: rows.length,
    q: qRaw,
    claims,
    indexSize: file.entries.length,
    matchCount: matches.length,
  });
}

/** Hydrate full rows for a client-filtered list (instant search UI). */
export async function POST(req: Request) {
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as { keys?: unknown };
  const keysRaw = body.keys;
  if (!Array.isArray(keysRaw)) {
    return NextResponse.json({ error: "Missing `keys` array." }, { status: 400 });
  }

  const file = loadOrdersSearchIndex();
  const byInvoice = new Map(file.entries.map((e) => [e.invoice, e]));

  const matches: OrdersSearchIndexEntry[] = [];
  const seen = new Set<string>();
  for (const k of keysRaw) {
    if (matches.length >= 2000) break;
    if (!k || typeof k !== "object") continue;
    const inv =
      typeof (k as Record<string, unknown>)["invoice"] === "string"
        ? ((k as Record<string, unknown>)["invoice"] as string).trim()
        : "";
    if (!inv || seen.has(inv)) continue;
    seen.add(inv);
    const entry = byInvoice.get(inv);
    if (entry) matches.push(entry);
  }

  const rows = await hydrateOrdersFromIndexMatches(matches);
  return NextResponse.json({ rows, count: rows.length, claims: loadOrderClaims() });
}
