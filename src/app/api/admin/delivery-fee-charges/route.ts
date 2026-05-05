import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadDeliveryFeeCharges, saveDeliveryFeeCharges } from "@/data/admin/storage";
import type { DeliveryFeeCharge } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "salesReport");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const all = loadDeliveryFeeCharges();
  const live = all.filter((c) => !c.voidedAt);
  const filtered =
    isDateOnly(start) && isDateOnly(end)
      ? live.filter((c) => c.date >= start && c.date <= end)
      : live;
  filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ charges: filtered });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "salesReport");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as Partial<DeliveryFeeCharge> & { date?: unknown; invoiceNumber?: unknown; amount?: unknown };

  const date = typeof body.date === "string" ? body.date.trim() : "";
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  const amount =
    typeof body.amount === "number" ? body.amount : typeof body.amount === "string" ? Number(body.amount) : NaN;

  if (!isDateOnly(date)) return NextResponse.json({ error: "Missing/invalid `date` (YYYY-MM-DD)." }, { status: 400 });
  if (!invoiceNumber) return NextResponse.json({ error: "Missing `invoiceNumber`." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Missing/invalid `amount` (>= 0)." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const rec: DeliveryFeeCharge = {
    id: randomUUID(),
    date,
    invoiceNumber,
    attemptId: typeof body.attemptId === "string" ? body.attemptId.trim() : undefined,
    amount,
    note: typeof body.note === "string" ? body.note.trim() : undefined,
    createdAt: now,
    createdBy: auth.displayName || auth.email,
  };
  const all = loadDeliveryFeeCharges();
  all.unshift(rec);
  saveDeliveryFeeCharges(all);
  return NextResponse.json({ ok: true, charge: rec });
}

export async function DELETE(req: Request) {
  const auth = await requireApiPermission(req, "salesReport");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });

  const all = loadDeliveryFeeCharges();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const prev = all[idx]!;
  if (prev.voidedAt && !auth.isSuperadmin) {
    return NextResponse.json({ error: "Already voided." }, { status: 400 });
  }
  all[idx] = { ...prev, voidedAt: new Date().toISOString(), voidedBy: auth.displayName || auth.email };
  saveDeliveryFeeCharges(all);
  return NextResponse.json({ ok: true });
}

