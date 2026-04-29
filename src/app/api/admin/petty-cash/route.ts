import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  loadPettyCashRequests,
  loadPettyCashLedger,
  loadPettyCashState,
  savePettyCashLedger,
  savePettyCashRequests,
  savePettyCashState,
} from "@/data/admin/storage";
import type { PettyCashLedgerTransaction, PettyCashRequest, PettyCashRequestStatus, PettyCashRequestType } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateRequestBody = {
  employeeName?: unknown;
  category?: unknown;
  description?: unknown;
  amount?: unknown;
  dateRequested?: unknown; // YYYY-MM-DD
  requestType?: unknown; // budget | cashIn
};

type DecideBody = {
  requestId?: unknown;
  action?: unknown; // approve | reject
  decidedBy?: unknown;
};

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

function normalizeRequestType(v: unknown): PettyCashRequestType {
  return v === "cashIn" ? "cashIn" : "budget";
}

function computePettyBalanceFromLedger(txns: PettyCashLedgerTransaction[]): number {
  let b = 0;
  for (const t of txns) b += (t.credit ?? 0) - (t.debit ?? 0);
  return b;
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "pettyCash");
  if (auth instanceof NextResponse) return auth;
  const state = loadPettyCashState();
  const requests = loadPettyCashRequests().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ledger = loadPettyCashLedger();
  // Keep legacy state in sync with ledger when possible.
  const computed = computePettyBalanceFromLedger(ledger);
  const nextState = Number.isFinite(computed) ? { balance: computed, updatedAt: state.updatedAt } : state;
  return NextResponse.json({ state: nextState, requests, ledger });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "pettyCash");
  if (auth instanceof NextResponse) return auth;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "request") {
    const body = (await req.json()) as CreateRequestBody;
    const employeeName = typeof body.employeeName === "string" ? body.employeeName.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amount = parseAmount(body.amount);
    const dateRequested = body.dateRequested;
    const requestType = normalizeRequestType(body.requestType);

    if (!employeeName) return NextResponse.json({ error: "Missing `employeeName`." }, { status: 400 });
    if (!category) return NextResponse.json({ error: "Missing `category`." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Missing `description`." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Invalid `amount`." }, { status: 400 });
    if (!isDateOnly(dateRequested)) return NextResponse.json({ error: "Invalid `dateRequested` (YYYY-MM-DD)." }, { status: 400 });

    const state = loadPettyCashState();
    if (requestType === "budget" && amount > state.balance) {
      return NextResponse.json(
        { error: "Insufficient petty cash balance for this request.", availableBalance: state.balance },
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
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const requests = loadPettyCashRequests();
    requests.push(next);
    savePettyCashRequests(requests);

    return NextResponse.json({ request: next, state });
  }

  if (action === "decide") {
    const body = (await req.json()) as DecideBody;
    const requestId = typeof body.requestId === "string" ? body.requestId : "";
    const decidedBy = typeof body.decidedBy === "string" ? body.decidedBy.trim() : "Superadmin";
    const act = typeof body.action === "string" ? body.action : "";

    if (!requestId) return NextResponse.json({ error: "Missing `requestId`." }, { status: 400 });
    if (act !== "approve" && act !== "reject") return NextResponse.json({ error: "Invalid `action`." }, { status: 400 });

    const requests = loadPettyCashRequests();
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
      const state = loadPettyCashState();
      const reqType = current.requestType ?? "budget";
      if (reqType === "budget" && current.amount > state.balance) {
        return NextResponse.json(
          { error: "Insufficient petty cash balance to approve.", availableBalance: state.balance },
          { status: 400 },
        );
      }
      const ledger = loadPettyCashLedger();
      const tx: PettyCashLedgerTransaction = {
        id: randomUUID(),
        date: decidedDay,
        description: `${current.employeeName}: ${current.description}`,
        category: current.category,
        debit: reqType === "budget" ? current.amount : 0,
        credit: reqType === "cashIn" ? current.amount : 0,
        kind: reqType === "cashIn" ? "cash_in" : "budget_out",
        requestId: current.id,
        approvedBy: decidedBy,
        approvedAt: decidedAt,
        createdAt: decidedAt,
      };
      ledger.push(tx);
      savePettyCashLedger(ledger);

      const newBalance = computePettyBalanceFromLedger(ledger);
      const nextState = { balance: newBalance, updatedAt: decidedAt };
      savePettyCashState(nextState);
    }

    const updated: PettyCashRequest = { ...current, status, decidedAt, decidedBy };
    requests[idx] = updated;
    savePettyCashRequests(requests);

    const state = loadPettyCashState();
    const ledger = loadPettyCashLedger();
    return NextResponse.json({ request: updated, state, ledger });
  }

  if (action === "set-balance") {
    const body = (await req.json()) as { balance?: unknown };
    const balance = parseAmount(body.balance);
    if (!Number.isFinite(balance) || balance < 0) {
      return NextResponse.json({ error: "Invalid `balance`." }, { status: 400 });
    }
    const nextState = { balance, updatedAt: new Date().toISOString() };
    savePettyCashState(nextState);
    return NextResponse.json({ state: nextState });
  }

  if (action === "delete-ledger") {
    const auth2 = await requireApiPermission(req, "pettyCashEdit");
    if (auth2 instanceof NextResponse) return auth2;
    const body = (await req.json()) as { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });
    const ledger = loadPettyCashLedger();
    const next = ledger.filter((t) => t.id !== id);
    if (next.length === ledger.length) return NextResponse.json({ error: "Ledger entry not found." }, { status: 404 });
    savePettyCashLedger(next);
    const bal = computePettyBalanceFromLedger(next);
    savePettyCashState({ balance: bal, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, ledger: next, state: loadPettyCashState() });
  }

  if (action === "edit-ledger") {
    const auth2 = await requireApiPermission(req, "pettyCashEdit");
    if (auth2 instanceof NextResponse) return auth2;
    const body = (await req.json()) as Partial<PettyCashLedgerTransaction> & { id?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });

    const ledger = loadPettyCashLedger();
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
    savePettyCashLedger(ledger);
    const bal = computePettyBalanceFromLedger(ledger);
    savePettyCashState({ balance: bal, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, ledger, state: loadPettyCashState() });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

