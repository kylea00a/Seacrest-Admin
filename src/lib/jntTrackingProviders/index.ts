import { createOfficialJntProvider } from "@/lib/jntTrackingProviders/official";
import { createTrackingMoreProvider } from "@/lib/jntTrackingProviders/trackingmore";
import type { JntTrackingProvider } from "@/lib/jntTrackingProviders/types";

export type { JntTrackLookupResult, JntTrackingProvider } from "@/lib/jntTrackingProviders/types";

function hasOfficialJntCredentials(): boolean {
  return Boolean(
    process.env.TWOCAPTCHA_API_KEY?.trim() ||
      process.env.CAPSOLVER_API_KEY?.trim() ||
      (process.env.JNT_TRACKING_VERIFY?.trim() && process.env.JNT_TRACKING_VCK?.trim()),
  );
}

/** @param override `official` | `trackingmore` from API/cron; falls back to env then defaults. */
export function resolveJntTrackingProvider(override?: string): JntTrackingProvider | null {
  const prefer = (override ?? process.env.JNT_TRACKING_PROVIDER ?? "").trim().toLowerCase();

  const trackingMore = createTrackingMoreProvider();
  const official = createOfficialJntProvider();

  if (prefer === "trackingmore") return trackingMore ?? official;
  if (prefer === "official") return official ?? trackingMore;

  // Default: J&T website when captcha / manual tokens are configured.
  if (hasOfficialJntCredentials() && official) return official;
  if (trackingMore) return trackingMore;
  return official;
}
