import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { isPickupDelivery, paidFromStatusText } from "@/data/admin/orderClaim";
import { loadOrderAdjustments, loadOrdersIndex } from "@/data/admin/storage";

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
  const index = loadOrdersIndex();
  const adjustments = loadOrderAdjustments();

  const dates = [...new Set(index.map((i) => i.date))].sort((a, b) => b.localeCompare(a));

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
      const rowInv = typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
      if (rowInv !== inv) continue;

      const adj = adjustments[inv];
      const merged = mergeOrderRowWithAdjustment(rec as Record<string, unknown>, adj);
      const status = adj?.status ?? (typeof merged["status"] === "string" ? (merged["status"] as string) : "");
      const deliveryMethod =
        typeof merged["deliveryMethod"] === "string" ? (merged["deliveryMethod"] as string).trim() : "";

      return { sourceDate, deliveryMethod, status };
    }
  }

  return null;
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
  const index = loadOrdersIndex();
  const dates = [...new Set(index.map((i) => i.date))].sort((a, b) => b.localeCompare(a));

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
      const rowInv = typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
      if (rowInv !== inv) continue;
      return { sourceDate, rec: rec as Record<string, unknown> };
    }
  }

  return null;
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
