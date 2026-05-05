import { NextResponse } from "next/server";
import { loadMergedJntImportRows } from "@/data/admin/jntImportHistory";
import { loadBookingStatus, saveBookingStatus } from "@/data/admin/storage";
import type { BookingStatus, BookingStatusRecord, JntImportRow } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALL_STATUSES: BookingStatus[] = [
  "pending",
  "in_transit",
  "out_for_delivery",
  "return_to_sender",
  "lost_package",
  "completed",
];

function isStatus(v: unknown): v is BookingStatus {
  return typeof v === "string" && (ALL_STATUSES as string[]).includes(v);
}

function normalizeWaybill(v: string): string {
  return (v ?? "").trim().replace(/\s+/g, "");
}

function mergedRowToDefaultRecord(r: JntImportRow): BookingStatusRecord {
  const now = new Date().toISOString();
  return {
    waybillNumber: normalizeWaybill(r.waybillNumber ?? ""),
    shipDateYmd: String(r.shipDateYmd ?? "").slice(0, 10),
    receiver: String(r.receiver ?? ""),
    orderNumber: r.orderNumber ?? undefined,
    status: "pending",
    updatedAt: now,
  };
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const filter = (url.searchParams.get("status") ?? "pending").trim().toLowerCase();
  const statusFilter = filter === "all" ? "all" : (filter as BookingStatus);

  const merged = loadMergedJntImportRows()
    .filter((r) => normalizeWaybill(r.waybillNumber ?? ""))
    .sort((a, b) => String(b.shipDateYmd ?? "").localeCompare(String(a.shipDateYmd ?? "")));

  const map = loadBookingStatus();
  const rows = merged.map((r) => {
    const wb = normalizeWaybill(r.waybillNumber ?? "");
    const existing = map[wb];
    const rec = existing ?? mergedRowToDefaultRecord(r);
    return {
      waybillNumber: wb,
      shipDateYmd: rec.shipDateYmd || String(r.shipDateYmd ?? "").slice(0, 10),
      receiver: rec.receiver || String(r.receiver ?? ""),
      orderNumber: rec.orderNumber ?? r.orderNumber ?? undefined,
      status: rec.status ?? "pending",
      updatedAt: rec.updatedAt ?? "",
      updatedBy: rec.updatedBy ?? "",
    };
  });

  const filtered =
    statusFilter === "all" ? rows : rows.filter((r) => r.status === (statusFilter as BookingStatus));

  return NextResponse.json({ rows: filtered });
}

export async function PUT(req: Request) {
  const auth = await requireApiPermission(req, "delivery");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as { waybillNumber?: unknown; status?: unknown };
  const waybillNumber = typeof body.waybillNumber === "string" ? normalizeWaybill(body.waybillNumber) : "";
  if (!waybillNumber) return NextResponse.json({ error: "Missing `waybillNumber`." }, { status: 400 });
  if (!isStatus(body.status)) return NextResponse.json({ error: "Missing/invalid `status`." }, { status: 400 });

  const nextStatus = body.status;
  const existing = loadBookingStatus();
  const prev = existing[waybillNumber];

  // Non-superadmin: status is locked once set to Completed / RTS / Lost.
  if (!auth.isSuperadmin && prev) {
    if (prev.status === "completed" || prev.status === "return_to_sender" || prev.status === "lost_package") {
      return NextResponse.json({ error: "This booking status is locked." }, { status: 403 });
    }
  }

  // Fill in record fields from latest merged row if missing.
  const merged = loadMergedJntImportRows();
  const fromImport = merged.find((r) => normalizeWaybill(r.waybillNumber ?? "") === waybillNumber);
  const base = prev ?? (fromImport ? mergedRowToDefaultRecord(fromImport) : null);
  if (!base) return NextResponse.json({ error: "Waybill not found in import history." }, { status: 404 });

  const updated: BookingStatusRecord = {
    ...base,
    waybillNumber,
    shipDateYmd: base.shipDateYmd || String(fromImport?.shipDateYmd ?? "").slice(0, 10),
    receiver: base.receiver || String(fromImport?.receiver ?? ""),
    orderNumber: base.orderNumber ?? fromImport?.orderNumber ?? undefined,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
    updatedBy: auth.displayName || auth.email,
  };

  existing[waybillNumber] = updated;
  saveBookingStatus(existing);

  return NextResponse.json({ ok: true, record: updated });
}

