import type { InventoryEndingSnapshot } from "@/data/admin/types";

export type InventoryEndingByDate = Record<string, InventoryEndingSnapshot | undefined>;

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

export type NetByProductForDay = (day: string) => Promise<Record<string, number>>;

export type BeginningResolution = {
  counts: Record<string, number>;
  /** Human-readable note for UI (e.g. yesterday's date or cascade range). */
  sourceNote: string;
};

/**
 * Beginning inventory for `targetDay`:
 * - If yesterday has an encoded ending, use that.
 * - Otherwise roll forward from the latest prior encoded ending, applying each day's net
 *   (delivery in − out) through yesterday.
 */
export async function resolveBeginningForDay(
  targetDay: string,
  byDate: InventoryEndingByDate | undefined,
  productNames: string[],
  getNetForDay: NetByProductForDay,
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
  let counts = anchor ? copyCounts(byDate![anchor]!.counts, productNames) : zeroCounts(productNames);

  if (!anchor) {
    let walk = addDaysYmd(targetDay, -365);
    while (walk <= yesterday) {
      const net = await getNetForDay(walk);
      for (const p of productNames) counts[p] = (counts[p] ?? 0) + (net[p] ?? 0);
      walk = addDaysYmd(walk, 1);
    }
    return {
      counts,
      sourceNote: `Rolled forward through ${yesterday} (no encoded ending yet)`,
    };
  }

  let walk = addDaysYmd(anchor, 1);
  if (walk > yesterday) {
    return {
      counts,
      sourceNote: `Ending inventory from ${anchor}`,
    };
  }

  while (walk <= yesterday) {
    const net = await getNetForDay(walk);
    for (const p of productNames) counts[p] = (counts[p] ?? 0) + (net[p] ?? 0);
    walk = addDaysYmd(walk, 1);
  }

  return {
    counts,
    sourceNote: `From ${anchor} ending through ${yesterday} (yesterday not encoded)`,
  };
}
