import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { lookupInvoicesParsedRows } from "@/data/admin/orderInvoiceLookup";
import { readOrdersDayAsync } from "@/data/admin/orders";
import {
  calendarYmdInTimeZone,
  isNonPickupDelivery,
  isOrderClaimedForInventory,
  isPickupDelivery,
} from "@/data/admin/orderClaim";
import type { OrderClaimsMap } from "@/data/admin/orderClaim";
import type { OrderAdjustmentsMap } from "@/data/admin/storage";
import { loadOrderAdjustments, loadOrderClaims, loadOrdersIndex } from "@/data/admin/storage";
import { addDaysYmd } from "@/lib/inventoryBeginning";

function fastClaimYmd(invoiceNumber: string, claims: OrderClaimsMap): string | null {
  const rec = claims[invoiceNumber];
  if (!rec) return null;
  const raw = rec.claimDate?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (rec.claimedAt) return calendarYmdInTimeZone(new Date(rec.claimedAt), "Asia/Manila");
  return null;
}

/** Claim calendar day → invoice numbers (built once per range query). */
function buildClaimsByInventoryYmd(claims: OrderClaimsMap): Map<string, string[]> {
  const byYmd = new Map<string, string[]>();
  for (const invoiceNumber of Object.keys(claims)) {
    const claimYmd = fastClaimYmd(invoiceNumber, claims);
    if (!claimYmd) continue;
    const list = byYmd.get(claimYmd);
    if (list) list.push(invoiceNumber);
    else byYmd.set(claimYmd, [invoiceNumber]);
  }
  return byYmd;
}

function collectCrossDayClaimInvoices(
  start: string,
  end: string,
  seenInvoices: Set<string>,
  claimsByYmd: Map<string, string[]>,
): string[] {
  const invoicesToLookup: string[] = [];
  for (const [d, invs] of claimsByYmd) {
    if (d < start || d > end) continue;
    for (const invoiceNumber of invs) {
      if (seenInvoices.has(invoiceNumber)) continue;
      invoicesToLookup.push(invoiceNumber);
    }
  }
  return invoicesToLookup;
}

/** Resolve invoice → order row (search index first, then fallback scan). */
export async function lookupOrderRecordsByInvoices(
  invoiceNumbers: string[],
): Promise<Record<string, { sourceDate: string; rec: Record<string, unknown> }>> {
  return lookupInvoicesParsedRows(invoiceNumbers);
}

async function bulkLookupInvoicesParsedRows(
  invoiceNumbers: string[],
  _adjustments: OrderAdjustmentsMap,
  _indexDates: string[],
): Promise<Record<string, { sourceDate: string; rec: Record<string, unknown> }>> {
  return lookupInvoicesParsedRows(invoiceNumbers);
}

export type InventoryOutTotals = Record<string, number>;

/**
 * Sum product quantities from all orders where the line is “claimed” for inventory
 * (paid delivery auto-claimed; pick-up only after Claim).
 */
export async function computeClaimedOutTotals(): Promise<InventoryOutTotals> {
  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims();

  const out: InventoryOutTotals = {};

  const add = (name: string, n: number) => {
    if (!name || !Number.isFinite(n) || n <= 0) return;
    out[name] = (out[name] ?? 0) + n;
  };

  const dates = [...new Set(index.map((i) => i.date))];

  for (const sourceDate of dates) {
    const dayUnknown = await readOrdersDayAsync(sourceDate);
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
      const merged = mergeOrderRowWithAdjustment(rec as Record<string, unknown>, adj);
      const status = adj?.status ?? (typeof merged["status"] === "string" ? (merged["status"] as string) : "");
      const deliveryMethod =
        typeof merged["deliveryMethod"] === "string" ? (merged["deliveryMethod"] as string).trim() : "";

      if (
        !isOrderClaimedForInventory({
          deliveryMethod,
          status,
          invoiceNumber,
          claims: claims as OrderClaimsMap,
        })
      ) {
        continue;
      }

      const addRec = (obj: unknown) => {
        if (!obj || typeof obj !== "object") return;
        const o = obj as Record<string, unknown>;
        for (const [k, v] of Object.entries(o)) {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n) && n > 0) add(k, n);
        }
      };

      addRec(merged["packageProducts"]);
      addRec(merged["subscriptionProducts"]);
      addRec(merged["repurchaseProducts"]);
    }
  }

  return out;
}

