import { NextResponse } from "next/server";
import { sliceSalesSummaryCacheForMonth } from "@/data/admin/salesSummaryCache";
import { loadSalesSummaryCache } from "@/data/admin/storage";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}$/.test(v);
}

/** Read prebuilt cache only — never compute here (avoids nginx 502). */
export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "salesReport");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  if (!isMonth(month)) {
    return NextResponse.json({ error: "Missing/invalid `month` (YYYY-MM)." }, { status: 400 });
  }

  const cache = loadSalesSummaryCache();
  const ready = Boolean(cache.builtAt) && (Object.keys(cache.salesByDay).length > 0 || Object.keys(cache.inventoryByClaimDay).length > 0);
  const { salesDays, inventoryByClaimDay } = sliceSalesSummaryCacheForMonth(month);

  return NextResponse.json({
    month,
    builtAt: cache.builtAt || null,
    ready,
    salesDays,
    inventoryByClaimDay,
  });
}
