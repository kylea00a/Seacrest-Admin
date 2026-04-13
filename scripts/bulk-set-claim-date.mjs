/**
 * One-off data migration: set claimDate (and claimDateExplicit) for paid pick-up + delivery
 * claim rows. Does not change application logic — only `data/admin/orderClaims.json`.
 *
 * Usage: node scripts/bulk-set-claim-date.mjs [YYYY-MM-DD]
 * Default target day: 2026-04-10
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ORDERS_DIR = path.join(ROOT, "data", "admin", "orders");
const CLAIMS_FILE = path.join(ROOT, "data", "admin", "orderClaims.json");
const ADJ_FILE = path.join(ROOT, "data", "admin", "orderAdjustments.json");
const INDEX_FILE = path.join(ROOT, "data", "admin", "ordersIndex.json");

const DELIVERY_METHOD_PICKUP_UI = "For Pick Up";
const DELIVERY_METHOD_DELIVERY_UI = "For Delivery";

function paidFromStatusText(status) {
  const s = (status ?? "").toLowerCase();
  if (!s) return false;
  if (s.includes("cancel")) return false;
  if (s.includes("paid")) return true;
  if (s.includes("complete")) return true;
  return false;
}

function isPickupDelivery(deliveryMethod) {
  const s = (deliveryMethod ?? "").toLowerCase();
  if (!s.trim()) return false;
  return s.includes("pick");
}

function isNonPickupDelivery(deliveryMethod) {
  return !isPickupDelivery(deliveryMethod);
}

function applyLineDetailsToRow(rec, lineDetails) {
  if (!lineDetails) return { ...rec };
  const out = { ...rec };
  if (lineDetails.packageProducts) out.packageProducts = lineDetails.packageProducts;
  if (lineDetails.subscriptionProducts) out.subscriptionProducts = lineDetails.subscriptionProducts;
  if (lineDetails.repurchaseProducts) out.repurchaseProducts = lineDetails.repurchaseProducts;
  if (lineDetails.subscriptionsCount != null) out.subscriptionsCount = lineDetails.subscriptionsCount;
  if (lineDetails.deliveryCategory === "pickup") {
    out.deliveryMethod = DELIVERY_METHOD_PICKUP_UI;
    out.deliveryFee = 0;
    out.merchantFee = 0;
    out.deliveryCourier = "";
  }
  if (lineDetails.deliveryCategory === "delivery") {
    out.deliveryMethod = DELIVERY_METHOD_DELIVERY_UI;
    if (lineDetails.deliveryCourier !== undefined) {
      out.deliveryCourier = lineDetails.deliveryCourier;
    }
  }
  if (lineDetails.deliveryFee != null) out.deliveryFee = lineDetails.deliveryFee;
  if (lineDetails.merchantFee != null) out.merchantFee = lineDetails.merchantFee;
  if (lineDetails.totalAmount != null) out.totalAmount = lineDetails.totalAmount;
  if (lineDetails.shippingFullName != null) out.shippingFullName = lineDetails.shippingFullName;
  if (lineDetails.contactNumber != null) out.contactNumber = lineDetails.contactNumber;
  if (lineDetails.shippingFullAddress != null) out.shippingFullAddress = lineDetails.shippingFullAddress;
  if (lineDetails.province != null) out.province = lineDetails.province;
  if (lineDetails.city != null) out.city = lineDetails.city;
  if (lineDetails.region != null) out.region = lineDetails.region;
  if (lineDetails.zipCode != null) out.zipCode = lineDetails.zipCode;
  return out;
}

function mergeOrderRowWithAdjustment(rec, adj) {
  if (!adj?.lineDetails) return { ...rec };
  return applyLineDetailsToRow(rec, adj.lineDetails);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function readJsonOrEmptyObject(p) {
  if (!fs.existsSync(p)) return {};
  try {
    return readJson(p);
  } catch {
    return {};
  }
}

function main() {
  const targetYmd = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2]) ? process.argv[2] : "2026-04-10";

  const claims = readJson(CLAIMS_FILE);
  const adjustments = readJsonOrEmptyObject(ADJ_FILE);
  const index = readJson(INDEX_FILE);
  const dates = [...new Set(index.map((i) => i.date))];

  /** @type {Map<string, { status: string; deliveryMethod: string }>} */
  const byInvoice = new Map();

  for (const sourceDate of dates) {
    const file = path.join(ORDERS_DIR, `${sourceDate}.json`);
    if (!fs.existsSync(file)) continue;
    let day;
    try {
      day = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const parsed =
      day && typeof day === "object" && day.parsed && typeof day.parsed === "object" ? day.parsed : null;
    const parsedRows = parsed?.rows;
    if (!Array.isArray(parsedRows)) continue;

    for (const r of parsedRows) {
      if (!r || typeof r !== "object") continue;
      const rec = r;
      const inv = typeof rec.invoiceNumber === "string" ? rec.invoiceNumber.trim() : "";
      if (!inv) continue;
      const adj = adjustments[inv];
      const merged = mergeOrderRowWithAdjustment(rec, adj);
      const status = adj?.status ?? (typeof merged.status === "string" ? merged.status : "");
      const deliveryMethod = typeof merged.deliveryMethod === "string" ? merged.deliveryMethod.trim() : "";
      byInvoice.set(inv, { status, deliveryMethod });
    }
  }

  let updated = 0;
  let skippedNotInOrders = 0;
  let skippedUnpaid = 0;

  for (const inv of Object.keys(claims)) {
    const row = byInvoice.get(inv);
    if (!row) {
      skippedNotInOrders++;
      continue;
    }
    if (!paidFromStatusText(row.status)) {
      skippedUnpaid++;
      continue;
    }
    const dm = row.deliveryMethod;
    // Paid pick-up or paid delivery (non–pick-up): same classification as admin orderClaim helpers.
    if (!isPickupDelivery(dm) && !isNonPickupDelivery(dm)) continue;
    const prev = claims[inv];
    claims[inv] = {
      ...prev,
      claimDate: targetYmd,
      claimDateExplicit: true,
    };
    updated++;
  }

  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(claims, null, 2) + "\n", "utf8");
  console.log(
    JSON.stringify(
      {
        targetYmd,
        updated,
        skippedNotInOrders,
        skippedUnpaid,
        totalClaimKeys: Object.keys(claims).length,
      },
      null,
      2,
    ),
  );
}

main();
