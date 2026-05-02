/**
 * Shared logic for All Orders search (client filter + /api/admin/orders/search).
 * - Multiple words = AND: each token must match somewhere (name fields or invoice).
 * - Invoice: substring + ignores spaces/dashes in both query and invoice when comparing.
 */

export type OrderSearchFields = {
  distributorId?: string;
  distributorName?: string;
  shippingFullName?: string;
  ordererName?: string;
  invoiceNumber?: string;
};

export function orderRowMatchesSearchQuery(qRaw: string, fields: OrderSearchFields): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;

  const tokens = q.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return true;

  const invoiceRaw = typeof fields.invoiceNumber === "string" ? fields.invoiceNumber.trim() : "";
  const invoiceLower = invoiceRaw.toLowerCase();
  const invoiceNorm = invoiceLower.replace(/[\s\-_/]/g, "");

  const hay = [
    fields.distributorId,
    fields.distributorName,
    fields.shippingFullName,
    fields.ordererName,
    fields.invoiceNumber,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  for (const token of tokens) {
    const tl = token.toLowerCase();
    if (hay.includes(tl)) continue;

    const tokenNorm = tl.replace(/[\s\-_/]/g, "");
    if (tokenNorm.length >= 2 && invoiceNorm.includes(tokenNorm)) continue;
    if (invoiceLower.includes(tl)) continue;

    return false;
  }
  return true;
}
