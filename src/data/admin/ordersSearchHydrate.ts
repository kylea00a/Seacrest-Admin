import { mergeOrderRowWithAdjustment } from "@/data/admin/orderAdjustmentMerge";
import { readOrdersDayAsync } from "@/data/admin/orders";
import { resolvePackageNameFromPrice } from "@/data/admin/packageResolve";
import { loadAdminSettings, loadOrderAdjustments } from "@/data/admin/storage";
import type { OrdersSearchIndexEntry } from "@/data/admin/types";
import { stringifySearchField } from "@/lib/orderSearchMatch";

function parsePrice(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function priceFromPackageCode(packageName: string): number {
  const m = packageName.match(/-P(\d+(?:\.\d+)?)/i) ?? packageName.match(/\bP(\d+(?:\.\d+)?)\b/i);
  if (!m) return 0;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 0;
}

function paidFromStatus(status: string): boolean {
  const s = (status ?? "").toLowerCase();
  if (!s) return false;
  if (s.includes("cancel")) return false;
  if (s.includes("paid")) return true;
  if (s.includes("complete")) return true;
  return false;
}

/** Load full compiled rows for index matches (reads only needed import-day files). */
export async function hydrateOrdersFromIndexMatches(
  matches: OrdersSearchIndexEntry[],
): Promise<Array<Record<string, unknown>>> {
  if (matches.length === 0) return [];

  const adjustments = loadOrderAdjustments();
  const packages = loadAdminSettings().packages;

  const wantBySource = new Map<string, Set<string>>();
  for (const m of matches) {
    const set = wantBySource.get(m.sourceDate) ?? new Set<string>();
    set.add(m.invoice);
    wantBySource.set(m.sourceDate, set);
  }

  const rows: Array<Record<string, unknown>> = [];

  await Promise.all(
    [...wantBySource.entries()].map(async ([sourceDate, wantInvoices]) => {
      const dayUnknown = await readOrdersDayAsync(sourceDate);
      const day =
        typeof dayUnknown === "object" && dayUnknown !== null
          ? (dayUnknown as Record<string, unknown>)
          : null;
      const parsed =
        day && typeof day["parsed"] === "object" && day["parsed"] !== null
          ? (day["parsed"] as Record<string, unknown>)
          : null;
      const parsedRows = parsed?.["rows"];
      if (!Array.isArray(parsedRows)) return;

      for (const r of parsedRows) {
        if (typeof r !== "object" || r === null) continue;
        const rec = r as Record<string, unknown>;
        const invoice = stringifySearchField(rec["invoiceNumber"]);
        if (!invoice || !wantInvoices.has(invoice)) continue;

        const adj = adjustments[invoice];
        const mergedRec = mergeOrderRowWithAdjustment(rec, adj);
        const effectiveDate = adj?.effectiveDate ?? sourceDate;
        const status = adj?.status ?? (typeof mergedRec["status"] === "string" ? (mergedRec["status"] as string) : "");
        const packageNameRaw =
          typeof mergedRec["packageName"] === "string" ? (mergedRec["packageName"] as string).trim() : "";
        const pkgPriceFromRow = parsePrice(mergedRec["packagePrice"]);
        const pkgPriceFromCode = priceFromPackageCode(packageNameRaw);
        const packagePrice = pkgPriceFromRow || pkgPriceFromCode;
        const resolvedPackageName = resolvePackageNameFromPrice(packagePrice, packages);
        const packageName = resolvedPackageName || packageNameRaw;

        rows.push({
          ...mergedRec,
          packagePrice,
          packageName,
          date: effectiveDate,
          sourceDate,
          status,
          isPaid: paidFromStatus(status),
          adjusted: !!adj,
        });
      }
    }),
  );

  rows.sort((a, b) => {
    const da = String(a["date"] ?? "");
    const db = String(b["date"] ?? "");
    if (da !== db) return db.localeCompare(da);
    const ra = Number(a["rowIndex"] ?? 0);
    const rb = Number(b["rowIndex"] ?? 0);
    if (ra !== rb) return ra - rb;
    return String(a["invoiceNumber"] ?? "").localeCompare(String(b["invoiceNumber"] ?? ""));
  });

  return rows;
}
