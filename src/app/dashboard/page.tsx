"use client";

import { useEffect, useMemo, useState } from "react";

type ApiResponse =
  | { error: string; details?: unknown }
  | { columns: string[]; rows: Array<Record<string, unknown>> };

export default function DashboardPage() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch("/api/data");
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setData({ error: (e as Error).message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const { columns, rows, error } = useMemo(() => {
    if (!data) return { columns: [], rows: [], error: "" };
    if ("error" in data) return { columns: [], rows: [], error: data.error };
    return { columns: data.columns, rows: data.rows, error: "" };
  }, [data]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-zinc-600">
            Raw rows loaded from <code className="rounded bg-white px-1">CSV_URL</code>
            .
          </p>
        </div>

        <div className="mt-6 rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div className="text-sm font-medium">Data</div>
            <div className="text-xs text-zinc-500">
              {loading ? "Loading…" : error ? "Error" : `${rows.length} rows`}
            </div>
          </div>

          {loading ? (
            <div className="p-4 text-sm text-zinc-600">Fetching CSV…</div>
          ) : error ? (
            <div className="p-4 text-sm">
              <div className="font-medium text-red-600">Failed to load data</div>
              <div className="mt-1 text-zinc-700">{error}</div>
              <div className="mt-3 text-xs text-zinc-500">
                Tip: set <code className="rounded bg-zinc-50 px-1">CSV_URL</code> in{" "}
                <code className="rounded bg-zinc-50 px-1">next-dashboard/.env.local</code>.
              </div>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No rows found.</div>
          ) : (
            <div className="max-w-full overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c}
                        className="whitespace-nowrap border-b border-zinc-200 px-3 py-2 text-left font-medium text-zinc-700"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="odd:bg-zinc-50/50">
                      {columns.map((c) => (
                        <td
                          key={c}
                          className="whitespace-nowrap border-b border-zinc-100 px-3 py-2 text-zinc-800"
                        >
                          {String(row[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

