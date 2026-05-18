import fs from "fs";
import path from "path";
import { roundWeight2 } from "./productSettings";
import type {
  AdminPackageItem,
  AdminProductItem,
  AdminSettings,
  BankAccount,
  CashTransaction,
  Department,
  Expense,
  InventoryRtsInEntry,
  InventorySupplyEntry,
  OrderClaimRecord,
  OrdersImportSummary,
  OrdersSearchIndexEntry,
  PettyCashRequest,
  PettyCashState,
  PettyCashLedgerTransaction,
  Reminder,
  ShippingCourier,
  BookingStatusRecord,
  DeliveryFeeCharge,
  TelegramNotificationSettings,
  TelegramSendLogEntry,
} from "./types";

const PROJECT_ROOT = process.cwd();
const ADMIN_DATA_DIR = path.join(PROJECT_ROOT, "data", "admin");

const DEPARTMENTS_FILE = path.join(ADMIN_DATA_DIR, "departments.json");
const EXPENSES_FILE = path.join(ADMIN_DATA_DIR, "expenses.json");
const PETTY_CASH_STATE_FILE = path.join(ADMIN_DATA_DIR, "pettyCash.json");
const PETTY_CASH_REQUESTS_FILE = path.join(ADMIN_DATA_DIR, "pettyCashRequests.json");
const PETTY_CASH_LEDGER_FILE = path.join(ADMIN_DATA_DIR, "pettyCashLedger.json");
const SETTINGS_FILE = path.join(ADMIN_DATA_DIR, "settings.json");
const ORDERS_INDEX_FILE = path.join(ADMIN_DATA_DIR, "ordersIndex.json");
const ORDERS_SEARCH_INDEX_FILE = path.join(ADMIN_DATA_DIR, "ordersSearchIndex.json");
const SALES_SUMMARY_CACHE_FILE = path.join(ADMIN_DATA_DIR, "salesSummaryCache.json");
const DELIVERY_TRACKING_FILE = path.join(ADMIN_DATA_DIR, "deliveryTracking.json");
const ORDER_ADJUSTMENTS_FILE = path.join(ADMIN_DATA_DIR, "orderAdjustments.json");
const ORDER_CLAIMS_FILE = path.join(ADMIN_DATA_DIR, "orderClaims.json");
const INVENTORY_SUPPLY_FILE = path.join(ADMIN_DATA_DIR, "inventorySupply.json");
const INVENTORY_RTS_IN_FILE = path.join(ADMIN_DATA_DIR, "inventoryRtsIn.json");
const INVENTORY_FLOW_FILE = path.join(ADMIN_DATA_DIR, "inventoryFlow.json");
const INVENTORY_ENDING_FILE = path.join(ADMIN_DATA_DIR, "inventoryEnding.json");
const CASH_LEDGER_FILE = path.join(ADMIN_DATA_DIR, "cashLedger.json");
const REMINDERS_FILE = path.join(ADMIN_DATA_DIR, "reminders.json");
const SHIPPING_COURIERS_FILE = path.join(ADMIN_DATA_DIR, "shippingCouriers.json");
const BOOKING_STATUS_FILE = path.join(ADMIN_DATA_DIR, "bookingStatus.json");
const DELIVERY_FEE_CHARGES_FILE = path.join(ADMIN_DATA_DIR, "deliveryFeeCharges.json");
const TELEGRAM_SETTINGS_FILE = path.join(ADMIN_DATA_DIR, "telegramNotifications.json");
const TELEGRAM_SEND_LOG_FILE = path.join(ADMIN_DATA_DIR, "telegramSendLog.json");

