import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileStack, Play, RefreshCw, Shield } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExtractionProgressBanner } from "../components/ExtractionProgressBanner";
import { ExtractionRunModal } from "../components/ExtractionRunModal";
import { EmptyState, FeaturedKpiCard, LoadingGrid } from "../components/ui";
import { api, DashboardStats, ExtractionLog, ExtractionRun } from "../lib/api";
import { compareLastTwo, recentRunSeries, shareOfTotal } from "../lib/dashboardMetrics";
import type { ExtractionRunParams } from "../lib/dates";
import { progressLabel } from "../lib/extractionProgress";
import { actionLabel, formatDateRange, formatNumber, formatRelative } from "../lib/format";
import { canRunEtl, extractModeLabel, extractSourceLabel } from "../lib/roles";
import { useAuth } from "../lib/auth";
import { useLiveRefresh } from "../lib/live";

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<ExtractionLog[]>([]);
  const [volumeView, setVolumeView] = useState<"channel" | "flags">("channel");

  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dashboard, runList] = await Promise.all([api.dashboard(), api.listRuns()]);
      setData(dashboard);
      setRuns(runList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const liveRunId = data?.last_extraction?.status === "running" ? data.last_extraction.id : null;

  const tickRun = useCallback(async () => {
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
  }, [liveRunId]);

  useEffect(() => {
    if (!liveRunId) {
      if (!starting) setRunning(false);
      return;
    }
    setRunning(true);
    void tickRun();
  }, [liveRunId, starting, tickRun]);

  useLiveRefresh(["extraction.run", "extraction.log"], tickRun, {
    enabled: Boolean(liveRunId),
    match: liveRunId,
    fallbackMs: running ? 2000 : undefined,
  });

  const runPipeline = async (params: ExtractionRunParams) => {
    setStarting(true);
    setRunning(true);
    setProgressMessage("Starting extraction…");
    try {
      const run = await api.runEtl(params);
      setExtractOpen(false);
      setData((prev) =>
        prev ? { ...prev, pipeline_status: "running", last_extraction: run } : prev,
      );
    } catch {
      setStarting(false);
      setRunning(false);
      setProgressMessage(null);
    }
  };

  const dq = data?.data_quality;
  const totalStaged = data?.total_staged_transactions ?? 0;
  const extractSeries = useMemo(() => recentRunSeries(runs, "records_extracted"), [runs]);
  const validSeries = useMemo(() => recentRunSeries(runs, "records_valid"), [runs]);
  const extractTrend = useMemo(() => compareLastTwo(extractSeries), [extractSeries]);
  const validTrend = useMemo(() => compareLastTwo(validSeries), [validSeries]);

  const channelChart = useMemo(() => {
    const entries = Object.entries(dq?.by_channel ?? {}).map(([channel, count]) => ({
      name: channel.replace(/_/g, " "),
      count,
    }));
    return entries.sort((a, b) => b.count - a.count);
  }, [dq?.by_channel]);

  const flagChart = useMemo(
    () =>
      dq
        ? [
            { name: "CTR", count: dq.ctr_eligible },
            { name: "FTR", count: dq.ftr_eligible },
            { name: "PEP", count: dq.pep_eligible },
            { name: "STR", count: dq.str_eligible },
          ]
        : [],
    [dq],
  );

  const activeChart = volumeView === "channel" ? channelChart : flagChart;
  const chartPeak = activeChart.reduce((max, row) => (row.count > max ? row.count : max), 0);
  const chartTitle = volumeView === "channel" ? "Volume by channel" : "Regulatory flags";
  const chartSubtitle =
    volumeView === "channel" ? "Where staged Finacle traffic sits today" : "Reportable signals across the warehouse";

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-content-subtle">Welcome back</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-content">Hello, {firstName}</h2>
          <p className="mt-1 text-sm text-content-muted">
            {data ? `Finacle ${extractModeLabel(data.finacle_mode).toLowerCase()} · compliance overview` : "Finacle extraction and staging"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => load(true)}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          {canRunEtl(user?.role) && (
            <button className="btn-primary" onClick={() => setExtractOpen(true)} disabled={running}>
              {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run extraction
            </button>
          )}
        </div>
      </div>

      <ExtractionRunModal
        open={extractOpen}
        onClose={() => !running && setExtractOpen(false)}
        onRun={runPipeline}
        finacleMode={data?.finacle_mode}
        running={running}
        progressMessage={progressMessage}
      />

      {running && (
        <ExtractionProgressBanner
          running={running}
          run={data?.last_extraction}
          logs={runLogs}
          fallbackMessage={progressMessage}
        />
      )}

      {loading ? (
        <LoadingGrid />
      ) : data ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FeaturedKpiCard
              tone="violet"
              icon={FileStack}
              label="Staged transactions"
              value={formatNumber(totalStaged)}
              sparkline={extractSeries}
              change={extractTrend?.label}
              changeUp={extractTrend?.up}
              hint={
                data.last_extraction
                  ? `Last extract ${formatDateRange(data.last_extraction.date_from, data.last_extraction.date_to)}`
                  : "Run extraction to populate"
              }
            />
            <FeaturedKpiCard
              tone="emerald"
              icon={CheckCircle2}
              label="Data quality"
              value={`${data.data_quality.validation_rate}%`}
              ringPercent={data.data_quality.validation_rate}
              sparkline={validSeries}
              change={validTrend?.label}
              changeUp={validTrend?.up ?? data.data_quality.validation_rate >= 95}
              hint={`${formatNumber(data.data_quality.valid_records)} valid · ${formatNumber(data.data_quality.invalid_records)} need review`}
            />
            <FeaturedKpiCard
              tone="blue"
              icon={Shield}
              label="CTR reportable"
              value={formatNumber(data.data_quality.ctr_eligible)}
              change={`${shareOfTotal(data.data_quality.ctr_eligible, totalStaged)}% of staged`}
              changeUp={data.data_quality.ctr_eligible > 0}
              hint={`FTR ${formatNumber(data.data_quality.ftr_eligible)} · PEP ${formatNumber(data.data_quality.pep_eligible)}`}
            />
            <FeaturedKpiCard
              tone="amber"
              icon={AlertTriangle}
              label="Reports pipeline"
              value={formatNumber(data.pending_reports)}
              hint={`${formatNumber(data.submitted_reports)} submitted to regulators`}
              change={data.pipeline_status.replace(/_/g, " ")}
              changeUp={data.pipeline_status === "success"}
            />
          </div>

          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised px-4 py-3 shadow-soft sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="theme-chip capitalize">{data.pipeline_status.replace(/_/g, " ")}</span>
              <span className="text-content-muted">
                Finacle {extractModeLabel(data.finacle_mode).toLowerCase()} · {formatNumber(data.data_quality.str_eligible)} STR candidates
              </span>
            </div>
            <Link to="/reports" className="btn-primary shrink-0 px-4 py-2 text-sm">
              Browse transactions
            </Link>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
            <div className="card p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-content">{chartTitle}</h2>
                  <p className="mt-0.5 text-sm text-content-muted">{chartSubtitle}</p>
                  {volumeView === "channel" && channelChart.length > 0 && (
                    <p className="mt-2 text-2xl font-semibold tabular-nums text-content">
                      {formatNumber(channelChart.reduce((s, r) => s + r.count, 0))}
                      <span className="ml-2 text-sm font-medium text-content-muted">records across channels</span>
                    </p>
                  )}
                </div>
                <div className="flex rounded-xl border border-border bg-surface-overlay/60 p-1 text-sm">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      volumeView === "channel" ? "bg-surface-raised text-accent shadow-soft" : "text-content-muted hover:text-content"
                    }`}
                    onClick={() => setVolumeView("channel")}
                  >
                    Channels
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      volumeView === "flags" ? "bg-surface-raised text-accent shadow-soft" : "text-content-muted hover:text-content"
                    }`}
                    onClick={() => setVolumeView("flags")}
                  >
                    Flags
                  </button>
                </div>
              </div>
              {activeChart.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activeChart} margin={{ top: 12, right: 8, left: -16, bottom: 0 }} barCategoryGap="18%">
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgb(var(--border) / 0.6)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "rgb(var(--content-muted))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "rgb(var(--content-muted))" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgb(var(--accent-muted) / 0.35)" }}
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid rgb(var(--border))",
                          background: "rgb(var(--surface-raised))",
                          boxShadow: "var(--shadow-card)",
                        }}
                        formatter={(value: number) => [formatNumber(value), "Count"]}
                      />
                      <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={48}>
                        {activeChart.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={
                              entry.count === chartPeak && chartPeak > 0
                                ? "rgb(var(--accent))"
                                : "rgb(var(--accent) / 0.28)"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-14 text-center text-sm text-content-muted">No staged data yet — run an extraction to see volume.</p>
              )}
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <p className="text-sm font-semibold text-content">Last extract</p>
                {data.last_extraction ? (
                  <div className="mt-4 space-y-2.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-content-muted">Period</span>
                      <span className="text-right font-medium">{formatDateRange(data.last_extraction.date_from, data.last_extraction.date_to)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Source</span>
                      <span className="font-medium">{extractSourceLabel(data.last_extraction.source)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Extracted</span>
                      <span className="font-medium tabular-nums">{data.last_extraction.records_extracted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Valid / invalid</span>
                      <span className="font-medium tabular-nums">
                        {data.last_extraction.records_valid} / {data.last_extraction.records_invalid}
                      </span>
                    </div>
                    <p className="pt-1 text-xs text-content-subtle">
                      {formatRelative(data.last_extraction.completed_at ?? data.last_extraction.started_at)}
                    </p>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-content-muted">No run yet.</p>
                )}
              </div>

              <div className="card p-5">
                <p className="text-sm font-semibold text-content">Recent activity</p>
                <div className="mt-3 space-y-3">
                  {data.recent_audit.slice(0, 5).map((e) => (
                    <div key={e.id} className="flex items-start justify-between gap-2 text-sm">
                      <div>
                        <p className="font-medium text-content">{actionLabel(e.action)}</p>
                        <p className="text-xs text-content-muted">{e.actor_name}</p>
                      </div>
                      <span className="text-xs text-content-subtle">{formatRelative(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {data.total_staged_transactions === 0 && canRunEtl(user?.role) && (
            <div className="card mt-6">
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
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
