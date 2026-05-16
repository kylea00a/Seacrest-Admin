import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/adminApiAuth";
import { runTelegramCalendarDue } from "@/lib/telegramCalendarDue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function isAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.TELEGRAM_CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  if (secret && (auth === `Bearer ${secret}` || url.searchParams.get("secret") === secret)) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  if (req.headers.get("x-telegram-cron") === "internal") return true;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  const admin = await requireSuperadmin(req);
  return !(admin instanceof NextResponse);
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const triggerBotId = url.searchParams.get("botId")?.trim() || "";
  const triggerSchedule = url.searchParams.get("scheduleTime")?.trim() || "";
  const trigger =
    triggerBotId && triggerSchedule ? { botId: triggerBotId, scheduleTime: triggerSchedule } : undefined;

  const result = await runTelegramCalendarDue({
    date: url.searchParams.get("date")?.trim(),
    time: url.searchParams.get("time")?.trim(),
    force: url.searchParams.get("force") === "1",
    runNow: url.searchParams.get("runNow") === "1",
    trigger,
  });

  if (!result.ok && result.failed?.length) {
    return NextResponse.json(result, { status: 502 });
  }

  return NextResponse.json(result);
}
