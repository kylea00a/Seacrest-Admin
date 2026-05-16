import type { InventoryEndingSnapshot } from "@/data/admin/types";

export type InventoryEndingByDate = Record<string, InventoryEndingSnapshot | undefined>;

/** Max calendar days to roll net forward when yesterday is not encoded (keeps API fast). */
const MAX_ROLL_FORWARD_DAYS = 14;

/** Add calendar days to a YYYY-MM-DD string (UTC date math). */
export function addDaysYmd(ymd: string, days: number): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function zeroCounts(productNames: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const p of productNames) counts[p] = 0;
  return counts;
}

function copyCounts(source: Record<string, number> | undefined, productNames: string[]): Record<string, number> {
  const counts = zeroCounts(productNames);
  if (!source) return counts;
  for (const p of productNames) counts[p] = source[p] ?? 0;
  return counts;
}

/** Latest encoded ending snapshot strictly before `targetDay`. */
export function lastEncodedDateBefore(targetDay: string, byDate: InventoryEndingByDate | undefined): string | null {
  if (!byDate) return null;
  const dates = Object.keys(byDate)
    .filter((d) => d < targetDay && byDate[d]?.counts)
    .sort((a, b) => b.localeCompare(a));
  return dates[0] ?? null;
}

/** Net (delivery in − out) aggregated over [start, end] inclusive. */
export type NetByProductForRange = (start: string, end: string) => Promise<Record<string, number>>;

export type BeginningResolution = {
  counts: Record<string, number>;
  sourceNote: string;
};

function applyNetToCounts(
  counts: Record<string, number>,
  productNames: string[],
  net: Record<string, number>,
): void {
  for (const p of productNames) counts[p] = (counts[p] ?? 0) + (net[p] ?? 0);
}

/**
 * Beginning inventory for `targetDay`:
 * - If yesterday has an encoded ending, use that (instant).
 * - Otherwise roll forward from the latest prior encoded ending using one batched net range query.
 */
export async function resolveBeginningForDay(
  targetDay: string,
  byDate: InventoryEndingByDate | undefined,
  productNames: string[],
  getNetForRange: NetByProductForRange,
): Promise<BeginningResolution> {
  const yesterday = addDaysYmd(targetDay, -1);

  const yRec = byDate?.[yesterday];
  if (yRec?.counts) {
    return {
      counts: copyCounts(yRec.counts, productNames),
      sourceNote: `Ending inventory from ${yesterday}`,
    };
  }

  const anchor = lastEncodedDateBefore(targetDay, byDate);
  const counts = anchor ? copyCounts(byDate![anchor]!.counts, productNames) : zeroCounts(productNames);

  if (!anchor) {
    return {
      counts,
      sourceNote: "No prior encoded ending (beginning is 0 until you encode a day)",
    };
  }

  const rangeStart = addDaysYmd(anchor, 1);
  if (rangeStart > yesterday) {
    return {
      counts,
      sourceNote: `Ending inventory from ${anchor}`,
    };
  }

  let rangeEnd = yesterday;
  const cappedEnd = addDaysYmd(rangeStart, MAX_ROLL_FORWARD_DAYS - 1);
  if (rangeEnd > cappedEnd) rangeEnd = cappedEnd;

  const net = await getNetForRange(rangeStart, rangeEnd);
  applyNetToCounts(counts, productNames, net);
  return {
    counts,
    sourceNote:
      rangeEnd < yesterday
        ? `From ${anchor} through ${rangeEnd} (${MAX_ROLL_FORWARD_DAYS}-day roll cap; encode missing days)`
        : `From ${anchor} ending through ${yesterday} (yesterday not encoded)`,
  };
}
