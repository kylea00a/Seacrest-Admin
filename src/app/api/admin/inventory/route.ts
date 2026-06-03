import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  aggregateOutDetailsToTotals,
  computeClaimedOutDetailsForRange,
} from "@/data/admin/inventoryCompute";
import { calcFlowEnding } from "@/lib/inventoryFlow";
import {
  loadAdminSettings,
  loadInventoryAdjustments,
  loadInventoryEnding,
  loadInventorySupply,
  saveInventoryAdjustments,
  saveInventoryEnding,
  saveInventorySupply,
} from "@/data/admin/storage";
import type { InventoryEndingSnapshot } from "@/data/admin/types";
import type { InventoryAdjustmentEntry, InventorySupplyEntry } from "@/data/admin/types";
import { accountHasPermission } from "@/data/admin/accountsStore";
import { requireApiPermission } from "@/lib/adminApiAuth";
import {
  getInventoryFlowRow,
  syncInventoryFlowDay,
  syncInventoryFlowRange,
  touchInventoryFlowAround,
} from "@/lib/inventoryFlow";
import { addDaysYmd } from "@/lib/inventoryBeginning";

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

function entryDayKey(at: string): string {
  if (at.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(at)) return at.slice(0, 10);
  try {
    return new Date(at).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "inventory");
  if (auth instanceof NextResponse) return auth;
  const canEditDeliveryLedger = accountHasPermission(auth, "inventoryDeliveryLedger");

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

  const detailsOnly = url.searchParams.get("details") === "1";

  if (detailsOnly) {
    const outDetails = await computeClaimedOutDetailsForRange(start, end);
    return NextResponse.json({ start, end, outDetails });
  }

  const settings = loadAdminSettings();
  const supply = loadInventorySupply();
  const ending = loadInventoryEnding();
  const productNames = settings.products.map((p) => p.name);
  const dayKey = start;
  const endingRec = ending.byDate?.[dayKey] ?? null;

  let flowRow = getInventoryFlowRow(dayKey);
  if (!flowRow) {
    await syncInventoryFlowRange(addDaysYmd(dayKey, -1), dayKey);
    flowRow = getInventoryFlowRow(dayKey) ?? (await syncInventoryFlowDay(dayKey));
  }

  const yesterday = addDaysYmd(dayKey, -1);
  const yesterdayEncoded = ending.byDate?.[yesterday];
  const beginningBy = flowRow.beginning;
  const beginningSourceNote = yesterdayEncoded?.counts
    ? `Encoded ending inventory from ${yesterday} (actual count)`
    : `Calculated flow ending on ${yesterday} (encode yesterday for actual beginning)`;

  const deliveryInPeriod = flowRow.delivery;
  const rtsInPeriod = flowRow.rtsIn;
  const adjustmentPeriod = flowRow.adjustment ?? {};
  const outDetailsForRange = await computeClaimedOutDetailsForRange(start, end);
  const outPeriod = aggregateOutDetailsToTotals(outDetailsForRange);

  const allKeys = new Set<string>([
    ...productNames,
    ...Object.keys(deliveryInPeriod),
    ...Object.keys(rtsInPeriod),
    ...Object.keys(adjustmentPeriod),
    ...Object.keys(outPeriod),
  ]);
  const rows = [...allKeys].sort((a, b) => a.localeCompare(b)).map((name) => {
    const din = deliveryInPeriod[name] ?? 0;
    const rts = rtsInPeriod[name] ?? 0;
    const adj = adjustmentPeriod[name] ?? 0;
    const out = outPeriod[name] ?? 0;
    return {
      productName: name,
      deliveryIn: din,
      rtsIn: rts,
      adjustment: adj,
      out,
      netPeriod: din + rts + adj - out,
    };
  });

  const entriesInPeriod = supply.entries
    .filter((e) => entryDayKey(e.at) === dayKey)
    .sort((a, b) => b.at.localeCompare(a.at));

  const adjustments = loadInventoryAdjustments();
  const adjustmentEntriesInPeriod = adjustments.entries
    .filter((e) => entryDayKey(e.at) === dayKey)
    .sort((a, b) => b.at.localeCompare(a.at));

  const canEditEncodedEnding =
    !endingRec?.locked || (auth.isSuperadmin && Boolean(settings.allowSuperadminEditEncodedInventory));

  const expectedEndingBy = calcFlowEnding(
    flowRow.beginning,
    deliveryInPeriod,
    rtsInPeriod,
    adjustmentPeriod,
    outPeriod,
    productNames,
  );
  const discrepancyBy: Record<string, number> = {};
  for (const r of rows) {
    if (endingRec?.counts) {
      const actual = endingRec.counts[r.productName] ?? 0;
      const expected = expectedEndingBy[r.productName] ?? 0;
      const diff = actual - expected;
      if (diff !== 0) discrepancyBy[r.productName] = diff;
    }
  }

  let totalDeliveryIn = 0;
  let totalRtsIn = 0;
  let totalAdjustment = 0;
  let totalOut = 0;
  for (const r of rows) {
    totalDeliveryIn += r.deliveryIn;
    totalRtsIn += r.rtsIn;
    totalAdjustment += r.adjustment;
    totalOut += r.out;
  }

  return NextResponse.json({
    start,
    end,
    productNames,
    rows,
    entries: entriesInPeriod,
    adjustmentEntries: adjustmentEntriesInPeriod,
    outDetails: [],
    totals: {
      deliveryIn: totalDeliveryIn,
      rtsIn: totalRtsIn,
      adjustment: totalAdjustment,
      out: totalOut,
    },
    beginningBy,
    beginningSourceNote,
    ending: endingRec,
    canEditEncodedEnding,
    canEditDeliveryLedger,
    expectedEndingBy,
    discrepancyBy,
  });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "inventory");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as {
    action?: unknown;
    productName?: unknown;
    quantity?: unknown;
    note?: unknown;
    date?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "addDeliveryIn";
  const productName = typeof body.productName === "string" ? body.productName.trim() : "";
  const qty =
    typeof body.quantity === "number"
      ? body.quantity
      : typeof body.quantity === "string"
        ? Number(body.quantity)
        : NaN;
  const note = typeof body.note === "string" ? body.note.trim() : undefined;
  const date =
    typeof body.date === "string" && isDateOnly(body.date.trim()) ? body.date.trim() : todayISO();

  if (!productName) {
    return NextResponse.json({ error: "Missing `productName`." }, { status: 400 });
  }

  const settings = loadAdminSettings();
  const known = settings.products.some((p) => p.name === productName);
  if (!known) {
    return NextResponse.json({ error: "Unknown product. Add it under Packages & Products first." }, { status: 400 });
  }

  if (action === "addAdjustment") {
    if (!Number.isFinite(qty) || qty === 0) {
      return NextResponse.json({ error: "`quantity` must be non-zero (use negative for shortage)." }, { status: 400 });
    }
    const adjustments = loadInventoryAdjustments();
    const entry: InventoryAdjustmentEntry = {
      id: randomUUID(),
      productName,
      quantity: qty,
      at: `${date}T12:00:00.000Z`,
      ...(note ? { note } : {}),
    };
    adjustments.entries.push(entry);
    saveInventoryAdjustments(adjustments);
    await touchInventoryFlowAround(date);
    return NextResponse.json({ ok: true, entry });
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "`quantity` must be a positive number." }, { status: 400 });
  }

  const supply = loadInventorySupply();
  const entry: InventorySupplyEntry = {
    id: randomUUID(),
    productName,
    quantity: qty,
    at: `${date}T12:00:00.000Z`,
    ...(note ? { note } : {}),
  };
  supply.entries.push(entry);
  saveInventorySupply(supply);

  await touchInventoryFlowAround(date);

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

  const productNames = settings.products.map((x) => x.name);
  const countsIn = countsRaw as Record<string, unknown>;
  const cleanCounts: Record<string, number> = {};
  for (const p of productNames) {
    const v = countsIn[p];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : 0;
    cleanCounts[p] = Number.isFinite(n) && n >= 0 ? n : 0;
  }

  let flowRow = getInventoryFlowRow(date);
  if (!flowRow) flowRow = await syncInventoryFlowDay(date);

  const discrepancyBy: Record<string, number> = {};
  for (const p of productNames) {
    const expected = flowRow.ending[p] ?? 0;
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

  await touchInventoryFlowAround(date);

  return NextResponse.json({ ok: true, ending: rec });
}

