import { useEffect, useState } from "react";
import { ArrowRight, Play, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnimatePresence } from "motion/react";
import { ArrowField } from "../components/ArrowField";
import { ExtractionProgressBanner } from "../components/ExtractionProgressBanner";
import { ExtractionRunModal } from "../components/ExtractionRunModal";
import { AnimatedNumber, StaggerItem } from "../components/motion";
import { reviewState, TransactionFlags } from "../components/TransactionFlags";
import { type BadgeTone, EmptyState, LoadingGrid, MetricPill, SectionHeading, StatusBadge } from "../components/ui";
import { ReviewBadge } from "../components/workbench";
import { api, DashboardStats, DtdFeedStatus, ExtractionLog, StagingTransaction } from "../lib/api";
import type { ExtractionRunParams } from "../lib/dates";
import { progressLabel } from "../lib/extractionProgress";
import { actionLabel, channelLabel, formatCurrency, formatDate, formatDateRange, formatNumber, formatRelative } from "../lib/format";
import { canRunEtl, extractModeLabel, extractSourceLabel } from "../lib/roles";
import { useAuth } from "../lib/auth";
import { useLiveRefresh, useLiveStatus } from "../lib/live";

/** 1px dividers for the 2×2 alert board (stacked on phones). */
const COUNTER_BORDERS = ["", "border-t sm:border-l sm:border-t-0", "border-t", "border-t sm:border-l"];

