import type { AdminSettings } from "./types";

/** Round to 2 decimal places (weights in admin UI and API). */
export function roundWeight2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Default product column order when settings are empty (matches legacy Excel layout). */
export const DEFAULT_PRODUCT_KEYS: string[] = [
  "Lotion",
  "Soap",
  "Seahealth Coffee",
  "Radiance Coffee",
  "Supreme",
  "Chips - Original",
  "Chips - Spicy",
  "Chips - Sour Cream",
  "Chips - Cheese",
  "Chips - BBQ",
];

/** Ordered product names from admin settings for tables and parsing. */
export function productNamesFromSettings(products: AdminSettings["products"]): string[] {
  if (!products?.length) return [...DEFAULT_PRODUCT_KEYS];
  const names = products.map((p) => p.name.trim()).filter(Boolean);
  return Array.from(new Set(names));
}
