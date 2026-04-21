import fs from "fs";
import path from "path";
import type { WalletPayoutReceipt, WalletTransactionsFile } from "./types";

const PROJECT_ROOT = process.cwd();
const WALLET_PATH = path.join(PROJECT_ROOT, "data", "admin", "wallet_transactions.json");
const RECEIPTS_PATH = path.join(PROJECT_ROOT, "data", "admin", "wallet_payout_receipts.json");

function ensureDir() {
  const dir = path.dirname(WALLET_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const emptyFile = (): WalletTransactionsFile => ({
  importedAt: new Date().toISOString(),
  filename: "",
  rows: [],
});

export function loadWalletTransactions(): WalletTransactionsFile {
  ensureDir();
  if (!fs.existsSync(WALLET_PATH)) return emptyFile();
  try {
    const raw = fs.readFileSync(WALLET_PATH, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (typeof j !== "object" || j === null || !Array.isArray((j as WalletTransactionsFile).rows)) {
      return emptyFile();
    }
    return j as WalletTransactionsFile;
  } catch {
    return emptyFile();
  }
}

export function saveWalletTransactions(data: WalletTransactionsFile) {
  ensureDir();
  fs.writeFileSync(WALLET_PATH, JSON.stringify(data, null, 2), "utf8");
}

export function loadPayoutReceipts(): Record<string, WalletPayoutReceipt> {
  ensureDir();
  if (!fs.existsSync(RECEIPTS_PATH)) return {};
  try {
    const raw = fs.readFileSync(RECEIPTS_PATH, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (typeof j !== "object" || j === null) return {};
    return j as Record<string, WalletPayoutReceipt>;
  } catch {
    return {};
  }
}

export function savePayoutReceipts(map: Record<string, WalletPayoutReceipt>) {
  ensureDir();
  fs.writeFileSync(RECEIPTS_PATH, JSON.stringify(map, null, 2), "utf8");
}

/** Drop receipt keys that no longer match any current row id when re-importing. */
export function prunePayoutReceiptsForRowIds(currentIds: Set<string>): Record<string, WalletPayoutReceipt> {
  const all = loadPayoutReceipts();
  const next: Record<string, WalletPayoutReceipt> = {};
  for (const [k, v] of Object.entries(all)) {
    if (currentIds.has(k)) next[k] = v;
  }
  if (Object.keys(next).length !== Object.keys(all).length) {
    savePayoutReceipts(next);
  }
  return next;
}
