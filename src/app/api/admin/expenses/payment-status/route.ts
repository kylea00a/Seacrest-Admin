import { NextResponse } from "next/server";
import {
  loadCashLedger,
  loadExpenses,
  loadPettyCashLedger,
  loadPettyCashState,
  saveCashLedger,
  saveExpenses,
  savePettyCashLedger,
  savePettyCashState,
} from "@/data/admin/storage";
import type { PaymentStatus, PettyCashLedgerTransaction } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isPaymentStatus(v: unknown): v is PaymentStatus {
  return v === "paid" || v === "unpaid";
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "expenses");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    expenseId?: unknown;
    paymentStatus?: unknown;
    deductFrom?: unknown;
    action?: unknown;
  };
  const expenseId = typeof body.expenseId === "string" ? body.expenseId.trim() : "";
  if (!expenseId) return NextResponse.json({ error: "Missing `expenseId`." }, { status: 400 });
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action !== "reject" && !isPaymentStatus(body.paymentStatus)) {
    return NextResponse.json({ error: "Missing/invalid `paymentStatus`." }, { status: 400 });
  }
  const desiredStatus: PaymentStatus | null = action === "reject" ? null : (body.paymentStatus as PaymentStatus);

  const expenses = loadExpenses();
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  const prev = expenses[idx];
  if (action === "reject") {
    if (!prev.isRequest) return NextResponse.json({ error: "Only requested expenses can be rejected." }, { status: 400 });
    const next = { ...prev, requestStatus: "rejected" as const };
    expenses[idx] = next;
    saveExpenses(expenses);
    return NextResponse.json({ ok: true, expense: next });
  }

  if (prev.paymentStatus === "paid" && desiredStatus === "unpaid") {
    return NextResponse.json(
      { error: "Paid expenses cannot be toggled back to unpaid from the calendar. Edit it in the Expenses page instead." },
      { status: 400 },
    );
  }

  const next = { ...expenses[idx], paymentStatus: desiredStatus as PaymentStatus };
  expenses[idx] = next;
  saveExpenses(expenses);

  // When marking paid, write a corresponding SOA entry (bank ledger or petty cash) on approval date.
  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const deduct = body.deductFrom && typeof body.deductFrom === "object" ? (body.deductFrom as Record<string, unknown>) : null;
  const deductType = typeof deduct?.type === "string" ? (deduct.type as string) : "";
  const deductAccountId = typeof deduct?.accountId === "string" ? (deduct.accountId as string).trim() : "";

  if (desiredStatus === "paid") {
    if (deductType !== "pettyCash" && deductType !== "bank") {
      return NextResponse.json({ error: "Missing `deductFrom` (pettyCash|bank) when marking paid." }, { status: 400 });
    }
    if (deductType === "bank" && !deductAccountId) {
      return NextResponse.json({ error: "Missing `deductFrom.accountId`." }, { status: 400 });
    }
    const amt = Number(prev.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: "Expense amount must be > 0 to record payment." }, { status: 400 });
    }

    if (deductType === "bank") {
      const file = loadCashLedger();
      if (!file.accounts.some((a) => a.id === deductAccountId)) {
        return NextResponse.json({ error: "Bank account not found." }, { status: 404 });
      }
      // Idempotent: remove existing bill payment entry for this expenseId first.
      file.transactions = file.transactions.filter((t) => !(t.kind === "bill_payment" && t.expenseId === expenseId));
      file.transactions.unshift({
        id: randomUUID(),
        accountId: deductAccountId,
        date: ymd,
        description: `bill-${prev.title}`,
        debit: amt,
        credit: 0,
        kind: "bill_payment",
        expenseId,
        createdAt: now.toISOString(),
      });
      saveCashLedger(file);
    } else {
      const ledger = loadPettyCashLedger();
      // Idempotent: remove existing bill payment entry for this expenseId.
      const nextLedger = ledger.filter((t) => !(t.kind === "bill_payment" && t.expenseId === expenseId));
      const tx: PettyCashLedgerTransaction = {
        id: randomUUID(),
        date: ymd,
        description: `bill-${prev.title}`,
        debit: amt,
        credit: 0,
        kind: "bill_payment",
        expenseId,
        createdAt: now.toISOString(),
        approvedAt: now.toISOString(),
        approvedBy: auth.displayName ?? "Superadmin",
      };
      nextLedger.push(tx);
      savePettyCashLedger(nextLedger);
      const bal = nextLedger.reduce((acc, t) => acc + (t.credit ?? 0) - (t.debit ?? 0), 0);
      savePettyCashState({ balance: bal, updatedAt: now.toISOString() });
    }
  }

  // Note: toggling paid -> unpaid is blocked (see above).

  return NextResponse.json({ ok: true, expense: next });
}

