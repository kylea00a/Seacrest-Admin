"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminSettings, BankAccount, CashTransaction } from "@/data/admin/types";
import { isOrderExcludedFromSuccessMetrics, type ProductBreakdown } from "@/data/admin/ordersParse";
import {
  CHIP_FLAVOR_COLUMNS,
  addChipsPiecesByFlavor,
  chipsPiecesByFlavorFromOrder,
  chipsRepurchaseAmountFromOrder,
  emptyChipsPiecesByFlavor,
  monthToRange,
  type ChipFlavorKey,
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
  chipsPieces: Record<ChipFlavorKey, number>;
  chipsRepurchase: number;
};

type DepositDialogState = {
  salesDate: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
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
  const [depositDialog, setDepositDialog] = useState<DepositDialogState | null>(null);

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
      const base: DailyRow = { date: d, chipsPieces: emptyChipsPiecesByFlavor(), chipsRepurchase: 0 };
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
      const dr = add(day);
      addChipsPiecesByFlavor(dr.chipsPieces, chipsPiecesByFlavorFromOrder(rep));
      dr.chipsRepurchase += chipsAmt;
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

  const accountLabel = (accountId: string): string => {
    const a = cashAccounts.find((x) => x.id === accountId);
    return a ? `${a.name} (${a.bank})` : "Unknown bank";
  };

  const transferLabel = (fromId: string, toId: string) => {
    if (!fromId || !toId) return accountLabel(toId || fromId);
    return `${accountLabel(fromId)} → ${accountLabel(toId)}`;
  };

  const depositTransferForDay = (salesDate: string) => {
    const txs = cashTx.filter((t) => t.kind === "jj_sales_deposit" && t.salesDate === salesDate);
    const credit = txs.find((t) => t.credit > 0);
    const debit = txs.find((t) => t.debit > 0);
    if (!credit) return null;
    return {
      fromAccountId: debit?.accountId ?? credit.counterpartyAccountId ?? "",
      toAccountId: credit.accountId,
    };
  };

  const depositSalesDay = async (
    salesDate: string,
    amount: number,
    fromAccountId: string,
    toAccountId: string,
  ) => {
    if (!fromAccountId || !toAccountId || !salesDate || amount <= 0) return;
    setDepositingDay(salesDate);
    setError(null);
    try {
      const res = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "depositJjSalesDay",
          fromAccountId,
          toAccountId,
          salesDate,
          amount,
        }),
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

  const undoDepositSalesDay = async (salesDate: string) => {
    if (!salesDate) return;
    setDepositingDay(salesDate);
    setError(null);
    try {
      const res = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undoDepositJjSalesDay", salesDate }),
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
            <table className="min-w-[720px] text-xs">
              <thead className="bg-black/30 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left" rowSpan={2}>
                    Date
                  </th>
                  <th
                    className="border-b border-white/10 px-2 py-1 text-center text-[10px] font-bold tracking-wide"
                    colSpan={CHIP_FLAVOR_COLUMNS.length}
                  >
                    Chips pieces
                  </th>
                  <th className="px-3 py-2 text-right whitespace-nowrap" rowSpan={2}>
                    Chips repurchase
                  </th>
                  <th className="px-3 py-2 text-right whitespace-nowrap" rowSpan={2}>
                    Total
                  </th>
                </tr>
                <tr>
                  {CHIP_FLAVOR_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className="px-2 py-1 text-center text-[10px] font-semibold text-zinc-400"
                      title={col.label}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {daily.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-500" colSpan={CHIP_FLAVOR_COLUMNS.length + 3}>
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
                      {CHIP_FLAVOR_COLUMNS.map((col) => (
                        <td key={col.key} className="px-2 py-2 text-center tabular-nums text-zinc-300">
                          {d.chipsPieces[col.key] > 0 ? countFmt(d.chipsPieces[col.key]) : ""}
                        </td>
                      ))}
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
            Transfer chips repurchase totals bank-to-bank (
            <span className="font-mono">jj-sales-YYYY-MM-DD</span>): debit on deposit from, credit on deposit to.
          </div>

          <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-black/40 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Sales day</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Transfer</th>
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
                    const transfer = depositTransferForDay(d.date);
                    const needsTwoBanks = cashAccounts.length >= 2;
                    return (
                      <tr key={`dep-${d.date}`} className="bg-black/10 text-zinc-100">
                        <td className="px-3 py-2 font-mono text-zinc-200">{d.date}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{currency(amt)}</td>
                        <td className="px-3 py-2 text-zinc-300">
                          {transfer ? transferLabel(transfer.fromAccountId, transfer.toAccountId) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            disabled={amt <= 0 || depositingDay === d.date || (!transfer && !needsTwoBanks)}
                            onClick={() => {
                              if (transfer) void undoDepositSalesDay(d.date);
                              else
                                setDepositDialog({
                                  salesDate: d.date,
                                  amount: amt,
                                  fromAccountId: cashAccounts[0]?.id ?? "",
                                  toAccountId: cashAccounts[1]?.id ?? cashAccounts[0]?.id ?? "",
                                });
                            }}
                            className={[
                              "rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-60",
                              transfer
                                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"
                                : "border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15",
                            ].join(" ")}
                          >
                            {depositingDay === d.date ? "Saving…" : transfer ? "Undo" : "Deposit"}
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
              Deposit from
              <select
                value={depositDialog.fromAccountId}
                onChange={(e) => setDepositDialog((p) => (p ? { ...p, fromAccountId: e.target.value } : p))}
                className="admin-select mt-1 w-full"
                disabled={depositingDay === depositDialog.salesDate}
              >
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.bank})
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-xs font-semibold text-zinc-400">
              Deposit to
              <select
                value={depositDialog.toAccountId}
                onChange={(e) => setDepositDialog((p) => (p ? { ...p, toAccountId: e.target.value } : p))}
                className="admin-select mt-1 w-full"
                disabled={depositingDay === depositDialog.salesDate}
              >
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.bank})
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-300">
              Debit on deposit from, credit on deposit to (
              <span className="font-mono text-zinc-100">jj-sales-{depositDialog.salesDate}</span>).
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
                disabled={
                  !depositDialog.fromAccountId ||
                  !depositDialog.toAccountId ||
                  depositDialog.fromAccountId === depositDialog.toAccountId ||
                  depositingDay === depositDialog.salesDate
                }
                onClick={() =>
                  void depositSalesDay(
                    depositDialog.salesDate,
                    depositDialog.amount,
                    depositDialog.fromAccountId,
                    depositDialog.toAccountId,
                  )
                }
              >
                {depositingDay === depositDialog.salesDate ? "Transferring…" : "Confirm transfer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
