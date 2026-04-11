import { NextResponse } from "next/server";
import { buildBulkSummaryForDay, buildDayParsedFromIndices } from "@/data/admin/ordersBulkSplit";
import type { OrdersDayParsed } from "@/data/admin/ordersParse";
import { deleteOrdersStaging, readOrdersStaging, saveOrdersDay, upsertOrdersIndex } from "@/data/admin/orders";
import { productNamesFromSettings } from "@/data/admin/productSettings";
import { loadAdminSettings } from "@/data/admin/storage";
import type { OrdersImportSummary } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BulkGroup = { date: string; indices: number[] };

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "import");
  if (auth instanceof NextResponse) return auth;
  const body = (await req.json()) as { token?: unknown };
  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Missing `token`." }, { status: 400 });

  const stagingUnknown = readOrdersStaging(token);
  const staging = typeof stagingUnknown === "object" && stagingUnknown ? (stagingUnknown as Record<string, unknown>) : null;
  if (!staging) return NextResponse.json({ error: "Preview not found or expired." }, { status: 404 });

  const mode = staging["mode"];
  if (mode === "bulk") {
    const filename = typeof staging["filename"] === "string" ? staging["filename"] : "";
    const importedAt = typeof staging["importedAt"] === "string" ? staging["importedAt"] : "";
    const parsedUnknown = staging["parsed"];
    const groupsUnknown = staging["groups"];

    if (!filename || !importedAt || !parsedUnknown || !Array.isArray(groupsUnknown)) {
      return NextResponse.json({ error: "Invalid bulk staging payload." }, { status: 400 });
    }

    const fullParsed = parsedUnknown as OrdersDayParsed;
    const groups = groupsUnknown as BulkGroup[];
    const productKeys = productNamesFromSettings(loadAdminSettings().products);

    const sheetName =
      typeof fullParsed.sheetName === "string" ? fullParsed.sheetName : undefined;

    const summaries: OrdersImportSummary[] = [];

    for (const g of groups) {
      if (!g.date || !/^\d{4}-\d{2}-\d{2}$/.test(g.date) || !Array.isArray(g.indices)) {
        return NextResponse.json({ error: "Invalid bulk day group." }, { status: 400 });
      }
      const dayParsed = buildDayParsedFromIndices(fullParsed, g.indices, productKeys);
      const summary = buildBulkSummaryForDay(g.date, filename, importedAt, g.indices.length, dayParsed);
      saveOrdersDay(g.date, { summary, sheetName, parsed: dayParsed });
      upsertOrdersIndex(summary);
      summaries.push(summary);
    }

    deleteOrdersStaging(token);
    return NextResponse.json({ bulk: true, summaries, count: summaries.length });
  }

  const summary = staging["summary"] as OrdersImportSummary | undefined;
  const date = typeof staging["date"] === "string" ? (staging["date"] as string) : undefined;
  if (!summary || !date) return NextResponse.json({ error: "Invalid staging payload." }, { status: 400 });

  const parsed = staging["parsed"];
  const sheetName =
    typeof parsed === "object" &&
    parsed !== null &&
    "sheetName" in (parsed as Record<string, unknown>) &&
    typeof (parsed as Record<string, unknown>)["sheetName"] === "string"
      ? ((parsed as Record<string, unknown>)["sheetName"] as string)
      : undefined;
  saveOrdersDay(date, { summary, sheetName, parsed });
  upsertOrdersIndex(summary);
  deleteOrdersStaging(token);

  return NextResponse.json({ summary });
}
