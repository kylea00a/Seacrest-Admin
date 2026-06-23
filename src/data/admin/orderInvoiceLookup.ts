import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { isPickupDelivery, paidFromStatusText } from "@/data/admin/orderClaim";
import { groupInvoicesBySourceDate, resolveSourceDateForInvoice } from "@/data/admin/orderInvoiceIndex";
import { loadOrderAdjustments, loadOrdersIndex } from "@/data/admin/storage";

function parseDayRows(dayUnknown: unknown): Record<string, unknown>[] {
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
  return parsedRows.filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null);
}

async function findRowInDay(
  sourceDate: string,
  invoiceNumber: string,
): Promise<Record<string, unknown> | null> {
  const inv = invoiceNumber.trim();
  if (!inv) return null;
  const dayUnknown = await readOrdersDayAsync(sourceDate);
  for (const rec of parseDayRows(dayUnknown)) {
    const rowInv = typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
    if (rowInv === inv) return rec;
  }
  return null;
}

async function scanDatesForInvoice(
  invoiceNumber: string,
  dates: string[],
): Promise<{ sourceDate: string; rec: Record<string, unknown> } | null> {
  const inv = invoiceNumber.trim();
  if (!inv) return null;

  for (const sourceDate of dates) {
    const rec = await findRowInDay(sourceDate, inv);
    if (rec) return { sourceDate, rec };
  }
  return null;
}

/**
 * Find a parsed row by invoice across all imported days (for claim validation).
 */
export async function lookupInvoiceRow(invoiceNumber: string): Promise<{
  sourceDate: string;
  deliveryMethod: string;
  status: string;
} | null> {
  const inv = invoiceNumber.trim();
  if (!inv) return null;
  const adjustments = loadOrderAdjustments();

  const hinted = resolveSourceDateForInvoice(inv);
  const datesFromIndex = hinted ? [hinted] : [];
  const index = loadOrdersIndex();
  const fallbackDates = [...new Set(index.map((i) => i.date))].sort((a, b) => b.localeCompare(a));
  const dates = hinted ? datesFromIndex : fallbackDates;

  const found = await scanDatesForInvoice(inv, dates);
  if (!found && hinted) {
    const retry = await scanDatesForInvoice(inv, fallbackDates);
    if (!retry) return null;
    return rowToSummary(retry.sourceDate, retry.rec, adjustments, inv);
  }
  if (!found) return null;
  return rowToSummary(found.sourceDate, found.rec, adjustments, inv);
}

function rowToSummary(
  sourceDate: string,
  rec: Record<string, unknown>,
  adjustments: ReturnType<typeof loadOrderAdjustments>,
  inv: string,
) {
  const adj = adjustments[inv];
  const merged = mergeOrderRowWithAdjustment(rec, adj);
  const status = adj?.status ?? (typeof merged["status"] === "string" ? (merged["status"] as string) : "");
  const deliveryMethod =
    typeof merged["deliveryMethod"] === "string" ? merged["deliveryMethod"].trim() : "";
  return { sourceDate, deliveryMethod, status };
}

/**
 * Full parsed row for an invoice (first match across import days) plus source file date.
 */
export async function lookupInvoiceParsedRow(invoiceNumber: string): Promise<{
  sourceDate: string;
  rec: Record<string, unknown>;
} | null> {
  const inv = invoiceNumber.trim();
  if (!inv) return null;

  const hinted = resolveSourceDateForInvoice(inv);
  if (hinted) {
    const rec = await findRowInDay(hinted, inv);
    if (rec) return { sourceDate: hinted, rec };
  }

  const index = loadOrdersIndex();
  const dates = [...new Set(index.map((i) => i.date))].sort((a, b) => b.localeCompare(a));
  return scanDatesForInvoice(inv, dates);
}

export async function canClaimPickupOrder(invoiceNumber: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await lookupInvoiceRow(invoiceNumber);
  if (!row) return { ok: false, error: "Order not found for this invoice." };
  if (!paidFromStatusText(row.status)) return { ok: false, error: "Order must be paid before it can be claimed." };

  if (!isPickupDelivery(row.deliveryMethod)) {
    return { ok: false, error: "Only pick-up orders use Claim; delivery orders are claimed automatically when paid." };
  }
  return { ok: true };
}

/** Bulk resolve using search index first (one day file per group). */
export async function lookupInvoicesParsedRows(
  invoiceNumbers: string[],
): Promise<Record<string, { sourceDate: string; rec: Record<string, unknown> }>> {
  const adjustments = loadOrderAdjustments();
  const want = new Set(invoiceNumbers.map((x) => x.trim()).filter(Boolean));
  const out: Record<string, { sourceDate: string; rec: Record<string, unknown> }> = {};
  if (want.size === 0) return out;

  const byAdjustmentDate = new Map<string, string[]>();
  for (const inv of want) {
    const eff = adjustments[inv]?.effectiveDate?.trim();
    if (eff && /^\d{4}-\d{2}-\d{2}$/.test(eff)) {
      const list = byAdjustmentDate.get(eff) ?? [];
      list.push(inv);
      byAdjustmentDate.set(eff, list);
    }
  }

  for (const [sourceDate, invs] of byAdjustmentDate.entries()) {
    const dayUnknown = await readOrdersDayAsync(sourceDate);
    const rows = parseDayRows(dayUnknown);
    const localWant = new Set(invs.filter((inv) => want.has(inv)));
    for (const rec of rows) {
      if (localWant.size === 0) break;
      const invoiceNumber =
        typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
      if (!invoiceNumber || !localWant.has(invoiceNumber)) continue;
      out[invoiceNumber] = { sourceDate, rec };
      want.delete(invoiceNumber);
      localWant.delete(invoiceNumber);
    }
  }

  if (want.size === 0) return out;

  const { bySourceDate } = groupInvoicesBySourceDate([...want]);
  for (const [sourceDate, invs] of bySourceDate.entries()) {
    const dayUnknown = await readOrdersDayAsync(sourceDate);
    const rows = parseDayRows(dayUnknown);
    const localWant = new Set(invs);
    for (const rec of rows) {
      if (localWant.size === 0) break;
      const invoiceNumber =
        typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
      if (!invoiceNumber || !localWant.has(invoiceNumber)) continue;
      out[invoiceNumber] = { sourceDate, rec };
      want.delete(invoiceNumber);
      localWant.delete(invoiceNumber);
    }
  }

  if (want.size === 0) return out;

  const index = loadOrdersIndex();
  const dates = [...new Set(index.map((i) => i.date))].sort((a, b) => b.localeCompare(a));
  for (const sourceDate of dates) {
    if (want.size === 0) break;
    const dayUnknown = await readOrdersDayAsync(sourceDate);
    const rows = parseDayRows(dayUnknown);
    for (const rec of rows) {
      if (want.size === 0) break;
      const invoiceNumber =
        typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
      if (!invoiceNumber || !want.has(invoiceNumber)) continue;
      out[invoiceNumber] = { sourceDate, rec };
      want.delete(invoiceNumber);
    }
  }

  return out;
}
