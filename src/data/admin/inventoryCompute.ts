import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { lookupInvoiceParsedRow } from "@/data/admin/orderInvoiceLookup";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { getClaimCalendarYmd, isOrderClaimedForInventory } from "@/data/admin/orderClaim";
import type { OrderClaimsMap } from "@/data/admin/orderClaim";
import { loadOrderAdjustments, loadOrderClaims, loadOrdersIndex } from "@/data/admin/storage";

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

  const indexDates = [...new Set(index.map((i) => i.date))];
  const datesToScan = indexDates.filter((d) => d >= start && d <= end);

  const dayPayloads = await Promise.all(
    datesToScan.map(async (sourceDate) => {
      const dayUnknown = await readOrdersDayAsync(sourceDate);
      return { sourceDate, dayUnknown };
    })
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
      const claimYmd = getClaimCalendarYmd(invoiceNumber, claims as OrderClaimsMap);
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

  // Orders can be claimed on a later day than their import day.
  // Inventory "Out" for a selected day should include orders whose CLAIM DAY is in [start, end],
  // even if the source sheet date is outside the window.
  const claimEntries = Object.entries(claims as OrderClaimsMap);
  for (const [invoiceNumber] of claimEntries) {
    if (seenInvoices.has(invoiceNumber)) continue;
    const claimYmd = getClaimCalendarYmd(invoiceNumber, claims as OrderClaimsMap);
    if (!claimYmd || claimYmd < start || claimYmd > end) continue;

    const found = await lookupInvoiceParsedRow(invoiceNumber);
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

  const indexDates = [...new Set(index.map((i) => i.date))];
  const datesToScan = indexDates.filter((d) => d >= start && d <= end);

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
      const claimYmd = getClaimCalendarYmd(invoiceNumber, claims as OrderClaimsMap);
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
        lines,
      });
      seenInvoices.add(invoiceNumber);
    }
  }

  // Also include orders whose CLAIM DAY is within the window (even if imported earlier).
  const claimEntries = Object.entries(claims as OrderClaimsMap);
  for (const [invoiceNumber] of claimEntries) {
    if (seenInvoices.has(invoiceNumber)) continue;
    const claimYmd = getClaimCalendarYmd(invoiceNumber, claims as OrderClaimsMap);
    if (!claimYmd || claimYmd < start || claimYmd > end) continue;

    const found = await lookupInvoiceParsedRow(invoiceNumber);
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
