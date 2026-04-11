"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Chevron, DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { adminCompactDayPickerClassNames } from "./adminDatePickerClassNames";

type Props = {
  value: Date | undefined;
  onChange: (next: Date | undefined) => void;
};

function formatLabel(d: Date | undefined): string {
  if (!d) return "Select date";
  return format(d, "dd/MM/yyyy");
}

/**
 * Single calendar day (not a range). Two months + paged nav, compact shell — matches All Orders picker styling.
 */
export default function InventoryDayPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date | undefined>(value);
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

  const label = formatLabel(value);
  const canApply = Boolean(draft);

  const handleApply = () => {
    if (!draft) return;
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
          aria-label="Choose date"
        >
          <div
            className="pointer-events-none absolute -top-[6px] left-8 z-10 h-2.5 w-2.5 rotate-45 border-l border-t border-zinc-200 bg-white shadow-[0_-1px_0_0_rgba(0,0,0,0.06)]"
            aria-hidden
          />
          <div className="relative rounded-lg border border-zinc-200 bg-white p-2.5 text-zinc-900 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.2)]">
            <DayPicker
              mode="single"
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
                {draft ? format(draft, "dd/MM/yyyy") : "—"}
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
