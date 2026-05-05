"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminSettings } from "@/data/admin/types";
import { isOrderExcludedFromSuccessMetrics, type ProductBreakdown } from "@/data/admin/ordersParse";
import type { BankAccount, CashTransaction } from "@/data/admin/types";
import { getClaimCalendarYmd } from "@/data/admin/orderClaim";

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
  /** Rows bucketed by effective date (normal month view). */
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  /** Rows that fall in the month by CLAIM schedule (can include older effective dates). */
  const [rowsByClaim, setRowsByClaim] = useState<Array<Record<string, unknown>>>([]);
  const [claims, setClaims] = useState<Record<string, any>>({});
  const [deliveryFeeCharges, setDeliveryFeeCharges] = useState<Array<Record<string, unknown>>>([]);
  const [cashAccounts, setCashAccounts] = useState<BankAccount[]>([]);
  const [cashTx, setCashTx] = useState<CashTransaction[]>([]);
  const [depositAccountId, setDepositAccountId] = useState<string>("");
  const [depositingDay, setDepositingDay] = useState<string>("");
  const [drilldownDay, setDrilldownDay] = useState<string>("");

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
        const [res, claimRes, dfRes] = await Promise.all([
          fetch(`/api/admin/orders/compiled?start=${range.start}&end=${range.end}`, { cache: "no-store" }),
          fetch(
            `/api/admin/orders/compiled?start=${range.start}&end=${range.end}&scheduleByClaim=1`,
            { cache: "no-store" },
          ),
          fetch(`/api/admin/delivery-fee-charges?start=${range.start}&end=${range.end}`, { cache: "no-store" }),
        ]);
        const json = (await res.json()) as { rows?: Array<Record<string, unknown>>; claims?: Record<string, unknown>; error?: string };
        const claimJson = (await claimRes.json()) as { rows?: Array<Record<string, unknown>>; claims?: Record<string, unknown>; error?: string };
        const dfJson = (await dfRes.json()) as { charges?: Array<Record<string, unknown>>; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        if (!claimRes.ok) throw new Error(claimJson.error ?? `Failed with status ${claimRes.status}`);
        if (!dfRes.ok) throw new Error(dfJson.error ?? `Failed with status ${dfRes.status}`);
        if (cancelled) return;
        setRows(json.rows ?? []);
        setRowsByClaim(claimJson.rows ?? []);
        setClaims((json.claims ?? {}) as Record<string, any>);
        // Keep legacy/optional ledger (still shown in drilldown), but "Delivery fee (Others)" is now computed from orders' deliveryFeeOthers by claim date.
        setDeliveryFeeCharges(dfJson.charges ?? []);
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

  useEffect(() => {
    let cancelled = false;
    async function loadCash() {
      try {
        const res = await fetch("/api/admin/cash", { cache: "no-store" });
        const json = (await res.json()) as { accounts?: BankAccount[]; transactions?: CashTransaction[] };
        if (!res.ok) return;
        if (cancelled) return;
        setCashAccounts(json.accounts ?? []);
        setCashTx(json.transactions ?? []);
        setDepositAccountId((prev) => (prev && (json.accounts ?? []).some((a) => a.id === prev) ? prev : (json.accounts ?? [])[0]?.id ?? ""));
      } catch {
        // ignore
      }
    }
    void loadCash();
    return () => {
      cancelled = true;
    };
  }, []);

  const productPriceByName = useMemo(() => {
    const map = new Map<string, { srp: number; membersPrice: number }>();
    for (const p of settings?.products ?? []) map.set(p.name, { srp: p.srp ?? 0, membersPrice: p.membersPrice ?? 0 });
    return map;
  }, [settings]);

  const affiliatePriceByPackagePrice = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of settings?.packages ?? []) {
      if (!Number.isFinite(p.packagePrice) || p.packagePrice <= 0) continue;
      const aff = Number.isFinite(p.affiliatePrice) && p.affiliatePrice > 0 ? p.affiliatePrice : p.packagePrice;
      map.set(p.packagePrice, aff);
    }
    return map;
  }, [settings]);

  type DailyRow = {
    date: string;
    packageAmount: number;
    subscriptionAmount: number;
    deliveryFee: number;
    deliveryFeeOthers: number;
    repurchaseTotal: number;
  };

  const daily = useMemo(() => {
    const out = new Map<string, DailyRow>();
    const products = (settings?.products ?? []).map((p) => p.name);
    const range = monthToRange(month);

    const add = (d: string): DailyRow => {
      const existing = out.get(d);
      if (existing) return existing;
      const base: DailyRow = {
        date: d,
        packageAmount: 0,
        subscriptionAmount: 0,
        deliveryFee: 0,
        deliveryFeeOthers: 0,
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
      if (range && (day < range.start || day > range.end)) continue;
      const dr = add(day);

      const memberType = String(row["memberType"] ?? "").toLowerCase();
      const isMember = memberType.includes("member") && !memberType.includes("non");

      const packagePrice = num(row["packagePrice"]);
      const deliveryFee = num(row["deliveryFee"]);
      const merchantFee = num(row["merchantFee"]);
      const totalAmount = num(row["totalAmount"]);

      dr.deliveryFee += deliveryFee;

      // Repurchase amount should use members price, except chips have bulk pricing tiers
      // (based on total chips qty per order).
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
              : (productPriceByName.get(name)?.membersPrice ?? 0);
          const amt = qty * price;
          repurchaseAmt += amt;
        }
      }
      dr.repurchaseTotal += repurchaseAmt;

      // Package revenue: use affiliate price (package-alone) when mapping exists; fallback to packagePrice.
      if (packagePrice > 0) {
        const affiliate = affiliatePriceByPackagePrice.get(packagePrice) ?? packagePrice;
        dr.packageAmount += affiliate;
      }

      // Subscription amount: per spec, use (successful subscription count on that day) × 498.
      // This is based on the order's effective/import date (same Date shown in All Orders), not claim date.
      const subCount = num(row["subscriptionsCount"]);
      if (subCount > 0) dr.subscriptionAmount += subCount * 498;
    }

    // Delivery fee (Others): sum `deliveryFeeOthers` by CLAIM DATE (not effective date).
    // This supports delayed deliveries/redeliveries without rewriting historical order revenue.
    for (const row of rowsByClaim) {
      const status = String(row["status"] ?? "");
      if (isOrderExcludedFromSuccessMetrics(status)) continue;
      const inv = String(row["invoiceNumber"] ?? "").trim();
      if (!inv) continue;
      const amt = num(row["deliveryFeeOthers"]);
      if (amt <= 0) continue;
      const claimDay = getClaimCalendarYmd(inv, claims as any);
      if (!claimDay || !/^\d{4}-\d{2}-\d{2}$/.test(claimDay)) continue;
      // Keep month table clean: only show claim-day fees if claim day is inside selected month.
      if (range && (claimDay < range.start || claimDay > range.end)) continue;
      add(claimDay).deliveryFeeOthers += amt;
    }

    // Oldest → latest (top-down)
    return Array.from(out.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, rowsByClaim, settings, productPriceByName, affiliatePriceByPackagePrice, deliveryFeeCharges, claims, month]);

  const monthTotals = useMemo(() => {
    let pkg = 0;
    let sub = 0;
    let rep = 0;
    let df = 0;
    let dfo = 0;
    for (const d of daily) {
      pkg += d.packageAmount;
      sub += d.subscriptionAmount;
      rep += d.repurchaseTotal;
      df += d.deliveryFee;
      dfo += d.deliveryFeeOthers;
    }
    return { pkg, sub, rep, df, dfo, all: pkg + sub + rep + df + dfo };
  }, [daily]);

  const drilldown = useMemo(() => {
    if (!drilldownDay) return null;

    const num = (v: unknown): number => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const n = Number(v.replace(/,/g, "").trim());
        return Number.isFinite(n) ? n : 0;
      }
      return 0;
    };

    const dayRows = rows.filter((r) => String(r["date"] ?? "").slice(0, 10) === drilldownDay);
    const excluded = dayRows.filter((r) => isOrderExcludedFromSuccessMetrics(String(r["status"] ?? "")));
    const included = dayRows.filter((r) => !isOrderExcludedFromSuccessMetrics(String(r["status"] ?? "")));

    const byInvoice = included
      .map((r) => {
        const inv = String(r["invoiceNumber"] ?? "").trim();
        const pkg = num(r["packagePrice"]);
        const subs = num(r["subscriptionsCount"]) * 498;
        const rep = 0; // repurchase already reflected in daily calc, but show via totalAmount fallback for readability
        const deliveryFee = num(r["deliveryFee"]);
        const merchantFee = num(r["merchantFee"]);
        const totalAmount = num(r["totalAmount"]);
        return {
          invoiceNumber: inv || "—",
          status: String(r["status"] ?? ""),
          packagePrice: pkg,
          subscriptionAmount: subs,
          deliveryFee,
          merchantFee,
          totalAmount,
        };
      })
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));

    const charges = deliveryFeeCharges
      .filter((c) => String(c["date"] ?? "").slice(0, 10) === drilldownDay)
      .map((c) => ({
        id: String(c["id"] ?? ""),
        invoiceNumber: String(c["invoiceNumber"] ?? ""),
        amount: num(c["amount"]),
        note: String(c["note"] ?? ""),
      }))
      .sort((a, b) => (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""));

    const totals = daily.find((d) => d.date === drilldownDay) ?? null;

    return { byInvoice, charges, totals, excludedCount: excluded.length, includedCount: included.length };
  }, [drilldownDay, rows, deliveryFeeCharges, daily]);

  const depositedBySalesDay = useMemo(() => {
    const set = new Set<string>();
    for (const t of cashTx) {
      if (t.kind === "sales_deposit" && t.salesDate && t.accountId === depositAccountId) set.add(t.salesDate);
    }
    return set;
  }, [cashTx, depositAccountId]);

  const depositSalesDay = async (salesDate: string, amount: number) => {
    if (!depositAccountId || !salesDate || amount <= 0) return;
    setDepositingDay(salesDate);
    setError(null);
    try {
      const action = depositedBySalesDay.has(salesDate) ? "undoDepositSalesDay" : "depositSalesDay";
      const res = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, accountId: depositAccountId, salesDate, amount }),
      });
      const json = (await res.json()) as { ok?: boolean; file?: { accounts?: BankAccount[]; transactions?: CashTransaction[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setCashAccounts(json.file?.accounts ?? cashAccounts);
      setCashTx(json.file?.transactions ?? cashTx);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDepositingDay("");
    }
  };

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
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Delivery fee (Others)</div>
            <div className="mt-1 text-lg font-bold text-white">{currency(monthTotals.dfo)}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-semibold">Daily totals (by effective date)</div>
          <div className="mt-1 text-xs text-zinc-400">Default: current month</div>

          <div className="admin-table-wrap mt-3 max-w-full overflow-x-auto">
            <table className="min-w-[980px] text-xs">
              <thead className="bg-black/30 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Package</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Subscription</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Repurchase total</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Delivery fee</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Delivery fee (Others)</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {daily.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-500" colSpan={7}>
                      No successful orders found for this month.
                    </td>
                  </tr>
                ) : (
                  daily.map((d) => (
                    <tr key={d.date} className="bg-black/10 text-zinc-100">
                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-zinc-200">
                        <button
                          type="button"
                          onClick={() => setDrilldownDay(d.date)}
                          className="hover:underline"
                          title="Click to view day summary"
                        >
                          {d.date}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.packageAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.subscriptionAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.repurchaseTotal)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.deliveryFee)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.deliveryFeeOthers)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {currency(d.packageAmount + d.subscriptionAmount + d.repurchaseTotal + d.deliveryFee + d.deliveryFeeOthers)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {drilldownDay && drilldown ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-5xl rounded-2xl border border-white/10 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Day Summary</div>
                  <div className="admin-muted mt-1 text-xs">
                    {drilldownDay} • Included: {countFmt(drilldown.includedCount)} • Excluded: {countFmt(drilldown.excludedCount)}
                  </div>
                </div>
                <button type="button" className="admin-btn-secondary px-3 py-1.5 text-xs" onClick={() => setDrilldownDay("")}>
                  Close
                </button>
              </div>

              {drilldown.totals ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold text-zinc-400">Package</div>
                    <div className="mt-1 text-sm font-bold text-white">{currency(drilldown.totals.packageAmount)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold text-zinc-400">Subscription</div>
                    <div className="mt-1 text-sm font-bold text-white">{currency(drilldown.totals.subscriptionAmount)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold text-zinc-400">Repurchase</div>
                    <div className="mt-1 text-sm font-bold text-white">{currency(drilldown.totals.repurchaseTotal)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold text-zinc-400">Delivery fee</div>
                    <div className="mt-1 text-sm font-bold text-white">{currency(drilldown.totals.deliveryFee)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold text-zinc-400">Delivery fee (Others)</div>
                    <div className="mt-1 text-sm font-bold text-white">{currency(drilldown.totals.deliveryFeeOthers)}</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="text-xs font-semibold text-zinc-400">Total</div>
                    <div className="mt-1 text-sm font-bold text-white">
                      {currency(
                        drilldown.totals.packageAmount +
                          drilldown.totals.subscriptionAmount +
                          drilldown.totals.repurchaseTotal +
                          drilldown.totals.deliveryFee +
                          drilldown.totals.deliveryFeeOthers,
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs font-bold text-white">Orders (source: compiled orders)</div>
                  <div className="admin-table-wrap mt-2 max-h-80 overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-black/40 text-zinc-300">
                        <tr>
                          <th className="px-3 py-2 text-left">Invoice</th>
                          <th className="px-3 py-2 text-left">Status</th>
                          <th className="px-3 py-2 text-right whitespace-nowrap">Package</th>
                          <th className="px-3 py-2 text-right whitespace-nowrap">Subs</th>
                          <th className="px-3 py-2 text-right whitespace-nowrap">Delivery fee</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {drilldown.byInvoice.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-zinc-500" colSpan={5}>
                              No included orders.
                            </td>
                          </tr>
                        ) : (
                          drilldown.byInvoice.map((r) => (
                            <tr key={r.invoiceNumber} className="bg-black/10 text-zinc-100">
                              <td className="px-3 py-2 font-mono text-[11px]">{r.invoiceNumber}</td>
                              <td className="px-3 py-2 text-zinc-300">{r.status || "—"}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{currency(r.packagePrice)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{currency(r.subscriptionAmount)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{currency(r.deliveryFee)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs font-bold text-white">Delivery fee (Others) charges</div>
                  <div className="admin-table-wrap mt-2 max-h-80 overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 bg-black/40 text-zinc-300">
                        <tr>
                          <th className="px-3 py-2 text-left">Invoice</th>
                          <th className="px-3 py-2 text-left">Note</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {drilldown.charges.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-zinc-500" colSpan={3}>
                              No delivery fee (Others) charges for this day.
                            </td>
                          </tr>
                        ) : (
                          drilldown.charges.map((c) => (
                            <tr key={c.id || c.invoiceNumber + c.amount} className="bg-black/10 text-zinc-100">
                              <td className="px-3 py-2 font-mono text-[11px]">{c.invoiceNumber || "—"}</td>
                              <td className="px-3 py-2 text-zinc-300">{c.note || "—"}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{currency(c.amount)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
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

        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="text-sm font-semibold">Deposits</div>
          <div className="mt-1 text-xs text-zinc-400">
            Mark a sales day as deposited to create an SOA credit in Cash Balances (description: <span className="font-mono">sales-YYYY-MM-DD</span>).
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-zinc-400">Deposit to</div>
            <select
              value={depositAccountId}
              onChange={(e) => setDepositAccountId(e.target.value)}
              className="admin-select mt-1 w-full"
            >
              {cashAccounts.length === 0 ? <option value="">No bank accounts</option> : null}
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.bank})
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-black/40 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Sales day</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Deposit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {daily.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500" colSpan={3}>
                      No days.
                    </td>
                  </tr>
                ) : (
                  daily.map((d) => {
                    const amt = d.packageAmount + d.subscriptionAmount + d.repurchaseTotal + d.deliveryFee;
                    const deposited = depositedBySalesDay.has(d.date);
                    return (
                      <tr key={`dep-${d.date}`} className="bg-black/10 text-zinc-100">
                        <td className="px-3 py-2 font-mono text-zinc-200">{d.date}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{currency(amt)}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={!depositAccountId || amt <= 0 || depositingDay === d.date}
                            onClick={() => void depositSalesDay(d.date, amt)}
                            className={[
                              "rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60",
                              deposited ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15" : "border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15",
                            ].join(" ")}
                            title={deposited ? "Click to undo deposit" : "Click to mark deposited"}
                          >
                            {depositingDay === d.date ? "Saving…" : deposited ? "Deposited" : "Deposit"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

