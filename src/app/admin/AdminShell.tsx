"use client";

import { useAdminSession } from "./AdminSessionContext";
import RightDock from "./_components/RightDock";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { adminPathToPermissionKey } from "@/data/admin/adminPermissions";
import ServerHealthWidget from "./_components/ServerHealthWidget";

const AUTH_PATHS = ["/admin/login", "/admin/setup", "/admin/forbidden"];

function isAuthPath(pathname: string) {
  return AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, needsSetup, account, refresh } = useAdminSession();

  useEffect(() => {
    if (loading) return;
    if (isAuthPath(pathname)) {
      if (pathname.startsWith("/admin/setup")) {
        if (!needsSetup) {
          router.replace(account ? "/admin/calendar" : "/admin/login");
        }
        return;
      }
      if (pathname.startsWith("/admin/login")) {
        if (needsSetup) {
          router.replace("/admin/setup");
          return;
        }
        if (account) {
          router.replace("/admin/calendar");
        }
        return;
      }
      return;
    }
    if (needsSetup) {
      router.replace("/admin/setup");
      return;
    }
    if (!account) {
      router.replace("/admin/login");
      return;
    }
    if (account.isSuperadmin) return;
    const key = adminPathToPermissionKey(pathname);
    if (key === "accounts") {
      router.replace("/admin/forbidden");
      return;
    }
    if (key === "orders") {
      if (!account.permissions.orders && !account.permissions.ordersFullEdit) {
        router.replace("/admin/forbidden");
      }
      return;
    }
    if (key && !account.permissions[key]) {
      router.replace("/admin/forbidden");
    }
  }, [loading, needsSetup, account, pathname, router]);

  if (isAuthPath(pathname)) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-emerald-500/25 selection:text-emerald-50">
        {children}
      </div>
    );
  }

  if (loading || needsSetup === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Redirecting to sign-in…
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-zinc-950 text-zinc-100 selection:bg-emerald-500/25 selection:text-emerald-50">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(16,185,129,0.14),transparent_55%),radial-gradient(ellipse_80%_50%_at_100%_0%,rgba(34,197,94,0.08),transparent_50%),radial-gradient(ellipse_60%_40%_at_0%_100%,rgba(20,184,166,0.06),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:100%_24px] opacity-[0.25]"
      />
      <div className="relative z-10 mx-auto w-full max-w-[1400px] px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-5">
          <div className="flex items-center gap-4">
            <img
              src="/seacrest-logo.jpg"
              alt="SeaCrest"
              width={1024}
              height={409}
              fetchPriority="high"
              className="h-10 w-auto max-w-[min(100%,16rem)] object-contain object-left md:h-11"
            />
            <div className="hidden min-w-0 border-l border-white/[0.08] pl-4 sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
                Admin
              </p>
              <p className="text-xs text-zinc-500">Finance &amp; sales workspace</p>
            </div>
          </div>
          <div className="flex max-w-md flex-col items-end gap-1 text-right text-xs text-zinc-500">
            <p>
              Signed in as{" "}
              <span className="text-zinc-300">
                {account.displayName} {account.isSuperadmin ? "(superadmin)" : ""}
              </span>
            </p>
            <p className="leading-relaxed">
              Open the <span className="text-zinc-400">menu</span> on the right to switch sections.
            </p>
            <button
              type="button"
              onClick={() => void fetch("/api/admin/auth/logout", { method: "POST" }).then(() => refresh().then(() => router.push("/admin/login")))}
              className="text-emerald-400/90 hover:text-emerald-300"
            >
              Sign out
            </button>
          </div>
        </header>
        <div className="animate-fade-in">{children}</div>
      </div>
      <RightDock account={account} />
      <ServerHealthWidget />
    </div>
  );
}
