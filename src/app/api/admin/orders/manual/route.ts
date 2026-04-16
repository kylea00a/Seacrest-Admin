import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { readOrdersDay, saveOrdersDay, upsertOrdersIndex } from "@/data/admin/orders";
import { computeAggregatesFromRows, type ParsedOrderRow } from "@/data/admin/ordersParse";
import { productNamesFromSettings } from "@/data/admin/productSettings";
import { loadAdminSettings } from "@/data/admin/storage";
import { buildBulkSummaryForDay } from "@/data/admin/ordersBulkSplit";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "ordersFullEdit");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as Record<string, unknown>;
  const date = str(body.date);
  if (!isDateOnly(date)) return NextResponse.json({ error: "Missing/invalid `date` (YYYY-MM-DD)." }, { status: 400 });

  const invoiceNumber = str(body.invoiceNumber);
  if (!invoiceNumber) return NextResponse.json({ error: "Missing `invoiceNumber`." }, { status: 400 });

  const deliveryCategory = str(body.deliveryCategory);
  const isDelivery = deliveryCategory === "delivery";
  const deliveryMethod = isDelivery ? "For Delivery" : "Pick-up";

  const settings = loadAdminSettings();
  const productKeys = productNamesFromSettings(settings.products);
  const mapProducts = (raw: unknown): Record<string, number> => {
    const out: Record<string, number> = Object.fromEntries(productKeys.map((k) => [k, 0]));
    if (!raw || typeof raw !== "object") return out;
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!(k in out)) continue;
      const n = num(v);
      out[k] = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    return out;
  };

  const pkg = mapProducts(body.packageProducts);
  const sub = mapProducts(body.subscriptionProducts);
  const rep = mapProducts(body.repurchaseProducts);

  const dayUnknown = readOrdersDay(date);
  const day = dayUnknown && typeof dayUnknown === "object" ? (dayUnknown as Record<string, unknown>) : null;
  const parsed = day?.parsed && typeof day.parsed === "object" ? (day.parsed as Record<string, unknown>) : null;
  const parsedRows = Array.isArray(parsed?.rows) ? (parsed!.rows as unknown[]) : [];
  const existingRows = parsedRows.filter((r) => r && typeof r === "object") as ParsedOrderRow[];

  // Avoid duplicates by invoice number on the same day.
  for (const r of existingRows) {
    const inv = str((r as unknown as Record<string, unknown>)?.invoiceNumber);
    if (inv && inv === invoiceNumber) {
      return NextResponse.json({ error: "Invoice already exists on this date." }, { status: 400 });
    }
  }

  const maxRowIndex = existingRows.reduce<number>((m, r) => {
    const ri = typeof r.rowIndex === "number" ? r.rowIndex : Number((r as unknown as any)?.rowIndex ?? 0);
    return Number.isFinite(ri) && ri > m ? ri : m;
  }, 0);

  const row: ParsedOrderRow = {
    rowIndex: maxRowIndex + 1,
    distributorId: str(body.distributorId),
    distributorName: str(body.distributorName),
    invoiceNumber,
    orderDate: str(body.orderDate),
    ordererName: str(body.ordererName),
    packagePrice: Math.max(0, num(body.packagePrice) || 0),
    packageName: str(body.packageName),
    packageProducts: pkg,
    subscriptionsCount: Math.max(0, Math.floor(num(body.subscriptionsCount) || 0)),
    subscriptionProducts: sub,
    memberType: (str(body.memberType) as any) || "unknown",
    repurchaseProducts: rep,
    deliveryMethod,
    deliveryCourier: isDelivery ? str(body.deliveryCourier) : "",
    deliveryFee: isDelivery ? Math.max(0, num(body.deliveryFee) || 0) : 0,
    merchantFee: isDelivery ? Math.max(0, num(body.merchantFee) || 0) : 0,
    totalAmount: isDelivery ? Math.max(0, num(body.totalAmount) || 0) : Math.max(0, num(body.totalAmount) || 0),
    paymentMethod: str(body.paymentMethod),
    shippingFullName: isDelivery ? str(body.shippingFullName) : "",
    contactNumber: isDelivery ? str(body.contactNumber) : "",
    email: str(body.email),
    shippingFullAddress: isDelivery ? str(body.shippingFullAddress) : "",
    province: isDelivery ? str(body.province) : "",
    city: isDelivery ? str(body.city) : "",
    region: isDelivery ? str(body.region) : "",
    zipCode: isDelivery ? str(body.zipCode) : "",
    status: str(body.status) || "Paid",
    isPaid: Boolean(body.isPaid),
  };

  const nextRows: ParsedOrderRow[] = [...existingRows, row];
  const agg = computeAggregatesFromRows(nextRows, productKeys);
  const dayParsed = {
    sheetName: "manual",
    rawRows: [],
    rows: nextRows,
    totals: agg.totals,
    subscriptionsCountTotal: agg.subscriptionsCountTotal,
    memberCounts: agg.memberCounts,
    productCounts: agg.productCounts,
  };

  const importedAt = new Date().toISOString();
  const summary = buildBulkSummaryForDay(date, "manual", importedAt, nextRows.length, dayParsed);

  saveOrdersDay(date, { summary, sheetName: "manual", parsed: dayParsed, manualId: randomUUID() });
  upsertOrdersIndex(summary);

  return NextResponse.json({ ok: true, summary, row });
}

