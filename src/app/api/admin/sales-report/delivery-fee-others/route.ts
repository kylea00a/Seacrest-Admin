import { NextResponse } from "next/server";
import { getClaimCalendarYmd } from "@/data/admin/orderClaim";
import { loadOrderAdjustments, loadOrderClaims } from "@/data/admin/storage";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const s = start <= end ? start : end;
  const e = start <= end ? end : start;

  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims();

  const byDay: Record<string, number> = {};
  const items: Array<{ date: string; invoiceNumber: string; amount: number }> = [];

  for (const [invoiceNumber, adj] of Object.entries(adjustments)) {
    const amt = adj?.lineDetails?.deliveryFeeOthers ?? 0;
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const claimDay = getClaimCalendarYmd(invoiceNumber, claims as any);
    if (!claimDay) continue;
    if (claimDay < s || claimDay > e) continue;
    byDay[claimDay] = (byDay[claimDay] ?? 0) + amt;
    items.push({ date: claimDay, invoiceNumber, amount: amt });
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNumber.localeCompare(b.invoiceNumber));

  return NextResponse.json({ start: s, end: e, byDay, items });
}

