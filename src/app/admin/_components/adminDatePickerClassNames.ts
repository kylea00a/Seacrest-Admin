/**
 * Shared compact DayPicker classNames (All Orders range + Inventory single day).
 * Use with wrapper `className="admin-date-popover"` on the popover root.
 */
export const adminCompactDayPickerClassNames = {
  root: "admin-day-picker mx-auto w-full justify-center text-[11px]",
  months: "flex flex-wrap justify-center gap-2 sm:gap-3",
  month: "relative space-y-1.5",
  month_caption: "flex h-7 items-center justify-center text-center text-[11px] font-semibold text-zinc-800",
  nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between px-0.5",
  button_previous:
    "inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100",
  button_next: "inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100",
  weekdays: "flex",
  weekday: "w-7 text-center text-[9px] font-medium uppercase text-zinc-500",
  week: "mt-0.5 flex w-full",
  day: "h-7 w-7 p-0 text-center",
  day_button:
    "inline-flex h-7 w-7 items-center justify-center rounded text-[11px] text-zinc-800 hover:bg-zinc-100",
  selected: "font-semibold",
  today: "font-semibold text-blue-600",
  outside: "text-zinc-400 opacity-70",
  disabled: "text-zinc-300 opacity-50",
  range_start: "rounded-l",
  range_end: "rounded-r",
  range_middle: "rounded-none",
} as const;
