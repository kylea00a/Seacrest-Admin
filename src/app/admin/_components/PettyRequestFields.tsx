"use client";

import type { PettyCashRequestType, PettyFundId } from "@/data/admin/types";
import { PETTY_FUND_IDS, PETTY_FUND_LABELS } from "@/lib/pettyFunds";

type Props = {
  /** Fund for the page where the request is filed (source for transfers / cash-out). */
  sourceFund: PettyFundId;
  requestType: PettyCashRequestType;
  onRequestTypeChange: (t: PettyCashRequestType) => void;
  targetFund: PettyFundId;
  onTargetFundChange: (f: PettyFundId) => void;
  dateRequested: string;
  onDateRequestedChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  availableBalance: number;
  currency: (n: number) => string;
};

export function PettyRequestFields({
  sourceFund,
  requestType,
  onRequestTypeChange,
  targetFund,
  onTargetFundChange,
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
  const showFundPicker = requestType === "cashIn" || requestType === "transfer";
  const fundPickerLabel = requestType === "transfer" ? "Transfer to" : "Cash in to";
  const fundOptions = requestType === "transfer" ? transferOptions : PETTY_FUND_IDS;

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

        {showFundPicker ? (
          <div>
            <label className="text-sm font-semibold">{fundPickerLabel}</label>
            <select
              value={targetFund}
              onChange={(e) => onTargetFundChange(e.target.value as PettyFundId)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500/60"
              required
            >
              {fundOptions.map((id) => (
                <option key={id} value={id}>
                  {PETTY_FUND_LABELS[id]}
                </option>
              ))}
            </select>
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

        {showFundPicker ? (
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
        ) : null}
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
            ) : (
              <>Adds to {PETTY_FUND_LABELS[targetFund]} once approved.</>
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
}): string {
  const t = r.requestType ?? "budget";
  if (t === "cashIn") {
    const dest = r.targetFund ? PETTY_FUND_LABELS[r.targetFund] : "fund";
    return `cash in → ${dest}`;
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
}): string {
  const t = r.requestType ?? "budget";
  let extra = "";
  if ((t === "cashIn" || t === "transfer") && r.targetFund) {
    extra = ` → ${PETTY_FUND_LABELS[r.targetFund]}`;
  }
  return `${r.category}${extra} • ${r.employeeName} • Requested ${r.dateRequested}`;
}
