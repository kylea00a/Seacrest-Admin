"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, startOfDay } from "date-fns";
import type { AdminSettings, JntImportFile } from "@/data/admin/types";
import {
  courierBucket,
  isPaidDeliveryOrder,
  mergeDeliveryRowsByReceiver,
  totalProductCount,
  totalWeightKgFromTotals,
  type DeliveryRowLike,
  type MergedDeliveryGroup,
} from "@/data/admin/deliveryGrouping";
import { findWaybillForReceiverDateRange } from "@/data/admin/jntImportMatch";
import { DEFAULT_PRODUCT_KEYS, productNamesFromSettings } from "@/data/admin/productSettings";
import { productColumnLabel } from "@/lib/productTableLabels";
import InventoryDayPicker from "../_components/InventoryDayPicker";
import type { DeliveryTrackingMap } from "@/data/admin/storage";

type CompiledRow = {
  invoiceNumber: string;
  distributorId: string;
  distributorName: string;
  ordererName: string;
  shippingFullName: string;
  contactNumber: string;
  shippingFullAddress: string;
  province: string;
  city: string;
  region: string;
  deliveryCourier: string;
  deliveryMethod: string;
  status: string;
  isPaid: boolean;
  packageProducts: Record<string, number>;
  subscriptionProducts: Record<string, number>;
  repurchaseProducts: Record<string, number>;
};

async function safeReadJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        res.status === 502
          ? "Server unavailable (502). The app may have restarted — wait a moment and refresh."
          : `Server error (${res.status}). Try refreshing the page.`,
      );
    }
    try {
      const j = JSON.parse(text) as { error?: string };
      throw new Error(j.error ?? `Failed with status ${res.status}`);
    } catch (e) {
      if (e instanceof Error && e.message !== "Failed with status " + res.status) throw e;
      throw new Error(`Failed with status ${res.status}`);
    }
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      res.status === 502
        ? "Server unavailable (502). Wait a moment and refresh."
        : `Bad response (${res.status}). Expected JSON.`,
    );
  }
}

/** Resolve displayed tracking: J&amp;T import match first, then saved manual value (legacy). */
function trackingDisplayForGroup(
  g: MergedDeliveryGroup,
  importWaybill: string | undefined,
  tracking: DeliveryTrackingMap,
): string {
  const imp = (importWaybill ?? "").trim();
  if (imp) return imp;
  const inv = g.invoiceNumbers[0];
  if (!inv) return "";
  return (tracking[inv]?.trackingNumber ?? "").trim();
}

