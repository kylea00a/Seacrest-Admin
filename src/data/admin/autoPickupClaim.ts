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
    /** Effective / import date (YYYY-MM-DD) — must not use “today” or orders look claimed today on page load. */
    date?: unknown;
  }>,
): void {
  const claims = loadOrderClaims();
  let changed = false;
  const now = new Date();

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

    const d = typeof row.date === "string" ? row.date.trim().slice(0, 10) : "";
    const claimDate = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : calendarYmdInTimeZone(now, "Asia/Manila");
    claims[inv] = {
      claimedAt: now.toISOString(),
      claimDate,
      claimDateExplicit: true,
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
    date?: unknown;
  }>,
): void {
  const claims = loadOrderClaims();
  let changed = false;
  const now = new Date();
  const claimedAt = now.toISOString();

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

    // For delivery orders, keep the claim calendar day stable (the order's effective date),
    // otherwise old orders would appear as "claimed today" and inflate today's delivery list.
    const d = typeof row.date === "string" ? row.date.trim().slice(0, 10) : "";
    const claimDate = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : calendarYmdInTimeZone(now, "Asia/Manila");
    claims[inv] = { claimedAt, claimDate, claimDateExplicit: true };
    changed = true;
  }

  if (changed) saveOrderClaims(claims);
}
