import { NextResponse } from "next/server";
import { applyLineDetailsToRow, mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import {
  getClaimCalendarYmd,
  getProductClaimDisplay,
  isNonPickupDelivery,
  isPickupDelivery,
  isSameLocalCalendarDay,
} from "@/data/admin/orderClaim";
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

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseProductMap(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = num(v);
    if (n != null && n >= 0) out[k] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function mergeProductMaps(
  partial: Record<string, number> | undefined,
  base: unknown,
): Record<string, number> {
  const b = base && typeof base === "object" ? (base as Record<string, unknown>) : {};
  const p = partial ?? {};
  const keys = new Set([...Object.keys(b), ...Object.keys(p)]);
  const out: Record<string, number> = {};
  for (const k of keys) {
    const v = k in p ? p[k] : num(b[k]);
    out[k] = v != null && v >= 0 ? v : 0;
  }
  return out;
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "ordersFullEdit");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as {
    invoiceNumber?: unknown;
    lineDetails?: unknown;
    claimDate?: unknown;
    effectiveDate?: unknown;
  };

  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  if (!invoiceNumber) return NextResponse.json({ error: "Missing `invoiceNumber`." }, { status: 400 });

  const incomingClaimYmd =
    typeof body.claimDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.claimDate.trim())
      ? body.claimDate.trim()
      : null;

  const incomingEffectiveYmd =
    typeof body.effectiveDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.effectiveDate.trim())
      ? body.effectiveDate.trim()
      : null;

  const ldRaw = body.lineDetails;
  if (!ldRaw || typeof ldRaw !== "object") {
    return NextResponse.json({ error: "Missing `lineDetails`." }, { status: 400 });
  }
  const o = ldRaw as Record<string, unknown>;
  const deliveryCategory = o.deliveryCategory === "pickup" || o.deliveryCategory === "delivery" ? o.deliveryCategory : null;
  if (!deliveryCategory) {
    return NextResponse.json({ error: "`lineDetails.deliveryCategory` must be \"pickup\" or \"delivery\"." }, { status: 400 });
  }

  const found = await lookupInvoiceParsedRow(invoiceNumber);
  if (!found) return NextResponse.json({ error: "Order not found for this invoice." }, { status: 404 });

  const map = loadOrderAdjustments();
  const existing = map[invoiceNumber];
  const baseRow = mergeOrderRowWithAdjustment(found.rec, existing);

  const pkgParsed = parseProductMap(o.packageProducts);
  const subParsed = parseProductMap(o.subscriptionProducts);
  const repParsed = parseProductMap(o.repurchaseProducts);

  const lineDetails: OrderLineDetailOverride = {
    deliveryCategory,
    packageProducts: mergeProductMaps(pkgParsed, baseRow["packageProducts"]),
    subscriptionProducts: mergeProductMaps(subParsed, baseRow["subscriptionProducts"]),
    repurchaseProducts: mergeProductMaps(repParsed, baseRow["repurchaseProducts"]),
  };

  const subs = num(o.subscriptionsCount);
  lineDetails.subscriptionsCount =
    subs != null ? Math.max(0, Math.floor(subs)) : Math.max(0, Math.floor(num(baseRow["subscriptionsCount"]) ?? 0));

  if (deliveryCategory === "delivery") {
    const df = num(o.deliveryFee);
    const dfo = num(o.deliveryFeeOthers);
    const mf = num(o.merchantFee);
    const ta = num(o.totalAmount);
    lineDetails.deliveryFee = df ?? num(baseRow["deliveryFee"]) ?? 0;
    lineDetails.deliveryFeeOthers = dfo ?? num(baseRow["deliveryFeeOthers"]) ?? 0;
    lineDetails.merchantFee = mf ?? num(baseRow["merchantFee"]) ?? 0;
    lineDetails.totalAmount = ta ?? num(baseRow["totalAmount"]) ?? 0;
    lineDetails.shippingFullName =
      typeof o.shippingFullName === "string" ? o.shippingFullName : String(baseRow["shippingFullName"] ?? "");
    lineDetails.contactNumber =
      typeof o.contactNumber === "string" ? o.contactNumber : String(baseRow["contactNumber"] ?? "");
    lineDetails.shippingFullAddress =
      typeof o.shippingFullAddress === "string" ? o.shippingFullAddress : String(baseRow["shippingFullAddress"] ?? "");
    lineDetails.province = typeof o.province === "string" ? o.province : String(baseRow["province"] ?? "");
    lineDetails.city = typeof o.city === "string" ? o.city : String(baseRow["city"] ?? "");
    lineDetails.region = typeof o.region === "string" ? o.region : String(baseRow["region"] ?? "");
    lineDetails.zipCode = typeof o.zipCode === "string" ? o.zipCode : String(baseRow["zipCode"] ?? "");
    const baseCourier = typeof baseRow["deliveryCourier"] === "string" ? baseRow["deliveryCourier"].trim() : "";
    if (typeof o.deliveryCourier === "string") {
      const t = o.deliveryCourier.trim();
      if (t === "" || t === "J&T" || t === "International") {
        lineDetails.deliveryCourier = t;
      } else {
        lineDetails.deliveryCourier = baseCourier;
      }
    } else {
      lineDetails.deliveryCourier = baseCourier;
    }
  }

  const proposed = applyLineDetailsToRow(found.rec, lineDetails);
  const statusStr = existing?.status ?? String(proposed["status"] ?? found.rec["status"] ?? "");

  if (statusStr.toLowerCase().includes("cancel")) {
    return NextResponse.json({ error: "Cancelled orders cannot be edited." }, { status: 400 });
  }

  const claims = loadOrderClaims();
  const mode = getProductClaimDisplay({
    deliveryMethod: String(proposed["deliveryMethod"] ?? ""),
    status: statusStr,
    invoiceNumber,
    claims,
  });
  if (mode === "na") {
    return NextResponse.json({ error: "This order cannot be edited." }, { status: 400 });
  }

  const proposedDm = String(proposed["deliveryMethod"] ?? "");
  const sourceDay = String(found.sourceDate ?? "").slice(0, 10);

  /** Full-edit users may bypass claim / same-day locks via the "New Edit" column (header set by client). */
  const bypassClaimDayLocks =
    req.headers.get("x-orders-line-bypass") === "1" ||
    req.headers.get("x-superadmin-line-edit") === "1";

  // Delivery: same-calendar-day rule uses Claim Date (Asia/Manila), not the import/order sheet day.
  if (!bypassClaimDayLocks) {
    if (isNonPickupDelivery(proposedDm)) {
      const claimYmd = incomingClaimYmd ?? getClaimCalendarYmd(invoiceNumber, claims);
      const dayForDeliveryWindow = claimYmd ?? sourceDay;
      if (!isSameLocalCalendarDay(dayForDeliveryWindow)) {
        return NextResponse.json(
          {
            error:
              "Delivery line items can only be edited on the claim calendar day (Asia/Manila), based on Claim Date. After that day they are locked — use New Edit to override if permitted.",
          },
          { status: 400 },
        );
      }
    } else if (isPickupDelivery(proposedDm) && mode === "claimed") {
      return NextResponse.json(
        { error: "Claimed pick-up orders cannot be edited." },
        { status: 400 },
      );
    }
  }

  const next: OrderAdjustment = {
    invoiceNumber,
    status: existing?.status ?? mapRawStatusToAdjustment(String(found.rec["status"] ?? "")),
    // Date shown in All Orders should remain the import/effective date unless explicitly overridden in New Edit.
    effectiveDate: bypassClaimDayLocks && incomingEffectiveYmd ? incomingEffectiveYmd : existing?.effectiveDate ?? found.sourceDate,
    savedAt: new Date().toISOString(),
    lineDetails,
  };

  map[invoiceNumber] = next;
  saveOrderAdjustments(map);

  if (bypassClaimDayLocks && incomingClaimYmd) {
    const prev = claims[invoiceNumber];
    claims[invoiceNumber] = {
      claimedAt: prev?.claimedAt ?? new Date().toISOString(),
      claimDate: incomingClaimYmd,
      claimDateExplicit: true,
    };
    saveOrderClaims(claims);
  }

  return NextResponse.json({ ok: true, adjustment: map[invoiceNumber] });
}
