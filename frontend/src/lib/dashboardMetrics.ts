import type { ExtractionRun } from "./api";

type RunCountField = "records_extracted" | "records_valid" | "records_invalid";

export function recentRunSeries(runs: ExtractionRun[], field: RunCountField, limit = 8): number[] {
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

export function validationRateSeries(runs: ExtractionRun[], limit = 8): number[] {
  return runs
    .filter((r) => r.status !== "running" && r.completed_at)
    .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime())
    .slice(-limit)
    .map((r) => {
      if (!r.records_extracted) return 100;
      return Math.round((r.records_valid / r.records_extracted) * 1000) / 10;
    });
}

export function regulatoryFlagSeries(ctr: number, ftr: number, pep: number, str: number): number[] {
  return [ctr, ftr, pep, str];
}

/** Visual trend when report counts have no history — anchors the sparkline to current totals. */
export function reportPipelineSeries(pending: number, submitted: number): number[] {
  const total = pending + submitted;
  if (total === 0) return [0, 0, 0, 0, 0];
  const mid = Math.round(total * 0.55);
  return [Math.max(0, submitted - 1), submitted, mid, pending, pending];
}
