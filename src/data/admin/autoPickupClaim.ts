import {
  calendarYmdInTimeZone,
  isNonPickupDelivery,
  isPickupDelivery,
  paidFromStatusText,
} from "@/data/admin/orderClaim";
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

    const now = new Date();
    claims[inv] = {
      claimedAt: now.toISOString(),
      claimDate: calendarYmdInTimeZone(now, "Asia/Manila"),
    };
    changed = true;
  }

  if (changed) saveOrderClaims(claims);
}

/**
 * Paid delivery orders: persist a claim record the first time compiled rows are loaded
 * so Claim Date reflects the day of sync (auto-claim).
 */
export function syncAutoDeliveryClaimsFromCompiledRows(
  rows: Array<{
    invoiceNumber?: unknown;
    deliveryMethod?: unknown;
    status?: unknown;
  }>,
): void {
  const claims = loadOrderClaims();
  let changed = false;
  const now = new Date();
  const claimedAt = now.toISOString();
  const claimDate = calendarYmdInTimeZone(now, "Asia/Manila");

  for (const row of rows) {
    const inv =
      typeof row.invoiceNumber === "string" ? row.invoiceNumber.trim() : "";
    if (!inv || claims[inv]) continue;

    const dm =
      typeof row.deliveryMethod === "string"
        ? row.deliveryMethod.trim()
        : "";
    if (!isNonPickupDelivery(dm)) continue;

    const status = typeof row.status === "string" ? row.status : "";
    if (!paidFromStatusText(status)) continue;

    claims[inv] = { claimedAt, claimDate };
    changed = true;
  }

  if (changed) saveOrderClaims(claims);
}
