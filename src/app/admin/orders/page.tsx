"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { format, startOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";
import type { OrdersImportSummary } from "@/data/admin/types";
import OrdersDateRangePicker from "../_components/OrdersDateRangePicker";
import { useAdminProductKeys } from "../_components/useAdminProductKeys";
import { courierBucket } from "@/data/admin/deliveryGrouping";
import {
  getProductClaimDisplay,
  isNonPickupDelivery,
  isPickupDelivery,
  isSameLocalCalendarDay,
} from "@/data/admin/orderClaim";
import type { OrderClaimRecord } from "@/data/admin/types";

type ParsedRow = {
  rowIndex: number;
  distributorId: string;
  distributorName: string;
  invoiceNumber: string;
  orderDate: string;
  ordererName: string;
  packageName: string;
  packagePrice?: number;
  packageProducts: Record<string, number>;
  subscriptionsCount: number;
  subscriptionProducts: Record<string, number>;
  memberType: string;
  repurchaseProducts: Record<string, number>;
  deliveryMethod: string;
  deliveryCourier: string;
  deliveryFee: number;
  merchantFee: number;
  totalAmount: number;
  paymentMethod: string;
  shippingFullName: string;
  contactNumber: string;
  email: string;
  shippingFullAddress: string;
  province: string;
  city: string;
  region: string;
  zipCode: string;
  status: string;
  isPaid: boolean;
  adjusted?: boolean;
  sourceDate?: string;
};

type StatusOption = "Pending" | "Processing" | "Paid" | "Complete" | "Cancelled";

/** Map uploaded / compiled status text to the dropdown value (default selection). */
function mapStatusToDraft(status: string): StatusOption {
  const s = (status ?? "").toLowerCase();
  if (s.includes("cancel")) return "Cancelled";
  if (s.includes("complete")) return "Complete";
  if (s.includes("paid") && !s.includes("unpaid")) return "Paid";
  if (s.includes("processing")) return "Processing";
  if (s.includes("pending")) return "Pending";
  return "Paid";
}

function isTerminalOrderStatus(status: string): boolean {
  const s = (status ?? "").toLowerCase();
  if (s.includes("cancel")) return true;
  if (s.includes("complete")) return true;
  if (s.includes("paid") && !s.includes("unpaid")) return true;
  return false;
}

type LineEditDraft = {
  packageProducts: Record<string, string>;
  subscriptionProducts: Record<string, string>;
  repurchaseProducts: Record<string, string>;
  subscriptionsCount: string;
  deliveryCategory: "pickup" | "delivery";
  deliveryFee: string;
  merchantFee: string;
  totalAmount: string;
  shippingFullName: string;
  contactNumber: string;
  shippingFullAddress: string;
  province: string;
  city: string;
  region: string;
  zipCode: string;
  /** Blank, J&T, or International when For Delivery */
  deliveryCourier: "" | "J&T" | "International";
};

function shortProductKey(k: string) {
  return k.replace("Chips - ", "Chips ");
}

function rowToLineEditDraft(r: ParsedRow, productKeys: string[]): LineEditDraft {
  const mapVals = (src: Record<string, number> | undefined) =>
    Object.fromEntries(
      productKeys.map((k) => {
        const v = src?.[k];
        return [k, v != null && v !== 0 ? String(v) : "0"];
      }),
    );
  const dm = (r.deliveryMethod ?? "").toLowerCase();
  const deliveryCategory: "pickup" | "delivery" = dm.includes("pick") ? "pickup" : "delivery";
  const cb = courierBucket(r.deliveryCourier ?? "");
  const deliveryCourier: LineEditDraft["deliveryCourier"] =
    cb === "jt" ? "J&T" : cb === "intl" ? "International" : "";
  return {
    packageProducts: mapVals(r.packageProducts),
    subscriptionProducts: mapVals(r.subscriptionProducts),
    repurchaseProducts: mapVals(r.repurchaseProducts),
    subscriptionsCount: String(r.subscriptionsCount ?? 0),
    deliveryCategory,
    deliveryFee: r.deliveryFee != null && r.deliveryFee !== 0 ? String(r.deliveryFee) : "",
    merchantFee: r.merchantFee != null && r.merchantFee !== 0 ? String(r.merchantFee) : "",
    totalAmount: r.totalAmount != null && r.totalAmount !== 0 ? String(r.totalAmount) : "",
    shippingFullName: r.shippingFullName ?? "",
    contactNumber: r.contactNumber ?? "",
    shippingFullAddress: r.shippingFullAddress ?? "",
    province: r.province ?? "",
    city: r.city ?? "",
    region: r.region ?? "",
    zipCode: r.zipCode ?? "",
    deliveryCourier,
  };
}

