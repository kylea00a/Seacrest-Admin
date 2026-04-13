import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { computeClaimedOutTotalsForRange } from "@/data/admin/inventoryCompute";
import {
  loadAdminSettings,
  loadInventoryEnding,
  loadInventorySupply,
  saveInventoryEnding,
  saveInventorySupply,
} from "@/data/admin/storage";
import type { InventoryEndingSnapshot } from "@/data/admin/types";
import type { InventorySupplyEntry } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sumSupplyByProduct(entries: InventorySupplyEntry[]): Record<string, number> {
  const inBy: Record<string, number> = {};
  for (const e of entries) {
    const name = (e.productName ?? "").trim();
    if (!name || !Number.isFinite(e.quantity) || e.quantity <= 0) continue;
    inBy[name] = (inBy[name] ?? 0) + e.quantity;
  }
  return inBy;
}

/** Date part of ISO timestamp for range compare (YYYY-MM-DD). */
function entryDayKey(at: string): string {
  if (at.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(at)) return at.slice(0, 10);
  try {
    return new Date(at).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function sumSupplyByProductInRange(
  entries: InventorySupplyEntry[],
  start: string,
  end: string
): Record<string, number> {
  const filtered = entries.filter((e) => {
    const k = entryDayKey(e.at);
    return k >= start && k <= end;
  });
  return sumSupplyByProduct(filtered);
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "inventory");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  let start = url.searchParams.get("start");
  let end = url.searchParams.get("end");
  const today = todayISO();
  if (!isDateOnly(start)) start = today;
  if (!isDateOnly(end)) end = today;
  if (start > end) {
    const t = start;
    start = end;
    end = t;
  }

  const settings = loadAdminSettings();
  const supply = loadInventorySupply();
  const ending = loadInventoryEnding();

  const outPeriod = await computeClaimedOutTotalsForRange(start, end);
  const deliveryInPeriod = sumSupplyByProductInRange(supply.entries, start, end);

  const productNames = settings.products.map((p) => p.name);
  const allKeys = new Set<string>([...productNames, ...Object.keys(deliveryInPeriod), ...Object.keys(outPeriod)]);

  const rows = [...allKeys].sort((a, b) => a.localeCompare(b)).map((name) => {
    const din = deliveryInPeriod[name] ?? 0;
    const out = outPeriod[name] ?? 0;
    return {
      productName: name,
      deliveryIn: din,
      out,
      netPeriod: din - out,
    };
  });

  const entriesInPeriod = supply.entries
    .filter((e) => {
      const k = entryDayKey(e.at);
      return k >= start && k <= end;
    })
    .sort((a, b) => b.at.localeCompare(a.at));

  const dayKey = start; // inventory page uses a single day
  const endingRec = ending.byDate?.[dayKey] ?? null;
  const canEditEncodedEnding = !endingRec?.locked || (auth.isSuperadmin && Boolean(settings.allowSuperadminEditEncodedInventory));

  // Find previous encoded ending snapshot to compute expected ending and discrepancy.
  const prevDate = Object.keys(ending.byDate ?? {})
    .filter((d) => d < dayKey)
    .sort((a, b) => b.localeCompare(a))[0];
  const prevRec = prevDate ? ending.byDate[prevDate] : undefined;

  const expectedEndingBy: Record<string, number> = {};
  const discrepancyBy: Record<string, number> = {};
  if (endingRec?.counts) {
    for (const r of rows) {
      const prevEnd = prevRec?.counts?.[r.productName] ?? 0;
      const expected = prevEnd + r.netPeriod;
      expectedEndingBy[r.productName] = expected;
      const actual = endingRec.counts[r.productName] ?? 0;
      const diff = actual - expected;
      if (diff !== 0) discrepancyBy[r.productName] = diff;
    }
  }

  return NextResponse.json({
    start,
    end,
    productNames,
    rows,
    entries: entriesInPeriod,
    ending: endingRec,
    canEditEncodedEnding,
    expectedEndingBy,
    discrepancyBy,
  });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "inventory");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as {
    productName?: unknown;
    quantity?: unknown;
    note?: unknown;
  };
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  const qty =
    typeof body.quantity === "number"
      ? body.quantity
      : typeof body.quantity === "string"
        ? Number(body.quantity)
        : NaN;
  const note = typeof body.note === "string" ? body.note.trim() : undefined;

  if (!productName) {
    return NextResponse.json({ error: "Missing `productName`." }, { status: 400 });
  }
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "`quantity` must be a positive number." }, { status: 400 });
  }

  const settings = loadAdminSettings();
  const known = settings.products.some((p) => p.name === productName);
  if (!known) {
    return NextResponse.json({ error: "Unknown product. Add it under Packages & Products first." }, { status: 400 });
  }

  const supply = loadInventorySupply();
  const entry: InventorySupplyEntry = {
    id: randomUUID(),
    productName,
    quantity: qty,
    at: new Date().toISOString(),
    ...(note ? { note } : {}),
  };
  supply.entries.push(entry);
  saveInventorySupply(supply);

  return NextResponse.json({ ok: true, entry });
}

