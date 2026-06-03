import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { XenditImportFile, XenditImportIndexEntry, XenditImportRow } from "./types";

const PROJECT_ROOT = process.cwd();
const ADMIN_DATA_DIR = path.join(PROJECT_ROOT, "data", "admin");
const XENDIT_IMPORT_INDEX_FILE = path.join(ADMIN_DATA_DIR, "xenditImportIndex.json");
const XENDIT_IMPORT_HISTORY_DIR = path.join(ADMIN_DATA_DIR, "xendit_import_history");
const XENDIT_IMPORT_STAGING_DIR = path.join(ADMIN_DATA_DIR, "xendit_import_staging");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(filePath: string, value: T) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function historyPath(id: string): string {
  return path.join(XENDIT_IMPORT_HISTORY_DIR, `${id}.json`);
}

type IndexShape = { imports: XenditImportIndexEntry[] };

function loadIndexRaw(): IndexShape {
  return readJson<IndexShape>(XENDIT_IMPORT_INDEX_FILE, { imports: [] });
}

export function loadXenditImportIndex(): XenditImportIndexEntry[] {
  return loadIndexRaw().imports;
}

export function loadXenditImportById(id: string): XenditImportFile | null {
  const p = historyPath(id);
  if (!fs.existsSync(p)) return null;
  return readJson<XenditImportFile | null>(p, null);
}

export function loadMergedXenditImportRows(): XenditImportRow[] {
  const { imports } = loadIndexRaw();
  const out: XenditImportRow[] = [];
  for (const e of imports) {
    const file = loadXenditImportById(e.id);
    if (file?.rows?.length) out.push(...file.rows);
  }
  return out;
}

/** Latest QRPH amount per normalized invoice (newer imports win on duplicate). */
export function loadXenditAmountByInvoice(): Map<string, number> {
  const rows = loadMergedXenditImportRows();
  const map = new Map<string, number>();
  for (const r of rows) {
    const inv = (r.invoiceNumber ?? "").trim();
    if (!inv) continue;
    map.set(inv, r.amount);
  }
  return map;
}

export function appendXenditImport(file: XenditImportFile): XenditImportIndexEntry {
  ensureDir(XENDIT_IMPORT_HISTORY_DIR);
  const id = randomUUID();
  const entry: XenditImportIndexEntry = {
    id,
    importedAt: file.importedAt,
    filename: file.filename,
    rowCount: file.rows.length,
    startDate: file.startDate,
    endDate: file.endDate,
  };
  writeJson(historyPath(id), file);
  const idx = loadIndexRaw();
  idx.imports.unshift(entry);
  writeJson(XENDIT_IMPORT_INDEX_FILE, idx);
  return entry;
}

export function deleteXenditImportById(id: string): boolean {
  const idx = loadIndexRaw();
  const before = idx.imports.length;
  idx.imports = idx.imports.filter((e) => e.id !== id);
  if (idx.imports.length === before) return false;
  writeJson(XENDIT_IMPORT_INDEX_FILE, idx);
  const p = historyPath(id);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
  return true;
}

export function deleteAllXenditImports(): number {
  const idx = loadIndexRaw();
  const n = idx.imports.length;
  for (const e of idx.imports) {
    const p = historyPath(e.id);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
  writeJson(XENDIT_IMPORT_INDEX_FILE, { imports: [] });
  return n;
}

export function saveXenditImportStaging(token: string, payload: unknown) {
  ensureDir(XENDIT_IMPORT_STAGING_DIR);
  fs.writeFileSync(path.join(XENDIT_IMPORT_STAGING_DIR, `${token}.json`), JSON.stringify(payload, null, 2), "utf8");
}

export function readXenditImportStaging(token: string): unknown | null {
  const file = path.join(XENDIT_IMPORT_STAGING_DIR, `${token}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export function deleteXenditImportStaging(token: string) {
  const file = path.join(XENDIT_IMPORT_STAGING_DIR, `${token}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
