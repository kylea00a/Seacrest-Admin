import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { mergeIndexAndDiskOrderDates, readOrdersDay, readOrdersDayAsync } from "@/data/admin/orders";
import {
  loadOrderAdjustments,
  loadOrdersIndex,
  loadOrdersSearchIndex,
  saveOrdersSearchIndex,
} from "@/data/admin/storage";
import type { OrdersSearchIndexEntry } from "@/data/admin/types";
import { buildOrderSearchBlob, stringifySearchField } from "@/lib/orderSearchMatch";

function entryFromRow(
  rec: Record<string, unknown>,
  sourceDate: string,
  effectiveDate: string,
): OrdersSearchIndexEntry | null {
  const invoice = stringifySearchField(rec["invoiceNumber"]);
  if (!invoice) return null;
  const merged = rec;
  return {
    invoice,
    sourceDate,
    effectiveDate,
    distributorName: stringifySearchField(merged["distributorName"]),
    ordererName: stringifySearchField(merged["ordererName"]),
    shippingFullName: stringifySearchField(merged["shippingFullName"]),
    searchBlob: buildOrderSearchBlob(merged),
  };
}

function entriesFromDayPayload(sourceDate: string, dayUnknown: unknown): OrdersSearchIndexEntry[] {
  const adjustments = loadOrderAdjustments();
  const day =
    typeof dayUnknown === "object" && dayUnknown !== null
      ? (dayUnknown as Record<string, unknown>)
      : null;
  const parsed =
    day && typeof day["parsed"] === "object" && day["parsed"] !== null
      ? (day["parsed"] as Record<string, unknown>)
      : null;
  const parsedRows = parsed?.["rows"];
  if (!Array.isArray(parsedRows)) return [];

  const out: OrdersSearchIndexEntry[] = [];
  for (const r of parsedRows) {
    if (typeof r !== "object" || r === null) continue;
    const rec = r as Record<string, unknown>;
    const invoice = stringifySearchField(rec["invoiceNumber"]);
    if (!invoice) continue;
    const adj = adjustments[invoice];
    const merged = mergeOrderRowWithAdjustment(rec, adj);
    const effectiveDate = adj?.effectiveDate ?? sourceDate;
    const entry = entryFromRow(merged, sourceDate, effectiveDate);
    if (entry) out.push(entry);
  }
  return out;
}

/** Rebuild index entries for specific import days (after import / edit). */
export function rebuildOrdersSearchIndexForDates(dates: string[]): Promise<void> {
  return rebuildOrdersSearchIndexForDatesAsync(dates);
}

async function rebuildOrdersSearchIndexForDatesAsync(dates: string[]): Promise<void> {
  const uniq = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (uniq.length === 0) return;

  const file = loadOrdersSearchIndex();
  const byInvoice = new Map<string, OrdersSearchIndexEntry>();
  for (const e of file.entries) {
    if (!uniq.includes(e.sourceDate)) byInvoice.set(e.invoice, e);
  }

  const payloads = await Promise.all(uniq.map(async (d) => ({ d, day: await readOrdersDayAsync(d) })));
  for (const { d, day } of payloads) {
    for (const e of entriesFromDayPayload(d, day)) {
      byInvoice.set(e.invoice, e);
    }
  }

  file.entries = [...byInvoice.values()];
  file.builtAt = new Date().toISOString();
  saveOrdersSearchIndex(file);
}

/** Full rebuild from all order files on disk (run once or on demand). */
export async function rebuildOrdersSearchIndexAll(): Promise<number> {
  const index = loadOrdersIndex();
  const dates = mergeIndexAndDiskOrderDates(index.map((i) => i.date));
  const entries: OrdersSearchIndexEntry[] = [];
  const batchSize = 24;

  for (let i = 0; i < dates.length; i += batchSize) {
    const batch = dates.slice(i, i + batchSize);
    const payloads = await Promise.all(batch.map((d) => readOrdersDayAsync(d)));
    for (let j = 0; j < batch.length; j++) {
      entries.push(...entriesFromDayPayload(batch[j]!, payloads[j]));
    }
  }

  const byInvoice = new Map<string, OrdersSearchIndexEntry>();
  for (const e of entries) byInvoice.set(e.invoice, e);

  const file = {
    builtAt: new Date().toISOString(),
    entries: [...byInvoice.values()],
  };
  saveOrdersSearchIndex(file);
  return file.entries.length;
}

/** Sync rebuild for one day (import commit path). */
export function rebuildOrdersSearchIndexForDatesSync(dates: string[]): void {
  const uniq = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  if (uniq.length === 0) return;

  const file = loadOrdersSearchIndex();
  const byInvoice = new Map<string, OrdersSearchIndexEntry>();
  for (const e of file.entries) {
    if (!uniq.includes(e.sourceDate)) byInvoice.set(e.invoice, e);
  }
  for (const d of uniq) {
    const day = readOrdersDay(d);
    for (const e of entriesFromDayPayload(d, day)) {
      byInvoice.set(e.invoice, e);
    }
  }
  file.entries = [...byInvoice.values()];
  file.builtAt = new Date().toISOString();
  saveOrdersSearchIndex(file);
}
