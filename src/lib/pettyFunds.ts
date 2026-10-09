import {
  loadCashLedger,
  loadPettyCashLedger,
  loadPettyCashRequests,
  loadPettyCashState,
  loadPettyGCashLedger,
  loadPettyGCashRequests,
  loadPettyGCashState,
  loadPettyWalletLedger,
  loadPettyWalletRequests,
  loadPettyWalletState,
  saveCashLedger,
  savePettyCashLedger,
  savePettyCashRequests,
  savePettyCashState,
  savePettyGCashLedger,
  savePettyGCashRequests,
  savePettyGCashState,
  savePettyWalletLedger,
  savePettyWalletRequests,
  savePettyWalletState,
} from "@/data/admin/storage";
import type {
  PettyCashLedgerTransaction,
  PettyCashRequest,
  PettyCashState,
  PettyFundId,
} from "@/data/admin/types";
import {
  categoryForRequestType,
  computePettyBalanceFromLedger,
  isPettyFundId,
  PETTY_FUND_LABELS,
} from "@/lib/pettyFundConstants";

function bankAccountBalance(accountId: string): number {
  const file = loadCashLedger();
  let b = 0;
  for (const t of file.transactions) {
    if (t.accountId !== accountId) continue;
    b += (t.credit ?? 0) - (t.debit ?? 0);
  }
  return b;
}

export {
  categoryForRequestType,
  computePettyBalanceFromLedger,
  isPettyFundId,
  normalizeRequestType,
  PETTY_FUND_IDS,
  PETTY_FUND_LABELS,
} from "@/lib/pettyFundConstants";

export function loadFundState(id: PettyFundId): PettyCashState {
  if (id === "pettyGCash") return loadPettyGCashState();
  if (id === "pettyWallet") return loadPettyWalletState();
  return loadPettyCashState();
}

export function saveFundState(id: PettyFundId, state: PettyCashState) {
  if (id === "pettyGCash") return savePettyGCashState(state);
  if (id === "pettyWallet") return savePettyWalletState(state);
  return savePettyCashState(state);
}

export function loadFundLedger(id: PettyFundId): PettyCashLedgerTransaction[] {
  if (id === "pettyGCash") return loadPettyGCashLedger();
  if (id === "pettyWallet") return loadPettyWalletLedger();
  return loadPettyCashLedger();
}

export function saveFundLedger(id: PettyFundId, txns: PettyCashLedgerTransaction[]) {
  if (id === "pettyGCash") return savePettyGCashLedger(txns);
  if (id === "pettyWallet") return savePettyWalletLedger(txns);
  return savePettyCashLedger(txns);
}

export function loadFundRequests(id: PettyFundId): PettyCashRequest[] {
  if (id === "pettyGCash") return loadPettyGCashRequests();
  if (id === "pettyWallet") return loadPettyWalletRequests();
  return loadPettyCashRequests();
}

export function saveFundRequests(id: PettyFundId, requests: PettyCashRequest[]) {
  if (id === "pettyGCash") return savePettyGCashRequests(requests);
  if (id === "pettyWallet") return savePettyWalletRequests(requests);
  return savePettyCashRequests(requests);
}

function syncBalance(id: PettyFundId, ledger: PettyCashLedgerTransaction[], updatedAt: string) {
  saveFundLedger(id, ledger);
  saveFundState(id, { balance: computePettyBalanceFromLedger(ledger), updatedAt });
}

/**
 * Apply an approved request against `sourceFund` (the fund where the request was filed).
 * Cash In credits `targetFund` (defaults to source). Transfer debits source and credits target.
 */
