const MANILA_TZ = "Asia/Manila";

export function manilaTodayYmd(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function manilaNowHm(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MANILA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")}`;
}

function getManilaParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour"),
    min: get("minute"),
    sec: get("second"),
  };
}

function manilaScheduleToUtcMs(y: number, mo: number, d: number, scheduleTime: string): number {
  const [sh, sm] = scheduleTime.split(":").map((x) => Number(x));
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00+08:00`;
  return new Date(iso).getTime();
}

/** Next UTC ms when `scheduleTime` (HH:mm Manila) occurs, today or tomorrow. */
export function nextScheduleTargetMs(scheduleTime: string, now = new Date()): number {
  const p = getManilaParts(now);
  let target = manilaScheduleToUtcMs(p.y, p.mo, p.d, scheduleTime);
  if (target <= now.getTime()) {
    const tomorrow = getManilaParts(new Date(now.getTime() + 86_400_000));
    target = manilaScheduleToUtcMs(tomorrow.y, tomorrow.mo, tomorrow.d, scheduleTime);
  }
  return target;
}

export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function scheduleFireKey(botId: string, scheduleTime: string, dateYmd: string): string {
  return `${dateYmd}|${scheduleTime}|${botId}`;
}
