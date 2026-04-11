import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadDepartments, loadExpenses, saveExpenses } from "@/data/admin/storage";
import type { Expense, ExpenseFrequency, PaymentStatus } from "@/data/admin/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExpenseCreateBody = {
  title?: unknown;
  amount?: unknown;
  category?: unknown;
  frequency?: unknown;
  startDate?: unknown;
  departmentId?: unknown;
  notes?: unknown;
  paymentStatus?: unknown;
};

function isFrequency(v: unknown): v is ExpenseFrequency {
  return v === "daily" || v === "weekly" || v === "monthly" || v === "quarterly" || v === "yearly";
}

function isDateOnly(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isPaymentStatus(v: unknown): v is PaymentStatus {
  return v === "paid" || v === "unpaid";
}

export async function GET() {
  const expenses = loadExpenses();
  return NextResponse.json({ expenses });
}

export async function POST(req: Request) {
  const body = (await req.json()) as ExpenseCreateBody;

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "Missing or invalid `title`." }, { status: 400 });
  }

  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!category) {
    return NextResponse.json({ error: "Missing or invalid `category`." }, { status: 400 });
  }

  const frequency = body.frequency;
  if (!isFrequency(frequency)) {
    return NextResponse.json({ error: "Missing or invalid `frequency`." }, { status: 400 });
  }

  const startDate = body.startDate;
  if (!isDateOnly(startDate)) {
    return NextResponse.json({ error: "Missing or invalid `startDate` (YYYY-MM-DD)." }, { status: 400 });
  }

  const amountRaw = body.amount;
  const amount = typeof amountRaw === "number" ? amountRaw : typeof amountRaw === "string" ? Number(amountRaw) : NaN;
  if (!Number.isFinite(amount)) {
    return NextResponse.json({ error: "Missing or invalid `amount`." }, { status: 400 });
  }

  const departmentId =
    typeof body.departmentId === "string" && body.departmentId.trim() !== "" ? body.departmentId.trim() : undefined;

  if (departmentId) {
    const departments = loadDepartments();
    if (!departments.some((d) => d.id === departmentId)) {
      return NextResponse.json({ error: "Invalid `departmentId`." }, { status: 400 });
    }
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() : undefined;

  const paymentStatus: PaymentStatus =
    body.paymentStatus == null ? "unpaid" : isPaymentStatus(body.paymentStatus) ? body.paymentStatus : "unpaid";

  const expense: Expense = {
    id: randomUUID(),
    title,
    amount,
    category,
    frequency,
    startDate,
    departmentId,
    notes,
    paymentStatus,
    createdAt: new Date().toISOString(),
  };

  const expenses = loadExpenses();
  expenses.push(expense);
  saveExpenses(expenses);

  return NextResponse.json({ expense });
}

