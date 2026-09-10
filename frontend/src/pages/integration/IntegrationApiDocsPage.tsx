import { ArrowRight, BookOpen, KeyRound, Layers, Play, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DatePickerField } from "../../components/DatePickerField";
import { ApiCopyButton } from "../../components/integration/ApiCopyButton";
import { ApiResponsePanel } from "../../components/integration/ApiResponsePanel";
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
import { buildExportCurl, loadPartnerApiKey, partnerGet, savePartnerApiKey, type PartnerRequestResult } from "../../lib/partnerApi";

type ReportFilter = "" | "CTR" | "FTR" | "PEP" | "STR";

type EndpointSection = "start" | "transactions" | "reports";

interface EndpointDef {
  id: string;
  section: EndpointSection;
  method: "GET";
  path: string;
  title: string;
  description: string;
  params?: { name: string; required?: boolean; hint: string }[];
  run: () => Promise<void>;
  controls?: ReactNode;
}

const SECTION_LABELS: Record<EndpointSection, { label: string; accent: string }> = {
  start: { label: "Getting started", accent: "from-violet-500 to-indigo-500" },
  transactions: { label: "Transactions", accent: "from-cyan-500 to-blue-500" },
  reports: { label: "Reports", accent: "from-amber-500 to-orange-500" },
};

function defaultRange(): { from: CalendarDate; to: CalendarDate } {
  const saved = loadSavedRange();
  if (saved) return { from: saved.from, to: saved.to };
  return presetRange("last7");
}

function MethodBadge() {
  return (
    <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
      GET
    </span>
  );
}

