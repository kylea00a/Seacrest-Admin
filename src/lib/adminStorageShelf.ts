import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { TelegramNotificationSettings, TelegramSendLogEntry } from "@/data/admin/types";

const TABLE = "admin_storage_backup";
export const TELEGRAM_SETTINGS_KEY = "telegramNotifications.json";
export const TELEGRAM_SEND_LOG_KEY = "telegramSendLog.json";

let client: SupabaseClient | null | undefined;

function getShelfClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!url || !key) {
    client = null;
    return null;
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export function isAdminShelfConfigured(): boolean {
  return getShelfClient() !== null;
}

export async function shelfReadJson<T>(storageKey: string): Promise<T | null> {
  const sb = getShelfClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE)
    .select("payload")
    .eq("storage_key", storageKey)
    .maybeSingle();
  if (error || !data?.payload) return null;
  return data.payload as T;
}

export async function shelfWriteJson<T>(storageKey: string, payload: T): Promise<boolean> {
  const sb = getShelfClient();
  if (!sb) return false;
  const { error } = await sb.from(TABLE).upsert(
    {
      storage_key: storageKey,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "storage_key" },
  );
  return !error;
}

export async function loadTelegramSettingsFromShelf(): Promise<TelegramNotificationSettings | null> {
  return shelfReadJson<TelegramNotificationSettings>(TELEGRAM_SETTINGS_KEY);
}

export async function saveTelegramSettingsToShelf(settings: TelegramNotificationSettings): Promise<void> {
  await shelfWriteJson(TELEGRAM_SETTINGS_KEY, settings);
}

export async function loadTelegramSendLogFromShelf(): Promise<TelegramSendLogEntry[] | null> {
  return shelfReadJson<TelegramSendLogEntry[]>(TELEGRAM_SEND_LOG_KEY);
}

export async function saveTelegramSendLogToShelf(entries: TelegramSendLogEntry[]): Promise<void> {
  await shelfWriteJson(TELEGRAM_SEND_LOG_KEY, entries);
}