/** Chart palette: indigo, emerald, amber, plus slate for the fourth series. */
const CHART = { indigo: "#4F46E5", emerald: "#10B981", amber: "#F59E0B", slate: "#94A3B8" };

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  boxShadow: "0 8px 24px -12px rgba(15,23,42,0.25)",
  fontSize: 12,
};

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [dtd, setDtd] = useState<DtdFeedStatus | null>(null);
  const [queue, setQueue] = useState<StagingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<ExtractionLog[]>([]);

  const firstName = user?.full_name?.split(" ")[0] ?? "there";
  const liveStatus = useLiveStatus();
  const today = new Intl.DateTimeFormat("en-NG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Lagos",
  }).format(new Date());

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [stats, feed, rows] = await Promise.all([
        api.dashboard(),
        api.dtdStatus().catch(() => null),
        api.transactions(false, undefined, 200).catch(() => [] as StagingTransaction[]),
      ]);
      setData(stats);
      setDtd(feed);
      // Review queue: rows that need attention, newest first.
      setQueue(
        rows
          .filter((tx) => reviewState(tx) !== "verified")
          .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
          .slice(0, 6),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const liveRunId =
    data?.pipeline_status === "running" || data?.last_extraction?.status === "running"
      ? data?.last_extraction?.id ?? null
      : null;

  const tick = async () => {
    if (!liveRunId) return;
    try {
      const [updated, logs] = await Promise.all([api.getRun(liveRunId), api.runLogs(liveRunId)]);
      setRunLogs(logs);
      setProgressMessage(progressLabel(logs, null));
      setData((prev) =>
        prev
          ? {
              ...prev,
              pipeline_status: updated.status,
              last_extraction: updated,
            }
          : prev,
      );
      if (updated.status !== "running") {
        setStarting(false);
        setRunning(false);
        await load(true);
      }
    } catch {
      /* run may not exist yet */
    }
  };

  useEffect(() => {
    if (!liveRunId) {
      if (!starting) setRunning(false);
      return;
    }
    setRunning(true);
    void tick();
  }, [liveRunId]);

  // Progress arrives as live change hints for this run; polling only while the socket is down.
  useLiveRefresh(["extraction.run", "extraction.log"], tick, { enabled: Boolean(liveRunId), match: liveRunId, fallbackMs: 2000 });
  // Runs started elsewhere (another user, the scheduler) and new activity refresh the overview.
  useLiveRefresh(["extraction.run", "audit", "report", "dtd.run", "dtd.state"], () => load(true), { enabled: !liveRunId });

  const runPipeline = async (params: ExtractionRunParams) => {
    setStarting(true);
    setRunning(true);
    setProgressMessage("Starting extraction…");
    try {
      const run = await api.runEtl(params);
      setExtractOpen(false);
      setData((prev) => (prev ? { ...prev, pipeline_status: "running", last_extraction: run } : prev));
    } catch {
      setStarting(false);
      setRunning(false);
      setProgressMessage(null);
    }
  };

  const dq = data?.data_quality;
  const staged = data?.total_staged_transactions ?? 0;
  const validTone: BadgeTone = !dq ? "neutral" : dq.validation_rate >= 95 ? "positive" : dq.validation_rate >= 80 ? "warning" : "negative";

  const channelData = Object.entries(dq?.by_channel ?? {})
    .map(([channel, count]) => ({ name: channelLabel(channel), count }))
    .sort((a, b) => b.count - a.count);

  const flagData = [
    { name: "CTR", value: dq?.ctr_eligible ?? 0, color: CHART.indigo },
    { name: "FTR", value: dq?.ftr_eligible ?? 0, color: CHART.emerald },
    { name: "PEP", value: dq?.pep_eligible ?? 0, color: CHART.amber },
    { name: "STR", value: dq?.str_eligible ?? 0, color: CHART.slate },
  ];
  const flagTotal = flagData.reduce((sum, f) => sum + f.value, 0);
  // Flags per 100 staged rows (a row can carry more than one flag).
  const flagRate = staged ? Math.round((flagTotal / staged) * 1000) / 10 : 0;

  const alertCounters: Array<{ label: string; value: number; dot: string; note: string; badge?: { label: string; tone: BadgeTone } }> = [
    {
      label: "Flags raised",
      value: flagTotal,
      dot: "bg-red-600",
      note: `CTR, FTR, PEP and STR across ${formatNumber(staged)} staged rows`,
      badge: { label: `${flagRate}% flag rate`, tone: flagTotal > 0 ? "negative" : "neutral" },
    },
    {
      label: "Pending reviews",
      value: data?.pending_reports ?? 0,
      dot: "bg-amber-600",
      note: "Regulatory reports awaiting approval",
      badge: { label: `${formatNumber(data?.submitted_reports ?? 0)} submitted`, tone: (data?.pending_reports ?? 0) > 0 ? "warning" : "positive" },
    },
    {
      label: "Failed checks",
      value: dq?.invalid_records ?? 0,
      dot: "bg-amber-600",
      note: staged > 0 ? `${dq?.validation_rate ?? 0}% of staged rows pass validation` : "No staged rows yet",
      badge: staged > 0 ? { label: `${dq?.validation_rate ?? 0}% valid`, tone: validTone } : undefined,
    },
    {
      label: "Today's Finacle volume",
      value: dtd?.staged_today ?? 0,
      dot: "bg-blue-800",
      note: dtd ? (dtd.enabled ? `Same-day feed running every ${dtd.interval_minutes} min` : "Same-day feed stopped") : "Same-day feed unavailable",
      badge: dtd ? { label: `${formatNumber(dtd.new_today)} new today`, tone: "info" } : undefined,
    },
  ];

  return (
    <div>
      {/* Hero: the arrow field melts into the page canvas at the bottom. */}
      <StaggerItem className="-mx-6 -mt-8 mb-12 sm:mx-0 sm:mt-0">
        <ArrowField
          fadeTo="#F8FAFC"
          fadeStart={0.7}
          glowAt={{ x: 0.5, y: 0.4 }}
          className="px-6 pb-24 pt-5 sm:rounded-t-xl sm:px-10"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-white/85">
            <span>
              {today} <span className="text-white/50">|</span> Lagos
              {data && (
                <>
                  {" "}
                  <span className="text-white/50">|</span> Finacle {extractModeLabel(data.finacle_mode)}
                </>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5" aria-live="polite">
              <span
                className={`h-1.5 w-1.5 rounded-full ${liveStatus === "open" ? "status-live bg-emerald-300" : "bg-amber-300"}`}
                aria-hidden
              />
              {liveStatus === "open" ? "Live" : "Reconnecting"}
            </span>
          </div>
          <div className="mx-auto flex max-w-2xl flex-col items-center py-14 text-center sm:py-16">
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">Hello, {firstName}</h1>
            <p className="mt-3 max-w-md text-lg font-medium leading-snug text-white">
              Everything staged, flagged and due on Nova Bank&apos;s books today.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {canRunEtl(user?.role) && (
                <button className="btn-accent h-11 px-5" onClick={() => setExtractOpen(true)} disabled={running}>
                  {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {running ? "Extraction running" : "Run extraction"}
                </button>
              )}
              <button className="btn-on-blue h-11 px-5" onClick={() => load(true)}>
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>
        </ArrowField>
      </StaggerItem>

      <ExtractionRunModal
        open={extractOpen}
        onClose={() => !running && setExtractOpen(false)}
        onRun={runPipeline}
        finacleMode={data?.finacle_mode}
        running={running}
        progressMessage={progressMessage}
      />

      <AnimatePresence>
        {running && (
          <ExtractionProgressBanner
            key="extraction-progress"
            running={running}
            run={data?.last_extraction}
            logs={runLogs}
            fallbackMessage={progressMessage}
          />
        )}
      </AnimatePresence>

      {loading ? (
        <LoadingGrid />
      ) : data && dq ? (
        <>
          <SectionHeading title="On the books">
            Live alert counters first, then the rows behind them. Inspection details sit on the right.
          </SectionHeading>
          {/* Asymmetric split: the heavy alert board (8) leads; lighter inspection cards (4) follow. */}
          <div className="mb-12 grid grid-cols-12 gap-6">
            <StaggerItem className="card col-span-12 overflow-hidden xl:col-span-8">
              <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
                <p className="caps-label flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${liveStatus === "open" ? "status-live bg-emerald-600" : "bg-amber-600"}`}
                    aria-hidden
                  />
                  Compliance alerts
                </p>
                <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover">
                  Open transactions
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2">
                {alertCounters.map((counter, i) => (
                  <div
                    key={counter.label}
                    className={`border-border p-6 ${COUNTER_BORDERS[i]}`}
                  >
                    <dt className="caps-label flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${counter.dot}`} aria-hidden />
                      {counter.label}
                    </dt>
                    <dd className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
                      <span className="text-[44px] font-bold leading-none tracking-tight text-content tabular-nums">
                        <AnimatedNumber value={counter.value} />
                      </span>
                      {counter.badge && <MetricPill tone={counter.badge.tone}>{counter.badge.label}</MetricPill>}
                    </dd>
                    <p className="mt-2 text-xs text-content-muted">{counter.note}</p>
                  </div>
                ))}
              </dl>

              <div className="border-t border-border">
                <div className="flex items-center justify-between gap-4 px-6 pb-2 pt-5">
                  <h3 className="caps-label">Review queue</h3>
                  <span className="text-xs text-content-subtle">Newest flagged or failed rows</span>
                </div>
                {queue.length === 0 ? (
                  <p className="px-6 pb-6 pt-2 text-sm text-content-muted">
                    Nothing waiting. Flagged or failed staging rows will queue here.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th className="text-right">Amount</th>
                          <th>Flags</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queue.map((tx) => (
                          <tr key={tx.id}>
                            <td>
                              <Link to={`/reports?q=${encodeURIComponent(tx.finacle_ref)}`} className="font-mono text-xs text-content hover:text-brand">
                                {tx.finacle_ref}
                              </Link>
                              <p className="text-xs text-content-subtle">{formatDate(tx.transaction_date)}</p>
                            </td>
                            <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatCurrency(tx.amount, tx.currency)}</td>
                            <td>
                              <TransactionFlags tx={tx} />
                            </td>
                            <td>
                              <ReviewBadge state={reviewState(tx)} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </StaggerItem>

            <div className="col-span-12 flex flex-col gap-6 xl:col-span-4">
              <StaggerItem className="card p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="caps-label">Last extract</h3>
                  {data.last_extraction && <StatusBadge status={data.last_extraction.status} />}
                </div>
                {data.last_extraction ? (
                  <dl className="mt-3 divide-y divide-border text-sm">
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-content-muted">Period</dt>
                      <dd className="text-right font-medium text-content">{formatDateRange(data.last_extraction.date_from, data.last_extraction.date_to)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-content-muted">Source</dt>
                      <dd className="text-right font-medium text-content">{extractSourceLabel(data.last_extraction.source)}</dd>
                    </div>
                    <div className="flex justify-between gap-3 py-2.5">
                      <dt className="text-content-muted">Valid / invalid</dt>
                      <dd className="text-right font-medium tabular-nums text-content">
                        {formatNumber(data.last_extraction.records_valid)} / {formatNumber(data.last_extraction.records_invalid)}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-content-muted">No extraction has run yet.</p>
                )}
                <Link to="/extraction" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover">
                  Extraction runs
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </StaggerItem>

              <StaggerItem className="card p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="caps-label">Same-day feed</h3>
                  <StatusBadge status={dtd?.enabled ? "active" : "idle"} />
                </div>
                <dl className="mt-3 divide-y divide-border text-sm">
                  <div className="flex justify-between gap-3 py-2.5">
                    <dt className="text-content-muted">Pulls today</dt>
                    <dd className="text-right font-medium tabular-nums text-content">{formatNumber(dtd?.pulls_today ?? 0)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 py-2.5">
                    <dt className="text-content-muted">Last success</dt>
                    <dd className="text-right font-medium text-content">{dtd?.last_success_at ? formatRelative(dtd.last_success_at) : "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3 py-2.5">
                    <dt className="text-content-muted">Validation rate</dt>
                    <dd className="text-right font-medium tabular-nums text-content">{staged > 0 ? `${dq.validation_rate}%` : "—"}</dd>
                  </div>
                </dl>
                <Link to="/daily" className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover">
                  Daily feed
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </StaggerItem>
            </div>
          </div>

          <SectionHeading title="On the radar">
            Which payment channels the staged volume comes from, and which regulatory reports it triggers.
          </SectionHeading>
          <div className="mb-12 grid grid-cols-12 gap-6">
            <StaggerItem className="card col-span-12 p-6 xl:col-span-8">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-content">Volume by channel</h2>
                  <p className="text-sm text-content-muted">Staged Finacle transactions per payment channel</p>
                </div>
                <StatusBadge status={data.pipeline_status} />
              </div>
              {channelData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#E2E8F0" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#64748B" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip cursor={{ fill: "rgba(79,70,229,0.06)" }} contentStyle={tooltipStyle} />
                      <Bar dataKey="count" name="Transactions" fill={CHART.indigo} radius={[6, 6, 0, 0]} maxBarSize={36} animationDuration={700} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 text-sm text-content-muted">
                  No channel volume until an extraction completes.
                </div>
              )}
            </StaggerItem>

            <StaggerItem className="card col-span-12 p-6 xl:col-span-4">
              <h2 className="font-semibold text-content">Report flags</h2>
              <p className="text-sm text-content-muted">CTR, FTR, PEP and STR across staged rows</p>
              <div className="relative mx-auto mt-4 h-48 w-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={flagTotal > 0 ? flagData : [{ name: "none", value: 1, color: "#E2E8F0" }]}
                      dataKey="value"
                      innerRadius={62}
                      outerRadius={88}
                      paddingAngle={flagTotal > 0 ? 2 : 0}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      animationDuration={700}
                    >
                      {(flagTotal > 0 ? flagData : [{ color: "#E2E8F0" }]).map((f, i) => (
                        <Cell key={i} fill={f.color} />
                      ))}
                    </Pie>
                    {flagTotal > 0 && <Tooltip contentStyle={tooltipStyle} />}
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold tracking-tight text-content">
                    <AnimatedNumber value={flagTotal} />
                  </span>
                  <span className="text-xs text-content-muted">flagged</span>
                </div>
              </div>
              <ul className="mt-5 space-y-2">
                {flagData.map((f) => (
                  <li key={f.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-content-muted">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: f.color }} aria-hidden />
                      {f.name}
                    </span>
                    <span className="font-medium tabular-nums text-content">{formatNumber(f.value)}</span>
                  </li>
                ))}
              </ul>
            </StaggerItem>
          </div>

          <SectionHeading title="On the record">
            Every action taken in the portal, as it happens.
          </SectionHeading>
          <StaggerItem className="card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
              <h3 className="caps-label">Recent activity</h3>
              <Link to="/audit" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-hover">
                Audit trail
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {data.recent_audit.length === 0 ? (
              <p className="px-6 py-6 text-sm text-content-muted">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.recent_audit.slice(0, 8).map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-4 px-6 py-3 transition-colors hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-content">{actionLabel(e.action)}</p>
                      <p className="truncate text-xs text-content-muted">{e.actor_name}</p>
                    </div>
                    <span className="shrink-0 text-xs text-content-subtle">{formatRelative(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </StaggerItem>

          {staged === 0 && canRunEtl(user?.role) && (
            <StaggerItem className="card mt-6">
              <EmptyState
                icon={Play}
                title="No data yet"
                description="Run a Finacle extraction to populate the staging warehouse."
                action={
                  <button className="btn-primary" onClick={() => setExtractOpen(true)} disabled={running}>
                    Run extraction
                  </button>
                }
              />
            </StaggerItem>
          )}
        </>
      ) : null}
    </div>
  );
}
