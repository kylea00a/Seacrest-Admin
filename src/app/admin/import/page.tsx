"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { OrdersImportSummary } from "@/data/admin/types";
import { useAdminProductKeys } from "../_components/useAdminProductKeys";

type PreviewRow = {
  rowIndex: number;
  distributorId: string;
  distributorName: string;
  invoiceNumber: string;
  orderDate: string;
  packageName: string;
  packagePrice: number;
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
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currency(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n);
  } catch {
    return `${n}`;
  }
}

function countFmt(n: number) {
  return new Intl.NumberFormat().format(n);
}

function mapStoredRowToPreview(row: unknown, fallbackIndex: number): PreviewRow {
  const r = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
  const num = (v: unknown, d = 0) => (typeof v === "number" && !Number.isNaN(v) ? v : d);
  const str = (v: unknown, d = "") => (typeof v === "string" ? v : d);
  const bool = (v: unknown, d = false) => (typeof v === "boolean" ? v : d);
  const rec = (v: unknown): Record<string, number> => {
    if (typeof v !== "object" || v === null) return {};
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === "number" && !Number.isNaN(val)) out[k] = val;
    }
    return out;
  };
  const ri = num(r.rowIndex, 0);
  return {
    rowIndex: ri > 0 ? ri : fallbackIndex + 1,
    distributorId: str(r.distributorId),
    distributorName: str(r.distributorName),
    invoiceNumber: str(r.invoiceNumber),
    orderDate: str(r.orderDate),
    packageName: str(r.packageName),
    packagePrice: num(r.packagePrice, 0),
    packageProducts: rec(r.packageProducts),
    subscriptionsCount: num(r.subscriptionsCount, 0),
    subscriptionProducts: rec(r.subscriptionProducts),
    memberType: str(r.memberType),
    repurchaseProducts: rec(r.repurchaseProducts),
    deliveryMethod: str(r.deliveryMethod),
    deliveryCourier: str(r.deliveryCourier),
    deliveryFee: num(r.deliveryFee, 0),
    merchantFee: num(r.merchantFee, 0),
    totalAmount: num(r.totalAmount, 0),
    paymentMethod: str(r.paymentMethod),
    shippingFullName: str(r.shippingFullName),
    contactNumber: str(r.contactNumber),
    email: str(r.email),
    shippingFullAddress: str(r.shippingFullAddress),
    province: str(r.province),
    city: str(r.city),
    region: str(r.region),
    zipCode: str(r.zipCode),
    status: str(r.status),
    isPaid: bool(r.isPaid),
  };
}

