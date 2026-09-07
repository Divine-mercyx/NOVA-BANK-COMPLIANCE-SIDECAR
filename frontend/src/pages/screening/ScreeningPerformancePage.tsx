import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gauge } from "lucide-react";
import { EmptyState, KpiCard, LoadingGrid, PageHeader, ProgressBar } from "../../components/ui";
import { api, ScreeningPerformance } from "../../lib/api";
import { formatNumber } from "../../lib/format";

export function ScreeningPerformancePage() {
  const [data, setData] = useState<ScreeningPerformance | null>(null);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof api.screeningDashboard>> | null>(null);

  useEffect(() => {
    Promise.all([api.screeningPerformance(), api.screeningDashboard()]).then(([perf, dash]) => {
      setData(perf);
      setDashboard(dash);
    });
  }, []);

  if (!data || !dashboard) return <LoadingGrid count={3} />;

  const watchlistChart = Object.entries(data.by_watchlist).map(([name, count]) => ({ name: name.split(" ")[0], count }));
  const statusChart = Object.entries(data.by_status).map(([status, count]) => ({ status, count }));
  const avgLatency =
    data.recent_latency_ms.length > 0
      ? Math.round(data.recent_latency_ms.reduce((a, b) => a + b, 0) / data.recent_latency_ms.length)
      : 0;

  return (
    <div>
      <PageHeader
        title="Screening performance"
        subtitle="Latency, match distribution, and resolution metrics for real-time compliance."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Avg latency" value={`${dashboard.avg_latency_ms}ms`} change="target < 50ms" changeUp={dashboard.avg_latency_ms < 50} ringPercent={Math.min(100, 100 - dashboard.avg_latency_ms)} />
        <KpiCard label="False positive rate" value={`${dashboard.false_positive_rate}%`} changeUp={dashboard.false_positive_rate < 25} />
        <KpiCard label="Total screened" value={formatNumber(dashboard.total_screened_today)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold text-content">Matches by watchlist</h2>
          {watchlistChart.length === 0 ? (
            <EmptyState icon={Gauge} title="No data" description="Simulate alerts to populate metrics." />
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={watchlistChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(156,163,175,0.2)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h2 className="font-semibold text-content">Resolution breakdown</h2>
          <div className="mt-4 space-y-4">
            {statusChart.map(({ status, count }) => (
              <div key={status}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="capitalize text-content-muted">{status}</span>
                  <span className="font-medium">{count}</span>
                </div>
                <ProgressBar value={dashboard.total_screened_today ? Math.round((count / dashboard.total_screened_today) * 100) : 0} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {data.recent_latency_ms.length > 0 && (
        <div className="card mt-6 p-5">
          <h2 className="font-semibold text-content">Recent screening latency</h2>
          <p className="text-sm text-content-muted">Last {data.recent_latency_ms.length} checks · avg {avgLatency}ms</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.recent_latency_ms.map((ms, i) => (
              <span
                key={i}
                className={`rounded-md px-2 py-1 text-xs font-medium ${ms < 30 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"}`}
              >
                {ms}ms
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
