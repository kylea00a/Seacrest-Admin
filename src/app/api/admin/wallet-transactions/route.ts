import { NextResponse } from "next/server";
import { parseWalletTransactionsWorkbook } from "@/data/admin/walletParse";
import { loadWalletTransactions, prunePayoutReceiptsForRowIds, saveWalletTransactions } from "@/data/admin/walletStore";
import { requireApiAnyPermission, requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, ["pettyCash"]);
  if (auth instanceof NextResponse) return auth;
  const data = loadWalletTransactions();
  return NextResponse.json(data);
}

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

  const importedAt = new Date().toISOString();
  saveWalletTransactions({
    importedAt,
    filename: file.name || "wallet.xlsx",
    rows,
  });

  const ids = new Set(rows.map((r) => r.id));
  prunePayoutReceiptsForRowIds(ids);

  return NextResponse.json({
    ok: true,
    importedAt,
    filename: file.name || "wallet.xlsx",
    rowCount: rows.length,
  });
}
