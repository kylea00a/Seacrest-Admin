import { NextResponse } from "next/server";
import { roundWeight2 } from "@/data/admin/productSettings";
import { loadAdminSettings, normalizeProductAbbreviations, saveAdminSettings } from "@/data/admin/storage";
import type { AdminProductItem, AdminSettings } from "@/data/admin/types";
import { requireApiPermission, requireApiSession } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SettingsBody = {
  expenseCategories?: unknown;
  pettyCashCategories?: unknown;
  packages?: unknown;
  products?: unknown;
  productAbbreviations?: unknown;
  allowSuperadminEditEncodedInventory?: unknown;
};

function normalizeList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    out.push(t);
  }
  // unique, preserve order
  return Array.from(new Set(out));
}

function numField(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizeProducts(v: unknown): AdminProductItem[] {
  if (!Array.isArray(v)) return [];
  const out: AdminProductItem[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      membersPrice: numField(rec.membersPrice),
      srp: numField(rec.srp),
      weight: roundWeight2(numField(rec.weight)),
    });
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.name) ? false : (seen.add(p.name), true)));
}

function normalizePackages(
  v: unknown,
): Array<{ name: string; code: string; packagePrice: number; affiliatePrice: number; weight: number }> {
  if (!Array.isArray(v)) return [];
  const out: Array<{ name: string; code: string; packagePrice: number; affiliatePrice: number; weight: number }> = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const code = typeof rec.code === "string" ? rec.code.trim() : "";
    const packagePriceRaw = rec.packagePrice ?? rec.price;
    const affiliatePriceRaw = rec.affiliatePrice ?? rec.price ?? rec.packagePrice;
    const packagePrice =
      typeof packagePriceRaw === "number"
        ? packagePriceRaw
        : typeof packagePriceRaw === "string"
          ? Number(packagePriceRaw)
          : NaN;
    const affiliatePrice =
      typeof affiliatePriceRaw === "number"
        ? affiliatePriceRaw
        : typeof affiliatePriceRaw === "string"
          ? Number(affiliatePriceRaw)
          : NaN;
    if (!name || !code || !Number.isFinite(packagePrice) || !Number.isFinite(affiliatePrice)) continue;
    out.push({
      name,
      code,
      packagePrice,
      affiliatePrice,
      weight: roundWeight2(numField(rec.weight)),
    });
  }
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.code) ? false : (seen.add(p.code), true)));
}

export async function GET(req: Request) {
  const auth = await requireApiSession(req);
  if (auth instanceof NextResponse) return auth;
  const settings = loadAdminSettings();
  return NextResponse.json({ settings });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "settings");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as SettingsBody;

  const current = loadAdminSettings();
  const expenseCategories =
    body.expenseCategories === undefined ? current.expenseCategories : normalizeList(body.expenseCategories);
  const pettyCashCategories =
    body.pettyCashCategories === undefined ? current.pettyCashCategories : normalizeList(body.pettyCashCategories);
  const packages = body.packages === undefined ? current.packages : normalizePackages(body.packages);
  const products = body.products === undefined ? current.products : normalizeProducts(body.products);
  const allowSuperadminEditEncodedInventory =
    body.allowSuperadminEditEncodedInventory === undefined
      ? current.allowSuperadminEditEncodedInventory ?? false
      : Boolean(body.allowSuperadminEditEncodedInventory);

  const productAbbreviations =
    body.productAbbreviations === undefined
      ? current.productAbbreviations
      : normalizeProductAbbreviations(body.productAbbreviations);

  const next: AdminSettings = {
    expenseCategories: expenseCategories.length ? expenseCategories : current.expenseCategories,
    pettyCashCategories: pettyCashCategories.length ? pettyCashCategories : current.pettyCashCategories,
    packages: packages.length ? packages : current.packages,
    products: products.length ? products : current.products,
    productAbbreviations: Object.keys(productAbbreviations ?? {}).length ? productAbbreviations : undefined,
    allowSuperadminEditEncodedInventory,
    updatedAt: new Date().toISOString(),
  };

  saveAdminSettings(next);
  return NextResponse.json({ settings: next });
}

