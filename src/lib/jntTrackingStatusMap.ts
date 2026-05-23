import type { BookingStatus } from "@/data/admin/types";

/** J&T website `statuscode` from ylofficialjw API (see track page bundle). */
const JNT_STATUS_CODE_MAP: Record<string, BookingStatus> = {
  "0": "pending",
  "1": "in_transit",
  "2": "in_transit",
  "3": "in_transit",
  "4": "out_for_delivery",
  "5": "completed",
  "6": "lost_package",
  "8": "return_to_sender",
  "9": "return_to_sender",
  "10": "in_transit",
  "11": "in_transit",
  "12": "in_transit",
  "14": "in_transit",
  "10100": "completed",
  "10110": "lost_package",
  "1050": "in_transit",
  "10500": "out_for_delivery",
};

export function mapJntStatusCode(statusCode: string | number | undefined): BookingStatus | null {
  const key = String(statusCode ?? "").trim();
  if (!key) return null;
  return JNT_STATUS_CODE_MAP[key] ?? null;
}

export function mapJntStatusLabel(label: string): BookingStatus | null {
  const s = (label ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("deliver") && !s.includes("out for")) return "completed";
  if (s.includes("out for delivery") || s.includes("out-for-delivery")) return "out_for_delivery";
  if (s.includes("return")) return "return_to_sender";
  if (s.includes("problem") || s.includes("lost") || s.includes("exception")) return "lost_package";
  if (
    s.includes("transit") ||
    s.includes("departure") ||
    s.includes("arrival") ||
    s.includes("picked") ||
    s.includes("processing") ||
    s.includes("inbound") ||
    s.includes("outbound")
  ) {
    return "in_transit";
  }
  return null;
}

/** TrackingMore `delivery_status` / substatus → booking status. */
export function mapTrackingMoreDeliveryStatus(status: string): BookingStatus | null {
  const s = (status ?? "").toLowerCase().replace(/_/g, " ");
  if (!s) return null;
  if (s.includes("delivered")) return "completed";
  if (s.includes("out for delivery") || s === "pickup") return "out_for_delivery";
  if (s.includes("return")) return "return_to_sender";
  if (s.includes("exception") || s.includes("undelivered") || s.includes("expired")) return "lost_package";
  if (s.includes("transit") || s.includes("inforeceived") || s.includes("pickup")) return "in_transit";
  if (s.includes("pending")) return "pending";
  return null;
}

export function isTerminalBookingStatus(status: BookingStatus): boolean {
  return status === "completed" || status === "return_to_sender" || status === "lost_package";
}
