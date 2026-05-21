import { NextResponse } from "next/server";
import { calendarYmdInTimeZone } from "@/data/admin/orderClaim";
import { canClaimPickupOrder } from "@/data/admin/orderInvoiceLookup";
import { loadOrderClaims, saveOrderClaims } from "@/data/admin/storage";
import { requireApiAnyPermission } from "@/lib/adminApiAuth";
import { touchInventoryFlowAround } from "@/lib/inventoryFlow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;
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

  const now = new Date();
  const claimedAt = now.toISOString();
  map[invoiceNumber] = {
    claimedAt,
    claimDate: calendarYmdInTimeZone(now, "Asia/Manila"),
  };
  saveOrderClaims(map);

  const claimDate = map[invoiceNumber]?.claimDate;
  if (claimDate) await touchInventoryFlowAround(claimDate);

  return NextResponse.json({
    ok: true,
    claimedAt,
    claimDate: map[invoiceNumber].claimDate,
  });
}

export async function DELETE(req: Request) {
  const auth = await requireApiAnyPermission(req, ["orders", "ordersFullEdit"]);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const invoiceNumber = (url.searchParams.get("invoiceNumber") ?? "").trim();
  if (!invoiceNumber) {
    return NextResponse.json({ error: "Missing `invoiceNumber`." }, { status: 400 });
  }

  const map = loadOrderClaims();
  const prev = map[invoiceNumber];
  if (!prev) {
    return NextResponse.json({ error: "This order is not claimed." }, { status: 404 });
  }

  const claimDay = prev.claimDate?.trim();
  delete map[invoiceNumber];
  saveOrderClaims(map);

  if (claimDay && /^\d{4}-\d{2}-\d{2}$/.test(claimDay)) {
    await touchInventoryFlowAround(claimDay);
  }

  return NextResponse.json({ ok: true, invoiceNumber });
}
