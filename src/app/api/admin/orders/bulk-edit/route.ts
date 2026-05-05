import { NextResponse } from "next/server";
import { calendarYmdInTimeZone } from "@/data/admin/orderClaim";
import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { lookupInvoiceParsedRow } from "@/data/admin/orderInvoiceLookup";
import {
  loadOrderAdjustments,
  loadOrderClaims,
  saveOrderAdjustments,
  saveOrderClaims,
  type OrderAdjustment,
  type OrderLineDetailOverride,
  type OrderStatusAdjustmentValue,
} from "@/data/admin/storage";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mapRawStatusToAdjustment(status: string): OrderStatusAdjustmentValue {
  const s = (status ?? "").toLowerCase();
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("complete")) return "Complete";
  if (s.includes("paid") && !s.includes("unpaid")) return "Paid";
  if (s.includes("processing")) return "Processing";
  if (s.includes("pending")) return "Pending";
  return "Paid";
}

function parseNumber(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "ordersFullEdit");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    invoiceNumbers?: unknown;
    claimDate?: unknown;
    courier?: unknown;
    shippingFullName?: unknown;
    contactNumber?: unknown;
    shippingFullAddress?: unknown;
    deliveryFee?: unknown;
  };

  const invoiceNumbers = Array.isArray(body.invoiceNumbers)
    ? (body.invoiceNumbers as unknown[]).filter((x) => typeof x === "string").map((x) => (x as string).trim()).filter(Boolean)
    : [];
  if (!invoiceNumbers.length) return NextResponse.json({ error: "Missing `invoiceNumbers`." }, { status: 400 });
  if (invoiceNumbers.length > 200) {
    return NextResponse.json({ error: "Too many invoices (max 200 per bulk change)." }, { status: 400 });
  }

  const now = new Date();
  const claimDate = isDateOnly(body.claimDate) ? body.claimDate.trim() : calendarYmdInTimeZone(now, "Asia/Manila");

  const courier = typeof body.courier === "string" ? body.courier.trim() : undefined;
  const shippingFullName = typeof body.shippingFullName === "string" ? body.shippingFullName : undefined;
  const contactNumber = typeof body.contactNumber === "string" ? body.contactNumber : undefined;
  const shippingFullAddress = typeof body.shippingFullAddress === "string" ? body.shippingFullAddress : undefined;
  const deliveryFee = parseNumber(body.deliveryFee);

  const hasAny =
    courier !== undefined ||
    shippingFullName !== undefined ||
    contactNumber !== undefined ||
    shippingFullAddress !== undefined ||
    deliveryFee !== undefined ||
    Boolean(claimDate);
  if (!hasAny) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

  const adjustments = loadOrderAdjustments();
  const claims = loadOrderClaims();
  const changed: string[] = [];
  const notFound: string[] = [];

  for (const inv of invoiceNumbers) {
    const found = await lookupInvoiceParsedRow(inv);
    if (!found) {
      notFound.push(inv);
      continue;
    }

    const existing = adjustments[inv];
    const baseRow = mergeOrderRowWithAdjustment(found.rec, existing);

    const nextLine: OrderLineDetailOverride = { ...(existing?.lineDetails ?? {}) };
    if (courier !== undefined) nextLine.deliveryCourier = courier;
    if (shippingFullName !== undefined) nextLine.shippingFullName = shippingFullName;
    if (contactNumber !== undefined) nextLine.contactNumber = contactNumber;
    if (shippingFullAddress !== undefined) nextLine.shippingFullAddress = shippingFullAddress;
    if (deliveryFee !== undefined) nextLine.deliveryFee = Math.max(0, deliveryFee);

    const nextAdj: OrderAdjustment = {
      invoiceNumber: inv,
      status: existing?.status ?? mapRawStatusToAdjustment(String(found.rec["status"] ?? "")),
      effectiveDate: existing?.effectiveDate ?? found.sourceDate,
      savedAt: new Date().toISOString(),
      lineDetails: Object.keys(nextLine).length ? nextLine : undefined,
    };
    adjustments[inv] = nextAdj;

    const prevClaim = claims[inv];
    claims[inv] = {
      claimedAt: prevClaim?.claimedAt ?? now.toISOString(),
      claimDate,
      claimDateExplicit: true,
    };

    // Keep claim calendar day behavior coherent: we do not touch effective date, order date, or product lines.
    // We only set selected line detail overrides + claim date.
    void baseRow; // keep for future validations if needed
    changed.push(inv);
  }

  saveOrderAdjustments(adjustments);
  saveOrderClaims(claims);

  return NextResponse.json({ ok: true, changed, notFound });
}

