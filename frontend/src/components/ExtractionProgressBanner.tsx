import type { ExtractionLog, ExtractionRun } from "../lib/api";
import { latestHtdProgress, progressLabel } from "../lib/extractionProgress";
import { formatNumber } from "../lib/format";

function CircularProgress({ percent }: { percent: number | null }) {
  const size = 72;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const known = percent != null;
  const offset = known ? circumference - (Math.min(100, percent) / 100) * circumference : circumference * 0.72;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={known ? undefined : "animate-spin"}
        style={known ? undefined : { animationDuration: "1.4s" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--border))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--content))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-content">
        {known ? `${percent}%` : "…"}
      </span>
    </div>
  );
}

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
    <div className="mb-4 border border-border bg-surface-raised px-5 py-4">
      <div className="flex items-center gap-5">
        <CircularProgress percent={percent} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-content">Extraction in progress</p>
          {message && <p className="mt-1 text-sm text-content-muted">{message}</p>}
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-content-muted sm:grid-cols-4">
            <div>
              <dt className="text-content-subtle">HTD legs</dt>
              <dd className="font-medium tabular-nums text-content">
                {formatNumber(progress?.legs_fetched ?? 0)}
                {hasTotal ? ` / ${formatNumber(progress?.legs_total as number)}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-content-subtle">Staged</dt>
              <dd className="font-medium tabular-nums text-content">{formatNumber(progress?.staged ?? run?.records_extracted ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-content-subtle">Already held</dt>
              <dd className="font-medium tabular-nums text-content">{formatNumber(progress?.skipped ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-content-subtle">Valid / invalid</dt>
              <dd className="font-medium tabular-nums text-content">
                {formatNumber(progress?.valid ?? run?.records_valid ?? 0)} / {formatNumber(progress?.invalid ?? run?.records_invalid ?? 0)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
