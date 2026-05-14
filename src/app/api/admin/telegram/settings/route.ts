import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import {
  loadTelegramNotificationSettings,
  saveTelegramNotificationSettings,
} from "@/data/admin/storage";
import type {
  TelegramBotConfig,
  TelegramNotificationKind,
  TelegramNotificationSettings,
  TelegramRecipientConfig,
  TelegramScheduleConfig,
} from "@/data/admin/types";
import { requireSuperadmin } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOTIFICATION_KINDS: TelegramNotificationKind[] = ["calendarReminders", "calendarExpenses"];

function defaultSendKinds(): Record<TelegramNotificationKind, boolean> {
  return { calendarReminders: true, calendarExpenses: true };
}

function isTime(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

function sanitizeRecipients(raw: unknown): TelegramRecipientConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): TelegramRecipientConfig | null => {
      if (typeof r !== "object" || r === null) return null;
      const o = r as Record<string, unknown>;
      const chatId = typeof o.chatId === "string" ? o.chatId.trim() : "";
      if (!chatId) return null;
      return {
        id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID(),
        label: typeof o.label === "string" && o.label.trim() ? o.label.trim() : chatId,
        chatId,
        enabled: o.enabled !== false,
      };
    })
    .filter((r): r is TelegramRecipientConfig => Boolean(r));
}

function sanitizeSchedules(raw: unknown): TelegramScheduleConfig[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map((s): TelegramScheduleConfig | null => {
      if (typeof s !== "object" || s === null) return null;
      const o = s as Record<string, unknown>;
      const time = typeof o.time === "string" ? o.time.trim() : "";
      if (!isTime(time) || seen.has(time)) return null;
      seen.add(time);
      return {
        id: typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID(),
        time,
        enabled: o.enabled !== false,
      };
    })
    .filter((s): s is TelegramScheduleConfig => Boolean(s))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function sanitizeSendKinds(raw: unknown): Record<TelegramNotificationKind, boolean> {
  const next = defaultSendKinds();
  if (typeof raw !== "object" || raw === null) return next;
  const o = raw as Record<string, unknown>;
  for (const k of NOTIFICATION_KINDS) next[k] = o[k] !== false;
  return next;
}

function maskToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 10) return "••••";
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function safeSettings(settings: TelegramNotificationSettings) {
  return {
    ...settings,
    bots: settings.bots.map((bot) => ({
      ...bot,
      token: "",
      hasToken: Boolean(bot.token?.trim()),
      maskedToken: maskToken(bot.token ?? ""),
    })),
  };
}

function starterSettings(): TelegramNotificationSettings {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chats = (process.env.TELEGRAM_CHAT_IDS || "6409473247,7279390967")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const labels: Record<string, string> = {
    "6409473247": "Althea",
    "7279390967": "Jay",
  };
  const now = new Date().toISOString();
  return {
    updatedAt: now,
    bots: [
      {
        id: "default",
        name: "Default Telegram Bot",
        token,
        enabled: true,
        recipients: chats.map((chatId) => ({
          id: randomUUID(),
          label: labels[chatId] ?? chatId,
          chatId,
          enabled: true,
        })),
        schedules: [
          { id: randomUUID(), time: "10:00", enabled: true },
          { id: randomUUID(), time: "17:00", enabled: true },
        ],
        sendKinds: defaultSendKinds(),
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function withStarterIfEmpty(settings: TelegramNotificationSettings): TelegramNotificationSettings {
  if (settings.bots.length > 0) return settings;
  return starterSettings();
}

export async function GET(req: Request) {
  const auth = await requireSuperadmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ settings: safeSettings(withStarterIfEmpty(loadTelegramNotificationSettings())) });
}

export async function POST(req: Request) {
  const auth = await requireSuperadmin(req);
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as { bots?: unknown };
  if (!Array.isArray(body.bots)) {
    return NextResponse.json({ error: "Missing `bots`." }, { status: 400 });
  }

  const current = withStarterIfEmpty(loadTelegramNotificationSettings());
  const currentById = new Map(current.bots.map((b) => [b.id, b]));
  const now = new Date().toISOString();

  const bots: TelegramBotConfig[] = body.bots
    .map((raw): TelegramBotConfig | null => {
      if (typeof raw !== "object" || raw === null) return null;
      const o = raw as Record<string, unknown>;
      const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : randomUUID();
      const existing = currentById.get(id);
      const tokenInput = typeof o.token === "string" ? o.token.trim() : "";
      const token = tokenInput || existing?.token || "";
      const name = typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Telegram Bot";
      return {
        id,
        name,
        token,
        enabled: o.enabled !== false,
        recipients: sanitizeRecipients(o.recipients),
        schedules: sanitizeSchedules(o.schedules),
        sendKinds: sanitizeSendKinds(o.sendKinds),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    })
    .filter((b): b is TelegramBotConfig => Boolean(b));

  const next: TelegramNotificationSettings = { bots, updatedAt: now };
  saveTelegramNotificationSettings(next);
  return NextResponse.json({ ok: true, settings: safeSettings(next) });
}

