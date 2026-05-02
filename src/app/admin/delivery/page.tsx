"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminSettings, JntImportFile, OrdersImportSummary } from "@/data/admin/types";
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
import { useAdminProductKeys } from "../_components/useAdminProductKeys";
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

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function allTrackingSavedForGroup(
  group: MergedDeliveryGroup,
  tracking: DeliveryTrackingMap,
): boolean {
  return group.invoiceNumbers.every((inv) => Boolean(tracking[inv]?.trackingNumber));
}

function tableProductHeader(k: string): string {
  if (k === "Radiance Coffee") return "SeaSkin Radiance";
  if (k === "Seahealth Coffee") return "SeaHealth Coffee";
  if (k === "Supreme") return "SeaSkin Supreme";
  return k;
}

export default function DeliveryPage() {
  const productKeys = useAdminProductKeys();
  const [index, setIndex] = useState<OrdersImportSummary[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [groups, setGroups] = useState<MergedDeliveryGroup[]>([]);
  const [tracking, setTracking] = useState<DeliveryTrackingMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string>("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [courierFilter, setCourierFilter] = useState<"all" | "jt" | "intl" | "none">("all");
  const [jntExportEnabled, setJntExportEnabled] = useState(false);
  const [jntImport, setJntImport] = useState<JntImportFile | null>(null);

  const weightByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of settings?.products ?? []) {
      m[p.name] = p.weight;
    }
    return m;
  }, [settings]);

  const loadIndex = async () => {
    const res = await fetch("/api/admin/orders", { cache: "no-store" });
    const json = (await res.json()) as { index?: OrdersImportSummary[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
    setIndex(json.index ?? []);
  };

  const loadSettings = async () => {
    const res = await fetch("/api/admin/settings", { cache: "no-store" });
    const json = (await res.json()) as { settings?: AdminSettings; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
    if (json.settings) setSettings(json.settings);
  };

  const loadTracking = async () => {
    const res = await fetch("/api/admin/delivery/tracking", { cache: "no-store" });
    const json = (await res.json()) as { tracking?: DeliveryTrackingMap; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
    setTracking(json.tracking ?? {});
  };

  const loadJntImport = async () => {
    const res = await fetch("/api/admin/jnt-import", { cache: "no-store" });
    const json = (await res.json()) as JntImportFile & { imports?: unknown; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
    setJntImport({
      importedAt: json.importedAt,
      filename: json.filename,
      rows: json.rows ?? [],
    });
  };

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadIndex(), loadSettings(), loadTracking(), loadJntImport()]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const refetchRows = useCallback(async () => {
    if (!index.length || !startDate || !endDate) {
      setGroups([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const start = startDate <= endDate ? startDate : endDate;
      const end = startDate <= endDate ? endDate : startDate;
      const res = await fetch(`/api/admin/delivery/compiled?start=${start}&end=${end}`, { cache: "no-store" });
      const json = (await res.json()) as { rows?: CompiledRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      const raw = (json.rows ?? []).filter((r) => isPaidDeliveryOrder(r as DeliveryRowLike));
      const filtered = raw.filter((r) => {
        if (courierFilter === "all") return true;
        const b = courierBucket(r.deliveryCourier ?? "");
        if (courierFilter === "jt") return b === "jt";
        if (courierFilter === "intl") return b === "intl";
        return b === "none";
      });
      const merged = mergeDeliveryRowsByReceiver(filtered as DeliveryRowLike[], productKeys);
      setGroups(merged);
      await loadTracking();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, index.length, productKeys, courierFilter]);

  useEffect(() => {
    void refetchRows();
  }, [refetchRows]);

  useEffect(() => {
    if (courierFilter !== "jt") setJntExportEnabled(false);
  }, [courierFilter]);

  const importWaybillByKey = useMemo(() => {
    const rows = jntImport?.rows ?? [];
    const start = startDate <= endDate ? startDate : endDate;
    const end = startDate <= endDate ? endDate : startDate;
    const map: Record<string, string> = {};
    if (courierFilter !== "jt") return map;
    for (const g of groups) {
      const w = findWaybillForReceiverDateRange(g.shippingFullName, start, end, rows);
      if (w) map[g.key] = w;
    }
    return map;
  }, [groups, jntImport, startDate, endDate, courierFilter]);

  const saveTrackingGroup = async (g: MergedDeliveryGroup) => {
    const imp = importWaybillByKey[g.key];
    const userEdited = Object.prototype.hasOwnProperty.call(draft, g.key);
    const typed = userEdited ? (draft[g.key] ?? "").trim() : "";
    const value = typed || (imp ?? "").trim();
    if (!value) return;
    setSavingKey(g.key);
    setError(null);
    try {
      for (const invoiceNumber of g.invoiceNumbers) {
        const res = await fetch("/api/admin/delivery/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invoiceNumber, trackingNumber: value }),
        });
        const json = (await res.json()) as { ok?: boolean; tracking?: { trackingNumber: string }; error?: string };
        if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
        setTracking((prev) => ({
          ...prev,
          [invoiceNumber]: {
            trackingNumber: json.tracking?.trackingNumber ?? value,
            savedAt: new Date().toISOString(),
          },
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingKey("");
    }
  };

  const exportJntExcel = async () => {
    if (courierFilter !== "jt" || !jntExportEnabled || !settings) return;
    try {
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
      a.download = `jnt-express-${startDate}-to-${endDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const exportPackingPdf = async () => {
    if (courierFilter !== "jt" || !groups.length || !settings || productKeys.length === 0) return;
    try {
      const { buildPackingExportPdfBlob } = await import("@/lib/packingExportPdf");
      const start = startDate <= endDate ? startDate : endDate;
      const end = startDate <= endDate ? endDate : startDate;
      const trackingByGroupKey: Record<string, string> = {};
      for (const g of groups) {
        const locked = allTrackingSavedForGroup(g, tracking);
        const manual = locked ? (tracking[g.invoiceNumbers[0]!]?.trackingNumber ?? "").trim() : "";
        const imp = importWaybillByKey[g.key] ?? "";
        const v = manual || imp;
        if (v) trackingByGroupKey[g.key] = v;
      }
      const blob = buildPackingExportPdfBlob({
        startDateYmd: start,
        endDateYmd: end,
        courierLabel: "J&T",
        productKeys,
        groups,
        trackingByGroupKey,
      });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `packing-jt-${start}-to-${end}.pdf`;
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
            Paid <span className="text-zinc-300">For Delivery</span> orders only. The date range matches each
            order&apos;s <span className="text-zinc-300">claim calendar day</span> (same as All Orders → Claim date), not
            only the import sheet day — so an order imported earlier but claimed on the selected day appears here. Rows
            with the same receiver, contact #, and shipping address are combined. Set courier in All Orders → Edit
            (blank, J&amp;T, International). Pick-up + paid + address auto-claims for inventory.
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
            <div className="text-xs font-semibold text-zinc-400">Start date</div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="admin-input mt-1 w-full sm:w-auto"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400">End date</div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="admin-input mt-1 w-full sm:w-auto"
            />
          </div>
          <div className="text-xs text-zinc-400">
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
              <th className="px-3 py-2 text-left">Distributor</th>
              <th className="px-3 py-2 text-left">Receiver</th>
              {productKeys.map((k) => (
                <th key={k} className="px-2 py-2 text-center whitespace-nowrap">
                  {tableProductHeader(k)}
                </th>
              ))}
              <th className="px-3 py-2 text-left">Contact #</th>
              <th className="px-3 py-2 text-left">Address</th>
              <th className="px-3 py-2 text-left">Tracking Number</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {groups.map((g, i) => {
              const locked = allTrackingSavedForGroup(g, tracking);
              const importWaybill = importWaybillByKey[g.key];
              const label = g.distributorNames.join(" · ");
              const userEdited = Object.prototype.hasOwnProperty.call(draft, g.key);
              const inputValue = userEdited ? (draft[g.key] ?? "") : (importWaybill ?? "");
              const canSave = Boolean((userEdited ? (draft[g.key] ?? "").trim() : "") || (importWaybill ?? "").trim());
              return (
                <tr key={g.key} className="bg-black/10 text-zinc-100">
                  <td className="px-3 py-2 whitespace-nowrap">{i + 1}</td>
                  <td className="max-w-[14rem] px-3 py-2 text-sm leading-snug text-zinc-200" title={label}>
                    {label}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{g.shippingFullName}</td>
                  {productKeys.map((k) => (
                    <td key={`${g.key}-${k}`} className="px-2 py-2 text-center">
                      {g.productTotals?.[k] ? g.productTotals[k] : ""}
                    </td>
                  ))}
                  <td className="px-3 py-2 whitespace-nowrap">{g.contactNumber}</td>
                  <td className="min-w-[340px] px-3 py-2">{g.shippingFullAddress}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {locked ? (
                      <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-200">
                        {tracking[g.invoiceNumbers[0]!]?.trackingNumber}
                      </span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <input
                            value={inputValue}
                            onChange={(e) => setDraft((prev) => ({ ...prev, [g.key]: e.target.value }))}
                            className="w-44 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                            placeholder={importWaybill ? importWaybill : "Enter tracking #"}
                          />
                          <button
                            type="button"
                            onClick={() => saveTrackingGroup(g)}
                            disabled={savingKey === g.key || !canSave}
                            className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                          >
                            {savingKey === g.key ? "Saving…" : "Save"}
                          </button>
                        </div>
                        {importWaybill ? (
                          <span className="text-[10px] text-zinc-500">Matched from J&amp;T import (same receiver + date)</span>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