export function IntegrationApiDocsPage() {
  const { user } = useAuth();
  const [info, setInfo] = useState<IntegrationInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [apiKey, setApiKey] = useState(() => loadPartnerApiKey());
  const [showKey, setShowKey] = useState(false);
  const [periodFrom, setPeriodFrom] = useState<CalendarDate>(() => defaultRange().from);
  const [periodTo, setPeriodTo] = useState<CalendarDate>(() => defaultRange().to);
  const [reportType, setReportType] = useState<ReportFilter>("CTR");
  const [finacleRef, setFinacleRef] = useState("");
  const [reportId, setReportId] = useState("");
  const [activeId, setActiveId] = useState("verify");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, PartnerRequestResult>>({});

  useEffect(() => {
    api.integrationInfo().then(setInfo).catch((e) => setLoadError(String(e.message)));
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

  const execute = async (id: string, path: string, params?: Record<string, string | number | boolean | undefined>) => {
    setActiveId(id);
    if (!apiKey.trim()) {
      setResponses((prev) => ({
        ...prev,
        [id]: { ok: false, status: 0, durationMs: 0, error: "Add your API key in the sidebar first.", url: path },
      }));
      return;
    }
    setRunningId(id);
    try {
      const result = await partnerGet(path, apiKey.trim(), params);
      setResponses((prev) => ({ ...prev, [id]: result }));
    } finally {
      setRunningId(null);
    }
  };

  const endpoints: EndpointDef[] = [
    {
      id: "verify",
      section: "start",
      method: "GET",
      path: "/api/v1/export/verify",
      title: "Verify API key",
      description: "Start here. Confirms your key is valid and returns the registered client name.",
      run: async () => execute("verify", "/api/v1/export/verify"),
    },
    {
      id: "summary",
      section: "start",
      method: "GET",
      path: "/api/v1/export/summary",
      title: "Export summary",
      description: "Counts of valid and report-eligible transactions for your selected period.",
      params: [
        { name: "period_start", required: true, hint: "ISO 8601 start" },
        { name: "period_end", required: true, hint: "ISO 8601 end" },
      ],
      run: async () => execute("summary", "/api/v1/export/summary", periodParams),
    },
    {
      id: "transactions",
      section: "transactions",
      method: "GET",
      path: "/api/v1/export/transactions",
      title: "Pull translated transactions",
      description: "Primary endpoint. Returns paginated records with full nfiu_payload for NFIU filing.",
      params: [
        { name: "period_start", required: true, hint: "Match extraction dates" },
        { name: "period_end", required: true, hint: "Match extraction dates" },
        { name: "report_type", hint: "CTR | FTR | PEP | STR" },
        { name: "limit", hint: "Max 500 (default 100)" },
        { name: "offset", hint: "Pagination offset" },
      ],
      run: async () =>
        execute("transactions", "/api/v1/export/transactions", {
          ...periodParams,
          report_type: reportType || undefined,
          valid_only: true,
          limit: 25,
          offset: 0,
        }),
      controls: (
        <select className="input w-full text-sm" value={reportType} onChange={(e) => setReportType(e.target.value as ReportFilter)}>
          <option value="">All valid transactions</option>
          <option value="CTR">CTR eligible only</option>
          <option value="FTR">FTR eligible only</option>
          <option value="PEP">PEP eligible only</option>
          <option value="STR">STR eligible only</option>
        </select>
      ),
    },
    {
      id: "transaction-one",
      section: "transactions",
      method: "GET",
      path: "/api/v1/export/transactions/{finacle_ref}",
      title: "Single transaction",
      description: "Lookup one staged transaction by Finacle reference.",
      run: async () => {
        if (!finacleRef.trim()) {
          setResponses((prev) => ({
            ...prev,
            "transaction-one": { ok: false, status: 0, durationMs: 0, error: "Enter a finacle_ref below.", url: "" },
          }));
          return;
        }
        await execute("transaction-one", `/api/v1/export/transactions/${encodeURIComponent(finacleRef.trim())}`);
      },
      controls: (
        <input
          className="input w-full font-mono text-sm"
          placeholder="e.g. HTD123456"
          value={finacleRef}
          onChange={(e) => setFinacleRef(e.target.value)}
        />
      ),
    },
    {
      id: "reports",
      section: "reports",
      method: "GET",
      path: "/api/v1/export/reports",
      title: "List reports",
      description: "Regulatory reports generated in the portal, ready for download.",
      run: async () => execute("reports", "/api/v1/export/reports", { ...periodParams, limit: 20 }),
    },
    {
      id: "download",
      section: "reports",
      method: "GET",
      path: "/api/v1/export/reports/{id}/download",
      title: "Download report file",
      description: "Returns goAML-style XML or CSV. Use report ID from the list endpoint.",
      params: [{ name: "format", hint: "xml or csv" }],
      run: async () => {
        if (!reportId.trim()) {
          setResponses((prev) => ({
            ...prev,
            download: { ok: false, status: 0, durationMs: 0, error: "Enter a report ID from the list call.", url: "" },
          }));
          return;
        }
        await execute("download", `/api/v1/export/reports/${encodeURIComponent(reportId.trim())}/download`, {
          format: "xml",
        });
      },
      controls: (
        <input
          className="input w-full font-mono text-sm"
          placeholder="Report UUID"
          value={reportId}
          onChange={(e) => setReportId(e.target.value)}
        />
      ),
    },
  ];

  const active = endpoints.find((e) => e.id === activeId) ?? endpoints[0];
  const activeResponse = responses[activeId] ?? null;

  const scrollTo = (id: string) => {
    setActiveId(id);
    document.getElementById(`endpoint-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="pb-12">
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-violet-600 via-brand to-cyan-600 p-[1px] shadow-lg">
        <div className="rounded-[15px] bg-surface-raised/95 p-6 backdrop-blur-sm dark:bg-surface-raised/90 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                <Sparkles className="h-3.5 w-3.5" />
                Nova Export API v1
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-content sm:text-3xl">Pull translated compliance data</h1>
              <p className="mt-2 max-w-2xl text-sm text-content-muted">
                Finacle transactions are extracted, validated, and translated by the sidecar. Your team pulls NFIU-ready
                payloads — no push or ingest required.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {info && (
                <a href={info.openapi_url} target="_blank" rel="noreferrer" className="btn-secondary">
                  <BookOpen className="h-4 w-4" />
                  OpenAPI spec
                </a>
              )}
              {user?.role === "admin" && (
                <Link to="/integration/keys" className="btn-primary">
                  <KeyRound className="h-4 w-4" />
                  Get API key
                </Link>
              )}
            </div>
          </div>
          {info && (
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-violet-200/60 bg-violet-50/80 p-3 dark:border-violet-500/20 dark:bg-violet-500/5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400">Base URL</p>
                <p className="mt-1 truncate font-mono text-sm text-content">{info.base_url}</p>
              </div>
              <div className="rounded-xl border border-cyan-200/60 bg-cyan-50/80 p-3 dark:border-cyan-500/20 dark:bg-cyan-500/5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Auth header</p>
                <p className="mt-1 font-mono text-sm text-content">X-API-Key</p>
              </div>
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Finacle mode</p>
                <p className="mt-1 text-sm font-semibold capitalize text-content">{info.finacle_mode}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {loadError && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{loadError}</div>
      )}

      {/* Quick start */}
      <div className="card mb-8 overflow-hidden">
        <div className="border-b border-border bg-gradient-to-r from-brand/5 via-transparent to-cyan-500/5 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-content">
            <Zap className="h-4 w-4 text-brand" />
            Quick start — 3 steps
          </h2>
        </div>
        <div className="grid gap-0 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { n: 1, title: "Run extraction", body: "Dashboard → Run extraction (same dates you'll pull).", color: "text-violet-600" },
            { n: 2, title: "Add API key", body: "Paste your nova_… key in the sidebar credentials panel.", color: "text-cyan-600" },
            { n: 3, title: "Verify → Pull", body: "Try Verify, then Summary, then Pull transactions.", color: "text-amber-600" },
          ].map((step) => (
            <div key={step.n} className="flex gap-3 p-5">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-overlay text-sm font-bold ${step.color}`}>
                {step.n}
              </span>
              <div>
                <p className="font-semibold text-content">{step.title}</p>
                <p className="mt-1 text-sm text-content-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)_minmax(320px,380px)]">
        {/* Sidebar nav + credentials */}
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <div className="card overflow-hidden">
            <div className="border-b border-border bg-gradient-to-r from-brand/10 to-transparent px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">Credentials</p>
            </div>
            <div className="space-y-3 p-4">
              <label className="block text-xs font-medium text-content-muted">
                API key
                <div className="relative mt-1">
                  <input
                    className="input w-full pr-16 font-mono text-xs"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => persistKey(e.target.value)}
                    placeholder="nova_…"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-brand"
                    onClick={() => setShowKey((v) => !v)}
                  >
                    {showKey ? "Hide" : "Show"}
                  </button>
                </div>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <DatePickerField label="From" value={periodFrom} onChange={setPeriodFrom} max={periodTo} />
                <DatePickerField label="To" value={periodTo} onChange={setPeriodTo} min={periodFrom} />
              </div>
              <p className="text-[11px] leading-relaxed text-content-subtle">
                Period: {formatCalendarDateLabel(periodFrom)} – {formatCalendarDateLabel(periodTo)}
              </p>
            </div>
          </div>

          <nav className="card overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">Endpoints</p>
            </div>
            <div className="p-2">
              {(["start", "transactions", "reports"] as EndpointSection[]).map((section) => (
                <div key={section} className="mb-2">
                  <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-content-subtle">
                    {SECTION_LABELS[section].label}
                  </p>
                  {endpoints
                    .filter((e) => e.section === section)
                    .map((ep) => (
                      <button
                        key={ep.id}
                        type="button"
                        onClick={() => scrollTo(ep.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                          activeId === ep.id ? "bg-brand/10 font-medium text-brand" : "text-content-muted hover:bg-surface-overlay hover:text-content"
                        }`}
                      >
                        <MethodBadge />
                        <span className="truncate">{ep.title}</span>
                        {responses[ep.id]?.ok && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-success" />}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </nav>
        </aside>

        {/* Endpoint reference */}
        <main className="min-w-0 space-y-6">
          {endpoints.map((ep) => {
            const curl = buildExportCurl(
              ep.path.replace("{finacle_ref}", finacleRef || "FINACLE_REF").replace("{id}", reportId || "REPORT_ID"),
              apiKey,
              ep.id === "verify"
                ? undefined
                : ep.id === "transaction-one" || ep.id === "download"
                  ? undefined
                  : ep.id === "transactions"
                    ? { ...periodParams, report_type: reportType || undefined, limit: 25 }
                    : { ...periodParams, limit: 20 },
            );

            return (
              <section
                key={ep.id}
                id={`endpoint-${ep.id}`}
                className={`card scroll-mt-4 overflow-hidden transition ring-2 ${
                  activeId === ep.id ? "ring-brand/30" : "ring-transparent"
                }`}
                onFocus={() => setActiveId(ep.id)}
              >
                <div className={`h-1 bg-gradient-to-r ${SECTION_LABELS[ep.section].accent}`} />
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <MethodBadge />
                    <code className="rounded-lg bg-surface-overlay px-2 py-1 font-mono text-xs text-content">{ep.path}</code>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-content">{ep.title}</h3>
                  <p className="mt-1 text-sm text-content-muted">{ep.description}</p>

                  {ep.params && (
                    <div className="mt-4 overflow-hidden rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="bg-surface-overlay/80 text-left text-content-muted">
                          <tr>
                            <th className="px-3 py-2 font-medium">Parameter</th>
                            <th className="px-3 py-2 font-medium">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {ep.params.map((p) => (
                            <tr key={p.name}>
                              <td className="px-3 py-2 font-mono text-content">
                                {p.name}
                                {p.required && <span className="ml-1 text-danger">*</span>}
                              </td>
                              <td className="px-3 py-2 text-content-muted">{p.hint}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {ep.controls && <div className="mt-4 max-w-md">{ep.controls}</div>}

                  <div className="mt-4 overflow-hidden rounded-lg border border-border bg-[#0d1117]">
                    <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Example request</span>
                      <ApiCopyButton text={curl} label="Copy cURL" />
                    </div>
                    <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-slate-400">{curl}</pre>
                  </div>

                  <button
                    type="button"
                    className="btn-primary mt-4"
                    disabled={runningId === ep.id}
                    onClick={() => {
                      setActiveId(ep.id);
                      ep.run();
                    }}
                  >
                    <Play className="h-4 w-4" />
                    {runningId === ep.id ? "Sending…" : "Send request"}
                  </button>

                  {responses[ep.id] && activeId === ep.id && (
                    <div className="mt-4 xl:hidden">
                      <ApiResponsePanel result={responses[ep.id]} />
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </main>

        {/* Sticky response panel (desktop) */}
        <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-emerald-500/10 to-transparent px-4 py-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
                <Layers className="h-3.5 w-3.5" />
                Live response
              </p>
              {active && <span className="text-xs text-content-subtle">{active.title}</span>}
            </div>
            <div className="p-4">
              <ApiResponsePanel result={activeResponse} />
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-gradient-to-br from-brand/5 to-cyan-500/5 p-4 text-sm">
            <p className="font-semibold text-content">Need a key?</p>
            <p className="mt-1 text-xs text-content-muted">Admins create keys under Integration → API Keys.</p>
            <Link to="/integration/keys" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
              Manage keys <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
