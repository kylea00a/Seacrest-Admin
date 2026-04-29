import { NextResponse } from "next/server";
import { loadDepartments, loadExpenses, loadInventoryEnding, loadPettyCashRequests, loadReminders } from "@/data/admin/storage";
import { buildCalendarEventsForMonth } from "@/data/admin/calendar";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "calendar");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const yearRaw = url.searchParams.get("year");
  const monthRaw = url.searchParams.get("month");

  const year = yearRaw ? Number(yearRaw) : NaN;
  const month = monthRaw ? Number(monthRaw) : NaN; // 1-12

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Missing/invalid `year` or `month`." }, { status: 400 });
  }

  const departments = loadDepartments();
  const expenses = loadExpenses();
  const reminders = loadReminders();
  const petty = loadPettyCashRequests();

  const monthStart = new Date(year, month - 1, 1);
  const { events, monthStart: monthStartISO, monthEnd } = buildCalendarEventsForMonth({
    expenses,
    reminders,
    departments,
    monthStart,
  });

  const pettyPending = petty
    .filter((r) => r.status === "pending")
    .filter((r) => r.dateRequested >= monthStartISO && r.dateRequested <= monthEnd)
    .sort((a, b) => a.dateRequested.localeCompare(b.dateRequested));

  const inv = loadInventoryEnding();
  const inventoryDiscrepancyDates = Object.values(inv.byDate ?? {})
    .filter((r) => Boolean(r?.hasDiscrepancy))
    .map((r) => r.date)
    .filter((d) => d >= monthStartISO && d <= monthEnd)
    .sort((a, b) => a.localeCompare(b));

  return NextResponse.json({ events, monthStart: monthStartISO, monthEnd, inventoryDiscrepancyDates, pettyPending });
}

