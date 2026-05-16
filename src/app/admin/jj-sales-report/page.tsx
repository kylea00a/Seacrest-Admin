"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminSettings, BankAccount, CashTransaction } from "@/data/admin/types";
import { isOrderExcludedFromSuccessMetrics, type ProductBreakdown } from "@/data/admin/ordersParse";
import {
  chipsRepurchaseAmountFromOrder,
  monthToRange,
} from "@/lib/salesReportChipsRepurchase";

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

async function safeReadJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 160).replace(/\s+/g, " ").trim();
    throw new Error(`Bad response (${res.status}). Expected JSON but got: ${snippet || "(empty)"}`);
  }
}

type DailyRow = {
  date: string;
  chipsRepurchase: number;
};

export default function JjSalesReportPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [month, setMonth] = useState<string>("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [cashAccounts, setCashAccounts] = useState<BankAccount[]>([]);
  const [cashTx, setCashTx] = useState<CashTransaction[]>([]);
  const [depositingDay, setDepositingDay] = useState<string>("");
  const [drilldownDay, setDrilldownDay] = useState<string>("");
  const [depositDialog, setDepositDialog] = useState<{ salesDate: string; amount: number; accountId: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const today = new Date();
        const mm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
        const sRes = await fetch("/api/admin/settings", { cache: "no-store" });
        const sJson = (await sRes.json()) as { settings?: AdminSettings; error?: string };
        if (!sRes.ok) throw new Error(sJson.error ?? `Failed with status ${sRes.status}`);
        if (!cancelled) {
          setSettings(sJson.settings ?? null);
          setMonth(mm);
        }
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
    let cancelled = false;
    async function loadCompiledForMonth() {
      const range = monthToRange(month);
      if (!range) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/orders/compiled?start=${range.start}&end=${range.end}`, {
          cache: "no-store",
        });
        const json = await safeReadJson<{ rows?: Array<Record<string, unknown>>; error?: string }>(res);
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        if (!cancelled) setRows(json.rows ?? []);
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
        if (!cancelled) {
          setCashAccounts(json.accounts ?? []);
          setCashTx(json.transactions ?? []);
        }
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

  const daily = useMemo(() => {
    const out = new Map<string, DailyRow>();
    const range = monthToRange(month);

    const add = (d: string): DailyRow => {
      const existing = out.get(d);
      if (existing) return existing;
      const base: DailyRow = { date: d, chipsRepurchase: 0 };
      out.set(d, base);
      return base;
    };

    for (const row of rows) {
      if (isOrderExcludedFromSuccessMetrics(String(row["status"] ?? ""))) continue;
      const day = String(row["date"] ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      if (range && (day < range.start || day > range.end)) continue;

      const rep = row["repurchaseProducts"] as ProductBreakdown | undefined;
      const chipsAmt = chipsRepurchaseAmountFromOrder(rep, productPriceByName);
      if (chipsAmt <= 0) continue;
      add(day).chipsRepurchase += chipsAmt;
    }

    return Array.from(out.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, productPriceByName, month]);

  const monthTotal = useMemo(() => daily.reduce((acc, d) => acc + d.chipsRepurchase, 0), [daily]);

  const drilldown = useMemo(() => {
    if (!drilldownDay) return null;
    const dayRows = rows.filter((r) => String(r["date"] ?? "").slice(0, 10) === drilldownDay);
    const excluded = dayRows.filter((r) => isOrderExcludedFromSuccessMetrics(String(r["status"] ?? "")));
    const included = dayRows.filter((r) => !isOrderExcludedFromSuccessMetrics(String(r["status"] ?? "")));

    const byInvoice = included
      .map((r) => {
        const rep = r["repurchaseProducts"] as ProductBreakdown | undefined;
        const chipsAmt = chipsRepurchaseAmountFromOrder(rep, productPriceByName);
        return {
          invoiceNumber: String(r["invoiceNumber"] ?? "").trim() || "—",
          status: String(r["status"] ?? ""),
          chipsRepurchase: chipsAmt,
        };
      })
      .filter((r) => r.chipsRepurchase > 0)
      .sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));

    const totals = daily.find((d) => d.date === drilldownDay) ?? null;
    return { byInvoice, totals, excludedCount: excluded.length, includedCount: included.length };
  }, [drilldownDay, rows, productPriceByName, daily]);

  const depositedBySalesDay = useMemo(() => {
    const map = new Map<string, CashTransaction>();
    for (const t of cashTx) {
      if (t.kind === "jj_sales_deposit" && t.salesDate && !map.has(t.salesDate)) map.set(t.salesDate, t);
    }
    return map;
  }, [cashTx]);

  const accountLabel = (accountId: string): string => {
    const a = cashAccounts.find((x) => x.id === accountId);
    return a ? `${a.name} (${a.bank})` : "Unknown bank";
  };

  const depositSalesDay = async (salesDate: string, amount: number, accountId: string) => {
    if (!accountId || !salesDate || amount <= 0) return;
    setDepositingDay(salesDate);
    setError(null);
    try {
      const res = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "depositJjSalesDay", accountId, salesDate, amount }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        file?: { accounts?: BankAccount[]; transactions?: CashTransaction[] };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setCashAccounts(json.file?.accounts ?? cashAccounts);
      setCashTx(json.file?.transactions ?? cashTx);
      setDepositDialog(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDepositingDay("");
    }
  };

  const undoDepositSalesDay = async (tx: CashTransaction) => {
    if (!tx.salesDate || !tx.accountId) return;
    setDepositingDay(tx.salesDate);
    setError(null);
    try {
      const res = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undoDepositJjSalesDay", accountId: tx.accountId, salesDate: tx.salesDate }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        file?: { accounts?: BankAccount[]; transactions?: CashTransaction[] };
        error?: string;
      };
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
        <h1 className="admin-title">JJ Sales Report</h1>
        <div className="admin-muted">
          Paid repurchase chips only (package and subscription chips are excluded). Same effective-date grouping as Sales
          Report.
        </div>

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
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Chips repurchase (PHP)</div>
            <div className="mt-1 text-lg font-bold text-white">{currency(monthTotal)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-zinc-400">Days with chips sales</div>
            <div className="mt-1 text-lg font-bold text-white">{countFmt(daily.length)}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-semibold">Daily totals (by effective date)</div>
          <div className="mt-1 text-xs text-zinc-400">Successful orders with repurchase chips only</div>

          <div className="admin-table-wrap mt-3 max-w-full overflow-x-auto">
            <table className="min-w-[520px] text-xs">
              <thead className="bg-black/30 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Chips repurchase</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {daily.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-500" colSpan={3}>
                      No paid repurchase chips found for this month.
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
                          title="View day summary"
                        >
                          {d.date}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{currency(d.chipsRepurchase)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{currency(d.chipsRepurchase)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {drilldownDay && drilldown ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Day Summary — {drilldownDay}</div>
                  <div className="admin-muted mt-1 text-xs">
                    Included: {countFmt(drilldown.includedCount)} • Excluded: {countFmt(drilldown.excludedCount)}
                  </div>
                </div>
                <button type="button" className="admin-btn-secondary px-3 py-1.5 text-xs" onClick={() => setDrilldownDay("")}>
                  Close
                </button>
              </div>

              {drilldown.totals ? (
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs font-semibold text-zinc-400">Chips repurchase</div>
                  <div className="mt-1 text-sm font-bold text-white">{currency(drilldown.totals.chipsRepurchase)}</div>
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs font-bold text-white">Orders with repurchase chips</div>
                <div className="admin-table-wrap mt-2 max-h-80 overflow-auto">
                  <table className="min-w-full text-xs">
                    <thead className="sticky top-0 bg-black/40 text-zinc-300">
                      <tr>
                        <th className="px-3 py-2 text-left">Invoice</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Chips repurchase</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {drilldown.byInvoice.length === 0 ? (
                        <tr>
                          <td className="px-3 py-3 text-zinc-500" colSpan={3}>
                            No orders with repurchase chips on this day.
                          </td>
                        </tr>
                      ) : (
                        drilldown.byInvoice.map((r) => (
                          <tr key={r.invoiceNumber} className="bg-black/10 text-zinc-100">
                            <td className="px-3 py-2 font-mono text-[11px]">{r.invoiceNumber}</td>
                            <td className="px-3 py-2 text-zinc-300">{r.status || "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{currency(r.chipsRepurchase)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">How it&apos;s computed</div>
        <div className="mt-2 space-y-2 text-sm text-zinc-200">
          <div>Uses successful orders only (same rules as Sales Report).</div>
          <div className="text-xs text-zinc-400">
            Only quantities in <strong>Repurchase products</strong> where the product name includes &quot;Chips&quot;.
            Package and subscription chip lines are not counted.
          </div>
          <div className="text-xs text-zinc-400">Bulk tier pricing applies per order (15+ / 30+ / 50+ bags).</div>
        </div>

        <div className="mt-6 border-t border-white/10 pt-5">
          <div className="text-sm font-semibold">Deposits</div>
          <div className="mt-1 text-xs text-zinc-400">
            Deposit chips repurchase totals to a bank account. Creates a Cash Balances credit with description{" "}
            <span className="font-mono">jj-sales-YYYY-MM-DD</span>.
          </div>

          <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-black/40 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Sales day</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Bank</th>
                  <th className="px-3 py-2 text-right">Deposit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {daily.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-zinc-500" colSpan={4}>
                      No days.
                    </td>
                  </tr>
                ) : (
                  daily.map((d) => {
                    const amt = d.chipsRepurchase;
                    const deposited = depositedBySalesDay.get(d.date);
                    return (
                      <tr key={`dep-${d.date}`} className="bg-black/10 text-zinc-100">
                        <td className="px-3 py-2 font-mono text-zinc-200">{d.date}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{currency(amt)}</td>
                        <td className="px-3 py-2 text-zinc-300">{deposited ? accountLabel(deposited.accountId) : "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={amt <= 0 || depositingDay === d.date || (!deposited && cashAccounts.length === 0)}
                            onClick={() => {
                              if (deposited) void undoDepositSalesDay(deposited);
                              else
                                setDepositDialog({
                                  salesDate: d.date,
                                  amount: amt,
                                  accountId: cashAccounts[0]?.id ?? "",
                                });
                            }}
                            className={[
                              "rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60",
                              deposited
                                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                                : "border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15",
                            ].join(" ")}
                          >
                            {depositingDay === d.date ? "Saving…" : deposited ? "Undo" : "Deposit"}
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

      {depositDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Confirm JJ Sales Deposit</div>
                <div className="admin-muted mt-1 text-xs">
                  {depositDialog.salesDate} • {currency(depositDialog.amount)}
                </div>
              </div>
              <button
                type="button"
                className="admin-btn-secondary px-3 py-1.5 text-xs"
                onClick={() => setDepositDialog(null)}
                disabled={depositingDay === depositDialog.salesDate}
              >
                Close
              </button>
            </div>

            <label className="mt-4 block text-xs font-semibold text-zinc-400">
              Deposit to bank
              <select
                value={depositDialog.accountId}
                onChange={(e) => setDepositDialog((p) => (p ? { ...p, accountId: e.target.value } : p))}
                className="admin-select mt-1 w-full"
                disabled={depositingDay === depositDialog.salesDate}
              >
                {cashAccounts.length === 0 ? <option value="">No bank accounts</option> : null}
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.bank})
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
              Cash Balances credit: <span className="font-mono text-zinc-100">jj-sales-{depositDialog.salesDate}</span>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="admin-btn-secondary"
                onClick={() => setDepositDialog(null)}
                disabled={depositingDay === depositDialog.salesDate}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-primary"
                disabled={!depositDialog.accountId || depositingDay === depositDialog.salesDate}
                onClick={() => void depositSalesDay(depositDialog.salesDate, depositDialog.amount, depositDialog.accountId)}
              >
                {depositingDay === depositDialog.salesDate ? "Depositing…" : "Confirm deposit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
