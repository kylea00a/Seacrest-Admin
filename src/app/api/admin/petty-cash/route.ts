import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  loadPettyCashRequests,
  loadPettyCashState,
  savePettyCashRequests,
  savePettyCashState,
} from "@/data/admin/storage";
import type { PettyCashRequest, PettyCashRequestStatus } from "@/data/admin/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CreateRequestBody = {
  employeeName?: unknown;
  category?: unknown;
  description?: unknown;
  amount?: unknown;
  dateRequested?: unknown; // YYYY-MM-DD
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

export async function GET() {
  const state = loadPettyCashState();
  const requests = loadPettyCashRequests().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return NextResponse.json({ state, requests });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "request") {
    const body = (await req.json()) as CreateRequestBody;
    const employeeName = typeof body.employeeName === "string" ? body.employeeName.trim() : "";
    const category = typeof body.category === "string" ? body.category.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const amount = parseAmount(body.amount);
    const dateRequested = body.dateRequested;

    if (!employeeName) return NextResponse.json({ error: "Missing `employeeName`." }, { status: 400 });
    if (!category) return NextResponse.json({ error: "Missing `category`." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Missing `description`." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Invalid `amount`." }, { status: 400 });
    if (!isDateOnly(dateRequested)) return NextResponse.json({ error: "Invalid `dateRequested` (YYYY-MM-DD)." }, { status: 400 });

    const state = loadPettyCashState();
    if (amount > state.balance) {
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

    if (status === "approved") {
      const state = loadPettyCashState();
      if (current.amount > state.balance) {
        return NextResponse.json(
          { error: "Insufficient petty cash balance to approve.", availableBalance: state.balance },
          { status: 400 },
        );
      }
      const nextState = { balance: state.balance - current.amount, updatedAt: decidedAt };
      savePettyCashState(nextState);
    }

    const updated: PettyCashRequest = { ...current, status, decidedAt, decidedBy };
    requests[idx] = updated;
    savePettyCashRequests(requests);

    const state = loadPettyCashState();
    return NextResponse.json({ request: updated, state });
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

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

