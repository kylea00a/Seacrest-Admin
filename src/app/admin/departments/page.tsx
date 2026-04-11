"use client";

import { useEffect, useMemo, useState } from "react";
import type { Department } from "@/data/admin/types";

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const sortedDepartments = useMemo(
    () => [...departments].sort((a, b) => a.name.localeCompare(b.name)),
    [departments]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/departments", { cache: "no-store" });
        const json = (await res.json()) as { departments?: Department[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        if (cancelled) return;
        setDepartments(json.departments ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const addDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Department name is required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = (await res.json()) as { department?: Department; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      const next = json.department;
      if (next) setDepartments((prev) => [...prev, next]);
      setName("");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : String(e2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="admin-card">
        <h1 className="admin-title">Departments</h1>
        <div className="text-sm text-zinc-300">Add departments so expenses can be assigned per team.</div>

        <form onSubmit={addDepartment} className="mt-5 space-y-3">
          <div>
            <label className="text-sm font-semibold">New Department</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-pink-500/60"
              placeholder="e.g., Operations, Finance, HR"
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-pink-500/20 hover:bg-pink-400 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Add Department"}
            </button>
            <div className="text-xs text-zinc-400">Saved locally to `data/admin/departments.json`.</div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </form>

        <div className="mt-6">
          <div className="text-sm font-semibold">Existing Departments</div>
          {loading ? (
            <div className="mt-2 text-sm text-zinc-300">Loading…</div>
          ) : sortedDepartments.length === 0 ? (
            <div className="mt-2 text-sm text-zinc-300">No departments yet. Add the first one.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {sortedDepartments.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div>
                    <div className="text-sm font-bold text-white">{d.name}</div>
                    <div className="text-xs text-zinc-400">ID: {d.id}</div>
                  </div>
                  <div className="text-xs font-semibold text-zinc-400">Created</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">Tip</div>
        <div className="mt-2 space-y-2 text-sm text-zinc-200">
          <div>Use departments to split costs (e.g., rent for Operations vs rent for Finance).</div>
          <div>All calendar entries are generated from expense frequency + start date.</div>
        </div>
      </div>
    </div>
  );
}

