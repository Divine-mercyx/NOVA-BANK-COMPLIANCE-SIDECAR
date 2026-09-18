import { type LucideIcon } from "lucide-react";
import { type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";

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
          <h1 className="text-2xl font-semibold tracking-tight text-content">{title}</h1>
          {count && (
            <span className="rounded-full bg-brand-muted px-2.5 py-0.5 text-xs font-semibold text-brand">
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
                  <Cell fill="rgb(var(--brand))" />
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

export function ProgressBar({ value, color = "brand" }: { value: number; color?: "brand" | "success" | "info" | "warning" | "danger" }) {
  const colors = {
    brand: "bg-brand",
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
    success: "bg-surface-overlay text-content ring-border",
    running: "bg-surface-overlay text-content ring-border",
    partial: "bg-surface-overlay text-content-muted ring-border",
    failed: "bg-surface-overlay text-content ring-border",
    draft: "bg-surface-overlay text-content-muted ring-border",
    approved: "bg-surface-overlay text-content ring-border",
    submitted: "bg-surface-overlay text-content ring-border",
    rejected: "bg-surface-overlay text-content-muted ring-border",
    idle: "bg-surface-overlay text-content-muted ring-border",
    active: "bg-surface-overlay text-content ring-border",
  };
  const cls = styles[status] ?? styles.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Tag({ children, color = "gray" }: { children: ReactNode; color?: "blue" | "purple" | "pink" | "gray" }) {
  return (
    <span className="inline-flex rounded bg-surface-overlay px-2 py-0.5 text-xs font-medium text-content-muted">
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
      <div className="mb-4 rounded-xl bg-brand-muted p-3 text-brand">
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
    <div className="rounded-lg border border-brand/20 bg-brand-muted/50 p-4">
      <p className="text-sm font-semibold text-content">{title}</p>
      <div className="mt-1 text-sm text-content-muted">{children}</div>
    </div>
  );
}

export function LoadingGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card h-28 animate-pulse bg-surface-overlay/50" />
      ))}
    </div>
  );
}
