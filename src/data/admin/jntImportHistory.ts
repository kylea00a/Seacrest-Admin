import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { JntImportFile, JntImportIndexEntry, JntImportRow } from "./types";

const PROJECT_ROOT = process.cwd();
const ADMIN_DATA_DIR = path.join(PROJECT_ROOT, "data", "admin");
const JNT_IMPORT_INDEX_FILE = path.join(ADMIN_DATA_DIR, "jntImportIndex.json");
const JNT_IMPORT_HISTORY_DIR = path.join(ADMIN_DATA_DIR, "jnt_import_history");
const JNT_IMPORT_STAGING_DIR = path.join(ADMIN_DATA_DIR, "jnt_import_staging");
/** Legacy single-file storage (migrated once into history). */
const JNT_IMPORT_LEGACY_FILE = path.join(ADMIN_DATA_DIR, "jntImport.json");

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
  return path.join(JNT_IMPORT_HISTORY_DIR, `${id}.json`);
}

/** Migrate legacy `jntImport.json` into indexed history (once). */
export function migrateLegacyJntImportIfNeeded(): void {
  if (!fs.existsSync(JNT_IMPORT_LEGACY_FILE)) return;
  const legacy = readJson<JntImportFile>(JNT_IMPORT_LEGACY_FILE, {
    importedAt: "",
    filename: "",
    rows: [],
  });
  if (!legacy.rows?.length) {
    try {
      fs.unlinkSync(JNT_IMPORT_LEGACY_FILE);
    } catch {
      /* ignore */
    }
    return;
  }

  ensureDir(JNT_IMPORT_HISTORY_DIR);
  const idx = loadJntImportIndexRaw();
  const uniqueId = randomUUID();

  const entry: JntImportIndexEntry = {
    id: uniqueId,
    importedAt: legacy.importedAt || new Date().toISOString(),
    filename: legacy.filename || "migrated-import.xlsx",
    rowCount: legacy.rows.length,
  };
  writeJson(historyPath(uniqueId), {
    importedAt: entry.importedAt,
    filename: entry.filename,
    rows: legacy.rows,
  } satisfies JntImportFile);
  idx.imports.unshift(entry);
  writeJson(JNT_IMPORT_INDEX_FILE, idx);
  try {
    fs.unlinkSync(JNT_IMPORT_LEGACY_FILE);
  } catch {
    /* ignore */
  }
}

type IndexShape = { imports: JntImportIndexEntry[] };

function loadJntImportIndexRaw(): IndexShape {
  return readJson<IndexShape>(JNT_IMPORT_INDEX_FILE, { imports: [] });
}

export function loadJntImportIndex(): JntImportIndexEntry[] {
  migrateLegacyJntImportIfNeeded();
  return loadJntImportIndexRaw().imports;
}

export function loadJntImportById(id: string): JntImportFile | null {
  migrateLegacyJntImportIfNeeded();
  const p = historyPath(id);
  if (!fs.existsSync(p)) return null;
  return readJson<JntImportFile | null>(p, null);
}

export function loadMergedJntImportRows(): JntImportRow[] {
  migrateLegacyJntImportIfNeeded();
  const { imports } = loadJntImportIndexRaw();
  const out: JntImportRow[] = [];
  for (const e of imports) {
    const file = loadJntImportById(e.id);
    if (file?.rows?.length) out.push(...file.rows);
  }
  return out;
}

export function appendJntImport(file: JntImportFile): JntImportIndexEntry {
  migrateLegacyJntImportIfNeeded();
  ensureDir(JNT_IMPORT_HISTORY_DIR);
  const id = randomUUID();
  const entry: JntImportIndexEntry = {
    id,
    importedAt: file.importedAt,
    filename: file.filename,
    rowCount: file.rows.length,
  };
  writeJson(historyPath(id), file);
  const idx = loadJntImportIndexRaw();
  idx.imports.unshift(entry);
  writeJson(JNT_IMPORT_INDEX_FILE, idx);
  return entry;
}

export function deleteJntImportById(id: string): boolean {
  migrateLegacyJntImportIfNeeded();
  const idx = loadJntImportIndexRaw();
  const before = idx.imports.length;
  idx.imports = idx.imports.filter((e) => e.id !== id);
  if (idx.imports.length === before) return false;
  writeJson(JNT_IMPORT_INDEX_FILE, idx);
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

export function deleteAllJntImports(): number {
  migrateLegacyJntImportIfNeeded();
  const idx = loadJntImportIndexRaw();
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
  writeJson(JNT_IMPORT_INDEX_FILE, { imports: [] });
  return n;
}

export function saveJntImportStaging(token: string, payload: unknown) {
  ensureDir(JNT_IMPORT_STAGING_DIR);
  fs.writeFileSync(path.join(JNT_IMPORT_STAGING_DIR, `${token}.json`), JSON.stringify(payload, null, 2), "utf8");
}

export function readJntImportStaging(token: string): unknown | null {
  const file = path.join(JNT_IMPORT_STAGING_DIR, `${token}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export function deleteJntImportStaging(token: string) {
  const file = path.join(JNT_IMPORT_STAGING_DIR, `${token}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
