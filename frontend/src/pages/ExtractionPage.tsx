import { useEffect, useState } from "react";
import { Activity, Play, RefreshCw } from "lucide-react";
import { ExtractionRunModal } from "../components/ExtractionRunModal";
import { EmptyState, PageHeader, StatusBadge, TableToolbar, Tag } from "../components/ui";
import { api, ExtractionLog, ExtractionRun } from "../lib/api";
import type { ExtractionRunParams } from "../lib/dates";
import { channelLabel, formatDate, formatDateRange, formatNumber } from "../lib/format";
import { canRunEtl, extractSourceLabel } from "../lib/roles";
import { useAuth } from "../lib/auth";

export function ExtractionPage() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [logs, setLogs] = useState<ExtractionLog[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [finacleMode, setFinacleMode] = useState<string | undefined>();
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [data, dashboard] = await Promise.all([api.listRuns(), api.dashboard()]);
      setRuns(data);
      setFinacleMode(dashboard.finacle_mode);
      if (data.length && !selected) setSelected(data[0].id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const [run, runLogs] = await Promise.all([api.getRun(selected), api.runLogs(selected)]);
        if (cancelled) return;
        setLogs(runLogs);
        setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
        const last = runLogs[runLogs.length - 1];
        if (last && run.status === "running") setProgressMessage(last.message);
      } catch {
        /* run may not exist yet */
      }
    };

    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selected]);

  const runPipeline = async (params: ExtractionRunParams) => {
    setRunning(true);
    setProgressMessage("Starting extraction…");
    try {
      const run = await api.runEtl(params);
      setExtractOpen(false);
      setSelected(run.id);
      setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
      await api.waitForEtlRun(run.id, (updated, runLogs) => {
        setLogs(runLogs);
        setRuns((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        const last = runLogs[runLogs.length - 1];
        if (last) setProgressMessage(last.message);
      });
      await load();
    } finally {
      setRunning(false);
      setProgressMessage(null);
    }
  };

  const filtered = runs.filter((r) => r.id.toLowerCase().includes(search.toLowerCase()));
  const activeRun = runs.find((r) => r.id === selected);

  return (
    <div>
      <PageHeader
        title="Extraction runs"
        subtitle="Finacle pulls by date range with channel-level processing logs."
        count={`${runs.length} runs`}
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
        finacleMode={finacleMode}
        running={running}
        progressMessage={progressMessage}
      />

      {running && progressMessage && (
        <div className="mb-4 rounded-lg border border-brand/30 bg-brand-muted/40 px-4 py-3 text-sm text-content">
          <span className="font-medium">Extraction in progress:</span> {progressMessage}
        </div>
      )}

      {loading ? (
        <div className="card h-64 animate-pulse bg-surface-overlay/50" />
      ) : runs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Activity}
            title="No extraction runs"
            description="Run the pipeline to pull Finacle transactions for a chosen date range."
            action={
              canRunEtl(user?.role) ? (
                <button className="btn-primary" onClick={() => setExtractOpen(true)}>
                  Run extraction
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="card overflow-hidden lg:col-span-2">
            <TableToolbar search={search} onSearchChange={setSearch} />
            <div className="max-h-[520px] overflow-y-auto">
              {filtered.map((run) => (
                <button
                  key={run.id}
                  onClick={() => setSelected(run.id)}
                  className={`w-full border-b border-border/60 px-4 py-4 text-left transition hover:bg-surface-overlay/40 ${
                    selected === run.id ? "bg-brand-muted/40" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-content-muted">{run.id.slice(0, 8)}</span>
                    <StatusBadge status={run.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium">{formatNumber(run.records_extracted)} records</p>
                  <p className="mt-1 text-xs text-content-muted">
                    {formatDateRange(run.date_from, run.date_to)}
                  </p>
                  <p className="text-xs text-content-subtle">{extractSourceLabel(run.source)}</p>
                  <p className="text-xs text-content-subtle">{formatDate(run.started_at)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden lg:col-span-3">
            <div className="border-b border-border px-4 py-3">
              <p className="font-semibold text-content">Log stream</p>
              {activeRun && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Tag color="purple">{formatDateRange(activeRun.date_from, activeRun.date_to)}</Tag>
                  <Tag color="gray">{formatNumber(activeRun.records_valid)} valid</Tag>
                </div>
              )}
            </div>
            <div className="max-h-[520px] overflow-y-auto bg-surface-overlay/30 p-4 font-mono text-xs">
              {logs.map((log) => (
                <div key={log.id} className="mb-2 flex gap-2">
                  <span className={log.level === "ERROR" ? "text-danger" : log.level === "WARN" ? "text-warning" : "text-success"}>
                    [{log.level}]
                  </span>
                  {log.channel && <span className="text-brand">[{channelLabel(log.channel)}]</span>}
                  <span className="text-content-muted">{log.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
