import * as XLSX from "xlsx";
import { DEFAULT_PRODUCT_KEYS } from "./productSettings";

export type MemberType = "member" | "non-member" | "unknown";

/** Product column key = product name from Settings (dynamic). */
export type ProductKey = string;

/** @deprecated Use `productNamesFromSettings` from `@/data/admin/productSettings` after loading settings. */
export const PRODUCT_KEYS: string[] = DEFAULT_PRODUCT_KEYS;

export type ProductBreakdown = Record<string, number>;

export interface ParsedOrderRow {
  rowIndex: number; // 1-based in sheet (excluding header)
  distributorId: string;
  distributorName: string;
  invoiceNumber: string;
  orderDate: string;
  ordererName: string;
  packagePrice: number;

  packageName: string;
  packageProducts: ProductBreakdown;

  subscriptionsCount: number;
  subscriptionProducts: ProductBreakdown;

  memberType: MemberType;

  repurchaseProducts: ProductBreakdown;

  deliveryMethod: string;
  deliveryCourier: string;
  deliveryFee: number;
  merchantFee: number;
  totalAmount: number;
  paymentMethod: string;
  shippingFullName: string;
  contactNumber: string;
  email: string;
  shippingFullAddress: string;
  province: string;
  city: string;
  region: string;
  zipCode: string;
  status: string;
  isPaid: boolean;
}

export interface OrdersDayParsed {
  sheetName: string;
  rawRows: unknown[][];
  rows: ParsedOrderRow[];
  /** Counts of successful orders (excludes pending/processing/cancelled) with package / subscription / repurchase lines — not product pieces. */
  totals: {
    package: number;
    subscription: number;
    repurchase: number;
  };
  subscriptionsCountTotal: number;
  memberCounts: { member: number; "non-member": number; unknown: number };
  productCounts: Record<string, { package: number; subscription: number; repurchase: number }>;
}

