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
  Users,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/format";
import { NOVA_BANK_LOGO_URL } from "../lib/brand";
import { pageTitle } from "../lib/pageTitles";
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
  const base = `group sidebar-nav-link ${expanded ? "sidebar-nav-link-expanded" : "sidebar-nav-link-collapsed"}`;
  if (isActive) {
    return expanded
      ? `${base} sidebar-nav-link-active-expanded`
      : `${base} sidebar-nav-link-active-collapsed`;
  }
  return `${base} sidebar-nav-link-idle`;
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
    <div className="mb-5">
      {expanded && (
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">{title}</p>
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
            <Icon className="sidebar-nav-icon" strokeWidth={1.75} />
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
      <div className="mb-5 flex flex-col items-center gap-0.5">
        {integrationChildren.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} title={label} className={({ isActive }) => navClass(isActive, false)}>
            <Icon className="sidebar-nav-icon" strokeWidth={1.75} />
          </NavLink>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-5 px-2">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-muted">Integration</p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group sidebar-nav-link sidebar-nav-link-expanded w-full ${
          onIntegration ? "sidebar-nav-link-active-expanded" : "sidebar-nav-link-idle"
        }`}
      >
        <Plug className="sidebar-nav-icon" strokeWidth={1.75} />
        <span className="flex-1 text-left">Integration</span>
        <ChevronDown className={`h-3.5 w-3.5 text-sidebar-muted transition ${showChildren ? "rotate-180" : ""}`} />
      </button>
      {showChildren && (
        <div className="mt-0.5 ml-4 border-l border-white/10 pl-2">
          {integrationChildren.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive
                  ? "group sidebar-nav-child sidebar-nav-child-active"
                  : "group sidebar-nav-child sidebar-nav-child-idle"
              }
            >
              <Icon className="sidebar-nav-icon h-3.5 w-3.5" strokeWidth={1.75} />
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
  const title = pageTitle(pathname);

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const searchPlaceholder = isDaily ? "Search same-day DTD…" : "Search records…";

  return (
    <div className="flex min-h-screen nova-workspace-bg">
      <aside
        className="nova-sidebar fixed inset-y-0 left-0 z-30 flex flex-col transition-[width] duration-200 ease-in-out"
        style={{ width }}
      >
        <div className={`flex items-center py-5 ${expanded ? "justify-between px-5" : "justify-center px-2"}`}>
          <div className="flex items-center gap-2.5">
            <div
              className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md ${
                expanded ? "h-10 max-w-[148px] px-2" : "h-10 w-10 p-1"
              }`}
            >
              <img
                src={NOVA_BANK_LOGO_URL}
                alt="Nova Bank"
                className={expanded ? "h-7 w-auto max-w-full object-contain" : "h-full w-full object-contain object-left"}
              />
            </div>
            {expanded && (
              <p className="min-w-0 truncate text-[11px] font-medium text-sidebar-muted">Compliance sidecar</p>
            )}
          </div>
          {expanded && (
            <button
              type="button"
              onClick={toggle}
              className="rounded-xl p-1.5 text-sidebar-muted transition hover:bg-white/10 hover:text-sidebar-foreground"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {!expanded && (
          <button
            type="button"
            onClick={toggle}
            className="mx-auto mb-3 flex h-8 w-8 items-center justify-center rounded-xl text-sidebar-muted hover:bg-white/10"
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

        <div className={`border-t border-white/10 p-4 ${expanded ? "" : "flex flex-col items-center gap-2"}`}>
          {expanded && user && (
            <div className="mb-3 flex items-center gap-3 rounded-2xl bg-white/8 px-3 py-3 ring-1 ring-white/10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/90 text-xs font-semibold text-white">
                {initials ?? "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.full_name}</p>
                <p className="truncate text-xs text-sidebar-muted">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded-lg p-1.5 text-sidebar-muted hover:bg-white/10 hover:text-sidebar-foreground"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
          {!expanded && (
            <button
              type="button"
              onClick={() => void logout()}
              title="Sign out"
              className="flex h-10 w-10 items-center justify-center rounded-xl text-sidebar-muted hover:bg-white/10"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
          {expanded && (
            <p className="px-1 text-[10px] text-sidebar-muted">{user ? roleLabel(user.role) : ""}</p>
          )}
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col p-3 sm:p-4" style={{ marginLeft: width }}>
        <div className="nova-app-panel flex min-h-[calc(100vh-1.5rem)] flex-1 flex-col overflow-hidden rounded-[28px]">
          <header className="flex h-[4.25rem] shrink-0 items-center gap-4 border-b border-border/80 px-5 sm:px-7">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-content sm:text-xl">{title}</h1>
              <p className="hidden text-xs text-content-muted sm:block">Nova compliance · Finacle staging</p>
            </div>
            <div className="relative ml-auto hidden max-w-md flex-1 md:block">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
              <input
                type="search"
                placeholder={searchPlaceholder}
                className="input w-full rounded-full border-transparent bg-surface py-2.5 pl-10 shadow-inner"
              />
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <button type="button" className="btn-ghost rounded-full p-2.5">
                <Bell className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="btn-ghost rounded-xl bg-accent p-2.5 text-accent-foreground hover:bg-accent-hover"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
