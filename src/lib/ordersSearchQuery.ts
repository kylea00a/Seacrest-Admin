import { hydrateOrdersFromIndexMatches } from "@/data/admin/ordersSearchHydrate";
import { loadOrdersSearchIndex } from "@/data/admin/storage";
import type { OrdersSearchIndexEntry } from "@/data/admin/types";
import { orderMatchesSearch } from "@/lib/orderSearchMatch";

export const SEARCH_HYDRATE_LIMIT = 100;
export const SEARCH_MATCH_SCAN_LIMIT = 5000;
export const SEARCH_MIN_QUERY_LEN = 2;

export type OrdersSearchResult = {
  rows: Array<Record<string, unknown>>;
  matchCount: number;
  hydratedCount: number;
  truncated: boolean;
  indexReady: boolean;
  indexSize: number;
};

/** Filter prebuilt index in memory, hydrate only the newest N matches (fast). */
export async function searchOrdersFromIndex(
  qRaw: string,
  opts?: { hydrateLimit?: number; matchScanLimit?: number },
): Promise<OrdersSearchResult> {
  const hydrateLimit = Math.min(200, Math.max(1, opts?.hydrateLimit ?? SEARCH_HYDRATE_LIMIT));
  const matchScanLimit = Math.min(20_000, Math.max(100, opts?.matchScanLimit ?? SEARCH_MATCH_SCAN_LIMIT));

  const file = loadOrdersSearchIndex();
  const indexReady = file.entries.length > 0;
  const q = qRaw.trim();

  if (!q || q.length < SEARCH_MIN_QUERY_LEN) {
    return {
      rows: [],
      matchCount: 0,
      hydratedCount: 0,
      truncated: false,
      indexReady,
      indexSize: file.entries.length,
    };
  }

  if (!indexReady) {
    return {
      rows: [],
      matchCount: 0,
      hydratedCount: 0,
      truncated: false,
      indexReady: false,
      indexSize: 0,
    };
  }

  const matches: OrdersSearchIndexEntry[] = [];
  for (const e of file.entries) {
    if (matches.length >= matchScanLimit) break;
    if (orderMatchesSearch(q, e.searchBlob)) matches.push(e);
  }

  const matchCount = matches.length;
  const truncated = matchCount >= matchScanLimit;

  matches.sort((a, b) => {
    if (a.effectiveDate !== b.effectiveDate) return b.effectiveDate.localeCompare(a.effectiveDate);
    return a.invoice.localeCompare(b.invoice);
  });

  const toHydrate = matches.slice(0, hydrateLimit);
  const rows = await hydrateOrdersFromIndexMatches(toHydrate);

  return {
    rows,
    matchCount,
    hydratedCount: rows.length,
    truncated: truncated || matchCount > hydrateLimit,
    indexReady: true,
    indexSize: file.entries.length,
  };
}
