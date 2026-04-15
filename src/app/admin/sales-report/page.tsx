"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminSettings } from "@/data/admin/types";
import { isOrderExcludedFromSuccessMetrics, type ProductBreakdown } from "@/data/admin/ordersParse";

function countFmt(n: number) {
  return new Intl.NumberFormat().format(n);
}

function currency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n);
  } catch {
    return `${n}`;
  }
}

function monthToRange(yyyyMm: string): { start: string; end: string } | null {
  const m = yyyyMm.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]); // 1-12
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  const start = `${m[1]}-${m[2]}-01`;
  const lastDay = new Date(y, mo, 0).getDate();
  const end = `${m[1]}-${m[2]}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export default function SalesReportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [month, setMonth] = useState<string>("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, "0");
        const mm = `${y}-${m}`;
        const sRes = await fetch("/api/admin/settings", { cache: "no-store" });
        const sJson = (await sRes.json()) as { settings?: AdminSettings; error?: string };
        if (!sRes.ok) throw new Error(sJson.error ?? `Failed with status ${sRes.status}`);
        if (!cancelled) setSettings(sJson.settings ?? null);
        if (!cancelled) setMonth(mm);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadCompiledForMonth() {
      const range = monthToRange(month);
      if (!range) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/orders/compiled?start=${range.start}&end=${range.end}`, { cache: "no-store" });
        const json = (await res.json()) as { rows?: Array<Record<string, unknown>>; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        if (cancelled) return;
        setRows(json.rows ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadCompiledForMonth();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const productPriceByName = useMemo(() => {
    const map = new Map<string, { srp: number; membersPrice: number }>();
    for (const p of settings?.products ?? []) map.set(p.name, { srp: p.srp ?? 0, membersPrice: p.membersPrice ?? 0 });
    return map;
  }, [settings]);

  type DailyRow = {
    date: string;
    packageAmount: number;
    subscriptionAmount: number;
    deliveryFee: number;
    repurchaseTotal: number;
  };

  const daily = useMemo(() => {
    const out = new Map<string, DailyRow>();
    const products = (settings?.products ?? []).map((p) => p.name);

    const add = (d: string): DailyRow => {
      const existing = out.get(d);
      if (existing) return existing;
      const base: DailyRow = {
        date: d,
        packageAmount: 0,
        subscriptionAmount: 0,
        deliveryFee: 0,
        repurchaseTotal: 0,
      };
      out.set(d, base);
      return base;
    };

    const num = (v: unknown): number => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = Number(v.replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    };

    for (const row of rows) {
      const status = String(row["status"] ?? "");
      if (isOrderExcludedFromSuccessMetrics(status)) continue;
      const day = String(row["date"] ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      const dr = add(day);

      const memberType = String(row["memberType"] ?? "").toLowerCase();
      const isMember = memberType.includes("member") && !memberType.includes("non");

      const packagePrice = num(row["packagePrice"]);
      const deliveryFee = num(row["deliveryFee"]);
      const merchantFee = num(row["merchantFee"]);
      const totalAmount = num(row["totalAmount"]);

      dr.deliveryFee += deliveryFee;

      // Repurchase amount using SRP, except chips have bulk pricing tiers (based on total chips qty per order).
      const rep = row["repurchaseProducts"] as ProductBreakdown | undefined;
      let repurchaseAmt = 0;
      if (rep && typeof rep === "object") {
        // Chips bulk pricing: tier is based on total chips qty across flavors on THIS order.
        const chipsKeys = Object.keys(rep).filter((k) => k.toLowerCase().includes("chips"));
        const chipsQty = chipsKeys.reduce((acc, k) => acc + (Number((rep as Record<string, unknown>)[k]) || 0), 0);
        const chipsTierPrice =
          chipsQty <= 0
            ? null
            : chipsQty >= 50
              ? 99
              : chipsQty >= 30
                ? 105
                : chipsQty >= 15
                  ? 115
                  : 129;

        for (const [name, qtyRaw] of Object.entries(rep)) {
          const qty = Number(qtyRaw) || 0;
          if (qty <= 0) continue;
          const isChips = name.toLowerCase().includes("chips");
          const price =
            isChips && chipsTierPrice != null
              ? chipsTierPrice
              : (productPriceByName.get(name)?.srp ?? 0);
          const amt = qty * price;
          repurchaseAmt += amt;
        }
      }
      dr.repurchaseTotal += repurchaseAmt;

      // Package revenue: use packagePrice when present.
      if (packagePrice > 0) dr.packageAmount += packagePrice;

      // Subscription amount: per spec, use (successful subscription count on that day) × 498.
      // This is based on the order's effective/import date (same Date shown in All Orders), not claim date.
      const subCount = num(row["subscriptionsCount"]);
      if (subCount > 0) dr.subscriptionAmount += subCount * 498;
    }

    // Oldest → latest (top-down)
    return Array.from(out.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, settings, productPriceByName]);

  const monthTotals = useMemo(() => {
    let pkg = 0;
    let sub = 0;
    let rep = 0;
    let df = 0;
    for (const d of daily) {
      pkg += d.packageAmount;
      sub += d.subscriptionAmount;
      rep += d.repurchaseTotal;
      df += d.deliveryFee;
    }
    return { pkg, sub, rep, df, all: pkg + sub + rep + df };
  }, [daily]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="admin-card min-w-0">
        <h1 className="admin-title">Sales Report</h1>
        <div className="admin-muted">Based on confirmed orders, including status adjustments.</div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Month</div>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
            />
          </div>
        </div>

        {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">All (PHP)</div>
            <div className="mt-1 text-lg font-bold text-white">{currency(monthTotals.all)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Package (PHP)</div>
            <div className="mt-1 text-lg font-bold text-white">{currency(monthTotals.pkg)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Subscription (PHP)</div>
            <div className="mt-1 text-lg font-bold text-white">{currency(monthTotals.sub)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Repurchase (PHP)</div>
            <div className="mt-1 text-lg font-bold text-white">{currency(monthTotals.rep)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Delivery fee (PHP)</div>
            <div className="mt-1 text-lg font-bold text-white">{currency(monthTotals.df)}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-semibold">Daily totals (by effective date)</div>
          <div className="mt-1 text-xs text-zinc-400">Default: current month</div>

          <div className="admin-table-wrap mt-3 max-w-full overflow-x-auto">
            <table className="min-w-[860px] text-xs">
              <thead className="bg-black/30 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Package</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Subscription</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Repurchase total</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Delivery fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {daily.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                      No successful orders found for this month.
                    </td>
                  </tr>
                ) : (
                  daily.map((d) => (
                    <tr key={d.date} className="bg-black/10 text-zinc-100">
                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-zinc-200">{d.date}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.packageAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.subscriptionAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.repurchaseTotal)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.deliveryFee)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">How it’s computed</div>
        <div className="mt-2 space-y-2 text-sm text-zinc-200">
          <div>
            Rows use successful orders only (not pending, processing, or cancelled) from the compiled orders endpoint.
          </div>
          <div className="text-xs text-zinc-400">
            Package uses `packagePrice`. Repurchase uses SRP × qty by product. Subscription prefers product breakdown
            pricing (member vs SRP) and falls back to the order&apos;s residual `totalAmount` when needed.
          </div>
          <div className="text-xs text-zinc-400">
            Repurchase product columns are amounts (PHP), not piece totals.
          </div>
        </div>
      </div>
    </div>
  );
}

