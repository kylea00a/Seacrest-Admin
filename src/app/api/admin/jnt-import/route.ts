import { NextResponse } from "next/server";
import {
  deleteAllJntImports,
  deleteJntImportById,
  loadJntImportById,
  loadJntImportIndex,
  loadMergedJntImportRows,
} from "@/data/admin/jntImportHistory";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const file = loadJntImportById(id);
    if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ file });
  }

  const imports = loadJntImportIndex();
  const rows = loadMergedJntImportRows();
  const latest = imports[0];
  return NextResponse.json({
    rows,
    imports,
    importedAt: latest?.importedAt ?? "",
    filename:
      imports.length === 0
        ? ""
        : imports.length === 1
          ? (latest?.filename ?? "")
          : `${imports.length} imports merged`,
  });
}

export async function DELETE(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  if (url.searchParams.get("all") === "1") {
    const deleted = deleteAllJntImports();
    return NextResponse.json({ ok: true, deleted });
  }
  const id = url.searchParams.get("id");
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing `id` or `all=1`." }, { status: 400 });
  }
  const ok = deleteJntImportById(id.trim());
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