export default function DeliveryPage() {
  const [pickDay, setPickDay] = useState<Date | undefined>(() => startOfDay(new Date()));
  const selectedDate = useMemo(() => (pickDay ? format(pickDay, "yyyy-MM-dd") : ""), [pickDay]);
  const dayLabel = useMemo(() => (pickDay ? format(pickDay, "dd/MM/yyyy") : "…"), [pickDay]);

  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [rawRows, setRawRows] = useState<CompiledRow[]>([]);
  const [tracking, setTracking] = useState<DeliveryTrackingMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courierFilter, setCourierFilter] = useState<"all" | "jt" | "intl" | "none">("all");
  const [jntExportEnabled, setJntExportEnabled] = useState(false);
  const [jntImport, setJntImport] = useState<JntImportFile | null>(null);

  const productKeys = useMemo(
    () => (settings ? productNamesFromSettings(settings.products) : DEFAULT_PRODUCT_KEYS),
    [settings],
  );

  const weightByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of settings?.products ?? []) {
      m[p.name] = p.weight;
    }
    return m;
  }, [settings]);

  const groups = useMemo(() => {
    const paid = rawRows.filter((r) => isPaidDeliveryOrder(r as DeliveryRowLike));
    const filtered = paid.filter((r) => {
      if (courierFilter === "all") return true;
      const b = courierBucket(r.deliveryCourier ?? "");
      if (courierFilter === "jt") return b === "jt";
      if (courierFilter === "intl") return b === "intl";
      return b === "none";
    });
    return mergeDeliveryRowsByReceiver(filtered as DeliveryRowLike[], productKeys);
  }, [rawRows, courierFilter, productKeys]);

  const loadJntImport = useCallback(async () => {
    const res = await fetch("/api/admin/jnt-import", { cache: "no-store" });
    const json = await safeReadJson<JntImportFile & { imports?: unknown; error?: string }>(res);
    setJntImport({
      importedAt: json.importedAt,
      filename: json.filename,
      rows: json.rows ?? [],
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      try {
        const [settingsRes, trackingRes] = await Promise.all([
          fetch("/api/admin/settings", { cache: "no-store" }),
          fetch("/api/admin/delivery/tracking", { cache: "no-store" }),
        ]);
        const settingsJson = await safeReadJson<{ settings?: AdminSettings; error?: string }>(settingsRes);
        const trackingJson = await safeReadJson<{ tracking?: DeliveryTrackingMap; error?: string }>(trackingRes);
        if (cancelled) return;
        if (settingsJson.settings) setSettings(settingsJson.settings);
        setTracking(trackingJson.tracking ?? {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      setRawRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/delivery/compiled?start=${selectedDate}&end=${selectedDate}`,
          { cache: "no-store" },
        );
        const json = await safeReadJson<{ rows?: CompiledRow[]; error?: string }>(res);
        if (cancelled) return;
        setRawRows(json.rows ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  useEffect(() => {
    if (courierFilter !== "jt" && !jntExportEnabled) return;
    void loadJntImport();
  }, [courierFilter, jntExportEnabled, loadJntImport]);

  useEffect(() => {
    if (courierFilter !== "jt") setJntExportEnabled(false);
  }, [courierFilter]);

  const importWaybillByKey = useMemo(() => {
    const rows = jntImport?.rows ?? [];
    const map: Record<string, string> = {};
    if (courierFilter !== "jt" || !selectedDate) return map;
    for (const g of groups) {
      const w = findWaybillForReceiverDateRange(g.shippingFullName, selectedDate, selectedDate, rows);
      if (w) map[g.key] = w;
    }
    return map;
  }, [groups, jntImport, selectedDate, courierFilter]);

  const productColumnTotals = useMemo(
    () =>
      productKeys.map((k) => groups.reduce((acc, g) => acc + (g.productTotals[k] ?? 0), 0)),
    [groups, productKeys],
  );

  const setToday = () => setPickDay(startOfDay(new Date()));

  const exportJntExcel = async () => {
    if (courierFilter !== "jt" || !jntExportEnabled || !settings || !selectedDate) return;
    try {
      if (!jntImport?.rows?.length) await loadJntImport();
      const { buildJntExpressWorkbookBuffer } = await import("@/lib/jntExpressExport");
      const exportRows = groups.map((g) => ({
        receiver: g.shippingFullName,
        telephone: g.contactNumber,
        address: g.shippingFullAddress,
        province: g.province,
        city: g.city,
        region: g.region,
        weightKg: totalWeightKgFromTotals(g.productTotals, weightByProduct),
        totalParcels: totalProductCount(g.productTotals),
      }));
      const buf = await buildJntExpressWorkbookBuffer(exportRows);
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `jnt-express-${selectedDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const exportPackingPdf = async () => {
    if (courierFilter !== "jt" || !groups.length || !settings || productKeys.length === 0 || !selectedDate) return;
    try {
      const { buildPackingExportPdfBlob } = await import("@/lib/packingExportPdf");
      const trackingByGroupKey: Record<string, string> = {};
      for (const g of groups) {
        const v = trackingDisplayForGroup(g, importWaybillByKey[g.key], tracking);
        if (v) trackingByGroupKey[g.key] = v;
      }
      const blob = buildPackingExportPdfBlob({
        startDateYmd: selectedDate,
        endDateYmd: selectedDate,
        courierLabel: "J&T",
        productKeys,
        groups,
        trackingByGroupKey,
        productAbbreviations: settings.productAbbreviations,
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `packing-jt-${selectedDate}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="admin-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-title">Delivery</h1>
          <p className="admin-muted max-w-2xl">
            Paid <span className="text-zinc-300">For Delivery</span> orders only. Pick one{" "}
            <span className="text-zinc-300">claim calendar day</span> (same as All Orders → Claim date) — an order
            imported earlier but claimed on that day appears here. Rows with the same receiver, contact #, and shipping
            address are combined. Set courier in All Orders → Edit (blank, J&amp;T, International). Pick-up + paid +
            address auto-claims for inventory.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Courier</div>
            <select
              value={courierFilter}
              onChange={(e) => setCourierFilter(e.target.value as typeof courierFilter)}
              className="admin-input mt-1 w-full min-w-[10rem] sm:w-auto"
            >
              <option value="all">All</option>
              <option value="jt">J&amp;T</option>
              <option value="intl">International</option>
              <option value="none">Unspecified</option>
            </select>
          </div>
          {courierFilter === "jt" ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-300">
              <input
                type="checkbox"
                checked={jntExportEnabled}
                onChange={(e) => setJntExportEnabled(e.target.checked)}
                className="rounded border-white/20"
              />
              J&amp;T export / Packing export
            </label>
          ) : null}
          {courierFilter === "jt" && jntExportEnabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void exportJntExcel()}
                disabled={loading || !groups.length || !settings}
                className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-300 disabled:opacity-60"
              >
                J&amp;T Excel
              </button>
              <button
                type="button"
                onClick={() => void exportPackingPdf()}
                disabled={loading || !groups.length || !settings}
                className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-400/20 disabled:opacity-60"
              >
                Packing PDF
              </button>
            </div>
          ) : null}
          <div>
            <div className="text-xs font-semibold text-zinc-400">Date</div>
            <div className="mt-1">
              <InventoryDayPicker value={pickDay} onChange={setPickDay} />
            </div>
          </div>
          <button type="button" onClick={setToday} className="admin-btn-secondary px-3 py-2 text-xs">
            Today
          </button>
          <div className="text-xs text-zinc-400">
            Showing: <span className="font-semibold text-zinc-200">{dayLabel}</span>
            {" · "}
            Groups: <span className="font-semibold text-zinc-200">{groups.length}</span>
          </div>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}

      <div className="admin-table-wrap">
        <table className="min-w-full text-xs">
          <thead className="bg-black/30 text-zinc-300">
            <tr className="text-[11px]">
              <th className="px-3 py-2 text-left">No.</th>
              <th className="px-3 py-2 text-left">Receiver</th>
              {productKeys.map((k) => (
                <th key={k} className="px-2 py-2 text-center whitespace-nowrap">
                  {productColumnLabel(k)}
                </th>
              ))}
              <th className="px-3 py-2 text-left">Tracking Number</th>
              <th className="px-3 py-2 text-left">Distributor</th>
              <th className="px-3 py-2 text-left">Contact #</th>
              <th className="px-3 py-2 text-left">Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {groups.length > 0 ? (
              <tr className="border-b border-white/10 bg-black/25 font-semibold text-zinc-200">
                <td className="px-3 py-2" />
                <td className="px-3 py-2 whitespace-nowrap">Totals</td>
                {productKeys.map((k, idx) => (
                  <td key={`tot-${k}`} className="px-2 py-2 text-center tabular-nums">
                    {productColumnTotals[idx]! > 0 ? productColumnTotals[idx] : ""}
                  </td>
                ))}
                <td className="px-3 py-2" colSpan={4} />
              </tr>
            ) : null}
            {groups.map((g, i) => {
              const importWaybill = importWaybillByKey[g.key];
              const label = g.distributorNames.join(" · ");
              const displayTracking = trackingDisplayForGroup(g, importWaybill, tracking);
              const impTrim = (importWaybill ?? "").trim();
              return (
                <tr key={g.key} className="bg-black/10 text-zinc-100">
                  <td className="px-3 py-2 whitespace-nowrap">{i + 1}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{g.shippingFullName}</td>
                  {productKeys.map((k) => (
                    <td key={`${g.key}-${k}`} className="px-2 py-2 text-center">
                      {g.productTotals?.[k] ? g.productTotals[k] : ""}
                    </td>
                  ))}
                  <td className="px-3 py-2 whitespace-nowrap align-top">
                    {displayTracking ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 font-mono text-[11px] text-zinc-200">
                          {displayTracking}
                        </span>
                        {impTrim && displayTracking === impTrim ? (
                          <span className="text-[10px] text-zinc-500">From J&amp;T import</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-zinc-500">—</span>
                    )}
                  </td>
                  <td className="max-w-[14rem] px-3 py-2 text-sm leading-snug text-zinc-200" title={label}>
                    {label}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{g.contactNumber}</td>
                  <td className="min-w-[340px] px-3 py-2">{g.shippingFullAddress}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
