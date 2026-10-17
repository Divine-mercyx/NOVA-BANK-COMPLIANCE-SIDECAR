import { useEffect, useRef, useState } from "react";
import { Activity, Play, RefreshCw } from "lucide-react";
import { ExtractionProgressBanner } from "../components/ExtractionProgressBanner";
import { ExtractionRunModal } from "../components/ExtractionRunModal";
import { AnimatePresence, motion } from "motion/react";
import { SkeletonCard, StaggerItem } from "../components/motion";
import { EmptyState, PageHeader, StatusBadge, TableToolbar, Tag } from "../components/ui";
import { spring } from "../lib/motion";
import { api, ExtractionLog, ExtractionRun } from "../lib/api";
import type { ExtractionRunParams } from "../lib/dates";
import { displayLogMessage, latestHtdProgress } from "../lib/extractionProgress";
import { channelLabel, formatDate, formatDateRange, formatNumber } from "../lib/format";
import { canRunEtl, extractSourceLabel } from "../lib/roles";
import { useAuth } from "../lib/auth";
import { useLiveRefresh } from "../lib/live";

export function ExtractionPage() {
  const { user } = useAuth();
  const [runs, setRuns] = useState<ExtractionRun[]>([]);
  const [logs, setLogs] = useState<ExtractionLog[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [extractOpen, setExtractOpen] = useState(false);
  const [finacleMode, setFinacleMode] = useState<string | undefined>();
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const load = async () => {
    try {
      const [data, dashboard] = await Promise.all([api.listRuns(), api.dashboard()]);
      setRuns(data);
      setFinacleMode(dashboard.finacle_mode);
      const active = data.find((r) => r.status === "running");
      if (active) {
        setSelected(active.id);
        setRunning(true);
      } else if (data.length && !selected) {
        setSelected(data[0].id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const active = runs.find((r) => r.status === "running");
    if (active) {
      setRunning(true);
      setStarting(false);
      if (selected !== active.id) setSelected(active.id);
      return;
    }
    if (!starting) {
      setRunning(false);
      setProgressMessage(null);
    }
  }, [runs, starting, selected]);

  const poll = async () => {
    if (!selected) return;
    const id = selected;
    try {
      const [run, runLogs] = await Promise.all([api.getRun(id), api.runLogs(id)]);
      setLogs(runLogs);
      setRuns((prev) => {
        const exists = prev.some((r) => r.id === run.id);
        if (!exists) return [run, ...prev];
        return prev.map((r) => (r.id === run.id ? run : r));
      });
      const last = runLogs[runLogs.length - 1];
      if (last && run.status === "running") setProgressMessage(displayLogMessage(last.message));
    } catch {
      /* run may not exist yet */
    }
  };

  useEffect(() => {
    void poll();
  }, [selected, running]);

  // The selected run's status and log lines arrive as live hints; poll only while the socket is down.
  useLiveRefresh(["extraction.run", "extraction.log"], poll, { enabled: Boolean(selected), match: selected, fallbackMs: running ? 2000 : undefined });
  // A run started by someone else, or by the scheduler, appears in the list without a reload.
  useLiveRefresh(["extraction.run"], load);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const runPipeline = async (params: ExtractionRunParams) => {
    setStarting(true);
    setRunning(true);
    setProgressMessage("Starting extraction…");
    try {
      const run = await api.runEtl(params);
      setExtractOpen(false);
      setSelected(run.id);
      setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
    } catch {
      setStarting(false);
      setRunning(false);
      setProgressMessage(null);
    }
  };

  const filtered = runs.filter((r) => r.id.toLowerCase().includes(search.toLowerCase()));
  const activeRun = runs.find((r) => r.id === selected);
  const progress = latestHtdProgress(logs);

  return (
    <div>
      <PageHeader
        eyebrow="Pipeline"
        title="Extraction runs"
        subtitle="Finacle pulls by date range with channel-level processing logs."
        count={`${runs.length} runs`}
        actions={
          <>
            <button className="btn-secondary" onClick={() => load()}>
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

      <AnimatePresence>
        {running && (
          <ExtractionProgressBanner
            key="extraction-progress"
            running={running}
            run={activeRun}
            logs={logs}
            fallbackMessage={progressMessage}
          />
        )}
      </AnimatePresence>

      {loading ? (
        <SkeletonCard />
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
        <div className="grid grid-cols-12 gap-6">
          <StaggerItem className="card col-span-12 overflow-hidden lg:col-span-5">
            <TableToolbar search={search} onSearchChange={setSearch} />
            <div className="max-h-[520px] overflow-y-auto">
              {filtered.map((run) => (
                <motion.button
                  key={run.id}
                  onClick={() => setSelected(run.id)}
                  whileTap={{ scale: 0.99 }}
                  transition={spring}
                  className="relative w-full border-b border-border/60 px-4 py-4 text-left transition-colors hover:bg-surface-overlay/40"
                >
                  {selected === run.id && (
                    <motion.span
                      layoutId="extraction-run-selected"
                      className="absolute inset-0 bg-brand-muted/40"
                      transition={spring}
                    />
                  )}
                  <div className="relative flex items-center justify-between">
                    <span className="font-mono text-xs text-content-muted">{run.id.slice(0, 8)}</span>
                    <StatusBadge status={run.status} />
                  </div>
                  <p className="relative mt-1 text-sm font-medium">{formatNumber(run.records_extracted)} records</p>
                  <p className="relative mt-1 text-xs text-content-muted">
                    {formatDateRange(run.date_from, run.date_to)}
                  </p>
                  <p className="relative text-xs text-content-subtle">{extractSourceLabel(run.source)}</p>
                  <p className="relative text-xs text-content-subtle">{formatDate(run.started_at)}</p>
                </motion.button>
              ))}
            </div>
          </StaggerItem>

          <StaggerItem className="card col-span-12 overflow-hidden lg:col-span-7">
            <div className="border-b border-border px-4 py-3">
              <p className="font-semibold text-content">Log stream</p>
              {activeRun && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Tag color="purple">{formatDateRange(activeRun.date_from, activeRun.date_to)}</Tag>
                  <Tag color="gray">{formatNumber(progress?.legs_fetched ?? 0)} HTD legs</Tag>
                  <Tag color="gray">{formatNumber(activeRun.records_extracted)} transactions</Tag>
                  <Tag color="gray">{formatNumber(progress?.skipped ?? 0)} already in staging</Tag>
                  <Tag color="gray">{formatNumber(activeRun.records_valid)} valid</Tag>
                  <Tag color="gray">{formatNumber(activeRun.records_invalid)} invalid</Tag>
                </div>
              )}
            </div>
            <div className="max-h-[520px] overflow-y-auto bg-surface-overlay/30 p-4 font-mono text-xs">
              {/* Re-keyed per run so only lines that arrive while watching animate in. */}
              <AnimatePresence initial={false} key={selected}>
              {logs.map((log) => (
                <motion.div
                  key={log.id}
                  className="mb-2 flex gap-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <span className={log.level === "ERROR" ? "text-danger" : log.level === "WARN" ? "text-amber-700" : "text-emerald-700"}>
                    [{log.level}]
                  </span>
                  {log.channel && <span className="text-brand">[{channelLabel(log.channel)}]</span>}
                  <span className="text-content-muted">{displayLogMessage(log.message)}</span>
                </motion.div>
              ))}
              </AnimatePresence>
              <div ref={logEndRef} />
            </div>
          </StaggerItem>
        </div>
      )}
    </div>
  );
}
