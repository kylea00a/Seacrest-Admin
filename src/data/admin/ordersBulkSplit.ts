import { normalizeOrderDateToIso } from "./orderDateNormalize";
import { computeAggregatesFromRows, type OrdersDayParsed, type ParsedOrderRow } from "./ordersParse";
import type { OrdersImportSummary } from "./types";

export type BulkDayGroup = {
  date: string;
  indices: number[];
};

export type BulkSplitResult = {
  groups: BulkDayGroup[];
  skippedNoDate: number;
};

/**
 * Assign each parsed row to a calendar day from its Order date column (or optional fallback).
 */
export function splitOrdersIntoBulkGroups(
  rows: ParsedOrderRow[],
  fallbackIso: string | null
): BulkSplitResult {
  const map = new Map<string, number[]>();
  let skippedNoDate = 0;

  rows.forEach((row, index) => {
    let iso = normalizeOrderDateToIso(row.orderDate);
    if (!iso && fallbackIso) iso = fallbackIso;
    if (!iso) {
      skippedNoDate++;
      return;
    }
    if (!map.has(iso)) map.set(iso, []);
    map.get(iso)!.push(index);
  });

  const groups = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, indices]) => ({ date, indices }));

  return { groups, skippedNoDate };
}

export function buildDayParsedFromIndices(
  full: OrdersDayParsed,
  indices: number[],
  productKeys: string[]
): OrdersDayParsed {
  const dayRows = indices.map((i) => full.rows[i]).filter(Boolean);
  const agg = computeAggregatesFromRows(dayRows, productKeys);
  return {
    sheetName: full.sheetName,
    rawRows: full.rawRows,
    rows: dayRows,
    totals: agg.totals,
    subscriptionsCountTotal: agg.subscriptionsCountTotal,
    memberCounts: agg.memberCounts,
    productCounts: agg.productCounts,
  };
}

export function buildBulkSummaryForDay(
  date: string,
  filename: string,
  importedAt: string,
  rowCount: number,
  dayParsed: OrdersDayParsed
): OrdersImportSummary {
  return {
    date,
    filename,
    importedAt,
    totalRows: rowCount,
    totals: dayParsed.totals,
    subscriptionsCountTotal: dayParsed.subscriptionsCountTotal,
    memberCounts: dayParsed.memberCounts,
    productCounts: dayParsed.productCounts,
  };
}
