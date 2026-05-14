import { NextResponse } from "next/server";
import { buildCalendarEventsForMonth } from "@/data/admin/calendar";
import {
  loadDepartments,
  loadExpenses,
  loadReminders,
  loadTelegramNotificationSettings,
  loadTelegramSendLog,
  saveTelegramSendLog,
} from "@/data/admin/storage";
import type { CalendarEvent, TelegramBotConfig, TelegramNotificationKind, TelegramNotificationSettings } from "@/data/admin/types";
import { requireSuperadmin } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MANILA_TIME_ZONE = "Asia/Manila";
const SCHEDULE_GRACE_MINUTES = 15;

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

function manilaNowHm(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MANILA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function currency(n: number): string {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
}

async function isAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.TELEGRAM_CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  if (secret && (auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret)) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  const admin = await requireSuperadmin(req);
  return !(admin instanceof NextResponse);
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

function filterItems(items: CalendarEvent[], sendKinds: Record<TelegramNotificationKind, boolean>): CalendarEvent[] {
  return items.filter((ev) => {
    if (ev.kind === "reminder") return sendKinds.calendarReminders;
    if (ev.kind === "bill") return sendKinds.calendarExpenses;
    return false;
  });
}

function buildMessage(ymd: string, time: string, botName: string, items: CalendarEvent[]): string {
  const reminders = items.filter((ev) => ev.kind === "reminder");
  const expenses = items.filter((ev) => ev.kind === "bill");
  const total = expenses.reduce((acc, ev) => acc + ev.amount, 0);

  const lines = [
    "Pending calendar items",
    `Date: ${ymd}`,
    `Schedule: ${time}`,
    `Bot: ${botName}`,
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

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
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

function defaultSettingsFromEnv(): TelegramNotificationSettings {
  const now = new Date().toISOString();
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chats = (process.env.TELEGRAM_CHAT_IDS || "6409473247,7279390967")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const labels: Record<string, string> = { "6409473247": "Althea", "7279390967": "Jay" };
  return {
    updatedAt: now,
    bots: [
      {
        id: "default",
        name: "Default Telegram Bot",
        token,
        enabled: true,
        recipients: chats.map((chatId) => ({
          id: chatId,
          label: labels[chatId] ?? chatId,
          chatId,
          enabled: true,
        })),
        schedules: [
          { id: "10am", time: "10:00", enabled: true },
          { id: "5pm", time: "17:00", enabled: true },
        ],
        sendKinds: { calendarReminders: true, calendarExpenses: true },
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function loadSettings(): TelegramNotificationSettings {
  const saved = loadTelegramNotificationSettings();
  if (saved.bots.length > 0) return saved;
  return defaultSettingsFromEnv();
}

function hmToMinutes(hm: string): number | null {
  const m = hm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isScheduleDue(scheduleTime: string, currentHm: string): boolean {
  const sched = hmToMinutes(scheduleTime);
  const current = hmToMinutes(currentHm);
  if (sched == null || current == null) return false;
  const diff = current - sched;
  return diff >= 0 && diff < SCHEDULE_GRACE_MINUTES;
}

function dueBotSchedules(
  settings: TelegramNotificationSettings,
  hm: string,
  force: boolean,
  runNow: boolean,
): Array<{ bot: TelegramBotConfig; scheduleTime: string }> {
  const out: Array<{ bot: TelegramBotConfig; scheduleTime: string }> = [];
  for (const bot of settings.bots) {
    if (!bot.enabled || !bot.token?.trim()) continue;
    if (!bot.recipients.some((r) => r.enabled && r.chatId.trim())) continue;
    if (runNow) {
      out.push({ bot, scheduleTime: hm });
      continue;
    }
    for (const s of bot.schedules) {
      if (!s.enabled) continue;
      if (force || isScheduleDue(s.time, hm)) out.push({ bot, scheduleTime: s.time });
    }
  }
  return out;
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date")?.trim() || manilaTodayYmd();
  const hm = url.searchParams.get("time")?.trim() || manilaNowHm();
  const force = url.searchParams.get("force") === "1";
  const runNow = url.searchParams.get("runNow") === "1";
  if (!parseYmd(date)) return NextResponse.json({ error: "Invalid `date` (YYYY-MM-DD)." }, { status: 400 });

  const items = dueItemsForDate(date);
  if (items.length === 0) {
    return NextResponse.json({ ok: true, date, time: hm, sent: 0, skipped: "No pending reminders or expenses." });
  }

  const settings = loadSettings();
  const due = dueBotSchedules(settings, hm, force, runNow);
  if (due.length === 0) {
    return NextResponse.json({
      ok: true,
      date,
      time: hm,
      sent: 0,
      skipped: `No enabled Telegram schedule is due within ${SCHEDULE_GRACE_MINUTES} minutes.`,
    });
  }

  const sentLog = loadTelegramSendLog();
  const sentKeys = new Set(sentLog.map((e) => e.key));
  const tasks: Array<{ key: string; botName: string; scheduleTime: string; chatId: string; promise: Promise<void> }> = [];
  for (const { bot, scheduleTime } of due) {
    const filtered = filterItems(items, bot.sendKinds);
    if (filtered.length === 0) continue;
    const message = buildMessage(date, scheduleTime, bot.name, filtered);
    for (const r of bot.recipients) {
      if (!r.enabled || !r.chatId.trim()) continue;
      const key = `${date}|${scheduleTime}|${bot.id}|${r.chatId}`;
      if (!force && sentKeys.has(key)) continue;
      tasks.push({ key, botName: bot.name, scheduleTime, chatId: r.chatId, promise: sendTelegram(bot.token, r.chatId, message) });
    }
  }

  if (tasks.length === 0) {
    return NextResponse.json({ ok: true, date, time: hm, sent: 0, skipped: "Already sent or no selected item types." });
  }

  const results = await Promise.allSettled(tasks.map((t) => t.promise));
  const failed = results
    .map((result, i) => ({ result, task: tasks[i]! }))
    .filter((r): r is { result: PromiseRejectedResult; task: (typeof tasks)[number] } => r.result.status === "rejected")
    .map((r) => ({
      botName: r.task.botName,
      scheduleTime: r.task.scheduleTime,
      chatId: r.task.chatId,
      error: r.result.reason instanceof Error ? r.result.reason.message : String(r.result.reason),
    }));

  const succeeded = tasks.filter((_, i) => results[i]?.status === "fulfilled");
  if (succeeded.length > 0 && !force) {
    const now = new Date().toISOString();
    const nextLog = [
      ...sentLog.filter((e) => e.sentAt >= new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString()),
      ...succeeded.map((t) => ({ key: t.key, sentAt: now })),
    ];
    saveTelegramSendLog(nextLog);
  }

  if (failed.length > 0) {
    return NextResponse.json({ ok: false, date, time: hm, sent: succeeded.length, failed }, { status: 502 });
  }

  return NextResponse.json({ ok: true, date, time: hm, sent: succeeded.length, itemCount: items.length });
}

