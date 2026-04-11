#!/usr/bin/env node
/**
 * Upserts local data/admin/*.json files into Supabase public.admin_storage_backup.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) {
    console.error("Missing .env.local — copy .env.example and fill values.");
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
  /** @type {{ storage_key: string, abs: string }[]} */
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = baseRel ? `${baseRel}/${name}` : name;
    const st = fs.statSync(abs);
    if (st.isDirectory()) {
      out.push(...collectJsonFiles(abs, rel));
    } else if (name.endsWith(".json")) {
      out.push({ storage_key: rel.replace(/\\/g, "/"), abs });
    }
  }
  return out;
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim();

if (!url || !serviceKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY) in .env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const adminDir = path.join(root, "data", "admin");
const files = collectJsonFiles(adminDir);

if (files.length === 0) {
  console.log("No JSON files under data/admin — nothing to back up.");
  process.exit(0);
}

let ok = 0;
let fail = 0;

for (const { storage_key, abs } of files) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch (e) {
    console.error(`Skip (invalid JSON): ${storage_key}`, e);
    fail++;
    continue;
  }

  const { error } = await supabase.from("admin_storage_backup").upsert(
    {
      storage_key,
      payload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "storage_key" },
  );

  if (error) {
    console.error(`✗ ${storage_key}`, error.message);
    fail++;
  } else {
    console.log(`✓ ${storage_key}`);
    ok++;
  }
}

console.log(`\nDone: ${ok} uploaded, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
