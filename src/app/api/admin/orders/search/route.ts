import { NextResponse } from "next/server";
import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { resolvePackageNameFromPrice } from "@/data/admin/packageResolve";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { loadAdminSettings, loadOrderAdjustments, loadOrderClaims, loadOrdersIndex } from "@/data/admin/storage";
import { orderRowMatchesSearchQuery } from "@/lib/orderSearchMatch";
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

  const rows: Array<Record<string, unknown>> = [];

  const startedAt = Date.now();
  const maxMs = Math.min(8000, Math.max(800, Number(url.searchParams.get("maxMs") ?? 3200) || 3200));
  let scannedDays = 0;
  const dates = index.map((i) => i.date).sort((a, b) => b.localeCompare(a));

  const batchSize = 8;
  outer: for (let bi = 0; bi < dates.length; bi += batchSize) {
    if (rows.length >= limit) break outer;
    if (Date.now() - startedAt > maxMs) break outer;

    const batch = dates.slice(bi, bi + batchSize);
    scannedDays += batch.length;
    const dayPayloads = await Promise.all(batch.map((d) => readOrdersDayAsync(d)));

    for (let j = 0; j < batch.length; j++) {
      if (rows.length >= limit) break outer;
      if (Date.now() - startedAt > maxMs) break outer;

      const sourceDate = batch[j]!;
      const dayUnknown = dayPayloads[j];
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
        if (rows.length >= limit) break outer;
        if (typeof r !== "object" || r === null) continue;
        const rec = r as Record<string, unknown>;

        const invoiceNumber = typeof rec["invoiceNumber"] === "string" ? (rec["invoiceNumber"] as string).trim() : "";
        if (!invoiceNumber) continue;

        const adj = adjustments[invoiceNumber];
        const mergedRec = mergeOrderRowWithAdjustment(rec as Record<string, unknown>, adj);
        const effectiveDate = adj?.effectiveDate ?? sourceDate;

        if (
          !orderRowMatchesSearchQuery(qRaw, {
            distributorId: typeof mergedRec["distributorId"] === "string" ? mergedRec["distributorId"] : "",
            distributorName: typeof mergedRec["distributorName"] === "string" ? mergedRec["distributorName"] : "",
            shippingFullName: typeof mergedRec["shippingFullName"] === "string" ? mergedRec["shippingFullName"] : "",
            ordererName: typeof mergedRec["ordererName"] === "string" ? mergedRec["ordererName"] : "",
            invoiceNumber,
          })
        ) {
          continue;
        }

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

  const partial = scannedDays < dates.length && Date.now() - startedAt >= maxMs;
  return NextResponse.json({ rows, count: rows.length, q: qRaw, claims, partial, scannedDays });
}

