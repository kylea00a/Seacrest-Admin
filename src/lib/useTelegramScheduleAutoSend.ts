"use client";

import { useEffect } from "react";
import { manilaNowHm, manilaTodayYmd, scheduleFireKey } from "@/lib/telegramScheduleCountdown";

type BotSchedule = { id: string; enabled: boolean; schedules: Array<{ time: string; enabled: boolean }> };

async function loadEnabledBots(): Promise<BotSchedule[]> {
  const res = await fetch("/api/admin/telegram/settings", { cache: "no-store" });
  if (!res.ok) return [];
  const json = (await res.json()) as { settings?: { bots?: BotSchedule[] } };
  return (json.settings?.bots ?? []).filter((b) => b.enabled);
}

async function triggerSend(botId: string, scheduleTime: string): Promise<void> {
  const params = new URLSearchParams({ botId, scheduleTime });
  await fetch(`/api/admin/telegram/calendar-due?${params}`, { cache: "no-store" });
}

/** Fires scheduled Telegram sends at the exact Manila minute while the tab is open. */
export function useTelegramScheduleAutoSend(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    let bots: BotSchedule[] = [];
    let stopped = false;

    const refreshBots = async () => {
      try {
        bots = await loadEnabledBots();
      } catch {
        // ignore
      }
    };

    void refreshBots();
    const refreshId = window.setInterval(() => void refreshBots(), 5 * 60_000);

    const tick = () => {
      if (stopped || document.visibilityState === "hidden") return;
      const hm = manilaNowHm();
      const today = manilaTodayYmd();
      for (const bot of bots) {
        for (const s of bot.schedules) {
          if (!s.enabled || s.time !== hm) continue;
          const key = scheduleFireKey(bot.id, s.time, today);
          if (sessionStorage.getItem(`tg-fired-${key}`)) continue;
          sessionStorage.setItem(`tg-fired-${key}`, "1");
          void triggerSend(bot.id, s.time).catch(() => {
            sessionStorage.removeItem(`tg-fired-${key}`);
          });
        }
      }
    };

    tick();
    const tickId = window.setInterval(tick, 1000);

    return () => {
      stopped = true;
      window.clearInterval(refreshId);
      window.clearInterval(tickId);
    };
  }, [active]);
}
