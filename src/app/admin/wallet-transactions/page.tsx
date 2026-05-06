"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { WalletTransactionRow, WalletTransactionsFile } from "@/data/admin/types";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Bad response (${res.status})`);
  }
}

const PREVIEW_PAGE_SIZES = [10, 25, 50] as const;

function PreviewTable({
  rows,
  title,
  page,
  setPage,
  pageSize,
  setPageSize,
  fileTotalRows,
}: {
  rows: WalletTransactionRow[];
  title: string;
  page: number;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  pageSize: (typeof PREVIEW_PAGE_SIZES)[number];
  setPageSize: React.Dispatch<React.SetStateAction<(typeof PREVIEW_PAGE_SIZES)[number]>>;
  fileTotalRows?: number;
}) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, setPage]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages, rows.length, setPage]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs text-zinc-400">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length}
            {fileTotalRows != null && fileTotalRows > rows.length ? ` (${fileTotalRows.toLocaleString()} rows in file)` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="whitespace-nowrap">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as (typeof PREVIEW_PAGE_SIZES)[number])}
              className="admin-select py-1.5 text-xs"
            >
              {PREVIEW_PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="admin-btn-secondary px-2 py-1.5 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-xs tabular-nums text-zinc-300">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="admin-btn-secondary px-2 py-1.5 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <div className="admin-table-wrap mt-2">
        <table className="min-w-full text-xs">
          <thead className="bg-black/30 text-zinc-300">
            <tr>
              <th className="px-3 py-2 text-left">Transaction date</th>
              <th className="px-3 py-2 text-left">Reference</th>
              <th className="px-3 py-2 text-left">Distributor</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((r) => (
              <tr key={r.id} className="border-t border-white/[0.06] text-zinc-200">
                <td className="px-3 py-2 font-mono text-[11px]">{r.transactionDate || "—"}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{r.referenceNumber || "—"}</td>
                <td className="max-w-[220px] truncate px-3 py-2">
                  <div className="truncate">{r.distributorName || "—"}</div>
                  <div className="truncate font-mono text-[11px] text-zinc-500">{r.distributorId || ""}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-[11px] tabular-nums">
                  {Number.isFinite(r.amount) ? r.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </td>
                <td className="max-w-[260px] truncate px-3 py-2">{r.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function WalletTransactionsImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<WalletTransactionsFile | null>(null);

  const [token, setToken] = useState("");
  const [previewRows, setPreviewRows] = useState<WalletTransactionRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [previewMeta, setPreviewMeta] = useState<{ filename: string; importedAt: string } | null>(null);

  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState<(typeof PREVIEW_PAGE_SIZES)[number]>(25);

  const [manage, setManage] = useState(false);
  const [clearing, setClearing] = useState(false);

  const clearStaging = () => {
    setToken("");
    setPreviewRows([]);
    setTotalRows(0);
    setPreviewMeta(null);
    setPreviewPage(1);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/wallet-transactions", { cache: "no-store" });
      const json = await readJson<WalletTransactionsFile & { error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setData({
        importedAt: json.importedAt,
        filename: json.filename,
        rows: json.rows ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runPreview = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      clearStaging();
      const res = await fetch("/api/admin/wallet-transactions/preview", { method: "POST", body: form });
      const json = await readJson<{
        token?: string;
        previewRows?: WalletTransactionRow[];
        totalRows?: number;
        filename?: string;
        importedAt?: string;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setToken(json.token ?? "");
      setPreviewRows(json.previewRows ?? []);
      setTotalRows(json.totalRows ?? 0);
      setPreviewMeta(json.filename && json.importedAt ? { filename: json.filename, importedAt: json.importedAt } : null);
      setPreviewPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const confirmSave = async () => {
    if (!token) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/wallet-transactions/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await readJson<{ ok?: boolean; rowCount?: number; error?: string; filename?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setNotice(
        `Saved ${json.rowCount?.toLocaleString() ?? 0} row(s) from ${json.filename ?? previewMeta?.filename ?? "wallet.xlsx"}.`,
      );
      clearStaging();
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const clearStored = async () => {
    const ok = window.confirm("Clear the currently stored wallet import? This will remove all wallet rows until you import again.");
    if (!ok) return;
    setClearing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/wallet-transactions", { method: "DELETE" });
      const json = await readJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setNotice("Cleared stored wallet import.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setClearing(false);
    }
  };

  const canPreview = Boolean(file) && !uploading;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6 lg:min-w-0">
        <div className="admin-card">
          <h1 className="admin-title">Wallet Transactions Import</h1>
          <p className="admin-muted mt-1 max-w-3xl text-sm leading-relaxed">
            Upload the full wallet export (Excel). You&apos;ll preview rows before confirming. Required columns include
            reference, amount, notes, and <span className="text-zinc-300">Transaction date</span> (or &quot;Transaction d&quot;).
            The <span className="text-zinc-300">Balance</span> column is ignored. Confirming replaces all stored wallet rows
            (payout receipts are kept only for rows that still exist by ID).
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-zinc-200">Excel file</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                disabled={uploading}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  clearStaging();
                  setNotice(null);
                }}
                className="mt-2 block w-full text-sm text-zinc-200 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-emerald-950 hover:file:bg-emerald-400"
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void runPreview()}
              disabled={!canPreview}
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60"
            >
              {uploading && !token ? "Reading…" : "Preview"}
            </button>
            <div className="text-xs text-zinc-400">Not saved until you confirm.</div>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}
          {notice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              {notice}
            </div>
          ) : null}

          {previewMeta && token ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">Preview (not saved yet)</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {previewMeta.filename} • {totalRows.toLocaleString()} rows
                  </div>
                </div>
                <div className="text-xs text-zinc-400">{new Date(previewMeta.importedAt).toLocaleString()}</div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void confirmSave()}
                  disabled={!token || uploading}
                  className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {uploading && token ? "Saving…" : "Confirm & Save"}
                </button>
                <button
                  type="button"
                  onClick={() => clearStaging()}
                  disabled={uploading}
                  className="admin-btn-secondary px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>

              {previewRows.length > 0 ? (
                <PreviewTable
                  rows={previewRows}
                  title="Sample rows (first 200 from file)"
                  page={previewPage}
                  setPage={setPreviewPage}
                  pageSize={previewPageSize}
                  setPageSize={setPreviewPageSize}
                  fileTotalRows={totalRows}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold text-white">Current import</div>
        <div className="mt-1 text-xs text-zinc-400">Stored wallet rows used for payouts</div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">Manage mode lets you clear the stored wallet import.</div>
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <input
              type="checkbox"
              checked={manage}
              onChange={(e) => setManage(e.target.checked)}
              className="rounded border-white/20 bg-black/30"
            />
            Manage
          </label>
        </div>

        {manage ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
            <button
              type="button"
              onClick={() => void clearStored()}
              disabled={clearing}
              className="rounded-xl border border-red-500/50 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-950/70 disabled:opacity-60"
            >
              {clearing ? "Clearing…" : "Clear stored import"}
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-3 text-sm text-zinc-400">Loading…</p>
        ) : data && data.rows.length > 0 ? (
          <dl className="mt-4 grid gap-2 text-sm text-zinc-300">
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Filename</dt>
              <dd className="truncate text-right font-mono text-xs text-zinc-400">{data.filename || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Imported at</dt>
              <dd>{data.importedAt ? new Date(data.importedAt).toLocaleString() : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-zinc-500">Rows stored</dt>
              <dd className="tabular-nums font-semibold text-white">{data.rows.length.toLocaleString()}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-zinc-400">No wallet data imported yet.</p>
        )}
      </div>
    </div>
  );
}
