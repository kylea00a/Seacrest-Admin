#!/usr/bin/env node
/**
 * Cron helper: POST /api/admin/jnt-tracking/sync
 *
 * Env:
 *   JNT_TRACKING_SYNC_URL  default http://127.0.0.1:3000/api/admin/jnt-tracking/sync
 *   JNT_TRACKING_CRON_SECRET bearer token (same as server .env)
 */
const url = (process.env.JNT_TRACKING_SYNC_URL ?? "http://127.0.0.1:3000/api/admin/jnt-tracking/sync").trim();
const secret = (process.env.JNT_TRACKING_CRON_SECRET ?? "").trim();

const headers = { "Content-Type": "application/json" };
if (secret) headers.Authorization = `Bearer ${secret}`;

const res = await fetch(url, { method: "POST", headers, body: "{}" });
const json = await res.json().catch(() => ({}));
console.log(JSON.stringify(json, null, 2));
if (!res.ok) process.exit(1);
