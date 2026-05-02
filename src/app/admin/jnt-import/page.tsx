"use client";

import { useEffect, useState } from "react";
import type { JntImportFile } from "@/data/admin/types";

export default function JntImportPage() {
  const [data, setData] = useState<JntImportFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/jnt-import", { cache: "no-store" });
      const json = (await res.json()) as JntImportFile & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const upload = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/admin/jnt-import", { method: "POST", body: fd });
      const json = (await res.json()) as { ok?: boolean; error?: string; rowCount?: number };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="admin-card max-w-xl">
      <h1 className="admin-title">J&amp;T Import</h1>
      <p className="admin-muted mt-1">
        Upload the J&amp;T portal Excel export. Waybill numbers are matched to Delivery rows by{" "}
        <span className="text-zinc-300">receiver name</span> and <span className="text-zinc-300">submission / pickup date</span>{" "}
        within your selected date range.
      </p>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}

      <div className="mt-6">
        <label className="text-sm font-semibold text-zinc-200">Excel file</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          disabled={uploading}
          onChange={(e) => void upload(e.target.files?.[0] ?? null)}
          className="mt-2 block w-full text-sm text-zinc-200 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-500 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-emerald-950 hover:file:bg-emerald-400"
        />
        {uploading ? <div className="mt-2 text-xs text-zinc-400">Uploading…</div> : null}
      </div>

      {data?.importedAt ? (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-zinc-300">
          <div>
            <span className="font-semibold text-zinc-200">Last import:</span>{" "}
            {new Date(data.importedAt).toLocaleString()}
          </div>
          <div className="mt-1">
            <span className="font-semibold text-zinc-200">File:</span> {data.filename || "—"}
          </div>
          <div className="mt-1">
            <span className="font-semibold text-zinc-200">Rows:</span> {data.rows?.length ?? 0}
          </div>
        </div>
      ) : null}
    </div>
  );
}
