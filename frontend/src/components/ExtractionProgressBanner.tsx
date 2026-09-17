import { RefreshCw } from "lucide-react";
import type { ExtractionLog, ExtractionRun } from "../lib/api";
import { latestHtdProgress, progressLabel } from "../lib/extractionProgress";
import { formatNumber } from "../lib/format";

export function ExtractionProgressBanner({
  running,
  run,
  logs,
  fallbackMessage,
}: {
  running: boolean;
  run?: ExtractionRun | null;
  logs?: ExtractionLog[];
  fallbackMessage?: string | null;
}) {
  const active = running || run?.status === "running";
  if (!active) return null;

  const progress = latestHtdProgress(logs ?? []);
  const message = progressLabel(logs ?? [], fallbackMessage);
  const hasTotal = progress?.legs_total != null && progress.legs_total > 0;
  const percent = hasTotal ? Math.min(100, Math.round((progress.legs_fetched / progress.legs_total) * 100)) : null;

  return (
    <div className="mb-4 rounded-lg border border-brand/30 bg-brand-muted/40 px-4 py-3 text-sm text-content">
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Extraction in progress</p>
          {message && <p className="mt-1 text-content-muted">{message}</p>}
          <div className="mt-3">
            {percent != null ? (
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-overlay">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
                </div>
                <span className="w-20 text-right text-xs font-medium text-content-muted">
                  {formatNumber(progress.legs_fetched)}/{formatNumber(progress.legs_total as number)}
                </span>
              </div>
            ) : (
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-overlay">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-content-muted">
            <span>
              HTD legs <span className="font-medium text-content">{formatNumber(progress?.legs_fetched ?? 0)}</span>
            </span>
            <span>
              Transactions <span className="font-medium text-content">{formatNumber(progress?.staged ?? run?.records_extracted ?? 0)}</span>
            </span>
            <span>
              Already in staging <span className="font-medium text-content">{formatNumber(progress?.skipped ?? 0)}</span>
            </span>
            <span>
              Invalid <span className="font-medium text-danger">{formatNumber(progress?.invalid ?? run?.records_invalid ?? 0)}</span>
            </span>
            <span>
              Valid <span className="font-medium text-success">{formatNumber(progress?.valid ?? run?.records_valid ?? 0)}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
