"use client";

import type { AdminPermissionKey } from "@/data/admin/adminPermissions";
import type { SafeAdminAccount } from "@/lib/adminApiAuth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type { SafeAdminAccount };

export type AdminSessionSnapshot = {
  needsSetup: boolean;
  account: SafeAdminAccount | null;
};

type Ctx = {
  loading: boolean;
  needsSetup: boolean;
  account: SafeAdminAccount | null;
  refresh: () => Promise<AdminSessionSnapshot>;
  can: (key: AdminPermissionKey) => boolean;
};

const AdminSessionContext = createContext<Ctx | null>(null);

export function AdminSessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [account, setAccount] = useState<SafeAdminAccount | null>(null);

  const refresh = useCallback(async (): Promise<AdminSessionSnapshot> => {
    const res = await fetch("/api/admin/auth/session", { cache: "no-store" });
    let data: { needsSetup?: boolean; account?: SafeAdminAccount | null };
    try {
      data = (await res.json()) as {
        needsSetup?: boolean;
        account?: SafeAdminAccount | null;
      };
    } catch {
      setNeedsSetup(false);
      setAccount(null);
      return { needsSetup: false, account: null };
    }
    const needsSetup = Boolean(data.needsSetup);
    const account = data.account ?? null;
    if (res.status === 401) {
      setNeedsSetup(needsSetup);
      setAccount(null);
      return { needsSetup, account: null };
    }
    setNeedsSetup(needsSetup);
    setAccount(account);
    return { needsSetup, account };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const can = useCallback(
    (key: AdminPermissionKey) => {
      if (!account) return false;
      if (account.isSuperadmin) return true;
      return Boolean(account.permissions[key]);
    },
    [account],
  );

  const value = useMemo(
    () => ({ loading, needsSetup, account, refresh, can }),
    [loading, needsSetup, account, refresh, can],
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession must be used under AdminSessionProvider");
  return ctx;
}
