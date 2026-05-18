import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import type { InventoryOutByChannel } from "@/data/admin/inventoryCompute";
import { computeInventoryOutByClaimDayForRange } from "@/data/admin/inventoryCompute";
import { resolvePackageNameFromPrice } from "@/data/admin/packageResolve";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { mergeIndexAndDiskOrderDates } from "@/data/admin/orders";
import { getClaimCalendarYmd } from "@/data/admin/orderClaim";
import {
  loadAdminSettings,
  loadOrderAdjustments,
  loadOrderClaims,
  loadOrdersIndex,
  loadSalesSummaryCache,
  saveSalesSummaryCache,
  type SalesSummaryCacheFile,
} from "@/data/admin/storage";
import { buildDaySalesDetails, type DaySalesDetail } from "@/lib/salesSummary";

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

/** All compiled order rows (for offline cache build). */
export async function compileAllOrdersRows(): Promise<Array<Record<string, unknown>>> {
  const index = loadOrdersIndex();
  const dates = mergeIndexAndDiskOrderDates(index.map((i) => i.date));
  const adjustments = loadOrderAdjustments();
  const packages = loadAdminSettings().packages;
  const rows: Array<Record<string, unknown>> = [];

  const batchSize = 32;
  for (let i = 0; i < dates.length; i += batchSize) {
    const batch = dates.slice(i, i + batchSize);
    const payloads = await Promise.all(batch.map((d) => readOrdersDayAsync(d)));
    for (let j = 0; j < batch.length; j++) {
      const sourceDate = batch[j]!;
      const dayUnknown = payloads[j];
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
        const invoiceNumber = typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
        if (!invoiceNumber) continue;

        const adj = adjustments[invoiceNumber];
        const mergedRec = mergeOrderRowWithAdjustment(rec, adj);
        const effectiveDate = adj?.effectiveDate ?? sourceDate;
        const status = adj?.status ?? (typeof mergedRec["status"] === "string" ? (mergedRec["status"] as string) : "");
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
          isPaid: paidFromStatus(status),
          adjusted: !!adj,
        });
      }
    }
  }

  return rows;
}

function buildDeliveryFeeOthersAll(): Record<string, number> {
  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims();
  const byDay: Record<string, number> = {};
  for (const [invoiceNumber, adj] of Object.entries(adjustments)) {
    const amt = adj?.lineDetails?.deliveryFeeOthers ?? 0;
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const claimDay = getClaimCalendarYmd(invoiceNumber, claims as Parameters<typeof getClaimCalendarYmd>[1]);
    if (!claimDay) continue;
    byDay[claimDay] = (byDay[claimDay] ?? 0) + amt;
  }
  return byDay;
}

function minMaxYmd(keys: string[]): { min: string; max: string } | null {
  const valid = keys.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (valid.length === 0) return null;
  valid.sort();
  return { min: valid[0]!, max: valid[valid.length - 1]! };
}

function salesByDayFromDetails(details: DaySalesDetail[]): Record<string, DaySalesDetail> {
  const out: Record<string, DaySalesDetail> = {};
  for (const d of details) out[d.date] = d;
  return out;
}

/** Full offline rebuild (deploy script / explicit API). */
export async function rebuildSalesSummaryCacheAll(): Promise<SalesSummaryCacheFile> {
  const rows = await compileAllOrdersRows();
  const settings = loadAdminSettings();
  const deliveryFeeOthersByDay = buildDeliveryFeeOthersAll();

  const salesDates = rows
    .map((r) => String(r["date"] ?? "").slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const salesSpan = minMaxYmd(salesDates);
  const claimSpan = minMaxYmd(Object.keys(deliveryFeeOthersByDay));

  if (!salesSpan && !claimSpan) {
    const empty: SalesSummaryCacheFile = {
      builtAt: new Date().toISOString(),
      salesByDay: {},
      inventoryByClaimDay: {},
    };
    saveSalesSummaryCache(empty);
    return empty;
  }

  let rangeStart = salesSpan?.min ?? claimSpan!.min;
  let rangeEnd = salesSpan?.max ?? claimSpan!.max;
  for (const span of [salesSpan, claimSpan]) {
    if (!span) continue;
    if (span.min < rangeStart) rangeStart = span.min;
    if (span.max > rangeEnd) rangeEnd = span.max;
  }

  const details = buildDaySalesDetails(
    rows,
    { start: rangeStart, end: rangeEnd },
    settings,
    deliveryFeeOthersByDay,
  );
  const salesByDay = salesByDayFromDetails(details);
  const inventoryByClaimDay = await computeInventoryOutByClaimDayForRange(rangeStart, rangeEnd);

  const file: SalesSummaryCacheFile = {
    builtAt: new Date().toISOString(),
    salesByDay,
    inventoryByClaimDay,
  };
  saveSalesSummaryCache(file);
  return file;
}

export function sliceSalesSummaryCacheForMonth(month: string): {
  salesDays: DaySalesDetail[];
  inventoryByClaimDay: Record<string, InventoryOutByChannel>;
} {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return { salesDays: [], inventoryByClaimDay: {} };
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) {
    return { salesDays: [], inventoryByClaimDay: {} };
  }
  const start = `${y}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const end = `${y}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const cache = loadSalesSummaryCache();
  const salesDays: DaySalesDetail[] = [];
  const inventoryByClaimDay: Record<string, InventoryOutByChannel> = {};

  for (const [d, detail] of Object.entries(cache.salesByDay)) {
    if (d >= start && d <= end) salesDays.push(detail);
  }
  for (const [d, inv] of Object.entries(cache.inventoryByClaimDay)) {
    if (d >= start && d <= end) inventoryByClaimDay[d] = inv;
  }

  salesDays.sort((a, b) => a.date.localeCompare(b.date));
  return { salesDays, inventoryByClaimDay };
}

/** Fire-and-forget refresh after imports (does not block HTTP). */
export function scheduleSalesSummaryCacheRebuild(): void {
  void rebuildSalesSummaryCacheAll().catch((err) => {
    console.error("[sales-summary-cache] rebuild failed:", err);
  });
}
