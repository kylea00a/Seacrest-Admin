import { resolvePackageNameFromPrice } from "@/data/admin/packageResolve";
import type { AdminSettings } from "@/data/admin/types";
import type { ProductBreakdown } from "@/data/admin/ordersParse";
import { isOrderExcludedFromSuccessMetrics } from "@/data/admin/ordersParse";
import { isChipsProductName, monthToRange } from "@/lib/salesReportChipsRepurchase";

export { monthToRange };

export function numField(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export type PackageLine = {
  packageName: string;
  orderCount: number;
  unitPrice: number;
  amount: number;
};

export type RepurchaseLine = {
  productName: string;
  qty: number;
  unitPrice: number;
  amount: number;
};

export type DaySalesDetail = {
  date: string;
  packages: PackageLine[];
  packageTotal: number;
  subscriptionCount: number;
  subscriptionAmount: number;
  repurchases: RepurchaseLine[];
  repurchaseTotal: number;
  deliveryFee: number;
  deliveryFeeOthers: number;
  grandTotal: number;
};

function repurchaseFromOrder(
  rep: ProductBreakdown | undefined,
  productPriceByName: Map<string, { srp: number; membersPrice: number }>,
): RepurchaseLine[] {
  if (!rep || typeof rep !== "object") return [];

  const chipsKeys = Object.keys(rep).filter(isChipsProductName);
  const chipsQty = chipsKeys.reduce((acc, k) => acc + (Number((rep as Record<string, unknown>)[k]) || 0), 0);
  const chipsTierPrice =
    chipsQty <= 0 ? null : chipsQty >= 50 ? 99 : chipsQty >= 30 ? 105 : chipsQty >= 15 ? 115 : 129;

  const lines: RepurchaseLine[] = [];
  for (const [name, qtyRaw] of Object.entries(rep)) {
    const qty = Number(qtyRaw) || 0;
    if (qty <= 0) continue;
    const isChips = isChipsProductName(name);
    const unitPrice =
      isChips && chipsTierPrice != null ? chipsTierPrice : (productPriceByName.get(name)?.membersPrice ?? 0);
    lines.push({ productName: name, qty, unitPrice, amount: qty * unitPrice });
  }
  return lines;
}

/** Per-day sales breakdown from compiled rows (effective / sales date). */
export function buildDaySalesDetails(
  rows: Array<Record<string, unknown>>,
  range: { start: string; end: string },
  settings: AdminSettings | null,
  deliveryFeeOthersByDay: Record<string, number>,
): DaySalesDetail[] {
  const packages = settings?.packages ?? [];
  const productPriceByName = new Map(
    (settings?.products ?? []).map((p) => [p.name, { srp: p.srp ?? 0, membersPrice: p.membersPrice ?? 0 }]),
  );
  const affiliateByPrice = new Map<number, number>();
  for (const p of packages) {
    if (p.packagePrice > 0) {
      affiliateByPrice.set(
        p.packagePrice,
        Number.isFinite(p.affiliatePrice) && p.affiliatePrice > 0 ? p.affiliatePrice : p.packagePrice,
      );
    }
  }

  const byDay = new Map<string, DaySalesDetail>();
  const pkgByDay = new Map<string, Map<string, { count: number; amount: number; unitPrice: number }>>();
  const repByDay = new Map<string, Map<string, RepurchaseLine>>();

  const ensure = (d: string): DaySalesDetail => {
    let x = byDay.get(d);
    if (!x) {
      x = {
        date: d,
        packages: [],
        packageTotal: 0,
        subscriptionCount: 0,
        subscriptionAmount: 0,
        repurchases: [],
        repurchaseTotal: 0,
        deliveryFee: 0,
        deliveryFeeOthers: 0,
        grandTotal: 0,
      };
      byDay.set(d, x);
    }
    return x;
  };

  for (const row of rows) {
    if (isOrderExcludedFromSuccessMetrics(String(row["status"] ?? ""))) continue;
    const day = String(row["date"] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (day < range.start || day > range.end) continue;

    const detail = ensure(day);
    detail.deliveryFee += numField(row["deliveryFee"]);

    const packagePrice = numField(row["packagePrice"]);
    if (packagePrice > 0) {
      const packageNameRaw = typeof row["packageName"] === "string" ? (row["packageName"] as string).trim() : "";
      const resolved = resolvePackageNameFromPrice(packagePrice, packages) || packageNameRaw || `P${packagePrice}`;
      const unitPrice = affiliateByPrice.get(packagePrice) ?? packagePrice;
      const dayMap = pkgByDay.get(day) ?? new Map();
      const cur = dayMap.get(resolved) ?? { count: 0, amount: 0, unitPrice };
      cur.count += 1;
      cur.amount += unitPrice;
      cur.unitPrice = unitPrice;
      dayMap.set(resolved, cur);
      pkgByDay.set(day, dayMap);
    }

    const subCount = numField(row["subscriptionsCount"]);
    if (subCount > 0) {
      detail.subscriptionCount += subCount;
      detail.subscriptionAmount += subCount * 498;
    }

    const repLines = repurchaseFromOrder(row["repurchaseProducts"] as ProductBreakdown | undefined, productPriceByName);
    const dayRep = repByDay.get(day) ?? new Map();
    for (const line of repLines) {
      const cur = dayRep.get(line.productName);
      if (cur) {
        cur.qty += line.qty;
        cur.amount += line.amount;
      } else {
        dayRep.set(line.productName, { ...line });
      }
    }
    repByDay.set(day, dayRep);
  }

  for (const [day, amt] of Object.entries(deliveryFeeOthersByDay)) {
    if (day >= range.start && day <= range.end && amt > 0) ensure(day).deliveryFeeOthers += amt;
  }

  for (const [day, map] of pkgByDay) {
    const detail = ensure(day);
    detail.packages = [...map.entries()]
      .map(([packageName, v]) => ({
        packageName,
        orderCount: v.count,
        unitPrice: v.unitPrice,
        amount: v.amount,
      }))
      .sort((a, b) => b.amount - a.amount);
    detail.packageTotal = detail.packages.reduce((s, p) => s + p.amount, 0);
  }

  for (const [day, map] of repByDay) {
    const detail = ensure(day);
    detail.repurchases = [...map.values()].sort((a, b) => a.productName.localeCompare(b.productName));
    detail.repurchaseTotal = detail.repurchases.reduce((s, r) => s + r.amount, 0);
  }

  for (const d of byDay.values()) {
    d.grandTotal =
      d.packageTotal + d.subscriptionAmount + d.repurchaseTotal + d.deliveryFee + d.deliveryFeeOthers;
  }

  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}
