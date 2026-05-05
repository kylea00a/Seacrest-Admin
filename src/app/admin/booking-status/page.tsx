"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminSession } from "../AdminSessionContext";

type BookingStatus =
  | "pending"
  | "in_transit"
  | "out_for_delivery"
  | "return_to_sender"
  | "lost_package"
  | "completed";

type Row = {
  waybillNumber: string;
  shipDateYmd: string;
  receiver: string;
  orderNumber?: string;
  status: BookingStatus;
  updatedAt?: string;
  updatedBy?: string;
};

const STATUS_OPTIONS: Array<{ value: BookingStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "in_transit", label: "In-Transit" },
  { value: "out_for_delivery", label: "Out For Delivery" },
  { value: "return_to_sender", label: "Return To Sender" },
  { value: "lost_package", label: "Lost Package" },
  { value: "completed", label: "Completed" },
];

const FILTER_OPTIONS: Array<{ value: "all" | BookingStatus; label: string }> = [
  { value: "all", label: "All" },
  ...STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

function statusStyle(s: BookingStatus): { row: string; select: string; locked: boolean } {
  if (s === "completed") {
    return { row: "opacity-60", select: "bg-white/5 text-zinc-300", locked: true };
  }
  if (s === "return_to_sender" || s === "lost_package") {
    return { row: "border-rose-500/30", select: "border-rose-500/30 bg-rose-500/10 text-rose-100", locked: true };
  }
  return { row: "", select: "", locked: false };
}

export default function BookingStatusPage() {
  const { account } = useAdminSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | BookingStatus>("pending");
  const [savingWaybill, setSavingWaybill] = useState<string>("");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/booking-status?status=${encodeURIComponent(filter)}`, { cache: "no-store" });
      const json = (await res.json()) as { rows?: Row[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const updateStatus = async (waybillNumber: string, status: BookingStatus) => {
    setSavingWaybill(waybillNumber);
    setError(null);
    try {
      const res = await fetch("/api/admin/booking-status", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ waybillNumber, status }),
      });
      const json = (await res.json()) as { ok?: boolean; record?: Row; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      const rec = json.record;
      if (rec) setRows((prev) => prev.map((r) => (r.waybillNumber === waybillNumber ? { ...r, ...rec } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingWaybill("");
    }
  };

  const headerLabel = useMemo(() => {
    const o = FILTER_OPTIONS.find((x) => x.value === filter);
    return o?.label ?? "Pending";
  }, [filter]);

  return (
    <div className="admin-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="admin-title">Booking Status</h1>
          <div className="admin-muted mt-1">J&amp;T import history with delivery status tracking.</div>
        </div>
        <div className="flex items-end gap-3">
          <div>
            <div className="text-xs font-semibold text-zinc-400">Filter</div>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="admin-select mt-1 min-w-[12rem]"
            >
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? <div className="mt-4 text-sm text-zinc-300">Loading…</div> : null}
      {error ? <div className="admin-alert-error mt-4">{error}</div> : null}

      <div className="admin-table-wrap mt-4">
        <table className="min-w-full text-xs">
          <thead className="bg-black/30 text-zinc-300">
            <tr>
              <th className="px-3 py-2 text-left whitespace-nowrap">Date of delivery</th>
              <th className="px-3 py-2 text-left">Shipping full name</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">Contact number</th>
              <th className="px-3 py-2 text-left whitespace-nowrap">J&amp;T tracking #</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">{headerLabel}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-zinc-500" colSpan={5}>
                  No rows.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const s = statusStyle(r.status);
                const locked = s.locked && !account?.isSuperadmin;
                return (
                  <tr key={r.waybillNumber} className={["bg-black/10 text-zinc-100", s.row].join(" ")}>
                    <td className="px-3 py-2 font-mono text-[11px] text-zinc-300">{r.shipDateYmd || "—"}</td>
                    <td className="px-3 py-2">{r.receiver || "—"}</td>
                    <td className="px-3 py-2 text-zinc-400">—</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{r.waybillNumber}</td>
                    <td className="px-3 py-2 text-right">
                      <select
                        value={r.status}
                        disabled={locked || savingWaybill === r.waybillNumber}
                        onChange={(e) => void updateStatus(r.waybillNumber, e.target.value as BookingStatus)}
                        className={["admin-select py-1 text-[11px]", s.select].join(" ")}
                        title={
                          locked
                            ? "Locked (superadmin can change)"
                            : savingWaybill === r.waybillNumber
                              ? "Saving…"
                              : "Update status"
                        }
                      >
                        {STATUS_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