function normalizeText(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseMemberType(v: unknown): MemberType {
  const t = normalizeText(v).toLowerCase();
  if (!t) return "unknown";
  if (t.includes("non")) return "non-member";
  if (t.includes("member")) return "member";
  return "unknown";
}

function parseNumber(v: unknown): number {
  const t = normalizeText(v);
  if (!t) return 0;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeHeader(v: unknown): string {
  return normalizeText(v).toLowerCase().replace(/\s+/g, " ").trim();
}

function findHeaderIndex(headers: unknown[], candidates: string[]): number {
  const normHeaders = headers.map(normalizeHeader);
  for (const c of candidates) {
    const target = c.toLowerCase();
    const idx = normHeaders.findIndex((h) => h === target || h.includes(target));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Match headers that normalize exactly to one of the targets (no substring match). */
function findHeaderIndexExact(headers: unknown[], exactTargets: string[]): number {
  const normHeaders = headers.map(normalizeHeader);
  for (const t of exactTargets) {
    const target = t.toLowerCase().trim();
    const idx = normHeaders.findIndex((h) => h === target);
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Legacy header heuristic (chip flavors, etc.) — only used if it matches a configured product name. */
function legacyHeaderToProductKey(header: string): string | null {
  const h = header.toLowerCase();
  if (h.includes("lotion")) return "Lotion";
  if (h.includes("soap")) return "Soap";
  if (h.includes("seahealth") && h.includes("coffee")) return "Seahealth Coffee";
  if (h.includes("radiance") && h.includes("coffee")) return "Radiance Coffee";
  if (h.includes("supreme")) return "Supreme";
  if (h.includes("chips") || h.includes("chip")) {
    if (h.includes("sour") || h.includes("cream")) return "Chips - Sour Cream";
    if (h.includes("cheese")) return "Chips - Cheese";
    if (h.includes("bbq") || h.includes("barbecue")) return "Chips - BBQ";
    if (h.includes("spicy")) return "Chips - Spicy";
    return "Chips - Original";
  }
  return null;
}

function headerToProductKey(header: string, productKeys: string[]): string | null {
  const h = normalizeHeader(header).toLowerCase();
  const sorted = [...productKeys].sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    const k = key.toLowerCase();
    if (k && h.includes(k)) return key;
  }
  const legacy = legacyHeaderToProductKey(header);
  if (legacy && productKeys.includes(legacy)) return legacy;
  return null;
}

function emptyBreakdown(productKeys: string[]): ProductBreakdown {
  return Object.fromEntries(productKeys.map((k) => [k, 0])) as ProductBreakdown;
}

function columnFallback(productKeys: string[], colCount: number): (string | undefined)[] {
  return Array.from({ length: colCount }, (_, i) => productKeys[i]);
}

function breakdownFromRange(
  headers: unknown[],
  row: unknown[],
  startIdx: number,
  endIdx: number,
  fallbackByIndex: (string | undefined)[] | null,
  productKeys: string[]
): ProductBreakdown {
  const out = emptyBreakdown(productKeys);
  for (let i = startIdx; i <= endIdx; i++) {
    const key = headerToProductKey(normalizeHeader(headers[i] ?? ""), productKeys);
    const qty = parseNumber(row[i]);
    if (qty <= 0) continue;
    if (key && key in out) {
      out[key] += qty;
    } else if (fallbackByIndex) {
      const pos = i - startIdx;
      const fk = fallbackByIndex[pos];
      if (fk && fk in out) out[fk] += qty;
    }
  }
  return out;
}

export function sumBreakdown(b: ProductBreakdown): number {
  let s = 0;
  for (const v of Object.values(b)) {
    if (typeof v === "number" && Number.isFinite(v)) s += v;
  }
  return s;
}

/** Pending, processing, or cancelled orders are excluded from P/S/R order counts in import summary. */
export function isOrderExcludedFromSuccessMetrics(status: string): boolean {
  const s = (status ?? "").toLowerCase();
  if (s.includes("cancel")) return true;
  if (s.includes("pending")) return true;
  if (s.includes("processing")) return true;
  return false;
}

function paidFromStatus(status: string): boolean {
  const s = status.toLowerCase();
  if (!s) return false;
  if (s.includes("unpaid") || s.includes("not paid")) return false;
  if (s.includes("paid")) return true;
  return false;
}

export type ParseOrdersWorkbookOptions = {
  /** Product names from Settings (order defines column fallbacks H–N, etc.). Defaults to legacy list. */
  productKeys?: string[];
};

export function parseOrdersWorkbook(buf: Buffer, opts?: ParseOrdersWorkbookOptions): OrdersDayParsed {
  const productKeys =
    opts?.productKeys?.filter(Boolean).length && opts.productKeys
      ? Array.from(new Set(opts.productKeys.filter(Boolean)))
      : DEFAULT_PRODUCT_KEYS;

  const pkgSubFallback = columnFallback(productKeys, 7);
  const repFallback = columnFallback(productKeys, 10);

  const workbook = XLSX.read(buf, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false }) as unknown[][];

  const headers = rawRows[0] ?? [];

  // Column mapping (0-based):
  // Package products: H-N => 7..13
  // Subscriptions count: P => 15
  // Subscription products: Q-W => 16..22
  // Member flag: X => 23
  // Repurchase products: Y-AH => 24..33
  const PKG_PROD_START = 7;
  const PKG_PROD_END = 13;
  const SUB_COUNT_IDX = 15;
  const SUB_PROD_START = 16;
  const SUB_PROD_END = 22;
  const MEMBER_IDX = 23;
  const REP_PROD_START = 24;
  const REP_PROD_END = 33;

  // Header-based fields (best effort)
  // Do not use bare "distributor" for ID: substring matching would steal the name column.
  const idxDistributorId = findHeaderIndex(headers, [
    "distributor id",
    "distributorid",
    "dist id",
    "dist. id",
    "dist id no",
  ]);
  // Plain header "Distributor" holds person names; exact match so "Distributor ID" is not picked.
  let idxDistributorName = findHeaderIndex(headers, ["distributor name"]);
  if (idxDistributorName < 0) {
    idxDistributorName = findHeaderIndexExact(headers, ["distributor"]);
  }
  const idxInvoice = findHeaderIndex(headers, ["invoice number", "invoice #", "invoice"]);
  const idxOrderDate = findHeaderIndex(headers, ["order date", "date"]);
  // Avoid loose "package" match: it hits "Package Price" first or product columns (H–N) with "Package …" in the header.
  let idxPackageName = findHeaderIndex(headers, ["package name", "package type"]);
  if (idxPackageName < 0) {
    const bare = findHeaderIndexExact(headers, ["package"]);
    if (bare >= 0 && (bare < PKG_PROD_START || bare > PKG_PROD_END)) idxPackageName = bare;
  }
  // Do not fall back to bare "package" — that steals the package name column from the price field.
  const idxPackagePrice = findHeaderIndex(headers, [
    "package price",
    "package amount",
    "package total",
    "package amt",
  ]);
  const idxOrdererName = findHeaderIndex(headers, [
    "orderer name",
    "ordered by",
    "buyer name",
    "customer name",
    "purchaser name",
    "order name",
  ]);

  const idxDeliveryMethod = findHeaderIndex(headers, ["delivery method"]);
  const idxDeliveryCourier = findHeaderIndex(headers, ["delivery courier", "courier"]);
  const idxDeliveryFee = findHeaderIndex(headers, ["delivery fee", "shipping fee"]);
  const idxMerchantFee = findHeaderIndex(headers, ["merchant fee"]);
  const idxTotalAmount = findHeaderIndex(headers, ["total amount", "total"]);
  const idxPaymentMethod = findHeaderIndex(headers, ["payment method"]);
  const idxFullName = findHeaderIndex(headers, ["shipping full name", "full name", "name"]);
  const idxContact = findHeaderIndex(headers, ["contact number", "contact no", "phone"]);
  const idxEmail = findHeaderIndex(headers, ["email"]);
  const idxAddress = findHeaderIndex(headers, ["shipping full address", "address"]);
  const idxProvince = findHeaderIndex(headers, ["province"]);
  const idxCity = findHeaderIndex(headers, ["city"]);
  const idxRegion = findHeaderIndex(headers, ["region"]);
  const idxZip = findHeaderIndex(headers, ["zip code", "zipcode", "zip"]);
  const idxStatus = findHeaderIndex(headers, ["status", "paid"]);

  const dataRows = rawRows.slice(1);
  const rows: ParsedOrderRow[] = [];

  const memberCounts = { member: 0, "non-member": 0, unknown: 0 } as const;
  const memberCountsMutable = { ...memberCounts };

  const allProducts = productKeys;

  const productCounts: Record<string, { package: number; subscription: number; repurchase: number }> =
    Object.fromEntries(allProducts.map((p) => [p, { package: 0, subscription: 0, repurchase: 0 }])) as Record<
      string,
      { package: number; subscription: number; repurchase: number }
    >;

  let subscriptionsCountTotal = 0;
  let packageOrderCount = 0;
  let subscriptionOrderCount = 0;
  let repurchaseOrderCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (!Array.isArray(row)) continue;

    const packageProducts = breakdownFromRange(
      headers,
      row,
      PKG_PROD_START,
      PKG_PROD_END,
      pkgSubFallback,
      productKeys
    );
    const subscriptionsCount = parseNumber(row[SUB_COUNT_IDX]);
    const subscriptionProducts = breakdownFromRange(
      headers,
      row,
      SUB_PROD_START,
      SUB_PROD_END,
      pkgSubFallback,
      productKeys
    );
    const memberType = parseMemberType(row[MEMBER_IDX]);
    const repurchaseProducts = breakdownFromRange(
      headers,
      row,
      REP_PROD_START,
      REP_PROD_END,
      repFallback,
      productKeys
    );

    const distributorId = idxDistributorId >= 0 ? normalizeText(row[idxDistributorId]) : "";
    const distributorName = idxDistributorName >= 0 ? normalizeText(row[idxDistributorName]) : "";
    const invoiceNumber = idxInvoice >= 0 ? normalizeText(row[idxInvoice]) : "";
    const orderDate = idxOrderDate >= 0 ? normalizeText(row[idxOrderDate]) : "";
    const ordererName = idxOrdererName >= 0 ? normalizeText(row[idxOrdererName]) : "";
    const packagePriceFromCol = idxPackagePrice >= 0 ? parseNumber(row[idxPackagePrice]) : 0;
    const packageName =
      idxPackageName >= 0 && !(idxPackageName >= PKG_PROD_START && idxPackageName <= PKG_PROD_END)
        ? normalizeText(row[idxPackageName])
        : "";
    const packagePriceFromCode = (() => {
      const m = packageName.match(/-P(\d+(?:\.\d+)?)/i) ?? packageName.match(/\bP(\d+(?:\.\d+)?)\b/i);
      if (!m) return 0;
      const n = Number(m[1]);
      return Number.isFinite(n) ? n : 0;
    })();
    const packagePrice = packagePriceFromCol || packagePriceFromCode;

    const deliveryMethod = idxDeliveryMethod >= 0 ? normalizeText(row[idxDeliveryMethod]) : "";
    const deliveryCourier = idxDeliveryCourier >= 0 ? normalizeText(row[idxDeliveryCourier]) : "";
    const deliveryFee = idxDeliveryFee >= 0 ? parseNumber(row[idxDeliveryFee]) : 0;
    const merchantFee = idxMerchantFee >= 0 ? parseNumber(row[idxMerchantFee]) : 0;
    const totalAmount = idxTotalAmount >= 0 ? parseNumber(row[idxTotalAmount]) : 0;
    const paymentMethod = idxPaymentMethod >= 0 ? normalizeText(row[idxPaymentMethod]) : "";
    const shippingFullName = idxFullName >= 0 ? normalizeText(row[idxFullName]) : "";
    const contactNumber = idxContact >= 0 ? normalizeText(row[idxContact]) : "";
    const email = idxEmail >= 0 ? normalizeText(row[idxEmail]) : "";
    const shippingFullAddress = idxAddress >= 0 ? normalizeText(row[idxAddress]) : "";
    const province = idxProvince >= 0 ? normalizeText(row[idxProvince]) : "";
    const city = idxCity >= 0 ? normalizeText(row[idxCity]) : "";
    const region = idxRegion >= 0 ? normalizeText(row[idxRegion]) : "";
    const zipCode = idxZip >= 0 ? normalizeText(row[idxZip]) : "";
    const status = idxStatus >= 0 ? normalizeText(row[idxStatus]) : "";
    const isPaid = paidFromStatus(status);

    // Skip completely empty/irrelevant lines
    const any =
      sumBreakdown(packageProducts) > 0 ||
      sumBreakdown(subscriptionProducts) > 0 ||
      sumBreakdown(repurchaseProducts) > 0 ||
      subscriptionsCount > 0 ||
      normalizeText(row[MEMBER_IDX]);
    if (!any) continue;

    rows.push({
      rowIndex: i + 2, // +1 for header, +1 for 1-based
      distributorId,
      distributorName,
      invoiceNumber,
      orderDate,
      ordererName,
      packagePrice,
      packageName,
      packageProducts,
      subscriptionsCount,
      subscriptionProducts,
      memberType,
      repurchaseProducts,
      deliveryMethod,
      deliveryCourier,
      deliveryFee,
      merchantFee,
      totalAmount,
      paymentMethod,
      shippingFullName,
      contactNumber,
      email,
      shippingFullAddress,
      province,
      city,
      region,
      zipCode,
      status,
      isPaid,
    });

    subscriptionsCountTotal += subscriptionsCount;
    memberCountsMutable[memberType] += 1;

    for (const k of productKeys) {
      if (!productCounts[k]) continue;
      productCounts[k].package += packageProducts[k] ?? 0;
      productCounts[k].subscription += subscriptionProducts[k] ?? 0;
      productCounts[k].repurchase += repurchaseProducts[k] ?? 0;
    }

    const ok = !isOrderExcludedFromSuccessMetrics(status);
    const hasPkg = sumBreakdown(packageProducts) > 0 || packagePrice > 0;
    const hasSub = subscriptionsCount > 0 || sumBreakdown(subscriptionProducts) > 0;
    const hasRep = sumBreakdown(repurchaseProducts) > 0;
    if (ok && hasPkg) packageOrderCount++;
    if (ok && hasSub) subscriptionOrderCount++;
    if (ok && hasRep) repurchaseOrderCount++;
  }

  return {
    sheetName,
    rawRows,
    rows,
    totals: {
      package: packageOrderCount,
      subscription: subscriptionOrderCount,
      repurchase: repurchaseOrderCount,
    },
    subscriptionsCountTotal,
    memberCounts: memberCountsMutable,
    productCounts,
  };
}

/** Recompute summary fields for a subset of rows (used when splitting one workbook into many days). */
export function computeAggregatesFromRows(rows: ParsedOrderRow[], productKeys: string[]): {
  totals: OrdersDayParsed["totals"];
  subscriptionsCountTotal: number;
  memberCounts: OrdersDayParsed["memberCounts"];
  productCounts: OrdersDayParsed["productCounts"];
} {
  const memberCountsMutable: OrdersDayParsed["memberCounts"] = { member: 0, "non-member": 0, unknown: 0 };
  const productCounts = Object.fromEntries(
    productKeys.map((p) => [p, { package: 0, subscription: 0, repurchase: 0 }])
  ) as Record<string, { package: number; subscription: number; repurchase: number }>;

  let subscriptionsCountTotal = 0;
  let packageOrderCount = 0;
  let subscriptionOrderCount = 0;
  let repurchaseOrderCount = 0;

  for (const rec of rows) {
    const status = rec.status ?? "";
    const memberType = rec.memberType;
    memberCountsMutable[memberType] += 1;

    subscriptionsCountTotal += rec.subscriptionsCount ?? 0;

    for (const k of productKeys) {
      if (!productCounts[k]) continue;
      productCounts[k].package += rec.packageProducts?.[k] ?? 0;
      productCounts[k].subscription += rec.subscriptionProducts?.[k] ?? 0;
      productCounts[k].repurchase += rec.repurchaseProducts?.[k] ?? 0;
    }

    const ok = !isOrderExcludedFromSuccessMetrics(status);
    const hasPkg = sumBreakdown(rec.packageProducts) > 0 || (rec.packagePrice ?? 0) > 0;
    const hasSub = (rec.subscriptionsCount ?? 0) > 0 || sumBreakdown(rec.subscriptionProducts) > 0;
    const hasRep = sumBreakdown(rec.repurchaseProducts) > 0;
    if (ok && hasPkg) packageOrderCount++;
    if (ok && hasSub) subscriptionOrderCount++;
    if (ok && hasRep) repurchaseOrderCount++;
  }

  return {
    totals: {
      package: packageOrderCount,
      subscription: subscriptionOrderCount,
      repurchase: repurchaseOrderCount,
    },
    subscriptionsCountTotal,
    memberCounts: memberCountsMutable,
    productCounts,
  };
}

