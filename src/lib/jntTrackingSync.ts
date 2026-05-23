import { loadMergedJntImportRows } from "@/data/admin/jntImportHistory";
import { loadBookingStatus, saveBookingStatus } from "@/data/admin/storage";
import type { BookingStatus, BookingStatusRecord } from "@/data/admin/types";
import { resolveJntTrackingProvider } from "@/lib/jntTrackingProviders";
import { isTerminalBookingStatus } from "@/lib/jntTrackingStatusMap";

export type JntTrackingSyncResult = {
  ok: boolean;
  provider: string | null;
  checked: number;
  updated: number;
  skippedTerminal: number;
  errors: Array<{ waybillNumber: string; error: string }>;
  finishedAt: string;
};

function normalizeWaybill(v: string): string {
  return (v ?? "").trim().replace(/\s+/g, "");
}

function defaultRecordFromImport(
  waybill: string,
  row: { shipDateYmd?: string; receiver?: string; orderNumber?: string },
): BookingStatusRecord {
  const now = new Date().toISOString();
  return {
    waybillNumber: waybill,
    shipDateYmd: String(row.shipDateYmd ?? "").slice(0, 10),
    receiver: String(row.receiver ?? ""),
    orderNumber: row.orderNumber ?? undefined,
    status: "pending",
    updatedAt: now,
  };
}

export async function runJntTrackingSync(args?: {
  /** Only these waybills (normalized). If empty, sync all non-terminal imports. */
  waybills?: string[];
  force?: boolean;
}): Promise<JntTrackingSyncResult> {
  const provider = resolveJntTrackingProvider();
  const finishedAt = new Date().toISOString();

  if (!provider) {
    return {
      ok: false,
      provider: null,
      checked: 0,
      updated: 0,
      skippedTerminal: 0,
      errors: [
        {
          waybillNumber: "",
          error:
            "No tracking provider configured. Set TRACKINGMORE_API_KEY (recommended) or TWOCAPTCHA_API_KEY for the official J&T site.",
        },
      ],
      finishedAt,
    };
  }

  const imports = loadMergedJntImportRows();
  const byWaybill = new Map<string, (typeof imports)[0]>();
  for (const row of imports) {
    const wb = normalizeWaybill(row.waybillNumber ?? "");
    if (wb) byWaybill.set(wb, row);
  }

  const filterSet = args?.waybills?.length
    ? new Set(args.waybills.map(normalizeWaybill).filter(Boolean))
    : null;

  const booking = loadBookingStatus();
  const toCheck: string[] = [];

  for (const wb of byWaybill.keys()) {
    if (filterSet && !filterSet.has(wb)) continue;
    const existing = booking[wb];
    const status = existing?.status ?? "pending";
    if (!args?.force && isTerminalBookingStatus(status)) continue;
    toCheck.push(wb);
  }

  let updated = 0;
  let skippedTerminal = 0;
  const errors: Array<{ waybillNumber: string; error: string }> = [];

  for (let i = 0; i < toCheck.length; i += 10) {
    const batch = toCheck.slice(i, i + 10);
    const lookups = await provider.lookupWaybills(batch);

    for (const lookup of lookups) {
      const wb = lookup.waybillNumber;
      if (!lookup.ok) {
        errors.push({ waybillNumber: wb, error: lookup.error ?? "Lookup failed." });
        continue;
      }

      const importRow = byWaybill.get(wb);
      const prev = booking[wb] ?? (importRow ? defaultRecordFromImport(wb, importRow) : null);
      if (!prev) {
        errors.push({ waybillNumber: wb, error: "Waybill not in import history." });
        continue;
      }

      if (!args?.force && isTerminalBookingStatus(prev.status)) {
        skippedTerminal++;
        continue;
      }

      const nextStatus: BookingStatus = lookup.bookingStatus ?? prev.status;
      const changed =
        nextStatus !== prev.status ||
        lookup.carrierStatusLabel !== prev.jntCarrierStatus ||
        lookup.rawStatusCode !== prev.jntStatusCode;

      booking[wb] = {
        ...prev,
        status: nextStatus,
        jntCarrierStatus: lookup.carrierStatusLabel ?? prev.jntCarrierStatus,
        jntStatusCode: lookup.rawStatusCode ?? prev.jntStatusCode,
        jntCheckedAt: finishedAt,
        autoSynced: true,
        updatedAt: finishedAt,
        updatedBy: `jnt-sync:${provider.name}`,
      };

      if (changed && nextStatus !== prev.status) updated++;
      else if (changed) updated++;
    }
  }

  saveBookingStatus(booking);

  return {
    ok: errors.length === 0 || updated > 0,
    provider: provider.name,
    checked: toCheck.length,
    updated,
    skippedTerminal,
    errors,
    finishedAt,
  };
}
