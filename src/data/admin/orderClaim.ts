/** Pick-up / self-collection — must be explicitly claimed via the Claim button. */
export function isPickupDelivery(deliveryMethod: string): boolean {
  const s = (deliveryMethod ?? "").toLowerCase();
  if (!s.trim()) return false;
  return s.includes("pick");
}

/** Non–pick-up orders count as “delivery” for auto-claim when paid (shipped / courier / etc.). */
export function isNonPickupDelivery(deliveryMethod: string): boolean {
  return !isPickupDelivery(deliveryMethod);
}

export function paidFromStatusText(status: string): boolean {
  const s = (status ?? "").toLowerCase();
  if (!s) return false;
  if (s.includes("cancel")) return false;
  if (s.includes("paid")) return true;
  if (s.includes("complete")) return true;
  return false;
}

export type OrderClaimsMap = Record<string, { claimedAt: string }>;

export function isOrderClaimedForInventory(args: {
  deliveryMethod: string;
  status: string;
  invoiceNumber: string;
  claims: OrderClaimsMap;
}): boolean {
  const paid = paidFromStatusText(args.status);
  if (!paid) return false;
  if (isPickupDelivery(args.deliveryMethod)) {
    return Boolean(args.claims[args.invoiceNumber]?.claimedAt);
  }
  return isNonPickupDelivery(args.deliveryMethod);
}

/** UI label: delivery + paid → auto claimed; pick-up + paid + claim record → claimed; pick-up + paid else → needs button */
export function getProductClaimDisplay(args: {
  deliveryMethod: string;
  status: string;
  invoiceNumber: string;
  claims: OrderClaimsMap;
}): "claimed" | "claim" | "unpaid" | "na" {
  const s = (args.status ?? "").toLowerCase();
  if (s.includes("cancel")) return "na";
  const paid = paidFromStatusText(args.status);
  if (!paid) return "unpaid";
  if (isPickupDelivery(args.deliveryMethod)) {
    return args.claims[args.invoiceNumber]?.claimedAt ? "claimed" : "claim";
  }
  return "claimed";
}
