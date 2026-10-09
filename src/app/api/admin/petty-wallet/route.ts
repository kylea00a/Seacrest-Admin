import { NextResponse } from "next/server";
import type { PettyCashLedgerTransaction } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";
import {
  getPettyFundPayload,
  handlePettyFundDecide,
  handlePettyFundDeleteLedger,
  handlePettyFundEditLedger,
  handlePettyFundRequest,
  handlePettyFundSetBalance,
} from "@/lib/pettyFundApi";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FUND = "pettyWallet" as const;

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "pettyWallet");
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json(getPettyFundPayload(FUND));
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "pettyWallet");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");
  const body = (await req.json()) as Record<string, unknown>;

  if (action === "request") return handlePettyFundRequest(FUND, body);
  if (action === "decide") return handlePettyFundDecide(FUND, body);
  if (action === "set-balance") return handlePettyFundSetBalance(FUND, body);

  if (action === "delete-ledger") {
    const auth2 = await requireApiPermission(req, "pettyWalletEdit");
    if (auth2 instanceof NextResponse) return auth2;
    return handlePettyFundDeleteLedger(FUND, body);
  }

  if (action === "edit-ledger") {
    const auth2 = await requireApiPermission(req, "pettyWalletEdit");
    if (auth2 instanceof NextResponse) return auth2;
    return handlePettyFundEditLedger(FUND, body as Partial<PettyCashLedgerTransaction> & { id?: unknown });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
