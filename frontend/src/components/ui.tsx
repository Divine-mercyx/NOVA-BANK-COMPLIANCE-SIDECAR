import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

export function PageHeader({
  title,
  subtitle,
  count,
  actions,
}: {
  title: string;
  subtitle?: string;
  count?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-content">{title}</h2>
          {count && (
            <span className="theme-chip">
              {count}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-1 text-sm text-content-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export type KpiTone = "violet" | "blue" | "rose" | "emerald" | "amber";

const kpiToneStroke: Record<KpiTone, string> = {
  violet: "rgb(0, 173, 239)",
  blue: "rgb(14, 165, 233)",
  rose: "rgb(244, 63, 94)",
  emerald: "rgb(16, 185, 129)",
  amber: "rgb(245, 158, 11)",
};

const kpiToneIconWrap: Record<KpiTone, string> = {
  violet: "bg-accent/15 text-accent ring-accent/20",
  blue: "bg-sky-500/15 text-sky-600 ring-sky-500/20 dark:text-sky-400",
  rose: "bg-rose-500/15 text-rose-600 ring-rose-500/20 dark:text-rose-400",
  emerald: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 ring-amber-500/20 dark:text-amber-400",
};

function MiniSparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const series =
    values.length >= 2
      ? values
      : values.length === 1
        ? [0, values[0]]
        : [0, 0, 0, 0, 0];
  const data = series.map((v, i) => ({ i, v }));

  return (
    <div className="h-11 w-[76px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            fill={stroke}
            fillOpacity={0.12}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FeaturedKpiCard({
  label,
  value,
  hint,
  tone = "violet",
  icon: Icon,
  sparkline,
  change,
  changeUp,
  ringPercent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: KpiTone;
  icon?: LucideIcon;
  sparkline?: number[];
  change?: string;
  changeUp?: boolean;
  ringPercent?: number;
}) {
  const stroke = kpiToneStroke[tone];
  const changeClass =
    changeUp === undefined ? "kpi-change-neutral" : changeUp ? "kpi-change-up" : "kpi-change-down";

  return (
    <div className={`kpi-featured kpi-tone-${tone}`}>
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full opacity-40 blur-2xl"
        style={{ background: stroke }}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {Icon && (
              <span
                className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${kpiToneIconWrap[tone]}`}
              >
                <Icon className="h-4 w-4" strokeWidth={2.25} />
              </span>
            )}
            <p className="text-xs font-semibold uppercase tracking-wide text-content-muted">{label}</p>
          </div>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-content tabular-nums sm:text-[2rem] leading-none">
            {value}
          </p>
          {(change || hint) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {change && (
                <span className={changeClass}>
                  {changeUp !== undefined && (changeUp ? "↑" : "↓")} {change}
                </span>
              )}
              {hint && <span className="text-xs text-content-muted">{hint}</span>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-start pt-0.5">
          <MiniSparkline values={sparkline ?? []} stroke={stroke} />
          {ringPercent !== undefined && (
            <span className="mt-1.5 rounded-lg bg-surface-raised/80 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-content-muted ring-1 ring-border/80">
              target {ringPercent}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  change,
  changeUp = true,
  ringPercent,
}: {
  label: string;
  value: string | number;
  change?: string;
  changeUp?: boolean;
  ringPercent?: number;
}) {
  const pct = ringPercent ?? 0;
  const ringData = [
    { name: "filled", value: pct },
    { name: "empty", value: 100 - pct },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-content-muted">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-content">{value}</p>
          {change && (
            <p className={`mt-2 flex items-center gap-1 text-xs font-medium text-content-muted`}>
              <span>{changeUp ? "↑" : "↓"}</span> {change}
            </p>
          )}
        </div>
        {ringPercent !== undefined && (
          <div className="relative h-14 w-14">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ringData} dataKey="value" innerRadius={18} outerRadius={26} startAngle={90} endAngle={-270} stroke="none">
                  <Cell fill="rgb(var(--accent))" />
                  <Cell fill="rgb(var(--surface-overlay))" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-content">
              {pct}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ScoreRing({ value, size = 44 }: { value: number; size?: number }) {
  const color = "rgb(var(--content))";
  const data = [{ v: value }, { v: 100 - value }];

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="v" innerRadius={size * 0.35} outerRadius={size * 0.48} startAngle={90} endAngle={-270} stroke="none">
            <Cell fill={color} />
            <Cell fill="rgb(var(--surface-overlay))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-content">{value}</span>
    </div>
  );
}

export function ProgressBar({ value, color = "accent" }: { value: number; color?: "accent" | "brand" | "success" | "info" | "warning" | "danger" }) {
  const colors = {
    accent: "bg-accent",
    brand: "bg-accent",
    success: "bg-success",
    info: "bg-info",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-overlay">
        <div className={`h-full rounded-full ${colors[color]}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="w-8 text-right text-xs font-medium text-content-muted">{value}</span>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: "bg-success-muted text-success ring-success/20",
    running: "bg-accent-muted text-accent ring-accent/25",
    partial: "bg-warning-muted text-warning ring-warning/20",
    failed: "bg-danger-muted text-danger ring-danger/20",
    draft: "bg-surface-overlay text-content-muted ring-border",
    approved: "bg-success-muted text-success ring-success/20",
    submitted: "bg-accent-muted text-accent ring-accent/25",
    rejected: "bg-danger-muted text-danger ring-danger/20",
    idle: "bg-surface-overlay text-content-muted ring-border",
    active: "bg-accent-muted text-accent ring-accent/25",
    pending: "bg-warning-muted text-warning ring-warning/20",
    completed: "bg-success-muted text-success ring-success/20",
    canceled: "bg-surface-overlay text-content-muted ring-border",
  };
  const cls = styles[status] ?? styles.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Tag({ children, color = "gray" }: { children: ReactNode; color?: "blue" | "purple" | "pink" | "gray" }) {
  const tones = {
    gray: "bg-surface-overlay text-content-muted",
    purple: "bg-accent-muted text-accent",
    blue: "bg-accent-muted text-accent",
    pink: "bg-danger-muted text-danger",
  };
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${tones[color]}`}>
      {children}
    </span>
  );
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
  return (
    <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-6">
        {tabs?.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange?.(tab.id)}
            className={`pb-1 text-sm font-medium transition ${activeTab === tab.id ? "tab-active" : "tab-inactive"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onSearchChange && (
          <input
            type="search"
            placeholder="Search..."
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            className="input w-full sm:w-56"
          />
        )}
        {actions}
      </div>
    </div>
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
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 rounded-xl bg-accent-muted p-3 text-accent">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-semibold text-content">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-content-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function InfoCallout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-accent/25 bg-accent-muted/40 p-4">
      <p className="text-sm font-semibold text-content">{title}</p>
      <div className="mt-1 text-sm text-content-muted">{children}</div>
    </div>
  );
}

export function LoadingGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kpi-featured kpi-tone-violet animate-pulse bg-surface-overlay/30" />
      ))}
    </div>
  );
}
