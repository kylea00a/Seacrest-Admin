"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import InventoryDayPicker from "../_components/InventoryDayPicker";

type Row = {
  productName: string;
  deliveryIn: number;
  out: number;
  netPeriod: number;
};

type Entry = {
  id: string;
  productName: string;
  quantity: number;
  note?: string;
  at: string;
};

export default function InventoryPage() {
  const [pickDay, setPickDay] = useState<Date | undefined>(() => startOfDay(new Date()));

  const { startDate, endDate } = useMemo(() => {
    if (!pickDay) return { startDate: "", endDate: "" };
    const iso = format(pickDay, "yyyy-MM-dd");
    return { startDate: iso, endDate: iso };
  }, [pickDay]);

  const [rows, setRows] = useState<Row[]>([]);
  const [productNames, setProductNames] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rangeLabel, setRangeLabel] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ start: startDate, end: endDate });
      const res = await fetch(`/api/admin/inventory?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as {
        rows?: Row[];
        entries?: Entry[];
        productNames?: string[];
        start?: string;
        end?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setRows(json.rows ?? []);
      setEntries(json.entries ?? []);
      setProductNames(json.productNames ?? []);
      if (json.start && json.end) setRangeLabel({ start: json.start, end: json.end });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const setToday = () => {
    setPickDay(startOfDay(new Date()));
  };

  const submitSupply = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = Number(quantity);
    if (!productName.trim() || !Number.isFinite(q) || q <= 0) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: productName.trim(),
          quantity: q,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setQuantity("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const dayDescription = rangeLabel.start || (pickDay ? format(pickDay, "yyyy-MM-dd") : "");

  return (
    <div className="admin-card">
      <h1 className="admin-title">Inventory</h1>
      <p className="admin-muted mt-1 max-w-3xl">
        Pick <strong>one day</strong> (same calendar design as All Orders, but a single date) to see{" "}
        <strong>delivery in</strong> and <strong>out</strong> for that day. Use the arrows to move the calendar by{" "}
        <strong>two months</strong>. <strong>Out</strong> uses orders claimed on that effective date.
      </p>

      <div className="admin-card-inset mt-6 flex flex-wrap items-end gap-4">
        <div>
          <div className="text-xs font-semibold text-zinc-400">Date</div>
          <div className="mt-1">
            <InventoryDayPicker value={pickDay} onChange={setPickDay} />
          </div>
        </div>
        <button type="button" onClick={setToday} className="admin-btn-secondary px-3 py-2 text-xs">
          Today
        </button>
        <div className="text-xs text-zinc-500">
          Showing: <span className="font-semibold text-zinc-300">{dayDescription || "…"}</span>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? (
        <div className="admin-alert-error mt-4">{error}</div>
      ) : null}

      <form onSubmit={submitSupply} className="admin-card-inset mt-6">
        <div className="text-sm font-semibold text-zinc-200">Record delivery in</div>
        <p className="mt-1 text-xs text-zinc-500">
          Adds stock received (supplier delivery, etc.). It will appear in <strong>Delivery in</strong> for the date it was saved.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Product</div>
            <select
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="admin-select mt-1 min-w-[12rem]"
              required
            >
              <option value="">Select…</option>
              {productNames.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400">Quantity</div>
            <input
              type="number"
              min={0.01}
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="admin-input mt-1 w-28"
              placeholder="0"
              required
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <div className="text-xs font-semibold text-zinc-400">Note (optional)</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="admin-input mt-1 w-full max-w-md"
              placeholder="Supplier, batch…"
            />
          </div>
          <button type="submit" disabled={saving} className="admin-btn-primary">
            {saving ? "Saving…" : "Add delivery in"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <div className="text-sm font-semibold text-zinc-200">Product flow ({dayDescription || "—"})</div>
        <div className="admin-table-wrap mt-2">
          <table className="min-w-full text-xs">
            <thead className="bg-black/30 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Delivery in</th>
                <th className="px-3 py-2 text-right">Out (claimed)</th>
                <th className="px-3 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500" colSpan={4}>
                    No products in settings yet, or no movement on this day.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.productName} className="bg-black/10 text-zinc-100">
                    <td className="px-3 py-2">{r.productName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">{r.deliveryIn}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-300/90">{r.out}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        r.netPeriod < 0 ? "text-amber-400" : r.netPeriod > 0 ? "text-emerald-400/90" : "text-zinc-400"
                      }`}
                    >
                      {r.netPeriod}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6">
        <div className="text-sm font-semibold text-zinc-200">
          Delivery in ledger ({dayDescription || "—"})
        </div>
        <p className="mt-1 text-xs text-zinc-500">Stock entries saved on the selected day (by date).</p>
        <div className="admin-table-wrap mt-2 max-h-80 overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-black/40 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {entries.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={4}>
                    No delivery in entries on this day.
                  </td>
                </tr>
              ) : (
                entries.map((e) => (
                  <tr key={e.id} className="bg-black/10 text-zinc-100">
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-400">
                      {new Date(e.at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">{e.productName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.quantity}</td>
                    <td className="px-3 py-2 text-zinc-400">{e.note ?? "—"}</td>
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
