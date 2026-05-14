import { NextResponse } from "next/server";
import { buildCalendarEventsForMonth } from "@/data/admin/calendar";
import { loadDepartments, loadExpenses, loadReminders } from "@/data/admin/storage";
import type { CalendarEvent } from "@/data/admin/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_CHAT_IDS = ["6409473247", "7279390967"];
const MANILA_TIME_ZONE = "Asia/Manila";

function manilaTodayYmd(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function currency(n: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}

function chatIds(): string[] {
  const raw = process.env.TELEGRAM_CHAT_IDS || DEFAULT_CHAT_IDS.join(",");
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.TELEGRAM_CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  return auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret;
}

function dueItemsForDate(ymd: string): CalendarEvent[] {
  const parsed = parseYmd(ymd);
  if (!parsed) return [];
  const { events } = buildCalendarEventsForMonth({
    expenses: loadExpenses(),
    reminders: loadReminders(),
    departments: loadDepartments(),
    monthStart: new Date(parsed.year, parsed.month - 1, 1),
  });
  return events
    .filter((ev) => ev.date === ymd)
    .filter((ev) => ev.paymentStatus !== "paid")
    .filter((ev) => ev.kind === "bill" || ev.kind === "reminder")
    .sort((a, b) => {
      const ak = a.kind === "reminder" ? 0 : 1;
      const bk = b.kind === "reminder" ? 0 : 1;
      return ak === bk ? a.title.localeCompare(b.title) : ak - bk;
    });
}

function buildMessage(ymd: string, items: CalendarEvent[]): string {
  const reminders = items.filter((ev) => ev.kind === "reminder");
  const expenses = items.filter((ev) => ev.kind === "bill");
  const total = expenses.reduce((acc, ev) => acc + ev.amount, 0);

  const lines = [
    "Pending calendar items",
    `Date: ${ymd}`,
    "",
    `Reminders: ${reminders.length}`,
    ...(
      reminders.length
        ? reminders.map((ev, i) => `${i + 1}. ${ev.title} (${ev.frequency})`)
        : ["None"]
    ),
    "",
    `Expenses: ${expenses.length}${expenses.length ? ` (${currency(total)})` : ""}`,
    ...(
      expenses.length
        ? expenses.map(
            (ev, i) =>
              `${i + 1}. ${ev.title} - ${currency(ev.amount)} (${ev.category} / ${ev.departmentName} / ${ev.frequency})`,
          )
        : ["None"]
    ),
  ];
  return lines.join("\n");
}

async function sendTelegram(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!res.ok || !json?.ok) {
    throw new Error(json?.description || `Telegram send failed (${res.status}).`);
  }
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || manilaTodayYmd();
  if (!parseYmd(date)) return NextResponse.json({ error: "Invalid `date` (YYYY-MM-DD)." }, { status: 400 });

  const items = dueItemsForDate(date);
  if (items.length === 0) {
    return NextResponse.json({ ok: true, date, sent: 0, skipped: "No pending reminders or expenses." });
  }

  const ids = chatIds();
  if (ids.length === 0) return NextResponse.json({ error: "Missing TELEGRAM_CHAT_IDS." }, { status: 500 });

  const text = buildMessage(date, items);
  const results = await Promise.allSettled(ids.map((id) => sendTelegram(id, text)));
  const failed = results
    .map((r, i) => ({ result: r, chatId: ids[i] }))
    .filter((r): r is { result: PromiseRejectedResult; chatId: string } => r.result.status === "rejected")
    .map((r) => ({ chatId: r.chatId, error: r.result.reason instanceof Error ? r.result.reason.message : String(r.result.reason) }));

  if (failed.length > 0) {
    return NextResponse.json({ ok: false, date, sent: ids.length - failed.length, failed }, { status: 502 });
  }

  return NextResponse.json({ ok: true, date, sent: ids.length, itemCount: items.length });
}

