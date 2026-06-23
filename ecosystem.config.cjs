const path = require("path");
const fs = require("fs");

/** Load .env.local into process.env for pm2 (non-destructive). */
function loadEnvLocal() {
  const envPath = path.join(__dirname, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvLocal();

module.exports = {
  apps: [
    {
      name: "seacrest-admin",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: ["start", "-p", process.env.PORT || "3000"],
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--max-old-space-size=1536",
        PORT: process.env.PORT || "3000",
        TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
        TELEGRAM_CHAT_IDS: process.env.TELEGRAM_CHAT_IDS || "",
        TELEGRAM_CRON_SECRET: process.env.TELEGRAM_CRON_SECRET || "",
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
        SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || "",
        ADMIN_AUTH_SECRET: process.env.ADMIN_AUTH_SECRET || "",
      },
    },
  ],
};
