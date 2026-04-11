import { NextResponse } from "next/server";
import { canClaimPickupOrder } from "@/data/admin/orderInvoiceLookup";
import { loadOrderClaims, saveOrderClaims } from "@/data/admin/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as { invoiceNumber?: unknown };
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  if (!invoiceNumber) {
    return NextResponse.json({ error: "Missing `invoiceNumber`." }, { status: 400 });
  }

  const check = await canClaimPickupOrder(invoiceNumber);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const map = loadOrderClaims();
  if (map[invoiceNumber]) {
    return NextResponse.json({ error: "This order is already claimed." }, { status: 400 });
  }

  const claimedAt = new Date().toISOString();
  map[invoiceNumber] = { claimedAt };
  saveOrderClaims(map);

  return NextResponse.json({ ok: true, claimedAt });
}
