"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import { isNonPickupDelivery, isPickupDelivery } from "@/data/admin/orderClaim";
import InventoryDayPicker from "../_components/InventoryDayPicker";
import { useAdminSession } from "../AdminSessionContext";

async function safeReadJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 140).replace(/\s+/g, " ").trim();
    throw new Error(`Bad response (${res.status}). Expected JSON but got: ${snippet || "(empty)"}`);
  }
}

type Row = {
  productName: string;
  deliveryIn: number;
  rtsIn: number;
  adjustment: number;
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

type OutOrderDetail = {
  invoiceNumber: string;
  effectiveDate: string;
  sourceDate: string;
  distributorName: string;
  shippingFullName: string;
  deliveryMethod: string;
  lines: Array<{
    kind: "package" | "subscription" | "repurchase";
    productName: string;
    qty: number;
  }>;
};

type EndingSnapshot = {
  date: string;
  encodedAt: string;
  encodedBy?: string;
  locked: boolean;
  counts: Record<string, number>;
};

export default function InventoryPage() {
  const { can } = useAdminSession();
  const canEditDeliveryLedger = can("inventoryDeliveryLedger");

  const [pickDay, setPickDay] = useState<Date | undefined>(() => startOfDay(new Date()));

  const { startDate, endDate } = useMemo(() => {
    if (!pickDay) return { startDate: "", endDate: "" };
    const iso = format(pickDay, "yyyy-MM-dd");
    return { startDate: iso, endDate: iso };
  }, [pickDay]);

  const [rows, setRows] = useState<Row[]>([]);
  const [productNames, setProductNames] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ending, setEnding] = useState<EndingSnapshot | null>(null);
  const [canEditEncodedEnding, setCanEditEncodedEnding] = useState(false);
  const [expectedEndingBy, setExpectedEndingBy] = useState<Record<string, number>>({});
  const [discrepancyBy, setDiscrepancyBy] = useState<Record<string, number>>({});
  const [beginningBy, setBeginningBy] = useState<Record<string, number>>({});
  const [beginningSourceNote, setBeginningSourceNote] = useState<string>("");
  const [endingDraft, setEndingDraft] = useState<Record<string, string>>({});
  const [savingEnding, setSavingEnding] = useState(false);
  const [rangeLabel, setRangeLabel] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [loading, setLoading] = useState(true);
  const [loadingOutDetails, setLoadingOutDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editProduct, setEditProduct] = useState("");
  const [editQuantity, setEditQuantity] = useState("");
  const [editNote, setEditNote] = useState("");
  const [savingLedgerEdit, setSavingLedgerEdit] = useState(false);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [outDetails, setOutDetails] = useState<OutOrderDetail[]>([]);
  const [outByOrderDeliveryFilter, setOutByOrderDeliveryFilter] = useState<"All" | "Pickup" | "Delivery">("All");
  const [adjustmentEntries, setAdjustmentEntries] = useState<Entry[]>([]);
  const [adjProduct, setAdjProduct] = useState("");
  const [adjQuantity, setAdjQuantity] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [dayTotals, setDayTotals] = useState<{
    deliveryIn: number;
    rtsIn: number;
    adjustment: number;
    out: number;
  } | null>(null);

  const loadOutDetails = useCallback(async (start: string, end: string) => {
    setLoadingOutDetails(true);
    try {
      const qs = new URLSearchParams({ start, end, details: "1" });
      const res = await fetch(`/api/admin/inventory?${qs.toString()}`, { cache: "no-store" });
      const json = await safeReadJson<{ outDetails?: OutOrderDetail[]; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setOutDetails(json.outDetails ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingOutDetails(false);
    }
  }, []);

  useEffect(() => {
    setEditingEntryId(null);
    setEditProduct("");
    setEditQuantity("");
    setEditNote("");
  }, [startDate, endDate]);

  const load = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setOutDetails([]);
    setError(null);
    try {
      const qs = new URLSearchParams({ start: startDate, end: endDate });
      const res = await fetch(`/api/admin/inventory?${qs.toString()}`, { cache: "no-store" });
      const json = await safeReadJson<{
        rows?: Row[];
        entries?: Entry[];
        totals?: { deliveryIn: number; rtsIn: number; adjustment: number; out: number };
        adjustmentEntries?: Entry[];
        productNames?: string[];
        beginningBy?: Record<string, number>;
        beginningSourceNote?: string;
        ending?: EndingSnapshot | null;
        canEditEncodedEnding?: boolean;
        expectedEndingBy?: Record<string, number>;
        discrepancyBy?: Record<string, number>;
        start?: string;
        end?: string;
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setRows(json.rows ?? []);
        setEntries(json.entries ?? []);
        setAdjustmentEntries(json.adjustmentEntries ?? []);
        setDayTotals(json.totals ?? null);
      setProductNames(json.productNames ?? []);
      setEnding((json.ending ?? null) as EndingSnapshot | null);
      setCanEditEncodedEnding(Boolean(json.canEditEncodedEnding));
      setBeginningBy((json.beginningBy ?? {}) as Record<string, number>);
      setBeginningSourceNote(json.beginningSourceNote ?? "");
      setExpectedEndingBy((json.expectedEndingBy ?? {}) as Record<string, number>);
      setDiscrepancyBy((json.discrepancyBy ?? {}) as Record<string, number>);
      const nextDraft: Record<string, string> = {};
      for (const p of json.productNames ?? []) {
        const v = (json.ending as EndingSnapshot | null)?.counts?.[p];
        nextDraft[p] = v != null ? String(v) : "";
      }
      setEndingDraft(nextDraft);
      if (json.start && json.end) setRangeLabel({ start: json.start, end: json.end });
      void loadOutDetails(startDate, endDate);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, loadOutDetails]);

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
          action: "addDeliveryIn",
          date: startDate,
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

  const startEditEntry = (e: Entry) => {
    setEditingEntryId(e.id);
    setEditProduct(e.productName);
    setEditQuantity(String(e.quantity));
    setEditNote(e.note ?? "");
    setError(null);
  };

  const cancelEditEntry = () => {
    setEditingEntryId(null);
    setEditProduct("");
    setEditQuantity("");
    setEditNote("");
  };

  const saveLedgerEntry = async () => {
    if (!editingEntryId) return;
    const q = Number(editQuantity);
    if (!editProduct.trim() || !Number.isFinite(q) || q <= 0) {
      setError("Choose a product and enter a positive quantity.");
      return;
    }
    setSavingLedgerEdit(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntryId,
          productName: editProduct.trim(),
          quantity: q,
          note: editNote.trim() ? editNote.trim() : null,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      cancelEditEntry();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingLedgerEdit(false);
    }
  };

  const deleteLedgerEntry = async (id: string) => {
    if (!window.confirm("Delete this delivery-in ledger row? Inventory flow will be recalculated for this day.")) {
      return;
    }
    setDeletingEntryId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/inventory?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      if (editingEntryId === id) cancelEditEntry();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingEntryId(null);
    }
  };

  const submitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!startDate) return;
    const q = Number(adjQuantity);
    if (!adjProduct.trim() || !Number.isFinite(q) || q === 0) return;
    setSavingAdjustment(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addAdjustment",
          date: startDate,
          productName: adjProduct.trim(),
          quantity: q,
          ...(adjNote.trim() ? { note: adjNote.trim() } : {}),
        }),
      });
      const json = await safeReadJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setAdjQuantity("");
      setAdjNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingAdjustment(false);
    }
  };

  const dayDescription = rangeLabel.start || (pickDay ? format(pickDay, "yyyy-MM-dd") : "");
  const hasDiscrepancy = Object.keys(discrepancyBy).length > 0;

  const lineKindLabel = (k: OutOrderDetail["lines"][0]["kind"]) =>
    k === "package" ? "Package" : k === "subscription" ? "Subscription" : "Repurchase";

  const deliveryMethodLabel = (dm: string) => (isPickupDelivery(dm) ? "Pick up" : "Delivery");

  const filteredOutDetails = useMemo(() => {
    if (outByOrderDeliveryFilter === "All") return outDetails;
    return outDetails.filter((o) => {
      const dm = o.deliveryMethod ?? "";
      return outByOrderDeliveryFilter === "Pickup" ? isPickupDelivery(dm) : isNonPickupDelivery(dm);
    });
  }, [outDetails, outByOrderDeliveryFilter]);

  const saveEnding = async () => {
    if (!dayDescription || !/^\d{4}-\d{2}-\d{2}$/.test(dayDescription)) return;
    setSavingEnding(true);
    setError(null);
    try {
      const counts: Record<string, number> = {};
      for (const p of productNames) {
        const n = Number((endingDraft[p] ?? "").trim());
        counts[p] = Number.isFinite(n) && n >= 0 ? n : 0;
      }
      const res = await fetch("/api/admin/inventory", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dayDescription, counts }),
      });
      const json = (await res.json()) as { ok?: boolean; ending?: EndingSnapshot; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setEnding((json.ending ?? null) as EndingSnapshot | null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEnding(false);
    }
  };

  return (
    <div className="admin-card">
      <h1 className="admin-title">Inventory</h1>
      <p className="admin-muted mt-1 max-w-3xl">
        Pick <strong>one day</strong> (same calendar design as All Orders, but a single date) to see{" "}
        <strong>delivery in</strong>, <strong>adjustments</strong>, <strong>RTS in</strong>, and <strong>out</strong> for
        that day (from{" "}
        <a href="/admin/inventory-flow" className="text-sky-400 hover:underline">
          Inventory Flow
        </a>
        ). Use the arrows to move the calendar by{" "}
        <strong>two months</strong>. <strong>Beginning</strong> uses yesterday&apos;s <strong>encoded</strong> ending when
        you have locked it. <strong>Out</strong> uses orders claimed on that effective date.
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

      <form onSubmit={submitAdjustment} className="admin-card-inset mt-6">
        <div className="text-sm font-semibold text-zinc-200">Record adjustment</div>
        <p className="mt-1 text-xs text-zinc-500">
          Physical count correction for <strong>{dayDescription || "selected day"}</strong>. Use a{" "}
          <strong>negative</strong> quantity for shortage (e.g. −5 if 5 pieces short).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Product</div>
            <select
              value={adjProduct}
              onChange={(e) => setAdjProduct(e.target.value)}
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
              step="any"
              value={adjQuantity}
              onChange={(e) => setAdjQuantity(e.target.value)}
              className="admin-input mt-1 w-28"
              placeholder="e.g. -3"
              required
            />
          </div>
          <div className="min-w-[12rem] flex-1">
            <div className="text-xs font-semibold text-zinc-400">Note (optional)</div>
            <input
              value={adjNote}
              onChange={(e) => setAdjNote(e.target.value)}
              className="admin-input mt-1 w-full max-w-md"
              placeholder="Count variance, damage…"
            />
          </div>
          <button type="submit" disabled={savingAdjustment || !startDate} className="admin-btn-primary">
            {savingAdjustment ? "Saving…" : "Add adjustment"}
          </button>
        </div>
        {adjustmentEntries.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs text-zinc-400">
            {adjustmentEntries.map((e) => (
              <li key={e.id}>
                {e.productName}:{" "}
                <span className={e.quantity < 0 ? "text-amber-400" : "text-emerald-300/90"}>
                  {e.quantity > 0 ? "+" : ""}
                  {e.quantity}
                </span>
                {e.note ? ` — ${e.note}` : ""}
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {dayTotals && dayDescription ? (
        <div className="admin-card-inset mt-6">
          <div className="text-sm font-semibold text-zinc-200">Day totals ({dayDescription})</div>
          <p className="mt-1 text-xs text-zinc-500">
            Aggregates for the selected filter date: stock received (delivery in) vs. inventory out from claimed orders
            (effective date).
          </p>
          <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-zinc-500">Delivery in</span>{" "}
              <span className="font-semibold tabular-nums text-emerald-300/90">{dayTotals.deliveryIn}</span>
            </div>
            <div>
              <span className="text-zinc-500">RTS in</span>{" "}
              <span className="font-semibold tabular-nums text-violet-300/90">{dayTotals.rtsIn ?? 0}</span>
            </div>
            <div>
              <span className="text-zinc-500">Adjustment</span>{" "}
              <span
                className={`font-semibold tabular-nums ${
                  (dayTotals.adjustment ?? 0) < 0 ? "text-amber-400" : (dayTotals.adjustment ?? 0) > 0 ? "text-emerald-300/90" : "text-zinc-300"
                }`}
              >
                {dayTotals.adjustment ?? 0}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Out (claimed)</span>{" "}
              <span className="font-semibold tabular-nums text-rose-300/90">{dayTotals.out}</span>
            </div>
            <div>
              <span className="text-zinc-500">Net</span>{" "}
              <span
                className={`font-semibold tabular-nums ${
                  dayTotals.deliveryIn + (dayTotals.rtsIn ?? 0) + (dayTotals.adjustment ?? 0) - dayTotals.out < 0
                    ? "text-amber-400"
                    : dayTotals.deliveryIn + (dayTotals.rtsIn ?? 0) + (dayTotals.adjustment ?? 0) - dayTotals.out > 0
                      ? "text-emerald-400/90"
                      : "text-zinc-300"
                }`}
              >
                {dayTotals.deliveryIn + (dayTotals.rtsIn ?? 0) + (dayTotals.adjustment ?? 0) - dayTotals.out}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-sm font-semibold text-zinc-200">Product flow ({dayDescription || "—"})</div>
        {beginningSourceNote ? (
          <p className="mt-1 text-xs text-zinc-500">Beginning: {beginningSourceNote}</p>
        ) : null}
        <div className="admin-table-wrap mt-2">
          <table className="min-w-full text-xs">
            <thead className="bg-black/30 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Beginning</th>
                <th className="px-3 py-2 text-right">Delivery in</th>
                <th className="px-3 py-2 text-right">RTS in</th>
                <th className="px-3 py-2 text-right">Adjustment</th>
                <th className="px-3 py-2 text-right">Out (claimed)</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Ending (encode)</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Expected</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Discrepancy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500" colSpan={10}>
                    No products in settings yet, or no movement on this day.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.productName} className="bg-black/10 text-zinc-100">
                    <td className="px-3 py-2">{r.productName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                      {beginningBy[r.productName] != null ? beginningBy[r.productName] : 0}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">{r.deliveryIn}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-violet-300/90">{r.rtsIn ?? 0}</td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        r.adjustment < 0 ? "text-amber-400" : r.adjustment > 0 ? "text-emerald-300/90" : "text-zinc-500"
                      }`}
                    >
                      {r.adjustment !== 0 ? r.adjustment : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-300/90">{r.out}</td>
                    <td
                      className={`px-3 py-2 text-right font-medium tabular-nums ${
                        r.netPeriod < 0 ? "text-amber-400" : r.netPeriod > 0 ? "text-emerald-400/90" : "text-zinc-400"
                      }`}
                    >
                      {r.netPeriod}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={endingDraft[r.productName] ?? ""}
                        onChange={(e) =>
                          setEndingDraft((prev) => ({ ...prev, [r.productName]: e.target.value }))
                        }
                        disabled={!canEditEncodedEnding}
                        className="admin-input w-24 text-right tabular-nums disabled:opacity-60"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                      {expectedEndingBy[r.productName] != null ? expectedEndingBy[r.productName] : "—"}
                    </td>
                    <td
                      className={[
                        "px-3 py-2 text-right tabular-nums font-semibold",
                        discrepancyBy[r.productName]
                          ? "text-rose-300"
                          : ending?.counts?.[r.productName] != null
                            ? "text-emerald-300/90"
                            : "text-zinc-500",
                      ].join(" ")}
                    >
                      {discrepancyBy[r.productName] != null ? discrepancyBy[r.productName] : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            {ending?.locked ? (
              <>
                Encoded: <span className="font-semibold text-zinc-200">{new Date(ending.encodedAt).toLocaleString()}</span>
                {ending.encodedBy ? (
                  <>
                    {" "}
                    by <span className="font-semibold text-zinc-200">{ending.encodedBy}</span>
                  </>
                ) : null}
                {hasDiscrepancy ? (
                  <>
                    {" "}
                    • <span className="font-semibold text-rose-300">Discrepancy detected</span>
                  </>
                ) : (
                  <>
                    {" "}
                    • <span className="font-semibold text-emerald-300/90">No discrepancy</span>
                  </>
                )}
              </>
            ) : (
              <span>Enter ending inventory and click Encode to lock it.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void saveEnding()}
            disabled={savingEnding || !dayDescription}
            className="admin-btn-primary"
            title={
              ending?.locked && !canEditEncodedEnding
                ? "Already encoded (locked)."
                : ending?.locked && canEditEncodedEnding
                  ? "Superadmin override enabled: save updates to encoded ending inventory."
                  : "Save ending inventory and lock this day."
            }
          >
            {savingEnding ? "Saving…" : ending?.locked ? (canEditEncodedEnding ? "Save changes" : "Encoded") : "Encode ending"}
          </button>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-zinc-200">Out — by order ({dayDescription || "—"})</div>
            <p className="mt-1 text-xs text-zinc-500">
              Each row is a claimed order with effective date on this day. Line types: package, subscription, or repurchase.
              {loadingOutDetails ? " Loading order breakdown…" : null}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400">Delivery method</div>
            <select
              value={outByOrderDeliveryFilter}
              onChange={(e) => setOutByOrderDeliveryFilter(e.target.value as "All" | "Pickup" | "Delivery")}
              className="admin-select mt-1 min-w-[10rem]"
            >
              <option value="All">All</option>
              <option value="Pickup">Pick up</option>
              <option value="Delivery">Delivery</option>
            </select>
          </div>
        </div>
        <div className="admin-table-wrap mt-2 max-h-96 overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-black/40 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left">Invoice</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Effective</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Source day</th>
                <th className="px-3 py-2 text-left">Distributor</th>
                <th className="px-3 py-2 text-left">Shipping full name</th>
                <th className="px-3 py-2 text-left">Lines</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Delivery method</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loadingOutDetails && outDetails.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={7}>
                    Loading claimed orders…
                  </td>
                </tr>
              ) : filteredOutDetails.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={7}>
                    {outDetails.length === 0
                      ? "No claimed out orders for this effective date."
                      : "No orders match the delivery method filter."}
                  </td>
                </tr>
              ) : (
                filteredOutDetails.map((o) => (
                  <tr key={`${o.invoiceNumber}-${o.effectiveDate}`} className="align-top bg-black/10 text-zinc-100">
                    <td className="px-3 py-2 font-medium">{o.invoiceNumber}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-400">{o.effectiveDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-zinc-400">{o.sourceDate}</td>
                    <td className="px-3 py-2">{o.distributorName}</td>
                    <td className="max-w-[14rem] px-3 py-2 text-zinc-200">{o.shippingFullName}</td>
                    <td className="px-3 py-2">
                      <ul className="list-inside list-disc space-y-0.5 text-zinc-300">
                        {o.lines.map((ln, i) => (
                          <li key={`${ln.kind}-${ln.productName}-${i}`}>
                            <span className="text-zinc-500">[{lineKindLabel(ln.kind)}]</span> {ln.productName}{" "}
                            <span className="tabular-nums text-rose-300/90">×{ln.qty}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-zinc-200">{deliveryMethodLabel(o.deliveryMethod)}</td>
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
        <p className="mt-1 text-xs text-zinc-500">
          Stock entries saved on the selected day (by date).
          {canEditDeliveryLedger ? (
            <span className="text-zinc-400">
              {" "}
              Users with <strong className="text-zinc-300">Inventory — edit/delete delivery-in ledger</strong> in
              Accounts can correct or remove rows.
            </span>
          ) : null}
        </p>
        <div className="admin-table-wrap mt-2 max-h-80 overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-black/40 text-zinc-300">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-left">Note</th>
                {canEditDeliveryLedger ? (
                  <th className="px-3 py-2 text-right whitespace-nowrap">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {entries.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-zinc-500" colSpan={canEditDeliveryLedger ? 5 : 4}>
                    No delivery in entries on this day.
                  </td>
                </tr>
              ) : (
                entries.map((e) => {
                  const isEditing = editingEntryId === e.id;
                  return (
                    <tr key={e.id} className="bg-black/10 text-zinc-100">
                      <td className="px-3 py-2 whitespace-nowrap text-zinc-400">
                        {new Date(e.at).toLocaleString()}
                      </td>
                      {isEditing ? (
                        <>
                          <td className="px-3 py-2">
                            <select
                              value={editProduct}
                              onChange={(ev) => setEditProduct(ev.target.value)}
                              className="admin-select w-full min-w-[10rem]"
                            >
                              {productNames.map((p) => (
                                <option key={p} value={p}>
                                  {p}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0.01}
                              step="any"
                              value={editQuantity}
                              onChange={(ev) => setEditQuantity(ev.target.value)}
                              className="admin-input w-24 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={editNote}
                              onChange={(ev) => setEditNote(ev.target.value)}
                              className="admin-input w-full min-w-[8rem]"
                              placeholder="Note…"
                            />
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => void saveLedgerEntry()}
                              disabled={savingLedgerEdit}
                              className="admin-btn-primary px-2 py-1 text-[11px]"
                            >
                              {savingLedgerEdit ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEditEntry}
                              disabled={savingLedgerEdit}
                              className="admin-btn-secondary ml-1 px-2 py-1 text-[11px]"
                            >
                              Cancel
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2">{e.productName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{e.quantity}</td>
                          <td className="px-3 py-2 text-zinc-400">{e.note ?? "—"}</td>
                          {canEditDeliveryLedger ? (
                            <td className="px-3 py-2 text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => startEditEntry(e)}
                                disabled={deletingEntryId !== null || editingEntryId !== null}
                                className="text-sky-400 hover:underline disabled:opacity-40"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void deleteLedgerEntry(e.id)}
                                disabled={deletingEntryId !== null || editingEntryId !== null}
                                className="ml-2 text-rose-400 hover:underline disabled:opacity-40"
                              >
                                {deletingEntryId === e.id ? "…" : "Delete"}
                              </button>
                            </td>
                          ) : null}
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
