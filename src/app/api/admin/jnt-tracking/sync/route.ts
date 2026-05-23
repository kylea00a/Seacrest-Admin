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
  try {
    const body = (await req.json()) as { waybills?: unknown; force?: unknown };
    if (Array.isArray(body.waybills)) {
      waybills = body.waybills.filter((x) => typeof x === "string").map((x) => x.trim()).filter(Boolean);
    }
    force = body.force === true;
  } catch {
    /* empty body ok */
  }

  const result = await runJntTrackingSync({ waybills, force });
  const status = result.provider ? 200 : 503;
  return NextResponse.json(result, { status });
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await runJntTrackingSync();
  const status = result.provider ? 200 : 503;
  return NextResponse.json(result, { status });
}
