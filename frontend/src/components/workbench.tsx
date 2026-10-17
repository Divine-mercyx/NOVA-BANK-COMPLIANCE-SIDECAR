import { ArrowDown, ArrowUp, ArrowUpDown, Download, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { spring } from "../lib/motion";

/* ───────────── Sorting ───────────── */

export type SortDir = "asc" | "desc";
export type SortRule<K extends string> = { key: K; dir: SortDir };
type Getter<T> = (row: T) => string | number | null | undefined;

const MAX_SORT_KEYS = 3;

function compareValues(x: string | number | null | undefined, y: string | number | null | undefined) {
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  if (typeof x === "number" && typeof y === "number") return x - y;
  return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * Client-side, multi-column sort. A click sorts by that column alone (clicking the primary
 * column again flips it); Shift-click adds the column as a tie-breaker, or flips it if it is
 * already one. Up to three columns, applied in order. Missing values always sort last.
 */
export function useSort<T, K extends string>(rows: T[], getters: Record<K, Getter<T>>, initial: SortRule<NoInfer<K>>) {
  const [rules, setRules] = useState<SortRule<K>[]>([initial]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      for (const rule of rules) {
        const get = getters[rule.key];
        const x = get(a);
        const y = get(b);
        // Nulls stay last whatever the direction.
        if (x == null || y == null) {
          const n = compareValues(x, y);
          if (n !== 0) return n;
          continue;
        }
        const diff = compareValues(x, y) * (rule.dir === "asc" ? 1 : -1);
        if (diff !== 0) return diff;
      }
      return 0;
    });
    // getters are static per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, rules]);

  const flip = (dir: SortDir): SortDir => (dir === "asc" ? "desc" : "asc");

  const toggle = (key: K, additive = false) =>
    setRules((prev) => {
      const existing = prev.find((r) => r.key === key);
      if (additive) {
        if (existing) return prev.map((r) => (r.key === key ? { key, dir: flip(r.dir) } : r));
        return [...prev, { key, dir: "desc" as SortDir }].slice(0, MAX_SORT_KEYS);
      }
      if (prev[0]?.key === key) return [{ key, dir: flip(prev[0].dir) }];
      return [{ key, dir: "desc" }];
    });

  return { sorted, sort: rules, toggle };
}

export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: K;
  /** The active sort rules, primary first (from useSort). */
  sort: SortRule<K>[];
  onSort: (key: K, additive: boolean) => void;
  align?: "left" | "right";
}) {
  const index = sort.findIndex((r) => r.key === column);
  const rule = index >= 0 ? sort[index] : null;
  const Icon = !rule ? ArrowUpDown : rule.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={index === 0 && rule ? (rule.dir === "asc" ? "ascending" : "descending") : "none"}
      className={align === "right" ? "text-right" : undefined}
    >
      <button
        type="button"
        onClick={(e) => onSort(column, e.shiftKey)}
        title="Click to sort. Shift-click to add as a secondary sort."
        className={`inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${
          rule ? "text-content" : ""
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${rule ? "text-brand" : "text-content-subtle"}`} aria-hidden />
        {rule && sort.length > 1 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded bg-brand-muted px-1 text-[10px] font-bold text-brand">
            {index + 1}
            <span className="sr-only">{index === 0 ? " (primary sort)" : " (secondary sort)"}</span>
          </span>
        )}
      </button>
    </th>
  );
}

/* ───────────── Selection + batch actions ───────────── */

export function useSelection(validIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const key = validIds.join("|");

  // Drop selections that no longer exist (filter changed, live refresh removed rows).
  useEffect(() => {
    const valid = new Set(validIds);
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });

  return { selected, toggle, setMany, clear: () => setSelected(new Set()) };
}

export function SelectBox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="h-4 w-4 cursor-pointer rounded border-border-strong text-brand accent-[rgb(var(--brand))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    />
  );
}

/** Header checkbox that selects or clears every row on the current page. */
export function SelectPageBox({
  pageIds,
  selected,
  setMany,
}: {
  pageIds: string[];
  selected: Set<string>;
  setMany: (ids: string[], on: boolean) => void;
}) {
  const count = pageIds.filter((id) => selected.has(id)).length;
  const all = pageIds.length > 0 && count === pageIds.length;
  return (
    <SelectBox
      checked={all}
      indeterminate={count > 0 && !all}
      onChange={() => setMany(pageIds, !all)}
      label={all ? "Clear selection on this page" : "Select all rows on this page"}
    />
  );
}

export function BatchBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
          transition={spring}
          role="region"
          aria-label="Batch actions"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-brand-muted px-4 py-2.5"
        >
          <p className="text-sm font-medium text-brand">
            {count} selected
          </p>
          <div className="flex items-center gap-2">
            {children}
            <button type="button" className="btn-ghost h-8 !py-0" onClick={onClear}>
              Clear
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Spreadsheet-safe cell: quotes everything and defuses formula injection (=, +, -, @, tab, CR). */
function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, header: string[], rows: unknown[][]) {
  const body = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn-secondary h-8 !py-0" onClick={onClick}>
      <Download className="h-4 w-4" aria-hidden />
      Export CSV
    </button>
  );
}

/* ───────────── Review state badge ───────────── */

/** The inline review states. Colours follow the functional accents: emerald = compliant,
 * amber = needs a review, crimson = compliance risk, slate = closed. */
export type ReviewState = "verified" | "pending" | "flagged" | "resolved" | "invalid";

const REVIEW_STYLE: Record<ReviewState, { label: string; className: string; dot: string }> = {
  verified: { label: "Verified", className: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-600" },
  pending: { label: "Pending review", className: "bg-amber-50 text-amber-800 ring-amber-600/25", dot: "bg-amber-600" },
  flagged: { label: "Flagged", className: "bg-red-50 text-red-700 ring-red-600/20", dot: "bg-red-600" },
  resolved: { label: "Resolved", className: "bg-slate-100 text-slate-700 ring-slate-500/20", dot: "bg-slate-500" },
  invalid: { label: "Failed checks", className: "bg-amber-50 text-amber-800 ring-amber-600/25", dot: "bg-amber-600" },
};

export function ReviewBadge({ state }: { state: ReviewState }) {
  const s = REVIEW_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

/* ───────────── Slide-over inspector ───────────── */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocus.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.setTimeout(() => panel.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  // Portalled to <body> so it layers above the sticky app header (main is its own stacking context).
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="Close inspector"
            className="absolute inset-0 bg-slate-900/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />
          <motion.aside
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-label="Inspector"
            tabIndex={-1}
            className="absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-border bg-white shadow-lg outline-none"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%", transition: { duration: 0.18, ease: "easeIn" } }}
            transition={spring}
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-content">{title}</h2>
                {subtitle && <div className="mt-1 text-sm text-content-muted">{subtitle}</div>}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-content-muted transition-colors hover:bg-slate-50 hover:text-content"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Label / value rows used inside inspectors. */
export function DetailList({ items }: { items: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y divide-border rounded-xl border border-border">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
          <dt className="shrink-0 text-content-muted">{label}</dt>
          <dd className="min-w-0 break-words text-right font-medium text-content">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
