import { NextResponse } from "next/server";
import Papa from "papaparse";

export const dynamic = "force-dynamic";

type ParsedRow = Record<string, unknown>;

export async function GET() {
  const csvUrl =
    process.env.SHEET_CSV_URL ??
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRllhCUGTRkS9IC12OVO83hD7bZ9VhQLnrgoox9hfErPGvjw_lSuppjByuySSS20ezhaKqShY-GyIdO/pub?output=csv";
  if (!csvUrl) {
    return NextResponse.json(
      {
        error:
          "Missing env var SHEET_CSV_URL. Set it to a public CSV URL (e.g. a Google Sheet published as CSV).",
      },
      { status: 400 },
    );
  }

  let res: Response;
  try {
    res = await fetch(csvUrl, { cache: "no-store" });
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch CSV_URL: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      {
        error: `CSV_URL responded with ${res.status} ${res.statusText}`,
        csvUrl,
      },
      { status: 502 },
    );
  }

  const csvText = await res.text();

  const parsed = Papa.parse<ParsedRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors?.length) {
    return NextResponse.json(
      {
        error: "CSV parse error",
        details: parsed.errors,
      },
      { status: 400 },
    );
  }

  const rows = (parsed.data ?? []).filter(
    (r) => r && Object.keys(r).some((k) => String(r[k] ?? "").trim() !== ""),
  );
  const columns =
    rows[0] ? Object.keys(rows[0]) : parsed.meta?.fields ?? [];

  return NextResponse.json({ columns, rows });
}

