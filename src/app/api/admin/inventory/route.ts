import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { computeClaimedOutTotalsForRange } from "@/data/admin/inventoryCompute";
import { loadAdminSettings, loadInventorySupply, saveInventorySupply } from "@/data/admin/storage";
import type { InventorySupplyEntry } from "@/data/admin/types";

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

  return NextResponse.json({
    start,
    end,
    productNames,
    rows,
    entries: entriesInPeriod,
  });
}

export async function POST(req: Request) {
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
