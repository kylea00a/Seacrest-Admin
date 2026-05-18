import { NextResponse } from "next/server";
import { computeInventoryOutByClaimDayForRange } from "@/data/admin/inventoryCompute";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "salesReport");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (!isDateOnly(start) || !isDateOnly(end)) {
    return NextResponse.json({ error: "Missing/invalid `start` and `end` (YYYY-MM-DD)." }, { status: 400 });
  }

  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;

  const inventoryByClaimDay = await computeInventoryOutByClaimDayForRange(rangeStart, rangeEnd);

  return NextResponse.json({
    start: rangeStart,
    end: rangeEnd,
    inventoryByClaimDay,
  });
}
