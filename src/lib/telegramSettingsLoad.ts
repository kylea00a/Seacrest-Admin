import {
  loadTelegramNotificationSettings,
  loadTelegramSendLog,
  saveTelegramNotificationSettings,
  saveTelegramSendLog,
} from "@/data/admin/storage";
import type { TelegramBotConfig, TelegramNotificationSettings, TelegramSendLogEntry } from "@/data/admin/types";
import {
  loadTelegramSettingsFromShelf,
  loadTelegramSendLogFromShelf,
  saveTelegramSendLogToShelf,
  saveTelegramSettingsToShelf,
} from "@/lib/adminStorageShelf";

function enrichBotTokens(settings: TelegramNotificationSettings): TelegramNotificationSettings {
  const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  if (!envToken) return settings;
  return {
    ...settings,
    bots: settings.bots.map((bot) => ({
      ...bot,
      token: bot.token?.trim() || envToken,
    })),
  };
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

function hasUsableBots(bots: TelegramBotConfig[]): boolean {
  return bots.some(
    (b) =>
      b.enabled &&
      b.token?.trim() &&
      b.recipients.some((r) => r.enabled && r.chatId.trim()) &&
      b.schedules.some((s) => s.enabled),
  );
}

/** Loads Telegram settings (Supabase shelf → local file → env defaults). */
export async function loadTelegramSettingsResolved(): Promise<TelegramNotificationSettings> {
  const fromShelf = await loadTelegramSettingsFromShelf();
  const fromDisk = loadTelegramNotificationSettings();
  const pick =
    fromShelf && fromShelf.bots.length > 0
      ? fromShelf
      : fromDisk.bots.length > 0
        ? fromDisk
        : null;
  if (!pick) return enrichBotTokens(defaultSettingsFromEnv());
  return enrichBotTokens(pick);
}

export async function loadTelegramSendLogResolved(): Promise<TelegramSendLogEntry[]> {
  const fromShelf = await loadTelegramSendLogFromShelf();
  if (fromShelf && fromShelf.length > 0) return fromShelf;
  return loadTelegramSendLog();
}

export async function persistTelegramSendLog(entries: TelegramSendLogEntry[]): Promise<void> {
  const trimmed = entries.filter(
    (e) => e.sentAt >= new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
  );
  saveTelegramSendLog(trimmed);
  await saveTelegramSendLogToShelf(trimmed);
}

export function settingsDiagnostics(settings: TelegramNotificationSettings) {
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  return {
    botCount: settings.bots.length,
    enabledBots: settings.bots.filter((b) => b.enabled).length,
    usable: hasUsableBots(settings.bots),
    shelf: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && supabaseKey),
    cron: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim()),
  };
}

/** Creates data/admin/telegramNotifications.json from env when missing (VPS / first boot). */
export function bootstrapTelegramSettingsOnStartup(): void {
  const disk = loadTelegramNotificationSettings();
  if (disk.bots.length > 0) return;
  const defaults = enrichBotTokens(defaultSettingsFromEnv());
  if (!defaults.bots.some((b) => b.token?.trim())) return;
  saveTelegramNotificationSettings(defaults);
  void saveTelegramSettingsToShelf(defaults);
}
