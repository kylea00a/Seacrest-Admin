import { NextResponse } from "next/server";
import { buildPayoutList } from "@/data/admin/walletPayout";
import { loadPayoutReceipts, loadWalletTransactions, savePayoutReceipts } from "@/data/admin/walletStore";
import type { WalletPayoutReceipt } from "@/data/admin/types";
import { requireApiAnyPermission, requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type PayoutRowJson = {
  id: string;
  date: string;
  referenceNumber: string;
  distributorName: string;
  bank: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  paid: boolean;
  receiptNumber: string;
};

export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, ["pettyCash"]);
  if (auth instanceof NextResponse) return auth;

  const file = loadWalletTransactions();
  const receipts = loadPayoutReceipts();
  const base = buildPayoutList(file.rows);

  const payouts: PayoutRowJson[] = base.map((p) => {
    const r = receipts[p.id];
    return {
      ...p,
      paid: Boolean(r?.paid),
      receiptNumber: r?.receiptNumber?.trim() ?? "",
    };
  });

  return NextResponse.json({ payouts, walletImportedAt: file.importedAt, walletFilename: file.filename });
}

export async function PATCH(req: Request) {
  const auth = await requireApiPermission(req, "pettyCash");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as { id?: string; paid?: boolean; receiptNumber?: string };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });

  const paid = Boolean(body.paid);
  const receiptNumber = typeof body.receiptNumber === "string" ? body.receiptNumber.trim() : "";

  const file = loadWalletTransactions();
  const payoutIds = new Set(buildPayoutList(file.rows).map((p) => p.id));
  if (!payoutIds.has(id)) {
    return NextResponse.json({ error: "Unknown payout id." }, { status: 400 });
  }

  if (paid && !receiptNumber) {
    return NextResponse.json({ error: "Receipt number is required when marking paid." }, { status: 400 });
  }

  const map = loadPayoutReceipts();
  const next: WalletPayoutReceipt = paid
    ? { paid: true, receiptNumber }
    : { paid: false, receiptNumber: "" };
  map[id] = next;
  savePayoutReceipts(map);

  return NextResponse.json({ ok: true, id, ...next });
}
