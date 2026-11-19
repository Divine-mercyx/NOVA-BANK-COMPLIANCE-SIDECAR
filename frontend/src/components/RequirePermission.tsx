import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { canOpen, firstAllowedPath } from "../lib/access";
import { useAuth } from "../lib/auth";
import { AccessDeniedPage } from "../pages/AccessDeniedPage";

/** Renders the page only for users allowed to open it (see lib/access.ts); otherwise "Access denied". */
export function RequirePermission({ path, children }: { path: string; children: ReactNode }) {
  const { user } = useAuth();
  return canOpen(user, path) ? <>{children}</> : <AccessDeniedPage path={path} />;
}

/** The home page: the overview, or the first page this user may open if they cannot see the overview. */
export function HomeRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  if (canOpen(user, "/")) return <>{children}</>;
  const first = firstAllowedPath(user);
  return first && first !== pathname ? <Navigate to={first} replace /> : <AccessDeniedPage path="/" />;
}
