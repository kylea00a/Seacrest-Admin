import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  // Backwards-compatible endpoint: direct imports are deprecated in favor of preview+commit.
  // Keep route for older clients but instruct to use new workflow.
  return NextResponse.json(
    { error: "Use /api/admin/orders/preview then /api/admin/orders/commit." },
    { status: 410 },
  );
}

