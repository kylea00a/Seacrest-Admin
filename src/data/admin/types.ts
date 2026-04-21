export type ExpenseFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "once"
  | "customMonths";

export type PaymentStatus = "paid" | "unpaid";

export type UserRole = "superadmin" | "employee";

export type ExpenseCategory =
  | "BIR"
  | "Rent"
  | "Utility"
  | "Maintenance"
  | "Payroll"
  | "Supplies"
  | "Other"
  | string;

export interface Department {
  id: string;
  name: string;
  createdAt: string; // ISO
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  startDate: string; // YYYY-MM-DD (date-only)
  /**
   * When `frequency` is `customMonths`: repeat every N months (e.g. 3 = every 3 months).
   * If omitted, treated as 1 month.
   */
  repeatEveryMonths?: number;
  /**
   * Optional cap for `customMonths` (payment plan). If omitted, repeats indefinitely.
   */
  repeatCount?: number;
  departmentId?: string;
  notes?: string;
  paymentStatus?: PaymentStatus; // if omitted, treated as "unpaid"
  createdAt: string; // ISO
}

export interface CalendarEvent {
  date: string; // YYYY-MM-DD
  expenseId: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  departmentName: string;
  frequency: ExpenseFrequency;
  paymentStatus: PaymentStatus;
}

export type PettyCashRequestStatus = "pending" | "approved" | "rejected";

export interface PettyCashRequest {
  id: string;
  employeeName: string;
  category: string; // e.g. Miscellaneous
  description: string; // e.g. Battery
  amount: number;
  dateRequested: string; // YYYY-MM-DD
  status: PettyCashRequestStatus;
  createdAt: string; // ISO
  decidedAt?: string; // ISO
  decidedBy?: string; // e.g. Superadmin name
}

export interface PettyCashState {
  balance: number;
  updatedAt: string; // ISO
}

/** One sellable product — name matches Excel / order columns; prices & weight are reference fields. */
export interface AdminProductItem {
  name: string;
  membersPrice: number;
  srp: number;
  /** Weight (same unit everywhere, e.g. kg or g — label in UI only). */
  weight: number;
}

export interface AdminPackageItem {
  name: string;
  /** Code in package label (e.g. Standard-P2996) for price matching. */
  code: string;
  price: number;
  weight: number;
}

export interface AdminSettings {
  expenseCategories: string[];
  pettyCashCategories: string[];
  packages: AdminPackageItem[];
  products: AdminProductItem[];
  /**
   * If enabled, superadmin can edit an already-encoded ending inventory snapshot.
   * When disabled, encoded ending inventory is read-only for everyone.
   */
  allowSuperadminEditEncodedInventory?: boolean;
  updatedAt: string; // ISO
}

export interface OrdersImportSummary {
  date: string; // YYYY-MM-DD (what you upload for)
  filename: string;
  importedAt: string; // ISO
  totalRows: number;
  totals: {
    package: number;
    subscription: number;
    repurchase: number;
  };
  subscriptionsCountTotal?: number;
  memberCounts?: { member: number; "non-member": number; unknown: number };
  productCounts?: Record<string, { package: number; subscription: number; repurchase: number }>;
}

/** Pick-up: manual claim; delivery: auto-claimed when paid (synced on compile). */
export interface OrderClaimRecord {
  claimedAt: string; // ISO
  /** Calendar claim day (Asia/Manila), YYYY-MM-DD — shown as Claim Date; editable via New Edit. */
  claimDate?: string;
  /**
   * When true, `claimDate` was saved from New Edit and must win over heuristics that reconcile
   * stale auto-sync `claimDate` with `claimedAt` (e.g. backdating).
   */
  claimDateExplicit?: boolean;
}

/** Stock received (supply in) for inventory. */
export interface InventorySupplyEntry {
  id: string;
  productName: string;
  quantity: number;
  note?: string;
  at: string; // ISO
}

/** Staff-encoded ending inventory snapshot for a calendar day (YYYY-MM-DD). */
export interface InventoryEndingSnapshot {
  date: string;
  encodedAt: string; // ISO
  encodedBy?: string; // displayName
  locked: boolean;
  counts: Record<string, number>;
  /** True when any product has non-zero discrepancy vs expected ending. */
  hasDiscrepancy?: boolean;
  /** Product -> (actual - expected) for non-zero entries. */
  discrepancyBy?: Record<string, number>;
}

export interface BankAccount {
  id: string;
  name: string;
  bank: string;
  accountName: string;
  createdAt: string; // ISO
}

export interface CashTransaction {
  id: string;
  accountId: string;
  /** YYYY-MM-DD */
  date: string;
  description: string;
  debit: number;
  credit: number;
  createdAt: string; // ISO
  /** Optional classification for idempotency / UI toggles. */
  kind?: "sales_deposit" | "custom";
  /** When kind = sales_deposit, the sales day being deposited (YYYY-MM-DD). */
  salesDate?: string;
  /** When kind = sales_deposit, the calendar day it was marked deposited (YYYY-MM-DD). */
  depositedAt?: string;
}

/** One row from wallet transactions Excel import (balance column not stored). */
export interface WalletTransactionRow {
  /** Stable key for this row (Excel ID when present). */
  id: string;
  referenceNumber: string;
  distributorId: string;
  distributorName: string;
  amount: number;
  notes: string;
  /** YYYY-MM-DD from Transaction date column. */
  transactionDate: string;
  updatedAt?: string;
  /** Oldest→newest ordering: prefers full datetime from Updated at when parseable. */
  sortTimeMs: number;
}

export interface WalletTransactionsFile {
  importedAt: string;
  filename: string;
  rows: WalletTransactionRow[];
}

export interface WalletPayoutReceipt {
  paid: boolean;
  receiptNumber: string;
}

