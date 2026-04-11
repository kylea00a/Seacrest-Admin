"use client";

import { useEffect, useState } from "react";
import { DEFAULT_PRODUCT_KEYS, productNamesFromSettings } from "@/data/admin/productSettings";
import type { AdminSettings } from "@/data/admin/types";

/** Product column names from `/api/admin/settings` (for order/import tables). */
export function useAdminProductKeys(): string[] {
  const [keys, setKeys] = useState<string[]>(DEFAULT_PRODUCT_KEYS);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { settings?: AdminSettings }) => {
        if (cancelled || !data.settings) return;
        setKeys(productNamesFromSettings(data.settings.products));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return keys;
}
