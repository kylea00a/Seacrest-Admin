export type ExpenseFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

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
}

/** Stock received (supply in) for inventory. */
export interface InventorySupplyEntry {
  id: string;
  productName: string;
  quantity: number;
  note?: string;
  at: string; // ISO
}

