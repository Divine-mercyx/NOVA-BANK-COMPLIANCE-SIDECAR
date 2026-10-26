import { AlertTriangle, Play, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DatePickerField } from "./DatePickerField";
import {
  CalendarDate,
  ExtractionPreset,
  ExtractionRunParams,
  buildExtractionParams,
  compareDates,
  formatCalendarDateLabel,
  loadSavedRange,
  presetRange,
  rangeDayCount,
  saveRange,
} from "../lib/dates";
import { extractModeLabel } from "../lib/roles";

const PRESETS: { id: ExtractionPreset; label: string }[] = [
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "custom", label: "Custom" },
];

interface ExtractionRunModalProps {
  open: boolean;
  onClose: () => void;
  onRun: (params: ExtractionRunParams) => Promise<void>;
  finacleMode?: string;
  running?: boolean;
  progressMessage?: string | null;
}

export function ExtractionRunModal({ open, onClose, onRun, finacleMode, running, progressMessage }: ExtractionRunModalProps) {
  const [preset, setPreset] = useState<ExtractionPreset>("last7");
  const [from, setFrom] = useState<CalendarDate>(() => presetRange("last7").from);
  const [to, setTo] = useState<CalendarDate>(() => presetRange("last7").to);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const saved = loadSavedRange();
    if (saved) {
      setPreset(saved.preset);
      setFrom(saved.from);
      setTo(saved.to);
    } else {
      const range = presetRange("last7");
      setPreset("last7");
      setFrom(range.from);
      setTo(range.to);
    }
    setError(null);
  }, [open]);

  useEffect(() => {
    if (preset === "custom") return;
    const range = presetRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !running) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, running]);

  if (!open) return null;

  const dayCount = rangeDayCount(from, to);
  const invalidRange = compareDates(from, to) > 0;
  const largeRange = dayCount > 90;
  const oracleMode = finacleMode === "oracle";
  const modeLabel = extractModeLabel(finacleMode ?? "csv");

  const handleRun = async () => {
    if (invalidRange) {
      setError("Start date must be on or before the end date.");
      return;
    }
    setError(null);
    saveRange(preset, from, to);
    await onRun(buildExtractionParams(from, to));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-content/35 backdrop-blur-[2px]"
        aria-label="Close dialog"
        onClick={() => !running && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="extract-modal-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-surface-raised shadow-lg"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 id="extract-modal-title" className="text-base font-semibold text-content">
              Run extraction
            </h2>
            <p className="truncate text-xs text-content-muted">
              Posting dates · {modeLabel}
            </p>
          </div>
          <button type="button" className="btn-ghost shrink-0 p-1.5" onClick={onClose} disabled={running} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-content-subtle">Period</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={running}
                  onClick={() => setPreset(item.id)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    preset === item.id
                      ? "theme-selected"
                      : "border border-border bg-surface-overlay/40 text-content-muted hover:border-accent/35 hover:text-content"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-content">
                {formatCalendarDateLabel(from)}
                <span className="mx-1.5 font-normal text-content-subtle">→</span>
                {formatCalendarDateLabel(to)}
              </p>
              <span className="theme-chip shrink-0 px-2 py-0.5 text-[11px]">
                {dayCount}d
              </span>
            </div>
            {preset === "custom" && (
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border/80 pt-3">
                <DatePickerField
                  label="From"
                  value={from}
                  onChange={setFrom}
                  max={to}
                  disabled={running}
                />
                <DatePickerField
                  label="To"
                  value={to}
                  onChange={setTo}
                  min={from}
                  disabled={running}
                />
              </div>
            )}
          </div>

          {(oracleMode || largeRange) && (
            <div className="flex gap-2 rounded-lg border border-warning/25 bg-warning-muted/40 px-2.5 py-2 text-[11px] leading-snug text-content-muted">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              <p>
                {oracleMode && largeRange
                  ? "Oracle extracts use posting date over VPN — ranges over 90 days can be slow; prefer weekly slices."
                  : oracleMode
                    ? "Filters HTD by posting date (PSTD_DATE / TRAN_DATE). VPN latency may apply."
                    : "Ranges over 90 days can be slow — consider shorter periods."}
              </p>
            </div>
          )}

          {error && <p className="text-xs font-medium text-danger" role="alert">{error}</p>}

          {running && progressMessage && (
            <p className="rounded-lg border border-accent/25 bg-accent-muted/40 px-2.5 py-2 text-xs text-content-muted">
              {progressMessage}
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-border bg-surface-overlay/20 px-4 py-3">
          <button type="button" className="btn-secondary flex-1 py-2 text-sm" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-[1.2] py-2 text-sm"
            onClick={handleRun}
            disabled={running || invalidRange}
          >
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Running…" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
