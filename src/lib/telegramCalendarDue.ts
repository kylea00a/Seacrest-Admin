import { buildCalendarEventsForMonth } from "@/data/admin/calendar";
import { loadDepartments, loadExpenses, loadReminders } from "@/data/admin/storage";
import type { CalendarEvent, TelegramBotConfig, TelegramNotificationKind, TelegramNotificationSettings } from "@/data/admin/types";
import {
  loadTelegramSendLogResolved,
  loadTelegramSettingsResolved,
  persistTelegramSendLog,
  settingsDiagnostics,
} from "@/lib/telegramSettingsLoad";

const MANILA_TIME_ZONE = "Asia/Manila";
export const SCHEDULE_GRACE_MINUTES = 30;

export function manilaTodayYmd(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function manilaNowHm(): string {
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
    ...(reminders.length ? reminders.map((ev, i) => `${i + 1}. ${ev.title} (${ev.frequency})`) : ["None"]),
    "",
    `Expenses: ${expenses.length}${expenses.length ? ` (${currency(total)})` : ""}`,
    ...(expenses.length
      ? expenses.map(
          (ev, i) =>
            `${i + 1}. ${ev.title} - ${currency(ev.amount)} (${ev.category} / ${ev.departmentName} / ${ev.frequency})`,
        )
      : ["None"]),
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

function hmToMinutes(hm: string): number | null {
  const m = hm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function isScheduleDue(scheduleTime: string, currentHm: string): boolean {
  if (scheduleTime === currentHm) return true;
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
  trigger?: { botId: string; scheduleTime: string },
): Array<{ bot: TelegramBotConfig; scheduleTime: string }> {
  const out: Array<{ bot: TelegramBotConfig; scheduleTime: string }> = [];
  for (const bot of settings.bots) {
    if (!bot.enabled || !bot.token?.trim()) continue;
    if (!bot.recipients.some((r) => r.enabled && r.chatId.trim())) continue;
    if (trigger) {
      if (bot.id !== trigger.botId) continue;
      const sched = bot.schedules.find((s) => s.enabled && s.time === trigger.scheduleTime);
      if (sched) out.push({ bot, scheduleTime: sched.time });
      continue;
    }
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

export type TelegramCalendarDueResult = {
  ok: boolean;
  date: string;
  time: string;
  sent: number;
  itemCount?: number;
  skipped?: string;
  diagnostics?: ReturnType<typeof settingsDiagnostics>;
  failed?: Array<{ botName: string; scheduleTime: string; chatId: string; error: string }>;
};

export async function runTelegramCalendarDue(opts: {
  date?: string;
  time?: string;
  force?: boolean;
  runNow?: boolean;
  trigger?: { botId: string; scheduleTime: string };
}): Promise<TelegramCalendarDueResult> {
  const date = opts.date?.trim() || manilaTodayYmd();
  const hm = opts.time?.trim() || manilaNowHm();
  const force = opts.force === true;
  const runNow = opts.runNow === true;
  const trigger = opts.trigger;

  if (!parseYmd(date)) {
    return { ok: false, date, time: hm, sent: 0, skipped: "Invalid date." };
  }

  const items = dueItemsForDate(date);
  if (items.length === 0) {
    return { ok: true, date, time: hm, sent: 0, skipped: "No pending reminders or expenses." };
  }

  const settings = await loadTelegramSettingsResolved();
  const diag = settingsDiagnostics(settings);
  const due = dueBotSchedules(settings, hm, force, runNow, trigger);
  if (due.length === 0) {
    return {
      ok: true,
      date,
      time: hm,
      sent: 0,
      skipped: `No enabled Telegram schedule is due within ${SCHEDULE_GRACE_MINUTES} minutes.`,
      diagnostics: diag,
    };
  }

  const sentLog = await loadTelegramSendLogResolved();
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
    return { ok: true, date, time: hm, sent: 0, skipped: "Already sent or no selected item types.", diagnostics: diag };
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
    await persistTelegramSendLog([...sentLog, ...succeeded.map((t) => ({ key: t.key, sentAt: now }))]);
  }

  if (failed.length > 0) {
    return { ok: false, date, time: hm, sent: succeeded.length, failed, diagnostics: diag };
  }

  return { ok: true, date, time: hm, sent: succeeded.length, itemCount: items.length, diagnostics: diag };
}
