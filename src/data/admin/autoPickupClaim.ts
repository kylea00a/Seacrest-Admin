import { calendarYmdInTimeZone, isNonPickupDelivery } from "@/data/admin/orderClaim";
import { loadOrderClaims, saveOrderClaims } from "@/data/admin/storage";
import type { OrderStatusAdjustmentValue } from "@/data/admin/storage";
import { touchInventoryFlowAround } from "@/lib/inventoryFlow";

function isPaidStatus(status: OrderStatusAdjustmentValue): boolean {
  return status === "Paid" || status === "Complete";
}

/**
 * When status changes: delivery + paid → auto-claim on claim calendar day = today (Manila);
 * pick-up + paid → stays unclaimed (any prior auto-claim is removed).
 */
export async function applyClaimRulesOnStatusChange(
  invoiceNumber: string,
  status: OrderStatusAdjustmentValue,
  deliveryMethod: string,
): Promise<void> {
  const claims = loadOrderClaims();
  const prev = claims[invoiceNumber];
  const prevClaimDay = prev?.claimDate?.trim();

  if (isPaidStatus(status) && isNonPickupDelivery(deliveryMethod)) {
    const now = new Date();
    const claimDate = calendarYmdInTimeZone(now, "Asia/Manila");
    claims[invoiceNumber] = {
      claimedAt: now.toISOString(),
      claimDate,
      claimDateExplicit: true,
    };
    saveOrderClaims(claims);
    await touchInventoryFlowAround(claimDate);
    if (prevClaimDay && prevClaimDay !== claimDate) await touchInventoryFlowAround(prevClaimDay);
    return;
  }

  if (isPaidStatus(status)) {
    return;
  }

  if (prev) {
    delete claims[invoiceNumber];
    saveOrderClaims(claims);
    if (prevClaimDay) await touchInventoryFlowAround(prevClaimDay);
  }
}

/** Pick-up is never auto-claimed on page load. */
export function syncAutoPickupClaimsFromCompiledRows(
  _rows: Array<{
    invoiceNumber?: unknown;
    deliveryMethod?: unknown;
    status?: unknown;
    shippingFullAddress?: unknown;
    date?: unknown;
  }>,
): void {
  void _rows;
}

/** Delivery auto-claim on compile disabled — claim is set when status becomes Paid/Complete. */
export function syncAutoDeliveryClaimsFromCompiledRows(
  _rows: Array<{
    invoiceNumber?: unknown;
    deliveryMethod?: unknown;
    status?: unknown;
    date?: unknown;
  }>,
): void {
  void _rows;
}