import { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { EmptyState, PageHeader, StatusBadge, TableToolbar } from "../components/ui";
import { api, ExtractionLog, ExtractionRun } from "../lib/api";
import { channelLabel, formatDate, formatNumber } from "../lib/format";
import { extractSourceLabel } from "../lib/roles";

export function ExtractionPage() {
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [logs, setLogs] = useState<ExtractionLog[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listRuns();
      setRuns(data);
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
    api.runLogs(selected).then(setLogs);
  }, [selected]);

  const filtered = runs.filter((r) => r.id.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Extraction runs"
        subtitle="Keep track of Finacle pulls and channel-level processing logs."
        count={`${runs.length} runs`}
        actions={
          <button className="btn-secondary" onClick={load}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      {loading ? (
        <div className="card h-64 animate-pulse bg-surface-overlay/50" />
      ) : runs.length === 0 ? (
        <div className="card">
          <EmptyState icon={Activity} title="No extraction runs" description="Run the pipeline from Dashboard to pull Finacle data." />
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
                  <p className="text-xs text-content-subtle">{extractSourceLabel(run.source)}</p>
                  <p className="text-xs text-content-subtle">{formatDate(run.started_at)}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden lg:col-span-3">
            <div className="border-b border-border px-4 py-3">
              <p className="font-semibold text-content">Log stream</p>
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
