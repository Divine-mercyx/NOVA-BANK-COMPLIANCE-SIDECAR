import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ease, itemVariants, spring } from "../lib/motion";
import { AnimatedNumber, Skeleton } from "./motion";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  count,
  actions,
}: {
  /** Short label above the title (the section this page belongs to). */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  count?: string;
  actions?: ReactNode;
}) {
  return (
    <motion.div variants={itemVariants} className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <span className="pill mb-3">{eyebrow}</span>}
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-content">{title}</h1>
          {count && (
            <motion.span
              key={count}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring}
              className="rounded-full bg-brand-muted px-2.5 py-0.5 text-xs font-semibold text-brand"
            >
              {count}
            </motion.span>
          )}
        </div>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-content-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

/** Large, light-weight section title with an optional one-paragraph lede. */
export function SectionHeading({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <motion.div variants={itemVariants} className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-[28px] font-bold leading-tight tracking-tight text-content">{title}</h2>
        {children && <p className="mt-2 max-w-xl text-sm leading-6 text-content-muted">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </motion.div>
  );
}

export type BadgeTone = "positive" | "negative" | "warning" | "neutral" | "info";

const BADGE_TONES: Record<BadgeTone, string> = {
  positive: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  negative: "bg-red-50 text-red-700 ring-red-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/25",
  neutral: "bg-slate-100 text-slate-700 ring-slate-500/20",
  info: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
};

/** Small rounded metric pill, e.g. "92% valid". Values are real, derived figures. */
export function MetricPill({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  change,
  ringPercent,
  icon: Icon,
  glyph,
  badge,
  className = "",
}: {
  label: string;
  value: string | number;
  /** Supporting line under the value. */
  change?: string;
  /** Kept for callers that pass it; trends are not shown without history. */
  changeUp?: boolean;
  ringPercent?: number;
  icon?: LucideIcon;
  /** Large gradient mark (see ArrowField's Glyph); switches the card to the mark-first layout. */
  glyph?: ReactNode;
  badge?: { label: string; tone?: BadgeTone };
  /** Grid placement, e.g. "col-span-12 xl:col-span-3". */
  className?: string;
}) {
  const pct = ringPercent ?? 0;
  const ringData = [
    { name: "filled", value: pct },
    { name: "empty", value: 100 - pct },
  ];

  if (glyph) {
    return (
      <motion.div
        variants={itemVariants}
        whileHover={{ y: -2 }}
        transition={spring}
        className={`card p-6 hover:border-border-strong ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          {glyph}
          {badge && <MetricPill tone={badge.tone}>{badge.label}</MetricPill>}
        </div>
        <p className="mt-6 text-4xl font-semibold tracking-tight text-content">
          <AnimatedNumber value={value} />
        </p>
        <p className="mt-2 text-sm font-semibold text-content">{label}</p>
        {change && <p className="mt-1 text-sm text-content-muted">{change}</p>}
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -2 }}
      transition={spring}
      className={`card p-6 hover:border-border-strong ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-content-muted">{label}</p>
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-content-muted">
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </span>
        )}
        {ringPercent !== undefined && (
          <div className="relative h-14 w-14 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ringData} dataKey="value" innerRadius={18} outerRadius={26} startAngle={90} endAngle={-270} stroke="none">
                  <Cell fill="#4F46E5" />
                  <Cell fill="rgb(var(--surface-overlay))" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-content">{pct}%</span>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <p className="text-3xl font-semibold tracking-tight text-content">
          <AnimatedNumber value={value} />
        </p>
        {badge && <MetricPill tone={badge.tone}>{badge.label}</MetricPill>}
      </div>
      {change && <p className="mt-2 text-xs text-content-muted">{change}</p>}
    </motion.div>
  );
}

export function ScoreRing({ value, size = 44 }: { value: number; size?: number }) {
  const data = [{ v: value }, { v: 100 - value }];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="v" innerRadius={size * 0.35} outerRadius={size * 0.48} startAngle={90} endAngle={-270} stroke="none">
            <Cell fill="#10B981" />
            <Cell fill="rgb(var(--surface-overlay))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-content">{value}</span>
    </div>
  );
}

export function ProgressBar({ value, color = "brand" }: { value: number; color?: "brand" | "success" | "info" | "warning" | "danger" }) {
  const colors = {
    brand: "bg-indigo-600",
    success: "bg-emerald-500",
    info: "bg-indigo-500",
    warning: "bg-amber-500",
    danger: "bg-red-600",
  };
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        {/* Fill is full-width and scaled from the left, so progress animates on transform only. */}
        <motion.div
          className={`h-full w-full origin-left ${colors[color]}`}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: Math.max(0, Math.min(100, value)) / 100 }}
          transition={{ duration: 0.6, ease }}
        />
      </div>
      <span className="w-9 text-right text-xs font-medium tabular-nums text-content-muted">{value}%</span>
    </div>
  );
}

