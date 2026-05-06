import { NextResponse } from "next/server";
import type { WalletTransactionRow, WalletTransactionsFile } from "@/data/admin/types";
import {
  deleteWalletTransactionsStaging,
  prunePayoutReceiptsForRowIds,
  readWalletTransactionsStaging,
  saveWalletTransactions,
} from "@/data/admin/walletStore";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isWalletRow(v: unknown): v is WalletTransactionRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.referenceNumber === "string" &&
    typeof r.distributorId === "string" &&
    typeof r.distributorName === "string" &&
    typeof r.amount === "number" &&
    typeof r.notes === "string" &&
    typeof r.transactionDate === "string" &&
    typeof r.sortTimeMs === "number"
  );
}

function isWalletFile(v: unknown): v is WalletTransactionsFile {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.importedAt !== "string" || typeof o.filename !== "string") return false;
  if (!Array.isArray(o.rows)) return false;
  return o.rows.every(isWalletRow);
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "pettyCash");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Missing `token`." }, { status: 400 });

  const raw = readWalletTransactionsStaging(token);
  if (raw == null) return NextResponse.json({ error: "Preview not found or expired." }, { status: 404 });
  if (!isWalletFile(raw)) return NextResponse.json({ error: "Invalid staged import." }, { status: 400 });

  saveWalletTransactions(raw);
  const ids = new Set(raw.rows.map((r) => r.id));
  prunePayoutReceiptsForRowIds(ids);
  deleteWalletTransactionsStaging(token);

  return NextResponse.json({ ok: true, rowCount: raw.rows.length, importedAt: raw.importedAt, filename: raw.filename });
}

