import { NextResponse } from "next/server";
import { deleteOrdersDay, readOrdersDay, removeOrdersIndexDate } from "@/data/admin/orders";
import { loadDeliveryTracking, loadOrderAdjustments, loadOrdersIndex, saveDeliveryTracking, saveOrderAdjustments } from "@/data/admin/storage";
import { requireApiAnyPermission, requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, [
    "import",
    "orders",
    "ordersFullEdit",
    "salesReport",
    "delivery",
  ]);
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const date = url.searchParams.get("date");

  if (date) {
    const day = readOrdersDay(date);
    if (!day) return NextResponse.json({ error: "No import found for this date." }, { status: 404 });
    return NextResponse.json({ day });
  }

  const index = loadOrdersIndex();
  return NextResponse.json({ index });
}

export async function DELETE(req: Request) {
  const auth = await requireApiPermission(req, "import");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const datesParam = url.searchParams.get("dates");
  const dates =
    datesParam && datesParam.trim()
      ? datesParam
          .split(",")
          .map((s) => s.trim())
          .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      : [];

  if (!date && dates.length === 0) return NextResponse.json({ error: "Missing `date` or `dates`." }, { status: 400 });

  const targets = date ? [date] : Array.from(new Set(dates));

  const invoiceNumbers: string[] = [];
  let existedAny = false;
  let deletedDays = 0;

  for (const d of targets) {
    const dayUnknown = readOrdersDay(d);
    const day =
      typeof dayUnknown === "object" && dayUnknown !== null
        ? (dayUnknown as Record<string, unknown>)
        : null;
    try {
      const parsed =
        day && typeof day["parsed"] === "object" && day["parsed"] !== null
          ? (day["parsed"] as Record<string, unknown>)
          : null;
      const parsedRows = parsed?.["rows"];
      if (Array.isArray(parsedRows)) {
        for (const r of parsedRows) {
          const rec = typeof r === "object" && r !== null ? (r as Record<string, unknown>) : null;
          const inv = typeof rec?.["invoiceNumber"] === "string" ? (rec["invoiceNumber"] as string).trim() : "";
          if (inv) invoiceNumbers.push(inv);
        }
      }
    } catch {
      // ignore
    }

    const existed = deleteOrdersDay(d);
    if (existed) {
      existedAny = true;
      deletedDays += 1;
    }
    removeOrdersIndexDate(d);
  }

  // Remove tracking numbers for invoices that belonged to this import.
  if (invoiceNumbers.length) {
    const tracking = loadDeliveryTracking();
    let changed = false;
    for (const inv of invoiceNumbers) {
      if (tracking[inv]) {
        delete tracking[inv];
        changed = true;
      }
    }
    if (changed) saveDeliveryTracking(tracking);
  }

  // Remove status adjustments for invoices that belonged to this import.
  if (invoiceNumbers.length) {
    const adjustments = loadOrderAdjustments();
    let changed = false;
    for (const inv of invoiceNumbers) {
      if (adjustments[inv]) {
        delete adjustments[inv];
        changed = true;
      }
    }
    if (changed) saveOrderAdjustments(adjustments);
  }

  return NextResponse.json({
    ok: true,
    existed: existedAny,
    deletedDays,
    deletedInvoices: invoiceNumbers.length,
  });
}