/** One claimed order’s product lines contributing to inventory out for a date range. */
export type InventoryOutOrderDetail = {
  invoiceNumber: string;
  effectiveDate: string;
  sourceDate: string;
  distributorName: string;
  shippingFullName: string;
  deliveryMethod: string;
  lines: Array<{
    kind: "package" | "subscription" | "repurchase";
    productName: string;
    qty: number;
  }>;
};

/**
 * Same date filtering as {@link computeClaimedOutTotalsForRange}, but returns per-order line detail
 * (for UI breakdown on a selected day).
 */
export async function computeClaimedOutDetailsForRange(
  start: string,
  end: string,
): Promise<InventoryOutOrderDetail[]> {
  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims();

  const out: InventoryOutOrderDetail[] = [];
  const seenInvoices = new Set<string>();

  const allIndexDates = [...new Set(index.map((i) => i.date))];
  const datesToScan = allIndexDates.filter((d) => d >= start && d <= end);
  const claimsByYmd = buildClaimsByInventoryYmd(claims as OrderClaimsMap);

  const dayPayloads = await Promise.all(
    datesToScan.map(async (sourceDate) => {
      const dayUnknown = await readOrdersDayAsync(sourceDate);
      return { sourceDate, dayUnknown };
    }),
  );

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
      const merged = mergeOrderRowWithAdjustment(rec as Record<string, unknown>, adj);
      const effectiveDate = adj?.effectiveDate ?? sourceDate;
      const claimYmd = fastClaimYmd(invoiceNumber, claims as OrderClaimsMap);
      const inventoryDay = claimYmd ?? effectiveDate;
      if (inventoryDay < start || inventoryDay > end) continue;

      const status = adj?.status ?? (typeof merged["status"] === "string" ? (merged["status"] as string) : "");
      const deliveryMethod =
        typeof merged["deliveryMethod"] === "string" ? (merged["deliveryMethod"] as string).trim() : "";

      if (
        !isOrderClaimedForInventory({
          deliveryMethod,
          status,
          invoiceNumber,
          claims: claims as OrderClaimsMap,
        })
      ) {
        continue;
      }

      const distributorName =
        typeof merged["distributorName"] === "string" ? (merged["distributorName"] as string).trim() : "";
      const shippingFullName =
        typeof merged["shippingFullName"] === "string" ? (merged["shippingFullName"] as string).trim() : "";
      const lines: InventoryOutOrderDetail["lines"] = [];

      const pushMap = (kind: "package" | "subscription" | "repurchase", obj: unknown) => {
        if (!obj || typeof obj !== "object") return;
        const o = obj as Record<string, unknown>;
        for (const [productName, v] of Object.entries(o)) {
          const n = typeof v === "number" ? v : Number(v);
          if (!Number.isFinite(n) || n <= 0) continue;
          lines.push({ kind, productName, qty: n });
        }
      };

      pushMap("package", merged["packageProducts"]);
      pushMap("subscription", merged["subscriptionProducts"]);
      pushMap("repurchase", merged["repurchaseProducts"]);

      if (lines.length === 0) continue;

      lines.sort((a, b) => a.kind.localeCompare(b.kind) || a.productName.localeCompare(b.productName));

      out.push({
        invoiceNumber,
        effectiveDate: inventoryDay,
        sourceDate,
        distributorName: distributorName || "—",
        shippingFullName: shippingFullName || "—",
        deliveryMethod,
        lines,
      });
      seenInvoices.add(invoiceNumber);
    }
  }

  const invoicesToLookup = collectCrossDayClaimInvoices(start, end, seenInvoices, claimsByYmd);

  const lookedUp = await bulkLookupInvoicesParsedRows(invoicesToLookup, adjustments, allIndexDates);
  for (const invoiceNumber of invoicesToLookup) {
    if (seenInvoices.has(invoiceNumber)) continue;
    const claimYmd = fastClaimYmd(invoiceNumber, claims as OrderClaimsMap);
    if (!claimYmd) continue;
    const found = lookedUp[invoiceNumber];
    if (!found) continue;
    const adj = adjustments[invoiceNumber];
    const merged = mergeOrderRowWithAdjustment(found.rec as Record<string, unknown>, adj);

    const status = adj?.status ?? (typeof merged["status"] === "string" ? (merged["status"] as string) : "");
    const deliveryMethod =
      typeof merged["deliveryMethod"] === "string" ? (merged["deliveryMethod"] as string).trim() : "";

    if (
      !isOrderClaimedForInventory({
        deliveryMethod,
        status,
        invoiceNumber,
        claims: claims as OrderClaimsMap,
      })
    ) {
      continue;
    }

    const distributorName =
      typeof merged["distributorName"] === "string" ? (merged["distributorName"] as string).trim() : "";
    const shippingFullName =
      typeof merged["shippingFullName"] === "string" ? (merged["shippingFullName"] as string).trim() : "";
    const lines: InventoryOutOrderDetail["lines"] = [];

    const pushMap = (kind: "package" | "subscription" | "repurchase", obj: unknown) => {
      if (!obj || typeof obj !== "object") return;
      const o = obj as Record<string, unknown>;
      for (const [productName, v] of Object.entries(o)) {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n) || n <= 0) continue;
        lines.push({ kind, productName, qty: n });
      }
    };

    pushMap("package", merged["packageProducts"]);
    pushMap("subscription", merged["subscriptionProducts"]);
    pushMap("repurchase", merged["repurchaseProducts"]);
    if (lines.length === 0) continue;
    lines.sort((a, b) => a.kind.localeCompare(b.kind) || a.productName.localeCompare(b.productName));

    out.push({
      invoiceNumber,
      effectiveDate: claimYmd,
      sourceDate: found.sourceDate,
      distributorName: distributorName || "—",
      shippingFullName: shippingFullName || "—",
      deliveryMethod,
      lines,
    });
    seenInvoices.add(invoiceNumber);
  }

  out.sort((a, b) => {
    if (a.effectiveDate !== b.effectiveDate) return a.effectiveDate.localeCompare(b.effectiveDate);
    return a.invoiceNumber.localeCompare(b.invoiceNumber);
  });

  return out;
}

