import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { parseXenditCsv } from "@/data/admin/xenditImportParse";
import { saveXenditImportStaging } from "@/data/admin/xenditImportHistory";
import type { XenditImportFile } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PREVIEW_ROW_CAP = 200;

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "salesReport");
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get("file");
  const startRaw = form.get("startDate");
  const endRaw = form.get("endDate");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `file`." }, { status: 400 });
  }
  if (!isDateOnly(startRaw) || !isDateOnly(endRaw)) {
    return NextResponse.json({ error: "Missing/invalid `startDate` and `endDate` (YYYY-MM-DD)." }, { status: 400 });
  }
  const start = startRaw <= endRaw ? startRaw : endRaw;
  const end = startRaw <= endRaw ? endRaw : startRaw;

  const text = await file.text();
  let rows;
  try {
    rows = parseXenditCsv(text, { start, end });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse CSV." },
      { status: 400 },
    );
  }

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error:
          "No QRPH rows found in this date range. Check Payment Channel, Reference, Amount, and Payment Date columns.",
      },
      { status: 400 },
    );
  }

  const importedAt = new Date().toISOString();
  const filename = file.name || "xendit-transactions.csv";
  const payload: XenditImportFile = {
    importedAt,
    filename,
    startDate: start,
    endDate: end,
    rows,
  };

  const token = randomUUID();
  saveXenditImportStaging(token, payload);

  return NextResponse.json({
    token,
    importedAt,
    filename,
    startDate: start,
    endDate: end,
    totalRows: rows.length,
    previewRows: rows.slice(0, PREVIEW_ROW_CAP),
  });
}
