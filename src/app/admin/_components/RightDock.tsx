"use client";

import type { AdminPermissionKey } from "@/data/admin/adminPermissions";
import type { SafeAdminAccount } from "@/lib/adminApiAuth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

type DockLink = {
  key: string;
  label: string;
  href: string;
  /** Required access; superadmin always passes. */
  perm?: AdminPermissionKey;
  /** Only superadmin sees this link (e.g. Accounts). */
  superadminOnly?: boolean;
};

type DockSection = {
  key: string;
  label: string;
  links: DockLink[];
};

const ALL_SECTIONS: DockSection[] = [
  {
    key: "home",
    label: "Home",
    links: [
      { key: "home", label: "Home", href: "/admin/calendar", perm: "calendar" },
      { key: "reminders", label: "Reminders", href: "/admin/reminders", perm: "calendar" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    links: [
      { key: "expenses", label: "Expenses", href: "/admin/expenses", perm: "expenses" },
      { key: "departments", label: "Departments", href: "/admin/departments", perm: "departments" },
      { key: "petty", label: "Petty Cash", href: "/admin/petty-cash", perm: "pettyCash" },
      { key: "cash-balances", label: "Cash Balances", href: "/admin/cash-balances", perm: "pettyCash" },
      {
        key: "wallet-transactions",
        label: "Wallet Transactions Import",
        href: "/admin/wallet-transactions",
        perm: "pettyCash",
      },
      { key: "payouts", label: "Payouts", href: "/admin/payouts", perm: "pettyCash" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    links: [
      { key: "sales-report", label: "Sales Report", href: "/admin/sales-report", perm: "salesReport" },
      { key: "import", label: "Import Orders", href: "/admin/import", perm: "import" },
      { key: "orders", label: "All Orders", href: "/admin/orders", perm: "orders" },
      { key: "inventory", label: "Inventory", href: "/admin/inventory", perm: "inventory" },
      { key: "delivery", label: "Delivery", href: "/admin/delivery", perm: "delivery" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    links: [
      { key: "settings-main", label: "Categories", href: "/admin/settings", perm: "settings" },
      {
        key: "pkgprod",
        label: "Packages & Products",
        href: "/admin/packages-products",
        perm: "packagesProducts",
      },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    links: [{ key: "accounts", label: "Accounts", href: "/admin/accounts", superadminOnly: true }],
  },
];

function filterSections(account: SafeAdminAccount): DockSection[] {
  const visible = (item: DockLink): boolean => {
    if (item.superadminOnly) return account.isSuperadmin;
    if (account.isSuperadmin) return true;
    const p = item.perm;
    if (!p) return false;
    if (p === "orders") {
      return Boolean(account.permissions.orders || account.permissions.ordersFullEdit);
    }
    return Boolean(account.permissions[p]);
  };
  return ALL_SECTIONS.map((sec) => ({
    ...sec,
    links: sec.links.filter(visible),
  })).filter((s) => s.links.length > 0);
}

function cx(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className="text-white"
      aria-hidden
    >
      {open ? (
        <path
          d="M6 18L18 6M6 6l12 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : (
        <>
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export default function RightDock({ account }: { account: SafeAdminAccount }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sections = useMemo(() => filterSections(account), [account]);

  const allLinks = useMemo(() => sections.flatMap((s) => s.links), [sections]);

  const activeItem = useMemo(() => {
    const match =
      allLinks.find((i) => pathname === i.href || pathname?.startsWith(i.href + "/")) ??
      allLinks[0];
    return match;
  }, [pathname, allLinks]);

  return (
    <div className="fixed right-4 top-1/2 z-50 -translate-y-1/2 sm:right-6">
      <div className="flex items-center">
        {open && (
          <div className="mr-3 w-[min(18rem,calc(100vw-5rem))] overflow-hidden rounded-3xl border border-white/[0.07] bg-zinc-950/90 p-1 shadow-[0_24px_80px_-12px_rgba(0,0,0,0.75)] ring-1 ring-white/[0.05] backdrop-blur-2xl">
            <div className="rounded-[1.35rem] bg-gradient-to-b from-white/[0.06] to-transparent p-[1px]">
              <div className="rounded-[1.3rem] bg-zinc-950/95 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400/90">
                      Navigation
                    </div>
                    <div className="mt-2 overflow-hidden rounded-lg bg-black ring-1 ring-white/[0.08]">
                      <img
                        src="/seacrest-logo.jpg"
                        alt="SeaCrest"
                        width={1024}
                        height={409}
                        className="h-8 w-auto max-w-[11rem] object-contain object-left"
                      />
                    </div>
                    <div className="mt-2 truncate text-xs font-semibold text-zinc-400">Seacrest Admin</div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500">Now: {activeItem?.label ?? "—"}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/[0.08]"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 max-h-[min(70vh,520px)] space-y-4 overflow-y-auto pr-1">
                  {sections.map((section) => (
                    <div key={section.key}>
                      <div className="px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                        {section.label}
                      </div>
                      <div className="mt-2 space-y-1">
                        {section.links.map((item) => {
                          const active = item.key === activeItem?.key;
                          return (
                            <Link
                              key={item.key}
                              href={item.href}
                              className={cx(
                                "group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition",
                                active
                                  ? "bg-emerald-500/15 text-white ring-1 ring-emerald-500/35"
                                  : "text-zinc-300 hover:bg-white/[0.05] hover:text-white",
                              )}
                              onClick={() => setOpen(false)}
                            >
                              <span>{item.label}</span>
                              <span
                                className={cx(
                                  "text-xs opacity-0 transition group-hover:opacity-100",
                                  active ? "text-emerald-300/90 opacity-100" : "text-zinc-500",
                                )}
                              >
                                →
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cx(
            "flex h-14 w-14 items-center justify-center rounded-2xl border shadow-xl transition",
            open
              ? "border-emerald-500/60 bg-emerald-500/15 text-white shadow-emerald-900/40 ring-2 ring-emerald-500/25"
              : "border-white/[0.08] bg-zinc-950/90 text-white shadow-black/50 ring-1 ring-white/[0.06] backdrop-blur-xl hover:border-emerald-500/35 hover:bg-zinc-900/95",
          )}
          aria-label={open ? "Close admin menu" : "Open admin menu"}
          aria-expanded={open}
        >
          <MenuIcon open={open} />
        </button>
      </div>
    </div>
  );
}
