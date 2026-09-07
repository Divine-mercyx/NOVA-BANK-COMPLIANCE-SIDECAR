import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Plug,
  Search,
  Settings,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/format";
import { useSidebar } from "../lib/sidebar";
import { ThemeToggle } from "./ThemeToggle";

const reportingNav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/extraction", label: "Extraction", icon: Activity },
  { to: "/quality", label: "Data Quality", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileText },
  { to: "/audit", label: "Audit Trail", icon: ClipboardList },
  { to: "/users", label: "Team", icon: Users },
];

const screeningNav = [
  { to: "/screening", label: "Alert Queue", icon: AlertTriangle, end: true },
  { to: "/screening/performance", label: "Performance", icon: Gauge },
  { to: "/screening/audit", label: "Screening Log", icon: Zap },
];

const integrationNav = [
  { to: "/integration/docs", label: "API Docs", icon: Plug, end: true },
  { to: "/integration/keys", label: "API Keys", icon: KeyRound },
];

function NavSection({
  title,
  items,
  expanded,
}: {
  title: string;
  items: typeof reportingNav;
  expanded: boolean;
}) {
  return (
    <div className="mb-4">
      {expanded && (
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-content-subtle">
          {title}
        </p>
      )}
      <div className={`flex flex-col gap-1 ${expanded ? "px-2" : "items-center px-0"}`}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={!expanded ? label : undefined}
            className={({ isActive }) =>
              expanded
                ? `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "bg-brand-muted text-brand"
                      : "text-content-muted hover:bg-surface-overlay hover:text-content"
                  }`
                : `flex h-10 w-10 items-center justify-center rounded-lg transition ${
                    isActive
                      ? "bg-brand-muted text-brand"
                      : "text-content-muted hover:bg-surface-overlay hover:text-content"
                  }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {expanded && <span>{label}</span>}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { expanded, toggle, width } = useSidebar();
  const { pathname } = useLocation();
  const isScreening = pathname.startsWith("/screening");

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const searchPlaceholder = isScreening
    ? "Search alerts, transactions, watchlist matches..."
    : "Search transactions, reports, audit logs...";

  return (
    <div className="flex min-h-screen bg-surface">
      <aside
        className="fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-surface-raised transition-[width] duration-200 ease-in-out"
        style={{ width }}
      >
        <div className={`flex items-center border-b border-border py-4 ${expanded ? "justify-between px-4" : "justify-center px-2"}`}>
          <div className={`flex items-center gap-3 ${expanded ? "" : "justify-center"}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground shadow-soft">
              <Shield className="h-5 w-5" />
            </div>
            {expanded && (
              <div className="min-w-0">
                <p className="truncate font-semibold text-content">Nova</p>
                <p className="truncate text-[11px] text-content-muted">Compliance Platform</p>
              </div>
            )}
          </div>
          {expanded && (
            <button type="button" onClick={toggle} className="btn-ghost rounded-lg p-1.5" title="Collapse sidebar">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {!expanded && (
          <button
            type="button"
            onClick={toggle}
            className="mx-auto mt-2 flex h-8 w-8 items-center justify-center rounded-lg text-content-muted hover:bg-surface-overlay"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto py-4">
          <NavSection title="Milestone 1 · Reporting" items={reportingNav} expanded={expanded} />
          <NavSection title="Milestone 2 · Screening" items={screeningNav} expanded={expanded} />
          <NavSection title="Integration · Nova API" items={integrationNav} expanded={expanded} />
        </nav>

        <div className={`border-t border-border p-3 ${expanded ? "" : "flex justify-center"}`}>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className={
              expanded
                ? "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-content-muted hover:bg-surface-overlay hover:text-danger"
                : "flex h-10 w-10 items-center justify-center rounded-lg text-content-muted hover:bg-surface-overlay hover:text-danger"
            }
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {expanded && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col transition-[margin] duration-200 ease-in-out" style={{ marginLeft: width }}>
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface-raised/90 px-6 backdrop-blur-md">
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
            <input type="search" placeholder={searchPlaceholder} className="input w-full pl-10" />
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button type="button" className="btn-ghost relative rounded-lg p-2">
              <Bell className="h-5 w-5" />
            </button>
            <button type="button" className="btn-ghost rounded-lg p-2">
              <Settings className="h-5 w-5" />
            </button>
            <div className="ml-2 flex items-center gap-3 border-l border-border pl-4">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold text-content">{user?.full_name}</p>
                <p className="text-xs text-content-muted">{user ? roleLabel(user.role) : ""}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-xs font-bold text-brand-foreground">
                {initials ?? "?"}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
