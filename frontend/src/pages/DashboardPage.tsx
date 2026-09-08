import { useEffect, useState } from "react";
import { Play, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExtractionRunModal } from "../components/ExtractionRunModal";
import {
  EmptyState,
  KpiCard,
  LoadingGrid,
  PageHeader,
  ProgressBar,
  ScoreRing,
  StatusBadge,
  Tag,
} from "../components/ui";
import { api, DashboardStats } from "../lib/api";
import type { ExtractionRunParams } from "../lib/dates";
import { actionLabel, formatDateRange, formatNumber, formatRelative } from "../lib/format";
import { canRunEtl, extractModeLabel, extractSourceLabel } from "../lib/roles";
import { useAuth } from "../lib/auth";

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await api.dashboard());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runPipeline = async (params: ExtractionRunParams) => {
    setRunning(true);
    try {
      await api.runEtl(params);
      setExtractOpen(false);
      await load();
    } finally {
      setRunning(false);
    }
  };

  const chartData = Object.entries(data?.data_quality.by_channel ?? {}).map(([channel, count]) => ({
    name: channel.replace(/_/g, " "),
    count,
  }));

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={
          data
            ? `Extract mode: ${extractModeLabel(data.finacle_mode)} · NFIU compliance pipeline`
            : "NFIU compliance • Finacle ETL • Regulatory reporting"
        }
        actions={
          <>
            <button className="btn-secondary" onClick={load}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {canRunEtl(user?.role) && (
              <button className="btn-primary" onClick={() => setExtractOpen(true)} disabled={running}>
                {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run extraction
              </button>
            )}
          </>
        }
      />

      <ExtractionRunModal
        open={extractOpen}
        onClose={() => !running && setExtractOpen(false)}
        onRun={runPipeline}
        finacleMode={data?.finacle_mode}
        running={running}
      />

      {loading ? (
        <LoadingGrid />
      ) : data ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Staged transactions"
              value={formatNumber(data.total_staged_transactions)}
              change="from last extraction"
              changeUp
              ringPercent={data.data_quality.validation_rate}
            />
            <KpiCard
              label="Pending reports"
              value={formatNumber(data.pending_reports)}
              change={data.pending_reports > 0 ? "needs review" : "all clear"}
              changeUp={data.pending_reports === 0}
            />
            <KpiCard
              label="Submitted to NFIU"
              value={formatNumber(data.submitted_reports)}
              change="goAML portal"
              changeUp={data.submitted_reports > 0}
            />
            <KpiCard
              label="Validation rate"
              value={`${data.data_quality.validation_rate}%`}
              change={`${formatNumber(data.data_quality.valid_records)} valid records`}
              changeUp={data.data_quality.validation_rate >= 80}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold text-content">Compliance readiness</h2>
                <p className="text-sm text-content-muted">Staging quality and reportable transaction flags</p>
              </div>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="flex items-center gap-4 rounded-lg bg-surface-overlay/40 p-4">
                  <ScoreRing value={data.data_quality.validation_rate} />
                  <div>
                    <p className="text-sm font-medium text-content">Data quality score</p>
                    <p className="text-xs text-content-muted">
                      {formatNumber(data.data_quality.invalid_records)} invalid of{" "}
                      {formatNumber(data.data_quality.total_records)}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <ProgressBar value={Math.min(100, data.data_quality.ctr_eligible)} color="info" />
                  <p className="text-xs text-content-muted">CTR-eligible ({data.data_quality.ctr_eligible})</p>
                  <ProgressBar value={Math.min(100, data.data_quality.ftr_eligible)} color="warning" />
                  <p className="text-xs text-content-muted">FTR-eligible ({data.data_quality.ftr_eligible})</p>
                  <ProgressBar value={Math.min(100, data.data_quality.pep_eligible)} color="brand" />
                  <p className="text-xs text-content-muted">PEP-flagged ({data.data_quality.pep_eligible})</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border bg-surface-overlay/30 text-left text-xs uppercase tracking-wide text-content-subtle">
                    <th className="px-5 py-3">Flag</th>
                    <th className="px-5 py-3">Count</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["CTR", data.data_quality.ctr_eligible],
                    ["FTR", data.data_quality.ftr_eligible],
                    ["PEP", data.data_quality.pep_eligible],
                    ["STR", data.data_quality.str_eligible],
                  ].map(([flag, count]) => (
                    <tr key={flag as string} className="border-t border-border/60">
                      <td className="px-5 py-3 font-medium">{flag}</td>
                      <td className="px-5 py-3">{formatNumber(count as number)}</td>
                      <td className="px-5 py-3">
                        <Tag color={(count as number) > 0 ? "purple" : "gray"}>
                          {(count as number) > 0 ? "Eligible" : "None"}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
                <Link to="/reports" className="btn-primary">
                  <Plus className="h-4 w-4" />
                  Generate report
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <p className="text-sm font-medium text-content-muted">Pipeline status</p>
                <div className="mt-3 flex items-center justify-between">
                  <StatusBadge status={data.pipeline_status} />
                  {data.last_extraction && (
                    <span className="text-xs text-content-subtle">
                      {formatRelative(data.last_extraction.completed_at ?? data.last_extraction.started_at)}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Tag color="blue">{extractModeLabel(data.finacle_mode)}</Tag>
                  {data.last_extraction && (
                    <Tag color="gray">{extractSourceLabel(data.last_extraction.source)}</Tag>
                  )}
                </div>
                {data.last_extraction && (
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <span className="text-content-muted">Period</span>
                      <span className="text-right font-medium">
                        {formatDateRange(data.last_extraction.date_from, data.last_extraction.date_to)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Extracted</span>
                      <span className="font-medium">{data.last_extraction.records_extracted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Valid</span>
                      <span className="font-medium text-success">{data.last_extraction.records_valid}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="card p-5">
                <p className="text-sm font-semibold text-content">Recent activity</p>
                <div className="mt-3 space-y-3">
                  {data.recent_audit.slice(0, 4).map((e) => (
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

          {chartData.length > 0 && (
            <div className="card mt-6 p-5">
              <h2 className="font-semibold text-content">Volume by channel</h2>
              <p className="text-sm text-content-muted">Extracted transaction distribution</p>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(156,163,175,0.2)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgb(var(--content-muted))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "rgb(var(--content-muted))" }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid rgb(var(--border))",
                        background: "rgb(var(--surface-raised))",
                      }}
                    />
                    <Bar dataKey="count" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.total_staged_transactions === 0 && canRunEtl(user?.role) && (
            <div className="card mt-6">
              <EmptyState
                icon={Play}
                title="No data yet"
                description="Run your first Finacle extraction to populate the staging warehouse."
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