function formatPackagePrice(v: unknown): string {
  if (v == null || v === "") return "";
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number(String(v).replace(/,/g, "").trim())
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function OrderLineEditForm({
  productKeys,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  productKeys: string[];
  draft: LineEditDraft;
  onChange: (next: LineEditDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const inp =
    "mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-500/50";
  const sec = (title: string, children: ReactNode) => (
    <div className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
      <div className="mb-2 text-xs font-semibold text-zinc-300">{title}</div>
      {children}
    </div>
  );

  const productGrid = (field: "packageProducts" | "subscriptionProducts" | "repurchaseProducts") => (
    <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {productKeys.map((k) => (
        <label key={`${field}-${k}`} className="block min-w-0">
          <span className="block truncate text-[10px] text-zinc-500">{shortProductKey(k)}</span>
          <input
            type="text"
            inputMode="numeric"
            value={draft[field][k] ?? "0"}
            onChange={(e) =>
              onChange({
                ...draft,
                [field]: { ...draft[field], [k]: e.target.value },
              })
            }
            className={inp}
          />
        </label>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {sec("Package products", productGrid("packageProducts"))}
        {sec("Subscription products", productGrid("subscriptionProducts"))}
        {sec("Repurchase products", productGrid("repurchaseProducts"))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-xs text-zinc-400">
          # Subscriptions
          <input
            type="text"
            inputMode="numeric"
            value={draft.subscriptionsCount}
            onChange={(e) => onChange({ ...draft, subscriptionsCount: e.target.value })}
            className={inp}
          />
        </label>
        <label className="block text-xs text-zinc-400">
          Delivery
          <select
            value={draft.deliveryCategory}
            onChange={(e) => {
              const v = e.target.value as "pickup" | "delivery";
              onChange({
                ...draft,
                deliveryCategory: v,
                ...(v === "pickup" ? { deliveryCourier: "" as const } : {}),
              });
            }}
            className={inp}
          >
            <option value="pickup">For Pick Up</option>
            <option value="delivery">For Delivery</option>
          </select>
        </label>
        {draft.deliveryCategory === "delivery" ? (
          <label className="block text-xs text-zinc-400">
            Courier
            <select
              value={draft.deliveryCourier}
              onChange={(e) =>
                onChange({
                  ...draft,
                  deliveryCourier: e.target.value as LineEditDraft["deliveryCourier"],
                })
              }
              className={inp}
            >
              <option value="">—</option>
              <option value="J&T">J&amp;T</option>
              <option value="International">International</option>
            </select>
          </label>
        ) : null}
      </div>
      {draft.deliveryCategory === "delivery" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["deliveryFee", "Delivery fee"],
              ["merchantFee", "Merchant fee"],
              ["totalAmount", "Total amount"],
            ] as const
          ).map(([key, lab]) => (
            <label key={key} className="block text-xs text-zinc-400">
              {lab}
              <input
                type="text"
                inputMode="decimal"
                value={draft[key]}
                onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
                className={inp}
              />
            </label>
          ))}
          {(
            [
              ["shippingFullName", "Shipping full name"],
              ["contactNumber", "Contact #"],
              ["shippingFullAddress", "Shipping full address"],
              ["province", "Province"],
              ["city", "City"],
              ["region", "Region"],
              ["zipCode", "Zip"],
            ] as const
          ).map(([key, lab]) => (
            <label key={key} className="block text-xs text-zinc-400 sm:col-span-2 lg:col-span-1">
              {lab}
              <input
                type="text"
                value={draft[key]}
                onChange={(e) => onChange({ ...draft, [key]: e.target.value })}
                className={inp}
              />
            </label>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save line changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="admin-btn-secondary px-4 py-2 text-xs disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const productKeys = useAdminProductKeys();
  const [index, setIndex] = useState<OrdersImportSummary[]>([]);
  const [rows, setRows] = useState<Array<ParsedRow & { date: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickRange, setPickRange] = useState<DateRange | undefined>(() => {
    const t = startOfDay(new Date());
    return { from: t, to: t };
  });
  const [tablePage, setTablePage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState<10 | 25 | 50>(10);
  const [statusFilter, setStatusFilter] = useState<"All" | "Paid" | "Pending" | "Processing" | "Cancelled">("All");
  const [search, setSearch] = useState("");
  const [pkgProductsOpen, setPkgProductsOpen] = useState(false);
  const [subProductsOpen, setSubProductsOpen] = useState(false);
  const [repProductsOpen, setRepProductsOpen] = useState(false);
  const [shippingDetailsOpen, setShippingDetailsOpen] = useState(false);
  const [claims, setClaims] = useState<Record<string, OrderClaimRecord>>({});
  const [savingClaim, setSavingClaim] = useState<string>("");
  const [lineEditOpen, setLineEditOpen] = useState<Record<string, boolean>>({});
  const [lineEditDrafts, setLineEditDrafts] = useState<Record<string, LineEditDraft>>({});
  const [savingLineEdit, setSavingLineEdit] = useState<string>("");

  const { startDate, endDate } = useMemo(() => {
    if (!pickRange?.from) return { startDate: "", endDate: "" };
    const start = format(pickRange.from, "yyyy-MM-dd");
    const end = pickRange.to ? format(pickRange.to, "yyyy-MM-dd") : start;
    return { startDate: start, endDate: end };
  }, [pickRange]);

  const loadIndex = async () => {
    const res = await fetch("/api/admin/orders", { cache: "no-store" });
    const json = (await res.json()) as { index?: OrdersImportSummary[]; error?: string };
    if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
    setIndex(json.index ?? []);
  };

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setError(null);
      try {
        await loadIndex();
        const t = startOfDay(new Date());
        if (!cancelled) setPickRange({ from: t, to: t });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const refetchCompiledRows = useCallback(async () => {
    if (!index.length) {
      setRows([]);
      setClaims({});
      setLoading(false);
      return;
    }
    if (!startDate || !endDate) {
      setRows([]);
      setClaims({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const start = startDate <= endDate ? startDate : endDate;
      const end = startDate <= endDate ? endDate : startDate;
      const res = await fetch(`/api/admin/orders/compiled?start=${start}&end=${end}`, { cache: "no-store" });
      const json = (await res.json()) as {
        rows?: Array<ParsedRow & { date: string }>;
        claims?: Record<string, OrderClaimRecord>;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      setRows((json.rows ?? []) as Array<ParsedRow & { date: string }>);
      setClaims((json.claims ?? {}) as Record<string, OrderClaimRecord>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [index.length, startDate, endDate]);

  useEffect(() => {
    void refetchCompiledRows();
  }, [refetchCompiledRows]);

  useEffect(() => {
    setTablePage(1);
  }, [rows, search, statusFilter, rowsPerPage]);

  const [statusDraft, setStatusDraft] = useState<Record<string, StatusOption>>({});
  const [savingStatus, setSavingStatus] = useState<string>("");

  const setPendingStatus = async (invoiceNumber: string) => {
    const row = rows.find((x) => x.invoiceNumber === invoiceNumber);
    if (!row) return;
    const next = statusDraft[invoiceNumber] ?? mapStatusToDraft(row.status);
    setSavingStatus(invoiceNumber);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceNumber,
          status: next,
          sourceDate: typeof row.sourceDate === "string" ? row.sourceDate : undefined,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      await refetchCompiledRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingStatus("");
    }
  };

  const claimPickupOrder = async (invoiceNumber: string) => {
    setSavingClaim(invoiceNumber);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNumber }),
      });
      const json = (await res.json()) as { ok?: boolean; claimedAt?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      const at = json.claimedAt ?? new Date().toISOString();
      setClaims((prev) => ({ ...prev, [invoiceNumber]: { claimedAt: at } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingClaim("");
    }
  };

  const tbodyColumnCount = useMemo(() => {
    const pkgCols = pkgProductsOpen ? productKeys.length : 1;
    const subCols = subProductsOpen ? productKeys.length : 0;
    const repCols = repProductsOpen ? productKeys.length : 0;
    const shipCols = shippingDetailsOpen ? 8 : 1;
    return 7 + pkgCols + 1 + subCols + 1 + repCols + 5 + shipCols + 3;
  }, [pkgProductsOpen, subProductsOpen, repProductsOpen, shippingDetailsOpen, productKeys.length]);

  const saveLineEdit = async (invoiceNumber: string) => {
    const draft = lineEditDrafts[invoiceNumber];
    if (!draft) return;
    setSavingLineEdit(invoiceNumber);
    setError(null);
    try {
      const parseN = (s: string) => {
        const x = Number(String(s).replace(/,/g, "").trim());
        return Number.isFinite(x) ? x : 0;
      };
      const lineDetails: Record<string, unknown> = {
        deliveryCategory: draft.deliveryCategory,
        packageProducts: Object.fromEntries(
          productKeys.map((k) => [k, parseN(draft.packageProducts[k] ?? "0")]),
        ),
        subscriptionProducts: Object.fromEntries(
          productKeys.map((k) => [k, parseN(draft.subscriptionProducts[k] ?? "0")]),
        ),
        repurchaseProducts: Object.fromEntries(
          productKeys.map((k) => [k, parseN(draft.repurchaseProducts[k] ?? "0")]),
        ),
        subscriptionsCount: Math.max(0, Math.floor(parseN(draft.subscriptionsCount))),
      };
      if (draft.deliveryCategory === "delivery") {
        lineDetails.deliveryFee = parseN(draft.deliveryFee);
        lineDetails.merchantFee = parseN(draft.merchantFee);
        lineDetails.totalAmount = parseN(draft.totalAmount);
        lineDetails.shippingFullName = draft.shippingFullName;
        lineDetails.contactNumber = draft.contactNumber;
        lineDetails.shippingFullAddress = draft.shippingFullAddress;
        lineDetails.province = draft.province;
        lineDetails.city = draft.city;
        lineDetails.region = draft.region;
        lineDetails.zipCode = draft.zipCode;
        lineDetails.deliveryCourier = draft.deliveryCourier;
      }
      const res = await fetch("/api/admin/orders/line-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceNumber, lineDetails }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      setLineEditOpen((prev) => ({ ...prev, [invoiceNumber]: false }));
      setLineEditDrafts((prev) => {
        const next = { ...prev };
        delete next[invoiceNumber];
        return next;
      });
      await refetchCompiledRows();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingLineEdit("");
    }
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const s = (r.status ?? "").toLowerCase();
      const matchesStatus =
        statusFilter === "All"
          ? true
          : statusFilter === "Paid"
            ? s.includes("paid")
            : statusFilter === "Pending"
              ? s.includes("pending")
              : statusFilter === "Processing"
                ? s.includes("processing")
                : s.includes("cancel");

      if (!matchesStatus) return false;
      if (!q) return true;

      const hay = [
        r.distributorId,
        r.distributorName,
        r.shippingFullName,
        r.ordererName,
        r.invoiceNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, statusFilter, search]);

  const tableTotalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredRows.length / rowsPerPage)),
    [filteredRows.length, rowsPerPage]
  );

  useEffect(() => {
    setTablePage((p) => Math.min(Math.max(1, p), tableTotalPages));
  }, [tableTotalPages]);

  const visibleRows = useMemo(() => {
    const start = (tablePage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, tablePage, rowsPerPage]);

  const hasOpenSection = pkgProductsOpen || subProductsOpen || repProductsOpen;
  const headRowSpan = hasOpenSection ? 2 : 1;
  const shortKey = (k: string) => k.replace("Chips - ", "Chips ");

  return (
    <div className="admin-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="admin-title">All Orders (Detailed)</h1>
          <div className="admin-muted">
            Compiled from confirmed uploads. Only the selected date range is loaded—narrow the range for faster loads.
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Status</div>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "All" | "Paid" | "Pending" | "Processing" | "Cancelled")
              }
              className="mt-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
            >
              <option value="All">All</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400">Search</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1 w-64 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-emerald-500/60"
              placeholder="Distributor / Receiver / ID / Invoice…"
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-zinc-400">Date range</div>
            <div className="mt-1">
              <OrdersDateRangePicker value={pickRange} onChange={setPickRange} />
            </div>
          </div>
          <div className="text-xs text-zinc-400">
            Loaded: <span className="font-semibold text-zinc-200">{rows.length}</span>
            {filteredRows.length !== rows.length ? (
              <>
                {" "}
                • Filtered: <span className="font-semibold text-zinc-200">{filteredRows.length}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="admin-table-wrap">
        <table className="orders-pinned-table min-w-full text-xs">
          <colgroup>
            <col className="w-[6rem]" />
            <col className="w-[7rem]" />
            <col className="w-[13rem]" />
          </colgroup>
          <thead className="bg-black/30 text-zinc-300">
            <tr className="text-[11px]">
              <th className="orders-pin-1 px-3 py-2 text-left" rowSpan={headRowSpan}>
                Date
              </th>
              <th className="orders-pin-2 px-3 py-2 text-left" rowSpan={headRowSpan}>
                Distributor ID
              </th>
              <th className="orders-pin-3 px-3 py-2 text-left" rowSpan={headRowSpan}>
                Distributor
              </th>
              <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                Invoice #
              </th>
              <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                Order date
              </th>
              <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                Package
              </th>
              <th className="px-3 py-2 text-right" rowSpan={headRowSpan}>
                Package price
              </th>
              {pkgProductsOpen ? (
                <th colSpan={productKeys.length} className="px-3 py-2 text-center">
                  <div className="flex items-center justify-between gap-2">
                    <span>Package products</span>
                    <button
                      type="button"
                      aria-expanded={true}
                      aria-label="Collapse package product columns"
                      onClick={() => setPkgProductsOpen(false)}
                      className="shrink-0 rounded px-1 text-zinc-400 hover:bg-white/10 hover:text-emerald-300"
                    >
                      ▲
                    </button>
                  </div>
                </th>
              ) : (
                <th rowSpan={headRowSpan} className="px-3 py-2 text-center">
                  <div className="flex min-w-[10rem] items-center justify-between gap-2">
                    <span>Package products</span>
                    <button
                      type="button"
                      aria-expanded={false}
                      aria-label="Expand package product columns"
                      onClick={() => setPkgProductsOpen(true)}
                      className="shrink-0 rounded px-1 text-zinc-400 hover:bg-white/10 hover:text-emerald-300"
                    >
                      ▼
                    </button>
                  </div>
                </th>
              )}
              {subProductsOpen ? (
                <>
                  <th rowSpan={2} className="px-3 py-2 text-center align-bottom">
                    <div className="flex items-center justify-between gap-2">
                      <span># Subs</span>
                      <button
                        type="button"
                        aria-expanded={true}
                        aria-label="Collapse subscription product columns"
                        onClick={() => setSubProductsOpen(false)}
                        className="shrink-0 rounded px-1 text-zinc-400 hover:bg-white/10 hover:text-emerald-300"
                      >
                        ▲
                      </button>
                    </div>
                  </th>
                  <th colSpan={productKeys.length} className="px-3 py-2 text-center">
                    Subscription products
                  </th>
                </>
              ) : (
                <th rowSpan={headRowSpan} className="px-3 py-2 text-center">
                  <div className="flex min-w-[6rem] items-center justify-between gap-2">
                    <span># Subs</span>
                    <button
                      type="button"
                      aria-expanded={false}
                      aria-label="Expand subscription product columns"
                      onClick={() => setSubProductsOpen(true)}
                      className="shrink-0 rounded px-1 text-zinc-400 hover:bg-white/10 hover:text-emerald-300"
                    >
                      ▼
                    </button>
                  </div>
                </th>
              )}
              {repProductsOpen ? (
                <>
                  <th rowSpan={2} className="px-3 py-2 text-left align-bottom">
                    <div className="flex items-center justify-between gap-2">
                      <span>Member</span>
                      <button
                        type="button"
                        aria-expanded={true}
                        aria-label="Collapse repurchase product columns"
                        onClick={() => setRepProductsOpen(false)}
                        className="shrink-0 rounded px-1 text-zinc-400 hover:bg-white/10 hover:text-emerald-300"
                      >
                        ▲
                      </button>
                    </div>
                  </th>
                  <th colSpan={productKeys.length} className="px-3 py-2 text-center">
                    Repurchase products
                  </th>
                </>
              ) : (
                <th rowSpan={headRowSpan} className="px-3 py-2 text-left">
                  <div className="flex min-w-[7rem] items-center justify-between gap-2">
                    <span>Member</span>
                    <button
                      type="button"
                      aria-expanded={false}
                      aria-label="Expand repurchase product columns"
                      onClick={() => setRepProductsOpen(true)}
                      className="shrink-0 rounded px-1 text-zinc-400 hover:bg-white/10 hover:text-emerald-300"
                    >
                      ▼
                    </button>
                  </div>
                </th>
              )}
              <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                Delivery method
              </th>
              <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                Courier
              </th>
              <th className="px-3 py-2 text-right" rowSpan={headRowSpan}>
                Delivery fee
              </th>
              <th className="px-3 py-2 text-right" rowSpan={headRowSpan}>
                Merchant fee
              </th>
              <th className="px-3 py-2 text-right" rowSpan={headRowSpan}>
                Total amount
              </th>
              <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                Payment method
              </th>
              {shippingDetailsOpen ? (
                <>
                  <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                    <div className="flex min-w-[10rem] items-center justify-between gap-2">
                      <span>Shipping full name</span>
                      <button
                        type="button"
                        aria-expanded={true}
                        aria-label="Hide contact and address columns"
                        onClick={() => setShippingDetailsOpen(false)}
                        className="shrink-0 rounded px-1 text-zinc-400 hover:bg-white/10 hover:text-emerald-300"
                      >
                        ▲
                      </button>
                    </div>
                  </th>
                  <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                    Contact #
                  </th>
                  <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                    Email
                  </th>
                  <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                    Shipping full address
                  </th>
                  <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                    Province
                  </th>
                  <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                    City
                  </th>
                  <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                    Region
                  </th>
                  <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                    Zip
                  </th>
                </>
              ) : (
                <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                  <div className="flex min-w-[10rem] items-center justify-between gap-2">
                    <span>Shipping full name</span>
                    <button
                      type="button"
                      aria-expanded={false}
                      aria-label="Show contact # through zip"
                      onClick={() => setShippingDetailsOpen(true)}
                      className="shrink-0 rounded px-1 text-zinc-400 hover:bg-white/10 hover:text-emerald-300"
                    >
                      ▼
                    </button>
                  </div>
                </th>
              )}
              <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                Status
              </th>
              <th className="px-3 py-2 text-left" rowSpan={headRowSpan}>
                Product status
              </th>
              <th className="px-3 py-2 text-center" rowSpan={headRowSpan}>
                Edit
              </th>
            </tr>
            {hasOpenSection ? (
              <tr className="text-[10px] text-zinc-400">
                {pkgProductsOpen
                  ? productKeys.map((k) => (
                      <th key={`pkg-${k}`} className="px-2 py-2 text-center whitespace-nowrap">
                        {shortKey(k)}
                      </th>
                    ))
                  : null}
                {subProductsOpen
                  ? productKeys.map((k) => (
                      <th key={`sub-${k}`} className="px-2 py-2 text-center whitespace-nowrap">
                        {shortKey(k)}
                      </th>
                    ))
                  : null}
                {repProductsOpen
                  ? productKeys.map((k) => (
                      <th key={`rep-${k}`} className="px-2 py-2 text-center whitespace-nowrap">
                        {shortKey(k)}
                      </th>
                    ))
                  : null}
              </tr>
            ) : null}
          </thead>
          <tbody className="divide-y divide-white/10">
            {visibleRows.map((r) => {
              const inv = r.invoiceNumber;
              const claimMode = getProductClaimDisplay({
                deliveryMethod: r.deliveryMethod,
                status: r.status,
                invoiceNumber: inv,
                claims,
              });
              const statusComplete = (r.status ?? "").toLowerCase().includes("complete");
              const dm = r.deliveryMethod ?? "";
              const sameOrderDay = isSameLocalCalendarDay(r.date);
              const hideLineEditToggle =
                claimMode === "na" ||
                (isPickupDelivery(dm) && claimMode === "claimed") ||
                (isNonPickupDelivery(dm) && !sameOrderDay);
              const allowLineEdit =
                !statusComplete &&
                claimMode !== "na" &&
                ((isNonPickupDelivery(dm) && sameOrderDay) ||
                  (isPickupDelivery(dm) &&
                    claimMode !== "claimed" &&
                    (claimMode === "claim" || claimMode === "unpaid")));
              const editOn = lineEditOpen[inv] ?? false;
              const draft = lineEditDrafts[inv];

              return (
                <Fragment key={`${r.invoiceNumber}-${r.date}-${r.rowIndex}`}>
                  <tr className="bg-black/10 text-zinc-100">
                    <td className="orders-pin-1 px-3 py-2 whitespace-nowrap">{r.date}</td>
                    <td className="orders-pin-2 px-3 py-2 whitespace-nowrap">{r.distributorId}</td>
                    <td
                      className="orders-pin-3 max-w-[13rem] truncate px-3 py-2 whitespace-nowrap"
                      title={r.distributorName}
                    >
                      {r.distributorName}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.invoiceNumber}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.orderDate}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.packageName}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{formatPackagePrice(r.packagePrice)}</td>
                    {pkgProductsOpen ? (
                      productKeys.map((k) => (
                        <td key={`pkgv-${r.invoiceNumber}-${r.rowIndex}-${k}`} className="px-2 py-2 text-center">
                          {r.packageProducts?.[k] ? r.packageProducts[k] : ""}
                        </td>
                      ))
                    ) : (
                      <td className="px-3 py-2" />
                    )}
                    <td className="px-3 py-2 text-center">{r.subscriptionsCount ?? 0}</td>
                    {subProductsOpen
                      ? productKeys.map((k) => (
                          <td key={`subv-${r.invoiceNumber}-${r.rowIndex}-${k}`} className="px-2 py-2 text-center">
                            {r.subscriptionProducts?.[k] ? r.subscriptionProducts[k] : ""}
                          </td>
                        ))
                      : null}
                    <td className="px-3 py-2 whitespace-nowrap">{r.memberType}</td>
                    {repProductsOpen
                      ? productKeys.map((k) => (
                          <td key={`repv-${r.invoiceNumber}-${r.rowIndex}-${k}`} className="px-2 py-2 text-center">
                            {r.repurchaseProducts?.[k] ? r.repurchaseProducts[k] : ""}
                          </td>
                        ))
                      : null}
                    <td className="px-3 py-2 whitespace-nowrap">{r.deliveryMethod}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.deliveryCourier}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.deliveryFee || ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.merchantFee || ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{r.totalAmount || ""}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.paymentMethod}</td>
                    {shippingDetailsOpen ? (
                      <>
                        <td className="px-3 py-2 whitespace-nowrap">{r.shippingFullName}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.contactNumber}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.email}</td>
                        <td className="px-3 py-2 min-w-[320px]">{r.shippingFullAddress}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.province}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.city}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.region}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.zipCode}</td>
                      </>
                    ) : (
                      <td className="px-3 py-2 min-w-[10rem] max-w-[14rem]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{r.shippingFullName}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {(() => {
                        const locked = isTerminalOrderStatus(r.status);
                        if (locked) return <span>{r.status}</span>;
                        return (
                          <div className="flex items-center gap-2">
                            <select
                              value={statusDraft[inv] ?? mapStatusToDraft(r.status)}
                              onChange={(e) =>
                                setStatusDraft((prev) => ({
                                  ...prev,
                                  [inv]: e.target.value as StatusOption,
                                }))
                              }
                              className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-emerald-500/60"
                            >
                              <option value="Pending">Pending</option>
                              <option value="Processing">Processing</option>
                              <option value="Paid">Paid</option>
                              <option value="Complete">Complete</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => setPendingStatus(inv)}
                              disabled={savingStatus === inv}
                              className="rounded-lg bg-emerald-500 px-2 py-1 text-xs font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
                            >
                              {savingStatus === inv ? "Saving…" : "Set"}
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {(() => {
                        if (claimMode === "claimed") {
                          return (
                            <span className="rounded-lg bg-zinc-700/80 px-2.5 py-1 text-xs font-semibold text-zinc-300">
                              Claimed
                            </span>
                          );
                        }
                        if (claimMode === "claim") {
                          return (
                            <button
                              type="button"
                              disabled={savingClaim === r.invoiceNumber}
                              onClick={() => claimPickupOrder(r.invoiceNumber)}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                            >
                              {savingClaim === r.invoiceNumber ? "…" : "Claim"}
                            </button>
                          );
                        }
                        if (claimMode === "unpaid") {
                          return <span className="text-zinc-500">—</span>;
                        }
                        return <span className="text-zinc-500">—</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 text-center align-top">
                      {hideLineEditToggle ? (
                        <span
                          className="text-zinc-600"
                          title={
                            isPickupDelivery(dm) && claimMode === "claimed"
                              ? "Claimed pick-up orders cannot be line-edited."
                              : isNonPickupDelivery(dm) && !sameOrderDay
                                ? "Delivery orders can only be line-edited on the order day (local time)."
                                : undefined
                          }
                        >
                          —
                        </span>
                      ) : (
                        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                          <input
                            type="checkbox"
                            checked={editOn}
                            disabled={!allowLineEdit || savingLineEdit === inv}
                            title={
                              allowLineEdit
                                ? "Edit package / subscription / repurchase quantities and delivery"
                                : "Cannot edit this line"
                            }
                            onChange={(e) => {
                              const on = e.target.checked;
                              setLineEditOpen((prev) => ({ ...prev, [inv]: on }));
                              if (on) {
                                setLineEditDrafts((prev) => ({
                                  ...prev,
                                  [inv]: rowToLineEditDraft(r, productKeys),
                                }));
                              } else {
                                setLineEditDrafts((prev) => {
                                  const next = { ...prev };
                                  delete next[inv];
                                  return next;
                                });
                              }
                            }}
                            className="rounded border-white/20"
                          />
                          Edit
                        </label>
                      )}
                    </td>
                  </tr>
                  {editOn && draft ? (
                    <tr className="bg-zinc-950/60">
                      <td colSpan={tbodyColumnCount} className="border-t border-white/10 p-4">
                        <OrderLineEditForm
                          productKeys={productKeys}
                          draft={draft}
                          onChange={(next) =>
                            setLineEditDrafts((prev) => ({ ...prev, [inv]: next }))
                          }
                          onSave={() => void saveLineEdit(inv)}
                          onCancel={() => {
                            setLineEditOpen((prev) => ({ ...prev, [inv]: false }));
                            setLineEditDrafts((prev) => {
                              const n = { ...prev };
                              delete n[inv];
                              return n;
                            });
                          }}
                          saving={savingLineEdit === inv}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-zinc-400">
          Showing{" "}
          <span className="font-semibold text-zinc-200">
            {filteredRows.length === 0
              ? 0
              : (tablePage - 1) * rowsPerPage + 1}
            –
            {Math.min(tablePage * rowsPerPage, filteredRows.length)}
          </span>{" "}
          of <span className="font-semibold text-zinc-200">{filteredRows.length}</span> (all loaded)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={tablePage <= 1}
            onClick={() => setTablePage((p) => Math.max(1, p - 1))}
            className="admin-btn-secondary px-3 py-2 text-xs disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-1 text-xs tabular-nums text-zinc-300">
            Page {tablePage} of {tableTotalPages}
          </span>
          <button
            type="button"
            disabled={tablePage >= tableTotalPages}
            onClick={() => setTablePage((p) => Math.min(tableTotalPages, p + 1))}
            className="admin-btn-secondary px-3 py-2 text-xs disabled:opacity-40"
          >
            Next
          </button>
          <div className="text-xs font-semibold text-zinc-400">Rows per page</div>
          <select
            value={rowsPerPage}
            onChange={(e) => setRowsPerPage(Number(e.target.value) as 10 | 25 | 50)}
            className="admin-select py-2 text-sm"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>
    </div>
  );
}

