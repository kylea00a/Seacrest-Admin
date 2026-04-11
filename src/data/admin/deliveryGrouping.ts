import { isNonPickupDelivery } from "@/data/admin/orderClaim";
import { roundWeight2 } from "@/data/admin/productSettings";

/** Row shape used by Delivery menu and J&T export (compiled orders). */
export type DeliveryRowLike = {
  invoiceNumber: string;
  distributorId: string;
  distributorName: string;
  shippingFullName: string;
  contactNumber: string;
  shippingFullAddress: string;
  province: string;
  city: string;
  region: string;
  deliveryMethod: string;
  deliveryCourier: string;
  isPaid: boolean;
  packageProducts: Record<string, number>;
  subscriptionProducts: Record<string, number>;
  repurchaseProducts: Record<string, number>;
};

export function isPaidDeliveryOrder(r: DeliveryRowLike): boolean {
  if (!r.isPaid) return false;
  return isNonPickupDelivery(r.deliveryMethod);
}

export type CourierFilterBucket = "jt" | "intl" | "none";

/** Map stored courier label to filter bucket (blank = none). */
export function courierBucket(courier: string): CourierFilterBucket {
  const c = (courier ?? "").trim().toLowerCase();
  if (!c) return "none";
  if (c.includes("international")) return "intl";
  if (c.includes("j&t") || c.includes("jnt") || c === "jt" || c.includes("j & t")) return "jt";
  return "none";
}

export function receiverTripleKey(r: DeliveryRowLike): string {
  const norm = (s: string) =>
    (s ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  return [norm(r.shippingFullName), norm(r.contactNumber), norm(r.shippingFullAddress)].join("\t");
}

export type MergedDeliveryGroup = {
  key: string;
  shippingFullName: string;
  contactNumber: string;
  shippingFullAddress: string;
  province: string;
  city: string;
  region: string;
  /** Unique distributor display names (order preserved). */
  distributorNames: string[];
  invoiceNumbers: string[];
  productTotals: Record<string, number>;
};

function sumProducts(
  r: DeliveryRowLike,
  productKeys: string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of productKeys) {
    out[k] =
      (r.packageProducts?.[k] ?? 0) +
      (r.subscriptionProducts?.[k] ?? 0) +
      (r.repurchaseProducts?.[k] ?? 0);
  }
  return out;
}

export function mergeDeliveryRowsByReceiver(
  rows: DeliveryRowLike[],
  productKeys: string[],
): MergedDeliveryGroup[] {
  const map = new Map<string, MergedDeliveryGroup>();

  for (const r of rows) {
    const key = receiverTripleKey(r);
    const line = sumProducts(r, productKeys);
    const distName = (r.distributorName ?? r.distributorId ?? "").trim() || "—";
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        shippingFullName: r.shippingFullName ?? "",
        contactNumber: r.contactNumber ?? "",
        shippingFullAddress: r.shippingFullAddress ?? "",
        province: r.province ?? "",
        city: r.city ?? "",
        region: r.region ?? "",
        distributorNames: [distName],
        invoiceNumbers: [r.invoiceNumber],
        productTotals: { ...line },
      });
      continue;
    }
    for (const k of productKeys) {
      existing.productTotals[k] = (existing.productTotals[k] ?? 0) + (line[k] ?? 0);
    }
    if (!existing.invoiceNumbers.includes(r.invoiceNumber)) {
      existing.invoiceNumbers.push(r.invoiceNumber);
    }
    if (!existing.distributorNames.includes(distName)) {
      existing.distributorNames.push(distName);
    }
  }

  return Array.from(map.values());
}

export function totalProductCount(totals: Record<string, number>): number {
  let n = 0;
  for (const v of Object.values(totals)) {
    if (typeof v === "number" && v > 0) n += v;
  }
  return Math.round(n);
}

/** Sum of qty × product weight (kg) from settings map by product name. */
export function totalWeightKgFromTotals(
  totals: Record<string, number>,
  weightByProductName: Record<string, number>,
): number {
  let w = 0;
  for (const [name, qty] of Object.entries(totals)) {
    if (qty > 0) w += qty * (weightByProductName[name] ?? 0);
  }
  return roundWeight2(w);
}
