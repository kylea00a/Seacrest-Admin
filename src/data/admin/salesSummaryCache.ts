import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import type { InventoryOutByChannel } from "@/data/admin/inventoryCompute";
import {
  accumulateInventoryOutByClaimRow,
  fillMissingInventoryOutCrossDayClaims,
} from "@/data/admin/inventoryCompute";
import { resolvePackageNameFromPrice } from "@/data/admin/packageResolve";
import { mergeIndexAndDiskOrderDates, readOrdersDayAsync } from "@/data/admin/orders";
import { getClaimCalendarYmd } from "@/data/admin/orderClaim";
import type { OrderClaimsMap } from "@/data/admin/orderClaim";
import {
  loadAdminSettings,
  loadOrderAdjustments,
  loadOrderClaims,
  loadOrdersIndex,
  loadSalesSummaryCache,
  saveSalesSummaryCache,
  type SalesSummaryCacheFile,
} from "@/data/admin/storage";
import type { OrderAdjustmentsMap } from "@/data/admin/storage";
import {
  accumulateSalesSummaryRow,
  createSalesSummaryAccumulator,
  finalizeSalesSummaryAccumulator,
  type DaySalesDetail,
} from "@/lib/salesSummary";

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

function processOrderDayFile(
  sourceDate: string,
  dayUnknown: unknown,
  packages: ReturnType<typeof loadAdminSettings>["packages"],
  adjustments: OrderAdjustmentsMap,
  claims: OrderClaimsMap,
  salesAcc: ReturnType<typeof createSalesSummaryAccumulator>,
  inventoryByClaimDay: Record<string, InventoryOutByChannel>,
  seenInvoices: Set<string>,
): void {
  const day =
    typeof dayUnknown === "object" && dayUnknown !== null
      ? (dayUnknown as Record<string, unknown>)
      : null;
  const parsed =
    day && typeof day["parsed"] === "object" && day["parsed"] !== null
      ? (day["parsed"] as Record<string, unknown>)
      : null;
  const parsedRows = parsed?.["rows"];
  if (!Array.isArray(parsedRows)) return;

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

    accumulateSalesSummaryRow(salesAcc, {
      date: effectiveDate,
      status,
      deliveryFee: mergedRec["deliveryFee"],
      packagePrice,
      packageName,
      subscriptionsCount: mergedRec["subscriptionsCount"],
      repurchaseProducts: mergedRec["repurchaseProducts"],
    });

    accumulateInventoryOutByClaimRow(
      inventoryByClaimDay,
      seenInvoices,
      rec,
      sourceDate,
      invoiceNumber,
      adjustments,
      claims,
    );
  }
}

/** Full offline rebuild — one order day file at a time (low memory). */
export async function rebuildSalesSummaryCacheAll(): Promise<SalesSummaryCacheFile> {
  const settings = loadAdminSettings();
  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims() as OrderClaimsMap;
  const deliveryFeeOthersByDay = buildDeliveryFeeOthersAll();
  const salesAcc = createSalesSummaryAccumulator(settings);
  const inventoryByClaimDay: Record<string, InventoryOutByChannel> = {};
  const seenInvoices = new Set<string>();

  const index = loadOrdersIndex();
  const dates = mergeIndexAndDiskOrderDates(index.map((i) => i.date));
  const total = dates.length;

  for (let i = 0; i < dates.length; i++) {
    const sourceDate = dates[i]!;
    const dayUnknown = await readOrdersDayAsync(sourceDate);
    processOrderDayFile(
      sourceDate,
      dayUnknown,
      settings.packages,
      adjustments,
      claims,
      salesAcc,
      inventoryByClaimDay,
      seenInvoices,
    );
    if ((i + 1) % 40 === 0 || i + 1 === total) {
      console.log(`[sales-summary-cache] …${i + 1} / ${total} day files`);
    }
  }

  const salesByDay = finalizeSalesSummaryAccumulator(salesAcc, deliveryFeeOthersByDay);

  const dateKeys = [
    ...Object.keys(salesByDay),
    ...Object.keys(deliveryFeeOthersByDay),
    ...Object.keys(claims).map((inv) => getClaimCalendarYmd(inv, claims)).filter((d): d is string => !!d),
  ];
  if (dateKeys.length > 0) {
    dateKeys.sort();
    const rangeStart = dateKeys[0]!;
    const rangeEnd = dateKeys[dateKeys.length - 1]!;
    console.log("[sales-summary-cache] Cross-day claim lookup…");
    await fillMissingInventoryOutCrossDayClaims(
      inventoryByClaimDay,
      seenInvoices,
      rangeStart,
      rangeEnd,
    );
  }

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
