"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminSettings, ShippingCourier } from "@/data/admin/types";

function money(n: number) {
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n);
  } catch {
    return String(n);
  }
}

function weightKg(n: number) {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} kg`;
}

function computeShippingFeeKg(totalWeight: number, courier: ShippingCourier | null): number | null {
  if (!courier) return null;
  const w = Number(totalWeight);
  if (!Number.isFinite(w) || w <= 0) return 0;
  const fees = courier.fees ?? [];
  const match = fees.find((b) => w >= b.minWeight && w <= b.maxWeight);
  if (match) return match.price;
  // Fallback: if overweight (past max), use the last bracket’s price; if underweight, use first.
  if (!fees.length) return null;
  const sorted = fees.slice().sort((a, b) => a.minWeight - b.minWeight || a.maxWeight - b.maxWeight);
  if (w < sorted[0]!.minWeight) return sorted[0]!.price;
  return sorted[sorted.length - 1]!.price;
}

export default function ProductCalculatorPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [couriers, setCouriers] = useState<ShippingCourier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [qtyByProduct, setQtyByProduct] = useState<Record<string, string>>({});
  const [courierId, setCourierId] = useState<string>("");
  const [result, setResult] = useState<{
    totalMembers: number;
    totalSrp: number;
    totalWeight: number;
    shippingFee: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [sRes, cRes] = await Promise.all([
          fetch("/api/admin/settings", { cache: "no-store" }),
          fetch("/api/admin/shipping-couriers", { cache: "no-store" }),
        ]);
        const sJson = (await sRes.json()) as { settings?: AdminSettings; error?: string };
        const cJson = (await cRes.json()) as { couriers?: ShippingCourier[]; error?: string };
        if (!sRes.ok) throw new Error(sJson.error ?? `Failed (${sRes.status})`);
        if (!cRes.ok) throw new Error(cJson.error ?? `Failed (${cRes.status})`);
        if (cancelled) return;
        setSettings(sJson.settings ?? null);
        setCouriers(Array.isArray(cJson.couriers) ? cJson.couriers : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settings?.products?.length) return;
    setQtyByProduct((prev) => {
      const next = { ...prev };
      for (const p of settings.products) {
        if (next[p.name] == null) next[p.name] = "";
      }
      for (const k of Object.keys(next)) {
        if (!settings.products.some((p) => p.name === k)) delete next[k];
      }
      return next;
    });
  }, [settings]);

  useEffect(() => {
    if (courierId) return;
    const jnt = couriers.find((c) => (c.name ?? "").toLowerCase().includes("j&t"));
    setCourierId(jnt?.id ?? couriers[0]?.id ?? "");
  }, [couriers, courierId]);

  const selectedCourier = useMemo(() => couriers.find((c) => c.id === courierId) ?? null, [couriers, courierId]);

  const calculate = () => {
    if (!settings) return;
    let totalMembers = 0;
    let totalSrp = 0;
    let totalWeight = 0;
    for (const p of settings.products ?? []) {
      const q = Number((qtyByProduct[p.name] ?? "").trim());
      const qty = Number.isFinite(q) && q > 0 ? q : 0;
      totalMembers += (p.membersPrice ?? 0) * qty;
      totalSrp += (p.srp ?? 0) * qty;
      totalWeight += (p.weight ?? 0) * qty;
    }
    const shippingFee = computeShippingFeeKg(totalWeight, selectedCourier);
    setResult({ totalMembers, totalSrp, totalWeight, shippingFee });
  };

  return (
    <div className="space-y-6">
      <div className="admin-card">
        <h1 className="admin-title">Product Calculator</h1>
        <div className="admin-muted mt-1">Enter quantities and compute totals + courier shipping fee.</div>

        {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
        {error ? <div className="admin-alert-error mt-4">{error}</div> : null}

        <div className="mt-5 flex flex-wrap items-end gap-4">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Courier</div>
            <select
              value={courierId}
              onChange={(e) => setCourierId(e.target.value)}
              className="admin-select mt-1 min-w-[12rem]"
              disabled={!couriers.length}
            >
              {couriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="admin-btn-primary" onClick={calculate} disabled={!settings?.products?.length}>
            Calculate
          </button>
        </div>

        <div className="admin-table-wrap mt-5">
          <table className="min-w-full text-xs">
            <thead className="bg-black/30 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Members price</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">SRP</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Weight (kg)</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Pieces</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {(settings?.products ?? []).map((p) => (
                <tr key={p.name} className="bg-black/10 text-zinc-100">
                  <td className="px-3 py-2 font-semibold">{p.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-200">{p.membersPrice ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-200">{p.srp ?? 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{(p.weight ?? 0).toFixed(2)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      value={qtyByProduct[p.name] ?? ""}
                      onChange={(e) => setQtyByProduct((prev) => ({ ...prev, [p.name]: e.target.value }))}
                      className="admin-input w-24 text-right tabular-nums"
                      inputMode="numeric"
                      placeholder="0"
                    />
                  </td>
                </tr>
              ))}
              {!settings?.products?.length ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                    No products found. Add products under Packages & Products first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold text-white">Result</div>
        <div className="admin-muted mt-1 text-xs">
          Courier: <span className="font-semibold text-zinc-200">{selectedCourier?.name ?? "—"}</span>
        </div>
        {result ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-semibold text-zinc-400">Total members price</div>
              <div className="mt-1 text-sm font-bold text-white">{money(result.totalMembers)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-semibold text-zinc-400">Total SRP</div>
              <div className="mt-1 text-sm font-bold text-white">{money(result.totalSrp)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-semibold text-zinc-400">Total weight</div>
              <div className="mt-1 text-sm font-bold text-white">{weightKg(result.totalWeight)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs font-semibold text-zinc-400">Shipping fee</div>
              <div className="mt-1 text-sm font-bold text-white">
                {result.shippingFee == null ? "—" : money(result.shippingFee)}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 text-sm text-zinc-300">Click Calculate to compute totals.</div>
        )}
      </div>
    </div>
  );
}

