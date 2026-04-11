import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { splitOrdersIntoBulkGroups } from "@/data/admin/ordersBulkSplit";
import { parseOrdersWorkbook } from "@/data/admin/ordersParse";
import { productNamesFromSettings } from "@/data/admin/productSettings";
import { saveOrdersStaging } from "@/data/admin/orders";
import { loadAdminSettings } from "@/data/admin/storage";
import type { OrdersImportSummary } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDateOnly(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "import");
  if (auth instanceof NextResponse) return auth;
  const form = await req.formData();
  const file = form.get("file");
  const date = form.get("date");
  const bulkRaw = form.get("bulk");
  const bulk = bulkRaw === "1" || bulkRaw === "true" || bulkRaw === "on";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `file`." }, { status: 400 });
  }

  if (!bulk && !isDateOnly(date)) {
    return NextResponse.json({ error: "Missing/invalid `date` (YYYY-MM-DD)." }, { status: 400 });
  }

  if (bulk && date != null && String(date).trim() !== "" && !isDateOnly(date)) {
    return NextResponse.json({ error: "Invalid optional fallback date (use YYYY-MM-DD)." }, { status: 400 });
  }

  const fallbackIso = bulk && isDateOnly(date) ? date : null;

  const buf = Buffer.from(await file.arrayBuffer());
  const productKeys = productNamesFromSettings(loadAdminSettings().products);
  let parsed;
  try {
    parsed = parseOrdersWorkbook(buf, { productKeys });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to parse Excel: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 },
    );
  }

  const importedAt = new Date().toISOString();

  if (bulk) {
    const { groups, skippedNoDate } = splitOrdersIntoBulkGroups(parsed.rows, fallbackIso);
    if (groups.length === 0) {
      return NextResponse.json(
        {
          error:
            skippedNoDate > 0
              ? `No rows could be assigned to a calendar day (${skippedNoDate} row(s) had no usable Order date). Set an optional fallback date or fix the Order date column.`
              : "No rows to import.",
        },
        { status: 400 },
      );
    }

    const dates = groups.map((g) => g.date);
    const token = randomUUID();
    saveOrdersStaging(token, {
      mode: "bulk",
      filename: file.name,
      importedAt,
      parsed,
      groups,
    });

    const dayCounts = groups.map((g) => ({ date: g.date, rows: g.indices.length }));
    const summary: OrdersImportSummary = {
      date: dates[0]!,
      filename: file.name,
      importedAt,
      totalRows: parsed.rows.length,
      totals: parsed.totals,
      subscriptionsCountTotal: parsed.subscriptionsCountTotal,
      memberCounts: parsed.memberCounts,
      productCounts: parsed.productCounts,
    };

    return NextResponse.json({
      bulk: true,
      token,
      summary,
      bulkMeta: {
        totalRows: parsed.rows.length,
        totalDays: groups.length,
        dateMin: dates[0],
        dateMax: dates[dates.length - 1]!,
        skippedNoDate,
        filename: file.name,
      },
      dayCounts,
      previewRows: parsed.rows.slice(0, 200),
    });
  }

  const summary: OrdersImportSummary = {
    date: date as string,
    filename: file.name,
    importedAt,
    totalRows: parsed.rows.length,
    totals: parsed.totals,
    subscriptionsCountTotal: parsed.subscriptionsCountTotal,
    memberCounts: parsed.memberCounts,
    productCounts: parsed.productCounts,
  };

  const token = randomUUID();
  saveOrdersStaging(token, {
    date: date as string,
    filename: file.name,
    importedAt,
    parsed,
    summary,
  });

  return NextResponse.json({
    bulk: false,
    token,
    summary,
    previewRows: parsed.rows.slice(0, 200),
  });
}
