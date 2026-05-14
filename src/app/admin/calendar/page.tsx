"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "@/data/admin/types";
import type { BankAccount } from "@/data/admin/types";
import { useAdminSession } from "../AdminSessionContext";

function formatMonthLabel(year: number, month1to12: number) {
  const d = new Date(year, month1to12 - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

// Category styles used to exist here; now calendar cells prioritize titles + amount.

const STATUS_STYLES: Record<string, { pill: string; border: string }> = {
  paid: { pill: "bg-emerald-500/20 text-emerald-100", border: "border-emerald-500/35" },
  unpaid: { pill: "bg-amber-500/15 text-amber-100", border: "border-amber-500/30" },
  pending: { pill: "bg-amber-500/15 text-amber-100", border: "border-amber-500/30" },
  completed: { pill: "bg-emerald-500/20 text-emerald-100", border: "border-emerald-500/35" },
};

function statusChipClass(status: string) {
  const s = STATUS_STYLES[status];
  if (s)
    return `rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${s.border} ${s.pill}`;
  return "rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-zinc-200";
}

function currency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n);
  } catch {
    return `${n}`;
  }
}

function eventStatusLabel(ev: CalendarEvent): "Pending" | "Completed" {
  return ev.paymentStatus === "paid" ? "Completed" : "Pending";
}

function eventStatusKey(ev: CalendarEvent): "pending" | "completed" {
  return ev.paymentStatus === "paid" ? "completed" : "pending";
}

