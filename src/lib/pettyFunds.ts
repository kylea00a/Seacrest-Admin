import {
  loadPettyCashLedger,
  loadPettyCashRequests,
  loadPettyCashState,
  loadPettyGCashLedger,
  loadPettyGCashRequests,
  loadPettyGCashState,
  loadPettyWalletLedger,
  loadPettyWalletRequests,
  loadPettyWalletState,
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
    const target = isPettyFundId(request.targetFund) ? request.targetFund : sourceFund;
    const ledger = loadFundLedger(target);
    ledger.push({
      id: newTxnId(),
      date: decidedDay,
      description: desc,
      category,
      debit: 0,
      credit: amount,
      kind: "cash_in",
      requestId: request.id,
      approvedBy: decidedBy,
      approvedAt: decidedAt,
      createdAt: decidedAt,
    });
    syncBalance(target, ledger, decidedAt);
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
