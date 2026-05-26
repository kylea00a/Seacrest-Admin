import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/adminApiAuth";
import { runJntTrackingSync } from "@/lib/jntTrackingSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function isAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.JNT_TRACKING_CRON_SECRET?.trim();
  const url = new URL(req.url);
  if (secret && (req.headers.get("authorization") === `Bearer ${secret}` || url.searchParams.get("secret") === secret)) {
    return true;
  }
  if (req.headers.get("x-jnt-tracking-cron") === "internal") return true;
  if (!secret && process.env.NODE_ENV !== "production") return true;
  const admin = await requireApiPermission(req, "delivery");
  return !(admin instanceof NextResponse);
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let waybills: string[] | undefined;
  let force = false;
  let provider: string | undefined;
  try {
    const raw = await req.text();
    if (raw.trim()) {
      const body = JSON.parse(raw) as { waybills?: unknown; force?: unknown; provider?: unknown };
      if (Array.isArray(body.waybills)) {
        waybills = body.waybills.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
      }
      force = body.force === true;
      if (typeof body.provider === "string" && body.provider.trim()) {
        provider = body.provider.trim();
      }
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const result = await runJntTrackingSync({ waybills, force, provider });
  const status = syncHttpStatus(result);
  return NextResponse.json(result, { status });
}

function syncHttpStatus(result: Awaited<ReturnType<typeof runJntTrackingSync>>): number {
  if (!result.provider) return 503;
  if (!result.ok && result.checked > 0 && result.updated === 0) return 502;
  return 200;
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider")?.trim() || undefined;
  const result = await runJntTrackingSync({ provider });
  const status = syncHttpStatus(result);
  return NextResponse.json(result, { status });
}
