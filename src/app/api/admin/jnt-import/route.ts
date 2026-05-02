import { NextResponse } from "next/server";
import { parseJntImportWorkbook } from "@/data/admin/jntImportParse";
import { loadJntImport, saveJntImport } from "@/data/admin/storage";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;
  const data = loadJntImport();
  return NextResponse.json(data);
}

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

  const importedAt = new Date().toISOString();
  const payload = {
    importedAt,
    filename: file.name || "jnt-import.xlsx",
    rows,
  };
  saveJntImport(payload);

  return NextResponse.json({
    ok: true,
    importedAt,
    filename: payload.filename,
    rowCount: rows.length,
  });
}
