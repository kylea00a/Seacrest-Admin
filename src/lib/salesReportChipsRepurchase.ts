import type { ProductBreakdown } from "@/data/admin/ordersParse";

/** Chip repurchase flavor columns (pieces), matching inventory flow spreadsheet. */
export const CHIP_FLAVOR_COLUMNS = [
  { key: "ORG", label: "ORG", match: /original/i },
  { key: "SPI", label: "SPI", match: /spicy/i },
  { key: "SCR", label: "SCR", match: /sour\s*cream/i },
  { key: "CHS", label: "CHS", match: /cheese/i },
  { key: "BBQ", label: "BBQ", match: /bbq/i },
] as const;

export type ChipFlavorKey = (typeof CHIP_FLAVOR_COLUMNS)[number]["key"];

export function numField(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function isChipsProductName(name: string): boolean {
  return name.toLowerCase().includes("chips");
}

export function chipsFlavorKeyFromProductName(name: string): ChipFlavorKey | null {
  if (!isChipsProductName(name)) return null;
  for (const col of CHIP_FLAVOR_COLUMNS) {
    if (col.match.test(name)) return col.key;
  }
  return null;
}

export function emptyChipsPiecesByFlavor(): Record<ChipFlavorKey, number> {
  const out = {} as Record<ChipFlavorKey, number>;
  for (const col of CHIP_FLAVOR_COLUMNS) out[col.key] = 0;
  return out;
}

/** Sum repurchase chip quantities (pieces) per flavor for one order. */
export function chipsPiecesByFlavorFromOrder(rep: ProductBreakdown | undefined): Record<ChipFlavorKey, number> {
  const out = emptyChipsPiecesByFlavor();
  if (!rep || typeof rep !== "object") return out;
  for (const [name, qtyRaw] of Object.entries(rep)) {
    const key = chipsFlavorKeyFromProductName(name);
    if (!key) continue;
    const qty = Number(qtyRaw) || 0;
    if (qty > 0) out[key] += qty;
  }
  return out;
}

export function addChipsPiecesByFlavor(
  target: Record<ChipFlavorKey, number>,
  add: Record<ChipFlavorKey, number>,
): void {
  for (const col of CHIP_FLAVOR_COLUMNS) target[col.key] += add[col.key] ?? 0;
}

function chipsTierPriceForQty(chipsQty: number): number | null {
  if (chipsQty <= 0) return null;
  return chipsQty >= 50 ? 99 : chipsQty >= 30 ? 105 : chipsQty >= 15 ? 115 : 129;
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
  const chipsTierPrice = chipsTierPriceForQty(chipsQty);
  if (chipsTierPrice == null) return 0;

  let total = 0;
  for (const [name, qtyRaw] of Object.entries(rep)) {
    if (!isChipsProductName(name)) continue;
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    total += qty * chipsTierPrice;
  }
  return total;
}

/** Repurchase amount excluding all chip products (for Seacrest Sales Report). */
export function nonChipsRepurchaseAmountFromOrder(
  rep: ProductBreakdown | undefined,
  productPriceByName: Map<string, { srp: number; membersPrice: number }>,
): number {
  if (!rep || typeof rep !== "object") return 0;
  let total = 0;
  for (const [name, qtyRaw] of Object.entries(rep)) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    if (isChipsProductName(name)) continue;
    const price = productPriceByName.get(name)?.membersPrice ?? 0;
    total += qty * price;
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
