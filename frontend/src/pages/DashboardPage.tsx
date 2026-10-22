import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExtractionProgressBanner } from "../components/ExtractionProgressBanner";
import { ExtractionRunModal } from "../components/ExtractionRunModal";
import { EmptyState, LoadingGrid } from "../components/ui";
import { api, DashboardStats, ExtractionLog } from "../lib/api";
import type { ExtractionRunParams } from "../lib/dates";
import { progressLabel } from "../lib/extractionProgress";
import { actionLabel, formatDateRange, formatNumber, formatRelative } from "../lib/format";
import { canRunEtl, extractModeLabel, extractSourceLabel } from "../lib/roles";
import { useAuth } from "../lib/auth";
import { useLiveRefresh } from "../lib/live";

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [runLogs, setRunLogs] = useState<ExtractionLog[]>([]);

  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      setData(await api.dashboard());
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

  const chartData = Object.entries(data?.data_quality.by_channel ?? {}).map(([channel, count]) => ({
    name: channel.replace(/_/g, " "),
    count,
  }));

  return (
    <div>
      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[1.75rem] font-semibold tracking-tight text-content">Hello {firstName}</h1>
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
          <div className="mb-6 overflow-hidden rounded-3xl bg-[#0B1F3A] px-6 py-6 text-white sm:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/50">Staged warehouse</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">
                  {formatNumber(data.total_staged_transactions)}
                </p>
                <p className="mt-2 text-sm text-white/60">
                  {data.last_extraction
                    ? `Last extract ${formatDateRange(data.last_extraction.date_from, data.last_extraction.date_to)}`
                    : "No extraction run yet"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-medium capitalize text-white/80">
                  {data.pipeline_status.replace(/_/g, " ")}
                </span>
                <span className="text-sm text-white/55">{data.data_quality.validation_rate}% valid</span>
                <Link to="/reports" className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-[#0B1F3A]">
                  View transactions
                </Link>
              </div>
            </div>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#F3F6F4] p-5">
              <p className="text-sm text-content-muted">CTR flagged</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-content">{formatNumber(data.data_quality.ctr_eligible)}</p>
              <p className="mt-2 text-xs text-content-subtle">Cash transaction reports on staged rows</p>
            </div>
            <div className="rounded-2xl bg-[#F6F4F0] p-5">
              <p className="text-sm text-content-muted">FTR flagged</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-content">{formatNumber(data.data_quality.ftr_eligible)}</p>
              <p className="mt-2 text-xs text-content-subtle">Foreign transaction reports</p>
            </div>
            <div className="rounded-2xl bg-[#F0F2F6] p-5">
              <p className="text-sm text-content-muted">PEP / STR</p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-content">
                {formatNumber(data.data_quality.pep_eligible)} / {formatNumber(data.data_quality.str_eligible)}
              </p>
              <p className="mt-2 text-xs text-content-subtle">Watchlist and suspicion flags</p>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
            <div className="card p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-content">Volume by channel</h2>
                  <p className="text-sm text-content-muted">Staged Finacle distribution</p>
                </div>
              </div>
              {chartData.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(11,31,58,0.08)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgb(var(--content-muted))" }} />
                      <YAxis tick={{ fontSize: 11, fill: "rgb(var(--content-muted))" }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid rgb(var(--border))",
                          background: "rgb(var(--surface-raised))",
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="rgb(var(--brand))"
                        fill="rgba(11,31,58,0.08)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-12 text-center text-sm text-content-muted">No channel volume until an extraction completes.</p>
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
