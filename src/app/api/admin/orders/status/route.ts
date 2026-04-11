import { NextResponse } from "next/server";
import { loadOrderAdjustments, saveOrderAdjustments, type OrderStatusAdjustmentValue } from "@/data/admin/storage";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED: OrderStatusAdjustmentValue[] = [
  "Pending",
  "Processing",
  "Paid",
  "Complete",
  "Cancelled",
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isTerminalStatus(v: OrderStatusAdjustmentValue): boolean {
  return v === "Paid" || v === "Complete" || v === "Cancelled";
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "ordersFullEdit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as {
    invoiceNumber?: unknown;
    status?: unknown;
    sourceDate?: unknown;
  };
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  const rawStatus = typeof body.status === "string" ? body.status.trim() : "";
  const sourceDate = isDateOnly(body.sourceDate) ? body.sourceDate : undefined;

  if (!invoiceNumber) return NextResponse.json({ error: "Missing `invoiceNumber`." }, { status: 400 });
  if (!ALLOWED.includes(rawStatus as OrderStatusAdjustmentValue)) {
    return NextResponse.json({ error: "Invalid `status`." }, { status: 400 });
  }
  const status = rawStatus as OrderStatusAdjustmentValue;

  const map = loadOrderAdjustments();
  const existing = map[invoiceNumber];
  if (existing && isTerminalStatus(existing.status)) {
    return NextResponse.json({ error: "Status already finalized for this invoice." }, { status: 400 });
  }

  const effectiveDate = isTerminalStatus(status) ? todayISO() : sourceDate ?? todayISO();

  map[invoiceNumber] = {
    invoiceNumber,
    status,
    effectiveDate,
    savedAt: new Date().toISOString(),
  };

  saveOrderAdjustments(map);
  return NextResponse.json({ ok: true, adjustment: map[invoiceNumber] });
}
