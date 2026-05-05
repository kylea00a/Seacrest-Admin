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
  /**
   * If true, this expense was created as a request (employee-submitted) and must be approved (paid) or rejected.
   * Calendar only shows requested expenses while pending.
   */
  isRequest?: boolean;
  requestStatus?: "pending" | "rejected";
  requestedBy?: string;
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
  /** bill (expense) vs reminder vs petty cash request shown on calendar */
  kind?: "bill" | "reminder" | "pettyCash";
}

export interface Reminder {
  id: string;
  title: string;
  frequency: ExpenseFrequency;
  startDate: string; // YYYY-MM-DD
  repeatEveryMonths?: number;
  repeatCount?: number;
  notes?: string;
  createdAt: string; // ISO
}

export type PettyCashRequestStatus = "pending" | "approved" | "rejected";

export type PettyCashRequestType = "budget" | "cashIn";

export interface PettyCashRequest {
  id: string;
  employeeName: string;
  category: string; // e.g. Miscellaneous
  description: string; // e.g. Battery
  amount: number;
  dateRequested: string; // YYYY-MM-DD
  /** Budget = cash out; cashIn = cash added to petty cash. */
  requestType?: PettyCashRequestType;
  status: PettyCashRequestStatus;
  createdAt: string; // ISO
  decidedAt?: string; // ISO
  decidedBy?: string; // e.g. Superadmin name
}

export interface PettyCashState {
  balance: number;
  updatedAt: string; // ISO
}

export type PettyCashLedgerKind = "budget_out" | "cash_in" | "bill_payment" | "adjustment";

export interface PettyCashLedgerTransaction {
  id: string;
  /** YYYY-MM-DD (approval date for requests) */
  date: string;
  description: string;
  category?: string;
  debit: number;
  credit: number;
  kind: PettyCashLedgerKind;
  /** Optional link back to request/expense */
  requestId?: string;
  expenseId?: string;
  approvedBy?: string;
  approvedAt?: string; // ISO
  createdAt: string; // ISO
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
  /**
   * Package price shown/used in Orders (often includes subscription portion for bundle packages).
   * This is the basis for matching package names from an order's numeric package price.
   */
  packagePrice: number;
  /**
   * Affiliate package-alone price (excludes subscription portion).
   * Sales Report package amount should use this value.
   */
  affiliatePrice: number;
  weight: number;
}

export interface AdminSettings {
  expenseCategories: string[];
  pettyCashCategories: string[];
  packages: AdminPackageItem[];
  products: AdminProductItem[];
  /**
   * Optional short codes for packing PDF summary (product name → abbreviation).
   * Used in phrases like `2 packages of 2 S / 2 L`.
   */
  productAbbreviations?: Record<string, string>;
  /**
   * If enabled, superadmin can edit an already-encoded ending inventory snapshot.
   * When disabled, encoded ending inventory is read-only for everyone.
   */
  allowSuperadminEditEncodedInventory?: boolean;
  updatedAt: string; // ISO
}

export type ShippingFeeBracket = {
  minWeight: number; // kg
  /** If omitted, treated as "and above" (per-kilo additional). */
  maxWeight?: number; // kg
  price: number; // PHP
};

export type ShippingCourier = {
  id: string;
  name: string; // e.g. J&T
  country?: string;
  description?: string; // e.g. 5-7 days
  fees: ShippingFeeBracket[];
  updatedAt: string; // ISO
  createdAt: string; // ISO
};

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
  kind?: "sales_deposit" | "custom" | "bill_payment";
  /** When kind = sales_deposit, the sales day being deposited (YYYY-MM-DD). */
  salesDate?: string;
  /** When kind = sales_deposit, the calendar day it was marked deposited (YYYY-MM-DD). */
  depositedAt?: string;
  /** When kind = bill_payment, the expense id being paid. */
  expenseId?: string;
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

/** One row from J&T portal Excel export (columns mapped by header titles). */
export interface JntImportRow {
  id: string;
  /** Waybill Number column */
  waybillNumber: string;
  receiver: string;
  /** Parsed date used for matching delivery claim dates (YYYY-MM-DD). */
  shipDateYmd: string;
  /** Raw submission datetime for tie-breaking / debugging */
  submissionTime?: string;
  orderNumber?: string;
}

export interface JntImportFile {
  importedAt: string;
  filename: string;
  rows: JntImportRow[];
}

/** One saved J&T upload (listed in the import panel). */
export interface JntImportIndexEntry {
  id: string;
  importedAt: string;
  filename: string;
  rowCount: number;
}

export interface WalletPayoutReceipt {
  paid: boolean;
  receiptNumber: string;
}

