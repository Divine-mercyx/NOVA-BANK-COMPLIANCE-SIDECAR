import { ArrowRight, BookOpen, KeyRound, Play } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { DatePickerField } from "../../components/DatePickerField";
import { ApiCopyButton } from "../../components/integration/ApiCopyButton";
import { ApiResponsePanel } from "../../components/integration/ApiResponsePanel";
import { PageHeader } from "../../components/ui";
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

type EndpointSection = "start" | "transactions" | "dtd" | "reports";

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

const SECTION_LABELS: Record<EndpointSection, string> = {
  start: "Getting started",
  transactions: "Transactions",
  dtd: "Daily DTD",
  reports: "Reports",
};

function defaultRange(): { from: CalendarDate; to: CalendarDate } {
  const saved = loadSavedRange();
  if (saved) return { from: saved.from, to: saved.to };
  return presetRange("last7");
}

function MethodBadge() {
  return (
    <span className="border border-border bg-surface-overlay px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-content-muted">
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
  const [finacleRef, setFinacleRef] = useState("");
  const [reportId, setReportId] = useState("");
  const [pullLimit, setPullLimit] = useState("");
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
    return { date_from, date_to };
  }, [periodFrom, periodTo]);

  const parsedPullLimit = useMemo(() => {
    const trimmed = pullLimit.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return Math.floor(n);
  }, [pullLimit]);

  const transactionQuery = useMemo(
    () => ({ ...periodParams, limit: parsedPullLimit, offset: 0 }),
    [periodParams, parsedPullLimit],
  );

  const dtdQuery = useMemo(() => {
    const date = `${periodFrom.year}-${String(periodFrom.month).padStart(2, "0")}-${String(periodFrom.day).padStart(2, "0")}`;
    return { date, limit: parsedPullLimit };
  }, [periodFrom, parsedPullLimit]);

  const persistKey = (value: string) => {
    setApiKey(value);
    savePartnerApiKey(value);
  };

  const execute = async (id: string, path: string, params?: Record<string, string | number | boolean | undefined>) => {
    setActiveId(id);
    if (!apiKey.trim()) {
      setResponses((prev) => ({
        ...prev,
        [id]: { ok: false, status: 0, durationMs: 0, error: "Add your API key in the credentials bar first.", url: path },
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
        { name: "date_from", required: true, hint: "YYYY-MM-DD or ISO datetime" },
        { name: "date_to", required: true, hint: "Inclusive end date" },
      ],
      run: async () => execute("summary", "/api/v1/export/summary", periodParams),
    },
    {
      id: "transactions",
      section: "transactions",
      method: "GET",
      path: "/api/v1/export/transactions",
      title: "All staged transactions",
      description:
        "Every staged Finacle transaction in the date range, in the NFIU sample-data column layout (same as CTR).",
      params: [
        { name: "date_from", required: true, hint: "YYYY-MM-DD or ISO datetime" },
        { name: "date_to", required: true, hint: "Inclusive end date" },
        { name: "limit", hint: "Optional. Omit for all rows (server cap 50,000). Fewer matches still return." },
        { name: "offset", hint: "Pagination offset (default 0)" },
      ],
      run: async () => execute("transactions", "/api/v1/export/transactions", transactionQuery),
    },
    {
      id: "transactions-ctr",
      section: "transactions",
      method: "GET",
      path: "/api/v1/export/transactions/ctr",
      title: "CTR ₦5m and above",
      description:
        "Same NFIU columns as the full pull, filtered to NGN rows with amount ≥ ₦5,000,000.",
      params: [
        { name: "date_from", required: true, hint: "YYYY-MM-DD or ISO datetime" },
        { name: "date_to", required: true, hint: "Inclusive end date" },
        { name: "limit", hint: "Optional. Omit for all CTR rows (server cap 50,000)." },
        { name: "offset", hint: "Pagination offset (default 0)" },
      ],
      run: async () => execute("transactions-ctr", "/api/v1/export/transactions/ctr", transactionQuery),
    },
    {
      id: "transaction-one",
      section: "transactions",
      method: "GET",
      path: "/api/v1/export/transactions/{finacle_ref}",
      title: "Single transaction",
      description: "Lookup one staged transaction by Finacle reference, in the same NFIU column layout.",
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
      id: "dtd",
      section: "dtd",
      method: "GET",
      path: "/api/v1/export/dtd",
      title: "Daily DTD (same day)",
      description:
        "Staged TBAADM.DTD for one Lagos day. Source/Dest account from GAM. Institution from DTD BANK_CODE + BANK_CODE_TABLE; null when BANK_CODE is blank.",
      params: [
        { name: "date", hint: "YYYY-MM-DD. Omit = today (Africa/Lagos). One day only — not a range." },
        { name: "limit", hint: "Optional. Omit for all rows that day (server cap 50,000)." },
      ],
      run: async () => execute("dtd", "/api/v1/export/dtd", dtdQuery),
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
      <PageHeader
        title="API documentation"
        subtitle="Export staged Finacle data. Authenticate with X-API-Key on GET /api/v1/export/*."
        actions={
          <div className="flex flex-wrap gap-2">
            {info && (
              <a href={info.openapi_url} target="_blank" rel="noreferrer" className="btn-secondary">
                <BookOpen className="h-4 w-4" />
                OpenAPI
              </a>
            )}
            {user?.role === "admin" && (
              <Link to="/integration/keys" className="btn-primary">
                <KeyRound className="h-4 w-4" />
                API keys
              </Link>
            )}
          </div>
        }
      />

      {info && (
        <dl className="mb-8 grid gap-px border border-border bg-border sm:grid-cols-3">
          <div className="bg-surface-raised px-4 py-3">
            <dt className="text-xs text-content-muted">Base URL</dt>
            <dd className="mt-1 truncate font-mono text-sm text-content">{info.base_url}</dd>
          </div>
          <div className="bg-surface-raised px-4 py-3">
            <dt className="text-xs text-content-muted">Header</dt>
            <dd className="mt-1 font-mono text-sm text-content">X-API-Key</dd>
          </div>
          <div className="bg-surface-raised px-4 py-3">
            <dt className="text-xs text-content-muted">Finacle mode</dt>
            <dd className="mt-1 text-sm capitalize text-content">{info.finacle_mode}</dd>
          </div>
        </dl>
      )}

      {loadError && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{loadError}</div>
      )}

      <div className="card mb-8 overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-content">Procedure</h2>
        </div>
        <div className="grid gap-0 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { n: "1", title: "Run extraction", body: "Dashboard or Extraction — same dates you will pull." },
            { n: "2", title: "Issue an API key", body: "Paste the nova_… key in the credentials section below." },
            { n: "3", title: "Call export", body: "Verify, then summary, then transaction or DTD pull." },
          ].map((step) => (
            <div key={step.n} className="flex gap-3 p-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-border text-xs font-semibold text-content">
                {step.n}
              </span>
              <div>
                <p className="font-medium text-content">{step.title}</p>
                <p className="mt-1 text-sm text-content-muted">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-border px-5 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-content-muted">Credentials and period</p>
        </div>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(240px,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(140px,180px)]">
          <label className="block text-xs font-medium text-content-muted">
            API key
            <div className="relative mt-2">
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
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-content-muted hover:text-content"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
          </label>
          <DatePickerField label="From" value={periodFrom} onChange={setPeriodFrom} max={periodTo} />
          <DatePickerField label="To" value={periodTo} onChange={setPeriodTo} min={periodFrom} />
          <label className="block text-xs font-medium text-content-muted">
            Row limit
            <input
              className="input mt-2 w-full font-mono text-sm"
              inputMode="numeric"
              placeholder="All"
              value={pullLimit}
              onChange={(e) => setPullLimit(e.target.value.replace(/[^\d]/g, ""))}
            />
            <span className="mt-1.5 block text-[11px] font-normal leading-relaxed text-content-subtle">
              Leave blank to fetch every matching row.
            </span>
          </label>
        </div>
        <p className="border-t border-border px-5 py-3 text-[11px] text-content-subtle">
          Period {formatCalendarDateLabel(periodFrom)} – {formatCalendarDateLabel(periodTo)} (Africa/Lagos, inclusive)
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)_minmax(320px,380px)]">
        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <nav className="card overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">Endpoints</p>
            </div>
            <div className="p-2">
              {(["start", "transactions", "dtd", "reports"] as EndpointSection[]).map((section) => (
                <div key={section} className="mb-2">
                  <p className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-content-subtle">
                    {SECTION_LABELS[section]}
                  </p>
                  {endpoints
                    .filter((e) => e.section === section)
                    .map((ep) => (
                      <button
                        key={ep.id}
                        type="button"
                        onClick={() => scrollTo(ep.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition ${
                          activeId === ep.id ? "bg-surface-overlay font-medium text-content" : "text-content-muted hover:bg-surface-overlay hover:text-content"
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
                  : ep.id === "summary"
                    ? periodParams
                  : ep.id === "dtd"
                    ? dtdQuery
                    : ep.id === "transactions" || ep.id === "transactions-ctr"
                      ? transactionQuery
                      : { ...periodParams, limit: 20 },
            );

            return (
              <section
                key={ep.id}
                id={`endpoint-${ep.id}`}
                className={`card scroll-mt-4 overflow-hidden border-l-2 ${
                  activeId === ep.id ? "border-l-content" : "border-l-transparent"
                }`}
                onFocus={() => setActiveId(ep.id)}
              >
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

                  <div className="mt-4 overflow-hidden border border-border bg-surface-overlay">
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-content-subtle">Example request</span>
                      <ApiCopyButton text={curl} label="Copy cURL" />
                    </div>
                    <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-content">{curl}</pre>
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
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">Response</p>
              {active && <span className="text-xs text-content-subtle">{active.title}</span>}
            </div>
            <div className="p-4">
              <ApiResponsePanel result={activeResponse} />
            </div>
          </div>

          <div className="mt-4 border border-border p-4 text-sm">
            <p className="font-medium text-content">API keys</p>
            <p className="mt-1 text-xs text-content-muted">Administrators issue keys under Integration → API keys.</p>
            <Link to="/integration/keys" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-content hover:underline">
              Manage keys <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
