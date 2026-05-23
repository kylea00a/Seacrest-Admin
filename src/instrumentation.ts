export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { startTelegramCronRunner } = await import("@/lib/telegramCronRunner");
  startTelegramCronRunner();
  const { startJntTrackingCronRunner } = await import("@/lib/jntTrackingCronRunner");
  startJntTrackingCronRunner();
}