export async function PUT(req: Request) {
  const auth = await requireApiPermission(req, "inventory");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as {
    date?: unknown;
    counts?: unknown;
  };
  const date = typeof body.date === "string" ? body.date.trim() : "";
  if (!isDateOnly(date)) return NextResponse.json({ error: "Missing/invalid `date` (YYYY-MM-DD)." }, { status: 400 });
  const countsRaw = body.counts;
  if (!countsRaw || typeof countsRaw !== "object") {
    return NextResponse.json({ error: "Missing/invalid `counts`." }, { status: 400 });
  }

  const settings = loadAdminSettings();
  const allowOverride = Boolean(settings.allowSuperadminEditEncodedInventory);

  const ending = loadInventoryEnding();
  const existing = ending.byDate?.[date];
  if (existing?.locked) {
    if (!auth.isSuperadmin || !allowOverride) {
      return NextResponse.json({ error: "Ending inventory already encoded and locked." }, { status: 403 });
    }
  }

  // Previous encoded snapshot (for expected ending).
  const prevDate = Object.keys(ending.byDate ?? {})
    .filter((d) => d < date)
    .sort((a, b) => b.localeCompare(a))[0];
  const prevRec = prevDate ? ending.byDate[prevDate] : undefined;

  const countsIn = countsRaw as Record<string, unknown>;
  const cleanCounts: Record<string, number> = {};
  for (const p of settings.products.map((x) => x.name)) {
    const v = countsIn[p];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
    cleanCounts[p] = Number.isFinite(n) && n >= 0 ? n : 0;
  }

  // Compute discrepancy snapshot at encode time.
  const supply = loadInventorySupply();
  const out = await computeClaimedOutTotalsForRange(date, date);
  const din = sumSupplyByProductInRange(supply.entries, date, date);
  const discrepancyBy: Record<string, number> = {};
  for (const p of settings.products.map((x) => x.name)) {
    const expected = (prevRec?.counts?.[p] ?? 0) + (din[p] ?? 0) - (out[p] ?? 0);
    const diff = (cleanCounts[p] ?? 0) - expected;
    if (diff !== 0) discrepancyBy[p] = diff;
  }
  const hasDiscrepancy = Object.keys(discrepancyBy).length > 0;

  const rec: InventoryEndingSnapshot = {
    date,
    encodedAt: new Date().toISOString(),
    encodedBy: auth.displayName || auth.email,
    locked: true,
    counts: cleanCounts,
    hasDiscrepancy,
    discrepancyBy: hasDiscrepancy ? discrepancyBy : undefined,
  };

  ending.byDate = ending.byDate ?? {};
  ending.byDate[date] = rec;
  saveInventoryEnding(ending);
  return NextResponse.json({ ok: true, ending: rec });
}
