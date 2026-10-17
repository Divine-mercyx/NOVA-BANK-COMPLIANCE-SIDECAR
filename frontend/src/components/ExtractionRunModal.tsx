import { AlertTriangle, Play, RefreshCw, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { spring } from "../lib/motion";
import { DatePickerField } from "./DatePickerField";
import { AnimatedAlert, ModalShell } from "./motion";
import { InfoCallout } from "./ui";
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

const PRESETS: { id: ExtractionPreset; label: string; hint: string }[] = [
  { id: "yesterday", label: "Yesterday", hint: "Previous calendar day" },
  { id: "last7", label: "Last 7 days", hint: "Including today" },
  { id: "last30", label: "Last 30 days", hint: "Including today" },
  { id: "custom", label: "Custom range", hint: "Pick year, month, and day" },
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

  const dayCount = rangeDayCount(from, to);
  const invalidRange = compareDates(from, to) > 0;
  const largeRange = dayCount > 90;
  const oracleMode = finacleMode === "oracle";

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
    <AnimatePresence>
      {open && (
      <ModalShell
        onClose={onClose}
        dismissible={!running}
        labelledBy="extract-modal-title"
        panelClassName="max-w-2xl rounded-xl border border-border bg-surface-raised shadow-lg"
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 id="extract-modal-title" className="text-xl font-semibold text-content">
              Run Finacle extraction
            </h2>
            <p className="mt-1 text-sm text-content-muted">
              Choose the posting date range to pull from{" "}
              <span className="font-medium text-content">{extractModeLabel(finacleMode ?? "csv")}</span>
            </p>
          </div>
          <button type="button" className="btn-ghost -mr-2" onClick={onClose} disabled={running} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-content-subtle">Quick presets</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={running}
                  onClick={() => setPreset(item.id)}
                  className={`relative rounded-xl border px-4 py-3 text-left transition ${
                    preset === item.id
                      ? "border-transparent"
                      : "border-border bg-surface-overlay/30 hover:border-brand/40 hover:bg-surface-overlay/60"
                  }`}
                >
                  {preset === item.id && (
                    // Shared-layout highlight: slides from the previous preset to the chosen one.
                    <motion.span
                      layoutId="extraction-preset-highlight"
                      className="absolute inset-0 rounded-xl border border-brand bg-brand-muted/60 ring-2 ring-brand/20"
                      transition={spring}
                    />
                  )}
                  <p className="relative text-sm font-semibold text-content">{item.label}</p>
                  <p className="relative text-xs text-content-muted">{item.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface-overlay/20 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-content">Transaction date range</p>
              <span className="rounded-full bg-brand-muted px-3 py-1 text-xs font-semibold text-brand">
                {dayCount} day{dayCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <DatePickerField
                label="From"
                value={from}
                onChange={(next) => {
                  setPreset("custom");
                  setFrom(next);
                }}
                max={to}
                disabled={running || preset !== "custom"}
              />
              <DatePickerField
                label="To"
                value={to}
                onChange={(next) => {
                  setPreset("custom");
                  setTo(next);
                }}
                min={from}
                disabled={running || preset !== "custom"}
              />
            </div>
            {preset !== "custom" && (
              <p className="mt-3 text-xs text-content-muted">
                Select <span className="font-medium text-content">Custom range</span> to edit year, month, and day manually.
              </p>
            )}
            <p className="mt-2 text-xs text-content-subtle">
              {formatCalendarDateLabel(from)} → {formatCalendarDateLabel(to)}
            </p>
          </div>

          {oracleMode && (
            <InfoCallout title="Oracle / VPN note">
              HTD rows are filtered by posting date (<code className="text-xs">PSTD_DATE</code> or{" "}
              <code className="text-xs">TRAN_DATE</code>). Large ranges may take several minutes over VPN.
            </InfoCallout>
          )}

          <AnimatedAlert
            show={largeRange}
            role="status"
            className="flex items-start gap-3 rounded-lg border border-warning/30 bg-amber-50 p-3 text-sm text-amber-800"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Ranges over 90 days can be slow on VPN. Prefer weekly or monthly slices for production Finacle extracts.
            </p>
          </AnimatedAlert>

          <AnimatedAlert show={Boolean(error)} className="text-sm font-medium text-danger">
            {error}
          </AnimatedAlert>

          <AnimatedAlert
            show={Boolean(running && progressMessage)}
            role="status"
            className="rounded-lg border border-brand/30 bg-brand-muted/30 px-3 py-2 text-sm text-content-muted"
          >
            {progressMessage}
          </AnimatedAlert>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-6 py-4 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={running}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={handleRun} disabled={running || invalidRange}>
            {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? "Extracting…" : "Run extraction"}
          </button>
        </div>
      </ModalShell>
      )}
    </AnimatePresence>
  );
}
