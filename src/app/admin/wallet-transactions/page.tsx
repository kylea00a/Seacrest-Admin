"use client";

import { useCallback, useEffect, useState } from "react";
import type { WalletTransactionsFile } from "@/data/admin/types";

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Bad response (${res.status})`);
  }
}

export default function WalletTransactionsImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [data, setData] = useState<WalletTransactionsFile | null>(null);

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

  const importFile = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/wallet-transactions", { method: "POST", body: form });
      const json = await readJson<{ ok?: boolean; rowCount?: number; error?: string; filename?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setNotice(`Imported ${json.rowCount?.toLocaleString() ?? 0} row(s) from ${json.filename ?? file.name}.`);
      setFile(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="admin-card">
        <h1 className="admin-title">Wallet Transactions Import</h1>
        <p className="admin-muted mt-2 max-w-2xl text-sm leading-relaxed">
          Upload the full wallet export (Excel). Required columns include reference, amount, notes, and{" "}
          <span className="text-zinc-300">Transaction date</span> (or &quot;Transaction d&quot;) — that date is used for
          each row. The <span className="text-zinc-300">Balance</span> column is ignored. Re-importing replaces all
          previously stored wallet rows (payout receipts are kept only for rows that still exist by ID).
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">Excel file (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void importFile()}
            disabled={!file || uploading}
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60"
          >
            {uploading ? "Importing…" : "Import"}
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
        ) : null}
        {notice ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            {notice}
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <h2 className="text-sm font-semibold text-white">Current import</h2>
        {loading ? (
          <p className="mt-2 text-sm text-zinc-400">Loading…</p>
        ) : data && data.rows.length > 0 ? (
          <dl className="mt-3 grid gap-2 text-sm text-zinc-300">
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
          <p className="mt-2 text-sm text-zinc-400">No wallet data imported yet.</p>
        )}
      </div>
    </div>
  );
}
