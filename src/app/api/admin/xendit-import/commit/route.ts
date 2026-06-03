import { NextResponse } from "next/server";
import {
  appendXenditImport,
  deleteXenditImportStaging,
  readXenditImportStaging,
} from "@/data/admin/xenditImportHistory";
import type { XenditImportFile, XenditImportIndexEntry, XenditImportRow } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isXenditImportRow(v: unknown): v is XenditImportRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.invoiceNumber === "string" &&
    typeof r.paymentDateYmd === "string" &&
    typeof r.amount === "number"
  );
}

function isXenditImportFile(v: unknown): v is XenditImportFile {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.importedAt !== "string" || typeof o.filename !== "string") return false;
  if (typeof o.startDate !== "string" || typeof o.endDate !== "string") return false;
  if (!Array.isArray(o.rows)) return false;
  return o.rows.every(isXenditImportRow);
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "salesReport");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Missing `token`." }, { status: 400 });

  const raw = readXenditImportStaging(token);
  if (raw == null) {
    return NextResponse.json({ error: "Preview not found or expired." }, { status: 404 });
  }
  if (!isXenditImportFile(raw)) {
    return NextResponse.json({ error: "Invalid staged import." }, { status: 400 });
  }

  const entry: XenditImportIndexEntry = appendXenditImport(raw);
  deleteXenditImportStaging(token);

  return NextResponse.json({
    ok: true,
    entry,
    rowCount: raw.rows.length,
  });
}
