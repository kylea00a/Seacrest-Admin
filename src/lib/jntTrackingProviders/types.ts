import type { BookingStatus } from "@/data/admin/types";

export type JntTrackLookupResult = {
  waybillNumber: string;
  ok: boolean;
  error?: string;
  carrierStatusLabel?: string;
  bookingStatus?: BookingStatus;
  rawStatusCode?: string;
};

export interface JntTrackingProvider {
  readonly name: string;
  /** Up to 10 waybills per call where supported. */
  lookupWaybills(waybills: string[]): Promise<JntTrackLookupResult[]>;
}
