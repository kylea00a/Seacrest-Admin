"use client";

import { useEffect, useMemo, useState } from "react";
import PackagesProductsEditor from "../_components/PackagesProductsEditor";
import type { AdminSettings } from "@/data/admin/types";

function uniq(list: string[]): string[] {
  return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);

  const [newExpenseCategory, setNewExpenseCategory] = useState("");
  const [newPettyCategory, setNewPettyCategory] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      const json = (await res.json()) as { settings?: AdminSettings; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      const s = json.settings ?? null;
      setSettings(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (next: {
    expenseCategories?: string[];
    pettyCashCategories?: string[];
    allowSuperadminEditEncodedInventory?: boolean;
  }) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = (await res.json()) as { settings?: AdminSettings; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      setSettings(json.settings ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const expenseList = useMemo(() => uniq(settings?.expenseCategories ?? []), [settings?.expenseCategories]);
  const pettyList = useMemo(() => uniq(settings?.pettyCashCategories ?? []), [settings?.pettyCashCategories]);

  const addExpense = async () => {
    const v = newExpenseCategory.trim();
    if (!v) return;
    setNewExpenseCategory("");
    await save({ expenseCategories: uniq([...(settings?.expenseCategories ?? []), v]) });
  };

  const removeExpense = async (value: string) => {
    await save({ expenseCategories: uniq((settings?.expenseCategories ?? []).filter((c) => c !== value)) });
  };

  const addPetty = async () => {
    const v = newPettyCategory.trim();
    if (!v) return;
    setNewPettyCategory("");
    await save({ pettyCashCategories: uniq([...(settings?.pettyCashCategories ?? []), v]) });
  };

  const removePetty = async (value: string) => {
    await save({ pettyCashCategories: uniq((settings?.pettyCashCategories ?? []).filter((c) => c !== value)) });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
      <div className="admin-card">
        <h1 className="admin-title">Settings</h1>
        <div className="text-sm text-zinc-300">
          Manage dropdown categories for Expenses and Petty Cash.
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-zinc-300">Loading…</div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Access powers</div>
                <div className="mt-1 text-xs text-zinc-400">
                  Controls one-time overrides that only superadmins can use.
                </div>
              </div>
            </div>

            <div className="mt-3">
              <label className="flex items-start gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={Boolean(settings?.allowSuperadminEditEncodedInventory)}
                  onChange={(e) =>
                    void save({ allowSuperadminEditEncodedInventory: e.target.checked })
                  }
                  disabled={saving}
                  className="mt-0.5 rounded border-white/20"
                />
                <span>
                  Allow superadmin to edit <strong>encoded ending inventory</strong>
                </span>
              </label>
              <div className="mt-1 text-[10px] leading-snug text-zinc-500">
                When enabled: superadmin can modify a day&apos;s ending counts even after staff encoded it. When disabled:
                encoded ending inventory becomes read-only for everyone.
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Expense Categories</div>
                <div className="mt-1 text-xs text-zinc-400">Used in `/admin/expenses` dropdown.</div>
              </div>
              <div className="text-xs text-zinc-400">{expenseList.length} items</div>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={newExpenseCategory}
                onChange={(e) => setNewExpenseCategory(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/60"
                placeholder="Add a category (e.g., Marketing)"
              />
              <button
                type="button"
                onClick={addExpense}
                disabled={saving}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                Add
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {expenseList.map((c) => (
                <div key={c} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200">
                  <span>{c}</span>
                  <button
                    type="button"
                    onClick={() => removeExpense(c)}
                    disabled={saving}
                    className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    aria-label={`Remove ${c}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Petty Cash Categories</div>
                <div className="mt-1 text-xs text-zinc-400">Used in `/admin/petty-cash` dropdown.</div>
              </div>
              <div className="text-xs text-zinc-400">{pettyList.length} items</div>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={newPettyCategory}
                onChange={(e) => setNewPettyCategory(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/60"
                placeholder="Add a category (e.g., Transportation)"
              />
              <button
                type="button"
                onClick={addPetty}
                disabled={saving}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                Add
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {pettyList.map((c) => (
                <div key={c} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200">
                  <span>{c}</span>
                  <button
                    type="button"
                    onClick={() => removePetty(c)}
                    disabled={saving}
                    className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] font-bold text-zinc-200 hover:bg-white/10 disabled:opacity-60"
                    aria-label={`Remove ${c}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10"
          >
            Reload
          </button>
          <div className="text-xs text-zinc-400">Saved to `data/admin/settings.json`</div>
          {saving ? <div className="text-xs text-zinc-400">Saving…</div> : null}
        </div>

        {settings?.updatedAt ? (
          <div className="mt-3 text-xs text-zinc-500">
            Last updated: {new Date(settings.updatedAt).toLocaleString()}
          </div>
        ) : null}
      </div>

      <div className="admin-card">
        <PackagesProductsEditor standalone={false} />
      </div>
      </div>

      <div className="admin-card h-fit lg:sticky lg:top-8">
        <div className="text-sm font-semibold">Notes</div>
        <div className="mt-2 space-y-2 text-sm text-zinc-200">
          <div>- Dropdowns are no longer typable; they strictly follow these lists.</div>
          <div>- Use the Add box to insert new categories anytime.</div>
          <div>- Removing a category will not delete existing saved records; it only affects the dropdown options.</div>
          <div>- Packages &amp; products are shared with the dedicated page in the right menu.</div>
        </div>
      </div>
    </div>
  );
}

