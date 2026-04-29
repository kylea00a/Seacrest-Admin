"use client";

import { useEffect, useMemo, useState } from "react";
import type { BankAccount, CashTransaction } from "@/data/admin/types";
import { format, startOfDay } from "date-fns";
import { useAdminSession } from "../AdminSessionContext";

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
    const snippet = text.slice(0, 140).replace(/\s+/g, " ").trim();
    throw new Error(`Bad response (${res.status}). Expected JSON but got: ${snippet || "(empty)"}`);
  }
}

export default function CashBalancesPage() {
  const { can } = useAdminSession();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [txns, setTxns] = useState<CashTransaction[]>([]);

  const [accountId, setAccountId] = useState<string>("");
  const [rowsPerPage, setRowsPerPage] = useState<25 | 50 | 100>(25);
  const [page, setPage] = useState(1);

  const todayYmd = useMemo(() => format(startOfDay(new Date()), "yyyy-MM-dd"), []);
  const [customDate, setCustomDate] = useState(todayYmd);
  const [customSide, setCustomSide] = useState<"credit" | "debit">("credit");
  const [customAmount, setCustomAmount] = useState("");
  const [customDesc, setCustomDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cash", { cache: "no-store" });
      const json = await safeReadJson<{ accounts?: BankAccount[]; transactions?: CashTransaction[]; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      const a = json.accounts ?? [];
      const t = json.transactions ?? [];
      setAccounts(a);
      setTxns(t);
      setAccountId((prev) => (prev && a.some((x) => x.id === prev) ? prev : a[0]?.id ?? ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const list = accountId ? txns.filter((t) => t.accountId === accountId) : txns;
    return [...list].sort((a, b) => (b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
  }, [txns, accountId]);

  const balanceByTxnId = useMemo(() => {
    if (!accountId) return new Map<string, number>();
    const list = txns
      .filter((t) => t.accountId === accountId)
      // Oldest → newest for running balance computation
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const map = new Map<string, number>();
    let b = 0;
    for (const t of list) {
      b += (t.credit ?? 0) - (t.debit ?? 0);
      map.set(t.id, b);
    }
    return map;
  }, [txns, accountId]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / rowsPerPage)), [filtered.length, rowsPerPage]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages]);

  const visible = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const addCustom = async () => {
    if (!accountId) return;
    const amt = Number(customAmount);
    if (!customDesc.trim() || !Number.isFinite(amt) || amt <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addTransaction",
          accountId,
          date: customDate,
          side: customSide,
          amount: amt,
          description: customDesc.trim(),
        }),
      });
      const json = await safeReadJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setCustomAmount("");
      setCustomDesc("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const canDelete = can("pettyCashEdit");

  const deleteTxn = async (id: string) => {
    if (!canDelete) return;
    const ok = window.confirm("Delete this transaction? This cannot be undone.");
    if (!ok) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteTransaction", id }),
      });
      const json = await safeReadJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId("");
    }
  };

  const balance = useMemo(() => {
    if (!accountId) return 0;
    const list = txns.filter((t) => t.accountId === accountId);
    let b = 0;
    for (const t of list) b += (t.credit ?? 0) - (t.debit ?? 0);
    return b;
  }, [txns, accountId]);

  return (
    <div className="admin-card min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-title">Cash Balances</h1>
          <div className="admin-muted">SOA / cash ledger by bank account.</div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Account</div>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="admin-select mt-1 min-w-[16rem]"
            >
              {accounts.length === 0 ? <option value="">No accounts</option> : null}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.bank})
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-zinc-400">
            Balance: <span className="font-semibold text-zinc-200">{currency(balance)}</span>
          </div>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}

      <div className="admin-card-inset mt-6">
        <div className="text-sm font-semibold text-zinc-200">Add custom transaction</div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Date</div>
            <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} className="admin-input mt-1" />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400">Side</div>
            <select value={customSide} onChange={(e) => setCustomSide(e.target.value as "credit" | "debit")} className="admin-select mt-1">
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400">Amount</div>
            <input value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} className="admin-input mt-1 w-32" inputMode="decimal" />
          </div>
          <div className="min-w-[16rem] flex-1">
            <div className="text-xs font-semibold text-zinc-400">Description</div>
            <input value={customDesc} onChange={(e) => setCustomDesc(e.target.value)} className="admin-input mt-1 w-full" placeholder="e.g. bank fee, adjustment…" />
          </div>
          <button type="button" onClick={() => void addCustom()} disabled={saving || !accountId} className="admin-btn-primary">
            {saving ? "Saving…" : "Add"}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-200">SOA</div>
            <div className="mt-1 text-xs text-zinc-500">Latest first</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span>Rows</span>
            <select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value) as 25 | 50 | 100)} className="admin-select py-1 text-xs">
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="tabular-nums">
              Page {page} / {totalPages}
            </span>
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="admin-btn-secondary px-2 py-1 text-xs disabled:opacity-50">
              Prev
            </button>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="admin-btn-secondary px-2 py-1 text-xs disabled:opacity-50">
              Next
            </button>
          </div>
        </div>

        <div className="admin-table-wrap mt-3 overflow-x-auto">
          <table className="min-w-[860px] text-xs">
            <thead className="bg-black/30 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left whitespace-nowrap">Date</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Debit</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Credit</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Balance</th>
                {canDelete ? <th className="px-3 py-2 text-right whitespace-nowrap">Edit</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visible.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500" colSpan={canDelete ? 6 : 5}>
                    No transactions yet.
                  </td>
                </tr>
              ) : (
                visible.map((t) => (
                  <tr key={t.id} className="bg-black/10 text-zinc-100">
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-300">{t.date}</td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-300/90">{t.debit ? currency(t.debit) : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">{t.credit ? currency(t.credit) : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-200">
                      {balanceByTxnId.has(t.id) ? currency(balanceByTxnId.get(t.id) ?? 0) : ""}
                    </td>
                    {canDelete ? (
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => void deleteTxn(t.id)}
                          disabled={deletingId === t.id}
                          className="admin-btn-secondary px-2 py-1 text-[11px] text-red-200 hover:bg-red-500/15 disabled:opacity-50"
                        >
                          {deletingId === t.id ? "Deleting…" : "Delete"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

