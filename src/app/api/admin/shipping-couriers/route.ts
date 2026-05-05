import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadShippingCouriers, saveShippingCouriers } from "@/data/admin/storage";
import type { ShippingCourier, ShippingFeeBracket } from "@/data/admin/types";
import { requireApiAnyPermission, requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return NaN;
}

function normalizeFees(v: unknown): ShippingFeeBracket[] {
  if (!Array.isArray(v)) return [];
  const out: ShippingFeeBracket[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const minWeight = num(o.minWeight);
    const maxWeightRaw = o.maxWeight;
    const maxWeight = maxWeightRaw == null || (typeof maxWeightRaw === "string" && maxWeightRaw.trim() === "") ? NaN : num(maxWeightRaw);
    const price = num(o.price);
    if (!Number.isFinite(minWeight) || !Number.isFinite(price)) continue;
    if (minWeight < 0 || price < 0) continue;
    if (Number.isFinite(maxWeight)) {
      if (maxWeight <= 0) continue;
      if (maxWeight < minWeight) continue;
      out.push({ minWeight, maxWeight, price });
    } else {
      // Open-ended bracket: per-kilo additional beyond previous fixed bracket.
      out.push({ minWeight, price });
    }
  }
  out.sort((a, b) => a.minWeight - b.minWeight || Number(a.maxWeight ?? Number.POSITIVE_INFINITY) - Number(b.maxWeight ?? Number.POSITIVE_INFINITY));
  return out;
}

export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, ["settings", "packagesProducts", "productCalculator"]);
  if (auth instanceof NextResponse) return auth;
  const couriers = loadShippingCouriers();
  return NextResponse.json({ couriers });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "packagesProducts");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as Partial<ShippingCourier>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Missing `name`." }, { status: 400 });
  const now = new Date().toISOString();
  const rec: ShippingCourier = {
    id: randomUUID(),
    name,
    country: typeof body.country === "string" ? body.country.trim() : undefined,
    description: typeof body.description === "string" ? body.description.trim() : undefined,
    fees: normalizeFees((body as any).fees),
    createdAt: now,
    updatedAt: now,
  };
  const all = loadShippingCouriers();
  all.push(rec);
  saveShippingCouriers(all);
  return NextResponse.json({ courier: rec });
}

export async function PUT(req: Request) {
  const auth = await requireApiPermission(req, "packagesProducts");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as Partial<ShippingCourier> & { id?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });

  const all = loadShippingCouriers();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return NextResponse.json({ error: "Courier not found." }, { status: 404 });

  const prev = all[idx]!;
  const name = typeof body.name === "string" ? body.name.trim() : prev.name;
  if (!name) return NextResponse.json({ error: "Missing `name`." }, { status: 400 });

  const next: ShippingCourier = {
    ...prev,
    name,
    country: typeof body.country === "string" ? body.country.trim() : prev.country,
    description: typeof body.description === "string" ? body.description.trim() : prev.description,
    fees: body.fees !== undefined ? normalizeFees(body.fees) : prev.fees,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = next;
  saveShippingCouriers(all);
  return NextResponse.json({ ok: true, courier: next });
}

export async function DELETE(req: Request) {
  const auth = await requireApiPermission(req, "packagesProducts");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });
  const all = loadShippingCouriers();
  const next = all.filter((c) => c.id !== id);
  if (next.length === all.length) return NextResponse.json({ error: "Courier not found." }, { status: 404 });
  saveShippingCouriers(next);
  return NextResponse.json({ ok: true });
}

