import {
  loadCashLedger,
  loadExpenses,
  loadPettyCashRequests,
  loadPettyGCashRequests,
  loadPettyWalletRequests,
  saveCashLedger,
} from "@/data/admin/storage";
import type { CashTransaction, Expense, PettyCashRequest } from "@/data/admin/types";

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Parse (M/D/YY) or (M/D/YYYY) often embedded in titles/descriptions. */
export function parseParenDateFromText(text: string): string | undefined {
  const m = text.match(/\((\d{1,2})\/(\d{1,2})\/(\d{2,4})\)/);
  if (!m) return undefined;
  const month = Number(m[1]);
  const day = Number(m[2]);
  let year = Number(m[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return undefined;
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isoToYmd(iso: string | undefined): string | undefined {
  if (!iso || typeof iso !== "string") return undefined;
  const d = iso.slice(0, 10);
  return isDateOnly(d) ? d : undefined;
}

function inferRequestDate(
  t: CashTransaction,
  expenseById: Map<string, Expense>,
  pettyById: Map<string, PettyCashRequest>,
): string | undefined {
  if (isDateOnly(t.requestDate)) return t.requestDate;

  if (
    (t.kind === "sales_deposit" || t.kind === "jj_sales_deposit" || t.kind === "seacrest_sales_deposit") &&
    isDateOnly(t.salesDate)
  ) {
    return t.salesDate;
  }

  if (t.kind === "petty_cash_in" && t.pettyRequestId) {
    const req = pettyById.get(t.pettyRequestId);
    if (req && isDateOnly(req.dateRequested)) return req.dateRequested;
  }

  if (t.kind === "bill_payment" && t.expenseId) {
    const exp = expenseById.get(t.expenseId);
    if (exp) {
      if (isDateOnly(exp.startDate)) return exp.startDate;
      const fromTitle = parseParenDateFromText(exp.title ?? "");
      if (fromTitle) return fromTitle;
      const created = isoToYmd(exp.createdAt);
      if (created) return created;
    }
  }

  const fromDesc = parseParenDateFromText(t.description ?? "");
  if (fromDesc) return fromDesc;

  if (isDateOnly(t.date)) return t.date;
  return isoToYmd(t.createdAt);
}

/**
 * Fill missing `requestDate` on cash ledger rows from salesDate / expenses / petty requests / description / date.
 * Persists when any row changes. Returns count updated.
 */
export function backfillCashLedgerRequestDates(): { updated: number; total: number } {
  const file = loadCashLedger();
  const expenses = loadExpenses();
  const expenseById = new Map(expenses.map((e) => [e.id, e]));
  const pettyReqs = [...loadPettyCashRequests(), ...loadPettyGCashRequests(), ...loadPettyWalletRequests()];
  const pettyById = new Map(pettyReqs.map((r) => [r.id, r]));

  let updated = 0;
  const nextTxns = file.transactions.map((t) => {
    if (isDateOnly(t.requestDate)) return t;
    const inferred = inferRequestDate(t, expenseById, pettyById);
    if (!inferred || inferred === t.requestDate) return t;
    updated += 1;
    return { ...t, requestDate: inferred };
  });

  if (updated > 0) {
    saveCashLedger({ ...file, transactions: nextTxns });
  }
  return { updated, total: file.transactions.length };
}
