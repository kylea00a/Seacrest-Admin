import {
  calendarYmdInTimeZone,
  isNonPickupDelivery,
  paidFromStatusText,
} from "@/data/admin/orderClaim";
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

type ImportClaimRow = {
  invoiceNumber?: unknown;
  deliveryMethod?: unknown;
  status?: unknown;
};

/**
 * On order import commit: paid delivery rows get a claim with claim calendar day = upload day (Manila).
 * Pick-up is never auto-claimed here.
 */
export async function applyDeliveryClaimsOnImport(
  rows: ImportClaimRow[],
  importedAtIso: string,
): Promise<void> {
  const importedAt = importedAtIso.trim();
  if (!importedAt) return;

  const claimDate = calendarYmdInTimeZone(new Date(importedAt), "Asia/Manila");
  const claims = loadOrderClaims();
  const touchedDays = new Set<string>();
  let changed = false;

  for (const row of rows) {
    const invoiceNumber =
      typeof row.invoiceNumber === "string" ? row.invoiceNumber.trim() : "";
    if (!invoiceNumber) continue;

    const deliveryMethod =
      typeof row.deliveryMethod === "string" ? row.deliveryMethod.trim() : "";
    if (!isNonPickupDelivery(deliveryMethod)) continue;

    const status = typeof row.status === "string" ? row.status : "";
    if (!paidFromStatusText(status)) continue;

    const existing = claims[invoiceNumber];
    if (existing?.claimDateExplicit) continue;
    if (existing?.claimDate) continue;

    const prevDay = existing?.claimDate?.trim();
    claims[invoiceNumber] = {
      claimedAt: existing?.claimedAt ?? importedAt,
      claimDate,
      claimDateExplicit: true,
    };
    changed = true;
    touchedDays.add(claimDate);
    if (prevDay && prevDay !== claimDate) touchedDays.add(prevDay);
  }

  if (!changed) return;

  saveOrderClaims(claims);
  for (const day of touchedDays) {
    await touchInventoryFlowAround(day);
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