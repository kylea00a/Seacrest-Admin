/**
 * All Orders search — invoice number only (normalized substring on full history).
 */

/** Normalize values from DB/JSON (invoice may be stored as number). */
export function stringifySearchField(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v).trim();
}

/** Lowercase, remove spaces/dashes/slashes/underscores for fuzzy invoice compare. */
export function normalizeInvoiceSearchKey(s: string): string {
  return s.toLowerCase().replace(/[\s\-_/]/g, "");
}

/**
 * True if the row's invoice matches the search box (invoice-only).
 * Partial OK: e.g. query `534220250501` matches `INV-53422025050100001`.
 */
export function orderInvoiceMatchesSearch(qRaw: string, invoiceUnknown: unknown): boolean {
  const qNorm = normalizeInvoiceSearchKey(qRaw.trim());
  const invNorm = normalizeInvoiceSearchKey(stringifySearchField(invoiceUnknown));
  if (!qNorm) return false;
  if (!invNorm) return false;
  return invNorm.includes(qNorm);
}
