#!/usr/bin/env node
/**
 * Build data/admin/ordersSearchIndex.json from all order day files.
 * Run on deploy so All Orders search never blocks HTTP requests.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ordersDir = path.join(root, "data", "admin", "orders");
const outFile = path.join(root, "data", "admin", "ordersSearchIndex.json");

function listDates() {
  if (!fs.existsSync(ordersDir)) return [];
  return fs
    .readdirSync(ordersDir)
    .map((n) => n.match(/^(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
}

function normalizeKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[\s\-_/]/g, "");
}

function searchBlob(rec) {
  const parts = [
    rec.invoiceNumber,
    rec.distributorName,
    rec.ordererName,
    rec.shippingFullName,
    rec.email,
    rec.contactNumber,
  ];
  return normalizeKey(parts.filter(Boolean).join(" "));
}

function str(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return String(v).trim();
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

const adjustments = loadJson(path.join(root, "data", "admin", "orderAdjustments.json"), {});
const dates = listDates();
const byInvoice = new Map();
const batch = 32;

console.log(`[search-index] Rebuilding from ${dates.length} day files…`);
const started = Date.now();

for (let i = 0; i < dates.length; i += batch) {
  const slice = dates.slice(i, i + batch);
  for (const sourceDate of slice) {
    const day = loadJson(path.join(ordersDir, `${sourceDate}.json`), null);
    const parsed = day?.parsed;
    const rows = parsed?.rows;
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const invoice = str(r.invoiceNumber);
      if (!invoice) continue;
      const adj = adjustments[invoice];
      const effectiveDate = adj?.effectiveDate ?? sourceDate;
      const merged = { ...r, ...(adj && typeof adj === "object" ? adj : {}) };
      byInvoice.set(invoice, {
        invoice,
        sourceDate,
        effectiveDate,
        searchBlob: searchBlob({
          invoiceNumber: invoice,
          distributorName: merged.distributorName,
          ordererName: merged.ordererName,
          shippingFullName: merged.shippingFullName,
          email: merged.email,
          contactNumber: merged.contactNumber,
        }),
      });
    }
  }
  if ((i + batch) % 128 === 0 || i + batch >= dates.length) {
    console.log(`[search-index] …${Math.min(i + batch, dates.length)} / ${dates.length} days`);
  }
}

const file = {
  builtAt: new Date().toISOString(),
  entries: [...byInvoice.values()],
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(file, null, 2), "utf8");
console.log(`[search-index] Done: ${file.entries.length} orders in ${((Date.now() - started) / 1000).toFixed(1)}s`);
