"use client";

import { useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "@/data/admin/types";

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

export default function CalendarPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showPaid, setShowPaid] = useState(true);
  const [showUnpaid, setShowUnpaid] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const res = await fetch(`/api/admin/calendar?year=${year}&month=${month}`, { cache: "no-store" });
        const json = (await res.json()) as { events?: CalendarEvent[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        if (cancelled) return;
        setEvents(json.events ?? []);
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
  }, [year, month]);

  const visibleEvents = useMemo(() => {
    return events.filter((ev) => (ev.paymentStatus === "paid" ? showPaid : showUnpaid));
  }, [events, showPaid, showUnpaid]);

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
  const monthTotals = useMemo(() => {
    const totalsByCategory = new Map<string, number>();
    for (const ev of visibleEvents)
      totalsByCategory.set(ev.category, (totalsByCategory.get(ev.category) ?? 0) + ev.amount);
    return Array.from(totalsByCategory.entries()).sort((a, b) => b[1] - a[1]);
  }, [visibleEvents]);

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

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={showUnpaid}
              onChange={(e) => setShowUnpaid(e.target.checked)}
            />
            Unpaid
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={showPaid}
              onChange={(e) => setShowPaid(e.target.checked)}
            />
            Paid
          </label>
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
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                className={[
                  "min-h-[108px] rounded-xl border p-2 text-left align-top transition",
                  inMonth ? "border-white/10 bg-white/5 hover:bg-white/10" : "border-white/5 bg-white/[0.03] text-zinc-500",
                  selected ? "border-emerald-500/60 ring-2 ring-emerald-500/20" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold">{d.getDate()}</div>
                  {dayEvents.length > 0 && (
                    <div className="text-[10px] font-semibold text-zinc-400">{dayEvents.length}</div>
                  )}
                </div>
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
                        <span className={statusChipClass(ev.paymentStatus)}>
                          {ev.paymentStatus === "paid" ? "Paid" : "Unpaid"}
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
                <div className="text-xs font-bold text-white">{currency(ev.amount)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold text-zinc-300">Status</div>
                <span className={statusChipClass(ev.paymentStatus)}>
                  {ev.paymentStatus === "paid" ? "Paid" : "Unpaid"}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <div className="text-sm font-semibold">Month Totals</div>
          <div className="mt-1 text-xs text-zinc-300">Sum of occurrences in this month</div>

          <div className="mt-3 space-y-2">
            {monthTotals.length === 0 && <div className="text-sm text-zinc-300">No expenses found.</div>}
            {monthTotals.slice(0, 6).map(([cat, total]) => (
              <div key={cat} className="flex items-center justify-between gap-3 text-sm">
                <div className="truncate text-zinc-200">{cat}</div>
                <div className="font-semibold text-white">{currency(total)}</div>
              </div>
            ))}
            {monthTotals.length > 6 && (
              <div className="text-xs text-zinc-300">+{monthTotals.length - 6} more categories</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

