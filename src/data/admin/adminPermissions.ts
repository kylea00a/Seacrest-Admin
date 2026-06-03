/** Granular admin areas (superadmin has all; others use checkboxes). */
export const ADMIN_PERMISSION_KEYS = [
  "calendar",
  "departments",
  "expenses",
  "pettyCash",
  "pettyCashEdit",
  "salesReport",
  "import",
  "orders",
  "ordersFullEdit",
  "inventory",
  "inventoryDeliveryLedger",
  "productCalculator",
  "delivery",
  "settings",
  "packagesProducts",
] as const;

export type AdminPermissionKey = (typeof ADMIN_PERMISSION_KEYS)[number];

export const ADMIN_PERMISSION_LABELS: Record<AdminPermissionKey, string> = {
  calendar: "Calendar (home)",
  departments: "Departments",
  expenses: "Expenses",
  pettyCash: "Petty cash",
  pettyCashEdit: "Petty cash — edit/delete ledger",
  salesReport: "Sales report",
  import: "Import orders",
  orders: "Orders — view & claim (open page, claim pick-ups)",
  ordersFullEdit: "Edit Superadmin — change status, line items, delivery, fees, address",
  inventory: "Inventory",
  inventoryDeliveryLedger: "Inventory — edit/delete delivery-in ledger",
  productCalculator: "Product calculator",
  delivery: "Delivery",
  settings: "Settings (categories)",
  packagesProducts: "Packages & products",
};

export function defaultPermissionsAllFalse(): Record<AdminPermissionKey, boolean> {
  return Object.fromEntries(ADMIN_PERMISSION_KEYS.map((k) => [k, false])) as Record<
    AdminPermissionKey,
    boolean
  >;
}

/** Map `/admin/...` path to permission key (first segment after /admin/). */
export function adminPathToPermissionKey(pathname: string): AdminPermissionKey | "accounts" | null {
  if (!pathname.startsWith("/admin")) return null;
  const rest = pathname.replace(/^\/admin\/?/, "");
  const seg = rest.split("/")[0] ?? "";
  if (!seg || seg === "login" || seg === "setup" || seg === "forbidden") return null;
  if (seg === "accounts") return "accounts";
  const map: Record<string, AdminPermissionKey> = {
    calendar: "calendar",
    departments: "departments",
    expenses: "expenses",
    "petty-cash": "pettyCash",
    "cash-balances": "pettyCash",
    "wallet-transactions": "pettyCash",
    payouts: "pettyCash",
    "sales-summary": "salesReport",
    "sales-report": "salesReport",
    "seacrest-sales-report": "salesReport",
    "jj-sales-report": "salesReport",
    "product-calculator": "productCalculator",
    import: "import",
    orders: "orders",
    inventory: "inventory",
    "inventory-flow": "inventory",
    delivery: "delivery",
    "jnt-import": "delivery",
    "xendit-import": "salesReport",
    settings: "settings",
    "packages-products": "packagesProducts",
    "telegram-notifications": "settings",
  };
  return map[seg] ?? null;
}
