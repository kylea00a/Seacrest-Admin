import { NextResponse } from "next/server";
import { loadExpenses, saveExpenses } from "@/data/admin/storage";
import type { PaymentStatus } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isPaymentStatus(v: unknown): v is PaymentStatus {
  return v === "paid" || v === "unpaid";
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "expenses");
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json()) as { expenseId?: unknown; paymentStatus?: unknown };
  const expenseId = typeof body.expenseId === "string" ? body.expenseId.trim() : "";
  if (!expenseId) return NextResponse.json({ error: "Missing `expenseId`." }, { status: 400 });
  if (!isPaymentStatus(body.paymentStatus)) {
    return NextResponse.json({ error: "Missing/invalid `paymentStatus`." }, { status: 400 });
  }

  const expenses = loadExpenses();
  const idx = expenses.findIndex((e) => e.id === expenseId);
  if (idx < 0) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  const next = { ...expenses[idx], paymentStatus: body.paymentStatus };
  expenses[idx] = next;
  saveExpenses(expenses);

  return NextResponse.json({ ok: true, expense: next });
}

