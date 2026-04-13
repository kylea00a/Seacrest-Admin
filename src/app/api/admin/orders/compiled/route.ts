import { NextResponse } from "next/server";
import {
  syncAutoDeliveryClaimsFromCompiledRows,
  syncAutoPickupClaimsFromCompiledRows,
} from "@/data/admin/autoPickupClaim";
import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { resolvePackageNameFromPrice } from "@/data/admin/packageResolve";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { loadAdminSettings, loadOrderAdjustments, loadOrderClaims, loadOrdersIndex } from "@/data/admin/storage";
import { requireApiAnyPermission } from "@/lib/adminApiAuth";

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
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const startRaw = url.searchParams.get("start");
  const endRaw = url.searchParams.get("end");

  if (!isDateOnly(startRaw) || !isDateOnly(endRaw)) {
    return NextResponse.json({ error: "Missing/invalid `start` and `end` (YYYY-MM-DD)." }, { status: 400 });
  }

  const start = startRaw <= endRaw ? startRaw : endRaw;
  const end = startRaw <= endRaw ? endRaw : startRaw;

  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();
  const packages = loadAdminSettings().packages;

  const dates = index
    .map((i) => i.date)
    .sort((a, b) => b.localeCompare(a));

  /** Import files whose day key falls in the requested range (ISO strings sort correctly). */
  const datesInRange = dates.filter((d) => d >= start && d <= end);

  const dayPayloads = await Promise.all(
    datesInRange.map(async (sourceDate) => {
      const dayUnknown = await readOrdersDayAsync(sourceDate);
      return { sourceDate, dayUnknown };
    })
  );

  const rows: Array<Record<string, unknown>> = [];

  for (const { sourceDate, dayUnknown } of dayPayloads) {
    const day =
      typeof dayUnknown === "object" && dayUnknown !== null
        ? (dayUnknown as Record<string, unknown>)
        : null;
    const parsed =
      day && typeof day["parsed"] === "object" && day["parsed"] !== null
        ? (day["parsed"] as Record<string, unknown>)
        : null;
    const parsedRows = parsed?.["rows"];
    if (!Array.isArray(parsedRows)) continue;

    for (const r of parsedRows) {
      if (typeof r !== "object" || r === null) continue;
      const rec = r as Record<string, unknown>;
      const invoiceNumber = typeof rec["invoiceNumber"] === "string" ? (rec["invoiceNumber"] as string).trim() : "";
      if (!invoiceNumber) continue;

      const adj = adjustments[invoiceNumber];
      const mergedRec = mergeOrderRowWithAdjustment(rec as Record<string, unknown>, adj);
      const effectiveDate = adj?.effectiveDate ?? sourceDate;
      if (effectiveDate < start || effectiveDate > end) continue;

      const status = adj?.status ?? (typeof mergedRec["status"] === "string" ? (mergedRec["status"] as string) : "");
      const isPaid = paidFromStatus(status);

      const packageNameRaw =
        typeof mergedRec["packageName"] === "string" ? (mergedRec["packageName"] as string).trim() : "";
      const pkgPriceFromRow = parsePrice(mergedRec["packagePrice"]);
      const pkgPriceFromCode = priceFromPackageCode(packageNameRaw);
      const packagePrice = pkgPriceFromRow || pkgPriceFromCode;
      const resolvedPackageName = resolvePackageNameFromPrice(packagePrice, packages);
      const packageName = resolvedPackageName || packageNameRaw;

      rows.push({
        ...mergedRec,
        packagePrice,
        packageName,
        date: effectiveDate,
        sourceDate,
        status,
        isPaid,
        adjusted: !!adj,
      });
    }
  }

  // Sort newest effective date first, then original sheet row order (matches import preview), then invoice
  rows.sort((a, b) => {
    const da = String(a["date"] ?? "");
    const db = String(b["date"] ?? "");
    if (da !== db) return db.localeCompare(da);
    const ra = Number(a["rowIndex"] ?? 0);
    const rb = Number(b["rowIndex"] ?? 0);
    if (ra !== rb) return ra - rb;
    return String(a["invoiceNumber"] ?? "").localeCompare(String(b["invoiceNumber"] ?? ""));
  });

  syncAutoPickupClaimsFromCompiledRows(rows);
  syncAutoDeliveryClaimsFromCompiledRows(rows);
  const claims = loadOrderClaims();

  return NextResponse.json({ rows, count: rows.length, start, end, claims });
}

