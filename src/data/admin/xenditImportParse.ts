import type { XenditImportRow } from "./types";

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

/** Extract YYYY-MM-DD from ISO or "28 May 2023, 22:31:29" style. */
function parseYmdFromCell(v: string): string {
  const s = normalizeCell(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return "";
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
    if (joined.includes("line type") && joined.includes("reference")) return i;
  }
  return 0;
}

function colIndex(headerRow: string[], pred: (h: string) => boolean): number {
  return headerRow.findIndex((h) => pred(h));
}

/** Normalize invoice reference for matching orders (INV-…). */
export function normalizeXenditInvoiceReference(ref: string): string {
  const s = (ref ?? "").trim();
  const m = s.match(/INV-[\dA-Za-z-]+/i);
  if (m) return m[0].toUpperCase();
  return s.toUpperCase();
}

/**
 * Parse Xendit BALANCE_HISTORY_REPORT CSV.
 * Keeps only Line Type = TRANSACTION; filters payment date to [start, end].
 */
export function parseXenditCsv(
  text: string,
  range: { start: string; end: string },
): XenditImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headerIdx = findHeaderRowIndex(lines);
  const headerRow = splitCsvLine(lines[headerIdx] ?? "").map(normalizeCell);

  const idxLineType = colIndex(headerRow, (h) => /^line\s*type$/i.test(h));
  const idxReference = colIndex(headerRow, (h) => /^reference$/i.test(h));
  const idxAmount = colIndex(headerRow, (h) => /^amount$/i.test(h));
  const idxPayment = colIndex(headerRow, (h) => /payment\s*date/i.test(h));
  const idxCreatedIso = colIndex(headerRow, (h) => /created\s*date\s*iso/i.test(h));
  const idxCreated = colIndex(headerRow, (h) => /^created\s*date$/i.test(h) && !/iso/i.test(h));
  const idxCurrency = colIndex(headerRow, (h) => /^currency$/i.test(h));

  if (idxLineType < 0 || idxReference < 0 || idxAmount < 0) return [];

  const out: XenditImportRow[] = [];
  const seen = new Set<string>();

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i] ?? "");
    const lineType = normalizeCell(cells[idxLineType] ?? "").toUpperCase();
    if (lineType !== "TRANSACTION") continue;

    const reference = normalizeCell(cells[idxReference] ?? "");
    const invoiceNumber = normalizeXenditInvoiceReference(reference);
    if (!invoiceNumber) continue;

    const amount = parseAmount(cells[idxAmount] ?? "");
    if (amount <= 0) continue;

    let paymentDateYmd = "";
    if (idxPayment >= 0) paymentDateYmd = parseYmdFromCell(cells[idxPayment] ?? "");
    if (!paymentDateYmd && idxCreatedIso >= 0) paymentDateYmd = parseYmdFromCell(cells[idxCreatedIso] ?? "");
    if (!paymentDateYmd && idxCreated >= 0) paymentDateYmd = parseYmdFromCell(cells[idxCreated] ?? "");
    if (!paymentDateYmd) continue;

    if (paymentDateYmd < range.start || paymentDateYmd > range.end) continue;

    const dedupe = `${invoiceNumber}|${paymentDateYmd}|${amount}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    out.push({
      id: `xendit:${invoiceNumber}:${paymentDateYmd}:${shortHash(dedupe)}`,
      invoiceNumber,
      amount,
      paymentDateYmd,
      reference,
      currency: idxCurrency >= 0 ? normalizeCell(cells[idxCurrency] ?? "") : undefined,
    });
  }

  return out;
}
