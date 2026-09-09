/** Bank-local (Africa/Lagos) calendar helpers for Finacle ETL. */

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export type ExtractionPreset = "yesterday" | "last7" | "last30" | "custom";

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const BANK_OFFSET = "+01:00";
const STORAGE_KEY = "nova.etl.dateRange";

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function todayInLagos(): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 1);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function addDays(date: CalendarDate, delta: number): CalendarDate {
  const d = new Date(date.year, date.month - 1, date.day);
  d.setDate(d.getDate() + delta);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

export function clampDay(date: CalendarDate): CalendarDate {
  const max = daysInMonth(date.year, date.month);
  return { ...date, day: Math.min(date.day, max) };
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  return a.day - b.day;
}

export function formatCalendarDate(date: CalendarDate): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function formatCalendarDateLabel(date: CalendarDate): string {
  return `${MONTHS[date.month - 1]} ${date.day}, ${date.year}`;
}

export function calendarDateFromIso(iso: string): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return clampDay({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
}

export function toLagosIso(date: CalendarDate, endOfDay = false): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = endOfDay ? "23:59:59" : "00:00:00";
  return `${date.year}-${pad(date.month)}-${pad(date.day)}T${time}${BANK_OFFSET}`;
}

export function presetRange(preset: ExtractionPreset): { from: CalendarDate; to: CalendarDate } {
  const today = todayInLagos();
  switch (preset) {
    case "yesterday": {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    default:
      return { from: addDays(today, -6), to: today };
  }
}

export function yearOptions(fromYear = 2010): number[] {
  const current = todayInLagos().year;
  const years: number[] = [];
  for (let y = current; y >= fromYear; y -= 1) years.push(y);
  return years;
}

export function rangeDayCount(from: CalendarDate, to: CalendarDate): number {
  const start = new Date(from.year, from.month - 1, from.day);
  const end = new Date(to.year, to.month - 1, to.day);
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function loadSavedRange(): { preset: ExtractionPreset; from: CalendarDate; to: CalendarDate } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      preset: ExtractionPreset;
      from: CalendarDate;
      to: CalendarDate;
    };
    if (!parsed.from?.year || !parsed.to?.year) return null;
    return {
      preset: parsed.preset ?? "last7",
      from: clampDay(parsed.from),
      to: clampDay(parsed.to),
    };
  } catch {
    return null;
  }
}

export function saveRange(preset: ExtractionPreset, from: CalendarDate, to: CalendarDate) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset, from, to }));
}

export interface ExtractionRunParams {
  date_from: string;
  date_to: string;
}

export function buildExtractionParams(from: CalendarDate, to: CalendarDate): ExtractionRunParams {
  return {
    date_from: toLagosIso(from, false),
    date_to: toLagosIso(to, true),
  };
}
