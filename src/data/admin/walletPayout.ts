import type { WalletPayoutReceipt, WalletTransactionRow } from "./types";

const PAYOUT_MARK = /payout\s+bank\s*:/i;

export function isPayoutNotes(notes: string): boolean {
  return PAYOUT_MARK.test(notes.trim());
}

/** Parses "Payout Bank: Gcash. Card Name: Mariel Lanchita. Account Number: 09655000106" style notes. */
export function parsePayoutNotes(notes: string): {
  bank: string;
  accountName: string;
  accountNumber: string;
} | null {
  const n = notes.trim();
  if (!PAYOUT_MARK.test(n)) return null;
  const bankM = n.match(/payout\s+bank:\s*([^.]+?)(?:\.|$)/i);
  const cardM = n.match(/card\s+name:\s*([^.]+?)(?:\.|$)/i);
  const accM = n.match(/account\s+number:\s*([^\s.]+)/i);
  if (!bankM || !cardM || !accM) return null;
  return {
    bank: bankM[1].trim(),
    accountName: cardM[1].trim(),
    accountNumber: accM[1].trim(),
  };
}

export type PayoutListItem = {
  id: string;
  date: string;
  referenceNumber: string;
  distributorName: string;
  bank: string;
  accountName: string;
  accountNumber: string;
  amount: number;
  sortTimeMs: number;
};

export function buildPayoutList(rows: WalletTransactionRow[]): PayoutListItem[] {
  const list: PayoutListItem[] = [];
  for (const row of rows) {
    if (!isPayoutNotes(row.notes)) continue;
    const parsed = parsePayoutNotes(row.notes);
    if (!parsed) continue;
    list.push({
      id: row.id,
      date: row.transactionDate,
      referenceNumber: row.referenceNumber,
      distributorName: row.distributorName,
      bank: parsed.bank,
      accountName: parsed.accountName,
      accountNumber: parsed.accountNumber,
      amount: row.amount,
      sortTimeMs: row.sortTimeMs,
    });
  }
  list.sort((a, b) => a.sortTimeMs - b.sortTimeMs || a.referenceNumber.localeCompare(b.referenceNumber));
  return list;
}
