"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Chevron, DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { adminCompactDayPickerClassNames } from "./adminDatePickerClassNames";

type Props = {
  value: DateRange | undefined;
  onChange: (next: DateRange | undefined) => void;
};

function formatDmYLabel(range: DateRange | undefined): string {
  if (!range?.from) return "Select date range";
  if (!range.to) return `${format(range.from, "dd/MM/yyyy")} – …`;
  return `${format(range.from, "dd/MM/yyyy")} – ${format(range.to, "dd/MM/yyyy")}`;
}

function formatFooterPreview(draft: DateRange | undefined): string {
  if (!draft?.from) return "— – —";
  if (!draft.to) return `${format(draft.from, "dd/MM/yyyy")} – …`;
  return `${format(draft.from, "dd/MM/yyyy")} – ${format(draft.to, "dd/MM/yyyy")}`;
}

/** Compact 2‑month range picker (same shell as Inventory day picker). */
export default function OrdersDateRangePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const label = formatDmYLabel(value);
  const canApply = Boolean(draft?.from && draft?.to);

  const handleApply = () => {
    if (!canApply || !draft) return;
    onChange(draft);
    setOpen(false);
  };

  const handleCancel = () => {
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="admin-input flex w-full min-w-[11rem] max-w-[16rem] items-center justify-between gap-2 py-1.5 text-left text-xs"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="truncate">{label}</span>
        <span className="text-zinc-500" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          className="admin-date-popover absolute left-0 top-full z-[100] mt-2 w-[min(100vw-2rem,26rem)]"
          role="dialog"
          aria-label="Choose date range"
        >
          <div
            className="pointer-events-none absolute -top-[6px] left-8 z-10 h-2.5 w-2.5 rotate-45 border-l border-t border-zinc-200 bg-white shadow-[0_-1px_0_0_rgba(0,0,0,0.06)]"
            aria-hidden
          />
          <div className="relative rounded-lg border border-zinc-200 bg-white p-2.5 text-zinc-900 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.2)]">
            <DayPicker
              mode="range"
              selected={draft}
              onSelect={setDraft}
              numberOfMonths={2}
              weekStartsOn={1}
              pagedNavigation
              components={{
                Chevron: (props) => <Chevron {...props} size={props.size ?? 14} />,
              }}
              classNames={adminCompactDayPickerClassNames}
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2">
              <p className="min-w-0 flex-1 text-[11px] tabular-nums leading-tight text-zinc-700">
                {formatFooterPreview(draft)}
              </p>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-[11px] font-medium text-zinc-500 transition hover:text-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canApply}
                  onClick={handleApply}
                  className="text-[11px] font-semibold text-blue-600 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