export default function CalendarPage() {
  const { account } = useAdminSession();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [pettyPending, setPettyPending] = useState<Array<Record<string, unknown>>>([]);
  const [inventoryDiscrepancyDates, setInventoryDiscrepancyDates] = useState<Set<string>>(new Set());
  const [savingExpenseId, setSavingExpenseId] = useState<string>("");
  const [deductAccounts, setDeductAccounts] = useState<BankAccount[]>([]);
  const [deductChoiceByExpenseId, setDeductChoiceByExpenseId] = useState<Record<string, string>>({});
  const [savingReminderKey, setSavingReminderKey] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function loadAccounts() {
      try {
        const res = await fetch("/api/admin/cash", { cache: "no-store" });
        const json = (await res.json()) as { accounts?: BankAccount[] };
        if (!res.ok) return;
        if (cancelled) return;
        setDeductAccounts(Array.isArray(json.accounts) ? json.accounts : []);
      } catch {
        // ignore
      }
    }
    void loadAccounts();
    return () => {
      cancelled = true;
    };
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>("");

  const refreshCalendar = useCallback(async () => {
    const res = await fetch(`/api/admin/calendar?year=${year}&month=${month}`, { cache: "no-store" });
    const json = (await res.json()) as {
      events?: CalendarEvent[];
      inventoryDiscrepancyDates?: string[];
      pettyPending?: Array<Record<string, unknown>>;
      error?: string;
    };
    if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
    setEvents(json.events ?? []);
    setInventoryDiscrepancyDates(new Set((json.inventoryDiscrepancyDates ?? []).filter(Boolean)));
    setPettyPending(Array.isArray(json.pettyPending) ? json.pettyPending : []);
  }, [year, month]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        await refreshCalendar();
        if (cancelled) return;
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
  }, [refreshCalendar]);

  const allEvents = useMemo(() => {
    const pettyEvents: CalendarEvent[] = pettyPending.map((r) => {
      const id = String(r["id"] ?? "");
      const date = String(r["dateRequested"] ?? "");
      return {
        date,
        expenseId: `petty:${id}`,
        title: String(r["description"] ?? "Petty cash request"),
        amount: Number(r["amount"] ?? 0) || 0,
        category: String(r["category"] ?? "Petty Cash"),
        departmentName: String(r["employeeName"] ?? "Petty Cash"),
        frequency: "once",
        paymentStatus: "unpaid",
        kind: "pettyCash",
      };
    });
    return [...events, ...pettyEvents];
  }, [events, pettyPending]);

  const visibleEvents = useMemo(() => {
    return allEvents.filter((ev) => ev.paymentStatus !== "paid");
  }, [allEvents]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of visibleEvents) {
      const arr = map.get(ev.date) ?? [];
      arr.push(ev);
      map.set(ev.date, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => a.title.localeCompare(b.title));
      map.set(k, arr);
    }
    return map;
  }, [visibleEvents]);

  const gridDates = useMemo(() => {
    const monthStart = new Date(year, month - 1, 1);
    const startWeekday = monthStart.getDay(); // 0=Sun
    const gridStart = addDays(monthStart, -startWeekday);
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [year, month]);

  useEffect(() => {
    // If "today" is not in the displayed month, just clear selection.
    const inMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    setSelectedDate(inMonth ? toDateOnly(new Date(now)) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const selectedEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];
  const pendingSummary = useMemo(() => {
    const pending = visibleEvents
      .filter((ev) => ev.kind === "bill" || ev.kind === "reminder")
      .slice()
      .sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)));
    const reminders = pending.filter((ev) => ev.kind === "reminder");
    const expenses = pending.filter((ev) => ev.kind === "bill");
    const expenseTotal = expenses.reduce((acc, ev) => acc + ev.amount, 0);
    return { pending, reminders, expenses, expenseTotal };
  }, [visibleEvents]);

  const monthTotals = useMemo(() => {
    const totalsByCategory = new Map<string, number>();
    for (const ev of pendingSummary.expenses)
      totalsByCategory.set(ev.category, (totalsByCategory.get(ev.category) ?? 0) + ev.amount);
    return Array.from(totalsByCategory.entries()).sort((a, b) => b[1] - a[1]);
  }, [pendingSummary.expenses]);

  const goPrevMonth = () => {
    const d = new Date(year, month - 2, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const goNextMonth = () => {
    const d = new Date(year, month, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const togglePaid = async (ev: CalendarEvent, deductFrom?: { type: "pettyCash" | "bank"; accountId?: string }) => {
    const next = ev.paymentStatus === "paid" ? "unpaid" : "paid";
    setSavingExpenseId(ev.expenseId);
    setError(null);
    try {
      const res = await fetch("/api/admin/expenses/payment-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseId: ev.expenseId, paymentStatus: next, deductFrom }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      // Reload month so both grid and day details update.
      await refreshCalendar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingExpenseId("");
    }
  };

  const rejectExpenseRequest = async (expenseId: string) => {
    setSavingExpenseId(expenseId);
    setError(null);
    try {
      const res = await fetch("/api/admin/expenses/payment-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseId, action: "reject" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      await refreshCalendar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingExpenseId("");
    }
  };

  const decidePetty = async (requestId: string, action: "approve" | "reject") => {
    setError(null);
    try {
      const res = await fetch("/api/admin/petty-cash?action=decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action, decidedBy: account?.displayName || "Superadmin" }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `Failed (${res.status})`);
      await refreshCalendar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const completeReminder = async (ev: CalendarEvent) => {
    const reminderId = ev.expenseId.replace(/^reminder:/, "");
    if (!reminderId || !ev.date) return;
    const key = `${reminderId}:${ev.date}`;
    setSavingReminderKey(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/reminders?action=status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderId, date: ev.date, status: "completed" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      await refreshCalendar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingReminderKey("");
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="admin-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="admin-title">Company Calendar</h1>
            <div className="admin-muted">Recurring dues + all expenses & bills</div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={goPrevMonth} className="admin-btn-secondary px-3 py-1.5">
              Prev
            </button>
            <div className="px-3 py-1.5 text-sm font-semibold text-zinc-200">
              {formatMonthLabel(year, month)}
            </div>
            <button type="button" onClick={goNextMonth} className="admin-btn-secondary px-3 py-1.5">
              Next
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
          Calendar shows pending expenses and reminders only. Completed items are hidden from the calendar.
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-zinc-400">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1">
          {gridDates.map((d) => {
            const iso = toDateOnly(d);
            const inMonth = d.getMonth() === month - 1;
            const dayEvents = eventsByDate.get(iso) ?? [];
            const selected = selectedDate === iso;
            const hasInvDiscrepancy = inventoryDiscrepancyDates.has(iso);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={[
                  "min-h-[108px] rounded-xl border p-2 text-left align-top transition",
                  inMonth ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-white/5 bg-white/[0.03] text-zinc-500",
                  selected ? "border-emerald-500/60 ring-2 ring-emerald-500/20" : "",
                  hasInvDiscrepancy ? "border-rose-500/50" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold">{d.getDate()}</div>
                  {dayEvents.length > 0 && (
                    <div className="text-[10px] font-semibold text-zinc-400">{dayEvents.length}</div>
                  )}
                </div>
                {hasInvDiscrepancy ? (
                  <div className="mt-1 text-[10px] font-semibold text-rose-300">Inventory discrepancy</div>
                ) : null}
                <div className="mt-2 space-y-1">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <div
                      key={ev.expenseId + ev.title + iso}
                      className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-semibold"
                      title={`${ev.title} • ${ev.departmentName}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-zinc-100">
                          {ev.title}
                        </span>
                        <span className={statusChipClass(eventStatusKey(ev))}>
                          {eventStatusLabel(ev)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-zinc-400">
                        <span className="truncate">{ev.category}</span>
                        <span className="font-semibold text-zinc-200">
                          {currency(ev.amount).replace(".00", "")}
                        </span>
                      </div>
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-[10px] font-semibold text-zinc-400">+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="mt-4 text-sm text-zinc-300">Loading calendar…</div>
        )}
        {error && <div className="admin-alert-error mt-4">{error}</div>}
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold text-white">Day Details</div>
        <div className="admin-muted mt-1 text-xs">
          {selectedDate ? `Selected: ${selectedDate}` : "Click a date to see items"}
        </div>

        <div className="mt-3 space-y-2">
          {selectedDate && selectedEvents.length === 0 && (
            <div className="text-sm text-zinc-300">No scheduled dues on this day.</div>
          )}
          {selectedEvents.map((ev) => (
            <div key={ev.expenseId + ev.title + ev.date} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-white">{ev.title}</div>
                  <div className="mt-1 text-[11px] text-zinc-300">
                    {ev.category} • {ev.departmentName} • {ev.frequency}
                  </div>
                </div>
                <div className="text-xs font-bold text-white">{ev.amount ? currency(ev.amount) : ""}</div>
              </div>
              {ev.kind === "pettyCash" ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-zinc-300">Type</div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-zinc-200">
                      Petty cash request
                    </span>
                    {account?.isSuperadmin ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="admin-btn-primary px-2 py-1 text-[11px]"
                          onClick={() => void decidePetty(ev.expenseId.replace(/^petty:/, ""), "approve")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="admin-btn-secondary px-2 py-1 text-[11px]"
                          onClick={() => void decidePetty(ev.expenseId.replace(/^petty:/, ""), "reject")}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : ev.kind === "reminder" ? (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-zinc-300">Reminder status</div>
                  <div className="flex items-center gap-2">
                    <span className={statusChipClass("pending")}>Pending</span>
                    <button
                      type="button"
                      disabled={savingReminderKey === `${ev.expenseId.replace(/^reminder:/, "")}:${ev.date}`}
                      onClick={() => void completeReminder(ev)}
                      className="admin-btn-primary px-2 py-1 text-[11px]"
                      title="Mark reminder completed"
                    >
                      {savingReminderKey === `${ev.expenseId.replace(/^reminder:/, "")}:${ev.date}` ? "Saving…" : "Complete"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold text-zinc-300">Status</div>
                  {ev.paymentStatus === "paid" ? (
                    <button
                      type="button"
                      disabled
                      className={statusChipClass(ev.paymentStatus)}
                      title="Paid items are read-only in calendar"
                    >
                      Completed
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={statusChipClass("pending")}>Pending</span>
                      <select
                        value={deductChoiceByExpenseId[ev.expenseId] ?? ""}
                        onChange={(e) => setDeductChoiceByExpenseId((p) => ({ ...p, [ev.expenseId]: e.target.value }))}
                        className="admin-select py-1 text-[11px]"
                        disabled={savingExpenseId === ev.expenseId}
                      >
                        <option value="">Deduct from…</option>
                        <option value="pettyCash">Petty cash</option>
                        {deductAccounts.map((a) => (
                          <option key={a.id} value={`bank:${a.id}`}>
                            {a.name} ({a.bank})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={savingExpenseId === ev.expenseId || !(deductChoiceByExpenseId[ev.expenseId] ?? "")}
                        onClick={() => {
                          const v = deductChoiceByExpenseId[ev.expenseId] ?? "";
                          if (v === "pettyCash") void togglePaid(ev, { type: "pettyCash" });
                          else if (v.startsWith("bank:")) void togglePaid(ev, { type: "bank", accountId: v.slice("bank:".length) });
                        }}
                        className={statusChipClass(ev.paymentStatus)}
                        title="Mark completed"
                      >
                        {savingExpenseId === ev.expenseId ? "Saving…" : "Complete"}
                      </button>
                      {account?.isSuperadmin ? (
                        <button
                          type="button"
                          disabled={savingExpenseId === ev.expenseId}
                          onClick={() => void rejectExpenseRequest(ev.expenseId)}
                          className="admin-btn-secondary px-2 py-1 text-[11px]"
                          title="Reject request"
                        >
                          Reject
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-sm font-semibold">Pending Summary</div>
          <div className="mt-1 text-xs text-zinc-300">
            All pending reminders and expenses in {formatMonthLabel(year, month)}.
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Pending reminders</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-white">
                {pendingSummary.reminders.length.toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">Pending expenses</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-white">
                {pendingSummary.expenses.length.toLocaleString()}
              </div>
              <div className="mt-1 text-xs font-semibold text-zinc-300">{currency(pendingSummary.expenseTotal)}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {pendingSummary.pending.length === 0 ? (
              <div className="text-sm text-zinc-300">No pending reminders or expenses this month.</div>
            ) : (
              pendingSummary.pending.slice(0, 12).map((ev) => (
                <div key={`${ev.kind}-${ev.expenseId}-${ev.date}`} className="rounded-xl border border-white/10 bg-black/20 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{ev.title}</div>
                      <div className="mt-0.5 text-[11px] text-zinc-400">
                        {ev.date} • {ev.kind === "reminder" ? "Reminder" : ev.category}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {ev.amount ? <div className="text-xs font-bold text-white">{currency(ev.amount)}</div> : null}
                      {ev.kind === "reminder" ? (
                        <button
                          type="button"
                          disabled={savingReminderKey === `${ev.expenseId.replace(/^reminder:/, "")}:${ev.date}`}
                          onClick={() => void completeReminder(ev)}
                          className="admin-btn-secondary px-2 py-1 text-[11px]"
                        >
                          {savingReminderKey === `${ev.expenseId.replace(/^reminder:/, "")}:${ev.date}` ? "Saving…" : "Complete"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
            {pendingSummary.pending.length > 12 ? (
              <div className="text-xs text-zinc-300">+{pendingSummary.pending.length - 12} more pending item(s)</div>
            ) : null}
          </div>

          {monthTotals.length > 0 ? (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="text-xs font-semibold text-zinc-300">Pending expense totals by category</div>
              <div className="mt-2 space-y-1">
                {monthTotals.slice(0, 6).map(([cat, total]) => (
                  <div key={cat} className="flex items-center justify-between gap-3 text-xs">
                    <div className="truncate text-zinc-300">{cat}</div>
                    <div className="font-semibold text-white">{currency(total)}</div>
                  </div>
                ))}
                {monthTotals.length > 6 ? (
                  <div className="text-xs text-zinc-300">+{monthTotals.length - 6} more categories</div>
                ) : null}
              </div>
            </div>
          ) : null}
          </div>
      </div>
    </div>
  );
}

