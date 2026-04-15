import { NextResponse } from "next/server";
import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { resolvePackageNameFromPrice } from "@/data/admin/packageResolve";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { loadAdminSettings, loadOrderAdjustments, loadOrderClaims, loadOrdersIndex } from "@/data/admin/storage";
import { requireApiAnyPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const qRaw = (url.searchParams.get("q") ?? "").trim();
  const q = qRaw.toLowerCase();
  if (!q) return NextResponse.json({ rows: [], count: 0, q: qRaw, claims: loadOrderClaims() });

  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 200) || 200));

  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims();
  const packages = loadAdminSettings().packages;

  const dates = index.map((i) => i.date).sort((a, b) => b.localeCompare(a));
  const dayPayloads = await Promise.all(
    dates.map(async (sourceDate) => {
      const dayUnknown = await readOrdersDayAsync(sourceDate);
      return { sourceDate, dayUnknown };
    }),
  );

  const rows: Array<Record<string, unknown>> = [];

  for (const { sourceDate, dayUnknown } of dayPayloads) {
    if (rows.length >= limit) break;
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
      if (rows.length >= limit) break;
      if (typeof r !== "object" || r === null) continue;
      const rec = r as Record<string, unknown>;

      const invoiceNumber = typeof rec["invoiceNumber"] === "string" ? (rec["invoiceNumber"] as string).trim() : "";
      if (!invoiceNumber) continue;

      const adj = adjustments[invoiceNumber];
      const mergedRec = mergeOrderRowWithAdjustment(rec as Record<string, unknown>, adj);
      const effectiveDate = adj?.effectiveDate ?? sourceDate;

      const hay = [
        mergedRec["distributorId"],
        mergedRec["distributorName"],
        mergedRec["shippingFullName"],
        mergedRec["ordererName"],
        mergedRec["invoiceNumber"],
      ]
        .map((v) => (typeof v === "string" ? v : ""))
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!hay.includes(q)) continue;

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
        status: adj?.status ?? (typeof mergedRec["status"] === "string" ? (mergedRec["status"] as string) : ""),
        adjusted: !!adj,
      });
    }
  }

  rows.sort((a, b) => {
    const da = String(a["date"] ?? "");
    const db = String(b["date"] ?? "");
    if (da !== db) return db.localeCompare(da);
    const ra = Number(a["rowIndex"] ?? 0);
    const rb = Number(b["rowIndex"] ?? 0);
    if (ra !== rb) return ra - rb;
    return String(a["invoiceNumber"] ?? "").localeCompare(String(b["invoiceNumber"] ?? ""));
  });

  return NextResponse.json({ rows, count: rows.length, q: qRaw, claims });
}

