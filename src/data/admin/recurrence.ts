import type { Expense, ExpenseFrequency } from "./types";

function parseDateOnly(dateOnly: string): Date {
  // Treat as local midnight to avoid time zone surprises.
  return new Date(`${dateOnly}T00:00:00`);
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  // monthIndex: 0-11
  return new Date(year, monthIndex + 1, 0).getDate();
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export function getExpenseOccurrencesInRange(
  expense: Expense,
  rangeStart: Date,
  rangeEnd: Date
): string[] {
  const start = startOfDay(parseDateOnly(expense.startDate));
  const end = startOfDay(rangeEnd);
  const rangeStartDay = startOfDay(rangeStart);

  if (end < start) return [];

  const frequency = expense.frequency as ExpenseFrequency;
  const occurrences: string[] = [];

  if (frequency === "once") {
    if (start >= rangeStartDay && start <= end) return [toDateOnly(start)];
    return [];
  }

  if (frequency === "daily") {
    let cursor = start > rangeStartDay ? start : rangeStartDay;
    cursor = startOfDay(cursor);
    while (cursor <= end) {
      occurrences.push(toDateOnly(cursor));
      cursor = addDays(cursor, 1);
    }
    return occurrences;
  }

  if (frequency === "weekly") {
    // Same weekday as the start date.
    let cursor = new Date(start);
    while (cursor < rangeStartDay) cursor = addDays(cursor, 7);
    while (cursor <= end) {
      occurrences.push(toDateOnly(cursor));
      cursor = addDays(cursor, 7);
    }
    return occurrences;
  }

  if (frequency === "monthly") {
    const startDay = start.getDate();
    let cursorMonth = new Date(rangeStartDay.getFullYear(), rangeStartDay.getMonth(), 1);
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursorMonth <= lastMonth) {
      const y = cursorMonth.getFullYear();
      const m = cursorMonth.getMonth();
      const dim = daysInMonth(y, m);
      const day = Math.min(startDay, dim);
      const occurrence = new Date(y, m, day);
      if (occurrence >= rangeStartDay && occurrence <= end && occurrence >= start) {
        occurrences.push(toDateOnly(occurrence));
      }
      cursorMonth = new Date(y, m + 1, 1);
    }
    return occurrences;
  }

  if (frequency === "quarterly") {
    const startDay = start.getDate();
    const startMonthIndex = start.getFullYear() * 12 + start.getMonth();
    let cursorMonth = new Date(rangeStartDay.getFullYear(), rangeStartDay.getMonth(), 1);
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursorMonth <= lastMonth) {
      const y = cursorMonth.getFullYear();
      const m = cursorMonth.getMonth();
      const monthIndex = y * 12 + m;
      const isQuarterMonth = (monthIndex - startMonthIndex) % 3 === 0;
      if (isQuarterMonth) {
        const dim = daysInMonth(y, m);
        const day = Math.min(startDay, dim);
        const occurrence = new Date(y, m, day);
        if (occurrence >= rangeStartDay && occurrence <= end && occurrence >= start) {
          occurrences.push(toDateOnly(occurrence));
        }
      }
      cursorMonth = new Date(y, m + 1, 1);
    }
    return occurrences;
  }

  if (frequency === "customMonths") {
    const startDay = start.getDate();
    const startMonthIndex = start.getFullYear() * 12 + start.getMonth();
    const every = Math.max(1, Math.floor(Number(expense.repeatEveryMonths ?? 1) || 1));
    const cap = expense.repeatCount != null ? Math.max(1, Math.floor(Number(expense.repeatCount) || 1)) : null;

    let cursorMonth = new Date(rangeStartDay.getFullYear(), rangeStartDay.getMonth(), 1);
    const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);

    while (cursorMonth <= lastMonth) {
      const y = cursorMonth.getFullYear();
      const m = cursorMonth.getMonth();
      const monthIndex = y * 12 + m;
      const offset = monthIndex - startMonthIndex;
      const isHit = offset >= 0 && offset % every === 0;
      if (isHit) {
        const nth = offset / every + 1; // 1-based occurrence count
        if (cap != null && nth > cap) break;
        const dim = daysInMonth(y, m);
        const day = Math.min(startDay, dim);
        const occurrence = new Date(y, m, day);
        if (occurrence >= rangeStartDay && occurrence <= end && occurrence >= start) {
          occurrences.push(toDateOnly(occurrence));
        }
      }
      cursorMonth = new Date(y, m + 1, 1);
    }
    return occurrences;
  }

  // yearly
  const startDay = start.getDate();
  const startMonth = start.getMonth();
  const startYear = start.getFullYear();

  const startYearCursor = Math.max(rangeStartDay.getFullYear(), startYear);
  for (let year = startYearCursor; year <= end.getFullYear(); year++) {
    const dim = daysInMonth(year, startMonth);
    const day = Math.min(startDay, dim);
    const occurrence = new Date(year, startMonth, day);
    if (occurrence >= rangeStartDay && occurrence <= end && occurrence >= start) {
      occurrences.push(toDateOnly(occurrence));
    }
  }

  return occurrences;
}

