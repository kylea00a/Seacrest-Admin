import fs from "fs";
import { readFile } from "fs/promises";
import path from "path";
import type { OrdersImportSummary } from "./types";
import { loadOrdersIndex, saveOrdersIndex } from "./storage";

const PROJECT_ROOT = process.cwd();
const ORDERS_DIR = path.join(PROJECT_ROOT, "data", "admin", "orders");
const STAGING_DIR = path.join(PROJECT_ROOT, "data", "admin", "orders_staging");

function ensureOrdersDir() {
  if (!fs.existsSync(ORDERS_DIR)) fs.mkdirSync(ORDERS_DIR, { recursive: true });
}

function ensureStagingDir() {
  if (!fs.existsSync(STAGING_DIR)) fs.mkdirSync(STAGING_DIR, { recursive: true });
}

export function saveOrdersDay(date: string, payload: unknown) {
  ensureOrdersDir();
  const file = path.join(ORDERS_DIR, `${date}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

export function readOrdersDay(date: string): unknown | null {
  ensureOrdersDir();
  const file = path.join(ORDERS_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** Async read for parallel loading (e.g. compiled orders for a date range). */
export async function readOrdersDayAsync(date: string): Promise<unknown | null> {
  ensureOrdersDir();
  const file = path.join(ORDERS_DIR, `${date}.json`);
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function upsertOrdersIndex(summary: OrdersImportSummary) {
  const index = loadOrdersIndex();
  const next = index.filter((i) => i.date !== summary.date);
  next.unshift(summary);
  saveOrdersIndex(next);
}

export function deleteOrdersDay(date: string): boolean {
  ensureOrdersDir();
  const file = path.join(ORDERS_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

export function removeOrdersIndexDate(date: string) {
  const index = loadOrdersIndex();
  const next = index.filter((i) => i.date !== date);
  saveOrdersIndex(next);
}

export function saveOrdersStaging(token: string, payload: unknown) {
  ensureStagingDir();
  const file = path.join(STAGING_DIR, `${token}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

export function readOrdersStaging(token: string): unknown | null {
  ensureStagingDir();
  const file = path.join(STAGING_DIR, `${token}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export function deleteOrdersStaging(token: string) {
  ensureStagingDir();
  const file = path.join(STAGING_DIR, `${token}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

