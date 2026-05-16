import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadAdminSettings, loadInventoryFlow, loadInventoryRtsIn, saveInventoryRtsIn } from "@/data/admin/storage";
import type { InventoryRtsInEntry } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";
import { addDaysYmd } from "@/lib/inventoryBeginning";
import { syncInventoryFlowDay, syncInventoryFlowRange } from "@/lib/inventoryFlow";

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

  const refresh = url.searchParams.get("refresh") === "1";
  if (refresh) {
    await syncInventoryFlowRange(start, end);
  }

  const settings = loadAdminSettings();
  const productNames = settings.products.map((p) => p.name);
  const flow = loadInventoryFlow();
  const rows = [];
  for (let d = start; d <= end; d = addDaysYmd(d, 1)) {
    const row = flow.byDate?.[d] ?? null;
    rows.push(row ? { ...row } : { date: d, missing: true });
  }

  return NextResponse.json({
    start,
    end,
    productNames,
    rows,
    refreshed: refresh,
  });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "inventory");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    productName?: unknown;
    quantity?: unknown;
    note?: unknown;
    date?: unknown;
  };
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
  if (!Number.isFinite(qty) || qty <= 0) {
    return NextResponse.json({ error: "`quantity` must be a positive number." }, { status: 400 });
  }

  const settings = loadAdminSettings();
  if (!settings.products.some((p) => p.name === productName)) {
    return NextResponse.json({ error: "Unknown product." }, { status: 400 });
  }

  const rts = loadInventoryRtsIn();
  const entry: InventoryRtsInEntry = {
    id: randomUUID(),
    productName,
    quantity: qty,
    at: `${date}T12:00:00.000Z`,
    ...(note ? { note } : {}),
  };
  rts.entries.push(entry);
  saveInventoryRtsIn(rts);

  const row = await syncInventoryFlowDay(date);
  await syncInventoryFlowDay(addDaysYmd(date, 1));

  return NextResponse.json({ ok: true, entry, row });
}