/** Status → colour: green = done, indigo = in progress, amber = needs attention, red = failed. */
const STATUS_TONE: Record<string, BadgeTone> = {
  success: "positive",
  active: "positive",
  approved: "positive",
  submitted: "positive",
  running: "info",
  partial: "warning",
  pending_review: "warning",
  draft: "neutral",
  idle: "neutral",
  failed: "negative",
  rejected: "negative",
};

/** Dot colours use the functional accents exactly; badge text stays on the AA-safe 700 shades. */
const TONE_DOT: Record<BadgeTone, string> = {
  positive: "bg-emerald-600",
  warning: "bg-amber-600",
  negative: "bg-red-600",
  info: "bg-blue-800",
  neutral: "bg-slate-400",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  const text = status.replace(/_/g, " ");
  return (
    // Keyed on status so a change (running → success) pops in instead of swapping silently.
    <motion.span
      key={status}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={spring}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]} ${status === "running" ? "status-live" : ""}`} aria-hidden />
      {text.charAt(0).toUpperCase() + text.slice(1)}
    </motion.span>
  );
}

const TAG_COLORS = {
  blue: "bg-indigo-50 text-indigo-700",
  purple: "bg-violet-50 text-violet-700",
  pink: "bg-rose-50 text-rose-700",
  gray: "bg-slate-100 text-slate-700",
} as const;

export function Tag({ children, color = "gray" }: { children: ReactNode; color?: keyof typeof TAG_COLORS }) {
  return <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${TAG_COLORS[color]}`}>{children}</span>;
}

export function TableToolbar({
  tabs,
  activeTab,
  onTabChange,
  search,
  onSearchChange,
  actions,
}: {
  tabs?: { id: string; label: string }[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  search?: string;
  onSearchChange?: (v: string) => void;
  actions?: ReactNode;
}) {
  // One layoutId per toolbar, so the highlight slides between pills without touching other toolbars.
  const pillId = `tab-pill-${useId()}`;

  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-1.5" role="tablist">
        {tabs?.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTabChange?.(tab.id)}
              className={`relative rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
                active ? "border-transparent text-brand" : "border-border bg-white text-content-muted hover:border-border-strong hover:text-content"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={pillId}
                  className="absolute inset-0 rounded-lg border border-blue-200 bg-blue-50"
                  transition={spring}
                  aria-hidden
                />
              )}
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange && (
          <input
            type="search"
            placeholder="Search…"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input h-9 w-full !py-0 sm:w-56"
          />
        )}
        {actions}
      </div>
    </div>
  );
}

/** Client-side paging for list views. Resets to page 1 when the list length changes (e.g. a filter). */
export function usePagination<T>(items: T[], pageSize = 20) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    setPage(1);
  }, [items.length]);
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  return {
    page: current,
    setPage,
    pageCount,
    pageSize,
    start,
    total: items.length,
    pageItems: items.slice(start, start + pageSize),
  };
}

export function Pagination({
  page,
  pageCount,
  start,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  start: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total === 0) return null;
  const end = Math.min(start + pageSize, total);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
      <p className="text-sm text-content-muted">
        Showing <span className="font-medium text-content">{start + 1}</span>–<span className="font-medium text-content">{end}</span> of{" "}
        <span className="font-medium text-content">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm tabular-nums text-content-muted">
          {page} / {pageCount}
        </span>
        <button
          type="button"
          className="btn-secondary h-8 w-8 !px-0"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="btn-secondary h-8 w-8 !px-0"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <motion.div
      className="flex flex-col items-center px-6 py-16 text-center"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease }}
    >
      <motion.div
        className="mb-4 rounded-xl bg-brand-muted p-3 text-brand"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...spring, delay: 0.08 }}
      >
        <Icon className="h-6 w-6" />
      </motion.div>
      <h3 className="font-semibold text-content">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-content-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

export function InfoCallout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <motion.div variants={itemVariants} className="rounded-xl border border-brand/15 bg-brand-muted p-4">
      <p className="text-sm font-semibold text-content">{title}</p>
      <div className="mt-1 text-sm text-content-muted">{children}</div>
    </motion.div>
  );
}

export function LoadingGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-12 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="col-span-12 h-32 rounded-xl sm:col-span-6 xl:col-span-3" />
      ))}
    </div>
  );
}
