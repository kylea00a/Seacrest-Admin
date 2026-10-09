import { NextResponse } from "next/server";
import {
  loadCashLedger,
  loadExpenses,
  loadPettyCashLedger,
  loadPettyGCashLedger,
  loadPettyWalletLedger,
  saveCashLedger,
  saveExpenses,
  savePettyCashLedger,
  savePettyCashState,
  savePettyGCashLedger,
  savePettyGCashState,
  savePettyWalletLedger,
  savePettyWalletState,
} from "@/data/admin/storage";
import type { PaymentStatus, PettyCashLedgerTransaction } from "@/data/admin/types";
import { isRecurringExpenseFrequency } from "@/data/admin/recurrence";
import { requireApiPermission } from "@/lib/adminApiAuth";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isPaymentStatus(v: unknown): v is PaymentStatus {
  return v === "paid" || v === "unpaid";
}

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "expenses");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as {
    expenseId?: unknown;
    paymentStatus?: unknown;
    deductFrom?: unknown;
    action?: unknown;
    date?: unknown;
  };
  const expenseId = typeof body.expenseId === "string" ? body.expenseId.trim() : "";
  if (!expenseId) return NextResponse.json({ error: "Missing `expenseId`." }, { status: 400 });
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (action !== "reject" && !isPaymentStatus(body.paymentStatus)) {
    return NextResponse.json({ error: "Missing/invalid `paymentStatus`." }, { status: 400 });
  }
  const desiredStatus: PaymentStatus | null = action === "reject" ? null : (body.paymentStatus as PaymentStatus);
  const occurrenceDate = isDateOnly(body.date) ? body.date : "";

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

  const recurring = isRecurringExpenseFrequency(prev.frequency);
  if (recurring && !occurrenceDate) {
    return NextResponse.json(
      { error: "Missing `date` (YYYY-MM-DD) for the occurrence you are marking paid/unpaid." },
      { status: 400 },
    );
  }

  if (!recurring && prev.paymentStatus === "paid" && desiredStatus === "unpaid") {
    return NextResponse.json(
      { error: "Paid expenses cannot be toggled back to unpaid from the calendar. Edit it in the Expenses page instead." },
      { status: 400 },
    );
  }

  let next = { ...prev };
  if (recurring) {
    const paidSet = new Set(Array.isArray(prev.paidDates) ? prev.paidDates : []);
    if (desiredStatus === "paid") paidSet.add(occurrenceDate);
    else paidSet.delete(occurrenceDate);
    const paidDates = Array.from(paidSet).sort();
    next = {
      ...prev,
      paidDates,
      // Keep template status unpaid for recurring so the series stays active on the calendar.
      paymentStatus: "unpaid",
    };
  } else {
    next = { ...prev, paymentStatus: desiredStatus as PaymentStatus };
  }

  expenses[idx] = next;
  saveExpenses(expenses);

  // When marking paid, write a corresponding SOA entry (bank ledger or petty cash) on the occurrence date.
  const now = new Date();
  const ledgerDate =
    occurrenceDate ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const deduct = body.deductFrom && typeof body.deductFrom === "object" ? (body.deductFrom as Record<string, unknown>) : null;
  const deductType = typeof deduct?.type === "string" ? (deduct.type as string) : "";
  const deductAccountId = typeof deduct?.accountId === "string" ? (deduct.accountId as string).trim() : "";

  if (desiredStatus === "paid") {
    if (
      deductType !== "pettyCash" &&
      deductType !== "pettyGCash" &&
      deductType !== "pettyWallet" &&
      deductType !== "bank"
    ) {
      return NextResponse.json(
        { error: "Missing `deductFrom` (pettyCash|pettyGCash|pettyWallet|bank) when marking paid." },
        { status: 400 },
      );
    }
    if (deductType === "bank" && !deductAccountId) {
      return NextResponse.json({ error: "Missing `deductFrom.accountId`." }, { status: 400 });
    }
    const amt = Number(prev.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json({ error: "Expense amount must be > 0 to record payment." }, { status: 400 });
    }

    const desc = recurring ? `bill-${prev.title} (${ledgerDate})` : `bill-${prev.title}`;

    if (deductType === "bank") {
      const file = loadCashLedger();
      if (!file.accounts.some((a) => a.id === deductAccountId)) {
        return NextResponse.json({ error: "Bank account not found." }, { status: 404 });
      }
      // Idempotent per expense + occurrence date (recurring) or expense id (one-time).
      file.transactions = file.transactions.filter((t) => {
        if (t.kind !== "bill_payment" || t.expenseId !== expenseId) return true;
        if (recurring) return t.date !== ledgerDate;
        return false;
      });
      const requestDate =
        (typeof prev.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(prev.startDate) ? prev.startDate : undefined) ||
        ledgerDate;
      file.transactions.unshift({
        id: randomUUID(),
        accountId: deductAccountId,
        date: ledgerDate,
        requestDate,
        description: desc,
        debit: amt,
        credit: 0,
        kind: "bill_payment",
        expenseId,
        createdAt: now.toISOString(),
      });
      saveCashLedger(file);
    } else if (deductType === "pettyGCash") {
      const ledger = loadPettyGCashLedger();
      const nextLedger = ledger.filter((t) => {
        if (t.kind !== "bill_payment" || t.expenseId !== expenseId) return true;
        if (recurring) return t.date !== ledgerDate;
        return false;
      });
      const tx: PettyCashLedgerTransaction = {
        id: randomUUID(),
        date: ledgerDate,
        description: desc,
        debit: amt,
        credit: 0,
        kind: "bill_payment",
        expenseId,
        createdAt: now.toISOString(),
        approvedAt: now.toISOString(),
        approvedBy: auth.displayName ?? "Superadmin",
      };
      nextLedger.push(tx);
      savePettyGCashLedger(nextLedger);
      const bal = nextLedger.reduce((acc, t) => acc + (t.credit ?? 0) - (t.debit ?? 0), 0);
      savePettyGCashState({ balance: bal, updatedAt: now.toISOString() });
    } else if (deductType === "pettyWallet") {
      const ledger = loadPettyWalletLedger();
      const nextLedger = ledger.filter((t) => {
        if (t.kind !== "bill_payment" || t.expenseId !== expenseId) return true;
        if (recurring) return t.date !== ledgerDate;
        return false;
      });
      const tx: PettyCashLedgerTransaction = {
        id: randomUUID(),
        date: ledgerDate,
        description: desc,
        debit: amt,
        credit: 0,
        kind: "bill_payment",
        expenseId,
        createdAt: now.toISOString(),
        approvedAt: now.toISOString(),
        approvedBy: auth.displayName ?? "Superadmin",
      };
      nextLedger.push(tx);
      savePettyWalletLedger(nextLedger);
      const bal = nextLedger.reduce((acc, t) => acc + (t.credit ?? 0) - (t.debit ?? 0), 0);
      savePettyWalletState({ balance: bal, updatedAt: now.toISOString() });
    } else {
      const ledger = loadPettyCashLedger();
      const nextLedger = ledger.filter((t) => {
        if (t.kind !== "bill_payment" || t.expenseId !== expenseId) return true;
        if (recurring) return t.date !== ledgerDate;
        return false;
      });
      const tx: PettyCashLedgerTransaction = {
        id: randomUUID(),
        date: ledgerDate,
        description: desc,
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

  return NextResponse.json({ ok: true, expense: next });
}