/** Sum per-order OUT lines (same source as the Out-by-order list). */
export function aggregateOutDetailsToTotals(details: InventoryOutOrderDetail[]): InventoryOutTotals {
  const out: InventoryOutTotals = {};
  for (const order of details) {
    for (const line of order.lines) {
      if (!line.productName || !Number.isFinite(line.qty) || line.qty <= 0) continue;
      out[line.productName] = (out[line.productName] ?? 0) + line.qty;
    }
  }
  return out;
}

/** Group Out-by-order lines by claim calendar day (effectiveDate). */
export function groupOutDetailsByDay(details: InventoryOutOrderDetail[]): Record<string, InventoryOutTotals> {
  const byDay: Record<string, InventoryOutTotals> = {};
  for (const order of details) {
    const d = order.effectiveDate;
    if (!byDay[d]) byDay[d] = {};
    const bucket = byDay[d]!;
    for (const line of order.lines) {
      if (!line.productName || !Number.isFinite(line.qty) || line.qty <= 0) continue;
      bucket[line.productName] = (bucket[line.productName] ?? 0) + line.qty;
    }
  }
  return byDay;
}

/**
 * Product totals for OUT — derived from {@link computeClaimedOutDetailsForRange} so
 * Inventory Flow and product-flow OUT always match Out-by-order.
 */
export async function computeClaimedOutTotalsForRange(start: string, end: string): Promise<InventoryOutTotals> {
  const details = await computeClaimedOutDetailsForRange(start, end);
  return aggregateOutDetailsToTotals(details);
}

export type InventoryOutByChannel = {
  pickup: Record<string, number>;
  delivery: Record<string, number>;
};

function addToInventoryBucket(bucket: Record<string, number>, obj: unknown) {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) bucket[k] = (bucket[k] ?? 0) + n;
  }
}

function ensureInventoryOutDay(
  byDay: Record<string, InventoryOutByChannel>,
  d: string,
): InventoryOutByChannel {
  if (!byDay[d]) byDay[d] = { pickup: {}, delivery: {} };
  return byDay[d]!;
}

