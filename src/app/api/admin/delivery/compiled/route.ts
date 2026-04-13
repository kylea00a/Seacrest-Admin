import { NextResponse } from "next/server";
import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { getClaimCalendarYmd, isNonPickupDelivery } from "@/data/admin/orderClaim";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { resolvePackageNameFromPrice } from "@/data/admin/packageResolve";
import { loadAdminSettings, loadOrderAdjustments, loadOrderClaims, loadOrdersIndex } from "@/data/admin/storage";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function paidFromStatus(status: string): boolean {
  const s = (status ?? "").toLowerCase();
  if (!s) return false;
  if (s.includes("cancel")) return false;
  if (s.includes("paid")) return true;
  if (s.includes("complete")) return true;
  return false;
}

function parsePrice(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function priceFromPackageCode(packageName: string): number {
  const m = packageName.match(/-P(\d+(?:\.\d+)?)/i) ?? packageName.match(/\bP(\d+(?:\.\d+)?)\b/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const startRaw = url.searchParams.get("start");
  const endRaw = url.searchParams.get("end");

  if (!isDateOnly(startRaw) || !isDateOnly(endRaw)) {
    return NextResponse.json({ error: "Missing/invalid `start` and `end` (YYYY-MM-DD)." }, { status: 400 });
  }

  const start = startRaw <= endRaw ? startRaw : endRaw;
  const end = startRaw <= endRaw ? endRaw : startRaw;

  // 1) Build the set of invoices whose claim calendar day is within [start, end].
  const claims = loadOrderClaims();
  const need = new Set<string>();
  for (const inv of Object.keys(claims)) {
    const day = getClaimCalendarYmd(inv, claims);
    if (day && day >= start && day <= end) need.add(inv);
  }

  if (need.size === 0) {
    return NextResponse.json({ rows: [], count: 0, start, end });
  }

  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();
  const packages = loadAdminSettings().packages;

  const dates = [...new Set(index.map((i) => i.date))].sort((a, b) => b.localeCompare(a));
  const out: Array<Record<string, unknown>> = [];

  // 2) Scan import days newest→oldest until we find all needed invoices.
  for (const sourceDate of dates) {
    if (need.size === 0) break;
    const dayUnknown = await readOrdersDayAsync(sourceDate);
    const day =
      typeof dayUnknown === "object" && dayUnknown !== null ? (dayUnknown as Record<string, unknown>) : null;
    const parsed =
      day && typeof day["parsed"] === "object" && day["parsed"] !== null ? (day["parsed"] as Record<string, unknown>) : null;
    const parsedRows = parsed?.["rows"];
    if (!Array.isArray(parsedRows)) continue;

    for (const r of parsedRows) {
      if (need.size === 0) break;
      if (typeof r !== "object" || r === null) continue;
      const rec = r as Record<string, unknown>;
      const invoiceNumber = typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
      if (!invoiceNumber || !need.has(invoiceNumber)) continue;

      // Ensure we only return paid delivery rows for Delivery schedule.
      const adj = adjustments[invoiceNumber];
      const mergedRec = mergeOrderRowWithAdjustment(rec as Record<string, unknown>, adj);
      const status = adj?.status ?? (typeof mergedRec["status"] === "string" ? (mergedRec["status"] as string) : "");
      const isPaid = paidFromStatus(status);
      const dm =
        typeof mergedRec["deliveryMethod"] === "string" ? (mergedRec["deliveryMethod"] as string).trim() : "";
      if (!isPaid || !isNonPickupDelivery(dm)) {
        need.delete(invoiceNumber);
        continue;
      }

      const packageNameRaw =
        typeof mergedRec["packageName"] === "string" ? (mergedRec["packageName"] as string).trim() : "";
      const pkgPriceFromRow = parsePrice(mergedRec["packagePrice"]);
      const pkgPriceFromCode = priceFromPackageCode(packageNameRaw);
      const packagePrice = pkgPriceFromRow || pkgPriceFromCode;
      const resolvedPackageName = resolvePackageNameFromPrice(packagePrice, packages);
      const packageName = resolvedPackageName || packageNameRaw;

      // Keep `date` compatible with existing compiled consumers (effective date).
      const effectiveDate = adj?.effectiveDate ?? sourceDate;

      out.push({
        ...mergedRec,
        packagePrice,
        packageName,
        date: effectiveDate,
        sourceDate,
        status,
        isPaid,
        adjusted: !!adj,
      });

      need.delete(invoiceNumber);
    }
  }

  // Stable-ish sort: claim-day is the schedule dimension, but we still sort by effective date desc + rowIndex.
  out.sort((a, b) => {
    const da = String(a["date"] ?? "");
    const db = String(b["date"] ?? "");
    if (da !== db) return db.localeCompare(da);
    const ra = Number(a["rowIndex"] ?? 0);
    const rb = Number(b["rowIndex"] ?? 0);
    if (ra !== rb) return ra - rb;
    return String(a["invoiceNumber"] ?? "").localeCompare(String(b["invoiceNumber"] ?? ""));
  });

  return NextResponse.json({ rows: out, count: out.length, start, end });
}

