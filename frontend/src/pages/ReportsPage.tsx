import { useEffect, useMemo, useState } from "react";
import { FileText } from "lucide-react";
import { TransactionFlags, transactionFlags } from "../components/TransactionFlags";
import { EmptyState, KpiCard, PageHeader, TableToolbar, Tag } from "../components/ui";
import { api, DataQualityMetrics, StagingTransaction } from "../lib/api";
import { channelLabel, formatCurrency, formatDate, formatNumber, reportLabel } from "../lib/format";

type FlagFilter = "all" | "CTR" | "FTR" | "PEP" | "STR" | "none";

function matchesFlag(tx: StagingTransaction, filter: FlagFilter): boolean {
  if (filter === "all") return true;
  if (filter === "none") return transactionFlags(tx).length === 0;
  if (filter === "CTR") return tx.reportable_ctr;
  if (filter === "FTR") return tx.reportable_ftr;
  if (filter === "PEP") return tx.reportable_pep;
  return tx.reportable_str;
}

export function ReportsPage() {
  const [metrics, setMetrics] = useState<DataQualityMetrics | null>(null);
  const [transactions, setTransactions] = useState<StagingTransaction[]>([]);
  const [selected, setSelected] = useState<StagingTransaction | null>(null);
  const [search, setSearch] = useState("");
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.quality(), api.transactions(false, undefined, 500)])
      .then(([quality, rows]) => {
        setMetrics(quality);
        setTransactions(rows);
        setSelected(rows[0] ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (!matchesFlag(tx, flagFilter)) return false;
      if (!q) return true;
      return (
        tx.finacle_ref.toLowerCase().includes(q) ||
        tx.sender_name.toLowerCase().includes(q) ||
        tx.receiver_name.toLowerCase().includes(q) ||
        tx.sender_account.includes(q) ||
        (tx.narration ?? "").toLowerCase().includes(q) ||
        tx.channel.toLowerCase().includes(q)
      );
    });
  }, [transactions, search, flagFilter]);

  const unflagged = transactions.filter((tx) => transactionFlags(tx).length === 0).length;

  if (loading) return <div className="card h-64 animate-pulse bg-surface-overlay/50" />;

  return (
    <div>
      <PageHeader
        title="Transactions"
        subtitle="Preview of staged Finacle records and the CTR, FTR, PEP, and STR flags stored on each row."
        count={`${formatNumber(transactions.length)} records`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Staged" value={formatNumber(metrics?.total_records ?? transactions.length)} />
        <KpiCard label="CTR" value={formatNumber(metrics?.ctr_eligible ?? 0)} />
        <KpiCard label="FTR" value={formatNumber(metrics?.ftr_eligible ?? 0)} />
        <KpiCard label="PEP" value={formatNumber(metrics?.pep_eligible ?? 0)} />
        <KpiCard label="STR" value={formatNumber(metrics?.str_eligible ?? 0)} />
      </div>

      {transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="No transactions yet"
            description="Run an extraction to preview Finacle records and their flags here."
          />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="card overflow-hidden lg:col-span-3">
            <TableToolbar
              tabs={[
                { id: "all", label: `All (${transactions.length})` },
                { id: "CTR", label: `CTR (${metrics?.ctr_eligible ?? 0})` },
                { id: "FTR", label: `FTR (${metrics?.ftr_eligible ?? 0})` },
                { id: "PEP", label: `PEP (${metrics?.pep_eligible ?? 0})` },
                { id: "STR", label: `STR (${metrics?.str_eligible ?? 0})` },
                { id: "none", label: `No flag (${unflagged})` },
              ]}
              activeTab={flagFilter}
              onTabChange={(id) => setFlagFilter(id as FlagFilter)}
              search={search}
              onSearchChange={setSearch}
            />
            <div className="max-h-[640px] overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ref</th>
                    <th>Channel</th>
                    <th>Amount</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((tx) => (
                    <tr
                      key={tx.id}
                      onClick={() => setSelected(tx)}
                      className={`cursor-pointer ${selected?.id === tx.id ? "bg-brand-muted/40" : ""}`}
                    >
                      <td>
                        <p className="font-mono text-xs">{tx.finacle_ref}</p>
                        <p className="text-xs text-content-muted">{formatDate(tx.transaction_date)}</p>
                      </td>
                      <td className="text-sm">{channelLabel(tx.channel)}</td>
                      <td className="font-medium">{formatCurrency(tx.amount, tx.currency)}</td>
                      <td>
                        <TransactionFlags tx={tx} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-content-muted">No rows match this filter.</p>
              )}
            </div>
          </div>

          <div className="card p-6 lg:col-span-2">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <p className="font-mono text-xs text-content-muted">{selected.finacle_ref}</p>
                  <h2 className="mt-1 text-lg font-semibold text-content">
                    {selected.sender_name} → {selected.receiver_name}
                  </h2>
                  <p className="mt-1 text-2xl font-semibold text-brand">
                    {formatCurrency(selected.amount, selected.currency)}
                  </p>
                </div>
                <TransactionFlags tx={selected} />
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-content-muted">Channel</dt>
                    <dd className="text-right font-medium">{channelLabel(selected.channel)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-content-muted">Date</dt>
                    <dd className="text-right font-medium">{formatDate(selected.transaction_date)}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-content-muted">Sender account</dt>
                    <dd className="font-mono text-right">{selected.sender_account}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-content-muted">Valid</dt>
                    <dd className="text-right font-medium">{selected.is_valid ? "Yes" : "No"}</dd>
                  </div>
                </dl>
                {selected.narration && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-content-subtle">Narration</p>
                    <p className="mt-1 text-sm text-content">{selected.narration}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-content-subtle">Flag detail</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(["CTR", "FTR", "PEP", "STR"] as const).map((flag) => (
                      <li key={flag} className="flex justify-between">
                        <span>{reportLabel(flag)}</span>
                        <Tag color={hasFlag(selected, flag) ? "blue" : "gray"}>
                          {hasFlag(selected, flag) ? "Yes" : "No"}
                        </Tag>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <EmptyState icon={FileText} title="Select a transaction" description="Choose a row to see full details and flags." />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function hasFlag(tx: StagingTransaction, flag: "CTR" | "FTR" | "PEP" | "STR") {
  if (flag === "CTR") return tx.reportable_ctr;
  if (flag === "FTR") return tx.reportable_ftr;
  if (flag === "PEP") return tx.reportable_pep;
  return tx.reportable_str;
}
