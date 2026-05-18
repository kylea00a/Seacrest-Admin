import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
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

function matchInvoicesInDayFile(
  sourceDate: string,
  dayUnknown: unknown,
  want: Set<string>,
  out: Record<string, { sourceDate: string; rec: Record<string, unknown> }>,
): void {
  const day = typeof dayUnknown === "object" && dayUnknown !== null ? (dayUnknown as Record<string, unknown>) : null;
  const parsed = day && typeof day["parsed"] === "object" && day["parsed"] !== null ? (day["parsed"] as Record<string, unknown>) : null;
  const parsedRows = parsed?.["rows"];
  if (!Array.isArray(parsedRows)) return;

  for (const r of parsedRows) {
    if (want.size === 0) break;
    if (typeof r !== "object" || r === null) continue;
    const rec = r as Record<string, unknown>;
    const invoiceNumber = typeof rec["invoiceNumber"] === "string" ? (rec["invoiceNumber"] as string).trim() : "";
    if (!invoiceNumber || !want.has(invoiceNumber)) continue;
    out[invoiceNumber] = { sourceDate, rec };
    want.delete(invoiceNumber);
  }
}

async function bulkLookupInvoicesParsedRows(
  invoiceNumbers: string[],
  adjustments: OrderAdjustmentsMap,
  indexDates: string[],
): Promise<Record<string, { sourceDate: string; rec: Record<string, unknown> }>> {
  const want = new Set(invoiceNumbers.map((x) => x.trim()).filter(Boolean));
  const out: Record<string, { sourceDate: string; rec: Record<string, unknown> }> = {};
  if (want.size === 0) return out;

  const bySourceDate = new Map<string, string[]>();
  for (const inv of want) {
    const eff = adjustments[inv]?.effectiveDate?.trim();
    if (eff && /^\d{4}-\d{2}-\d{2}$/.test(eff)) {
      const list = bySourceDate.get(eff) ?? [];
      list.push(inv);
      bySourceDate.set(eff, list);
    }
  }

  await Promise.all(
    [...bySourceDate.entries()].map(async ([sourceDate, invs]) => {
      const dayUnknown = await readOrdersDayAsync(sourceDate);
      const localWant = new Set(invs.filter((inv) => want.has(inv)));
      matchInvoicesInDayFile(sourceDate, dayUnknown, localWant, out);
      for (const inv of invs) want.delete(inv);
    }),
  );

  if (want.size === 0) return out;

  const dates = [...indexDates].sort((a, b) => b.localeCompare(a));
  for (const sourceDate of dates) {
    if (want.size === 0) break;
    const dayUnknown = await readOrdersDayAsync(sourceDate);
    matchInvoicesInDayFile(sourceDate, dayUnknown, want, out);
  }

  return out;
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

/**
 * Same as {@link computeClaimedOutTotals} but only rows whose effective date falls in [start, end] (YYYY-MM-DD).
 *
 * Only reads import-day files whose **source date** is in [start, end] (same as `/api/admin/orders/compiled`),
 * so a single-day inventory query touches at most those day files — not the full history.
 */
export async function computeClaimedOutTotalsForRange(start: string, end: string): Promise<InventoryOutTotals> {
  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims();

  const out: InventoryOutTotals = {};
  const seenInvoices = new Set<string>();

  const add = (name: string, n: number) => {
    if (!name || !Number.isFinite(n) || n <= 0) return;
    out[name] = (out[name] ?? 0) + n;
  };

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
      seenInvoices.add(invoiceNumber);
    }
  }

  // Orders claimed on a later day than their import day (index by claim day, not full claims scan).
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
    seenInvoices.add(invoiceNumber);
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
