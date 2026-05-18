"use client";

import { useEffect, useMemo, useState } from "react";
import type { InventoryOutByChannel } from "@/data/admin/inventoryCompute";
import type { DaySalesDetail } from "@/lib/salesSummary";

function currency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n);
  } catch {
    return String(n);
  }
}

function countFmt(n: number) {
  return new Intl.NumberFormat().format(n);
}

async function safeReadJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 160).replace(/\s+/g, " ").trim();
    throw new Error(`Bad response (${res.status}). Expected JSON but got: ${snippet || "(empty)"}`);
  }
}

export default function SalesSummaryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const [builtAt, setBuiltAt] = useState<string | null>(null);
  const [month, setMonth] = useState("");
  const [dayDetails, setDayDetails] = useState<DaySalesDetail[]>([]);
  const [inventoryByClaimDay, setInventoryByClaimDay] = useState<Record<string, InventoryOutByChannel>>({});
  const [selectedDay, setSelectedDay] = useState("");

  useEffect(() => {
    const today = new Date();
    setMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  }, []);

  useEffect(() => {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/sales-summary?month=${month}`, { cache: "no-store" });
        const json = await safeReadJson<{
          salesDays?: DaySalesDetail[];
          inventoryByClaimDay?: Record<string, InventoryOutByChannel>;
          ready?: boolean;
          builtAt?: string | null;
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
        if (cancelled) return;
        setDayDetails(json.salesDays ?? []);
        setInventoryByClaimDay(json.inventoryByClaimDay ?? {});
        setCacheReady(Boolean(json.ready));
        setBuiltAt(json.builtAt ?? null);
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
  }, [month]);

  useEffect(() => {
    if (dayDetails.length === 0) {
      setSelectedDay("");
      return;
    }
    setSelectedDay((prev) => {
      if (prev && dayDetails.some((d) => d.date === prev)) return prev;
      return dayDetails[dayDetails.length - 1]!.date;
    });
  }, [dayDetails]);

  const selected = useMemo(
    () => dayDetails.find((d) => d.date === selectedDay) ?? null,
    [dayDetails, selectedDay],
  );

  const inventoryRows = useMemo(() => {
    const inv = selectedDay ? inventoryByClaimDay[selectedDay] : null;
    if (!inv) return [];
    const names = new Set([...Object.keys(inv.pickup), ...Object.keys(inv.delivery)]);
    return [...names].sort((a, b) => a.localeCompare(b)).map((product) => ({
      product,
      pickup: inv.pickup[product] ?? 0,
      delivery: inv.delivery[product] ?? 0,
      total: (inv.pickup[product] ?? 0) + (inv.delivery[product] ?? 0),
    }));
  }, [inventoryByClaimDay, selectedDay]);

  const monthGrandTotal = useMemo(
    () => dayDetails.reduce((s, d) => s + d.grandTotal, 0),
    [dayDetails],
  );

  return (
    <div className="admin-card">
      <h1 className="admin-title">Sales Summary</h1>
      <p className="admin-muted mt-1 max-w-3xl">
        Daily breakdown of packages, subscriptions, and repurchases (by sales / effective date). Below each day:
        inventory <strong>out</strong> (pieces claimed) by product, split <strong>Pick up</strong> vs{" "}
        <strong>Delivery</strong> (by claim date).
      </p>
      {!loading && !cacheReady ? (
        <div className="admin-alert-error mt-4 text-sm">
          Summary cache is not built yet. After deploy, run{" "}
          <code className="text-emerald-200">npm run sales-summary-cache:rebuild</code> on the server.
        </div>
      ) : null}
      {builtAt ? (
        <p className="mt-2 text-xs text-zinc-500">Cache updated {new Date(builtAt).toLocaleString()}</p>
      ) : null}

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
        <div>
          <div className="text-xs font-semibold text-zinc-400">Day</div>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="admin-select mt-1 min-w-[10rem]"
            disabled={dayDetails.length === 0}
          >
            {dayDetails.length === 0 ? <option value="">No days</option> : null}
            {dayDetails.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date}
              </option>
            ))}
          </select>
        </div>
        {monthGrandTotal > 0 ? (
          <div className="text-sm text-zinc-400">
            Month total: <span className="font-semibold text-zinc-100">{currency(monthGrandTotal)}</span>
          </div>
        ) : null}
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}

      {selected && !loading ? (
        <>
          <div className="admin-card-inset mt-6">
            <div className="text-sm font-semibold text-zinc-200">Sales detail — {selected.date}</div>

            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wide text-zinc-400">Packages</div>
              <div className="admin-table-wrap mt-2">
                <table className="min-w-full text-xs">
                  <thead className="bg-black/30 text-zinc-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Package</th>
                      <th className="px-3 py-2 text-right">Orders</th>
                      <th className="px-3 py-2 text-right">Unit price</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {selected.packages.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-zinc-500">
                          No package sales this day.
                        </td>
                      </tr>
                    ) : (
                      selected.packages.map((p) => (
                        <tr key={p.packageName} className="bg-black/10 text-zinc-100">
                          <td className="px-3 py-2">{p.packageName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{countFmt(p.orderCount)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{currency(p.unitPrice)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{currency(p.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="bg-black/20 font-semibold text-zinc-100">
                      <td className="px-3 py-2">Package total</td>
                      <td colSpan={2} />
                      <td className="px-3 py-2 text-right tabular-nums">{currency(selected.packageTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-bold uppercase tracking-wide text-zinc-400">Subscriptions</div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-zinc-400">Count × ₱498</span>
                  <span className="tabular-nums text-zinc-100">
                    {countFmt(selected.subscriptionCount)} → {currency(selected.subscriptionAmount)}
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-bold uppercase tracking-wide text-zinc-400">Delivery fees</div>
                <div className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Standard</span>
                    <span className="tabular-nums">{currency(selected.deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Others (claim day)</span>
                    <span className="tabular-nums">{currency(selected.deliveryFeeOthers)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <div className="text-xs font-bold uppercase tracking-wide text-zinc-400">Repurchases</div>
              <div className="admin-table-wrap mt-2">
                <table className="min-w-full text-xs">
                  <thead className="bg-black/30 text-zinc-300">
                    <tr>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Unit</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {selected.repurchases.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-zinc-500">
                          No repurchase lines this day.
                        </td>
                      </tr>
                    ) : (
                      selected.repurchases.map((r) => (
                        <tr key={r.productName} className="bg-black/10 text-zinc-100">
                          <td className="px-3 py-2">{r.productName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{countFmt(r.qty)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{currency(r.unitPrice)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{currency(r.amount)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="bg-black/20 font-semibold text-zinc-100">
                      <td className="px-3 py-2">Repurchase total</td>
                      <td colSpan={2} />
                      <td className="px-3 py-2 text-right tabular-nums">{currency(selected.repurchaseTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-emerald-100">Day total (sales date)</span>
                <span className="text-lg font-bold tabular-nums text-white">{currency(selected.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="admin-card-inset mt-6">
            <div className="text-sm font-semibold text-zinc-200">
              Inventory out summary — claimed on {selected.date}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Pieces from package, subscription, and repurchase lines on orders claimed this day (Pick up vs Delivery).
            </p>
            <div className="admin-table-wrap mt-3">
              <table className="min-w-full text-xs">
                <thead className="bg-black/30 text-zinc-300">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Pick up</th>
                    <th className="px-3 py-2 text-right">Delivery</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {inventoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-zinc-500">
                        No claimed inventory out for this claim day.
                      </td>
                    </tr>
                  ) : (
                    inventoryRows.map((r) => (
                      <tr key={r.product} className="bg-black/10 text-zinc-100">
                        <td className="px-3 py-2">{r.product}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-300/90">
                          {r.pickup > 0 ? countFmt(r.pickup) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-violet-300/90">
                          {r.delivery > 0 ? countFmt(r.delivery) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{countFmt(r.total)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {inventoryRows.length > 0 ? (
                  <tfoot className="bg-black/20 font-semibold text-zinc-100">
                    <tr>
                      <td className="px-3 py-2">Total pieces</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {countFmt(inventoryRows.reduce((s, r) => s + r.pickup, 0))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {countFmt(inventoryRows.reduce((s, r) => s + r.delivery, 0))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {countFmt(inventoryRows.reduce((s, r) => s + r.total, 0))}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        </>
      ) : !loading && dayDetails.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-500">No successful sales in this month.</p>
      ) : null}
    </div>
  );
}
