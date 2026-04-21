"use client";

import { useCallback, useEffect, useState } from "react";

type PayoutRow = {
  id: string;
  date: string;
  referenceNumber: string;
  distributorName: string;
  bank: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  paid: boolean;
  receiptNumber: string;
};

function currency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n);
  } catch {
    return `${n}`;
  }
}

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Bad response (${res.status})`);
  }
}

export default function PayoutsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [savingId, setSavingId] = useState<string>("");
  const [meta, setMeta] = useState<{ importedAt?: string; filename?: string }>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts", { cache: "no-store" });
      const json = await readJson<{
        payouts?: PayoutRow[];
        walletImportedAt?: string;
        walletFilename?: string;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setPayouts(json.payouts ?? []);
      setMeta({ importedAt: json.walletImportedAt, filename: json.walletFilename });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchPayout = async (id: string, paid: boolean, receiptNumber: string) => {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paid, receiptNumber }),
      });
      const json = await readJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  };

  const togglePaid = async (row: PayoutRow) => {
    if (row.paid) {
      const ok = window.confirm("Mark this payout as unpaid? The receipt number will be cleared.");
      if (!ok) return;
      await patchPayout(row.id, false, "");
      return;
    }
    const r = window.prompt("Enter receipt number:");
    if (r == null) return;
    const receipt = r.trim();
    if (!receipt) {
      setError("Receipt number is required to mark as paid.");
      return;
    }
    await patchPayout(row.id, true, receipt);
  };

  const copyReceipt = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="admin-card">
        <h1 className="admin-title">Payouts</h1>
        <p className="admin-muted mt-2 max-w-3xl text-sm">
          Rows are loaded from wallet imports where Notes includes payout details in this form:{" "}
          <span className="font-mono text-xs text-zinc-400">
            Payout Bank: … Card Name: … Account Number: …
          </span>
          . Sorted oldest → latest by transaction date and time.
        </p>
        {meta.importedAt ? (
          <p className="mt-2 text-xs text-zinc-500">
            Wallet data: {meta.filename ?? "—"} · {new Date(meta.importedAt).toLocaleString()}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
      ) : null}

      <div className="admin-card overflow-x-auto">
        {loading ? (
          <div className="text-sm text-zinc-400">Loading…</div>
        ) : payouts.length === 0 ? (
          <div className="text-sm text-zinc-400">
            No payout rows yet. Import wallet transactions and ensure Notes use the payout format.
          </div>
        ) : (
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-white/10 text-zinc-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Reference</th>
                <th className="px-3 py-2">Distributor</th>
                <th className="px-3 py-2">Bank</th>
                <th className="px-3 py-2">Account name</th>
                <th className="px-3 py-2">Account #</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-zinc-200">
              {payouts.map((row) => (
                <tr key={row.id}>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{row.date}</td>
                  <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[11px]" title={row.referenceNumber}>
                    {row.referenceNumber}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2" title={row.distributorName}>
                    {row.distributorName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{row.bank}</td>
                  <td className="max-w-[140px] truncate px-3 py-2" title={row.accountName}>
                    {row.accountName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">{row.accountNumber}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{currency(row.amount)}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={savingId === row.id}
                      onClick={() => void togglePaid(row)}
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50 ${
                        row.paid
                          ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      }`}
                    >
                      {savingId === row.id ? "…" : row.paid ? "Paid" : "Unpaid"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    {row.paid && row.receiptNumber ? (
                      <button
                        type="button"
                        onClick={() => void copyReceipt(row.receiptNumber)}
                        className="max-w-[160px] truncate text-left font-mono text-[11px] text-zinc-500 underline decoration-zinc-600 decoration-dotted underline-offset-2 hover:text-zinc-400"
                        title="Click to copy"
                      >
                        {row.receiptNumber}
                      </button>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
