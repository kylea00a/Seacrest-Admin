import { NextResponse } from "next/server";
import fs from "fs";
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
  const cpuCount = os.cpus().length;
  const load1 = Math.round((load[0] ?? 0) * 100) / 100;
  const loadPct = cpuCount > 0 ? Math.min(100, Math.round((load1 / cpuCount) * 100)) : 0;

  let diskTotalMB = 0;
  let diskUsedMB = 0;
  let diskUsedPct = 0;
  try {
    const stat = fs.statfsSync("/");
    const totalBytes = stat.blocks * stat.bsize;
    const freeBytes = stat.bavail * stat.bsize;
    diskTotalMB = mb(totalBytes);
    diskUsedMB = mb(Math.max(0, totalBytes - freeBytes));
    diskUsedPct = totalBytes > 0 ? Math.round((diskUsedMB / diskTotalMB) * 100) : 0;
  } catch {
    /* statfs unavailable */
  }

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
      load1,
      load5: Math.round((load[1] ?? 0) * 100) / 100,
      load15: Math.round((load[2] ?? 0) * 100) / 100,
      cpuCount,
      loadPct,
      diskTotalMB,
      diskUsedMB,
      diskUsedPct,
      platform: os.platform(),
    },
  });
}

