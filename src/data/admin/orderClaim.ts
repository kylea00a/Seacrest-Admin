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

export type OrderClaimsMap = Record<
  string,
  { claimedAt: string; claimDate?: string; claimDateExplicit?: boolean }
>;

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
/** Today as YYYY-MM-DD in a given IANA zone (default Philippines — matches business “order day”). */
export function calendarYmdInTimeZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Whether `dateStr` (YYYY-MM-DD import/order day) is the same calendar day as “now” in `timeZone`.
 * Used for delivery line-edit window so server and UI agree (avoid pure UTC vs local drift).
 */
export function isSameLocalCalendarDay(
  dateStr: string,
  now: Date = new Date(),
  timeZone: string = "Asia/Manila",
): boolean {
  const d = String(dateStr ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return d === calendarYmdInTimeZone(now, timeZone);
}

/**
 * Claim calendar day for display and same-day rules.
 *
 * - If `claimDateExplicit` (set from New Edit), stored `claimDate` is authoritative.
 * - Otherwise, auto-sync can leave `claimDate` on an older day than `claimedAt` (e.g. first compile
 *   day vs when the order was actually claimed). In that case use the Manila day of `claimedAt`
 *   when it is **after** `claimDate`.
 * - If only one of `claimDate` / `claimedAt` is usable, use it.
 */
export function getClaimCalendarYmd(invoiceNumber: string, claims: OrderClaimsMap): string | null {
  const rec = claims[invoiceNumber];
  if (!rec) return null;

  const claimedAtYmd = rec.claimedAt
    ? calendarYmdInTimeZone(new Date(rec.claimedAt), "Asia/Manila")
    : null;

  const raw = rec.claimDate?.trim();
  const claimDateYmd = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;

  if (rec.claimDateExplicit && claimDateYmd) return claimDateYmd;

  if (claimDateYmd && claimedAtYmd) {
    if (claimDateYmd < claimedAtYmd) return claimedAtYmd;
    return claimDateYmd;
  }
  if (claimDateYmd) return claimDateYmd;
  if (claimedAtYmd) return claimedAtYmd;
  return null;
}

/**
 * For **delivery** line-edit “same calendar day” rules, use claim calendar day when present;
 * pick-up and other cases use the order’s effective date.
 */
export function effectiveEditCalendarDay(args: {
  deliveryMethod: string;
  orderDateYmd: string;
  invoiceNumber: string;
  claims: OrderClaimsMap;
}): string {
  const orderDay = String(args.orderDateYmd ?? "").trim().slice(0, 10);
  if (!isNonPickupDelivery(args.deliveryMethod)) return orderDay;
  const cd = getClaimCalendarYmd(args.invoiceNumber, args.claims);
  return cd ?? orderDay;
}

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
