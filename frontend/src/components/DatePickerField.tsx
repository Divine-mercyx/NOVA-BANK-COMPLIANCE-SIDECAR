import { ChevronDown, CalendarDays } from "lucide-react";
import { useMemo } from "react";
import {
  CalendarDate,
  MONTHS,
  clampDay,
  compareDates,
  daysInMonth,
  formatCalendarDateLabel,
  yearOptions,
} from "../lib/dates";

interface DatePickerFieldProps {
  label: string;
  value: CalendarDate;
  onChange: (value: CalendarDate) => void;
  min?: CalendarDate;
  max?: CalendarDate;
  disabled?: boolean;
}

function withinBounds(date: CalendarDate, min?: CalendarDate, max?: CalendarDate): boolean {
  if (min && compareDates(date, min) < 0) return false;
  if (max && compareDates(date, max) > 0) return false;
  return true;
}

export function DatePickerField({ label, value, onChange, min, max, disabled }: DatePickerFieldProps) {
  const years = useMemo(() => yearOptions(2010), []);
  const dayCount = daysInMonth(value.year, value.month);
  const days = useMemo(() => Array.from({ length: dayCount }, (_, i) => i + 1), [dayCount]);

  const update = (patch: Partial<CalendarDate>) => {
    onChange(clampDay({ ...value, ...patch }));
  };

  const selectClass =
    "appearance-none rounded-lg border border-border bg-surface-raised py-2.5 pl-3 pr-9 text-sm font-medium text-content shadow-soft transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-brand" aria-hidden />
        <span className="text-sm font-semibold text-content">{label}</span>
      </div>
      <p className="text-xs text-content-muted">{formatCalendarDateLabel(value)} · WAT (Africa/Lagos)</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="relative">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-content-subtle">Year</label>
          <div className="relative">
            <select
              className={`${selectClass} w-full`}
              value={value.year}
              disabled={disabled}
              onChange={(e) => update({ year: Number(e.target.value) })}
              aria-label={`${label} year`}
            >
              {years.map((year) => (
                <option key={year} value={year} disabled={!withinBounds({ ...value, year }, min, max)}>
                  {year}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
          </div>
        </div>
        <div className="relative">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-content-subtle">Month</label>
          <div className="relative">
            <select
              className={`${selectClass} w-full`}
              value={value.month}
              disabled={disabled}
              onChange={(e) => update({ month: Number(e.target.value) })}
              aria-label={`${label} month`}
            >
              {MONTHS.map((name, index) => (
                <option
                  key={name}
                  value={index + 1}
                  disabled={!withinBounds({ ...value, month: index + 1 }, min, max)}
                >
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
          </div>
        </div>
        <div className="relative">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-content-subtle">Day</label>
          <div className="relative">
            <select
              className={`${selectClass} w-full`}
              value={value.day}
              disabled={disabled}
              onChange={(e) => update({ day: Number(e.target.value) })}
              aria-label={`${label} day`}
            >
              {days.map((day) => (
                <option key={day} value={day} disabled={!withinBounds({ ...value, day }, min, max)}>
                  {day}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
          </div>
        </div>
      </div>
    </div>
  );
}
