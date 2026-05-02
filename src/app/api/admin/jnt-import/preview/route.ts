import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { parseJntImportWorkbook } from "@/data/admin/jntImportParse";
import { saveJntImportStaging } from "@/data/admin/jntImportHistory";
import type { JntImportFile } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PREVIEW_ROW_CAP = 200;

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `file`." }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let rows;
  try {
    rows = parseJntImportWorkbook(buf);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse Excel." },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No data rows found. Ensure the file has Waybill and Receiver columns (header row is detected automatically).",
      },
      { status: 400 },
    );
  }

  const importedAt = new Date().toISOString();
  const filename = file.name || "jnt-import.xlsx";
  const payload: JntImportFile = {
    importedAt,
    filename,
    rows,
  };

  const token = randomUUID();
  saveJntImportStaging(token, payload);

  return NextResponse.json({
    token,
    importedAt,
    filename,
    totalRows: rows.length,
    previewRows: rows.slice(0, PREVIEW_ROW_CAP),
  });
}
