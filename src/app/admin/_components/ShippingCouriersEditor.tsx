"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ShippingCourier, ShippingFeeBracket } from "@/data/admin/types";

type DraftCourier = {
  id: string;
  name: string;
  country: string;
  description: string;
  fees: Array<{ minWeight: string; maxWeight: string; price: string }>;
};

function toDraft(c: ShippingCourier): DraftCourier {
  return {
    id: c.id,
    name: c.name ?? "",
    country: c.country ?? "",
    description: c.description ?? "",
    fees: (c.fees ?? []).map((f) => ({
      minWeight: String(f.minWeight ?? ""),
      maxWeight: String(f.maxWeight ?? ""),
      price: String(f.price ?? ""),
    })),
  };
}

function toFees(d: DraftCourier["fees"]): ShippingFeeBracket[] {
  const out: ShippingFeeBracket[] = [];
  for (const r of d) {
    const minWeight = Number(String(r.minWeight ?? "").trim());
    const maxText = String(r.maxWeight ?? "").trim();
    const maxWeight = maxText === "" ? NaN : Number(maxText);
    const price = Number(String(r.price ?? "").trim());
    if (!Number.isFinite(minWeight) || !Number.isFinite(price)) continue;
    if (Number.isFinite(maxWeight)) out.push({ minWeight, maxWeight, price });
    else out.push({ minWeight, price });
  }
  return out;
}

