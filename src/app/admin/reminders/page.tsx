"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExpenseFrequency, Reminder } from "@/data/admin/types";

const FREQS: Array<{ id: ExpenseFrequency; label: string }> = [
  { id: "once", label: "Once" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "yearly", label: "Yearly" },
  { id: "customMonths", label: "Custom months" },
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function RemindersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Reminder[]>([]);

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [repeatEveryMonths, setRepeatEveryMonths] = useState("1");
  const [repeatCount, setRepeatCount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reminders", { cache: "no-store" });
      const json = (await res.json()) as { reminders?: Reminder[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setRows(Array.isArray(json.reminders) ? json.reminders : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startDate,
          frequency,
          repeatEveryMonths: frequency === "customMonths" ? Number(repeatEveryMonths) || 1 : undefined,
          repeatCount: frequency === "customMonths" && repeatCount.trim() ? Number(repeatCount) || undefined : undefined,
          notes: notes.trim() || undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setTitle("");
      setNotes("");
      setRepeatCount("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    const ok = window.confirm("Delete this reminder?");
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reminders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title)),
    [rows],
  );

  return (
    <div className="admin-card max-w-4xl">
      <h1 className="admin-title">Reminders</h1>
      <p className="admin-muted mt-1">Recurring reminders shown on the calendar (separate from bills).</p>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm font-semibold text-zinc-200">New reminder</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-400">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="admin-input mt-1 w-full" />
          </label>
          <label className="text-xs text-zinc-400">
            Start date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="admin-input mt-1 w-full" />
          </label>
          <label className="text-xs text-zinc-400">
            Frequency
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)} className="admin-select mt-1 w-full">
              {FREQS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          {frequency === "customMonths" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-zinc-400">
                Every N months
                <input value={repeatEveryMonths} onChange={(e) => setRepeatEveryMonths(e.target.value)} className="admin-input mt-1 w-full" inputMode="numeric" />
              </label>
              <label className="text-xs text-zinc-400">
                Repeat count (optional)
                <input value={repeatCount} onChange={(e) => setRepeatCount(e.target.value)} className="admin-input mt-1 w-full" inputMode="numeric" />
              </label>
            </div>
          ) : null}
          <label className="text-xs text-zinc-400 sm:col-span-2">
            Notes (optional)
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className="admin-input mt-1 w-full" />
          </label>
        </div>
        <div className="mt-4">
          <button type="button" onClick={() => void add()} disabled={saving || !title.trim()} className="admin-btn-primary">
            Add reminder
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {sorted.length === 0 ? (
          <div className="text-sm text-zinc-300">No reminders yet.</div>
        ) : (
          sorted.map((r) => (
            <div key={r.id} className="admin-card-inset flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">{r.title}</div>
                <div className="mt-1 text-xs text-zinc-400">
                  {r.startDate} • {r.frequency}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void del(r.id)}
                disabled={saving}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

