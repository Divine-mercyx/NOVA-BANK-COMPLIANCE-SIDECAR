import { useEffect, useMemo, useState } from "react";
import { Banknote, Database, FileText, Globe2, ShieldAlert, UserRound } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { reviewState, TransactionFlags, transactionFlags } from "../components/TransactionFlags";
import { AnimatePresence, motion } from "motion/react";
import { AnimatedRow, AnimatedTBody, SkeletonCard, Stagger, StaggerItem } from "../components/motion";
import { EmptyState, KpiCard, PageHeader, Pagination, TableToolbar, Tag, usePagination } from "../components/ui";
import {
  BatchBar,
  downloadCsv,
  ExportButton,
  ReviewBadge,
  SelectBox,
  SelectPageBox,
  SortHeader,
  useSelection,
  useSort,
} from "../components/workbench";
import { spring } from "../lib/motion";
import { useLiveRefresh } from "../lib/live";
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
  const [params, setParams] = useSearchParams();
  const [search, setSearchState] = useState(() => params.get("q") ?? "");
  const [flagFilter, setFlagFilter] = useState<FlagFilter>("all");
  const [loading, setLoading] = useState(true);

  // The header's global search lands here as ?q=; keep the box and the URL in step.
  const urlQ = params.get("q") ?? "";
  useEffect(() => setSearchState(urlQ), [urlQ]);
  const setSearch = (value: string) => {
    setSearchState(value);
    setParams(value ? { q: value } : {}, { replace: true });
  };

  const load = () =>
    Promise.all([api.quality(), api.transactions(false, undefined, 500)])
      .then(([quality, rows]) => {
        setMetrics(quality);
        setTransactions(rows);
        setSelected((prev) => (prev ? rows.find((r) => r.id === prev.id) ?? rows[0] ?? null : rows[0] ?? null));
      })
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  // A finished extraction restages rows; pick them up without a reload.
  useLiveRefresh(["extraction.run"], load);

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

  const { sorted, sort, toggle } = useSort(
    filtered,
    {
      date: (tx) => tx.transaction_date,
      channel: (tx) => channelLabel(tx.channel),
      amount: (tx) => tx.amount,
      status: (tx) => reviewState(tx),
    },
    { key: "date", dir: "desc" },
  );
  const { pageItems, ...pager } = usePagination(sorted, 25);
  const selection = useSelection(filtered.map((tx) => tx.id));
  const pageIds = pageItems.map((tx) => tx.id);

  const exportSelected = () => {
    const rows = transactions.filter((tx) => selection.selected.has(tx.id));
    downloadCsv(
      `nova-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Reference", "Date", "Channel", "Amount", "Currency", "Sender", "Sender account", "Receiver", "Status", "Flags", "Narration"],
      rows.map((tx) => [
        tx.finacle_ref,
        tx.transaction_date,
        channelLabel(tx.channel),
        tx.amount,
        tx.currency,
        tx.sender_name,
        tx.sender_account,
        tx.receiver_name,
        reviewState(tx),
        transactionFlags(tx).join(" "),
        tx.narration ?? "",
      ]),
    );
  };

  const unflagged = transactions.filter((tx) => transactionFlags(tx).length === 0).length;

  if (loading) return <SkeletonCard />;

  return (
    <div>
      <PageHeader
        eyebrow="Staging"
        title="Transactions"
        subtitle="Preview of staged Finacle records and the CTR, FTR, PEP, and STR flags stored on each row."
        count={`${formatNumber(transactions.length)} records`}
      />

      <Stagger className="mb-6 grid grid-cols-12 gap-6">
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-4" label="Staged" icon={Database} value={metrics?.total_records ?? transactions.length} />
        <KpiCard className="col-span-6 sm:col-span-3 xl:col-span-2" label="CTR" icon={Banknote} value={metrics?.ctr_eligible ?? 0} />
        <KpiCard className="col-span-6 sm:col-span-3 xl:col-span-2" label="FTR" icon={Globe2} value={metrics?.ftr_eligible ?? 0} />
        <KpiCard className="col-span-6 sm:col-span-3 xl:col-span-2" label="PEP" icon={UserRound} value={metrics?.pep_eligible ?? 0} />
        <KpiCard className="col-span-6 sm:col-span-3 xl:col-span-2" label="STR" icon={ShieldAlert} value={metrics?.str_eligible ?? 0} />
      </Stagger>

      {transactions.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={FileText}
            title="No transactions yet"
            description="Run an extraction to preview Finacle records and their flags here."
          />
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-6">
          <StaggerItem className="card col-span-12 overflow-hidden xl:col-span-8">
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
                    <SortHeader label="Ref" column="date" sort={sort} onSort={toggle} />
                    <SortHeader label="Channel" column="channel" sort={sort} onSort={toggle} />
                    <SortHeader label="Amount" column="amount" sort={sort} onSort={toggle} align="right" />
                    <SortHeader label="Status" column="status" sort={sort} onSort={toggle} />
                    <th>Flags</th>
                  </tr>
                </thead>
                <AnimatedTBody>
                  {pageItems.map((tx, rowIndex) => (
                    <AnimatedRow
                      key={tx.id}
                      index={rowIndex}
                      onClick={() => setSelected(tx)}
                      className={`cursor-pointer ${selected?.id === tx.id || selection.selected.has(tx.id) ? "bg-brand-muted/40" : ""}`}
                    >
                      <td>
                        <SelectBox checked={selection.selected.has(tx.id)} onChange={() => selection.toggle(tx.id)} label={`Select ${tx.finacle_ref}`} />
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(tx);
                          }}
                          className="font-mono text-xs text-content hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          {tx.finacle_ref}
                        </button>
                        <p className="text-xs text-content-muted">{formatDate(tx.transaction_date)}</p>
                      </td>
                      <td className="text-sm">{channelLabel(tx.channel)}</td>
                      <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatCurrency(tx.amount, tx.currency)}</td>
                      <td>
                        <ReviewBadge state={reviewState(tx)} />
                      </td>
                      <td>
                        <TransactionFlags tx={tx} />
                      </td>
                    </AnimatedRow>
                  ))}
                </AnimatedTBody>
              </table>
              {filtered.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-content-muted">No rows match this filter.</p>
              )}
            </div>
            <Pagination {...pager} onPage={pager.setPage} />
          </StaggerItem>

          <StaggerItem className="card col-span-12 p-6 xl:col-span-4">
            <AnimatePresence mode="wait" initial={false}>
            {selected ? (
              <motion.div
                key={selected.id}
                className="space-y-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }}
                transition={spring}
              >
                <div>
                  <p className="font-mono text-xs text-content-muted">{selected.finacle_ref}</p>
                  <h2 className="mt-1 text-lg font-semibold text-content">
                    {selected.sender_name} → {selected.receiver_name}
                  </h2>
                  <p className="mt-1 text-2xl font-semibold text-brand">
                    {formatCurrency(selected.amount, selected.currency)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ReviewBadge state={reviewState(selected)} />
                  <TransactionFlags tx={selected} />
                </div>
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
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-content-subtle">Narration</p>
                    <p className="mt-1 text-sm text-content">{selected.narration}</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-content-subtle">Flag detail</p>
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
              </motion.div>
            ) : (
              <EmptyState key="empty" icon={FileText} title="Select a transaction" description="Choose a row to see full details and flags." />
            )}
            </AnimatePresence>
          </StaggerItem>
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
