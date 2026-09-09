import {
  ArrowDownToLine,
  BookOpen,
  CheckCircle2,
  KeyRound,
  Play,
  Server,
  Shield,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DatePickerField } from "../../components/DatePickerField";
import { InfoCallout, PageHeader, Tag } from "../../components/ui";
import { api, IntegrationInfo } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  CalendarDate,
  buildExtractionParams,
  calendarDateFromIso,
  formatCalendarDateLabel,
  loadSavedRange,
  presetRange,
} from "../../lib/dates";
import { loadPartnerApiKey, partnerGet, savePartnerApiKey } from "../../lib/partnerApi";

type ReportFilter = "" | "CTR" | "FTR" | "PEP" | "STR";

interface TryResult {
  label: string;
  result: Awaited<ReturnType<typeof partnerGet>>;
}

function defaultRange(): { from: CalendarDate; to: CalendarDate } {
  const saved = loadSavedRange();
  if (saved) return { from: saved.from, to: saved.to };
  return presetRange("last7");
}

function ResponsePanel({ result }: { result: TryResult | null }) {
  if (!result) return null;
  const { ok, status, durationMs, data, error, url } = result.result;
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Tag color={ok ? "blue" : "pink"}>{ok ? "Success" : "Error"}</Tag>
        <span className="text-content-muted">{status || "—"} · {durationMs}ms</span>
        <span className="truncate font-mono text-content-muted">{url}</span>
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-surface-raised p-3 text-xs leading-relaxed text-content">
        {error ? error : JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

export function IntegrationApiDocsPage() {
  const { user } = useAuth();
  const [info, setInfo] = useState<IntegrationInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [apiKey, setApiKey] = useState(() => loadPartnerApiKey());
  const [periodFrom, setPeriodFrom] = useState<CalendarDate>(() => defaultRange().from);
  const [periodTo, setPeriodTo] = useState<CalendarDate>(() => defaultRange().to);
  const [reportType, setReportType] = useState<ReportFilter>("CTR");
  const [finacleRef, setFinacleRef] = useState("");
  const [reportId, setReportId] = useState("");
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<TryResult | null>(null);

  useEffect(() => {
    api.integrationInfo()
      .then(setInfo)
      .catch((e) => setLoadError(String(e.message)));
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

  const periodParams = useMemo(() => {
    const { date_from, date_to } = buildExtractionParams(periodFrom, periodTo);
    return { period_start: date_from, period_end: date_to };
  }, [periodFrom, periodTo]);

  const persistKey = (value: string) => {
    setApiKey(value);
    savePartnerApiKey(value);
  };

  const run = async (label: string, path: string, params?: Record<string, string | number | boolean | undefined>) => {
    if (!apiKey.trim()) {
      setLastResult({
        label,
        result: { ok: false, status: 0, durationMs: 0, error: "Paste your API key above first.", url: path },
      });
      return;
    }
    setRunning(true);
    try {
      const result = await partnerGet(path, apiKey.trim(), params);
      setLastResult({ label, result });
    } finally {
      setRunning(false);
    }
  };

  const flowSteps = [
    "Finacle HTD/GAM → Sidecar ETL validates & translates",
    "Staging warehouse stores NFIU-ready payloads",
    "Nova IT pulls via Export API (this page)",
    "Your systems file to NFIU in goAML format",
  ];

  return (
    <div>
      <PageHeader
        title="Export API"
        subtitle="Pull translated, NFIU-ready transactions from the compliance sidecar. Nova Bank IT uses an API key — no push/ingest required."
        actions={
          info && (
            <a href={info.openapi_url} target="_blank" rel="noreferrer" className="btn-secondary">
              <BookOpen className="h-4 w-4" />
              OpenAPI
            </a>
          )
        }
      />

      {loadError && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{loadError}</div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-brand-muted p-2 text-brand">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-content">How it works</h2>
              <p className="mt-1 text-sm text-content-muted">
                The sidecar owns extraction and translation. Your middleware <strong>pulls</strong> staged results —
                you do not POST raw Finacle rows into us.
              </p>
              <ol className="mt-4 space-y-2">
                {flowSteps.map((step, i) => (
                  <li key={step} className="flex items-start gap-2 text-sm text-content">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-content">
            <Shield className="h-4 w-4 text-brand" />
            Authentication
          </div>
          <p className="mt-2 text-sm text-content-muted">
            Every export call requires header <code className="rounded bg-surface-raised px-1">X-API-Key: nova_…</code>
          </p>
          {user?.role === "admin" ? (
            <Link to="/integration/keys" className="btn-secondary mt-4 w-full">
              <KeyRound className="h-4 w-4" />
              Manage API keys
            </Link>
          ) : (
            <p className="mt-4 text-xs text-content-muted">Ask an admin to issue your team an API key.</p>
          )}
        </div>
      </div>

      <div className="card mb-6 p-5">
        <h2 className="text-sm font-semibold text-content">Live console — test with your API key</h2>
        <p className="mt-1 text-sm text-content-muted">
          Key is stored in this browser session only. Use the same date range as your last extraction (
          {formatCalendarDateLabel(periodFrom)} – {formatCalendarDateLabel(periodTo)}).
        </p>
        <label className="mt-4 block text-xs font-medium text-content-muted">
          API key
          <input
            className="input mt-1 w-full font-mono text-sm"
            type="password"
            value={apiKey}
            onChange={(e) => persistKey(e.target.value)}
            placeholder="nova_xxxxxxxxxx_…"
            autoComplete="off"
          />
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <DatePickerField label="Period from" value={periodFrom} onChange={setPeriodFrom} max={periodTo} />
          <DatePickerField label="Period to" value={periodTo} onChange={setPeriodTo} min={periodFrom} />
        </div>
      </div>

      {info && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-content-muted">Base URL</p>
            <p className="mt-1 font-mono text-sm">{info.base_url}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-content-muted">Finacle mode</p>
            <p className="mt-1 text-sm font-semibold">{info.finacle_mode}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs uppercase tracking-wide text-content-muted">Endpoints</p>
            <p className="mt-1 text-sm font-semibold">{info.endpoints.length} export routes</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <EndpointCard
          method="GET"
          path="/api/v1/export/verify"
          title="Verify API key"
          description="Confirm your key is active and see the registered client name."
          running={running}
          onRun={() => run("Verify key", "/api/v1/export/verify")}
        />

        <EndpointCard
          method="GET"
          path="/api/v1/export/summary"
          title="Export summary"
          description="Counts of valid and CTR/FTR/PEP/STR-eligible transactions for the selected period."
          running={running}
          onRun={() => run("Summary", "/api/v1/export/summary", periodParams)}
        />

        <EndpointCard
          method="GET"
          path="/api/v1/export/transactions"
          title="Pull translated transactions"
          description="Paginated list with full nfiu_payload per record — ready for NFIU filing pipelines."
          running={running}
          onRun={() =>
            run("Transactions", "/api/v1/export/transactions", {
              ...periodParams,
              report_type: reportType || undefined,
              valid_only: true,
              limit: 25,
              offset: 0,
            })
          }
          controls={
            <label className="text-xs text-content-muted">
              Report filter
              <select
                className="input mt-1 w-full"
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportFilter)}
              >
                <option value="">All valid</option>
                <option value="CTR">CTR only</option>
                <option value="FTR">FTR only</option>
                <option value="PEP">PEP only</option>
                <option value="STR">STR only</option>
              </select>
            </label>
          }
        />

        <EndpointCard
          method="GET"
          path="/api/v1/export/transactions/{finacle_ref}"
          title="Single transaction lookup"
          description="Fetch one staged transaction by Finacle reference."
          running={running}
          onRun={() => {
            if (!finacleRef.trim()) {
              setLastResult({
                label: "Single txn",
                result: { ok: false, status: 0, durationMs: 0, error: "Enter a finacle_ref.", url: "" },
              });
              return;
            }
            run("Single txn", `/api/v1/export/transactions/${encodeURIComponent(finacleRef.trim())}`);
          }}
          controls={
            <label className="text-xs text-content-muted">
              finacle_ref
              <input className="input mt-1 w-full font-mono text-sm" value={finacleRef} onChange={(e) => setFinacleRef(e.target.value)} />
            </label>
          }
        />

        <EndpointCard
          method="GET"
          path="/api/v1/export/reports"
          title="List generated reports"
          description="Regulatory reports (CTR/FTR/PEP/STR) created in the portal, available for download."
          running={running}
          onRun={() => run("Reports list", "/api/v1/export/reports", { ...periodParams, limit: 20 })}
        />

        <EndpointCard
          method="GET"
          path="/api/v1/export/reports/{id}/download"
          title="Download report file"
          description="Returns goAML-style XML or CSV generated by the reporting engine."
          running={running}
          onRun={() => {
            if (!reportId.trim()) {
              setLastResult({
                label: "Download",
                result: { ok: false, status: 0, durationMs: 0, error: "Enter a report ID from the list call.", url: "" },
              });
              return;
            }
            run("Download", `/api/v1/export/reports/${encodeURIComponent(reportId.trim())}/download`, { format: "xml" });
          }}
          controls={
            <label className="text-xs text-content-muted">
              Report ID
              <input className="input mt-1 w-full font-mono text-sm" value={reportId} onChange={(e) => setReportId(e.target.value)} />
            </label>
          }
        />
      </div>

      {lastResult && (
        <div className="mt-6">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-content">
            {lastResult.result.ok ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <ArrowDownToLine className="h-4 w-4 text-brand" />
            )}
            Response — {lastResult.label}
          </h3>
          <ResponsePanel result={lastResult} />
        </div>
      )}

      <InfoCallout title="For Nova Bank middleware engineers">
        Run extraction in the portal first (or enable scheduled ETL), then pull the same date range here.
        Each transaction includes <code>nfiu_payload</code> with originator, beneficiary, amounts, and report flags.
        Official goAML XSD validation will be added when NFIU provides the specification.
      </InfoCallout>
    </div>
  );
}

function EndpointCard({
  method,
  path,
  title,
  description,
  running,
  onRun,
  controls,
}: {
  method: string;
  path: string;
  title: string;
  description: string;
  running: boolean;
  onRun: () => void;
  controls?: ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Tag color="purple">{method}</Tag>
            <code className="truncate text-xs text-content-muted">{path}</code>
          </div>
          <h3 className="mt-2 font-semibold text-content">{title}</h3>
          <p className="mt-1 text-sm text-content-muted">{description}</p>
          {controls && <div className="mt-3 max-w-sm">{controls}</div>}
        </div>
        <button type="button" className="btn-primary shrink-0" disabled={running} onClick={onRun}>
          <Play className="h-4 w-4" />
          Try it
        </button>
      </div>
    </div>
  );
}
