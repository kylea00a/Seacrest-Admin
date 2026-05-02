/**
 * Shared logic for All Orders search (client filter + /api/admin/orders/search).
 * - Multiple words = AND: each token must match somewhere in searchable text.
 * - Invoice: substring + ignores spaces/dashes when comparing (handles INV-… and numeric JSON).
 * - Collapses whitespace so "Maria  Garcia" still matches query "maria garcia".
 */

export type OrderSearchFields = {
  distributorId?: string;
  distributorName?: string;
  shippingFullName?: string;
  ordererName?: string;
  invoiceNumber?: string;
  contactNumber?: string;
  email?: string;
  shippingFullAddress?: string;
  city?: string;
  province?: string;
  region?: string;
};

/** Normalize values from DB/JSON (invoice may be stored as number). */
export function stringifySearchField(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v).trim();
}

/** Build search fields from a merged order row (parsed + adjustments). */
export function orderSearchFieldsFromRecord(rec: Record<string, unknown>): OrderSearchFields {
  return {
    distributorId: stringifySearchField(rec["distributorId"]),
    distributorName: stringifySearchField(rec["distributorName"]),
    shippingFullName: stringifySearchField(rec["shippingFullName"]),
    ordererName: stringifySearchField(rec["ordererName"]),
    invoiceNumber: stringifySearchField(rec["invoiceNumber"]),
    contactNumber: stringifySearchField(rec["contactNumber"]),
    email: stringifySearchField(rec["email"]),
    shippingFullAddress: stringifySearchField(rec["shippingFullAddress"]),
    city: stringifySearchField(rec["city"]),
    province: stringifySearchField(rec["province"]),
    region: stringifySearchField(rec["region"]),
  };
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function orderRowMatchesSearchQuery(qRaw: string, fields: OrderSearchFields): boolean {
  const qNorm = collapseWs(qRaw).toLowerCase();
  if (!qNorm) return true;

  const tokens = qNorm.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return true;

  const invoiceRaw = stringifySearchField(fields.invoiceNumber);
  const invoiceLower = invoiceRaw.toLowerCase();
  const invoiceNorm = invoiceLower.replace(/[\s\-_/]/g, "");

  const hay = collapseWs(
    [
      fields.distributorId,
      fields.distributorName,
      fields.shippingFullName,
      fields.ordererName,
      fields.invoiceNumber,
      fields.contactNumber,
      fields.email,
      fields.shippingFullAddress,
      fields.city,
      fields.province,
      fields.region,
    ]
      .map((v) => stringifySearchField(v))
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();

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
