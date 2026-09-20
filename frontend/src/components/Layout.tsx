import {
  Activity,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  BarChart3,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Plug,
  Search,
  Settings,
  Shield,
  Users,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/format";
import { useSidebar } from "../lib/sidebar";
import { ThemeToggle } from "./ThemeToggle";

const reportingNav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/extraction", label: "Extraction", icon: Activity },
  { to: "/quality", label: "Data quality", icon: BarChart3 },
  { to: "/reports", label: "Transactions", icon: FileText },
  { to: "/audit", label: "Audit trail", icon: ClipboardList },
  { to: "/users", label: "Team", icon: Users },
];

const dailyNav = [{ to: "/daily", label: "Day transaction detail", icon: FileText, end: true }];

const integrationChildren = [
  { to: "/integration/docs", label: "API documentation", icon: BookOpen },
  { to: "/integration/keys", label: "API keys", icon: KeyRound },
];

function navClass(isActive: boolean, expanded: boolean) {
  if (expanded) {
    return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
      isActive ? "bg-white font-medium text-content shadow-soft" : "text-content-muted hover:bg-white/70 hover:text-content"
    }`;
  }
  return `flex h-10 w-10 items-center justify-center rounded-xl ${
    isActive ? "bg-white text-content shadow-soft" : "text-content-muted hover:bg-white/70 hover:text-content"
  }`;
}

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
    <div className="mb-6">
      {expanded && (
        <p className="mb-2 px-3 text-[11px] font-medium text-content-subtle">{title}</p>
      )}
      <div className={`flex flex-col gap-0.5 ${expanded ? "px-2" : "items-center px-0"}`}>
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={!expanded ? label : undefined}
            className={({ isActive }) => navClass(isActive, expanded)}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {expanded && <span>{label}</span>}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function IntegrationNav({ expanded }: { expanded: boolean }) {
  const { pathname } = useLocation();
  const onIntegration = pathname.startsWith("/integration");
  const [open, setOpen] = useState(onIntegration);
  const showChildren = expanded && (open || onIntegration);

  if (!expanded) {
    return (
      <div className="mb-6 flex flex-col items-center gap-0.5">
        {integrationChildren.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} title={label} className={({ isActive }) => navClass(isActive, false)}>
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </NavLink>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-6 px-2">
      <p className="mb-2 px-3 text-[11px] font-medium text-content-subtle">Integration</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
          onIntegration ? "text-content" : "text-content-muted hover:bg-white/70 hover:text-content"
        }`}
      >
        <Plug className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 text-left">Integration</span>
        <ChevronDown className={`h-3.5 w-3.5 text-content-subtle transition ${showChildren ? "rotate-180" : ""}`} />
      </button>
      {showChildren && (
        <div className="mt-0.5 ml-4 border-l border-border pl-2">
          {integrationChildren.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm ${
                  isActive ? "bg-white font-medium text-content shadow-soft" : "text-content-muted hover:bg-white/70 hover:text-content"
                }`
              }
            >
              <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { expanded, toggle, width } = useSidebar();
  const { pathname } = useLocation();
  const isDaily = pathname.startsWith("/daily");

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const searchPlaceholder = isDaily ? "Search same-day DTD…" : "Search records…";

  return (
    <div className="flex min-h-screen bg-surface">
      <aside
        className="fixed inset-y-0 left-0 z-30 flex flex-col bg-surface transition-[width] duration-200 ease-in-out"
        style={{ width }}
      >
        <div className={`flex items-center py-5 ${expanded ? "justify-between px-5" : "justify-center px-2"}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-foreground">
              <Shield className="h-4 w-4" />
            </div>
            {expanded && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-content">Nova Bank</p>
                <p className="truncate text-[11px] text-content-muted">Compliance</p>
              </div>
            )}
          </div>
          {expanded && (
            <button type="button" onClick={toggle} className="btn-ghost rounded-xl p-1.5" title="Collapse sidebar">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {expanded && user && (
          <div className="mx-4 mb-4 flex items-center gap-3 rounded-2xl bg-white px-3 py-3 shadow-soft">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-muted text-xs font-semibold text-brand">
              {initials ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-content">{user.full_name}</p>
              <p className="truncate text-xs text-content-muted">{roleLabel(user.role)}</p>
            </div>
          </div>
        )}

        {!expanded && (
          <button
            type="button"
            onClick={toggle}
            className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-xl text-content-muted hover:bg-white"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        <nav className="flex-1 overflow-y-auto py-1">
          <NavSection title="Reporting" items={reportingNav} expanded={expanded} />
          <NavSection title="Daily feed" items={dailyNav} expanded={expanded} />
          <IntegrationNav expanded={expanded} />
        </nav>

        <div className={`p-4 ${expanded ? "" : "flex justify-center"}`}>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className={
              expanded
                ? "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-content-muted hover:bg-white hover:text-content"
                : "flex h-10 w-10 items-center justify-center rounded-xl text-content-muted hover:bg-white"
            }
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {expanded && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col p-3 sm:p-4" style={{ marginLeft: width }}>
        <div className="flex min-h-[calc(100vh-1.5rem)] flex-1 flex-col rounded-[28px] bg-surface-raised shadow-card">
          <header className="flex h-16 items-center justify-end gap-2 px-5 sm:px-7">
            <div className="relative mr-auto hidden max-w-sm flex-1 md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
              <input type="search" placeholder={searchPlaceholder} className="input w-full rounded-full pl-10" />
            </div>
            <ThemeToggle />
            <button type="button" className="btn-ghost rounded-full p-2">
              <Bell className="h-4 w-4" />
            </button>
            <button type="button" className="btn-ghost rounded-full p-2">
              <Settings className="h-4 w-4" />
            </button>
          </header>

          <main className="flex-1 px-5 pb-8 sm:px-7">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
