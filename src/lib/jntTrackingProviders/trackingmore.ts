import type { JntTrackLookupResult, JntTrackingProvider } from "@/lib/jntTrackingProviders/types";
import { mapTrackingMoreDeliveryStatus } from "@/lib/jntTrackingStatusMap";

const API_BASE = "https://api.trackingmore.com/v4";
const COURIER = "jtexpress-ph";

type TrackingMoreMeta = { code?: number; message?: string };
type TrackingMoreTracking = {
  delivery_status?: string;
  substatus?: string;
  latest_event?: string;
  origin_info?: { trackinfo?: Array<{ StatusDescription?: string }> };
};

function apiKey(): string {
  return (process.env.TRACKINGMORE_API_KEY ?? "").trim();
}

async function tmFetch(path: string, init?: RequestInit): Promise<{ meta?: TrackingMoreMeta; data?: unknown }> {
  const key = apiKey();
  if (!key) throw new Error("TRACKINGMORE_API_KEY is not set.");

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "Tracking-Api-Key": key,
      ...(init?.headers ?? {}),
    },
  });
  const json = (await res.json()) as { meta?: TrackingMoreMeta; data?: unknown };
  const code = json.meta?.code;
  if (code !== undefined && code !== 200 && code !== 201) {
    throw new Error(json.meta?.message ?? `TrackingMore error (${code})`);
  }
  return json;
}

async function ensureTrackingRegistered(waybill: string): Promise<void> {
  try {
    await tmFetch("/trackings/create", {
      method: "POST",
      body: JSON.stringify({
        tracking_number: waybill,
        courier_code: COURIER,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/already exist|duplicate/i.test(msg)) return;
    throw e;
  }
}

async function fetchTracking(waybill: string): Promise<TrackingMoreTracking | null> {
  const json = await tmFetch(
    `/trackings/${encodeURIComponent(COURIER)}/${encodeURIComponent(waybill)}`,
    { method: "GET" },
  );
  const data = json.data;
  if (data && typeof data === "object") return data as TrackingMoreTracking;
  return null;
}

function labelFromTracking(t: TrackingMoreTracking): string {
  const latest = (t.latest_event ?? "").trim();
  if (latest) return latest;
  const events = t.origin_info?.trackinfo;
  if (Array.isArray(events) && events.length) {
    const last = events[events.length - 1];
    if (last?.StatusDescription) return String(last.StatusDescription);
  }
  return (t.delivery_status ?? t.substatus ?? "").trim();
}

export function createTrackingMoreProvider(): JntTrackingProvider | null {
  if (!apiKey()) return null;
  return {
    name: "trackingmore",
    async lookupWaybills(waybills: string[]): Promise<JntTrackLookupResult[]> {
      const results: JntTrackLookupResult[] = [];
      for (const waybillNumber of waybills) {
        try {
          await ensureTrackingRegistered(waybillNumber);
          const tracking = await fetchTracking(waybillNumber);
          if (!tracking) {
            results.push({ waybillNumber, ok: false, error: "No tracking data returned." });
            continue;
          }
          const carrierStatusLabel = labelFromTracking(tracking);
          const raw = (tracking.delivery_status ?? tracking.substatus ?? "").trim();
          const bookingStatus =
            mapTrackingMoreDeliveryStatus(raw) ??
            mapTrackingMoreDeliveryStatus(carrierStatusLabel) ??
            undefined;
          results.push({
            waybillNumber,
            ok: true,
            carrierStatusLabel: carrierStatusLabel || raw || "Unknown",
            bookingStatus,
            rawStatusCode: raw,
          });
        } catch (e) {
          results.push({
            waybillNumber,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return results;
    },
  };
}
