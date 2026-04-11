import { isPickupDelivery, paidFromStatusText } from "@/data/admin/orderClaim";
import { loadOrderClaims, saveOrderClaims } from "@/data/admin/storage";

/**
 * Auto-claim pick-up orders that are paid and have a non-empty shipping address
 * (no manual Claim click required).
 */
export function syncAutoPickupClaimsFromCompiledRows(
  rows: Array<{
    invoiceNumber?: unknown;
    deliveryMethod?: unknown;
    status?: unknown;
    shippingFullAddress?: unknown;
  }>,
): void {
  const claims = loadOrderClaims();
  let changed = false;

  for (const row of rows) {
    const inv =
      typeof row.invoiceNumber === "string" ? row.invoiceNumber.trim() : "";
    if (!inv || claims[inv]) continue;

    const dm =
      typeof row.deliveryMethod === "string"
        ? row.deliveryMethod.trim()
        : "";
    if (!isPickupDelivery(dm)) continue;

    const status = typeof row.status === "string" ? row.status : "";
    if (!paidFromStatusText(status)) continue;

    const addr =
      typeof row.shippingFullAddress === "string"
        ? row.shippingFullAddress.trim()
        : "";
    if (!addr) continue;

    claims[inv] = { claimedAt: new Date().toISOString() };
    changed = true;
  }

  if (changed) saveOrderClaims(claims);
}
