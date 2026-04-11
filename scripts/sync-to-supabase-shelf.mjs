#!/usr/bin/env node
/**
 * Push local admin JSON files → Supabase "shelf" table `public.admin_storage_backup`.
 *
 * Each file under data/admin/ becomes one row:
 *   storage_key  — path like "settings.json" or "orders/2026-04-07.json"
 *   payload      — parsed JSON
 *   updated_at   — now()
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   (recommended; bypasses RLS)
 *
 * Usage:
 *   npm run shelf:sync
 *   npm run shelf:sync -- --dry-run
 *   node scripts/sync-to-supabase-shelf.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const SHELF_TABLE = "admin_storage_backup";

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) {
    console.error("Missing .env.local — copy .env.example and add your Supabase URL + service_role key.");
    process.exit(1);
  }
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function collectJsonFiles(dir, baseRel = "") {
  /** @type {{ storage_key: string, abs: string, bytes: number }[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = baseRel ? `${baseRel}/${name}` : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      out.push(...collectJsonFiles(abs, rel));
    } else if (name.endsWith(".json")) {
      out.push({
        storage_key: rel.replace(/\\/g, "/"),
        abs,
        bytes: st.size,
      });
    }
  }
  return out;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || args.includes("-n");

loadEnvLocal();

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim();
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim();

const adminDir = path.join(root, "data", "admin");
const files = collectJsonFiles(adminDir);

console.log("");
console.log("  Seacrest Admin → Supabase shelf");
console.log(`  Table: public.${SHELF_TABLE}`);
console.log(`  Source: ${path.relative(process.cwd(), adminDir) || "."}`);
console.log("");

if (files.length === 0) {
  console.log("No .json files under data/admin — nothing to sync.");
  process.exit(0);
}

const totalBytes = files.reduce((s, f) => s + f.bytes, 0);
console.log(`Found ${files.length} file(s) (~${(totalBytes / 1024).toFixed(1)} KB total).\n`);

if (dryRun) {
  console.log("Dry run — no upload.\n");
  for (const f of files) {
    console.log(`  would sync  ${f.storage_key}`);
  }
  console.log("\nRun without --dry-run to upload.");
  process.exit(0);
}

if (!url || !serviceKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  console.error(
    "Get the service role key from: Supabase → Project Settings → API → service_role (secret).",
  );
  process.exit(1);
}

if (!url.startsWith("http")) {
  console.error("NEXT_PUBLIC_SUPABASE_URL must start with https://");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let ok = 0;
let fail = 0;

for (const { storage_key, abs } of files) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    console.error(`✗ ${storage_key} (invalid JSON)`, e instanceof Error ? e.message : e);
    fail++;
    continue;
  }

  const { error } = await supabase.from(SHELF_TABLE).upsert(
    {
      storage_key,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "storage_key" },
  );

  if (error) {
    console.error(`✗ ${storage_key}`, error.message);
    if (error.message?.includes("relation") || error.code === "42P01") {
      console.error(
        `  → Create the table first: run supabase/migrations/*_admin_storage_backup.sql in the SQL Editor.`,
      );
    }
    fail++;
  } else {
    console.log(`✓ ${storage_key}`);
    ok++;
  }
}

console.log(`\nShelf sync done: ${ok} ok, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
