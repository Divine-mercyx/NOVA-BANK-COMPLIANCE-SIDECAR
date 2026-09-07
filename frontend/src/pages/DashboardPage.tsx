import { useEffect, useState } from "react";
import { Play, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
import { actionLabel, formatNumber, formatRelative } from "../lib/format";
import { canRunEtl, extractModeLabel, extractSourceLabel } from "../lib/roles";
import { useAuth } from "../lib/auth";

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

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

  const runPipeline = async () => {
    setRunning(true);
    try {
      await api.runEtl();
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
              <button className="btn-primary" onClick={runPipeline} disabled={running}>
                {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Run extraction
              </button>
            )}
          </>
        }
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
              changeUp
            />
            <KpiCard
              label="Validation rate"
              value={`${data.data_quality.validation_rate}%`}
              change={`${data.data_quality.invalid_records} invalid`}
              changeUp={data.data_quality.invalid_records === 0}
              ringPercent={data.data_quality.validation_rate}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="card overflow-hidden lg:col-span-2">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold text-content">Report eligibility</h2>
                <p className="text-sm text-content-muted">Transactions ready for NFIU report types</p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Report type</th>
                    <th>Eligible records</th>
                    <th>Readiness</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { type: "CTR", count: data.data_quality.ctr_eligible, tag: "Cash threshold", pct: 75 },
                    { type: "FTR", count: data.data_quality.ftr_eligible, tag: "Foreign currency", pct: 60 },
                    { type: "PEP", count: data.data_quality.pep_eligible, tag: "PEP registry", pct: 40 },
                    { type: "STR", count: data.data_quality.str_eligible, tag: "Suspicious activity", pct: 30 },
                  ].map((row) => (
                    <tr key={row.type}>
                      <td>
                        <div className="flex items-center gap-3">
                          <ScoreRing value={row.pct} size={40} />
                          <div>
                            <p className="font-medium text-content">{row.type}</p>
                            <Tag color="purple">{row.tag}</Tag>
                          </div>
                        </div>
                      </td>
                      <td className="font-semibold">{formatNumber(row.count)}</td>
                      <td className="w-40">
                        <ProgressBar value={row.pct} color="brand" />
                      </td>
                      <td>
                        <StatusBadge status={row.count > 0 ? "active" : "idle"} />
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
                    <div className="flex justify-between">
                      <span className="text-content-muted">Extracted</span>
                      <span className="font-medium">{data.last_extraction.records_extracted}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-content-muted">Valid</span>
                      <span className="font-medium text-success">{data.last_extraction.records_valid}</span>
                    </div>
                    {data.last_extraction.channels.length > 0 && (
                      <div className="flex justify-between gap-4">
                        <span className="text-content-muted">Channels</span>
                        <span className="text-right font-medium">{data.last_extraction.channels.join(", ")}</span>
                      </div>
                    )}
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
                  <button className="btn-primary" onClick={runPipeline} disabled={running}>
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
