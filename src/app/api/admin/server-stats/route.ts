import { NextResponse } from "next/server";
import os from "os";
import { requireApiSession } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function mb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

export async function GET(req: Request) {
  const auth = await requireApiSession(req);
  if (auth instanceof NextResponse) return auth;

  const mu = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const load = os.loadavg(); // [1,5,15]

  return NextResponse.json({
    now: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    node: {
      rssMB: mb(mu.rss),
      heapUsedMB: mb(mu.heapUsed),
      heapTotalMB: mb(mu.heapTotal),
      externalMB: mb(mu.external),
    },
    os: {
      totalMB: mb(totalMem),
      freeMB: mb(freeMem),
      usedMB: mb(Math.max(0, totalMem - freeMem)),
      load1: Math.round((load[0] ?? 0) * 100) / 100,
      load5: Math.round((load[1] ?? 0) * 100) / 100,
      load15: Math.round((load[2] ?? 0) * 100) / 100,
      cpuCount: os.cpus().length,
      platform: os.platform(),
    },
  });
}

