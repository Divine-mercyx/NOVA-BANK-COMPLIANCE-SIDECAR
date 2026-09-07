import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState, KpiCard, PageHeader, ProgressBar, ScoreRing, StatusBadge, Tag } from "../components/ui";
import { api, DataQualityMetrics, StagingTransaction } from "../lib/api";
import { channelLabel, formatCurrency, formatNumber } from "../lib/format";

export function QualityPage() {
  const [metrics, setMetrics] = useState<DataQualityMetrics | null>(null);
  const [withdrawals, setWithdrawals] = useState<StagingTransaction[]>([]);

  useEffect(() => {
    api.quality().then(setMetrics);
    api.transactions(false, "CASH_WITHDRAWAL").then(setWithdrawals);
  }, []);

  if (!metrics) return <div className="card h-64 animate-pulse bg-surface-overlay/50" />;

  const channelRows = Object.entries(metrics.by_channel).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader
        title="Data quality"
        subtitle="Validation performance across all staged Finacle transactions."
        count={`${formatNumber(metrics.total_records)} records`}
      />

      {metrics.total_records === 0 ? (
        <div className="card">
          <EmptyState icon={BarChart3} title="No data" description="Run extraction first to see quality metrics." />
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total staged" value={formatNumber(metrics.total_records)} ringPercent={metrics.validation_rate} />
            <KpiCard label="Valid records" value={formatNumber(metrics.valid_records)} changeUp change={`${metrics.validation_rate}% rate`} />
            <KpiCard label="CTR eligible" value={formatNumber(metrics.ctr_eligible)} />
            <KpiCard label="PEP eligible" value={formatNumber(metrics.pep_eligible)} />
            <KpiCard label="STR eligible" value={formatNumber(metrics.str_eligible)} />
          </div>

          <div className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th>Records</th>
                  <th>Share</th>
                  <th>Quality score</th>
                </tr>
              </thead>
              <tbody>
                {channelRows.map(([channel, count]) => {
                  const pct = Math.round((count / metrics.total_records) * 100);
                  return (
                    <tr key={channel}>
                      <td className="font-medium">{channelLabel(channel)}</td>
                      <td>{formatNumber(count)}</td>
                      <td className="w-48">
                        <ProgressBar value={pct} />
                      </td>
                      <td>
                        <ScoreRing value={metrics.validation_rate} size={36} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {withdrawals.length > 0 && (
            <div className="card mt-6 overflow-hidden">
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-semibold text-content">Withdrawal name spot-check</h2>
                <p className="text-sm text-content-muted">
                  Parsed customer names from Finacle <code className="text-xs">PARTICULAR</code> vs raw narration
                </p>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Account</th>
                    <th>Parsed name</th>
                    <th>Raw PARTICULAR</th>
                    <th>Amount</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.slice(0, 15).map((tx) => (
                    <tr key={tx.id}>
                      <td className="font-mono text-xs">{tx.finacle_ref}</td>
                      <td className="font-mono text-xs">{tx.sender_account}</td>
                      <td className="font-medium">{tx.sender_name}</td>
                      <td className="max-w-xs truncate text-xs text-content-muted" title={tx.narration ?? undefined}>
                        {tx.narration ?? "—"}
                      </td>
                      <td>{formatCurrency(tx.amount, tx.currency)}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {tx.reportable_pep && <Tag color="purple">PEP</Tag>}
                          {tx.reportable_str && <Tag color="pink">STR</Tag>}
                          {tx.reportable_ctr && <Tag color="blue">CTR</Tag>}
                          {!tx.is_valid && <StatusBadge status="failed" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
