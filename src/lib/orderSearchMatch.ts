/**
 * All Orders search — invoice number or customer / distributor name (all dates).
 */

/** Normalize values from DB/JSON (invoice may be stored as number). */
export function stringifySearchField(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v).trim();
}

/** Lowercase, remove spaces/dashes/slashes/underscores for fuzzy compare. */
export function normalizeSearchKey(s: string): string {
  return s.toLowerCase().replace(/[\s\-_/]/g, "");
}

/** @deprecated use normalizeSearchKey */
export const normalizeInvoiceSearchKey = normalizeSearchKey;

/** Precomputed blob for index rows (invoice + names). */
export function buildOrderSearchBlob(rec: Record<string, unknown>): string {
  const parts = [
    stringifySearchField(rec["invoiceNumber"]),
    stringifySearchField(rec["distributorName"]),
    stringifySearchField(rec["ordererName"]),
    stringifySearchField(rec["shippingFullName"]),
    stringifySearchField(rec["email"]),
    stringifySearchField(rec["contactNumber"]),
  ];
  return normalizeSearchKey(parts.filter(Boolean).join(" "));
}

/**
 * True if query matches invoice or any searchable name field.
 * Partial OK: e.g. `534220250501` matches `INV-53422025050100001`; `maria` matches shipping name.
 */
export function orderMatchesSearch(qRaw: string, searchBlobOrRow: string | Record<string, unknown>): boolean {
  const qNorm = normalizeSearchKey(qRaw.trim());
  if (!qNorm) return false;
  const blob =
    typeof searchBlobOrRow === "string" ? searchBlobOrRow : buildOrderSearchBlob(searchBlobOrRow);
  if (!blob) return false;
  return blob.includes(qNorm);
}

/** Invoice-only match (legacy). */
export function orderInvoiceMatchesSearch(qRaw: string, invoiceUnknown: unknown): boolean {
  const qNorm = normalizeSearchKey(qRaw.trim());
  const invNorm = normalizeSearchKey(stringifySearchField(invoiceUnknown));
  if (!qNorm || !invNorm) return false;
  return invNorm.includes(qNorm);
}
