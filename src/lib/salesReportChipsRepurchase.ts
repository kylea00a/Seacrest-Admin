import type { ProductBreakdown } from "@/data/admin/ordersParse";

export function numField(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isChipsProductName(name: string): boolean {
  return name.toLowerCase().includes("chips");
}

/**
 * Repurchase revenue for chip products only (package/subscription chips excluded).
 * Uses bulk tier pricing when total chips qty on the order is &gt; 0.
 */
export function chipsRepurchaseAmountFromOrder(
  repurchaseProducts: ProductBreakdown | undefined,
  _productPriceByName?: Map<string, { srp: number; membersPrice: number }>,
): number {
  const rep = repurchaseProducts;
  if (!rep || typeof rep !== "object") return 0;

  const chipsKeys = Object.keys(rep).filter(isChipsProductName);
  const chipsQty = chipsKeys.reduce((acc, k) => acc + (Number((rep as Record<string, unknown>)[k]) || 0), 0);
  if (chipsQty <= 0) return 0;

  const chipsTierPrice =
    chipsQty >= 50 ? 99 : chipsQty >= 30 ? 105 : chipsQty >= 15 ? 115 : 129;

  let total = 0;
  for (const [name, qtyRaw] of Object.entries(rep)) {
    if (!isChipsProductName(name)) continue;
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    total += qty * chipsTierPrice;
  }
  return total;
}

export function monthToRange(yyyyMm: string): { start: string; end: string } | null {
  const m = yyyyMm.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
