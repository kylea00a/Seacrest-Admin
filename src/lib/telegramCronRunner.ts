import { runTelegramCalendarDue } from "@/lib/telegramCalendarDue";
import { bootstrapTelegramSettingsOnStartup } from "@/lib/telegramSettingsLoad";

let started = false;
let running = false;

function cronEnabled(): boolean {
  if (process.env.TELEGRAM_CRON_DISABLED === "1") return false;
  if (process.env.NODE_ENV === "development" && process.env.TELEGRAM_CRON_DEV !== "1") return false;
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runTelegramCalendarDue({});
  } catch (err) {
    console.error("[telegram-cron] tick failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

/** Starts in-process Manila schedule checks (runs with pm2 / `next start`). */
export function startTelegramCronRunner(): void {
  if (started || !cronEnabled()) return;
  started = true;
  bootstrapTelegramSettingsOnStartup();

  const intervalMs = Math.max(15_000, Number(process.env.TELEGRAM_CRON_INTERVAL_MS) || 60_000);
  void tick();
  setInterval(() => void tick(), intervalMs);
  console.info(`[telegram-cron] started (every ${intervalMs / 1000}s, Asia/Manila schedules)`);
}
