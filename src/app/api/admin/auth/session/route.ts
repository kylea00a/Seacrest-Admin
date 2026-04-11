import { NextResponse } from "next/server";
import { accountCount } from "@/data/admin/accountsStore";
import { getAdminAccountFromRequest, toSafeAccount } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (accountCount() === 0) {
    return NextResponse.json({ needsSetup: true, account: null });
  }
  const account = await getAdminAccountFromRequest(request);
  if (!account) {
    return NextResponse.json({ needsSetup: false, account: null }, { status: 401 });
  }
  return NextResponse.json({ needsSetup: false, account: toSafeAccount(account) });
}
