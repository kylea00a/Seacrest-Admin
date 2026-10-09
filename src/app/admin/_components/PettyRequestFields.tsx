"use client";

import { useEffect, useState } from "react";
import type { BankAccount, PettyCashInFromType, PettyCashRequestType, PettyFundId } from "@/data/admin/types";
import { PETTY_FUND_IDS, PETTY_FUND_LABELS } from "@/lib/pettyFundConstants";

export type CashInFromValue =
  | { type: "cash" }
  | { type: "petty"; fundId: PettyFundId }
  | { type: "bank"; accountId: string };

type Props = {
  /** Fund for the page where the request is filed (source for transfers / cash-out / cash-in destination). */
  sourceFund: PettyFundId;
  requestType: PettyCashRequestType;
  onRequestTypeChange: (t: PettyCashRequestType) => void;
  /** Transfer destination. */
  targetFund: PettyFundId;
  onTargetFundChange: (f: PettyFundId) => void;
  /** Cash In funding source. */
  cashInFrom: CashInFromValue;
  onCashInFromChange: (v: CashInFromValue) => void;
  dateRequested: string;
  onDateRequestedChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  availableBalance: number;
  currency: (n: number) => string;
};

function cashInFromToSelectValue(v: CashInFromValue): string {
  if (v.type === "cash") return "cash";
  if (v.type === "petty") return `petty:${v.fundId}`;
  return `bank:${v.accountId}`;
}

function parseCashInFromSelect(raw: string): CashInFromValue | null {
  if (raw === "cash") return { type: "cash" };
  if (raw.startsWith("petty:")) {
    const fundId = raw.slice("petty:".length) as PettyFundId;
    if (fundId === "pettyCash" || fundId === "pettyGCash" || fundId === "pettyWallet") {
      return { type: "petty", fundId };
    }
    return null;
  }
  if (raw.startsWith("bank:")) {
    const accountId = raw.slice("bank:".length).trim();
    if (!accountId) return null;
    return { type: "bank", accountId };
  }
  return null;
}

export function PettyRequestFields({
  sourceFund,
  requestType,
  onRequestTypeChange,
  targetFund,
  onTargetFundChange,
  cashInFrom,
  onCashInFromChange,
  dateRequested,
  onDateRequestedChange,
  description,
  onDescriptionChange,
  amount,
  onAmountChange,
  availableBalance,
  currency,
}: Props) {
  const transferOptions = PETTY_FUND_IDS.filter((id) => id !== sourceFund);
  const otherPetty = PETTY_FUND_IDS.filter((id) => id !== sourceFund);
  const [banks, setBanks] = useState<BankAccount[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function loadBanks() {
      try {
        const res = await fetch("/api/admin/cash", { cache: "no-store" });
        const json = (await res.json()) as { accounts?: BankAccount[] };
        if (!res.ok || cancelled) return;
        setBanks(Array.isArray(json.accounts) ? json.accounts : []);
      } catch {
        // ignore
      }
    }
    void loadBanks();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold">Category</label>
          <select
            value={requestType}
            onChange={(e) => onRequestTypeChange(e.target.value as PettyCashRequestType)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
            required
          >
            <option value="budget">Cash Out</option>
            <option value="cashIn">Cash In</option>
            <option value="transfer">Transfer</option>
          </select>
        </div>

        {requestType === "cashIn" ? (
          <div>
            <label className="text-sm font-semibold">Cash in from</label>
            <select
              value={cashInFromToSelectValue(cashInFrom)}
              onChange={(e) => {
                const parsed = parseCashInFromSelect(e.target.value);
                if (parsed) onCashInFromChange(parsed);
              }}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
              required
            >
              <option value="cash">Cash</option>
              {otherPetty.length ? (
                <optgroup label="Other petty">
                  {otherPetty.map((id) => (
                    <option key={id} value={`petty:${id}`}>
                      {PETTY_FUND_LABELS[id]}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              {banks.length ? (
                <optgroup label="Banks">
                  {banks.map((a) => (
                    <option key={a.id} value={`bank:${a.id}`}>
                      {a.name} ({a.bank})
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </div>
        ) : null}

        {requestType === "transfer" ? (
          <div>
            <label className="text-sm font-semibold">Transfer to</label>
            <select
              value={targetFund}
              onChange={(e) => onTargetFundChange(e.target.value as PettyFundId)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
              required
            >
              {transferOptions.map((id) => (
                <option key={id} value={id}>
                  {PETTY_FUND_LABELS[id]}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {requestType === "budget" ? (
          <div>
            <label className="text-sm font-semibold">Date requested</label>
            <input
              type="date"
              value={dateRequested}
              onChange={(e) => onDateRequestedChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
              required
            />
          </div>
        ) : (
          <div>
            <label className="text-sm font-semibold">Date requested</label>
            <input
              type="date"
              value={dateRequested}
              onChange={(e) => onDateRequestedChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none"
              required
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label className="text-sm font-semibold">Description</label>
          <input
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            placeholder="Battery"
            required
          />
        </div>
        <div className="sm:col-span-1">
          <label className="text-sm font-semibold">Amount</label>
          <input
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
            placeholder="180"
            required
          />
          <div className="mt-1 text-xs text-zinc-400">
            {requestType === "budget" || requestType === "transfer" ? (
              <>Available: {currency(availableBalance)}</>
            ) : cashInFrom.type === "bank" ? (
              <>Credits this fund and deducts from the selected bank once approved.</>
            ) : cashInFrom.type === "petty" ? (
              <>Credits this fund and deducts from {PETTY_FUND_LABELS[cashInFrom.fundId]} once approved.</>
            ) : (
              <>Credits this fund from cash once approved.</>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export function requestTypeApproveLabel(r: {
  requestType?: PettyCashRequestType;
  targetFund?: PettyFundId;
  cashInFromType?: PettyCashInFromType;
  cashInFromFund?: PettyFundId;
}): string {
  const t = r.requestType ?? "budget";
  if (t === "cashIn") {
    if (r.cashInFromType === "petty" && r.cashInFromFund) return `cash in from ${PETTY_FUND_LABELS[r.cashInFromFund]}`;
    if (r.cashInFromType === "bank") return "cash in from bank";
    return "cash in from cash";
  }
  if (t === "transfer") {
    const dest = r.targetFund ? PETTY_FUND_LABELS[r.targetFund] : "fund";
    return `transfer → ${dest}`;
  }
  return "deduct";
}

export function requestMetaLine(r: {
  category: string;
  employeeName: string;
  dateRequested: string;
  requestType?: PettyCashRequestType;
  targetFund?: PettyFundId;
  cashInFromType?: PettyCashInFromType;
  cashInFromFund?: PettyFundId;
}): string {
  const t = r.requestType ?? "budget";
  let extra = "";
  if (t === "transfer" && r.targetFund) {
    extra = ` → ${PETTY_FUND_LABELS[r.targetFund]}`;
  } else if (t === "cashIn") {
    if (r.cashInFromType === "petty" && r.cashInFromFund) extra = ` ← ${PETTY_FUND_LABELS[r.cashInFromFund]}`;
    else if (r.cashInFromType === "bank") extra = " ← bank";
    else extra = " ← cash";
  }
  return `${r.category}${extra} • ${r.employeeName} • Requested ${r.dateRequested}`;
}
