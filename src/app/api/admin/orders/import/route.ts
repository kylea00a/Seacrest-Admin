import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "import");
  if (auth instanceof NextResponse) return auth;
  // Backwards-compatible endpoint: direct imports are deprecated in favor of preview+commit.
  // Keep route for older clients but instruct to use new workflow.
  return NextResponse.json(
    { error: "Use /api/admin/orders/preview then /api/admin/orders/commit." },
    { status: 410 },
  );
}

