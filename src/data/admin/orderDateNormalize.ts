/**
 * Normalize Excel / text order dates to YYYY-MM-DD for bulk imports.
 */

function excelSerialToIso(serial: number): string | null {
  const whole = Math.floor(serial);
  if (whole < 1 || whole > 600000) return null;
  // Excel serial days since 1899-12-30 (UTC) → Unix ms
  const ms = Date.UTC(1899, 11, 30) + whole * 86400000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1990 || y > 2100) return null;
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Convert a cell value (string, number serial, etc.) to YYYY-MM-DD or null.
 */
export function normalizeOrderDateToIso(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input === "number" && Number.isFinite(input)) {
    return excelSerialToIso(input);
  }
  const s = String(input).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

  const n = Number(s.replace(/,/g, ""));
  if (Number.isFinite(n) && n > 30000 && n < 600000 && !/[^\d.\s\-]/.test(s)) {
    const iso = excelSerialToIso(n);
    if (iso) return iso;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    const y = d.getFullYear();
    if (y < 1990 || y > 2100) return null;
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const slash = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (slash) {
    let a = parseInt(slash[1], 10);
    let b = parseInt(slash[2], 10);
    let y = parseInt(slash[3], 10);
    if (y < 100) y += y < 50 ? 2000 : 1900;
    let month: number;
    let day: number;
    if (a > 12) {
      day = a;
      month = b;
    } else if (b > 12) {
      month = a;
      day = b;
    } else {
      month = a;
      day = b;
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${y}-${mm}-${dd}`;
  }

  return null;
}
