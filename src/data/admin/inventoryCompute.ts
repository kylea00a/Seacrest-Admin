import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { isOrderClaimedForInventory } from "@/data/admin/orderClaim";
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

  const add = (name: string, n: number) => {
    if (!name || !Number.isFinite(n) || n <= 0) return;
    out[name] = (out[name] ?? 0) + n;
  };

  const indexDates = [...new Set(index.map((i) => i.date))];
  const datesToScan = indexDates.filter((d) => d >= start && d <= end);
  if (datesToScan.length === 0) return out;

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
      if (effectiveDate < start || effectiveDate > end) continue;

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
