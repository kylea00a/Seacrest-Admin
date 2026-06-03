"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { XenditImportIndexEntry, XenditImportRow } from "@/data/admin/types";

type ApiListResponse = {
  rows: XenditImportRow[];
  imports: XenditImportIndexEntry[];
  importedAt: string;
  filename: string;
  error?: string;
};

const PREVIEW_PAGE_SIZES = [10, 25, 50] as const;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function XenditPreviewTable({
  rows,
  title,
  page,
  setPage,
  pageSize,
  setPageSize,
  fileTotalRows,
}: {
  rows: XenditImportRow[];
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
            {fileTotalRows != null && fileTotalRows > rows.length
              ? ` (${fileTotalRows.toLocaleString()} rows in file)`
              : ""}
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
        </div>
      </div>
      <div className="admin-table-wrap mt-2">
        <table className="min-w-full text-xs">
          <thead className="bg-black/30 text-zinc-300">
            <tr>
              <th className="px-3 py-2 text-left">Invoice (Reference)</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-left">Payment date</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((r) => (
              <tr key={r.id} className="border-t border-white/[0.06] text-zinc-200">
                <td className="px-3 py-2 font-mono text-[11px]">{r.invoiceNumber || "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.amount.toLocaleString()}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{r.paymentDateYmd || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function XenditImportPage() {
  const [imports, setImports] = useState<XenditImportIndexEntry[]>([]);
  const [mergedRowCount, setMergedRowCount] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [startDate, setStartDate] = useState(todayISO);
  const [endDate, setEndDate] = useState(todayISO);
  const [token, setToken] = useState("");
  const [previewRows, setPreviewRows] = useState<XenditImportRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [previewMeta, setPreviewMeta] = useState<{
    filename: string;
    importedAt: string;
    startDate: string;
    endDate: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState<(typeof PREVIEW_PAGE_SIZES)[number]>(25);

  const [savedPreviewId, setSavedPreviewId] = useState<string | null>(null);
  const [savedPreviewRows, setSavedPreviewRows] = useState<XenditImportRow[]>([]);
  const [loadingSavedId, setLoadingSavedId] = useState<string | null>(null);
  const [manageImports, setManageImports] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const savedFetchAbort = useRef<AbortController | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/xendit-import", { cache: "no-store" });
      const json = (await res.json()) as ApiListResponse;
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setImports(json.imports ?? []);
      setMergedRowCount(json.rows?.length ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const clearStaging = () => {
    setToken("");
    setPreviewRows([]);
    setTotalRows(0);
    setPreviewMeta(null);
    setPreviewPage(1);
  };

  const runPreview = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setImportNotice(null);
    clearStaging();
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("startDate", startDate);
      fd.set("endDate", endDate);
      const res = await fetch("/api/admin/xendit-import/preview", { method: "POST", body: fd });
      const json = (await res.json()) as {
        token?: string;
        previewRows?: XenditImportRow[];
        totalRows?: number;
        filename?: string;
        importedAt?: string;
        startDate?: string;
        endDate?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setToken(json.token ?? "");
      setPreviewRows(json.previewRows ?? []);
      setTotalRows(json.totalRows ?? 0);
      setPreviewMeta({
        filename: json.filename ?? file.name,
        importedAt: json.importedAt ?? new Date().toISOString(),
        startDate: json.startDate ?? startDate,
        endDate: json.endDate ?? endDate,
      });
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
    try {
      const res = await fetch("/api/admin/xendit-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as { ok?: boolean; rowCount?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setImportNotice(`Saved ${json.rowCount ?? 0} TRANSACTION row(s) to Xendit import history.`);
      clearStaging();
      setFile(null);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const toggleSavedPreview = async (id: string) => {
    if (savedPreviewId === id) {
      savedFetchAbort.current?.abort();
      setSavedPreviewId(null);
      setSavedPreviewRows([]);
      return;
    }
    savedFetchAbort.current?.abort();
    const ac = new AbortController();
    savedFetchAbort.current = ac;
    setSavedPreviewId(id);
    setLoadingSavedId(id);
    try {
      const res = await fetch(`/api/admin/xendit-import?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      const json = (await res.json()) as { file?: { rows?: XenditImportRow[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setSavedPreviewRows(json.file?.rows ?? []);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
      setSavedPreviewId(null);
    } finally {
      setLoadingSavedId(null);
    }
  };

  const deleteImport = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/xendit-import?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      if (savedPreviewId === id) {
        setSavedPreviewId(null);
        setSavedPreviewRows([]);
      }
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAllImports = async () => {
    const ok = window.confirm(`Delete all ${imports.length} Xendit import(s)? Sales Report matching will reset.`);
    if (!ok) return;
    setDeletingAll(true);
    try {
      const res = await fetch("/api/admin/xendit-import?all=1", { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setSavedPreviewId(null);
      setSavedPreviewRows([]);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingAll(false);
    }
  };

  const canPreview = Boolean(file) && !uploading && startDate && endDate;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6 lg:min-w-0">
        <div className="admin-card">
          <h1 className="admin-title">Xendit Transactions</h1>
          <p className="admin-muted mt-1">
            Upload Xendit balance history CSV. Only rows with <strong className="font-normal text-zinc-300">Line Type = TRANSACTION</strong>{" "}
            are saved. Matching uses the <strong className="font-normal text-zinc-300">Reference</strong> invoice number on Sales
            Report.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-zinc-200">Transaction date from</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="admin-input mt-2 w-full"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-zinc-200">Transaction date to</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="admin-input mt-2 w-full"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-semibold text-zinc-200">CSV file</label>
              <input
                type="file"
                accept=".csv,text/csv"
                disabled={uploading}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  clearStaging();
                  setImportNotice(null);
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
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {uploading && !token ? "Reading…" : "Preview"}
            </button>
          </div>

          {loadingList ? (
            <div className="mt-4 text-xs text-zinc-500">Loading saved imports…</div>
          ) : (
            <div className="mt-4 text-xs text-zinc-500">
              Merged TRANSACTION rows for Sales Report:{" "}
              <span className="font-semibold text-zinc-300">{mergedRowCount.toLocaleString()}</span>
            </div>
          )}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
          ) : null}
          {importNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              {importNotice}
            </div>
          ) : null}

          {previewMeta && token ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="text-sm font-semibold text-white">Preview (not saved yet)</div>
              <div className="mt-1 text-xs text-zinc-400">
                {previewMeta.filename} • {totalRows.toLocaleString()} TRANSACTION rows • {previewMeta.startDate} →{" "}
                {previewMeta.endDate}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void confirmSave()}
                  disabled={!token || uploading}
                  className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                >
                  {uploading && token ? "Saving…" : "Confirm & Save"}
                </button>
              </div>
              {previewRows.length > 0 ? (
                <XenditPreviewTable
                  rows={previewRows}
                  title="Sample rows (first 200)"
                  page={previewPage}
                  setPage={setPreviewPage}
                  pageSize={previewPageSize}
                  setPageSize={setPreviewPageSize}
                  fileTotalRows={totalRows}
                />
              ) : null}
            </div>
          ) : null}

          {savedPreviewId && savedPreviewRows.length > 0 ? (
            <div className="admin-card mt-6">
              <XenditPreviewTable
                rows={savedPreviewRows}
                title="Saved import rows"
                page={previewPage}
                setPage={setPreviewPage}
                pageSize={previewPageSize}
                setPageSize={setPreviewPageSize}
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold text-white">Saved imports</div>
        <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-zinc-300">
          <input
            type="checkbox"
            checked={manageImports}
            onChange={(e) => setManageImports(e.target.checked)}
            className="rounded border-white/20"
          />
          Manage
        </label>
        {manageImports ? (
          <button
            type="button"
            onClick={() => void deleteAllImports()}
            disabled={deletingAll || imports.length === 0}
            className="mt-3 w-full rounded-xl border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-100 disabled:opacity-60"
          >
            Delete all
          </button>
        ) : null}
        <div className="mt-4 space-y-2">
          {imports.length === 0 ? (
            <div className="text-sm text-zinc-400">No imports yet.</div>
          ) : (
            imports.map((i) => (
              <div
                key={i.id}
                role="button"
                tabIndex={0}
                onClick={() => void toggleSavedPreview(i.id)}
                className={`cursor-pointer rounded-2xl border p-3 ${
                  savedPreviewId === i.id ? "border-emerald-500/50" : "border-white/10"
                }`}
              >
                <div className="text-xs text-zinc-500">{new Date(i.importedAt).toLocaleString()}</div>
                <div className="mt-1 truncate text-sm font-bold text-white">{i.filename}</div>
                <div className="mt-1 text-xs text-zinc-400">
                  {i.startDate} → {i.endDate} • {i.rowCount.toLocaleString()} rows
                </div>
                {manageImports ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm("Delete this import?")) void deleteImport(i.id);
                    }}
                    className="mt-2 text-xs text-red-300 hover:underline"
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
