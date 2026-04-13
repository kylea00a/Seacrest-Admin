import { NextResponse } from "next/server";
import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { isNonPickupDelivery, isPickupDelivery, paidFromStatusText, type OrderClaimsMap } from "@/data/admin/orderClaim";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { loadOrderAdjustments, loadOrderClaims, loadOrdersIndex, saveOrderClaims } from "@/data/admin/storage";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

type Body = {
  /** YYYY-MM-DD */
  targetYmd?: unknown;
  /** If true, excludes the latest uploaded import day from `ordersIndex.json[0]`. */
  excludeLatestUploadDay?: unknown;
};

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "ordersFullEdit");
  if (auth instanceof NextResponse) return auth;
  if (!auth.isSuperadmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Body;
  const targetYmd = isDateOnly(body.targetYmd) ? String(body.targetYmd).trim() : "2026-04-10";
  if (!isDateOnly(targetYmd)) {
    return NextResponse.json({ error: "Invalid `targetYmd` (YYYY-MM-DD)." }, { status: 400 });
  }
  const excludeLatest = body.excludeLatestUploadDay == null ? true : Boolean(body.excludeLatestUploadDay);

  const index = loadOrdersIndex();
  const excludeSourceDate = excludeLatest && index[0]?.date ? String(index[0].date).slice(0, 10) : "";

  const claims = loadOrderClaims() as unknown as OrderClaimsMap;
  const adjustments = loadOrderAdjustments();

  const need = new Set(Object.keys(claims));
  const infoByInv = new Map<string, { status: string; deliveryMethod: string; sourceDate: string }>();

  const dates = [...new Set(index.map((i) => i.date))].sort((a, b) => b.localeCompare(a));
  for (const sourceDate of dates) {
    if (need.size === 0) break;
    const dayUnknown = await readOrdersDayAsync(sourceDate);
    const day =
      typeof dayUnknown === "object" && dayUnknown !== null ? (dayUnknown as Record<string, unknown>) : null;
    const parsed =
      day && typeof day["parsed"] === "object" && day["parsed"] !== null ? (day["parsed"] as Record<string, unknown>) : null;
    const parsedRows = parsed?.["rows"];
    if (!Array.isArray(parsedRows)) continue;

    for (const r of parsedRows) {
      if (need.size === 0) break;
      if (typeof r !== "object" || r === null) continue;
      const rec = r as Record<string, unknown>;
      const inv = typeof rec["invoiceNumber"] === "string" ? rec["invoiceNumber"].trim() : "";
      if (!inv || !need.has(inv)) continue;

      const adj = adjustments[inv];
      const merged = mergeOrderRowWithAdjustment(rec as Record<string, unknown>, adj);
      const status = adj?.status ?? (typeof merged["status"] === "string" ? (merged["status"] as string) : "");
      const deliveryMethod =
        typeof merged["deliveryMethod"] === "string" ? (merged["deliveryMethod"] as string).trim() : "";
      infoByInv.set(inv, { status, deliveryMethod, sourceDate });
      need.delete(inv);
    }
  }

  let updated = 0;
  let skippedExcludedSourceDate = 0;
  let skippedNotInOrders = 0;
  let skippedUnpaid = 0;

  const nextClaims = { ...(claims as Record<string, { claimedAt: string; claimDate?: string; claimDateExplicit?: boolean }>) };
  for (const inv of Object.keys(nextClaims)) {
    const info = infoByInv.get(inv);
    if (!info) {
      skippedNotInOrders++;
      continue;
    }
    if (!paidFromStatusText(info.status)) {
      skippedUnpaid++;
      continue;
    }
    if (excludeSourceDate && info.sourceDate === excludeSourceDate) {
      skippedExcludedSourceDate++;
      continue;
    }
    const dm = info.deliveryMethod;
    if (!isPickupDelivery(dm) && !isNonPickupDelivery(dm)) continue;

    nextClaims[inv] = { ...nextClaims[inv], claimDate: targetYmd, claimDateExplicit: true };
    updated++;
  }

  saveOrderClaims(nextClaims);
  return NextResponse.json({
    ok: true,
    targetYmd,
    excludeSourceDate,
    updated,
    skippedExcludedSourceDate,
    skippedNotInOrders,
    skippedUnpaid,
    totalClaimKeys: Object.keys(nextClaims).length,
  });
}

