import { NextResponse } from "next/server";
import {
  appendJntImport,
  deleteJntImportStaging,
  readJntImportStaging,
} from "@/data/admin/jntImportHistory";
import type { JntImportFile, JntImportIndexEntry, JntImportRow } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isJntImportRow(v: unknown): v is JntImportRow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.waybillNumber === "string" &&
    typeof r.receiver === "string" &&
    typeof r.shipDateYmd === "string"
  );
}

function isJntImportFile(v: unknown): v is JntImportFile {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.importedAt !== "string" || typeof o.filename !== "string") return false;
  if (!Array.isArray(o.rows)) return false;
  return o.rows.every(isJntImportRow);
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Missing `token`." }, { status: 400 });

  const raw = readJntImportStaging(token);
  if (raw == null) {
    return NextResponse.json({ error: "Preview not found or expired." }, { status: 404 });
  }
  if (!isJntImportFile(raw)) {
    return NextResponse.json({ error: "Invalid staged import." }, { status: 400 });
  }

  const entry: JntImportIndexEntry = appendJntImport(raw);
  deleteJntImportStaging(token);

  return NextResponse.json({
    ok: true,
    entry,
    rowCount: raw.rows.length,
  });
}