/** Merge one order row into claim-day inventory out (pickup vs delivery). */
export function accumulateInventoryOutByClaimRow(
  byDay: Record<string, InventoryOutByChannel>,
  seenInvoices: Set<string>,
  rec: Record<string, unknown>,
  sourceDate: string,
  invoiceNumber: string,
  adjustments: OrderAdjustmentsMap,
  claims: OrderClaimsMap,
  range?: { start: string; end: string },
): void {
  const adj = adjustments[invoiceNumber];
  const merged = mergeOrderRowWithAdjustment(rec, adj);
  const claimYmd = fastClaimYmd(invoiceNumber, claims);
  const inventoryDay = claimYmd ?? adj?.effectiveDate ?? sourceDate;
  if (range && (inventoryDay < range.start || inventoryDay > range.end)) return;

  const status = adj?.status ?? (typeof merged["status"] === "string" ? (merged["status"] as string) : "");
  const deliveryMethod =
    typeof merged["deliveryMethod"] === "string" ? (merged["deliveryMethod"] as string).trim() : "";

  if (!isOrderClaimedForInventory({ deliveryMethod, status, invoiceNumber, claims })) return;

  const channel = isPickupDelivery(deliveryMethod)
    ? "pickup"
    : isNonPickupDelivery(deliveryMethod)
      ? "delivery"
      : null;
  if (!channel) return;

  const dayRec = ensureInventoryOutDay(byDay, inventoryDay);
  const bucket = channel === "pickup" ? dayRec.pickup : dayRec.delivery;
  addToInventoryBucket(bucket, merged["packageProducts"]);
  addToInventoryBucket(bucket, merged["subscriptionProducts"]);
  addToInventoryBucket(bucket, merged["repurchaseProducts"]);
  seenInvoices.add(invoiceNumber);
}

/** Claim-day inventory out (pieces) by product, split Pick up vs Delivery. */
export async function computeInventoryOutByClaimDayForRange(
  start: string,
  end: string,
): Promise<Record<string, InventoryOutByChannel>> {
  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims() as OrderClaimsMap;
  const byDay: Record<string, InventoryOutByChannel> = {};
  const seenInvoices = new Set<string>();
  const range = { start, end };

  const allIndexDates = [...new Set(index.map((i) => i.date))];
  const claimsByYmd = buildClaimsByInventoryYmd(claims);

  for (let i = 0; i < allIndexDates.length; i++) {
    const sourceDate = allIndexDates[i]!;
    const dayUnknown = await readOrdersDayAsync(sourceDate);
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
      accumulateInventoryOutByClaimRow(
        byDay,
        seenInvoices,
        rec,
        sourceDate,
        invoiceNumber,
        adjustments,
        claims,
        range,
      );
    }
  }

  const invoicesToLookup = collectCrossDayClaimInvoices(start, end, seenInvoices, claimsByYmd);
  const lookedUp = await bulkLookupInvoicesParsedRows(invoicesToLookup, adjustments, allIndexDates);
  for (const invoiceNumber of invoicesToLookup) {
    if (seenInvoices.has(invoiceNumber)) continue;
    const found = lookedUp[invoiceNumber];
    if (!found) continue;
    accumulateInventoryOutByClaimRow(
      byDay,
      seenInvoices,
      found.rec,
      found.sourceDate,
      invoiceNumber,
      adjustments,
      claims,
      range,
    );
  }

  return byDay;
}

/**
 * After a full order-file scan, resolve claimed invoices not yet counted (orphans only).
 * Skips the old day-by-day calendar walk — that could re-read hundreds of files.
 */
export async function fillMissingInventoryOutFromClaims(
  byDay: Record<string, InventoryOutByChannel>,
  seenInvoices: Set<string>,
): Promise<void> {
  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims() as OrderClaimsMap;
  const missing = Object.keys(claims).filter((inv) => !seenInvoices.has(inv));
  if (missing.length === 0) return;

  const allIndexDates = [...new Set(index.map((i) => i.date))];
  const lookedUp = await bulkLookupInvoicesParsedRows(missing, adjustments, allIndexDates);
  for (const invoiceNumber of missing) {
    if (seenInvoices.has(invoiceNumber)) continue;
    const found = lookedUp[invoiceNumber];
    if (!found) continue;
    accumulateInventoryOutByClaimRow(
      byDay,
      seenInvoices,
      found.rec,
      found.sourceDate,
      invoiceNumber,
      adjustments,
      claims,
    );
  }
}
