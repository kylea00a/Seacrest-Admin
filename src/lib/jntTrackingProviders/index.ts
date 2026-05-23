import { createOfficialJntProvider } from "@/lib/jntTrackingProviders/official";
import { createTrackingMoreProvider } from "@/lib/jntTrackingProviders/trackingmore";
import type { JntTrackingProvider } from "@/lib/jntTrackingProviders/types";

export type { JntTrackLookupResult, JntTrackingProvider } from "@/lib/jntTrackingProviders/types";

export function resolveJntTrackingProvider(): JntTrackingProvider | null {
  const prefer = (process.env.JNT_TRACKING_PROVIDER ?? "").trim().toLowerCase();

  const trackingMore = createTrackingMoreProvider();
  const official = createOfficialJntProvider();

  if (prefer === "trackingmore") return trackingMore;
  if (prefer === "official") return official;

  if (trackingMore) return trackingMore;
  if (official && (process.env.TWOCAPTCHA_API_KEY?.trim() || process.env.JNT_TRACKING_VERIFY?.trim())) {
    return official;
  }
  return trackingMore ?? official;
}
