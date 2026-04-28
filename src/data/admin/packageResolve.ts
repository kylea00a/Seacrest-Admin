import type { AdminSettings } from "./types";

/** Match a numeric package price to the Packages & Products list (exact to cents). */
export function resolvePackageNameFromPrice(orderPrice: number, packages: AdminSettings["packages"]): string {
  if (!Number.isFinite(orderPrice) || orderPrice <= 0) return "";
  const hit = packages.find((p) => Math.abs(p.packagePrice - orderPrice) < 0.01);
  return hit?.name ?? "";
}
