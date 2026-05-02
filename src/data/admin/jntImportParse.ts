import * as XLSX from "xlsx";
import type { JntImportRow } from "./types";

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function normalizeCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 19).replace("T", " ");
  }
  return String(v).trim();
}

/** Extract YYYY-MM-DD from "2026-05-02 00:41:40" or Excel serial. */
function parseYmdFromCell(v: unknown): string {
  const s = normalizeCell(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (typeof v === "number" && v > 30_000 && v < 600_000) {
    const epoch = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(epoch);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return "";
}

function findHeaderRowIndex(rawRows: unknown[][]): number {
  for (let i = 0; i < Math.min(40, rawRows.length); i++) {
    const cells = (rawRows[i] ?? []).map((c) => String(c ?? "").trim().toLowerCase());
    const joined = cells.join("\t");
    if (joined.includes("waybill") && joined.includes("receiver")) return i;
  }
  return 0;
}

function colIndex(headerRow: string[], pred: (h: string) => boolean): number {
  return headerRow.findIndex((h) => pred(String(h ?? "").trim()));
}

function stableId(row: Record<string, unknown>, i: number): string {
  const o = String(row["Order Number"] ?? row["order number"] ?? "").trim();
  const w = String(row["Waybill Number"] ?? row["waybill number"] ?? "").trim();
  if (w) return `wb:${w}`;
  if (o) return `ord:${o}`;
  return `r:${i}:${shortHash(JSON.stringify(row))}`;
}

/**
 * Parse first sheet of J&T Excel export (portal download).
 * Maps columns by header title (flexible matching).
 */
export function parseJntImportWorkbook(buf: Buffer): JntImportRow[] {
  const workbook = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    raw: true,
  }) as unknown[][];

  if (rawRows.length < 2) return [];

  const headerIdx = findHeaderRowIndex(rawRows);
  const headerRow = (rawRows[headerIdx] ?? []).map((c) => String(c ?? "").trim());

  const idxWaybill = colIndex(headerRow, (h) => /^waybill\s*number$/i.test(h));
  const idxReceiver = colIndex(headerRow, (h) => /^receiver$/i.test(h) && !/cellphone/i.test(h));
  const idxSubmission = colIndex(headerRow, (h) => /submission\s*time/i.test(h));
  const idxPreferred = colIndex(headerRow, (h) => /preferred\s*pickup\s*date/i.test(h));
  const idxOrder = colIndex(headerRow, (h) => /^order\s*number$/i.test(h));

  if (idxWaybill < 0 || idxReceiver < 0) return [];

  const out: JntImportRow[] = [];

  for (let r = headerIdx + 1; r < rawRows.length; r++) {
    const rowArr = rawRows[r] ?? [];
    const waybill = normalizeCell(rowArr[idxWaybill]);
    const receiver = normalizeCell(rowArr[idxReceiver]);
    if (!receiver && !waybill) continue;

    let shipYmd = "";
    let submissionRaw = "";
    if (idxSubmission >= 0) {
      submissionRaw = normalizeCell(rowArr[idxSubmission]);
      shipYmd = parseYmdFromCell(rowArr[idxSubmission]);
    }
    if (!shipYmd && idxPreferred >= 0) {
      shipYmd = parseYmdFromCell(rowArr[idxPreferred]);
    }

    const obj: Record<string, unknown> = {};
    headerRow.forEach((h, j) => {
      if (h) obj[h] = rowArr[j];
    });

    out.push({
      id: stableId(obj, r),
      waybillNumber: waybill.replace(/\s+/g, ""),
      receiver,
      shipDateYmd: shipYmd || "",
      submissionTime: submissionRaw || undefined,
      orderNumber: idxOrder >= 0 ? normalizeCell(rowArr[idxOrder]) : undefined,
    });
  }

  return out;
}
