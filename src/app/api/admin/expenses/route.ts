import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadDepartments, loadExpenses, saveExpenses } from "@/data/admin/storage";
import type { Expense, ExpenseFrequency, PaymentStatus } from "@/data/admin/types";
import { requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExpenseCreateBody = {
  title?: unknown;
  amount?: unknown;
  category?: unknown;
  frequency?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  repeatEveryMonths?: unknown;
  repeatCount?: unknown;
  departmentId?: unknown;
  notes?: unknown;
  paymentStatus?: unknown;
};

function isFrequency(v: unknown): v is ExpenseFrequency {
  return (
    v === "daily" ||
    v === "weekly" ||
    v === "monthly" ||
    v === "quarterly" ||
    v === "yearly" ||
    v === "once" ||
    v === "customMonths"
  );
}

function isDateOnly(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function isPaymentStatus(v: unknown): v is PaymentStatus {
  return v === "paid" || v === "unpaid";
}

function toPositiveIntOrNull(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number(v.trim())
        : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i <= 0) return null;
  return i;
}

export async function GET(req: Request) {
  const auth = await requireApiPermission(req, "expenses");
  if (auth instanceof NextResponse) return auth;
  const expenses = loadExpenses();
  return NextResponse.json({ expenses });
}

export async function POST(req: Request) {
  const auth = await requireApiPermission(req, "expenses");
  if (auth instanceof NextResponse) return auth;
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

  const endDateRaw = body.endDate;
  const endDate =
    endDateRaw == null || endDateRaw === ""
      ? undefined
      : isDateOnly(endDateRaw)
        ? endDateRaw
        : null;
  if (endDate === null) {
    return NextResponse.json({ error: "Invalid `endDate` (YYYY-MM-DD)." }, { status: 400 });
  }
  if (endDate && endDate < startDate) {
    return NextResponse.json({ error: "`endDate` must be on or after `startDate`." }, { status: 400 });
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

  const repeatEveryMonths = frequency === "customMonths" ? toPositiveIntOrNull(body.repeatEveryMonths) ?? 1 : undefined;
  const repeatCount = frequency === "customMonths" ? toPositiveIntOrNull(body.repeatCount) ?? undefined : undefined;

  const isRequestor = !auth.isSuperadmin;

  const expense: Expense = {
    id: randomUUID(),
    title,
    amount,
    category,
    frequency,
    startDate,
    ...(endDate ? { endDate } : {}),
    ...(repeatEveryMonths ? { repeatEveryMonths } : {}),
    ...(repeatCount ? { repeatCount } : {}),
    departmentId,
    notes,
    paymentStatus: isRequestor ? "unpaid" : frequency === "once" ? paymentStatus : "unpaid",
    ...(frequency !== "once" ? { paidDates: [] as string[] } : {}),
    ...(isRequestor
      ? {
          isRequest: true,
          requestStatus: "pending" as const,
          requestedBy: auth.displayName || auth.email,
        }
      : {}),
    createdAt: new Date().toISOString(),
  };

  const expenses = loadExpenses();
  expenses.push(expense);
  saveExpenses(expenses);

  return NextResponse.json({ expense });
}

export async function PUT(req: Request) {
  const auth = await requireApiPermission(req, "expenses");
  if (auth instanceof NextResponse) return auth;
  if (!auth.isSuperadmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const body = (await req.json()) as Partial<Expense> & { id?: unknown };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });

  const expenses = loadExpenses();
  const idx = expenses.findIndex((e) => e.id === id);
  if (idx < 0) return NextResponse.json({ error: "Expense not found." }, { status: 404 });

  const prev = expenses[idx];
  const nextFreq = typeof body.frequency === "string" && isFrequency(body.frequency) ? body.frequency : prev.frequency;
  const nextStart =
    typeof body.startDate === "string" && isDateOnly(body.startDate) ? body.startDate : prev.startDate;

  let nextEndDate = prev.endDate;
  if ("endDate" in body) {
    if (body.endDate == null || body.endDate === "") nextEndDate = undefined;
    else if (typeof body.endDate === "string" && isDateOnly(body.endDate)) nextEndDate = body.endDate;
    else return NextResponse.json({ error: "Invalid `endDate` (YYYY-MM-DD)." }, { status: 400 });
  }
  if (nextEndDate && nextEndDate < nextStart) {
    return NextResponse.json({ error: "`endDate` must be on or after `startDate`." }, { status: 400 });
  }

  const next: Expense = {
    ...prev,
    ...(typeof body.title === "string" && body.title.trim() ? { title: body.title.trim() } : {}),
    ...(typeof body.category === "string" && body.category.trim() ? { category: body.category.trim() } : {}),
    ...(typeof body.amount === "number" && Number.isFinite(body.amount) ? { amount: body.amount } : {}),
    frequency: nextFreq,
    startDate: nextStart,
    endDate: nextEndDate,
    ...(typeof body.repeatEveryMonths === "number" && Number.isFinite(body.repeatEveryMonths)
      ? { repeatEveryMonths: body.repeatEveryMonths }
      : {}),
    ...(typeof body.repeatCount === "number" && Number.isFinite(body.repeatCount) ? { repeatCount: body.repeatCount } : {}),
    ...(typeof body.departmentId === "string" ? { departmentId: body.departmentId || undefined } : {}),
    ...(typeof body.notes === "string" ? { notes: body.notes.trim() ? body.notes.trim() : undefined } : {}),
    // Template paymentStatus only applies to one-time expenses.
    ...(nextFreq === "once" && body.paymentStatus && isPaymentStatus(body.paymentStatus)
      ? { paymentStatus: body.paymentStatus }
      : nextFreq !== "once"
        ? { paymentStatus: "unpaid" }
        : {}),
  };

  expenses[idx] = next;
  saveExpenses(expenses);
  return NextResponse.json({ ok: true, expense: next });
}

export async function DELETE(req: Request) {
  const auth = await requireApiPermission(req, "expenses");
  if (auth instanceof NextResponse) return auth;
  if (!auth.isSuperadmin) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });

  const expenses = loadExpenses();
  const next = expenses.filter((e) => e.id !== id);
  if (next.length === expenses.length) return NextResponse.json({ error: "Expense not found." }, { status: 404 });
  saveExpenses(next);
  return NextResponse.json({ ok: true });
}
