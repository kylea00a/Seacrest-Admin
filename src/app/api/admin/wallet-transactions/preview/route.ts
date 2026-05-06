import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { parseWalletTransactionsWorkbook } from "@/data/admin/walletParse";
import { saveWalletTransactionsStaging } from "@/data/admin/walletStore";
import type { WalletTransactionsFile } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PREVIEW_ROW_CAP = 200;

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "pettyCash");
  if (auth instanceof NextResponse) return auth;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `file`." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let rows;
  try {
    rows = parseWalletTransactionsWorkbook(buf);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse Excel." },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No data rows found. Ensure the sheet includes reference, amount, notes, and transaction date columns." },
      { status: 400 },
    );
  }

  const importedAt = new Date().toISOString();
  const filename = file.name || "wallet.xlsx";
  const payload: WalletTransactionsFile = {
    importedAt,
    filename,
    rows,
  };

  const token = randomUUID();
  saveWalletTransactionsStaging(token, payload);

  return NextResponse.json({
    token,
    importedAt,
    filename,
    totalRows: rows.length,
    previewRows: rows.slice(0, PREVIEW_ROW_CAP),
  });
}

