#!/usr/bin/env node
/**
 * One-time repair: fix orderClaims where claimDate was wrongly set to the same calendar day
 * as claimedAt (typical of auto-sync on page load) while the order's effective date is older.
 *
 * Skips records with claimDateExplicit === true (New Edit overrides).
 *
 * Usage:
 *   node scripts/repair-order-claim-dates.mjs           # dry-run (prints only)
 *   node scripts/repair-order-claim-dates.mjs --apply   # writes data/admin/orderClaims.json
 */

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const ADMIN = path.join(ROOT, "data", "admin");
const CLAIMS_FILE = path.join(ADMIN, "orderClaims.json");
const ADJ_FILE = path.join(ADMIN, "orderAdjustments.json");
const INDEX_FILE = path.join(ADMIN, "ordersIndex.json");
const ORDERS_DIR = path.join(ADMIN, "orders");

function manilaYmd(iso) {
  if (!iso || typeof iso !== "string") return null;
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function buildInvoiceEffectiveDate(adjustments, index) {
  const map = {};
  const sorted = [...(Array.isArray(index) ? index : [])].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? "")),
  );
  for (const entry of sorted) {
    const sourceDate = typeof entry.date === "string" ? entry.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) continue;
    const file = path.join(ORDERS_DIR, `${sourceDate}.json`);
    if (!fs.existsSync(file)) continue;
    const day = readJson(file, null);
    const parsed =
      day && typeof day === "object" && day.parsed && typeof day.parsed === "object"
        ? day.parsed
        : null;
    const rows = parsed?.rows;
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || typeof r !== "object") continue;
      const inv = typeof r.invoiceNumber === "string" ? r.invoiceNumber.trim() : "";
      if (!inv || map[inv]) continue;
      const adj = adjustments[inv];
      const eff = adj?.effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(String(adj.effectiveDate).slice(0, 10))
        ? String(adj.effectiveDate).slice(0, 10)
        : sourceDate;
      map[inv] = eff;
    }
  }
  return map;
}

const apply = process.argv.includes("--apply");

if (!fs.existsSync(CLAIMS_FILE)) {
  console.error("No file:", CLAIMS_FILE);
  process.exit(1);
}

const claims = readJson(CLAIMS_FILE, {});
const adjustments = readJson(ADJ_FILE, {});
const index = readJson(INDEX_FILE, []);
const invoiceToEff = buildInvoiceEffectiveDate(adjustments, index);

let changed = 0;
const updates = [];

for (const [inv, rec] of Object.entries(claims)) {
  if (!rec || typeof rec !== "object") continue;
  if (rec.claimDateExplicit === true) continue;

  const E = invoiceToEff[inv];
  if (!E || !/^\d{4}-\d{2}-\d{2}$/.test(E)) continue;

  const rawCd = typeof rec.claimDate === "string" ? rec.claimDate.trim() : "";
  const claimYmd = /^\d{4}-\d{2}-\d{2}$/.test(rawCd) ? rawCd : null;
  const claimedAtYmd = manilaYmd(rec.claimedAt);

  // Wrong pattern: claim day equals "when the record was saved" but order is older.
  if (!claimYmd || !claimedAtYmd) continue;
  if (claimYmd !== claimedAtYmd) continue;
  if (claimYmd === E) continue;

  updates.push({ inv, from: claimYmd, to: E, effective: E });
  rec.claimDate = E;
  rec.claimDateExplicit = true;
  changed += 1;
}

console.log(
  apply
    ? `Applying ${changed} repair(s) to ${CLAIMS_FILE}`
    : `Dry run: would repair ${changed} claim record(s). Run with --apply to write.`,
);
for (const u of updates.slice(0, 50)) {
  console.log(`  ${u.inv}: claimDate ${u.from} → ${u.to} (order effective ${u.effective})`);
}
if (updates.length > 50) console.log(`  … and ${updates.length - 50} more`);

if (apply && changed > 0) {
  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(claims, null, 2), "utf8");
  console.log("Wrote", CLAIMS_FILE);
} else if (apply && changed === 0) {
  console.log("No changes needed.");
}
