import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import type { AdminPermissionKey } from "./adminPermissions";
import { ADMIN_PERMISSION_KEYS, defaultPermissionsAllFalse } from "./adminPermissions";

const PROJECT_ROOT = process.cwd();
const ADMIN_DATA_DIR = path.join(PROJECT_ROOT, "data", "admin");
const ACCOUNTS_FILE = path.join(ADMIN_DATA_DIR, "accounts.json");

export type AdminAccountRecord = {
  id: string;
  email: string;
  /** bcrypt hash */
  passwordHash: string;
  displayName: string;
  isSuperadmin: boolean;
  permissions: Record<AdminPermissionKey, boolean>;
  createdAt: string;
  updatedAt: string;
};

type AccountsFile = {
  accounts: AdminAccountRecord[];
};

function ensureDir() {
  if (!fs.existsSync(ADMIN_DATA_DIR)) fs.mkdirSync(ADMIN_DATA_DIR, { recursive: true });
}

function readFile(): AccountsFile {
  ensureDir();
  if (!fs.existsSync(ACCOUNTS_FILE)) return { accounts: [] };
  try {
    const raw = fs.readFileSync(ACCOUNTS_FILE, "utf8");
    const j = JSON.parse(raw) as AccountsFile;
    if (!j || !Array.isArray(j.accounts)) return { accounts: [] };
    return j;
  } catch {
    return { accounts: [] };
  }
}

function writeFile(data: AccountsFile) {
  ensureDir();
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2), "utf8");
}

export function listAccounts(): AdminAccountRecord[] {
  return readFile().accounts.map((a) => ({ ...a, permissions: normalizePermissions(a.permissions) }));
}

export function accountCount(): number {
  return readFile().accounts.length;
}

export function loadAccountById(id: string): AdminAccountRecord | null {
  const a = readFile().accounts.find((x) => x.id === id);
  if (!a) return null;
  return { ...a, permissions: normalizePermissions(a.permissions) };
}

export function loadAccountByEmail(email: string): AdminAccountRecord | null {
  const e = email.trim().toLowerCase();
  const a = readFile().accounts.find((x) => x.email.toLowerCase() === e);
  return a ?? null;
}

/** Ensures every permission key exists (handles older `accounts.json` without newer keys). */
export function normalizePermissions(
  input: Partial<Record<AdminPermissionKey, boolean>> | undefined,
): Record<AdminPermissionKey, boolean> {
  const base = defaultPermissionsAllFalse();
  if (!input || typeof input !== "object") return base;
  for (const k of ADMIN_PERMISSION_KEYS) {
    if (typeof input[k] === "boolean") base[k] = input[k];
  }
  return base;
}

export async function createAccount(args: {
  email: string;
  password: string;
  displayName: string;
  isSuperadmin: boolean;
  permissions?: Partial<Record<AdminPermissionKey, boolean>>;
}): Promise<AdminAccountRecord> {
  const email = args.email.trim().toLowerCase();
  if (!email || !args.password || args.password.length < 8) {
    throw new Error("Email and password (min 8 characters) are required.");
  }
  const data = readFile();
  if (data.accounts.some((x) => x.email.toLowerCase() === email)) {
    throw new Error("An account with this email already exists.");
  }
  const now = new Date().toISOString();
  let permissions = defaultPermissionsAllFalse();
  if (!args.isSuperadmin) {
    const basePerms = normalizePermissions(args.permissions);
    permissions = normalizePermissions({
      ...basePerms,
      ...(basePerms.ordersFullEdit ? { orders: true } : {}),
    });
  }
  const rec: AdminAccountRecord = {
    id: crypto.randomUUID(),
    email,
    passwordHash: await bcrypt.hash(args.password, 10),
    displayName: args.displayName.trim() || (email.split("@")[0] ?? "User"),
    isSuperadmin: Boolean(args.isSuperadmin),
    permissions,
    createdAt: now,
    updatedAt: now,
  };
  data.accounts.push(rec);
  writeFile(data);
  return rec;
}

export async function verifyPassword(account: AdminAccountRecord, password: string): Promise<boolean> {
  return bcrypt.compare(password, account.passwordHash);
}

export function updateAccount(
  id: string,
  patch: Partial<{
    displayName: string;
    isSuperadmin: boolean;
    permissions: Partial<Record<AdminPermissionKey, boolean>>;
    password: string;
  }>,
): AdminAccountRecord | null {
  const data = readFile();
  const idx = data.accounts.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  const cur = data.accounts[idx];
  const now = new Date().toISOString();
  let next = { ...cur, updatedAt: now };
  if (typeof patch.displayName === "string") next.displayName = patch.displayName.trim() || next.displayName;
  if (typeof patch.isSuperadmin === "boolean") {
    next.isSuperadmin = patch.isSuperadmin;
    if (patch.isSuperadmin) next.permissions = defaultPermissionsAllFalse();
  }
  if (patch.permissions && typeof patch.permissions === "object" && !next.isSuperadmin) {
    const merged = { ...next.permissions, ...patch.permissions };
    if (merged.ordersFullEdit) merged.orders = true;
    next.permissions = normalizePermissions(merged);
  }
  if (typeof patch.password === "string" && patch.password.length >= 8) {
    next = { ...next, passwordHash: bcrypt.hashSync(patch.password, 10) };
  }
  data.accounts[idx] = next;
  writeFile(data);
  return next;
}

export function deleteAccount(id: string): boolean {
  const data = readFile();
  const next = data.accounts.filter((x) => x.id !== id);
  if (next.length === data.accounts.length) return false;
  writeFile({ accounts: next });
  return true;
}

export function accountHasPermission(account: AdminAccountRecord, key: AdminPermissionKey): boolean {
  if (account.isSuperadmin) return true;
  return Boolean(account.permissions[key]);
}
