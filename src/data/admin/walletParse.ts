import * as XLSX from "xlsx";
import type { WalletTransactionRow } from "./types";

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function normalizeCell(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 30_000 && v < 600_000) {
      const epoch = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(epoch);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    return String(v);
  }
  return String(v).trim();
}

function parseNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = normalizeCell(v).replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Prefer full datetime from Updated at; else transaction date at local midnight. */
export function computeSortTimeMs(transactionDateYmd: string, updatedAtRaw?: string): number {
  const u = updatedAtRaw?.trim();
  if (u) {
    const isoGuess = u.includes("T") ? u : u.replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    const t = Date.parse(isoGuess);
    if (!Number.isNaN(t)) return t;
  }
  const d = /^\d{4}-\d{2}-\d{2}$/.test(transactionDateYmd) ? transactionDateYmd : "1970-01-01";
  return Date.parse(`${d}T00:00:00`);
}

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

function findColIndex(headerRow: string[], re: RegExp): number {
  return headerRow.findIndex((h) => re.test(String(h ?? "").trim()));
}

function stableRowId(
  rawId: unknown,
  reference: string,
  date: string,
  amount: number,
  notes: string,
  rowIndex: number,
): string {
  const idStr = rawId != null && String(rawId).trim() !== "" ? String(rawId).trim() : "";
  if (idStr) return `id:${idStr}`;
  return `row:${rowIndex}|${reference}|${date}|${amount}|${shortHash(notes)}`;
}

/**
 * Parse first sheet of wallet export workbook.
 * Ignores Balance column. Uses Transaction date / Transaction d for date and sorting (with Updated at for time when present).
 */
export function parseWalletTransactionsWorkbook(buf: Buffer): WalletTransactionRow[] {
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

  const headerRow = (rawRows[0] ?? []).map((c) => String(c ?? "").trim());
  const idxId = findColIndex(headerRow, /^\s*id\s*$/i);
  const idxRef = findColIndex(headerRow, /reference/i);
  const idxDistId = findColIndex(headerRow, /distributor\s*id/i);
  const idxDistName = findColIndex(headerRow, /distributor\s*n/i);
  const idxAmount = findColIndex(headerRow, /^\s*amount\s*$/i);
  const idxNotes = findColIndex(headerRow, /^\s*notes\s*$/i);
  const idxTxnDate = findColIndex(headerRow, /transaction\s*d/i);
  const idxUpdated = findColIndex(headerRow, /updated\s*at/i);

  const need = [idxRef, idxAmount, idxNotes, idxTxnDate];
  if (need.some((i) => i < 0)) {
    throw new Error(
      "Could not find required columns. Expected headers like: Reference nu, Amount, Notes, Transaction d.",
    );
  }

  const out: WalletTransactionRow[] = [];

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;

    const referenceNumber = idxRef >= 0 ? normalizeCell(row[idxRef]) : "";
    const notes = idxNotes >= 0 ? normalizeCell(row[idxNotes]) : "";
    const amount = idxAmount >= 0 ? parseNumber(row[idxAmount]) : 0;
    const updatedAt = idxUpdated >= 0 ? normalizeCell(row[idxUpdated]) : "";

    let transactionDate = idxTxnDate >= 0 ? parseYmdFromCell(row[idxTxnDate]) : "";
    if (!transactionDate && idxTxnDate >= 0) {
      transactionDate = parseYmdFromCell(normalizeCell(row[idxTxnDate]));
    }

    if (!referenceNumber && !notes && amount === 0) continue;

    if (!transactionDate) transactionDate = "1970-01-01";

    const distributorId = idxDistId >= 0 ? normalizeCell(row[idxDistId]) : "";
    const distributorName = idxDistName >= 0 ? normalizeCell(row[idxDistName]) : "";
    const rawId = idxId >= 0 ? row[idxId] : undefined;
    const id = stableRowId(rawId, referenceNumber, transactionDate, amount, notes, r + 1);
    const sortTimeMs = computeSortTimeMs(transactionDate, updatedAt || undefined);

    out.push({
      id,
      referenceNumber,
      distributorId,
      distributorName,
      amount,
      notes,
      transactionDate,
      updatedAt: updatedAt || undefined,
      sortTimeMs,
    });
  }

  return out;
}