export async function PATCH(req: Request) {
  const auth = await requireApiPermission(req, "inventoryDeliveryLedger");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    id?: unknown;
    productName?: unknown;
    quantity?: unknown;
    note?: unknown;
  };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });

  if (body.productName === undefined && body.quantity === undefined && body.note === undefined) {
    return NextResponse.json(
      { error: "Nothing to update (send productName, quantity, and/or note)." },
      { status: 400 },
    );
  }

  const supply = loadInventorySupply();
  const idx = supply.entries.findIndex((e) => e.id === id);
  if (idx < 0) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const settings = loadAdminSettings();
  const knownNames = new Set(settings.products.map((p) => p.name));

  const entry = supply.entries[idx]!;
  const oldDay = entryDayKey(entry.at);

  if (body.productName !== undefined) {
    const pn = typeof body.productName === "string" ? body.productName.trim() : "";
    if (!pn || !knownNames.has(pn)) {
      return NextResponse.json({ error: "Unknown or missing `productName`." }, { status: 400 });
    }
    entry.productName = pn;
  }

  if (body.quantity !== undefined) {
    const qty =
      typeof body.quantity === "number"
        ? body.quantity
        : typeof body.quantity === "string"
          ? Number(body.quantity)
          : NaN;
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "`quantity` must be a positive number." }, { status: 400 });
    }
    entry.quantity = qty;
  }

  if (body.note !== undefined) {
    if (body.note === null) {
      delete entry.note;
    } else if (typeof body.note === "string") {
      const n = body.note.trim();
      if (n) entry.note = n;
      else delete entry.note;
    }
  }

  supply.entries[idx] = entry;
  saveInventorySupply(supply);

  const newDay = entryDayKey(entry.at);
  if (oldDay) await touchInventoryFlowAround(oldDay);
  if (newDay && newDay !== oldDay) await touchInventoryFlowAround(newDay);

  return NextResponse.json({ ok: true, entry });
}

export async function DELETE(req: Request) {
  const auth = await requireApiPermission(req, "inventoryDeliveryLedger");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing `id` query parameter." }, { status: 400 });

  const supply = loadInventorySupply();
  const idx = supply.entries.findIndex((e) => e.id === id);
  if (idx < 0) return NextResponse.json({ error: "Entry not found." }, { status: 404 });

  const removed = supply.entries[idx]!;
  const day = entryDayKey(removed.at);
  supply.entries.splice(idx, 1);
  saveInventorySupply(supply);

  if (day) await touchInventoryFlowAround(day);

  return NextResponse.json({ ok: true });
}