export default function ShippingCouriersEditor() {
  const [couriers, setCouriers] = useState<ShippingCourier[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<DraftCourier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/shipping-couriers", { cache: "no-store" });
      const json = (await res.json()) as { couriers?: ShippingCourier[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setCouriers(Array.isArray(json.couriers) ? json.couriers : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const defaultCourierId = useMemo(() => {
    const jnt = couriers.find((c) => (c.name ?? "").toLowerCase().includes("j&t"));
    return jnt?.id ?? couriers[0]?.id ?? "";
  }, [couriers]);

  const openEdit = (id: string) => {
    const c = couriers.find((x) => x.id === id);
    if (!c) return;
    setDraft(toDraft(c));
    setEditOpen(true);
  };

  const closeEdit = () => {
    setEditOpen(false);
    setDraft(null);
  };

  const addCourier = async () => {
    setError(null);
    setSavingId("new");
    try {
      const res = await fetch("/api/admin/shipping-couriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New courier",
          country: "",
          description: "",
          fees: [],
        }),
      });
      const json = (await res.json()) as { courier?: ShippingCourier; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      const c = json.courier;
      if (c) {
        setCouriers((prev) => [...prev, c]);
        setDraft(toDraft(c));
        setEditOpen(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    setError(null);
    setSavingId(draft.id);
    try {
      const res = await fetch("/api/admin/shipping-couriers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: draft.id,
          name: draft.name.trim(),
          country: draft.country.trim() || undefined,
          description: draft.description.trim() || undefined,
          fees: toFees(draft.fees),
        }),
      });
      const json = (await res.json()) as { courier?: ShippingCourier; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      const updated = json.courier;
      if (updated) {
        setCouriers((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      }
      closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingId("");
    }
  };

  const deleteCourier = async (id: string) => {
    if (!confirm("Delete this courier fee table?")) return;
    setError(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/shipping-couriers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setCouriers((prev) => prev.filter((c) => c.id !== id));
      if (draft?.id === id) closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Shipping fee computation</div>
          <div className="mt-1 text-xs text-zinc-400">
            Add couriers and define weight brackets (kg) to compute shipping fees in Product Calculator.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="admin-btn-primary" onClick={() => void addCourier()} disabled={savingId === "new"}>
            {savingId === "new" ? "Adding…" : "Add courier"}
          </button>
        </div>
      </div>

      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}
      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}

      <div className="admin-table-wrap mt-4">
        <table className="min-w-full text-xs">
          <thead className="bg-black/30 text-zinc-300">
            <tr>
              <th className="px-3 py-2 text-left">Courier</th>
              <th className="px-3 py-2 text-left">Country</th>
              <th className="px-3 py-2 text-left">Description</th>
              <th className="px-3 py-2 text-left">Brackets</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {couriers.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                  No couriers yet.
                </td>
              </tr>
            ) : (
              couriers
                .slice()
                .sort((a, b) => (a.id === defaultCourierId ? -1 : b.id === defaultCourierId ? 1 : a.name.localeCompare(b.name)))
                .map((c) => (
                  <tr key={c.id} className="bg-black/10 text-zinc-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{c.name}</div>
                      {c.id === defaultCourierId ? (
                        <div className="mt-0.5 text-[10px] font-semibold text-emerald-300/90">Default</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{c.country ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-300">{c.description ?? "—"}</td>
                    <td className="px-3 py-2 text-zinc-300">{(c.fees ?? []).length}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="admin-btn-secondary px-2 py-1 text-[11px]" onClick={() => openEdit(c.id)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="admin-btn-secondary px-2 py-1 text-[11px]"
                          onClick={() => void deleteCourier(c.id)}
                          disabled={deletingId === c.id}
                        >
                          {deletingId === c.id ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>

      {editOpen && draft ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-zinc-400">Name*</div>
              <input
                value={draft.name}
                onChange={(e) => setDraft((p) => (p ? { ...p, name: e.target.value } : p))}
                className="admin-input mt-1 w-full"
                placeholder="J&T"
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-400">Country</div>
              <input
                value={draft.country}
                onChange={(e) => setDraft((p) => (p ? { ...p, country: e.target.value } : p))}
                className="admin-input mt-1 w-full"
                placeholder="Philippines"
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-zinc-400">Description</div>
              <input
                value={draft.description}
                onChange={(e) => setDraft((p) => (p ? { ...p, description: e.target.value } : p))}
                className="admin-input mt-1 w-full"
                placeholder="5-7 days"
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs font-semibold text-zinc-400">Fees*</div>
            <div className="mt-2 space-y-2">
              {draft.fees.map((row, idx) => (
                <div key={idx} className="rounded-xl border border-white/10 bg-black/10 p-3">
                  <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-400">Min weight*</div>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          value={row.minWeight}
                          onChange={(e) =>
                            setDraft((p) =>
                              !p
                                ? p
                                : {
                                    ...p,
                                    fees: p.fees.map((r, i) => (i === idx ? { ...r, minWeight: e.target.value } : r)),
                                  },
                            )
                          }
                          className="admin-input w-full"
                          inputMode="decimal"
                          placeholder="0.01"
                        />
                        <span className="text-[10px] text-zinc-500">kg</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-400">Max weight*</div>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          value={row.maxWeight}
                          onChange={(e) =>
                            setDraft((p) =>
                              !p
                                ? p
                                : {
                                    ...p,
                                    fees: p.fees.map((r, i) => (i === idx ? { ...r, maxWeight: e.target.value } : r)),
                                  },
                            )
                          }
                          className="admin-input w-full"
                          inputMode="decimal"
                          placeholder="0.50"
                        />
                        <span className="text-[10px] text-zinc-500">kg</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold text-zinc-400">Price*</div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-zinc-300">
                          ₱
                        </span>
                        <input
                          value={row.price}
                          onChange={(e) =>
                            setDraft((p) =>
                              !p
                                ? p
                                : {
                                    ...p,
                                    fees: p.fees.map((r, i) => (i === idx ? { ...r, price: e.target.value } : r)),
                                  },
                            )
                          }
                          className="admin-input w-full"
                          inputMode="decimal"
                          placeholder="115.00"
                        />
                      </div>
                    </div>
                    <div className="flex items-end justify-end">
                      <button
                        type="button"
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/20"
                        onClick={() => setDraft((p) => (!p ? p : { ...p, fees: p.fees.filter((_, i) => i !== idx) }))}
                        title="Delete bracket"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <button
                type="button"
                className="admin-btn-secondary px-3 py-2 text-xs"
                onClick={() =>
                  setDraft((p) =>
                    !p ? p : { ...p, fees: [...p.fees, { minWeight: "", maxWeight: "", price: "" }] },
                  )
                }
              >
                Add bracket
              </button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" className="admin-btn-secondary px-3 py-2 text-xs" onClick={closeEdit} disabled={savingId === draft.id}>
              Cancel
            </button>
            <button type="button" className="admin-btn-primary px-3 py-2 text-xs" onClick={() => void saveDraft()} disabled={savingId === draft.id}>
              {savingId === draft.id ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