export function applyApprovedPettyRequest(opts: {
  sourceFund: PettyFundId;
  request: PettyCashRequest;
  decidedBy: string;
  decidedAt: string;
  decidedDay: string;
  newTxnId: () => string;
}): { ok: true } | { ok: false; error: string; availableBalance?: number } {
  const { sourceFund, request, decidedBy, decidedAt, decidedDay, newTxnId } = opts;
  const reqType = request.requestType ?? "budget";
  const amount = request.amount;
  const desc = `${request.employeeName}: ${request.description}`;
  const category = request.category || categoryForRequestType(reqType);

  if (reqType === "budget") {
    const state = loadFundState(sourceFund);
    if (amount > state.balance) {
      return {
        ok: false,
        error: `Insufficient ${PETTY_FUND_LABELS[sourceFund]} balance to approve.`,
        availableBalance: state.balance,
      };
    }
    const ledger = loadFundLedger(sourceFund);
    ledger.push({
      id: newTxnId(),
      date: decidedDay,
      description: desc,
      category,
      debit: amount,
      credit: 0,
      kind: "budget_out",
      requestId: request.id,
      approvedBy: decidedBy,
      approvedAt: decidedAt,
      createdAt: decidedAt,
    });
    syncBalance(sourceFund, ledger, decidedAt);
    return { ok: true };
  }

  if (reqType === "cashIn") {
    const fromType = request.cashInFromType ?? "cash";

    // Debit the funding source first (if any), then credit this petty fund.
    if (fromType === "petty") {
      const fromFund = request.cashInFromFund;
      if (!isPettyFundId(fromFund)) {
        return { ok: false, error: "Missing cash-in source petty fund." };
      }
      if (fromFund === sourceFund) {
        return { ok: false, error: "Cash in source cannot be the same fund." };
      }
      const fromState = loadFundState(fromFund);
      if (amount > fromState.balance) {
        return {
          ok: false,
          error: `Insufficient ${PETTY_FUND_LABELS[fromFund]} balance to fund cash in.`,
          availableBalance: fromState.balance,
        };
      }
      const fromLedger = loadFundLedger(fromFund);
      fromLedger.push({
        id: newTxnId(),
        date: decidedDay,
        description: `${desc} → ${PETTY_FUND_LABELS[sourceFund]} (cash in)`,
        category,
        debit: amount,
        credit: 0,
        kind: "transfer_out",
        requestId: request.id,
        approvedBy: decidedBy,
        approvedAt: decidedAt,
        createdAt: decidedAt,
      });
      syncBalance(fromFund, fromLedger, decidedAt);
    } else if (fromType === "bank") {
      const accountId = typeof request.cashInFromAccountId === "string" ? request.cashInFromAccountId.trim() : "";
      if (!accountId) return { ok: false, error: "Missing cash-in bank account." };
      const file = loadCashLedger();
      const account = file.accounts.find((a) => a.id === accountId);
      if (!account) return { ok: false, error: "Bank account not found." };
      const bal = bankAccountBalance(accountId);
      if (amount > bal) {
        return {
          ok: false,
          error: `Insufficient bank balance (${account.name}) to fund cash in.`,
          availableBalance: bal,
        };
      }
      file.transactions.unshift({
        id: newTxnId(),
        accountId,
        date: decidedDay,
        ...(request.dateRequested ? { requestDate: request.dateRequested } : {}),
        description: `${desc} → ${PETTY_FUND_LABELS[sourceFund]} (petty cash in)`,
        debit: amount,
        credit: 0,
        kind: "petty_cash_in",
        pettyRequestId: request.id,
        createdAt: decidedAt,
      });
      saveCashLedger(file);
    }

    const fromLabel =
      fromType === "petty" && isPettyFundId(request.cashInFromFund)
        ? PETTY_FUND_LABELS[request.cashInFromFund]
        : fromType === "bank"
          ? "bank"
          : "cash";

    const ledger = loadFundLedger(sourceFund);
    ledger.push({
      id: newTxnId(),
      date: decidedDay,
      description: fromType === "cash" ? desc : `${desc} ← ${fromLabel}`,
      category,
      debit: 0,
      credit: amount,
      kind: fromType === "petty" ? "transfer_in" : "cash_in",
      requestId: request.id,
      approvedBy: decidedBy,
      approvedAt: decidedAt,
      createdAt: decidedAt,
    });
    syncBalance(sourceFund, ledger, decidedAt);
    return { ok: true };
  }

  // transfer
  const target = request.targetFund;
  if (!isPettyFundId(target)) {
    return { ok: false, error: "Missing transfer destination fund." };
  }
  if (target === sourceFund) {
    return { ok: false, error: "Cannot transfer to the same fund." };
  }
  const state = loadFundState(sourceFund);
  if (amount > state.balance) {
    return {
      ok: false,
      error: `Insufficient ${PETTY_FUND_LABELS[sourceFund]} balance to transfer.`,
      availableBalance: state.balance,
    };
  }

  const sourceLedger = loadFundLedger(sourceFund);
  sourceLedger.push({
    id: newTxnId(),
    date: decidedDay,
    description: `${desc} → ${PETTY_FUND_LABELS[target]}`,
    category,
    debit: amount,
    credit: 0,
    kind: "transfer_out",
    requestId: request.id,
    approvedBy: decidedBy,
    approvedAt: decidedAt,
    createdAt: decidedAt,
  });
  syncBalance(sourceFund, sourceLedger, decidedAt);

  const targetLedger = loadFundLedger(target);
  targetLedger.push({
    id: newTxnId(),
    date: decidedDay,
    description: `${desc} ← ${PETTY_FUND_LABELS[sourceFund]}`,
    category,
    debit: 0,
    credit: amount,
    kind: "transfer_in",
    requestId: request.id,
    approvedBy: decidedBy,
    approvedAt: decidedAt,
    createdAt: decidedAt,
  });
  syncBalance(target, targetLedger, decidedAt);

  return { ok: true };
}
