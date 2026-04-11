import type { CalendarEvent, Department, Expense } from "./types";
import { getExpenseOccurrencesInRange } from "./recurrence";

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function buildCalendarEventsForMonth(params: {
  expenses: Expense[];
  departments: Department[];
  monthStart: Date; // any day within the month
}): { events: CalendarEvent[]; monthStart: string; monthEnd: string } {
  const { expenses, departments, monthStart } = params;
  const start = startOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth(), 1));
  const end = startOfDay(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0));

  const deptById = new Map<string, Department>(departments.map((d) => [d.id, d]));

  const events: CalendarEvent[] = [];

  for (const expense of expenses) {
    const occurrences = getExpenseOccurrencesInRange(expense, start, end);
    const dept = expense.departmentId ? deptById.get(expense.departmentId) : undefined;
    const departmentName = dept?.name ?? "General";
    const paymentStatus = expense.paymentStatus ?? "unpaid";

    for (const date of occurrences) {
      events.push({
        date,
        expenseId: expense.id,
        title: expense.title,
        amount: expense.amount,
        category: expense.category,
        departmentName,
        frequency: expense.frequency,
        paymentStatus,
      });
    }
  }

  events.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date.localeCompare(b.date)));
  const monthStartISO = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  const monthEndISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  return { events, monthStart: monthStartISO, monthEnd: monthEndISO };
}

