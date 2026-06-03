import { normalizeXenditInvoiceReference } from "@/data/admin/xenditImportParse";
import { loadXenditAmountByInvoice } from "@/data/admin/xenditImportHistory";

export function normalizeOrderInvoiceForXendit(invoice: string): string {
  return normalizeXenditInvoiceReference(invoice);
}

export function buildXenditInvoiceSet(): Set<string> {
  const map = loadXenditAmountByInvoice();
  return new Set(map.keys());
}

export function xenditAmountForInvoice(invoice: string): number | null {
  const key = normalizeOrderInvoiceForXendit(invoice);
  if (!key) return null;
  const map = loadXenditAmountByInvoice();
  return map.has(key) ? (map.get(key) ?? null) : null;
}

export function hasXenditTransactionMatch(invoice: string): boolean {
  const key = normalizeOrderInvoiceForXendit(invoice);
  if (!key) return false;
  return loadXenditAmountByInvoice().has(key);
}
