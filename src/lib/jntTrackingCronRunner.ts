import { calendarYmdInTimeZone } from "@/data/admin/orderClaim";
import { runJntTrackingSync } from "@/lib/jntTrackingSync";

let started = false;
let running = false;
let lastRunYmd = "";

function cronEnabled(): boolean {
  if (process.env.JNT_TRACKING_CRON_DISABLED === "1") return false;
  if (process.env.NODE_ENV === "development" && process.env.JNT_TRACKING_CRON_DEV !== "1") {
    return false;
  }
  return Boolean(
    process.env.TRACKINGMORE_API_KEY?.trim() ||
      process.env.TWOCAPTCHA_API_KEY?.trim() ||
      process.env.CAPSOLVER_API_KEY?.trim() ||
      (process.env.JNT_TRACKING_VERIFY?.trim() && process.env.JNT_TRACKING_VCK?.trim()),
  );
}

function shouldRunDaily(now: Date): boolean {
  const hm = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const target = (process.env.JNT_TRACKING_CRON_TIME ?? "08:00").trim();
  const today = calendarYmdInTimeZone(now, "Asia/Manila");
  if (hm !== target) return false;
  if (lastRunYmd === today) return false;
  return true;
}

async function tick(): Promise<void> {
  if (running) return;
  if (!shouldRunDaily(new Date())) return;

  running = true;
  lastRunYmd = calendarYmdInTimeZone(new Date(), "Asia/Manila");
  try {
    const result = await runJntTrackingSync({ provider: "official" });
    console.info(
      `[jnt-tracking-cron] provider=${result.provider ?? "none"} checked=${result.checked} updated=${result.updated} errors=${result.errors.length}`,
    );
  } catch (err) {
    console.error("[jnt-tracking-cron] failed:", err instanceof Error ? err.message : err);
  } finally {
    running = false;
  }
}

/** Daily J&T status sync (Asia/Manila, default 08:00). */
export function startJntTrackingCronRunner(): void {
  if (started || !cronEnabled()) return;
  started = true;

  const intervalMs = Math.max(30_000, Number(process.env.JNT_TRACKING_CRON_INTERVAL_MS) || 60_000);
  void tick();
  setInterval(() => void tick(), intervalMs);
  console.info(`[jnt-tracking-cron] started (daily ${process.env.JNT_TRACKING_CRON_TIME ?? "08:00"} Manila)`);
}
