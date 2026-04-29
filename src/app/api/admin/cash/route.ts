import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadCashLedger, saveCashLedger } from "@/data/admin/storage";
import type { BankAccount, CashTransaction } from "@/data/admin/types";
import { requireApiAnyPermission, requireApiPermission } from "@/lib/adminApiAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isDateOnly(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export async function GET(req: Request) {
  const auth = await requireApiAnyPermission(req, ["pettyCash", "pettyCashEdit", "settings", "salesReport", "calendar", "expenses"]);
  if (auth instanceof NextResponse) return auth;
  const file = loadCashLedger();
  return NextResponse.json(file);
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "upsertAccount" || action === "deleteAccount") {
    const auth = await requireApiPermission(req, "settings");
    if (auth instanceof NextResponse) return auth;
  } else if (action === "depositSalesDay" || action === "undoDepositSalesDay") {
    const auth = await requireApiPermission(req, "salesReport");
    if (auth instanceof NextResponse) return auth;
  } else if (action === "addTransaction") {
    const auth = await requireApiPermission(req, "pettyCash");
    if (auth instanceof NextResponse) return auth;
  } else if (action === "deleteTransaction") {
    const auth = await requireApiPermission(req, "pettyCashEdit");
    if (auth instanceof NextResponse) return auth;
  } else {
    return NextResponse.json({ error: "Missing/invalid `action`." }, { status: 400 });
  }

  const file = loadCashLedger();

  if (action === "upsertAccount") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const bank = typeof body.bank === "string" ? body.bank.trim() : "";
    const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
    if (!name || !bank || !accountName) {
      return NextResponse.json({ error: "Missing `name`, `bank`, or `accountName`." }, { status: 400 });
    }
    if (id) {
      const idx = file.accounts.findIndex((a) => a.id === id);
      if (idx < 0) return NextResponse.json({ error: "Account not found." }, { status: 404 });
      const next: BankAccount = { ...file.accounts[idx], name, bank, accountName };
      file.accounts[idx] = next;
    } else {
      const next: BankAccount = {
        id: randomUUID(),
        name,
        bank,
        accountName,
        createdAt: new Date().toISOString(),
      };
      file.accounts.unshift(next);
    }
    saveCashLedger(file);
    return NextResponse.json({ ok: true, file });
  }

  if (action === "deleteAccount") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });
    file.accounts = file.accounts.filter((a) => a.id !== id);
    file.transactions = file.transactions.filter((t) => t.accountId !== id);
    saveCashLedger(file);
    return NextResponse.json({ ok: true, file });
  }

  if (action === "addTransaction") {
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const side = typeof body.side === "string" ? body.side : "";
    const amount = num(body.amount);
    if (!accountId) return NextResponse.json({ error: "Missing `accountId`." }, { status: 400 });
    if (!isDateOnly(date)) return NextResponse.json({ error: "Missing/invalid `date` (YYYY-MM-DD)." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Missing `description`." }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Invalid `amount`." }, { status: 400 });
    if (side !== "debit" && side !== "credit") {
      return NextResponse.json({ error: "Invalid `side` (debit|credit)." }, { status: 400 });
    }
    if (!file.accounts.some((a) => a.id === accountId)) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    const tx: CashTransaction = {
      id: randomUUID(),
      accountId,
      date,
      description,
      debit: side === "debit" ? amount : 0,
      credit: side === "credit" ? amount : 0,
      kind: "custom",
      createdAt: new Date().toISOString(),
    };
    file.transactions.unshift(tx);
    saveCashLedger(file);
    return NextResponse.json({ ok: true, tx, file });
  }

  if (action === "deleteTransaction") {
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "Missing `id`." }, { status: 400 });
    const idx = file.transactions.findIndex((t) => t.id === id);
    if (idx < 0) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
    const [deleted] = file.transactions.splice(idx, 1);
    saveCashLedger(file);
    return NextResponse.json({ ok: true, deleted, file });
  }

  if (action === "depositSalesDay" || action === "undoDepositSalesDay") {
    const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    const salesDate = typeof body.salesDate === "string" ? body.salesDate.trim() : "";
    if (!accountId) return NextResponse.json({ error: "Missing `accountId`." }, { status: 400 });
    if (!isDateOnly(salesDate)) return NextResponse.json({ error: "Missing/invalid `salesDate` (YYYY-MM-DD)." }, { status: 400 });
    if (!file.accounts.some((a) => a.id === accountId)) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const existingIdx = file.transactions.findIndex(
      (t) => t.kind === "sales_deposit" && t.accountId === accountId && t.salesDate === salesDate,
    );

    if (action === "undoDepositSalesDay") {
      if (existingIdx >= 0) file.transactions.splice(existingIdx, 1);
      saveCashLedger(file);
      return NextResponse.json({ ok: true, undone: existingIdx >= 0, file });
    }

    const amount = num(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Invalid `amount`." }, { status: 400 });

    if (existingIdx >= 0) {
      // Idempotent: already deposited.
      return NextResponse.json({ ok: true, existed: true, file });
    }

    const nowYmd = todayISO();
    const tx: CashTransaction = {
      id: randomUUID(),
      accountId,
      date: nowYmd,
      description: `sales-${salesDate}`,
      debit: 0,
      credit: amount,
      kind: "sales_deposit",
      salesDate,
      depositedAt: nowYmd,
      createdAt: new Date().toISOString(),
    };
    file.transactions.unshift(tx);
    saveCashLedger(file);
    return NextResponse.json({ ok: true, tx, file });
  }

  return NextResponse.json({ error: "Unhandled action." }, { status: 400 });
}

