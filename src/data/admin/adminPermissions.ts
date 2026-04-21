/** Granular admin areas (superadmin has all; others use checkboxes). */
export const ADMIN_PERMISSION_KEYS = [
  "calendar",
  "departments",
  "expenses",
  "pettyCash",
  "salesReport",
  "import",
  "orders",
  "ordersFullEdit",
  "inventory",
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
  salesReport: "Sales report",
  import: "Import orders",
  orders: "Orders — view & claim (open page, claim pick-ups)",
  ordersFullEdit: "Edit Superadmin — change status, line items, delivery, fees, address",
  inventory: "Inventory",
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
    "sales-report": "salesReport",
    import: "import",
    orders: "orders",
    inventory: "inventory",
    delivery: "delivery",
    settings: "settings",
    "packages-products": "packagesProducts",
  };
  return map[seg] ?? null;
}
