import { randomUUID } from "crypto";
import type { PettyCashLedgerTransaction, PettyCashRequest, PettyCashRequestStatus, PettyFundId } from "@/data/admin/types";
import {
  applyApprovedPettyRequest,
  categoryForRequestType,
  computePettyBalanceFromLedger,
  isPettyFundId,
  loadFundLedger,
  loadFundRequests,
  loadFundState,
  normalizeRequestType,
  PETTY_FUND_LABELS,
  saveFundLedger,
  saveFundRequests,
  saveFundState,
} from "@/lib/pettyFunds";
import { NextResponse } from "next/server";

function isDateOnly(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function parseAmount(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return n;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getPettyFundPayload(fundId: PettyFundId) {
  const state = loadFundState(fundId);
  const requests = loadFundRequests(fundId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ledger = loadFundLedger(fundId);
  const computed = computePettyBalanceFromLedger(ledger);
  const nextState = Number.isFinite(computed) ? { balance: computed, updatedAt: state.updatedAt } : state;
  return { state: nextState, requests, ledger };
}

export async function handlePettyFundRequest(fundId: PettyFundId, body: Record<string, unknown>) {
  const employeeName = typeof body.employeeName === "string" ? body.employeeName.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const amount = parseAmount(body.amount);
  const dateRequested = body.dateRequested;
  const requestType = normalizeRequestType(body.requestType);
  const category =
    typeof body.category === "string" && body.category.trim()
      ? body.category.trim()
      : categoryForRequestType(requestType);

  let targetFund: PettyFundId | undefined;
  let cashInFromType: PettyCashRequest["cashInFromType"];
  let cashInFromFund: PettyFundId | undefined;
  let cashInFromAccountId: string | undefined;

  if (requestType === "transfer") {
    if (!isPettyFundId(body.targetFund)) {
      return NextResponse.json({ error: "Missing `targetFund` (transfer to)." }, { status: 400 });
    }
    targetFund = body.targetFund;
    if (targetFund === fundId) {
      return NextResponse.json({ error: "Cannot transfer to the same fund." }, { status: 400 });
    }
  }

  if (requestType === "cashIn") {
    const from = typeof body.cashInFromType === "string" ? body.cashInFromType : "";
    if (from !== "cash" && from !== "petty" && from !== "bank") {
      return NextResponse.json({ error: "Missing `cashInFromType` (cash|petty|bank)." }, { status: 400 });
    }
    cashInFromType = from;
    if (from === "petty") {
      if (!isPettyFundId(body.cashInFromFund)) {
        return NextResponse.json({ error: "Missing `cashInFromFund`." }, { status: 400 });
      }
      if (body.cashInFromFund === fundId) {
        return NextResponse.json({ error: "Cash in source cannot be the same fund." }, { status: 400 });
      }
      cashInFromFund = body.cashInFromFund;
    }
    if (from === "bank") {
      const accountId = typeof body.cashInFromAccountId === "string" ? body.cashInFromAccountId.trim() : "";
      if (!accountId) return NextResponse.json({ error: "Missing `cashInFromAccountId`." }, { status: 400 });
      cashInFromAccountId = accountId;
    }
  }

  if (!employeeName) return NextResponse.json({ error: "Missing `employeeName`." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Missing `description`." }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Invalid `amount`." }, { status: 400 });
  if (!isDateOnly(dateRequested)) return NextResponse.json({ error: "Invalid `dateRequested` (YYYY-MM-DD)." }, { status: 400 });

  const state = loadFundState(fundId);
  if ((requestType === "budget" || requestType === "transfer") && amount > state.balance) {
    return NextResponse.json(
      {
        error: `Insufficient ${PETTY_FUND_LABELS[fundId]} balance for this request.`,
        availableBalance: state.balance,
      },
      { status: 400 },
    );
  }

  const next: PettyCashRequest = {
    id: randomUUID(),
    employeeName,
    category,
    description,
    amount,
    dateRequested,
    requestType,
    targetFund,
    cashInFromType,
    cashInFromFund,
    cashInFromAccountId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  const requests = loadFundRequests(fundId);
  requests.push(next);
  saveFundRequests(fundId, requests);

  return NextResponse.json({ request: next, state });
}

export async function handlePettyFundDecide(fundId: PettyFundId, body: Record<string, unknown>) {
  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const decidedBy = typeof body.decidedBy === "string" ? body.decidedBy.trim() : "Superadmin";
  const act = typeof body.action === "string" ? body.action : "";

  if (!requestId) return NextResponse.json({ error: "Missing `requestId`." }, { status: 400 });
  if (act !== "approve" && act !== "reject") return NextResponse.json({ error: "Invalid `action`." }, { status: 400 });

  const requests = loadFundRequests(fundId);
  const idx = requests.findIndex((r) => r.id === requestId);
  if (idx < 0) return NextResponse.json({ error: "Request not found." }, { status: 404 });

  const current = requests[idx];
  if (current.status !== "pending") {
    return NextResponse.json({ error: "Only pending requests can be decided." }, { status: 400 });
  }

  const status: PettyCashRequestStatus = act === "approve" ? "approved" : "rejected";
  const decidedAt = new Date().toISOString();
  const decidedDay = todayYmd();

  if (status === "approved") {
    const result = applyApprovedPettyRequest({
      sourceFund: fundId,
      request: current,
      decidedBy,
      decidedAt,
      decidedDay,
      newTxnId: () => randomUUID(),
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, availableBalance: result.availableBalance },
        { status: 400 },
      );
    }
  }

  const updated: PettyCashRequest = { ...current, status, decidedAt, decidedBy };
  requests[idx] = updated;
  saveFundRequests(fundId, requests);

  return NextResponse.json({
    request: updated,
    state: loadFundState(fundId),
    ledger: loadFundLedger(fundId),
  });
}

export async function handlePettyFundSetBalance(fundId: PettyFundId, body: Record<string, unknown>) {
  const balance = parseAmount(body.balance);
  if (!Number.isFinite(balance) || balance < 0) {
    return NextResponse.json({ error: "Invalid `balance`." }, { status: 400 });
  }
  const nextState = { balance, updatedAt: new Date().toISOString() };
  saveFundState(fundId, nextState);
  return NextResponse.json({ state: nextState });
}

export async function handlePettyFundDeleteLedger(fundId: PettyFundId, body: Record<string, unknown>) {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });
  const ledger = loadFundLedger(fundId);
  const next = ledger.filter((t) => t.id !== id);
  if (next.length === ledger.length) return NextResponse.json({ error: "Ledger entry not found." }, { status: 404 });
  saveFundLedger(fundId, next);
  const bal = computePettyBalanceFromLedger(next);
  saveFundState(fundId, { balance: bal, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, ledger: next, state: loadFundState(fundId) });
}

export async function handlePettyFundEditLedger(fundId: PettyFundId, body: Partial<PettyCashLedgerTransaction> & { id?: unknown }) {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });

  const ledger = loadFundLedger(fundId);
  const idx = ledger.findIndex((t) => t.id === id);
  if (idx < 0) return NextResponse.json({ error: "Ledger entry not found." }, { status: 404 });

  const cur = ledger[idx];
  const next: PettyCashLedgerTransaction = { ...cur };

  if (body.date != null) {
    if (!isDateOnly(body.date)) return NextResponse.json({ error: "Invalid `date` (YYYY-MM-DD)." }, { status: 400 });
    next.date = body.date;
  }
  if (body.description != null) {
    const d = typeof body.description === "string" ? body.description.trim() : "";
    if (!d) return NextResponse.json({ error: "Invalid `description`." }, { status: 400 });
    next.description = d;
  }
  if (body.category != null) {
    next.category = typeof body.category === "string" ? body.category.trim() || undefined : undefined;
  }
  if (body.debit != null) {
    const v = parseAmount(body.debit);
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "Invalid `debit` (>= 0)." }, { status: 400 });
    next.debit = v;
  }
  if (body.credit != null) {
    const v = parseAmount(body.credit);
    if (!Number.isFinite(v) || v < 0) return NextResponse.json({ error: "Invalid `credit` (>= 0)." }, { status: 400 });
    next.credit = v;
  }

  if ((next.debit ?? 0) <= 0 && (next.credit ?? 0) <= 0) {
    return NextResponse.json({ error: "Either debit or credit must be > 0." }, { status: 400 });
  }

  ledger[idx] = next;
  saveFundLedger(fundId, ledger);
  const bal = computePettyBalanceFromLedger(ledger);
  saveFundState(fundId, { balance: bal, updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true, ledger, state: loadFundState(fundId) });
}
