/** True when order was paid via wallet (not payment gateway / Xendit). */
export function isWalletPaymentMethod(paymentMethod: string): boolean {
  const s = (paymentMethod ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s.includes("gateway")) return false;
  return s.includes("wallet");
}
