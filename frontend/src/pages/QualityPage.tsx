import { useEffect, useState } from "react";
import { Banknote, BarChart3, CheckCircle2, Database, Globe2, ShieldAlert, UserRound } from "lucide-react";
import { AnimatedRow, AnimatedTBody, SkeletonCard, Stagger, StaggerItem } from "../components/motion";
import { EmptyState, KpiCard, PageHeader, ProgressBar, ScoreRing, StatusBadge } from "../components/ui";
import { TransactionFlags } from "../components/TransactionFlags";
import { api, DataQualityMetrics, StagingTransaction } from "../lib/api";
import { channelLabel, formatCurrency, formatNumber } from "../lib/format";

export function QualityPage() {
  const [metrics, setMetrics] = useState<DataQualityMetrics | null>(null);
  const [withdrawals, setWithdrawals] = useState<StagingTransaction[]>([]);

  useEffect(() => {
    api.quality().then(setMetrics);
    api.transactions(false, "CASH_WITHDRAWAL").then(setWithdrawals);
  }, []);

  if (!metrics) return <SkeletonCard />;

  const channelRows = Object.entries(metrics.by_channel).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <PageHeader
        eyebrow="Validation"
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
          <Stagger className="mb-6 grid grid-cols-12 gap-6">
            <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-2" label="Total staged" icon={Database} value={metrics.total_records} />
            <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-2" label="Valid records" icon={CheckCircle2} value={metrics.valid_records} badge={{ label: `${metrics.validation_rate}% valid`, tone: metrics.validation_rate >= 95 ? "positive" : "warning" }} />
            <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-2" label="CTR eligible" icon={Banknote} value={metrics.ctr_eligible} />
            <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-2" label="FTR eligible" icon={Globe2} value={metrics.ftr_eligible} />
            <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-2" label="PEP eligible" icon={UserRound} value={metrics.pep_eligible} />
            <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-2" label="STR eligible" icon={ShieldAlert} value={metrics.str_eligible} />
          </Stagger>

          <StaggerItem className="card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Channel</th>
                  <th className="text-right">Records</th>
                  <th>Share</th>
                  <th>Quality score</th>
                </tr>
              </thead>
              <AnimatedTBody>
                {channelRows.map(([channel, count], rowIndex) => {
                  const pct = Math.round((count / metrics.total_records) * 100);
                  return (
                    <AnimatedRow key={channel} index={rowIndex}>
                      <td className="font-medium">{channelLabel(channel)}</td>
                      <td className="text-right tabular-nums">{formatNumber(count)}</td>
                      <td className="w-48">
                        <ProgressBar value={pct} />
                      </td>
                      <td>
                        <ScoreRing value={metrics.validation_rate} size={36} />
                      </td>
                    </AnimatedRow>
                  );
                })}
              </AnimatedTBody>
            </table>
          </StaggerItem>

          {withdrawals.length > 0 && (
            <StaggerItem className="card mt-6 overflow-hidden">
              <div className="border-b border-border px-6 py-4">
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
                    <th className="text-right">Amount</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <AnimatedTBody>
                  {withdrawals.slice(0, 15).map((tx, rowIndex) => (
                    <AnimatedRow key={tx.id} index={rowIndex}>
                      <td className="font-mono text-xs">{tx.finacle_ref}</td>
                      <td className="font-mono text-xs">{tx.sender_account}</td>
                      <td className="font-medium">{tx.sender_name}</td>
                      <td className="max-w-xs truncate text-xs text-content-muted" title={tx.narration ?? undefined}>
                        {tx.narration ?? "—"}
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums">{formatCurrency(tx.amount, tx.currency)}</td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          <TransactionFlags tx={tx} />
                          {!tx.is_valid && <StatusBadge status="failed" />}
                        </div>
                      </td>
                    </AnimatedRow>
                  ))}
                </AnimatedTBody>
              </table>
            </StaggerItem>
          )}
        </>
      )}
    </div>
  );
}
