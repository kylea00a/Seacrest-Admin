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

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  if (!token.trim()) throw new Error("Missing bot token.");
  const res = await fetch(`https://api.telegram.org/bot${token.trim()}/sendMessage`, {
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
  const auth = await requireSuperadmin(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ settings: safeSettings(withStarterIfEmpty(loadTelegramNotificationSettings())) });
}

export async function POST(req: Request) {
  const auth = await requireSuperadmin(req);
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const action = url.searchParams.get("action")?.trim() ?? "";
  const body = (await req.json()) as { bots?: unknown; bot?: unknown; message?: unknown };

  if (action === "test") {
    if (typeof body.bot !== "object" || body.bot === null) {
      return NextResponse.json({ error: "Missing `bot`." }, { status: 400 });
    }
    const raw = body.bot as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const saved = withStarterIfEmpty(loadTelegramNotificationSettings()).bots.find((b) => b.id === id);
    const tokenInput = typeof raw.token === "string" ? raw.token.trim() : "";
    const token = tokenInput || saved?.token || "";
    const recipients = sanitizeRecipients(raw.recipients).filter((r) => r.enabled && r.chatId.trim());
    const message =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : "Test message from Seacrest Admin Telegram Notifications.";

    if (!token) return NextResponse.json({ error: "Missing bot token." }, { status: 400 });
    if (recipients.length === 0) {
      return NextResponse.json({ error: "Add at least one enabled chat recipient." }, { status: 400 });
    }

    const results = await Promise.allSettled(recipients.map((r) => sendTelegram(token, r.chatId, message)));
    const failed = results
      .map((result, i) => ({ result, recipient: recipients[i]! }))
      .filter((r): r is { result: PromiseRejectedResult; recipient: TelegramRecipientConfig } => r.result.status === "rejected")
      .map((r) => ({
        label: r.recipient.label,
        chatId: r.recipient.chatId,
        error: r.result.reason instanceof Error ? r.result.reason.message : String(r.result.reason),
      }));

    if (failed.length > 0) {
      return NextResponse.json({ ok: false, sent: recipients.length - failed.length, failed }, { status: 502 });
    }
    return NextResponse.json({ ok: true, sent: recipients.length });
  }

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

