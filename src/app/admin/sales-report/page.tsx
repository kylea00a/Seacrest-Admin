"use client";

import { useEffect, useMemo, useState } from "react";
import type { OrdersImportSummary } from "@/data/admin/types";
import { isOrderExcludedFromSuccessMetrics, sumBreakdown, type ProductBreakdown } from "@/data/admin/ordersParse";

function countFmt(n: number) {
  return new Intl.NumberFormat().format(n);
}

export default function SalesReportPage() {
  const [index, setIndex] = useState<OrdersImportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [compiledTotals, setCompiledTotals] = useState<{ package: number; subscription: number; repurchase: number }>({
    package: 0,
    subscription: 0,
    repurchase: 0,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/orders", { cache: "no-store" });
        const json = (await res.json()) as { index?: OrdersImportSummary[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        if (!cancelled) setIndex(json.index ?? []);

        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, "0");
        const d = String(today.getDate()).padStart(2, "0");
        const iso = `${y}-${m}-${d}`;
        if (!cancelled) {
          setStartDate(iso);
          setEndDate(iso);
        }
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
    async function loadCompiled() {
      if (!startDate || !endDate) return;
      setLoading(true);
      setError(null);
      try {
        const start = startDate <= endDate ? startDate : endDate;
        const end = startDate <= endDate ? endDate : startDate;
        const res = await fetch(`/api/admin/orders/compiled?start=${start}&end=${end}`, { cache: "no-store" });
        const json = (await res.json()) as { rows?: Array<Record<string, unknown>>; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        let p = 0;
        let s = 0;
        let r = 0;
        for (const row of json.rows ?? []) {
          const status = String(row["status"] ?? "");
          if (isOrderExcludedFromSuccessMetrics(status)) continue;
          const pkg = row["packageProducts"] as ProductBreakdown | undefined;
          const sub = row["subscriptionProducts"] as ProductBreakdown | undefined;
          const rep = row["repurchaseProducts"] as ProductBreakdown | undefined;
          const subCount = Number(row["subscriptionsCount"]) || 0;
          const pkgPriceRaw = row["packagePrice"];
          const pkgPrice =
            typeof pkgPriceRaw === "number" && Number.isFinite(pkgPriceRaw)
              ? pkgPriceRaw
              : typeof pkgPriceRaw === "string"
                ? Number(pkgPriceRaw.replace(/,/g, "")) || 0
                : 0;
          const pkgPieces = sumBreakdown(pkg ?? ({} as ProductBreakdown));
          const subPieces = sumBreakdown(sub ?? ({} as ProductBreakdown));
          const repPieces = sumBreakdown(rep ?? ({} as ProductBreakdown));
          if (pkgPieces > 0 || pkgPrice > 0) p++;
          if (subCount > 0 || subPieces > 0) s++;
          if (repPieces > 0) r++;
        }
        if (!cancelled) setCompiledTotals({ package: p, subscription: s, repurchase: r });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadCompiled();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  const totals = useMemo(() => {
    const p = compiledTotals.package;
    const s = compiledTotals.subscription;
    const r = compiledTotals.repurchase;
    return { p, s, r, all: p + s + r };
  }, [compiledTotals]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="admin-card">
        <h1 className="admin-title">Sales Report</h1>
        <div className="admin-muted">Based on confirmed orders, including status adjustments.</div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Start date</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400">End date</div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">All (P+S+R counts)</div>
            <div className="mt-1 text-lg font-bold text-white">{countFmt(totals.all)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Package orders</div>
            <div className="mt-1 text-lg font-bold text-white">{countFmt(totals.p)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Subscription orders</div>
            <div className="mt-1 text-lg font-bold text-white">{countFmt(totals.s)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Repurchase orders</div>
            <div className="mt-1 text-lg font-bold text-white">{countFmt(totals.r)}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-semibold">Daily totals</div>
          <div className="mt-1 text-xs text-zinc-400">Latest first</div>

          <div className="mt-4 space-y-2">
            {index.length === 0 ? (
              <div className="text-sm text-zinc-300">No imports yet. Upload a file in Import Orders.</div>
            ) : (
              index.map((i) => (
                <div key={i.date} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white">{i.date}</div>
                      <div className="mt-1 truncate text-xs text-zinc-400">{i.filename}</div>
                    </div>
                    <div className="text-xs text-zinc-400">{i.totalRows} rows</div>
                  </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
                    <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-zinc-200">
                      Package: <span className="font-semibold text-white">{countFmt(i.totals.package)}</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-zinc-200">
                      Subscription: <span className="font-semibold text-white">{countFmt(i.totals.subscription)}</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-zinc-200">
                      Repurchase: <span className="font-semibold text-white">{countFmt(i.totals.repurchase)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">How it’s computed</div>
        <div className="mt-2 space-y-2 text-sm text-zinc-200">
          <div>Package / Subscription / Repurchase totals count successful orders (not pending, processing, or cancelled) that have that line type.</div>
          <div className="text-xs text-zinc-400">
            Product columns in the detailed tables are still quantities (pieces). The summary numbers are order counts, not piece totals.
          </div>
        </div>
      </div>
    </div>
  );
}

