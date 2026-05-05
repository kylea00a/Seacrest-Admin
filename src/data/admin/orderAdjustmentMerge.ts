import type { OrderAdjustment, OrderLineDetailOverride } from "@/data/admin/storage";

/** Canonical labels stored when user picks delivery type in order line editor. */
export const DELIVERY_METHOD_PICKUP_UI = "For Pick Up";
export const DELIVERY_METHOD_DELIVERY_UI = "For Delivery";

export function applyLineDetailsToRow(
  rec: Record<string, unknown>,
  lineDetails: OrderLineDetailOverride | undefined,
): Record<string, unknown> {
  if (!lineDetails) return { ...rec };
  const out: Record<string, unknown> = { ...rec };
  if (lineDetails.packageProducts) out.packageProducts = lineDetails.packageProducts;
  if (lineDetails.subscriptionProducts) out.subscriptionProducts = lineDetails.subscriptionProducts;
  if (lineDetails.repurchaseProducts) out.repurchaseProducts = lineDetails.repurchaseProducts;
  if (lineDetails.subscriptionsCount != null) out.subscriptionsCount = lineDetails.subscriptionsCount;
  if (lineDetails.deliveryCategory === "pickup") {
    out.deliveryMethod = DELIVERY_METHOD_PICKUP_UI;
    out.deliveryFee = 0;
    out.merchantFee = 0;
    out.deliveryCourier = "";
  }
  if (lineDetails.deliveryCategory === "delivery") {
    out.deliveryMethod = DELIVERY_METHOD_DELIVERY_UI;
    if (lineDetails.deliveryCourier !== undefined) {
      out.deliveryCourier = lineDetails.deliveryCourier;
    }
  }
  if (lineDetails.deliveryFee != null) out.deliveryFee = lineDetails.deliveryFee;
  if (lineDetails.deliveryFeeOthers != null) out.deliveryFeeOthers = lineDetails.deliveryFeeOthers;
  if (lineDetails.merchantFee != null) out.merchantFee = lineDetails.merchantFee;
  if (lineDetails.totalAmount != null) out.totalAmount = lineDetails.totalAmount;
  if (lineDetails.shippingFullName != null) out.shippingFullName = lineDetails.shippingFullName;
  if (lineDetails.contactNumber != null) out.contactNumber = lineDetails.contactNumber;
  if (lineDetails.shippingFullAddress != null) out.shippingFullAddress = lineDetails.shippingFullAddress;
  if (lineDetails.province != null) out.province = lineDetails.province;
  if (lineDetails.city != null) out.city = lineDetails.city;
  if (lineDetails.region != null) out.region = lineDetails.region;
  if (lineDetails.zipCode != null) out.zipCode = lineDetails.zipCode;
  return out;
}

export function mergeOrderRowWithAdjustment(
  rec: Record<string, unknown>,
  adj: OrderAdjustment | undefined,
): Record<string, unknown> {
  if (!adj?.lineDetails) return { ...rec };
  return applyLineDetailsToRow(rec, adj.lineDetails);
}