function ensureAdminDir() {
  if (!fs.existsSync(ADMIN_DATA_DIR)) fs.mkdirSync(ADMIN_DATA_DIR, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  ensureAdminDir();
  if (!fs.existsSync(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile<T>(filePath: string, value: T) {
  ensureAdminDir();
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function loadDepartments(): Department[] {
  return readJsonFile<Department[]>(DEPARTMENTS_FILE, []);
}

export function saveDepartments(departments: Department[]) {
  writeJsonFile(DEPARTMENTS_FILE, departments);
}

export function loadExpenses(): Expense[] {
  return readJsonFile<Expense[]>(EXPENSES_FILE, []);
}

export function saveExpenses(expenses: Expense[]) {
  writeJsonFile(EXPENSES_FILE, expenses);
}

export function loadReminders(): Reminder[] {
  return readJsonFile<Reminder[]>(REMINDERS_FILE, []);
}

export function saveReminders(reminders: Reminder[]) {
  writeJsonFile(REMINDERS_FILE, reminders);
}

export function loadTelegramNotificationSettings(): TelegramNotificationSettings {
  return readJsonFile<TelegramNotificationSettings>(TELEGRAM_SETTINGS_FILE, {
    bots: [],
    updatedAt: new Date(0).toISOString(),
  });
}

export function saveTelegramNotificationSettings(settings: TelegramNotificationSettings) {
  writeJsonFile(TELEGRAM_SETTINGS_FILE, settings);
}

export function loadTelegramSendLog(): TelegramSendLogEntry[] {
  return readJsonFile<TelegramSendLogEntry[]>(TELEGRAM_SEND_LOG_FILE, []);
}

export function saveTelegramSendLog(entries: TelegramSendLogEntry[]) {
  writeJsonFile(TELEGRAM_SEND_LOG_FILE, entries);
}

export function loadShippingCouriers(): ShippingCourier[] {
  return readJsonFile<ShippingCourier[]>(SHIPPING_COURIERS_FILE, []);
}

export function saveShippingCouriers(couriers: ShippingCourier[]) {
  writeJsonFile(SHIPPING_COURIERS_FILE, couriers);
}

export function loadBookingStatus(): Record<string, BookingStatusRecord> {
  return readJsonFile<Record<string, BookingStatusRecord>>(BOOKING_STATUS_FILE, {});
}

export function saveBookingStatus(map: Record<string, BookingStatusRecord>) {
  writeJsonFile(BOOKING_STATUS_FILE, map);
}

export function loadDeliveryFeeCharges(): DeliveryFeeCharge[] {
  return readJsonFile<DeliveryFeeCharge[]>(DELIVERY_FEE_CHARGES_FILE, []);
}

export function saveDeliveryFeeCharges(charges: DeliveryFeeCharge[]) {
  writeJsonFile(DELIVERY_FEE_CHARGES_FILE, charges);
}

export function loadPettyCashState(): PettyCashState {
  return readJsonFile<PettyCashState>(PETTY_CASH_STATE_FILE, {
    balance: 0,
    updatedAt: new Date(0).toISOString(),
  });
}

export function savePettyCashState(state: PettyCashState) {
  writeJsonFile(PETTY_CASH_STATE_FILE, state);
}

export function loadPettyCashRequests(): PettyCashRequest[] {
  return readJsonFile<PettyCashRequest[]>(PETTY_CASH_REQUESTS_FILE, []);
}

export function savePettyCashRequests(requests: PettyCashRequest[]) {
  writeJsonFile(PETTY_CASH_REQUESTS_FILE, requests);
}

export function loadPettyCashLedger(): PettyCashLedgerTransaction[] {
  return readJsonFile<PettyCashLedgerTransaction[]>(PETTY_CASH_LEDGER_FILE, []);
}

export function savePettyCashLedger(txns: PettyCashLedgerTransaction[]) {
  writeJsonFile(PETTY_CASH_LEDGER_FILE, txns);
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function migrateProducts(raw: unknown, fallback: AdminProductItem[]): AdminProductItem[] {
  if (!Array.isArray(raw)) return fallback;
  const out: AdminProductItem[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const name = item.trim();
      if (name) out.push({ name, membersPrice: 0, srp: 0, weight: 0 });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      membersPrice: num(o.membersPrice),
      srp: num(o.srp),
      weight: roundWeight2(num(o.weight)),
    });
  }
  return out.length ? out : fallback;
}

function migratePackages(raw: unknown, fallback: AdminPackageItem[]): AdminPackageItem[] {
  if (!Array.isArray(raw)) return fallback;
  const out: AdminPackageItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const code = typeof o.code === "string" ? o.code.trim() : "";
    // Backwards compat: older settings stored `price` (treated as packagePrice) without affiliatePrice.
    const legacyPrice = num(o.price, NaN);
    const packagePrice = num(o.packagePrice, Number.isFinite(legacyPrice) ? legacyPrice : NaN);
    const affiliatePrice = num(
      o.affiliatePrice,
      Number.isFinite(packagePrice) ? packagePrice : NaN,
    );
    if (!name || !code || !Number.isFinite(packagePrice) || !Number.isFinite(affiliatePrice)) continue;
    out.push({
      name,
      code,
      packagePrice,
      affiliatePrice,
      weight: roundWeight2(num(o.weight)),
    });
  }
  return out.length ? out : fallback;
}

export function loadAdminSettings(): AdminSettings {
  const fallback: AdminSettings = {
    expenseCategories: ["BIR", "Rent", "Utility", "Maintenance", "Payroll", "Supplies", "Other"],
    pettyCashCategories: ["Miscellaneous"],
    packages: [
      { name: "Starter", code: "Starter-P998", packagePrice: 998, affiliatePrice: 998, weight: 0 },
      { name: "Standard", code: "Standard-P2996", packagePrice: 2996, affiliatePrice: 2996, weight: 0 },
      { name: "Premium", code: "Premium-P5996", packagePrice: 5996, affiliatePrice: 5996, weight: 0 },
      { name: "VIP", code: "VIP-P9996", packagePrice: 9996, affiliatePrice: 9996, weight: 0 },
    ],
    products: [
      { name: "Soap", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Lotion", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Seahealth Coffee", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Radiance Coffee", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Supreme", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Chips - Original", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Chips - Spicy", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Chips - Sour Cream", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Chips - Cheese", membersPrice: 0, srp: 0, weight: 0 },
      { name: "Chips - BBQ", membersPrice: 0, srp: 0, weight: 0 },
    ],
    updatedAt: new Date(0).toISOString(),
  };
  const loaded = readJsonFile<Record<string, unknown>>(SETTINGS_FILE, {});
  const expenseCategories = Array.isArray(loaded.expenseCategories)
    ? (loaded.expenseCategories as string[]).filter(Boolean)
    : fallback.expenseCategories;
  const pettyCashCategories = Array.isArray(loaded.pettyCashCategories)
    ? (loaded.pettyCashCategories as string[]).filter(Boolean)
    : fallback.pettyCashCategories;
  const productAbbreviations = normalizeProductAbbreviations(loaded.productAbbreviations);
  const allowSuperadminEditEncodedInventory =
    typeof loaded.allowSuperadminEditEncodedInventory === "boolean"
      ? loaded.allowSuperadminEditEncodedInventory
      : undefined;
  return {
    expenseCategories: expenseCategories.length ? expenseCategories : fallback.expenseCategories,
    pettyCashCategories: pettyCashCategories.length ? pettyCashCategories : fallback.pettyCashCategories,
    packages: migratePackages(loaded.packages, fallback.packages),
    products: migrateProducts(loaded.products, fallback.products),
    productAbbreviations: Object.keys(productAbbreviations).length ? productAbbreviations : undefined,
    allowSuperadminEditEncodedInventory,
    updatedAt: typeof loaded.updatedAt === "string" ? loaded.updatedAt : fallback.updatedAt,
  };
}

export function normalizeProductAbbreviations(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const name = k.trim();
    if (!name) continue;
    if (typeof v !== "string") continue;
    const abbr = v.trim();
    if (abbr) out[name] = abbr;
  }
  return out;
}

export function saveAdminSettings(settings: AdminSettings) {
  writeJsonFile(SETTINGS_FILE, settings);
}

export function loadOrdersIndex(): OrdersImportSummary[] {
  return readJsonFile<OrdersImportSummary[]>(ORDERS_INDEX_FILE, []);
}

export function saveOrdersIndex(index: OrdersImportSummary[]) {
  writeJsonFile(ORDERS_INDEX_FILE, index);
}

export type OrdersSearchIndexFile = {
  builtAt: string;
  entries: OrdersSearchIndexEntry[];
};

export function loadOrdersSearchIndex(): OrdersSearchIndexFile {
  const raw = readJsonFile<unknown>(ORDERS_SEARCH_INDEX_FILE, { builtAt: "", entries: [] });
  if (raw && typeof raw === "object") {
    const r = raw as OrdersSearchIndexFile;
    if (Array.isArray(r.entries)) {
      return {
        builtAt: typeof r.builtAt === "string" ? r.builtAt : "",
        entries: r.entries,
      };
    }
  }
  return { builtAt: "", entries: [] };
}

export function saveOrdersSearchIndex(data: OrdersSearchIndexFile) {
  writeJsonFile(ORDERS_SEARCH_INDEX_FILE, data);
}

export type SalesSummaryCacheFile = {
  builtAt: string;
  salesByDay: Record<string, import("@/lib/salesSummary").DaySalesDetail>;
  inventoryByClaimDay: Record<string, import("@/data/admin/inventoryCompute").InventoryOutByChannel>;
};

export function loadSalesSummaryCache(): SalesSummaryCacheFile {
  const raw = readJsonFile<unknown>(SALES_SUMMARY_CACHE_FILE, {
    builtAt: "",
    salesByDay: {},
    inventoryByClaimDay: {},
  });
  if (raw && typeof raw === "object") {
    const r = raw as SalesSummaryCacheFile;
    return {
      builtAt: typeof r.builtAt === "string" ? r.builtAt : "",
      salesByDay:
        r.salesByDay && typeof r.salesByDay === "object" && !Array.isArray(r.salesByDay)
          ? r.salesByDay
          : {},
      inventoryByClaimDay:
        r.inventoryByClaimDay &&
        typeof r.inventoryByClaimDay === "object" &&
        !Array.isArray(r.inventoryByClaimDay)
          ? r.inventoryByClaimDay
          : {},
    };
  }
  return { builtAt: "", salesByDay: {}, inventoryByClaimDay: {} };
}

export function saveSalesSummaryCache(data: SalesSummaryCacheFile) {
  writeJsonFile(SALES_SUMMARY_CACHE_FILE, data);
}

export type DeliveryTrackingMap = Record<string, { trackingNumber: string; savedAt: string }>;

export function loadDeliveryTracking(): DeliveryTrackingMap {
  return readJsonFile<DeliveryTrackingMap>(DELIVERY_TRACKING_FILE, {});
}

export function saveDeliveryTracking(map: DeliveryTrackingMap) {
  writeJsonFile(DELIVERY_TRACKING_FILE, map);
}

export type OrderStatusAdjustmentValue = "Pending" | "Processing" | "Paid" | "Complete" | "Cancelled";

/** Optional per-invoice line overrides (products, delivery type, fees, shipping) saved from All Orders edit UI. */
export type OrderLineDetailOverride = {
  packageProducts?: Record<string, number>;
  subscriptionProducts?: Record<string, number>;
  repurchaseProducts?: Record<string, number>;
  subscriptionsCount?: number;
  deliveryCategory?: "pickup" | "delivery";
  deliveryFee?: number;
  /** Delivery fee applied on claim day (for delayed deliveries / redelivery charges). */
  deliveryFeeOthers?: number;
  merchantFee?: number;
  totalAmount?: number;
  shippingFullName?: string;
  contactNumber?: string;
  shippingFullAddress?: string;
  province?: string;
  city?: string;
  region?: string;
  zipCode?: string;
  /** When delivery: blank, `J&T`, or `International` (from All Orders line editor). */
  deliveryCourier?: string;
};

export type OrderAdjustment = {
  invoiceNumber: string;
  status: OrderStatusAdjustmentValue;
  effectiveDate: string; // YYYY-MM-DD (import day for open statuses; today when moving to a terminal status)
  savedAt: string; // ISO
  lineDetails?: OrderLineDetailOverride;
};

export type OrderAdjustmentsMap = Record<string, OrderAdjustment>;

export function loadOrderAdjustments(): OrderAdjustmentsMap {
  return readJsonFile<OrderAdjustmentsMap>(ORDER_ADJUSTMENTS_FILE, {});
}

export function saveOrderAdjustments(map: OrderAdjustmentsMap) {
  writeJsonFile(ORDER_ADJUSTMENTS_FILE, map);
}

export type OrderClaimsFile = Record<string, OrderClaimRecord>;

export function loadOrderClaims(): OrderClaimsFile {
  return readJsonFile<OrderClaimsFile>(ORDER_CLAIMS_FILE, {});
}

export function saveOrderClaims(map: OrderClaimsFile) {
  writeJsonFile(ORDER_CLAIMS_FILE, map);
}

export type CashLedgerFile = {
  accounts: BankAccount[];
  transactions: CashTransaction[];
};

export function loadCashLedger(): CashLedgerFile {
  const raw = readJsonFile<unknown>(CASH_LEDGER_FILE, { accounts: [], transactions: [] });
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const accounts = Array.isArray(obj?.accounts) ? (obj?.accounts as BankAccount[]) : [];
  const transactions = Array.isArray(obj?.transactions) ? (obj?.transactions as CashTransaction[]) : [];
  return { accounts, transactions };
}

export function saveCashLedger(file: CashLedgerFile) {
  writeJsonFile(CASH_LEDGER_FILE, file);
}

export type InventorySupplyFile = {
  entries: InventorySupplyEntry[];
};

export function loadInventorySupply(): InventorySupplyFile {
  const raw = readJsonFile<unknown>(INVENTORY_SUPPLY_FILE, { entries: [] });
  if (raw && typeof raw === "object" && Array.isArray((raw as InventorySupplyFile).entries)) {
    return raw as InventorySupplyFile;
  }
  return { entries: [] };
}

export function saveInventorySupply(data: InventorySupplyFile) {
  writeJsonFile(INVENTORY_SUPPLY_FILE, data);
}

export type InventoryEndingFile = {
  /** YYYY-MM-DD -> ending snapshot */
  byDate: Record<string, import("./types").InventoryEndingSnapshot>;
};

export function loadInventoryEnding(): InventoryEndingFile {
  const raw = readJsonFile<unknown>(INVENTORY_ENDING_FILE, { byDate: {} });
  const r = raw as Record<string, unknown> | null;
  if (r && typeof r === "object" && r["byDate"] && typeof r["byDate"] === "object") {
    return raw as InventoryEndingFile;
  }
  return { byDate: {} };
}

export function saveInventoryEnding(data: InventoryEndingFile) {
  writeJsonFile(INVENTORY_ENDING_FILE, data);
}

export type InventoryRtsInFile = {
  entries: InventoryRtsInEntry[];
};

export function loadInventoryRtsIn(): InventoryRtsInFile {
  const raw = readJsonFile<unknown>(INVENTORY_RTS_IN_FILE, { entries: [] });
  if (raw && typeof raw === "object" && Array.isArray((raw as InventoryRtsInFile).entries)) {
    return raw as InventoryRtsInFile;
  }
  return { entries: [] };
}

export function saveInventoryRtsIn(data: InventoryRtsInFile) {
  writeJsonFile(INVENTORY_RTS_IN_FILE, data);
}

export type InventoryFlowFile = {
  byDate: Record<string, import("./types").InventoryFlowDayRow>;
};

export function loadInventoryFlow(): InventoryFlowFile {
  const raw = readJsonFile<unknown>(INVENTORY_FLOW_FILE, { byDate: {} });
  const r = raw as Record<string, unknown> | null;
  if (r && typeof r === "object" && r["byDate"] && typeof r["byDate"] === "object") {
    return raw as InventoryFlowFile;
  }
  return { byDate: {} };
}

export function saveInventoryFlow(data: InventoryFlowFile) {
  writeJsonFile(INVENTORY_FLOW_FILE, data);
}

