"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminSettings, Department, ExpenseFrequency, PaymentStatus } from "@/data/admin/types";

const FREQUENCIES: Array<{ value: ExpenseFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const FALLBACK_EXPENSE_CATEGORIES = ["BIR", "Rent", "Utility", "Maintenance", "Payroll", "Supplies", "Other"];

const PAYMENT_STATUSES: Array<{ value: PaymentStatus; label: string }> = [
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
];

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AddExpensePage() {
  const router = useRouter();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("Rent");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [startDate, setStartDate] = useState<string>(todayISO());
  const [departmentId, setDepartmentId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("unpaid");

  const departmentOptions = useMemo(() => [{ id: "", name: "General" }, ...departments], [departments]);

  useEffect(() => {
    let cancelled = false;
    async function loadDepartments() {
      setLoading(true);
      setError(null);
      try {
        const [deptRes, settingsRes] = await Promise.all([
          fetch("/api/admin/departments", { cache: "no-store" }),
          fetch("/api/admin/settings", { cache: "no-store" }),
        ]);

        const deptJson = (await deptRes.json()) as { departments?: Department[]; error?: string };
        const settingsJson = (await settingsRes.json()) as { settings?: AdminSettings; error?: string };

        if (!deptRes.ok) throw new Error(deptJson.error ?? `Failed with status ${deptRes.status}`);
        if (!settingsRes.ok) throw new Error(settingsJson.error ?? `Failed with status ${settingsRes.status}`);

        if (!cancelled) {
          setDepartments(deptJson.departments ?? []);
          setSettings(settingsJson.settings ?? null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDepartments();
    return () => {
      cancelled = true;
    };
  }, []);

  const expenseCategories = useMemo(() => {
    const list = settings?.expenseCategories?.length ? settings.expenseCategories : FALLBACK_EXPENSE_CATEGORIES;
    return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
  }, [settings]);

  useEffect(() => {
    if (!expenseCategories.length) return;
    if (!expenseCategories.includes(category)) setCategory(expenseCategories[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseCategories.join("|")]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amt = Number(amount);
    if (!title.trim()) return setError("Title is required.");
    if (!Number.isFinite(amt)) return setError("Amount must be a valid number.");
    if (!category.trim()) return setError("Category is required.");
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return setError("Start date is required.");

    const body = {
      title: title.trim(),
      amount: amt,
      category: category.trim(),
      frequency,
      startDate,
      departmentId: departmentId ? departmentId : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
      paymentStatus,
    };

    const res = await fetch("/api/admin/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const json = (await res.json()) as { expense?: unknown; error?: string };
    if (!res.ok) {
      setError(json.error ?? `Failed to save (status ${res.status}).`);
      return;
    }

    // Back to calendar so you can immediately see the created dues.
    router.push("/admin/calendar");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="admin-card">
        <h1 className="admin-title">Add Expense / Bill</h1>
        <div className="text-sm text-zinc-300">Pick how often it repeats, then the calendar auto-fills occurrences.</div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="text-sm font-semibold">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/60"
              placeholder="e.g., BIR Monthly VAT"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold">Amount (PHP)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/60"
                placeholder="e.g., 15000"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
                required
              >
                {expenseCategories.map((c) => (
                  <option value={c} key={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
              >
                {departmentOptions.map((d) => (
                  <option value={d.id} key={d.id || "general"}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ExpenseFrequency)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
              >
                {FREQUENCIES.map((f) => (
                  <option value={f.value} key={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
                required
              />
            </div>

            <div>
              <label className="text-sm font-semibold">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option value={s.value} key={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold">Notes (optional)</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/60"
                placeholder="e.g., Due every last day of month"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400"
            >
              Save Expense
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/calendar")}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10"
            >
              Cancel
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </form>
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">How Recurrence Works</div>
        <div className="mt-2 space-y-3 text-sm text-zinc-200">
          <div>
            <span className="font-semibold">Daily</span> repeats every day starting from the Start Date.
          </div>
          <div>
            <span className="font-semibold">Weekly</span> repeats on the same weekday as Start Date.
          </div>
          <div>
            <span className="font-semibold">Monthly</span> repeats on the Start Date day-of-month (clamped to month end if needed).
          </div>
          <div>
            <span className="font-semibold">Quarterly</span> repeats every 3 months (same day-of-month).
          </div>
          <div>
            <span className="font-semibold">Yearly</span> repeats every year (same month + day).
          </div>
        </div>

        {loading && (
          <div className="mt-5 text-sm text-zinc-300">Loading departments…</div>
        )}
        {error && (
          <div className="mt-5 text-sm text-zinc-300">{error}</div>
        )}
      </div>
    </div>
  );
}

