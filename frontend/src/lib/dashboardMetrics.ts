import type { ExtractionRun } from "./api";

export function recentRunSeries(
  runs: ExtractionRun[],
  field: "records_extracted" | "records_valid",
  limit = 8,
): number[] {
  return runs
    .filter((r) => r.status !== "running" && r.completed_at)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime())
    .slice(-limit)
    .map((r) => r[field]);
}

export function compareLastTwo(series: number[]): { label: string; up: boolean } | null {
  if (series.length < 2) return null;
  const prev = series[series.length - 2];
  const last = series[series.length - 1];
  if (prev === 0 && last === 0) return null;
  if (prev === 0) return { label: "up from prior run", up: true };
  const pct = Math.round(((last - prev) / prev) * 1000) / 10;
  if (pct === 0) return { label: "flat vs last run", up: true };
  return { label: `${Math.abs(pct)}% vs last run`, up: pct > 0 };
}

export function shareOfTotal(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
