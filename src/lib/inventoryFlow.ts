import { computeClaimedOutTotalsForRange } from "@/data/admin/inventoryCompute";
import {
  loadAdminSettings,
  loadInventoryAdjustments,
  loadInventoryEnding,
  loadInventoryFlow,
  loadInventoryRtsIn,
  loadInventorySupply,
  saveInventoryFlow,
} from "@/data/admin/storage";
import type {
  InventoryAdjustmentEntry,
  InventoryFlowDayRow,
  InventoryRtsInEntry,
  InventorySupplyEntry,
} from "@/data/admin/types";
import { addDaysYmd } from "@/lib/inventoryBeginning";

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

function entryDayKey(at: string): string {
  if (at.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(at)) return at.slice(0, 10);
  try {
    return new Date(at).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function sumEntriesByProductForDay(
  entries: Array<{ productName: string; quantity: number; at: string }>,
  day: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (entryDayKey(e.at) !== day) continue;
    const name = (e.productName ?? "").trim();
    if (!name || !Number.isFinite(e.quantity) || e.quantity <= 0) continue;
    out[name] = (out[name] ?? 0) + e.quantity;
  }
  return out;
}

/** Sum adjustments for a day (negative = shortage). */
function sumAdjustmentsByProductForDay(
  entries: Array<{ productName: string; quantity: number; at: string }>,
  day: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    if (entryDayKey(e.at) !== day) continue;
    const name = (e.productName ?? "").trim();
    if (!name || !Number.isFinite(e.quantity) || e.quantity === 0) continue;
    out[name] = (out[name] ?? 0) + e.quantity;
  }
  return out;
}

export function calcFlowEnding(
  beginning: Record<string, number>,
  delivery: Record<string, number>,
  rtsIn: Record<string, number>,
  adjustment: Record<string, number>,
  out: Record<string, number>,
  productNames: string[],
): Record<string, number> {
  const ending = zeroCounts(productNames);
  for (const p of productNames) {
    ending[p] =
      (beginning[p] ?? 0) +
      (delivery[p] ?? 0) +
      (rtsIn[p] ?? 0) +
      (adjustment[p] ?? 0) -
      (out[p] ?? 0);
  }
  return ending;
}

/** Next-day beginning prefers yesterday's encoded (actual) ending, not calculated expected. */
function beginningForDay(
  date: string,
  byDate: Record<string, InventoryFlowDayRow | undefined>,
  productNames: string[],
): Record<string, number> {
  const yesterday = addDaysYmd(date, -1);
  const encoded = loadInventoryEnding().byDate?.[yesterday]?.counts;
  if (encoded) return copyCounts(encoded, productNames);

  const prevFlow = byDate[yesterday];
  if (prevFlow?.ending) {
    return copyCounts(prevFlow.ending, productNames);
  }

  return zeroCounts(productNames);
}

/** Recompute one calendar day and write it into the flow table. */
export async function syncInventoryFlowDay(date: string): Promise<InventoryFlowDayRow> {
  const settings = loadAdminSettings();
  const productNames = settings.products.map((p) => p.name);
  const flow = loadInventoryFlow();
  flow.byDate = flow.byDate ?? {};

  const supply = loadInventorySupply();
  const rts = loadInventoryRtsIn();
  const adjustments = loadInventoryAdjustments();

  const beginning = beginningForDay(date, flow.byDate, productNames);
  const delivery = sumEntriesByProductForDay(supply.entries as InventorySupplyEntry[], date);
  const rtsIn = sumEntriesByProductForDay(rts.entries as InventoryRtsInEntry[], date);
  const adjustment = sumAdjustmentsByProductForDay(adjustments.entries as InventoryAdjustmentEntry[], date);
  const out = await computeClaimedOutTotalsForRange(date, date);
  const ending = calcFlowEnding(beginning, delivery, rtsIn, adjustment, out, productNames);

  const row: InventoryFlowDayRow = {
    date,
    beginning,
    delivery,
    rtsIn,
    adjustment,
    out,
    ending,
    updatedAt: new Date().toISOString(),
  };
  flow.byDate[date] = row;
  saveInventoryFlow(flow);
  return row;
}

/** Sync days in chronological order (required for correct chaining). */
export async function syncInventoryFlowDays(dates: string[]): Promise<void> {
  const uniq = [...new Set(dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort((a, b) => a.localeCompare(b));
  for (const d of uniq) {
    await syncInventoryFlowDay(d);
  }
}

/** Sync every day from `start` through `end` inclusive (in order). */
export async function syncInventoryFlowRange(start: string, end: string): Promise<void> {
  if (start > end) return;
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDaysYmd(d, 1)) {
    dates.push(d);
  }
  await syncInventoryFlowDays(dates);
}

/**
 * After a day changes, refresh that day and the next day (next beginning depends on encoded ending).
 */
export async function touchInventoryFlowAround(date: string): Promise<void> {
  await syncInventoryFlowDay(date);
  await syncInventoryFlowDay(addDaysYmd(date, 1));
}

export function getInventoryFlowRow(date: string): InventoryFlowDayRow | null {
  const row = loadInventoryFlow().byDate?.[date] ?? null;
  if (!row) return null;
  return {
    ...row,
    adjustment: row.adjustment ?? {},
  };
}
