import { NextResponse } from "next/server";
import { loadDeliveryTracking, saveDeliveryTracking } from "@/data/admin/storage";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;
  const tracking = loadDeliveryTracking();
  return NextResponse.json({ tracking });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as { invoiceNumber?: unknown; trackingNumber?: unknown };
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  const trackingNumber = typeof body.trackingNumber === "string" ? body.trackingNumber.trim() : "";

  if (!invoiceNumber) return NextResponse.json({ error: "Missing `invoiceNumber`." }, { status: 400 });
  if (!trackingNumber) return NextResponse.json({ error: "Missing `trackingNumber`." }, { status: 400 });

  const map = loadDeliveryTracking();
  if (map[invoiceNumber]?.trackingNumber) {
    return NextResponse.json({ error: "Tracking number already set for this invoice." }, { status: 400 });
  }

  map[invoiceNumber] = { trackingNumber, savedAt: new Date().toISOString() };
  saveDeliveryTracking(map);
  return NextResponse.json({ ok: true, tracking: map[invoiceNumber] });
}

