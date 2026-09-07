import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Play,
  RefreshCw,
  ShieldAlert,
  X,
  Zap,
} from "lucide-react";
import {
  EmptyState,
  KpiCard,
  LoadingGrid,
  PageHeader,
  ProgressBar,
  ScoreRing,
  StatusBadge,
  TableToolbar,
  Tag,
} from "../../components/ui";
import { api, ScreeningAlert } from "../../lib/api";
import { formatCurrency, formatDate, formatNumber, formatRelative } from "../../lib/format";
import { useAuth } from "../../lib/auth";
import { canEscalateAlerts, canResolveAlerts, canSimulateScreening } from "../../lib/roles";

export function ScreeningAlertsPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<ScreeningAlert[]>([]);
  const [selected, setSelected] = useState<ScreeningAlert | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.screeningDashboard>> | null>(null);
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboard, allAlerts] = await Promise.all([
        api.screeningDashboard(),
        api.screeningAlerts(tab === "all" ? undefined : (tab as "pending")),
      ]);
      setStats(dashboard);
      setAlerts(allAlerts);
      if (allAlerts.length && !selected) setSelected(allAlerts[0]);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const simulate = async () => {
    setSimulating(true);
    try {
      await api.simulateScreening(5);
      await load();
    } finally {
      setSimulating(false);
    }
  };

  const action = async (fn: (id: string, name?: string) => Promise<ScreeningAlert>) => {
    if (!selected) return;
    const updated = await fn(selected.id, user?.full_name);
    setSelected(updated);
    await load();
  };

  const filtered = alerts.filter(
    (a) =>
      a.finacle_ref.toLowerCase().includes(search.toLowerCase()) ||
      a.sender_name.toLowerCase().includes(search.toLowerCase()) ||
      a.matched_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Alert queue"
        subtitle="Real-time flagged transactions awaiting compliance review."
        count={stats ? `${formatNumber(stats.pending_alerts)} pending` : undefined}
        actions={
          <>
            <button className="btn-secondary" onClick={load}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {canSimulateScreening(user?.role) && (
              <button className="btn-primary" onClick={simulate} disabled={simulating}>
                {simulating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Simulate flags
              </button>
            )}
          </>
        }
      />

      {loading && !stats ? (
        <LoadingGrid count={4} />
      ) : stats ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard label="Pending review" value={formatNumber(stats.pending_alerts)} change="needs action" changeUp={false} />
          <KpiCard label="Avg latency" value={`${stats.avg_latency_ms}ms`} change="screening speed" changeUp ringPercent={Math.min(100, 100 - stats.avg_latency_ms)} />
          <KpiCard label="False positive rate" value={`${stats.false_positive_rate}%`} change={`${stats.resolved_today} resolved`} changeUp={stats.false_positive_rate < 30} />
          <KpiCard label="Escalated" value={formatNumber(stats.escalated)} change="senior review" changeUp={false} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card overflow-hidden lg:col-span-2">
          <TableToolbar
            tabs={[
              { id: "pending", label: "Pending" },
              { id: "all", label: "All" },
            ]}
            activeTab={tab}
            onTabChange={setTab}
            search={search}
            onSearchChange={setSearch}
          />
          {filtered.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No alerts in queue"
              description="Simulate incoming flagged transactions or wait for Finacle webhooks."
              action={
                canSimulateScreening(user?.role) ? (
                  <button className="btn-primary" onClick={simulate}>
                    Simulate flags
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="max-h-[560px] divide-y divide-border/60 overflow-y-auto">
              {filtered.map((alert) => (
                <button
                  key={alert.id}
                  onClick={() => setSelected(alert)}
                  className={`w-full px-4 py-4 text-left transition hover:bg-surface-overlay/40 ${
                    selected?.id === alert.id ? "bg-brand-muted/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-content">{alert.matched_name}</p>
                      <p className="text-xs text-content-muted">{alert.watchlist_source}</p>
                    </div>
                    <StatusBadge status={alert.status} />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-brand">
                    {formatCurrency(alert.amount, alert.currency)}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs text-content-subtle">
                    <span>{alert.channel}</span>
                    <span>{formatRelative(alert.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card p-6 lg:col-span-3">
          {selected ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <Tag color="pink">{selected.screening_type}</Tag>
                  <h2 className="mt-2 text-xl font-semibold text-content">Flagged transaction</h2>
                  <p className="font-mono text-xs text-content-muted">{selected.finacle_ref}</p>
                </div>
                <ScoreRing value={Math.round(selected.match_score)} size={52} />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="card-muted p-4">
                  <p className="text-xs text-content-muted">Sender</p>
                  <p className="mt-1 font-medium">{selected.sender_name}</p>
                </div>
                <div className="card-muted p-4">
                  <p className="text-xs text-content-muted">Receiver</p>
                  <p className="mt-1 font-medium">{selected.receiver_name}</p>
                </div>
                <div className="card-muted p-4">
                  <p className="text-xs text-content-muted">Watchlist match</p>
                  <p className="mt-1 font-medium text-danger">{selected.matched_name}</p>
                  <Tag color="purple">{selected.watchlist_source}</Tag>
                </div>
                <div className="card-muted p-4">
                  <p className="text-xs text-content-muted">Screening latency</p>
                  <p className="mt-1 font-medium">{selected.latency_ms}ms</p>
                  <ProgressBar value={Math.min(100, 100 - selected.latency_ms)} color="success" />
                </div>
              </div>

              <div className="mt-4 text-sm text-content-muted">
                Received {formatDate(selected.created_at)}
              </div>

              {selected.status === "pending" && canResolveAlerts(user?.role) && (
                <div className="mt-6 flex flex-wrap gap-2">
                  <button className="btn-primary" onClick={() => action(api.approveAlert)}>
                    <Check className="h-4 w-4" /> Approve (false positive)
                  </button>
                  <button className="btn-secondary" onClick={() => action(api.rejectAlert)}>
                    <X className="h-4 w-4" /> Reject transaction
                  </button>
                  {canEscalateAlerts(user?.role) && (
                    <button className="btn-secondary" onClick={() => action(api.escalateAlert)}>
                      <ArrowUpRight className="h-4 w-4" /> Escalate
                    </button>
                  )}
                </div>
              )}

              {selected.status !== "pending" && (
                <div className="mt-6 rounded-lg border border-border bg-surface-overlay/50 p-4 text-sm">
                  <StatusBadge status={selected.status} />
                  <p className="mt-2 text-content-muted">
                    Reviewed by {selected.reviewed_by} · {formatDate(selected.reviewed_at)}
                  </p>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={Zap}
              title="Select an alert"
              description="Choose a flagged transaction from the queue to review details and take action."
            />
          )}
        </div>
      </div>
    </div>
  );
}
