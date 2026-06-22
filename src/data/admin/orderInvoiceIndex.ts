import { loadOrdersSearchIndex } from "@/data/admin/storage";
import { stringifySearchField } from "@/lib/orderSearchMatch";

let cachedMap: Map<string, string> | null = null;
let cachedBuiltAt = "";

/** Invoice → source import day (YYYY-MM-DD) from the compact search index. */
export function invoiceSourceDateMap(): Map<string, string> {
  const idx = loadOrdersSearchIndex();
  if (cachedMap && cachedBuiltAt && cachedBuiltAt === idx.builtAt) return cachedMap;

  const map = new Map<string, string>();
  for (const e of idx.entries) {
    const inv = stringifySearchField(e.invoice);
    const sourceDate = stringifySearchField(e.sourceDate);
    if (!inv || !sourceDate) continue;
    if (!map.has(inv)) map.set(inv, sourceDate);
  }

  cachedMap = map;
  cachedBuiltAt = idx.builtAt;
  return map;
}

export function resolveSourceDateForInvoice(invoiceNumber: string): string | null {
  const inv = invoiceNumber.trim();
  if (!inv) return null;
  return invoiceSourceDateMap().get(inv) ?? null;
}

/** Group invoices by source day using the search index (unknown invoices listed separately). */
export function groupInvoicesBySourceDate(
  invoiceNumbers: string[],
): { bySourceDate: Map<string, string[]>; unknown: string[] } {
  const map = invoiceSourceDateMap();
  const bySourceDate = new Map<string, string[]>();
  const unknown: string[] = [];

  for (const raw of invoiceNumbers) {
    const inv = raw.trim();
    if (!inv) continue;
    const sourceDate = map.get(inv);
    if (!sourceDate) {
      unknown.push(inv);
      continue;
    }
    const list = bySourceDate.get(sourceDate) ?? [];
    list.push(inv);
    bySourceDate.set(sourceDate, list);
  }

  return { bySourceDate, unknown };
}