function ImportPreviewDetailSection({
  productKeys,
  rows,
  page,
  setPage,
  pageSize,
  setPageSize,
  fileTotalRows,
  title = "Detailed preview",
}: {
  productKeys: string[];
  rows: PreviewRow[];
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  pageSize: 10 | 25 | 50;
  setPageSize: Dispatch<SetStateAction<10 | 25 | 50>>;
  fileTotalRows?: number;
  title?: string;
}) {
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(rows.length / pageSize)),
    [rows.length, pageSize],
  );

  const pagedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, setPage]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), totalPages));
  }, [totalPages, rows.length, setPage]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs text-zinc-400">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} of {rows.length} in this preview
            {fileTotalRows != null ? ` (${fileTotalRows.toLocaleString()} rows in file)` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="whitespace-nowrap">Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value) as 10 | 25 | 50)}
              className="admin-select py-1.5 text-xs"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="admin-btn-secondary px-2 py-1.5 text-xs disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-2 text-xs tabular-nums text-zinc-300">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="admin-btn-secondary px-2 py-1.5 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
      <div className="admin-table-wrap mt-2">
        <table className="min-w-full text-xs">
          <thead className="bg-black/30 text-zinc-300">
            <tr className="text-[11px]">
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Distributor ID
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Distributor
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Invoice #
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Order date
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Package
              </th>
              <th className="px-3 py-2 text-right" rowSpan={2}>
                Package price
              </th>
              <th className="px-3 py-2 text-center" colSpan={productKeys.length}>
                Package products
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                # Subs
              </th>
              <th className="px-3 py-2 text-center" colSpan={productKeys.length}>
                Subscription products
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Member
              </th>
              <th className="px-3 py-2 text-center" colSpan={productKeys.length}>
                Repurchase products
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Delivery method
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Courier
              </th>
              <th className="px-3 py-2 text-right" rowSpan={2}>
                Delivery fee
              </th>
              <th className="px-3 py-2 text-right" rowSpan={2}>
                Merchant fee
              </th>
              <th className="px-3 py-2 text-right" rowSpan={2}>
                Total amount
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Payment method
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Shipping full name
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Contact #
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Email
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Shipping full address
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Province
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                City
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Region
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Zip
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Status
              </th>
              <th className="px-3 py-2 text-left" rowSpan={2}>
                Paid?
              </th>
            </tr>
            <tr className="text-[10px] text-zinc-400">
              {productKeys.map((k) => (
                <th key={`pkg-${k}`} className="px-2 py-2 text-center whitespace-nowrap">
                  {k.replace("Chips - ", "Chips ")}
                </th>
              ))}
              {productKeys.map((k) => (
                <th key={`sub-${k}`} className="px-2 py-2 text-center whitespace-nowrap">
                  {k.replace("Chips - ", "Chips ")}
                </th>
              ))}
              {productKeys.map((k) => (
                <th key={`rep-${k}`} className="px-2 py-2 text-center whitespace-nowrap">
                  {k.replace("Chips - ", "Chips ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {pagedRows.map((r) => (
              <tr key={r.rowIndex} className="bg-black/10 text-zinc-100">
                <td className="px-3 py-2 whitespace-nowrap">{r.distributorId}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.distributorName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.invoiceNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.orderDate}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.packageName}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{r.packagePrice ? currency(r.packagePrice) : ""}</td>
                {productKeys.map((k) => (
                  <td key={`pkgv-${r.rowIndex}-${k}`} className="px-2 py-2 text-center">
                    {r.packageProducts?.[k] ? r.packageProducts[k] : ""}
                  </td>
                ))}
                <td className="px-3 py-2 text-center">{r.subscriptionsCount ?? 0}</td>
                {productKeys.map((k) => (
                  <td key={`subv-${r.rowIndex}-${k}`} className="px-2 py-2 text-center">
                    {r.subscriptionProducts?.[k] ? r.subscriptionProducts[k] : ""}
                  </td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap">{r.memberType}</td>
                {productKeys.map((k) => (
                  <td key={`repv-${r.rowIndex}-${k}`} className="px-2 py-2 text-center">
                    {r.repurchaseProducts?.[k] ? r.repurchaseProducts[k] : ""}
                  </td>
                ))}
                <td className="px-3 py-2 whitespace-nowrap">{r.deliveryMethod}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.deliveryCourier}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{r.deliveryFee ? currency(r.deliveryFee) : ""}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{r.merchantFee ? currency(r.merchantFee) : ""}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{r.totalAmount ? currency(r.totalAmount) : ""}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.paymentMethod}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.shippingFullName}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.contactNumber}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.email}</td>
                <td className="px-3 py-2 min-w-[320px]">{r.shippingFullAddress}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.province}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.city}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.region}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.zipCode}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.status}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.isPaid ? "Paid" : "Unpaid"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ImportOrdersPage() {
  const productKeys = useAdminProductKeys();
  const [date, setDate] = useState(todayISO());
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OrdersImportSummary | null>(null);
  const [token, setToken] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPageSize, setPreviewPageSize] = useState<10 | 25 | 50>(10);
  const [bulkSplit, setBulkSplit] = useState(false);
  const [bulkMeta, setBulkMeta] = useState<{
    totalRows: number;
    totalDays: number;
    dateMin: string;
    dateMax: string;
    skippedNoDate: number;
    filename: string;
  } | null>(null);
  const [dayCounts, setDayCounts] = useState<Array<{ date: string; rows: number }>>([]);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const [index, setIndex] = useState<OrdersImportSummary[]>([]);
  const [manageImports, setManageImports] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Record<string, boolean>>({});
  const [deletingDate, setDeletingDate] = useState<string>("");
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [savedPreviewDate, setSavedPreviewDate] = useState<string | null>(null);
  const [savedPreviewRows, setSavedPreviewRows] = useState<PreviewRow[]>([]);
  const [savedPreviewPage, setSavedPreviewPage] = useState(1);
  const [savedPreviewPageSize, setSavedPreviewPageSize] = useState<10 | 25 | 50>(10);
  const [loadingSavedDate, setLoadingSavedDate] = useState<string | null>(null);
  const [savedPreviewError, setSavedPreviewError] = useState<string | null>(null);
  const savedImportFetchAbort = useRef<AbortController | null>(null);

  const loadIndex = async () => {
    try {
      const res = await fetch("/api/admin/orders", { cache: "no-store" });
      const json = (await res.json()) as { index?: OrdersImportSummary[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      setIndex(json.index ?? []);
    } catch {
      // ignore for now
    }
  };

  useEffect(() => {
    loadIndex();
  }, []);

  useEffect(() => {
    if (!manageImports) {
      setSelectedDates({});
      return;
    }
    // Keep selections only for currently loaded index dates.
    const allowed = new Set(index.map((x) => x.date));
    setSelectedDates((prev) => {
      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(prev)) if (allowed.has(k) && v) next[k] = true;
      return next;
    });
  }, [manageImports, index]);

  const toggleSavedImportPreview = async (dateStr: string) => {
    if (savedPreviewDate === dateStr && !loadingSavedDate) {
      setSavedPreviewDate(null);
      setSavedPreviewRows([]);
      setSavedPreviewError(null);
      return;
    }
    setSavedPreviewError(null);
    setSavedPreviewDate(dateStr);
    setSavedPreviewRows([]);
    savedImportFetchAbort.current?.abort();
    const ac = new AbortController();
    savedImportFetchAbort.current = ac;
    setLoadingSavedDate(dateStr);
    try {
      const res = await fetch(`/api/admin/orders?date=${encodeURIComponent(dateStr)}`, {
        cache: "no-store",
        signal: ac.signal,
      });
      const json = (await res.json()) as { day?: { parsed?: { rows?: unknown[] } }; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      const raw = json.day?.parsed?.rows;
      const mapped = Array.isArray(raw)
        ? raw.map((row, idx) => mapStoredRowToPreview(row, idx))
        : [];
      setSavedPreviewRows(mapped);
      setSavedPreviewPage(1);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setSavedPreviewError(e instanceof Error ? e.message : String(e));
      setSavedPreviewRows([]);
    } finally {
      if (savedImportFetchAbort.current === ac) {
        savedImportFetchAbort.current = null;
        setLoadingSavedDate(null);
      }
    }
  };

  const canUpload = useMemo(() => {
    if (!file) return false;
    if (bulkSplit) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(date);
  }, [file, date, bulkSplit]);

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSummary(null);
    setBulkMeta(null);
    setDayCounts([]);
    setImportNotice(null);
    setToken("");
    setPreviewRows([]);
    setPreviewPage(1);
    setSavedPreviewDate(null);
    setSavedPreviewRows([]);
    setSavedPreviewError(null);
    try {
      const form = new FormData();
      form.append("date", date);
      form.append("file", file);
      if (bulkSplit) form.append("bulk", "1");

      const res = await fetch("/api/admin/orders/preview", { method: "POST", body: form });
      const json = (await res.json()) as {
        bulk?: boolean;
        bulkMeta?: {
          totalRows: number;
          totalDays: number;
          dateMin: string;
          dateMax: string;
          skippedNoDate: number;
          filename: string;
        };
        dayCounts?: Array<{ date: string; rows: number }>;
        token?: string;
        summary?: OrdersImportSummary;
        previewRows?: PreviewRow[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      setSummary(json.summary ?? null);
      setBulkMeta(json.bulk ? (json.bulkMeta ?? null) : null);
      setDayCounts(json.bulk ? (json.dayCounts ?? []) : []);
      setToken(json.token ?? "");
      setPreviewRows(json.previewRows ?? []);
      setPreviewPage(1);
      await loadIndex();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const confirm = async () => {
    if (!token) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = (await res.json()) as {
        bulk?: boolean;
        count?: number;
        summary?: OrdersImportSummary;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      if (json.bulk) {
        setImportNotice(`Saved ${json.count ?? 0} separate days of orders (by Order date column).`);
        setSummary(null);
        setBulkMeta(null);
        setDayCounts([]);
      } else {
        setImportNotice(null);
        setSummary(json.summary ?? summary);
      }
      setToken("");
      setPreviewRows([]);
      await loadIndex();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const deleteImport = async (dateToDelete: string) => {
    if (!dateToDelete) return;
    setDeletingDate(dateToDelete);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders?date=${dateToDelete}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      await loadIndex();
      if (dateToDelete === savedPreviewDate) {
        setSavedPreviewDate(null);
        setSavedPreviewRows([]);
        setSavedPreviewError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingDate("");
    }
  };

  const selectedList = useMemo(() => Object.keys(selectedDates).filter((d) => selectedDates[d]), [selectedDates]);
  const allVisibleDates = useMemo(() => index.slice(0, 20).map((i) => i.date), [index]);
  const allVisibleSelected = useMemo(
    () => allVisibleDates.length > 0 && allVisibleDates.every((d) => Boolean(selectedDates[d])),
    [allVisibleDates, selectedDates],
  );

  const toggleSelectAllVisible = () => {
    setSelectedDates((prev) => {
      const next = { ...prev };
      const nextVal = !allVisibleSelected;
      for (const d of allVisibleDates) {
        if (nextVal) next[d] = true;
        else delete next[d];
      }
      return next;
    });
  };

  const bulkDeleteSelected = async () => {
    if (selectedList.length === 0) return;
    const ok = window.confirm(
      `Delete ${selectedList.length} import day(s)? This removes them from Sales Report and Delivery.`,
    );
    if (!ok) return;
    setBulkDeleting(true);
    setError(null);
    try {
      const qp = new URLSearchParams({ dates: selectedList.join(",") });
      const res = await fetch(`/api/admin/orders?${qp.toString()}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      setSelectedDates({});
      await loadIndex();
      if (savedPreviewDate && selectedDates[savedPreviewDate]) {
        setSavedPreviewDate(null);
        setSavedPreviewRows([]);
        setSavedPreviewError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkDeleting(false);
    }
  };

  const deleteAllImports = async () => {
    if (index.length === 0) return;
    const ok = window.confirm(
      `Delete all ${index.length} import day(s)? Every stored import will be removed from Sales Report and Delivery. This cannot be undone.`,
    );
    if (!ok) return;
    setDeletingAll(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/orders?all=1", { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed with status ${res.status}`);
      setSelectedDates({});
      setSavedPreviewDate(null);
      setSavedPreviewRows([]);
      setSavedPreviewError(null);
      await loadIndex();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="space-y-6 lg:min-w-0">
      <div className="admin-card">
        <h1 className="admin-title">Import Orders (Excel)</h1>
        <div className="admin-muted">
          Upload your daily orders file. You’ll preview details before confirming.
          <div className="mt-2 text-xs text-zinc-500">
            Package products = H–N • Subscriptions count = P • Subscription products = Q–W • Member flag = X • Repurchase products = Y–AH
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.08] bg-zinc-950/40 p-3 text-xs leading-relaxed text-zinc-400">
            <span className="font-semibold text-zinc-300">One file, many days:</span> Check{" "}
            <span className="text-zinc-300">Split by order date</span> to save a long spreadsheet into one{" "}
            <span className="font-mono text-zinc-300">YYYY-MM-DD</span> file per row, using the <span className="text-zinc-300">Order date</span> column.
            Otherwise pick a single <span className="text-zinc-300">File date</span> for the whole import (one day per upload).
          </div>
        </div>

        <div className="mt-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-zinc-200">
            <input
              type="checkbox"
              checked={bulkSplit}
              onChange={(e) => setBulkSplit(e.target.checked)}
              className="mt-1 rounded border-white/20 bg-black/30"
            />
            <span>
              <span className="font-semibold">Split by order date</span>
              <span className="mt-0.5 block text-xs font-normal text-zinc-400">
                One workbook can list a full year or more: each row is grouped by its Order date and saved as separate days.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold">
              {bulkSplit ? "Fallback date (optional)" : "File date"}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
            />
            <div className="mt-1 text-xs text-zinc-500">
              {bulkSplit
                ? "Rows with a missing or unreadable Order date use this day. Leave empty to skip those rows."
                : "Required — entire file is stored under this day."}
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold">Excel file (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={upload}
            disabled={!canUpload || uploading}
            className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:opacity-60"
          >
            {uploading ? "Reading…" : "Preview"}
          </button>
          <div className="text-xs text-zinc-400">
            Not saved until you confirm.
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {importNotice ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
            {importNotice}
          </div>
        ) : null}

        {summary ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">
                  {bulkMeta ? "Bulk preview (not saved yet)" : "Preview (not saved yet)"}
                </div>
                <div className="mt-1 text-xs text-zinc-400">
                  {bulkMeta ? (
                    <>
                      {bulkMeta.filename} • {bulkMeta.totalRows.toLocaleString()} rows →{" "}
                      <span className="text-zinc-300">{bulkMeta.totalDays}</span> days
                      <span className="text-zinc-500"
                        >{" "}
                        ({bulkMeta.dateMin} … {bulkMeta.dateMax})
                      </span>
                      {bulkMeta.skippedNoDate > 0 ? (
                        <span className="font-medium text-amber-200/90">
                          {" "}
                          • Skipped {bulkMeta.skippedNoDate} row(s) with no Order date
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {summary.filename} • {summary.date} • {summary.totalRows} rows
                    </>
                  )}
                </div>
              </div>
              <div className="text-xs text-zinc-400">{new Date(summary.importedAt).toLocaleString()}</div>
            </div>

            {bulkMeta && dayCounts.length > 0 ? (
              <div className="mt-4 max-h-48 overflow-auto rounded-xl border border-white/[0.06] bg-zinc-950/50">
                <table className="min-w-full text-left text-xs text-zinc-300">
                  <thead className="sticky top-0 bg-zinc-950/95 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Order date (saved as)</th>
                      <th className="px-3 py-2 text-right">Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayCounts.map((d) => (
                      <tr key={d.date} className="border-t border-white/[0.04]">
                        <td className="px-3 py-1.5 font-mono">{d.date}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{d.rows.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="admin-card-inset">
                <div className="text-xs font-semibold text-zinc-400">Package orders</div>
                <div className="mt-1 text-xs text-zinc-500">Successful (excl. pending / processing / cancelled)</div>
                <div className="mt-1 text-lg font-bold text-white">{countFmt(summary.totals.package)}</div>
              </div>
              <div className="admin-card-inset">
                <div className="text-xs font-semibold text-zinc-400">Subscription orders</div>
                <div className="mt-1 text-xs text-zinc-500">Successful (excl. pending / processing / cancelled)</div>
                <div className="mt-1 text-lg font-bold text-white">{countFmt(summary.totals.subscription)}</div>
              </div>
              <div className="admin-card-inset">
                <div className="text-xs font-semibold text-zinc-400">Repurchase orders</div>
                <div className="mt-1 text-xs text-zinc-500">Successful (excl. pending / processing / cancelled)</div>
                <div className="mt-1 text-lg font-bold text-white">{countFmt(summary.totals.repurchase)}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={confirm}
                disabled={!token || uploading}
                className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-emerald-950 hover:bg-emerald-400 disabled:opacity-60"
              >
                {uploading ? "Saving…" : "Confirm & Save"}
              </button>
              <div className="text-xs text-zinc-400">
                {bulkMeta
                  ? `Confirms all ${bulkMeta.totalDays} days at once (Sales Report + Orders).`
                  : "This will add it to Sales Report + Orders list."}
              </div>
            </div>

            {previewRows.length > 0 ? (
              <ImportPreviewDetailSection
                productKeys={productKeys}
                rows={previewRows}
                page={previewPage}
                setPage={setPreviewPage}
                pageSize={previewPageSize}
                setPageSize={setPreviewPageSize}
                fileTotalRows={summary?.totalRows}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {savedPreviewDate || loadingSavedDate || savedPreviewError ? (
        <div className="admin-card">
          <div className="text-sm font-semibold text-white">Saved import preview</div>
          <div className="mt-1 text-xs text-zinc-400">
            Click a date in Recent imports to load rows from storage. Click again to close.
          </div>
          {savedPreviewDate ? (
            <div className="mt-2 text-xs text-zinc-300">
              <span className="truncate">{index.find((x) => x.date === savedPreviewDate)?.filename ?? "—"}</span>
              {" · "}
              <span className="font-mono text-zinc-200">{savedPreviewDate}</span>
            </div>
          ) : null}
          {loadingSavedDate ? <div className="mt-4 text-sm text-zinc-400">Loading rows…</div> : null}
          {savedPreviewError ? (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {savedPreviewError}
            </div>
          ) : null}
          {!loadingSavedDate && savedPreviewDate && !savedPreviewError && savedPreviewRows.length === 0 ? (
            <div className="mt-4 text-sm text-zinc-400">No parsed rows found for this import.</div>
          ) : null}
          {savedPreviewRows.length > 0 ? (
            <ImportPreviewDetailSection
              productKeys={productKeys}
              rows={savedPreviewRows}
              page={savedPreviewPage}
              setPage={setSavedPreviewPage}
              pageSize={savedPreviewPageSize}
              setPageSize={setSavedPreviewPageSize}
              title="Detailed preview"
            />
          ) : null}
        </div>
      ) : null}
      </div>

      <div className="admin-card">
        <div className="text-sm font-semibold">Recent imports</div>
        <div className="mt-1 text-xs text-zinc-400">Latest first · click a day to preview stored rows (paginated)</div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-400">
            Toggle manage mode to delete an import (also removes it from Sales Report + Delivery).
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <input
              type="checkbox"
              checked={manageImports}
              onChange={(e) => setManageImports(e.target.checked)}
            />
            Manage
          </label>
        </div>

        {manageImports ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/20 p-2">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-zinc-300">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} />
              Select all (visible)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs text-zinc-400">
                Selected: <span className="font-semibold text-zinc-200">{selectedList.length}</span>
              </div>
              <button
                type="button"
                onClick={() => void bulkDeleteSelected()}
                disabled={bulkDeleting || deletingAll || selectedList.length === 0}
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
              >
                {bulkDeleting ? "Deleting…" : "Delete selected"}
              </button>
              <button
                type="button"
                onClick={() => void deleteAllImports()}
                disabled={bulkDeleting || deletingAll || index.length === 0}
                className="rounded-xl border border-red-500/50 bg-red-950/40 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-950/70 disabled:opacity-60"
              >
                {deletingAll ? "Deleting…" : "Delete all imports"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {index.length === 0 ? (
            <div className="text-sm text-zinc-300">No imports yet.</div>
          ) : (
            index.slice(0, 20).map((i) => (
              <div
                key={i.date}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    void toggleSavedImportPreview(i.date);
                  }
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("button")) return;
                  if ((e.target as HTMLElement).closest("input")) return;
                  void toggleSavedImportPreview(i.date);
                }}
                className={`rounded-2xl border bg-black/20 p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                  savedPreviewDate === i.date
                    ? "border-emerald-500/50 ring-2 ring-emerald-500/20"
                    : "border-white/10 hover:border-white/20"
                } ${loadingSavedDate === i.date ? "opacity-80" : ""} cursor-pointer`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">{i.date}</div>
                    <div className="mt-1 truncate text-xs text-zinc-400">{i.filename}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {manageImports ? (
                      <label className="flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={Boolean(selectedDates[i.date])}
                          onChange={(e) =>
                            setSelectedDates((prev) => {
                              const next = { ...prev };
                              if (e.target.checked) next[i.date] = true;
                              else delete next[i.date];
                              return next;
                            })
                          }
                        />
                      </label>
                    ) : null}
                    <div className="text-xs text-zinc-400">
                      {loadingSavedDate === i.date ? "Loading…" : `${i.totalRows} rows`}
                    </div>
                    {manageImports && (
                      <button
                        type="button"
                        onClick={() => {
                          const ok = window.confirm(
                            `Delete import for ${i.date}? This will remove it from Sales Report and Delivery.`,
                          );
                          if (ok) deleteImport(i.date);
                        }}
                        disabled={deletingDate === i.date}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-60"
                      >
                        {deletingDate === i.date ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-zinc-200">
                    P: <span className="font-semibold text-white">{countFmt(i.totals.package)}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-zinc-200">
                    S: <span className="font-semibold text-white">{countFmt(i.totals.subscription)}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-1 text-zinc-200">
                    R: <span className="font-semibold text-white">{countFmt(i.totals.repurchase)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

