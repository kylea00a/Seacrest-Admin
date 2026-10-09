import type { PettyCashLedgerTransaction, PettyCashRequestType, PettyFundId } from "@/data/admin/types";

export const PETTY_FUND_IDS: PettyFundId[] = ["pettyCash", "pettyGCash", "pettyWallet"];

export const PETTY_FUND_LABELS: Record<PettyFundId, string> = {
  pettyCash: "Petty Cash",
  pettyGCash: "Petty GCash",
  pettyWallet: "Petty Wallet",
};

export function isPettyFundId(v: unknown): v is PettyFundId {
  return v === "pettyCash" || v === "pettyGCash" || v === "pettyWallet";
}

export function normalizeRequestType(v: unknown): PettyCashRequestType {
  if (v === "cashIn") return "cashIn";
  if (v === "transfer") return "transfer";
  return "budget";
}

export function categoryForRequestType(t: PettyCashRequestType): string {
  if (t === "cashIn") return "Cash In";
  if (t === "transfer") return "Transfer";
  return "Cash Out";
}

export function computePettyBalanceFromLedger(txns: PettyCashLedgerTransaction[]): number {
  let b = 0;
  for (const t of txns) b += (t.credit ?? 0) - (t.debit ?? 0);
  return b;
}
