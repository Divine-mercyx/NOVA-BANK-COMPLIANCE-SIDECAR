import { useEffect, useState } from "react";
import { Check, FileText, Plus, Send, X } from "lucide-react";
import { DatePickerField } from "../components/DatePickerField";
import { EmptyState, InfoCallout, PageHeader, ProgressBar, StatusBadge, Tag } from "../components/ui";
import { api, RegulatoryReport, ReportType } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  CalendarDate,
  buildExtractionParams,
  calendarDateFromIso,
  compareDates,
  formatCalendarDateLabel,
  loadSavedRange,
  presetRange,
} from "../lib/dates";
import { formatCurrency, formatDate, formatNumber, reportLabel } from "../lib/format";
import { canApproveReports, canGenerateReports } from "../lib/roles";

const REPORT_TYPES: ReportType[] = ["CTR", "FTR", "PEP", "STR"];

function defaultReportRange(): { from: CalendarDate; to: CalendarDate } {
  const saved = loadSavedRange();
  if (saved) return { from: saved.from, to: saved.to };
  return presetRange("last7");
}

export function ReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<RegulatoryReport[]>([]);
  const [selected, setSelected] = useState<RegulatoryReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [periodFrom, setPeriodFrom] = useState<CalendarDate>(() => defaultReportRange().from);
  const [periodTo, setPeriodTo] = useState<CalendarDate>(() => defaultReportRange().to);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const load = () => api.reports().then(setReports);
  useEffect(() => {
    load();
    api.dashboard().then((stats) => {
      const run = stats.last_extraction;
      if (!run?.date_from || !run.date_to) return;
      const from = calendarDateFromIso(run.date_from);
      const to = calendarDateFromIso(run.date_to);
      if (from && to) {
        setPeriodFrom(from);
        setPeriodTo(to);
      }
    });
  }, []);

  const generate = async (type: ReportType) => {
    if (compareDates(periodFrom, periodTo) > 0) {
      setRangeError("End date must be on or after start date.");
      return;
    }
    setRangeError(null);
    setGenerating(true);
    try {
      const { date_from, date_to } = buildExtractionParams(periodFrom, periodTo);
      const report = await api.generateReport(type, date_from, date_to);
      await load();
      setSelected(report);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Regulatory reports"
        subtitle="Generate, review, and submit CTR, FTR, and PEP files to NFIU goAML."
        count={`${reports.length} reports`}
        actions={
          canGenerateReports(user?.role) ? (
            <div className="flex gap-2">
              {REPORT_TYPES.map((t) => (
                <button key={t} className="btn-primary" disabled={generating} onClick={() => generate(t)}>
                  <Plus className="h-4 w-4" />
                  {t}
                </button>
              ))}
            </div>
          ) : undefined
        }
      />

      <div className="card mb-6 p-4">
        <p className="mb-3 text-sm font-medium text-content">Report period</p>
        <p className="mb-4 text-sm text-content-muted">
          Must match the dates you used for extraction. Defaults to your last extraction run (
          {formatCalendarDateLabel(periodFrom)} – {formatCalendarDateLabel(periodTo)}).
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePickerField label="From" value={periodFrom} onChange={setPeriodFrom} max={periodTo} />
          <DatePickerField label="To" value={periodTo} onChange={setPeriodTo} min={periodFrom} />
        </div>
        {rangeError && <p className="mt-3 text-sm text-danger">{rangeError}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card overflow-hidden lg:col-span-2">
          {reports.length === 0 ? (
            <EmptyState icon={FileText} title="No reports" description="Generate a report using the buttons above." />
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Report</th>
                  <th>Records</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)} className="cursor-pointer">
                    <td>
                      <p className="font-medium">{r.report_type}</p>
                      <p className="text-xs text-content-muted">{formatDate(r.created_at)}</p>
                    </td>
                    <td>{formatNumber(r.record_count)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card p-6 lg:col-span-3">
          {selected ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <Tag color="purple">{selected.report_type}</Tag>
                  <h2 className="mt-2 text-xl font-semibold">{reportLabel(selected.report_type)}</h2>
                </div>
                <StatusBadge status={selected.status} />
              </div>
              <div className="mt-4">
                <ProgressBar value={Math.min(100, selected.record_count * 5)} color="brand" />
              </div>
              {selected.preview_data && (
                <div className="mt-6 space-y-2">
                  {selected.preview_data.sample.map((s) => (
                    <div key={s.ref} className="rounded-lg border border-border p-3 text-sm">
                      <p className="font-mono text-xs text-content-muted">{s.ref}</p>
                      <p>{s.sender} → {s.receiver}</p>
                      <p className="font-medium text-brand">{formatCurrency(s.amount, s.currency)}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-6 flex gap-2">
                {canApproveReports(user?.role) && selected.status === "draft" && (
                  <button className="btn-secondary" onClick={() => api.approveReport(selected.id, user?.full_name).then(load)}>
                    <Check className="h-4 w-4" /> Approve
                  </button>
                )}
                {canApproveReports(user?.role) && (
                  <>
                    <button className="btn-primary" onClick={() => api.submitReport(selected.id, user?.full_name).then(load)}>
                      <Send className="h-4 w-4" /> Submit
                    </button>
                    <button className="btn-secondary" onClick={() => api.rejectReport(selected.id, user?.full_name).then(load)}>
                      <X className="h-4 w-4" /> Reject
                    </button>
                  </>
                )}
              </div>
              {selected.submitted_at && (
                <div className="mt-4">
                  <InfoCallout title="Submitted">Sent to NFIU on {formatDate(selected.submitted_at)}</InfoCallout>
                </div>
              )}
            </>
          ) : (
            <EmptyState icon={FileText} title="Select a report" description="Choose a report from the list to preview and manage submission." />
          )}
        </div>
      </div>
    </div>
  );
}
