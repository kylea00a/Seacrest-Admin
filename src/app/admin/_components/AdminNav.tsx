"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string };

const NAV: NavItem[] = [
  { label: "Calendar", href: "/admin/calendar" },
  { label: "Add Expense", href: "/admin/expenses" },
  { label: "Departments", href: "/admin/departments" },
  { label: "Petty Cash", href: "/admin/petty-cash" },
  { label: "Import Orders", href: "/admin/import" },
  { label: "Inventory", href: "/admin/inventory" },
  { label: "Delivery", href: "/admin/delivery" },
  { label: "Packages & Products", href: "/admin/packages-products" },
  { label: "Settings", href: "/admin/settings" },
];

const SALES_LINKS: NavItem[] = [
  { label: "Sales Report", href: "/admin/sales-report" },
  { label: "All Orders", href: "/admin/orders" },
];

function cx(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

export default function AdminNav() {
  const pathname = usePathname();
  const salesActive = SALES_LINKS.some((item) => pathname === item.href || pathname?.startsWith(item.href + "/"));

  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-200 bg-white/60 px-4 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <div className="shrink-0 overflow-hidden rounded-lg bg-black ring-1 ring-zinc-200/80">
          <Image
            src="/seacrest-logo.jpg"
            alt="SeaCrest"
            width={256}
            height={102}
            className="h-8 w-auto max-w-[12rem] object-contain sm:h-9"
          />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-zinc-900">
            Company Admin
          </div>
          <div className="text-xs text-zinc-600">Departments, expenses, and recurring dues</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "rounded-full border px-4 py-1.5 text-xs font-semibold transition",
                active
                  ? "border-pink-500 bg-pink-500 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {item.label}
            </Link>
          );
        })}

        <details
          className={cx(
            "group relative rounded-full border text-xs font-semibold transition",
            salesActive ? "border-pink-500 bg-pink-500 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          )}
        >
          <summary
            className="cursor-pointer list-none px-4 py-1.5 [&::-webkit-details-marker]:hidden"
            aria-label="Sales menu"
          >
            Sales <span aria-hidden>▾</span>
          </summary>
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[12rem] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
            {SALES_LINKS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "block px-4 py-2 text-xs font-semibold no-underline",
                    active ? "bg-pink-50 text-pink-700" : "text-zinc-700 hover:bg-zinc-50"
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </details>
      </div>
    </div>
  );
}
