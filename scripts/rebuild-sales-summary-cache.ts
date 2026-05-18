/**
 * Build data/admin/salesSummaryCache.json offline (deploy / after imports).
 * Run: npm run sales-summary-cache:rebuild
 */
import { rebuildSalesSummaryCacheAll } from "../src/data/admin/salesSummaryCache";

async function main() {
  const started = Date.now();
  console.log("[sales-summary-cache] Rebuilding…");
  const file = await rebuildSalesSummaryCacheAll();
  const salesDays = Object.keys(file.salesByDay).length;
  const claimDays = Object.keys(file.inventoryByClaimDay).length;
  console.log(
    `[sales-summary-cache] Done: ${salesDays} sales days, ${claimDays} claim days in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main().catch((err) => {
  console.error("[sales-summary-cache] Failed:", err);
  process.exit(1);
});
