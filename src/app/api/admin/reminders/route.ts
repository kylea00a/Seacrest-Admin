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

