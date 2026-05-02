import type { JntImportRow } from "./types";

export function normalizeReceiverForMatch(s: string): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Match J&T import row by receiver name + ship date within [startYmd, endYmd] (inclusive).
 * If multiple rows match, prefer latest Submission Time (lexicographic on raw string).
 */
export function findWaybillForReceiverDateRange(
  receiver: string,
  startYmd: string,
  endYmd: string,
  rows: JntImportRow[],
): string | undefined {
  const name = normalizeReceiverForMatch(receiver);
  const start = startYmd <= endYmd ? startYmd : endYmd;
  const end = startYmd <= endYmd ? endYmd : startYmd;

  const candidates = rows.filter((r) => {
    if (!r.waybillNumber?.trim()) return false;
    if (!r.shipDateYmd?.trim()) return false;
    if (normalizeReceiverForMatch(r.receiver) !== name) return false;
    const d = r.shipDateYmd;
    return d >= start && d <= end;
  });

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    const ta = a.submissionTime ?? "";
    const tb = b.submissionTime ?? "";
    return tb.localeCompare(ta);
  });

  return candidates[0]?.waybillNumber;
}
