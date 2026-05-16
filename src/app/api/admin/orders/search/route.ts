import { NextResponse } from "next/server";
import { loadOrderClaims } from "@/data/admin/storage";
import { requireApiAnyPermission } from "@/lib/adminApiAuth";
import {
  SEARCH_HYDRATE_LIMIT,
  SEARCH_MIN_QUERY_LEN,
  searchOrdersFromIndex,
} from "@/lib/ordersSearchQuery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  const hydrateLimit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? SEARCH_HYDRATE_LIMIT) || SEARCH_HYDRATE_LIMIT),
  );

  if (!qRaw) {
    return NextResponse.json({ rows: [], count: 0, q: qRaw, claims: loadOrderClaims() });
  }

  if (qRaw.length < SEARCH_MIN_QUERY_LEN) {
    return NextResponse.json({
      rows: [],
      count: 0,
      q: qRaw,
      claims: loadOrderClaims(),
      matchCount: 0,
      truncated: false,
      indexReady: true,
      message: `Type at least ${SEARCH_MIN_QUERY_LEN} characters to search.`,
    });
  }

  const result = await searchOrdersFromIndex(qRaw, { hydrateLimit });
  const claims = loadOrderClaims();

  if (!result.indexReady) {
    return NextResponse.json({
      rows: [],
      count: 0,
      q: qRaw,
      claims,
      matchCount: 0,
      truncated: false,
      indexReady: false,
      error:
        "Search index is not built yet. Run deploy rebuild or POST /api/admin/orders/search-index/rebuild once.",
    });
  }

  return NextResponse.json({
    rows: result.rows,
    count: result.hydratedCount,
    q: qRaw,
    claims,
    matchCount: result.matchCount,
    truncated: result.truncated,
    indexReady: true,
    indexSize: result.indexSize,
  });
}
