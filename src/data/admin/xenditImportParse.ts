import type { XenditImportRow } from "./types";

/** Xendit balance history CSV column letters (0-based): E = channel, F = reference, H = amount. */
const COL_PAYMENT_CHANNEL = 4;
const COL_REFERENCE = 5;
const COL_AMOUNT = 7;

function shortHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function normalizeCell(v: string): string {
  return (v ?? "").trim().replace(/^"|"$/g, "");
}

function parseAmount(v: string): number {
  const s = v.replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function findHeaderRowIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const row = splitCsvLine(lines[i] ?? "").map((c) => c.toLowerCase());
    const joined = row.join("\t");
    if (joined.includes("payment channel") && joined.includes("reference") && joined.includes("amount")) {
      return i;
    }
  }
  return 0;
}

function colIndex(headerRow: string[], pred: (h: string) => boolean): number {
  return headerRow.findIndex((h) => pred(h));
}

function resolveEfhIndices(headerRow: string[]): {
  idxPaymentChannel: number;
  idxReference: number;
  idxAmount: number;
} {
  const idxPaymentChannel = colIndex(headerRow, (h) => /^payment\s*channel$/i.test(h));
  const idxReference = colIndex(headerRow, (h) => /^reference$/i.test(h));
  const idxAmount = colIndex(headerRow, (h) => /^amount$/i.test(h));
  if (idxPaymentChannel >= 0 && idxReference >= 0 && idxAmount >= 0) {
    return { idxPaymentChannel, idxReference, idxAmount };
  }
  return {
    idxPaymentChannel: COL_PAYMENT_CHANNEL,
    idxReference: COL_REFERENCE,
    idxAmount: COL_AMOUNT,
  };
}

/** Normalize invoice reference for matching orders (INV-…). */
export function normalizeXenditInvoiceReference(ref: string): string {
  const s = (ref ?? "").trim();
  const m = s.match(/INV-[\dA-Za-z-]+/i);
  if (m) return m[0].toUpperCase();
  return s.toUpperCase();
}

/**
 * Parse Xendit BALANCE_HISTORY_REPORT CSV using only columns E, F, H.
 * Keeps rows where E (Payment Channel) = QRPH; F = invoice reference; H = amount.
 * `range` is stored on the import file (upload date range), not used to filter rows.
 */
export function parseXenditCsv(
  text: string,
  _range: { start: string; end: string },
): XenditImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerIdx = findHeaderRowIndex(lines);
  const headerRow = splitCsvLine(lines[headerIdx] ?? "").map(normalizeCell);
  const { idxPaymentChannel, idxReference, idxAmount } = resolveEfhIndices(headerRow);

  const out: XenditImportRow[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i] ?? "");
    const minCols = Math.max(idxPaymentChannel, idxReference, idxAmount) + 1;
    if (cells.length < minCols) continue;

    const paymentChannel = normalizeCell(cells[idxPaymentChannel] ?? "").toUpperCase();
    if (paymentChannel !== "QRPH") continue;

    const reference = normalizeCell(cells[idxReference] ?? "");
    const invoiceNumber = normalizeXenditInvoiceReference(reference);
    if (!invoiceNumber) continue;

    const amount = parseAmount(cells[idxAmount] ?? "");
    if (amount <= 0) continue;

    const dedupe = `${invoiceNumber}|${amount}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    out.push({
      id: `xendit:${invoiceNumber}:${shortHash(dedupe)}`,
      invoiceNumber,
      amount,
      paymentDateYmd: "",
      reference,
    });
  }

  return out;
}
