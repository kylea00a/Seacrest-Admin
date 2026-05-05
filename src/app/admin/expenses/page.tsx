"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AdminSettings, Department, Expense, ExpenseFrequency, PaymentStatus } from "@/data/admin/types";

const FREQUENCIES: Array<{ value: ExpenseFrequency; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "once", label: "One-time" },
  { value: "customMonths", label: "Custom (every N months)" },
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
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [savingEditId, setSavingEditId] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<{
    id: string;
    title: string;
    amount: string;
    category: string;
    frequency: ExpenseFrequency;
    startDate: string;
    departmentId: string;
    notes: string;
    paymentStatus: PaymentStatus;
  } | null>(null);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>("Rent");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [repeatEveryMonths, setRepeatEveryMonths] = useState<string>("3");
  const [repeatCount, setRepeatCount] = useState<string>("");
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

  useEffect(() => {
    let cancelled = false;
    async function loadExpenses() {
      setLoadingExpenses(true);
      try {
        const res = await fetch("/api/admin/expenses", { cache: "no-store" });
        const json = (await res.json()) as { expenses?: Expense[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        if (cancelled) return;
        setAllExpenses(Array.isArray(json.expenses) ? json.expenses : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingExpenses(false);
      }
    }
    void loadExpenses();
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

    const body: Record<string, unknown> = {
      title: title.trim(),
      amount: amt,
      category: category.trim(),
      frequency,
      startDate,
      departmentId: departmentId ? departmentId : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
      paymentStatus,
    };
    if (frequency === "customMonths") {
      const every = Number(repeatEveryMonths);
      const count = Number(repeatCount);
      if (!Number.isFinite(every) || every <= 0) return setError("Repeat every months must be a positive number.");
      body.repeatEveryMonths = Math.floor(every);
      if (repeatCount.trim()) {
        if (!Number.isFinite(count) || count <= 0) return setError("Payment plan count must be a positive number.");
        body.repeatCount = Math.floor(count);
      }
    }

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

  const deptNameById = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);

  const openEdit = (exp: Expense) => {
    setEditDraft({
      id: exp.id,
      title: exp.title,
      amount: String(exp.amount),
      category: String(exp.category),
      frequency: exp.frequency,
      startDate: exp.startDate,
      departmentId: exp.departmentId ?? "",
      notes: exp.notes ?? "",
      paymentStatus: exp.paymentStatus ?? "unpaid",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editDraft) return;
    setSavingEditId(editDraft.id);
    setError(null);
    try {
      const amt = Number(editDraft.amount);
      if (!editDraft.title.trim()) throw new Error("Title is required.");
      if (!Number.isFinite(amt)) throw new Error("Amount must be a valid number.");
      if (!editDraft.category.trim()) throw new Error("Category is required.");
      if (!editDraft.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(editDraft.startDate)) throw new Error("Start date is required.");

      const res = await fetch("/api/admin/expenses", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editDraft.id,
          title: editDraft.title.trim(),
          amount: amt,
          category: editDraft.category.trim(),
          frequency: editDraft.frequency,
          startDate: editDraft.startDate,
          departmentId: editDraft.departmentId ? editDraft.departmentId : undefined,
          notes: editDraft.notes.trim() ? editDraft.notes.trim() : undefined,
          paymentStatus: editDraft.paymentStatus,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; expense?: Expense; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      const updated = json.expense;
      setAllExpenses((prev) => prev.map((x) => (x.id === updated?.id ? (updated as Expense) : x)));
      setEditOpen(false);
      setEditDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEditId("");
    }
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("Delete this expense? This cannot be undone.")) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setAllExpenses((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId("");
    }
  };

  return (
    <div className="space-y-6">
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

          {frequency === "customMonths" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-semibold">Repeat every (months)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={repeatEveryMonths}
                  onChange={(e) => setRepeatEveryMonths(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
                  placeholder="e.g., 3"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-semibold">Payment plan count (optional)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={repeatCount}
                  onChange={(e) => setRepeatCount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
                  placeholder="e.g., 4 payments"
                />
              </div>
            </div>
          ) : null}

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

      <div className="admin-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">All Expenses</div>
            <div className="admin-muted mt-1 text-xs">Manage expenses (edit / delete). Paid status changes should be done here.</div>
          </div>
          <div className="text-xs text-zinc-400">{allExpenses.length} items</div>
        </div>

        {loadingExpenses ? (
          <div className="mt-4 text-sm text-zinc-300">Loading expenses…</div>
        ) : (
          <div className="admin-table-wrap mt-4">
            <table className="min-w-full text-xs">
              <thead className="bg-black/30 text-zinc-300">
                <tr>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Category</th>
                  <th className="px-3 py-2 text-left">Dept</th>
                  <th className="px-3 py-2 text-left">Frequency</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Start</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {allExpenses.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-zinc-500" colSpan={8}>
                      No expenses yet.
                    </td>
                  </tr>
                ) : (
                  allExpenses
                    .slice()
                    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                    .map((e) => (
                      <tr key={e.id} className="bg-black/10 text-zinc-100">
                        <td className="px-3 py-2">
                          <div className="font-semibold">{e.title}</div>
                          {e.isRequest ? (
                            <div className="mt-0.5 text-[10px] font-semibold text-amber-300">Requested</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{e.amount}</td>
                        <td className="px-3 py-2">{String(e.category)}</td>
                        <td className="px-3 py-2">{e.departmentId ? deptNameById.get(e.departmentId) ?? "—" : "General"}</td>
                        <td className="px-3 py-2">{e.frequency}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-zinc-300">{e.startDate}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-bold text-zinc-200">
                            {e.paymentStatus ?? "unpaid"}
                          </span>
                          {e.isRequest && e.requestStatus === "rejected" ? (
                            <span className="ml-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-200">
                              rejected
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="admin-btn-secondary px-2 py-1 text-[11px]"
                              onClick={() => openEdit(e)}
                              disabled={savingEditId === e.id || deletingId === e.id}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="admin-btn-secondary px-2 py-1 text-[11px]"
                              onClick={() => void deleteExpense(e.id)}
                              disabled={savingEditId === e.id || deletingId === e.id}
                            >
                              {deletingId === e.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editOpen && editDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-zinc-950 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Edit Expense</div>
                <div className="admin-muted mt-1 text-xs">{editDraft.id}</div>
              </div>
              <button
                type="button"
                className="admin-btn-secondary px-3 py-1.5 text-xs"
                onClick={() => {
                  setEditOpen(false);
                  setEditDraft(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <div className="text-xs font-semibold text-zinc-400">Title</div>
                <input
                  value={editDraft.title}
                  onChange={(e) => setEditDraft((p) => (p ? { ...p, title: e.target.value } : p))}
                  className="admin-input mt-1 w-full"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-400">Amount</div>
                <input
                  value={editDraft.amount}
                  onChange={(e) => setEditDraft((p) => (p ? { ...p, amount: e.target.value } : p))}
                  className="admin-input mt-1 w-full"
                  inputMode="decimal"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-400">Payment status</div>
                <select
                  value={editDraft.paymentStatus}
                  onChange={(e) => setEditDraft((p) => (p ? { ...p, paymentStatus: e.target.value as PaymentStatus } : p))}
                  className="admin-select mt-1 w-full"
                >
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-400">Category</div>
                <input
                  value={editDraft.category}
                  onChange={(e) => setEditDraft((p) => (p ? { ...p, category: e.target.value } : p))}
                  className="admin-input mt-1 w-full"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-400">Frequency</div>
                <select
                  value={editDraft.frequency}
                  onChange={(e) => setEditDraft((p) => (p ? { ...p, frequency: e.target.value as ExpenseFrequency } : p))}
                  className="admin-select mt-1 w-full"
                >
                  {FREQUENCIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-400">Start date</div>
                <input
                  type="date"
                  value={editDraft.startDate}
                  onChange={(e) => setEditDraft((p) => (p ? { ...p, startDate: e.target.value } : p))}
                  className="admin-input mt-1 w-full"
                />
              </div>
              <div>
                <div className="text-xs font-semibold text-zinc-400">Department</div>
                <select
                  value={editDraft.departmentId}
                  onChange={(e) => setEditDraft((p) => (p ? { ...p, departmentId: e.target.value } : p))}
                  className="admin-select mt-1 w-full"
                >
                  {departmentOptions.map((d) => (
                    <option key={d.id || "general"} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs font-semibold text-zinc-400">Notes</div>
                <input
                  value={editDraft.notes}
                  onChange={(e) => setEditDraft((p) => (p ? { ...p, notes: e.target.value } : p))}
                  className="admin-input mt-1 w-full"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                className="admin-btn-secondary px-3 py-2 text-xs"
                onClick={() => {
                  setEditOpen(false);
                  setEditDraft(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn-primary px-3 py-2 text-xs"
                onClick={() => void saveEdit()}
                disabled={savingEditId === editDraft.id}
              >
                {savingEditId === editDraft.id ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

