import { useEffect, useState } from "react";
import { Clock3, Database, FileText, Pause, Play, PlusCircle, RefreshCw, Repeat } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedAlert, AnimatedRow, AnimatedTBody, Skeleton, Stagger, StaggerItem } from "../components/motion";
import { EmptyState, KpiCard, PageHeader, Pagination, StatusBadge, Tag, usePagination } from "../components/ui";
import {
  BatchBar,
  DetailList,
  Drawer,
  downloadCsv,
  ExportButton,
  SelectBox,
  SelectPageBox,
  SortHeader,
  useSelection,
  useSort,
} from "../components/workbench";
import { api, DtdFeedStatus, DtdLiveTransaction } from "../lib/api";
import { channelLabel, formatCurrency, formatDate, formatNumber, formatRelative } from "../lib/format";
import { canRunEtl } from "../lib/roles";
import { useAuth } from "../lib/auth";
import { useLiveRefresh } from "../lib/live";

export function DailyTransactionsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DtdFeedStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setData(await api.dtdStatus());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the daily feed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Each pull and every start/stop is pushed as a live hint; the 15s poll only runs while the
  // socket is down and the feed is on.
  useLiveRefresh(["dtd.run", "dtd.state"], load, { fallbackMs: data?.enabled ? 15_000 : undefined });

  const toggle = async () => {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      setData(data.enabled ? await api.dtdStop() : await api.dtdStart());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the feed.");
    } finally {
      setBusy(false);
    }
  };

  const [inspecting, setInspecting] = useState<DtdLiveTransaction | null>(null);
  const rows = data?.transactions ?? [];
  const { sorted, sort, toggle: toggleSort } = useSort(
    rows,
    {
      when: (tx) => tx.transaction_date,
      amount: (tx) => tx.amount,
      from: (tx) => tx.sender_name,
      to: (tx) => tx.receiver_name,
    },
    { key: "when", dir: "desc" },
  );
  const { pageItems, ...pager } = usePagination(sorted, 25);
  const selection = useSelection(rows.map((tx) => tx.finacle_ref));
  const pageIds = pageItems.map((tx) => tx.finacle_ref);

  const institution = (name: string | null, code: string | null) =>
    name || code ? `${name ?? "—"} (${code ?? "—"})` : "Bank code not posted";

  const exportSelected = () => {
    const picked = rows.filter((tx) => selection.selected.has(tx.finacle_ref));
    downloadCsv(
      `nova-dtd-${data?.business_date ?? "today"}.csv`,
      ["Reference", "When", "Channel", "Amount", "Currency", "Sender", "Sender account", "Source bank", "Receiver", "Receiver account", "Destination bank", "Narration"],
      picked.map((tx) => [
        tx.finacle_ref,
        tx.transaction_date,
        channelLabel(tx.channel),
        tx.amount,
        tx.currency,
        tx.sender_name,
        tx.sender_account,
        institution(tx.source_institution_name, tx.source_institution_code),
        tx.receiver_name,
        tx.receiver_account,
        institution(tx.dest_institution_name, tx.dest_institution_code),
        tx.narration ?? "",
      ]),
    );
  };

  if (loading && !data) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading Day Transaction Detail">
        <Skeleton className="h-10 w-72 rounded-xl" />
        <Skeleton className="h-28 rounded-xl border border-border" />
        <div className="grid grid-cols-12 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="col-span-12 sm:col-span-6 xl:col-span-3 h-28 rounded-xl border border-border" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Live feed"
        title="Day Transaction Detail"
        subtitle="DTD is Finacle’s same-day book (TBAADM.DTD). History is HTD. This feed stages today’s posted transactions for the screening vendor — Nova does not screen names here."
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={load} disabled={busy}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            {canRunEtl(user?.role) && (
              <button
                type="button"
                className={data?.enabled ? "btn-secondary" : "btn-primary"}
                onClick={toggle}
                disabled={busy}
              >
                {data?.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {busy ? "Working…" : data?.enabled ? "Stop 30-minute feed" : "Start 30-minute feed"}
              </button>
            )}
          </div>
        }
      />

      <AnimatedAlert
        show={Boolean(error)}
        className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
      >
        {error}
      </AnimatedAlert>

      <StaggerItem className="card mb-6 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={data?.enabled ? "running" : "stopped"}
                className="text-[11px] font-semibold uppercase tracking-wider text-content-muted"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.14 }}
              >
                {data?.enabled && <span className="status-live mr-2 inline-block h-1.5 w-1.5 rounded-full bg-success" />}
                {data?.enabled ? "Feed running" : "Feed stopped"}
              </motion.p>
            </AnimatePresence>
            <p className="mt-1 max-w-2xl text-sm text-content">{data?.dtd_means}</p>
            <p className="mt-2 text-xs text-content-subtle">
              Business day {data?.business_date} (Africa/Lagos). Posted legs only. Duplicate references are skipped.
            </p>
          </div>
          {data?.enabled && (
            <div className="rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm">
              <p className="text-content-muted">Next Oracle pull</p>
              <p className="mt-1 font-medium text-content">{data.next_run_at ? formatDate(data.next_run_at) : "Armed"}</p>
              <p className="text-xs text-content-subtle">{data.next_run_at ? formatRelative(data.next_run_at) : `Every ${data.interval_minutes} minutes`}</p>
            </div>
          )}
        </div>
      </StaggerItem>

      <Stagger className="mb-6 grid grid-cols-12 gap-6">
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" label="Pulls today" icon={Repeat} value={data?.pulls_today ?? 0} change="completed cycles this Lagos day" changeUp />
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" label="New staged today" icon={PlusCircle} value={data?.new_today ?? 0} change={`${formatNumber(data?.skipped_today ?? 0)} already held`} changeUp />
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" label="In warehouse today" icon={Database} value={data?.staged_today ?? 0} change="unique DTD pairs" changeUp />
        <KpiCard
          className="col-span-12 sm:col-span-6 xl:col-span-3"
          label="Last successful pull"
          icon={Clock3}
          value={data?.last_success_at ? formatRelative(data.last_success_at) : "—"}
          change={data?.watermark_at ? `Resume after ${formatDate(data.watermark_at)}` : "Full day on first start"}
          changeUp={Boolean(data?.last_success_at)}
        />
      </Stagger>

      {(data?.started_by || data?.stopped_by) && (
        <p className="mb-6 text-xs text-content-subtle">
          {data.started_by && data.started_at && (
            <>Started by {data.started_by} · {formatDate(data.started_at)}. </>
          )}
          {!data.enabled && data.stopped_by && data.stopped_at && (
            <>Stopped by {data.stopped_by} · {formatDate(data.stopped_at)} — watermark kept for resume.</>
          )}
        </p>
      )}

      <AnimatedAlert
        show={Boolean(data?.last_error)}
        role="status"
        className="mb-6 rounded-xl border border-warning/30 bg-amber-50 px-4 py-3 text-sm text-content"
      >
        Last pull issue: {data?.last_error}. The next start or tick will rescan today’s book and skip rows already stored.
      </AnimatedAlert>

      <div className="grid grid-cols-12 gap-6">
        <StaggerItem className="card col-span-12 overflow-hidden xl:col-span-8">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-content">Staged today</h2>
            <p className="mt-1 text-xs text-content-muted">Paired debit/credit with GAM names. Vendor API: GET /api/v1/export/dtd</p>
          </div>
          {!data?.transactions.length ? (
            <EmptyState
              icon={FileText}
              title="No same-day transactions staged yet"
              description="Start the 30-minute feed to pull posted TBAADM.DTD rows. The screening vendor reads this warehouse — they do not need Nova’s alert queue."
            />
          ) : (
            <>
            <BatchBar count={selection.selected.size} onClear={selection.clear}>
              <ExportButton onClick={exportSelected} />
            </BatchBar>
            <div className="max-h-[640px] overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <SelectPageBox pageIds={pageIds} selected={selection.selected} setMany={selection.setMany} />
                    </th>
                    <th>Reference</th>
                    <SortHeader label="When" column="when" sort={sort} onSort={toggleSort} />
                    <SortHeader label="Amount" column="amount" sort={sort} onSort={toggleSort} align="right" />
                    <SortHeader label="From" column="from" sort={sort} onSort={toggleSort} />
                    <SortHeader label="To" column="to" sort={sort} onSort={toggleSort} />
                  </tr>
                </thead>
                <AnimatedTBody>
                  {pageItems.map((tx, rowIndex) => (
                    <AnimatedRow
                      key={tx.finacle_ref}
                      index={rowIndex}
                      onClick={() => setInspecting(tx)}
                      className={`cursor-pointer ${selection.selected.has(tx.finacle_ref) ? "bg-brand-muted/50" : ""}`}
                    >
                      <td>
                        <SelectBox
                          checked={selection.selected.has(tx.finacle_ref)}
                          onChange={() => selection.toggle(tx.finacle_ref)}
                          label={`Select ${tx.finacle_ref}`}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspecting(tx);
                          }}
                          className="block font-mono text-xs text-content hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          {tx.finacle_ref}
                        </button>
                        <Tag color="gray">{channelLabel(tx.channel)}</Tag>
                      </td>
                      <td className="whitespace-nowrap text-content-muted">{formatDate(tx.transaction_date)}</td>
                      <td className="whitespace-nowrap text-right font-medium tabular-nums">
                        {formatCurrency(tx.amount, tx.currency)}
                      </td>
                      <td>
                        <p className="text-content">{tx.sender_name}</p>
                        <p className="font-mono text-xs text-content-subtle">{tx.sender_account}</p>
                        <p className="text-xs text-content-subtle">{institution(tx.source_institution_name, tx.source_institution_code)}</p>
                      </td>
                      <td>
                        <p className="text-content">{tx.receiver_name}</p>
                        <p className="font-mono text-xs text-content-subtle">{tx.receiver_account}</p>
                        <p className="text-xs text-content-subtle">{institution(tx.dest_institution_name, tx.dest_institution_code)}</p>
                      </td>
                    </AnimatedRow>
                  ))}
                </AnimatedTBody>
              </table>
            </div>
            <Pagination {...pager} onPage={pager.setPage} />
            </>
          )}
        </StaggerItem>

        <StaggerItem className="card col-span-12 overflow-hidden xl:col-span-4">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-content">Pull log</h2>
            <p className="mt-1 text-xs text-content-muted">Each cycle records new vs already-staged counts.</p>
          </div>
          {!data?.runs.length ? (
            <div className="p-6 text-sm text-content-muted">No pulls yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.runs.map((run) => (
                <li key={run.id} className="px-6 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={run.status} />
                    <span className="text-xs text-content-subtle">{formatRelative(run.started_at)}</span>
                  </div>
                  <p className="mt-2 text-sm text-content">
                    {formatNumber(run.records_new)} new · {formatNumber(run.records_skipped)} skipped · {formatNumber(run.legs_fetched)} legs
                  </p>
                  {run.error_summary && <p className="mt-1 text-xs text-danger">{run.error_summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </StaggerItem>
      </div>

      <Drawer
        open={Boolean(inspecting)}
        onClose={() => setInspecting(null)}
        title={inspecting ? formatCurrency(inspecting.amount, inspecting.currency) : ""}
        subtitle={inspecting ? <span className="font-mono text-xs">{inspecting.finacle_ref}</span> : undefined}
      >
        {inspecting && (
          <div className="space-y-6">
            <DetailList
              items={[
                ["Posted", formatDate(inspecting.transaction_date)],
                ["Channel", channelLabel(inspecting.channel)],
                ["Branch", inspecting.branch_code ?? "—"],
              ]}
            />
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted">From</h3>
              <DetailList
                items={[
                  ["Name", inspecting.sender_name],
                  ["Account", <span className="font-mono text-xs">{inspecting.sender_account}</span>],
                  ["Bank", institution(inspecting.source_institution_name, inspecting.source_institution_code)],
                ]}
              />
            </section>
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted">To</h3>
              <DetailList
                items={[
                  ["Name", inspecting.receiver_name],
                  ["Account", <span className="font-mono text-xs">{inspecting.receiver_account}</span>],
                  ["Bank", institution(inspecting.dest_institution_name, inspecting.dest_institution_code)],
                ]}
              />
            </section>
            {inspecting.narration && (
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted">Narration</h3>
                <p className="rounded-xl border border-border bg-slate-50 px-4 py-3 text-sm text-content">{inspecting.narration}</p>
              </section>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
