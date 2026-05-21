"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";

async function safeReadJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 140).replace(/\s+/g, " ").trim();
    throw new Error(`Bad response (${res.status}). Expected JSON but got: ${snippet || "(empty)"}`);
  }
}

type FlowRow = {
  date: string;
  beginning?: Record<string, number>;
  delivery?: Record<string, number>;
  rtsIn?: Record<string, number>;
  adjustment?: Record<string, number>;
  out?: Record<string, number>;
  ending?: Record<string, number>;
  missing?: boolean;
};

const SECTIONS = [
  { key: "beginning", label: "BEGINNING INVENTORY", bg: "bg-sky-950/50" },
  { key: "delivery", label: "DELIVERY", bg: "bg-emerald-950/40" },
  { key: "rtsIn", label: "RTS IN", bg: "bg-violet-950/40" },
  { key: "adjustment", label: "ADJUSTMENT", bg: "bg-amber-950/40" },
  { key: "out", label: "OUT", bg: "bg-rose-950/40" },
] as const;

export default function InventoryFlowPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [productNames, setProductNames] = useState<string[]>([]);
  const [rows, setRows] = useState<FlowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const start = format(startOfMonth(month), "yyyy-MM-dd");
    const end = format(endOfMonth(month), "yyyy-MM-dd");
    return { start, end, label: format(month, "MMMM yyyy") };
  }, [month]);

  const load = useCallback(
    async (refresh: boolean) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          start: range.start,
          end: range.end,
          ...(refresh ? { refresh: "1" } : {}),
        });
        const res = await fetch(`/api/admin/inventory-flow?${qs.toString()}`, { cache: "no-store" });
        const json = await safeReadJson<{
          productNames?: string[];
          rows?: FlowRow[];
          error?: string;
        }>(res);
        if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
        setProductNames(json.productNames ?? []);
        setRows(json.rows ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range.start, range.end],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const cell = (row: FlowRow, section: (typeof SECTIONS)[number]["key"], product: string) => {
    if (row.missing) return "—";
    const map =
      section === "beginning"
        ? row.beginning
        : section === "delivery"
          ? row.delivery
          : section === "rtsIn"
            ? row.rtsIn
            : section === "adjustment"
              ? row.adjustment
              : row.out;
    const v = map?.[product];
    if (v == null || v === 0) return "";
    return v;
  };

  return (
    <div className="admin-card">
      <h1 className="admin-title">Inventory Flow</h1>
      <p className="admin-muted mt-1 max-w-3xl">
        Daily product flow: <strong>Beginning</strong> = yesterday&apos;s <strong>Ending</strong>;{" "}
        <strong>Ending</strong> = Beginning + Delivery + RTS IN + Adjustment − OUT. Beginning uses yesterday&apos;s{" "}
        <strong>encoded</strong> ending when available. Inventory reads this table for instant loads.
        Use <strong>Refresh month</strong> after bulk order/claim changes to recompute OUT from orders.
      </p>

      <div className="admin-card-inset mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="admin-btn-secondary px-3 py-2 text-xs"
          onClick={() => setMonth((m) => subMonths(m, 1))}
        >
          ← Prev month
        </button>
        <span className="text-sm font-semibold text-zinc-200">{range.label}</span>
        <button
          type="button"
          className="admin-btn-secondary px-3 py-2 text-xs"
          onClick={() => setMonth((m) => addMonths(m, 1))}
        >
          Next month →
        </button>
        <button
          type="button"
          className="admin-btn-secondary px-3 py-2 text-xs"
          onClick={() => setMonth(startOfMonth(new Date()))}
        >
          This month
        </button>
        <button
          type="button"
          disabled={refreshing}
          className="admin-btn-primary px-3 py-2 text-xs"
          onClick={() => void load(true)}
        >
          {refreshing ? "Refreshing…" : "Refresh month"}
        </button>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}

      {!loading && productNames.length > 0 ? (
        <div className="admin-table-wrap mt-6 max-h-[70vh] overflow-auto">
          <table className="min-w-max border-collapse text-[11px]">
            <thead className="sticky top-0 z-20">
              <tr>
                <th
                  rowSpan={2}
                  className="sticky left-0 z-30 border border-white/10 bg-zinc-900 px-2 py-1 text-left font-semibold text-zinc-300"
                >
                  Date
                </th>
                {SECTIONS.map((sec) => (
                  <th
                    key={sec.key}
                    colSpan={productNames.length}
                    className={`border border-white/10 px-1 py-1 text-center font-bold tracking-wide text-zinc-100 ${sec.bg}`}
                  >
                    {sec.label}
                  </th>
                ))}
              </tr>
              <tr>
                {SECTIONS.map((sec) =>
                  productNames.map((p) => (
                    <th
                      key={`${sec.key}-${p}`}
                      className={`whitespace-nowrap border border-white/10 px-1.5 py-1 text-center font-medium text-zinc-400 ${sec.bg}`}
                    >
                      {p}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date} className={row.missing ? "bg-amber-950/20" : "bg-black/10"}>
                  <td className="sticky left-0 z-10 border border-white/10 bg-zinc-900/95 px-2 py-1 font-medium text-zinc-200">
                    {format(new Date(`${row.date}T12:00:00Z`), "MMM d, yyyy")}
                  </td>
                  {SECTIONS.map((sec) =>
                    productNames.map((p) => (
                      <td
                        key={`${row.date}-${sec.key}-${p}`}
                        className={`border border-white/10 px-1.5 py-1 text-right tabular-nums text-zinc-100 ${sec.bg}/30`}
                      >
                        {cell(row, sec.key, p)}
                      </td>
                    )),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && productNames.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">Add products under Packages &amp; Products first.</p>
      ) : null}
    </div>
  );
}
