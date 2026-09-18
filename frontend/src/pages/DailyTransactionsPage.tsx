import { useEffect, useState } from "react";
import { Pause, Play, RefreshCw, Sunrise } from "lucide-react";
import { EmptyState, KpiCard, PageHeader, StatusBadge, Tag } from "../components/ui";
import { api, DtdFeedStatus } from "../lib/api";
import { channelLabel, formatCurrency, formatDate, formatNumber, formatRelative } from "../lib/format";
import { canRunEtl } from "../lib/roles";
import { useAuth } from "../lib/auth";

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

  useEffect(() => {
    if (!data?.enabled) return;
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [data?.enabled]);

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

  if (loading && !data) {
    return <p className="text-sm text-content-muted">Loading Day Transaction Detail…</p>;
  }

  return (
    <div>
      <PageHeader
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

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <div className="mb-6 rounded-2xl border border-border bg-gradient-to-br from-emerald-600/10 via-surface-raised to-cyan-600/10 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-soft">
              <Sunrise className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                {data?.enabled ? "Feed live" : "Feed idle"}
              </p>
              <p className="mt-1 max-w-2xl text-sm text-content-muted">{data?.dtd_means}</p>
              <p className="mt-2 text-xs text-content-subtle">
                Business day {data?.business_date} (Africa/Lagos). Posted legs only. Already staged references are skipped on every tick.
              </p>
            </div>
          </div>
          {data?.enabled && (
            <div className="rounded-xl border border-emerald-500/20 bg-surface-raised px-4 py-3 text-sm">
              <p className="text-content-muted">Next Oracle pull</p>
              <p className="mt-1 font-semibold text-content">{data.next_run_at ? formatDate(data.next_run_at) : "Armed"}</p>
              <p className="text-xs text-content-subtle">{data.next_run_at ? formatRelative(data.next_run_at) : `Every ${data.interval_minutes} minutes`}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Pulls today" value={formatNumber(data?.pulls_today ?? 0)} change="completed cycles this Lagos day" changeUp />
        <KpiCard label="New staged today" value={formatNumber(data?.new_today ?? 0)} change={`${formatNumber(data?.skipped_today ?? 0)} already held`} changeUp />
        <KpiCard label="In warehouse today" value={formatNumber(data?.staged_today ?? 0)} change="unique DTD pairs" changeUp />
        <KpiCard
          label="Last successful pull"
          value={data?.last_success_at ? formatRelative(data.last_success_at) : "—"}
          change={data?.watermark_at ? `Resume after ${formatDate(data.watermark_at)}` : "Full day on first start"}
          changeUp={Boolean(data?.last_success_at)}
        />
      </div>

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

      {data?.last_error && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          Last pull issue: {data.last_error}. The next start or tick will rescan today’s book and skip rows already stored.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <section className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold text-content">Staged today</h2>
            <p className="mt-1 text-xs text-content-muted">Paired debit/credit with GAM names. Vendor API: GET /api/v1/export/dtd</p>
          </div>
          {!data?.transactions.length ? (
            <EmptyState
              icon={Sunrise}
              title="No same-day transactions staged yet"
              description="Start the 30-minute feed to pull posted TBAADM.DTD rows. The screening vendor reads this warehouse — they do not need Nova’s alert queue."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-overlay/80 text-left text-xs uppercase tracking-wide text-content-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">When</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">From</th>
                    <th className="px-4 py-3 font-medium">To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.transactions.map((tx) => (
                    <tr key={tx.finacle_ref} className="hover:bg-surface-overlay/50">
                      <td className="px-4 py-3">
                        <p className="font-mono text-xs text-content">{tx.finacle_ref}</p>
                        <Tag color="gray">{channelLabel(tx.channel)}</Tag>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-content-muted">{formatDate(tx.transaction_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-content">
                        {formatCurrency(tx.amount, tx.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-content">{tx.sender_name}</p>
                        <p className="font-mono text-[11px] text-content-subtle">{tx.sender_account}</p>
                        <p className="text-[11px] text-content-subtle">
                          {tx.source_institution_name} ({tx.source_institution_code})
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-content">{tx.receiver_name}</p>
                        <p className="font-mono text-[11px] text-content-subtle">{tx.receiver_account}</p>
                        <p className="text-[11px] text-content-subtle">
                          {tx.dest_institution_name} ({tx.dest_institution_code})
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-semibold text-content">Pull log</h2>
            <p className="mt-1 text-xs text-content-muted">Each cycle records new vs already-staged counts.</p>
          </div>
          {!data?.runs.length ? (
            <div className="p-5 text-sm text-content-muted">No pulls yet.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.runs.map((run) => (
                <li key={run.id} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={run.status} />
                    <span className="text-[11px] text-content-subtle">{formatRelative(run.started_at)}</span>
                  </div>
                  <p className="mt-2 text-sm text-content">
                    {formatNumber(run.records_new)} new · {formatNumber(run.records_skipped)} skipped · {formatNumber(run.legs_fetched)} legs
                  </p>
                  {run.error_summary && <p className="mt-1 text-xs text-danger">{run.error_summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
