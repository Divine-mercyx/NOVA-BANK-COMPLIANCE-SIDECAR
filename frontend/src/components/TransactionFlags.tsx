import { Tag } from "./ui";
import type { StagingTransaction } from "../lib/api";

const FLAG_COLOR = {
  CTR: "blue",
  FTR: "purple",
  PEP: "pink",
  STR: "gray",
} as const;

export function transactionFlags(tx: StagingTransaction): Array<keyof typeof FLAG_COLOR> {
  const flags: Array<keyof typeof FLAG_COLOR> = [];
  if (tx.reportable_ctr) flags.push("CTR");
  if (tx.reportable_ftr) flags.push("FTR");
  if (tx.reportable_pep) flags.push("PEP");
  if (tx.reportable_str) flags.push("STR");
  return flags;
}

export function TransactionFlags({ tx }: { tx: StagingTransaction }) {
  const flags = transactionFlags(tx);
  if (flags.length === 0) {
    return <span className="text-xs text-content-subtle">None</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Tag key={flag} color={FLAG_COLOR[flag]}>
          {flag}
        </Tag>
      ))}
    </div>
  );
}
