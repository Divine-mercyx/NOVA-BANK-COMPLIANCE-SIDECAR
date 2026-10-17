import { Bell, BookOpen, ChevronDown, KeyRound, LogOut, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { api, type AuditEvent } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLiveChanges, useLiveStatus } from "../lib/live";
import { actionLabel, formatRelative, roleLabel } from "../lib/format";
import { spring } from "../lib/motion";
import { BrandMark } from "./BrandMark";
import { PageTransition } from "./motion";

/** `match` lets one link stay active across a whole section (Integration has two pages). */
const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/extraction", label: "Extraction" },
  { to: "/quality", label: "Quality" },
  { to: "/reports", label: "Transactions" },
  { to: "/daily", label: "Daily feed" },
  { to: "/audit", label: "Audit" },
  { to: "/users", label: "Team" },
  { to: "/integration/docs", label: "Integration", match: "/integration" },
] as const;

const INTEGRATION_LINKS = [
  { to: "/integration/docs", label: "API documentation", icon: BookOpen },
  { to: "/integration/keys", label: "API keys", icon: KeyRound },
];

function isActive(pathname: string, item: (typeof NAV)[number]) {
  if ("end" in item && item.end) return pathname === item.to;
  const base = "match" in item ? item.match : item.to;
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** Open/close state for a header popover: closes on navigation, outside click and Escape. */
function usePopover(
  pathname: string,
): [boolean, (v: boolean | ((p: boolean) => boolean)) => void, RefObject<HTMLDivElement>, RefObject<HTMLButtonElement>] {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !trigger.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return [open, setOpen, panel, trigger];
}

function Popover({
  id,
  panelRef,
  children,
  width = "w-72",
}: {
  id: string;
  panelRef: RefObject<HTMLDivElement>;
  children: ReactNode;
  width?: string;
}) {
  return (
    <motion.div
      key={id}
      id={id}
      ref={panelRef}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
      transition={spring}
      className={`absolute right-0 top-12 ${width} origin-top-right rounded-xl border border-border bg-white p-2 shadow-lg`}
    >
      {children}
    </motion.div>
  );
}

/** Global search: jumps to Transactions filtered by the query (reference, name, account, narration). */
function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/reports?q=${encodeURIComponent(term)}` : "/reports");
  };
  return (
    <form role="search" onSubmit={onSubmit} className="relative hidden md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-subtle" aria-hidden />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search transactions"
        aria-label="Search transactions by reference, name or account"
        className="input h-9 w-56 !py-0 pl-9"
      />
    </form>
  );
}

/** Bell: the latest audit-trail events (the portal's real activity feed). */
function Notifications({ pathname }: { pathname: string }) {
  const [open, setOpen, panel, trigger] = usePopover(pathname);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [unread, setUnread] = useState(false);
  const status = useLiveStatus();

  const fetchEvents = () =>
    api
      .audit()
      .then((rows) => setEvents(rows.slice(0, 6)))
      .catch(() => setEvents([]));

  useEffect(() => {
    if (!open) return;
    setUnread(false);
    void fetchEvents();
  }, [open]);

  // New audit entries are pushed over the live socket: refresh the open list or flag the bell.
  useLiveChanges(["audit"], () => {
    if (open) void fetchEvents();
    else setUnread(true);
  });

  return (
    <div className="relative">
      <motion.button
        ref={trigger}
        type="button"
        data-motion
        whileTap={{ scale: 0.95 }}
        transition={spring}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="notifications"
        aria-label={unread ? "Recent activity, new events" : "Recent activity"}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-content-muted shadow-soft transition-colors hover:text-content"
      >
        <Bell className="h-4 w-4" />
        {unread && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" aria-hidden />}
      </motion.button>
      <AnimatePresence>
        {open && (
          <Popover id="notifications" panelRef={panel} width="w-80">
            <div className="flex items-center justify-between px-3 pb-2 pt-1.5">
              <p className="text-sm font-semibold text-content">Recent activity</p>
              <span className="inline-flex items-center gap-1.5 text-xs text-content-muted">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${status === "open" ? "status-live bg-emerald-500" : "bg-amber-500"}`}
                  aria-hidden
                />
                {status === "open" ? "Live" : "Reconnecting"}
              </span>
            </div>
            {events === null ? (
              <p className="px-3 py-4 text-sm text-content-muted">Loading…</p>
            ) : events.length === 0 ? (
              <p className="px-3 py-4 text-sm text-content-muted">No activity yet.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {events.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-content">{actionLabel(e.action)}</p>
                      <p className="truncate text-xs text-content-muted">{e.actor_name}</p>
                    </div>
                    <span className="shrink-0 text-xs text-content-subtle">{formatRelative(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 border-t border-border px-3 pb-1 pt-2">
              <Link to="/audit" className="text-sm font-medium text-brand hover:text-brand-hover">
                View audit trail
              </Link>
            </div>
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountMenu({ pathname }: { pathname: string }) {
  const { user, logout } = useAuth();
  const [open, setOpen, panel, trigger] = usePopover(pathname);
  const initials = user?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative">
      <motion.button
        ref={trigger}
        type="button"
        data-motion
        whileTap={{ scale: 0.97 }}
        transition={spring}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="account-menu"
        aria-haspopup="true"
        aria-label={open ? "Close account menu" : "Open account menu"}
        className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 transition-colors hover:bg-slate-100"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
          {initials ?? "?"}
        </span>
        <span className="hidden whitespace-nowrap text-sm font-medium text-content 2xl:block">{user?.full_name}</span>
        <ChevronDown className={`h-4 w-4 text-content-subtle transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </motion.button>

      <AnimatePresence>
        {open && (
          <Popover id="account-menu" panelRef={panel}>
            {user && (
              <div className="border-b border-border px-3 pb-3 pt-2">
                <p className="truncate text-sm font-semibold text-content">{user.full_name}</p>
                <p className="truncate text-xs text-content-muted">
                  {user.email} · {roleLabel(user.role)}
                </p>
              </div>
            )}

            {/* Below xl the main nav is hidden, so the menu carries every section. */}
            <nav aria-label="Sections" className="border-b border-border py-2 xl:hidden">
              {NAV.filter((n) => n.label !== "Integration").map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive(pathname, item) ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive(pathname, item) ? "bg-brand-muted text-brand" : "text-content-muted hover:bg-slate-50 hover:text-content"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="border-b border-border py-2">
              <p className="px-3 pb-1 text-xs font-medium text-content-subtle">Integration</p>
              {INTEGRATION_LINKS.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium ${
                    pathname === to ? "bg-brand-muted text-brand" : "text-content-muted hover:bg-slate-50 hover:text-content"
                  }`}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {label}
                </Link>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-content-muted hover:bg-slate-50 hover:text-content"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Sign out
              </button>
            </div>
          </Popover>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const outlet = useOutlet();

  return (
    <div className="relative min-h-screen">
      <div className="app-canvas" aria-hidden />

      <header className="sticky top-0 z-40 border-b border-border bg-white">
        <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="Nova Bank Compliance, home">
            <BrandMark />
            <span className="text-base font-semibold tracking-tight text-content">Nova Bank</span>
          </Link>

          <nav aria-label="Primary" className="hidden h-full items-stretch xl:flex">
            {NAV.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex items-center whitespace-nowrap px-2.5 text-sm font-medium transition-colors ${
                    active ? "text-content" : "text-content-muted hover:text-content"
                  }`}
                >
                  {item.label}
                  {active && (
                    <motion.span
                      layoutId="topnav-active"
                      className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-brand"
                      transition={spring}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <GlobalSearch />
            <Notifications pathname={pathname} />
            <AccountMenu pathname={pathname} />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-[1280px] px-6 py-8">
        <PageTransition routeKey={pathname}>{outlet}</PageTransition>
      </main>
    </div>
  );
}
