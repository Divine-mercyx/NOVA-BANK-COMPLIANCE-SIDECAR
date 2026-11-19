import {
  Activity,
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
  Menu,
  Plug,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { canOpen } from "../lib/access";
import { useAuth } from "../lib/auth";
import { roleLabel } from "../lib/format";
import { pageTitle } from "../lib/pageTitles";
import { useSidebar } from "../lib/sidebar";
import { DESKTOP_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { BrandLogo } from "./BrandLogo";
import { PageTransition } from "./PageTransition";
import { ThemeToggle } from "./ThemeToggle";

/** Sidebar width when it opens as a drawer on phones and tablets. */
const DRAWER_WIDTH = 272;

const reportingNav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/extraction", label: "Extraction", icon: Activity },
  { to: "/quality", label: "Data quality", icon: BarChart3 },
  { to: "/reports", label: "Transactions", icon: FileText },
  { to: "/audit", label: "Audit trail", icon: ClipboardList },
  { to: "/users", label: "Team", icon: Users },
  { to: "/roles", label: "Roles & permissions", icon: ShieldCheck },
];

const dailyNav = [{ to: "/daily", label: "Day transaction detail", icon: FileText, end: true }];

const allIntegrationChildren = [
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
  items: allItems,
  expanded,
}: {
  title: string;
  items: typeof reportingNav;
  expanded: boolean;
}) {
  const { user } = useAuth();
  const items = allItems.filter(({ to }) => canOpen(user, to));
  if (items.length === 0) return null;
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
  const { user } = useAuth();
  const integrationChildren = allIntegrationChildren.filter(({ to }) => canOpen(user, to));
  const { pathname } = useLocation();
  const onIntegration = pathname.startsWith("/integration");
  const [open, setOpen] = useState(onIntegration);
  const showChildren = expanded && (open || onIntegration);
  if (integrationChildren.length === 0) return null;

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
  const { expanded: desktopExpanded, toggle, width: desktopWidth } = useSidebar();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const title = pageTitle(pathname);

  // Desktop: the sidebar sits beside the content and can collapse to icons.
  // Phones and tablets: it is a drawer over the content, opened from the menu button.
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const expanded = isDesktop ? desktopExpanded : true;
  const sidebarWidth = isDesktop ? desktopWidth : DRAWER_WIDTH;
  const [query, setQuery] = useState("");

  // Close the drawer on navigation, and when the screen grows to desktop.
  useEffect(() => setDrawerOpen(false), [pathname, isDesktop]);

  // A closed drawer is off-screen: keep keyboard focus and screen readers out of it.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const hidden = !isDesktop && !drawerOpen;
    asideRef.current?.toggleAttribute("inert", hidden);
    if (hidden) asideRef.current?.setAttribute("aria-hidden", "true");
    else asideRef.current?.removeAttribute("aria-hidden");
  }, [isDesktop, drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // The header search looks through staged transactions on the Transactions page.
  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/reports?q=${encodeURIComponent(q)}` : "/reports");
  };

  return (
    <div className="flex min-h-screen nova-workspace-bg">
      {!isDesktop && drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 backdrop-blur-[2px]"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <aside
        id="nova-sidebar"
        className={`nova-sidebar fixed inset-y-0 left-0 z-40 flex flex-col duration-200 ease-in-out ${
          isDesktop ? "transition-[width]" : `transition-transform ${drawerOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`
        }`}
        style={{ width: sidebarWidth }}
        aria-label="Main navigation"
        ref={asideRef}
      >
        <div className={`flex items-center py-5 ${expanded ? "justify-between px-5" : "justify-center px-2"}`}>
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-md ${
                expanded ? "h-10 max-w-[148px] px-2" : "h-10 w-10 p-1"
              }`}
            >
              <BrandLogo
                compact={!expanded}
                className={expanded ? "h-7 w-auto max-w-full object-contain" : "h-full w-full object-contain object-left"}
              />
            </div>
            {expanded && (
              <p className="min-w-0 text-[11px] font-medium leading-tight text-sidebar-muted">Compliance sidecar</p>
            )}
          </div>
          {isDesktop && expanded && (
            <button
              type="button"
              onClick={toggle}
              className="rounded-xl p-1.5 text-sidebar-muted transition hover:bg-white/10 hover:text-sidebar-foreground"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="rounded-xl p-1.5 text-sidebar-muted transition hover:bg-white/10 hover:text-sidebar-foreground"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {isDesktop && !expanded && (
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
            <p className="px-1 text-[10px] text-sidebar-muted">{user ? user.role_name ?? roleLabel(user.role) : ""}</p>
          )}
        </div>
      </aside>

      <div
        className="flex min-h-screen min-w-0 flex-1 flex-col p-2 sm:p-4"
        style={{ marginLeft: isDesktop ? desktopWidth : 0 }}
      >
        <div className="nova-app-panel flex min-h-[calc(100vh-1rem)] min-w-0 flex-1 flex-col overflow-hidden rounded-[22px] sm:min-h-[calc(100vh-2rem)] sm:rounded-[28px]">
          <header className="relative flex h-[4.25rem] shrink-0 items-center gap-3 border-b border-border/80 px-4 sm:gap-4 sm:px-7">
            <div className="wow-header-accent absolute inset-x-0 bottom-0 h-px" aria-hidden />
            {!isDesktop && (
              <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="btn-ghost -ml-1 shrink-0 rounded-xl p-2"
                aria-label="Open menu"
                aria-controls="nova-sidebar"
                aria-expanded={drawerOpen}
              >
                <Menu className="h-5 w-5" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-content sm:text-xl">{title}</h1>
              <p className="hidden text-xs text-content-muted sm:block">Nova compliance · Finacle staging</p>
            </div>
            {canOpen(user, "/reports") && (
            <form role="search" onSubmit={submitSearch} className="relative ml-auto hidden max-w-md flex-1 md:block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search transactions…"
                aria-label="Search transactions"
                className="input w-full rounded-full border-transparent bg-surface py-2.5 pl-10 shadow-inner"
              />
            </form>
            )}
            <div className="ml-auto flex items-center gap-1 md:ml-0">
              <ThemeToggle />
            </div>
          </header>

          <main className="relative z-[1] min-w-0 flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </div>
    </div>
  );
}
