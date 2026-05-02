"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JntImportIndexEntry, JntImportRow } from "@/data/admin/types";

type ApiListResponse = {
  rows: JntImportRow[];
  imports: JntImportIndexEntry[];
  importedAt: string;
  filename: string;
  error?: string;
};

const PREVIEW_PAGE_SIZES = [10, 25, 50] as const;

function JntPreviewTable({
  rows,
  title,
  page,
  setPage,
  pageSize,
  setPageSize,
  fileTotalRows,
}: {
  rows: JntImportRow[];
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
              <th className="px-3 py-2 text-left">Waybill</th>
              <th className="px-3 py-2 text-left">Receiver</th>
              <th className="px-3 py-2 text-left">Ship / pickup date</th>
              <th className="px-3 py-2 text-left">Order #</th>
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((r) => (
              <tr key={r.id} className="border-t border-white/[0.06] text-zinc-200">
                <td className="px-3 py-2 font-mono text-[11px]">{r.waybillNumber || "—"}</td>
                <td className="max-w-[200px] truncate px-3 py-2">{r.receiver || "—"}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{r.shipDateYmd || "—"}</td>
                <td className="px-3 py-2 font-mono text-[11px]">{r.orderNumber ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function JntImportPage() {
  const [imports, setImports] = useState<JntImportIndexEntry[]>([]);
  const [mergedRowCount, setMergedRowCount] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [token, setToken] = useState("");
  const [previewRows, setPreviewRows] = useState<JntImportRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [previewMeta, setPreviewMeta] = useState<{ filename: string; importedAt: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);

  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState<(typeof PREVIEW_PAGE_SIZES)[number]>(25);

  const [savedPreviewId, setSavedPreviewId] = useState<string | null>(null);
  const [savedPreviewRows, setSavedPreviewRows] = useState<JntImportRow[]>([]);
  const [loadingSavedId, setLoadingSavedId] = useState<string | null>(null);
  const [savedPreviewError, setSavedPreviewError] = useState<string | null>(null);
  const [savedPreviewPage, setSavedPreviewPage] = useState(1);
  const [savedPreviewPageSize, setSavedPreviewPageSize] = useState<(typeof PREVIEW_PAGE_SIZES)[number]>(25);

  const [manageImports, setManageImports] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  const savedFetchAbort = useRef<AbortController | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/jnt-import", { cache: "no-store" });
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
      const res = await fetch("/api/admin/jnt-import/preview", { method: "POST", body: fd });
      const json = (await res.json()) as {
        token?: string;
        previewRows?: JntImportRow[];
        totalRows?: number;
        filename?: string;
        importedAt?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setToken(json.token ?? "");
      setPreviewRows(json.previewRows ?? []);
      setTotalRows(json.totalRows ?? 0);
      setPreviewMeta(
        json.filename && json.importedAt
          ? { filename: json.filename, importedAt: json.importedAt }
          : null,
      );
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
    try {
      const res = await fetch("/api/admin/jnt-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as { ok?: boolean; rowCount?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setImportNotice(`Saved ${json.rowCount ?? 0} row(s) to J&T import history.`);
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
    if (savedPreviewId === id && !loadingSavedId) {
      setSavedPreviewId(null);
      setSavedPreviewRows([]);
      setSavedPreviewError(null);
      return;
    }
    setSavedPreviewError(null);
    setSavedPreviewId(id);
    setSavedPreviewRows([]);
    savedFetchAbort.current?.abort();
    const ac = new AbortController();
    savedFetchAbort.current = ac;
    setLoadingSavedId(id);
    try {
      const res = await fetch(`/api/admin/jnt-import?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      const json = (await res.json()) as { file?: { rows?: JntImportRow[] }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setSavedPreviewRows(json.file?.rows ?? []);
      setSavedPreviewPage(1);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setSavedPreviewError(e instanceof Error ? e.message : String(e));
      setSavedPreviewRows([]);
    } finally {
      if (savedFetchAbort.current === ac) {
        savedFetchAbort.current = null;
        setLoadingSavedId(null);
      }
    }
  };

  const deleteImport = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/jnt-import?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      if (savedPreviewId === id) {
        setSavedPreviewId(null);
        setSavedPreviewRows([]);
        setSavedPreviewError(null);
      }
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  const deleteAllImports = async () => {
    if (imports.length === 0) return;
    const ok = window.confirm(
      `Delete all ${imports.length} J&T import(s)? Delivery matching will use no waybill data until you import again.`,
    );
    if (!ok) return;
    setDeletingAll(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/jnt-import?all=1", { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setSavedPreviewId(null);
      setSavedPreviewRows([]);
      setSavedPreviewError(null);
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingAll(false);
    }
  };

  const canPreview = Boolean(file) && !uploading;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6 lg:min-w-0">
        <div className="admin-card">
          <h1 className="admin-title">J&amp;T Import</h1>
          <p className="admin-muted mt-1">
            Upload the J&amp;T portal Excel export. You&apos;ll preview rows before confirming. Waybill numbers are
            matched on Delivery by{" "}
            <span className="text-zinc-300">receiver name</span> and{" "}
            <span className="text-zinc-300">submission / pickup date</span> within your selected date range.
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
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60"
            >
              {uploading && !token ? "Reading…" : "Preview"}
            </button>
            <div className="text-xs text-zinc-400">Not saved until you confirm.</div>
          </div>

          {loadingList ? (
            <div className="mt-4 text-xs text-zinc-500">Loading saved imports…</div>
          ) : (
            <div className="mt-4 text-xs text-zinc-500">
              Merged rows for Delivery:{" "}
              <span className="font-semibold text-zinc-300">{mergedRowCount.toLocaleString()}</span>
            </div>
          )}

          {error ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {importNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
              {importNotice}
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
                <div className="text-xs text-zinc-400">Adds this file as a new import; rows merge for Delivery.</div>
              </div>

              {previewRows.length > 0 ? (
                <JntPreviewTable
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

        {savedPreviewId || loadingSavedId || savedPreviewError ? (
          <div className="admin-card">
            <div className="text-sm font-semibold text-white">Saved import preview</div>
            <div className="mt-1 text-xs text-zinc-400">
              Click an import on the right to load rows. Click again to close.
            </div>
            {savedPreviewId ? (
              <div className="mt-2 text-xs text-zinc-300">
                <span className="truncate">
                  {imports.find((x) => x.id === savedPreviewId)?.filename ?? "—"}
                </span>
              </div>
            ) : null}
            {loadingSavedId ? <div className="mt-4 text-sm text-zinc-400">Loading rows…</div> : null}
            {savedPreviewError ? (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                {savedPreviewError}
              </div>
            ) : null}
            {!loadingSavedId && savedPreviewId && !savedPreviewError && savedPreviewRows.length === 0 ? (
              <div className="mt-4 text-sm text-zinc-400">No rows in this import.</div>
            ) : null}
            {savedPreviewRows.length > 0 ? (
              <JntPreviewTable
                rows={savedPreviewRows}
                title="Stored rows"
                page={savedPreviewPage}
                setPage={setSavedPreviewPage}
                pageSize={savedPreviewPageSize}
                setPageSize={setSavedPreviewPageSize}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold text-white">Saved imports</div>
        <div className="mt-1 text-xs text-zinc-400">Latest first · click to preview rows</div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            Manage mode lets you delete a single import or all imports.
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <input
              type="checkbox"
              checked={manageImports}
              onChange={(e) => setManageImports(e.target.checked)}
              className="rounded border-white/20 bg-black/30"
            />
            Manage
          </label>
        </div>

        {manageImports ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
            <button
              type="button"
              onClick={() => void deleteAllImports()}
              disabled={deletingAll || imports.length === 0}
              className="rounded-xl border border-red-500/50 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-950/70 disabled:opacity-60"
            >
              {deletingAll ? "Deleting…" : "Delete all imports"}
            </button>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {imports.length === 0 ? (
            <div className="text-sm text-zinc-300">No imports yet.</div>
          ) : (
            imports.map((i) => (
              <div
                key={i.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void toggleSavedPreview(i.id);
                  }
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  void toggleSavedPreview(i.id);
                }}
                className={`rounded-2xl border bg-black/20 p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                  savedPreviewId === i.id
                    ? "border-emerald-500/50 ring-2 ring-emerald-500/20"
                    : "border-white/10 hover:border-white/20"
                } ${loadingSavedId === i.id ? "opacity-80" : ""} cursor-pointer`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-zinc-500">{new Date(i.importedAt).toLocaleString()}</div>
                    <div className="mt-1 truncate text-sm font-bold text-white">{i.filename}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="text-xs text-zinc-400">
                      {loadingSavedId === i.id ? "Loading…" : `${i.rowCount.toLocaleString()} rows`}
                    </div>
                    {manageImports ? (
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(`Delete this import (${i.filename})?`);
                          if (ok) void deleteImport(i.id);
                        }}
                        disabled={deletingId === i.id}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                      >
                        {deletingId === i.id ? "Deleting…" : "Delete"}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
