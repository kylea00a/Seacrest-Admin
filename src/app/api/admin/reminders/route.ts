import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadReminders, saveReminders } from "@/data/admin/storage";
import type { ExpenseFrequency, Reminder } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isFreq(v: unknown): v is ExpenseFrequency {
  return (
    v === "daily" ||
    v === "weekly" ||
    v === "monthly" ||
    v === "quarterly" ||
    v === "yearly" ||
    v === "once" ||
    v === "customMonths"
  );
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "calendar");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ reminders: loadReminders() });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "calendar");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const action = url.searchParams.get("action")?.trim() ?? "";
  if (action === "status") {
    const body = (await req.json()) as { reminderId?: unknown; date?: unknown; status?: unknown };
    const reminderId = typeof body.reminderId === "string" ? body.reminderId.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const status = body.status === "pending" || body.status === "completed" ? body.status : "";
    if (!reminderId) return NextResponse.json({ error: "Missing `reminderId`." }, { status: 400 });
    if (!isDateOnly(date)) return NextResponse.json({ error: "Invalid `date` (YYYY-MM-DD)." }, { status: 400 });
    if (!status) return NextResponse.json({ error: "Invalid `status`." }, { status: 400 });

    const list = loadReminders();
    const idx = list.findIndex((r) => r.id === reminderId);
    if (idx < 0) return NextResponse.json({ error: "Reminder not found." }, { status: 404 });

    const existing = new Set(Array.isArray(list[idx]!.completedDates) ? list[idx]!.completedDates : []);
    if (status === "completed") existing.add(date);
    else existing.delete(date);
    list[idx] = {
      ...list[idx]!,
      completedDates: Array.from(existing).sort((a, b) => a.localeCompare(b)),
    };
    saveReminders(list);
    return NextResponse.json({ ok: true, reminder: list[idx] });
  }

  const body = (await req.json()) as Partial<Reminder>;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const startDate = typeof body.startDate === "string" ? body.startDate.trim() : "";
  if (!title) return NextResponse.json({ error: "Missing `title`." }, { status: 400 });
  if (!isDateOnly(startDate)) return NextResponse.json({ error: "Invalid `startDate` (YYYY-MM-DD)." }, { status: 400 });
  if (!isFreq(body.frequency)) return NextResponse.json({ error: "Invalid `frequency`." }, { status: 400 });

  const now = new Date().toISOString();
  const rec: Reminder = {
    id: randomUUID(),
    title,
    frequency: body.frequency,
    startDate,
    repeatEveryMonths: body.repeatEveryMonths,
    repeatCount: body.repeatCount,
    notes: typeof body.notes === "string" ? body.notes.trim() : undefined,
    completedDates: [],
    createdAt: now,
  };
  const list = loadReminders();
  list.push(rec);
  saveReminders(list);
  return NextResponse.json({ ok: true, reminder: rec });
}

export async function DELETE(req: Request) {
  const auth = await requireApiPermission(req, "calendar");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });
  const list = loadReminders();
  const next = list.filter((r) => r.id !== id);
  saveReminders(next);
  return NextResponse.json({ ok: true });
}

