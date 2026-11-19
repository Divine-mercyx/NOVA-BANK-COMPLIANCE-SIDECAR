import { ShieldOff } from "lucide-react";
import { Link } from "react-router-dom";
import { firstAllowedPath } from "../lib/access";
import { useAuth } from "../lib/auth";
import { pageTitle } from "../lib/pageTitles";

/** Shown in place of a page the signed-in user has no permission for. */
export function AccessDeniedPage({ path }: { path?: string }) {
  const { user } = useAuth();
  const home = firstAllowedPath(user);
  const what = path ? pageTitle(path) : "this page";

  return (
    <div className="flex min-h-[55vh] items-center justify-center px-2">
      <div className="card max-w-md p-8 text-center" role="alert">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <ShieldOff className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-semibold text-content">Access denied</h2>
        <p className="mt-2 text-sm text-content-muted">
          {home
            ? `You do not have permission to open ${what}. If you need it for your work, ask an administrator to add it to your role or your account.`
            : "Your account does not have access to any part of the portal yet. Ask an administrator to give you a role."}
        </p>
        {home && home !== path && (
          <Link to={home} className="btn-primary mt-6 inline-flex">
            Go to {pageTitle(home)}
          </Link>
        )}
      </div>
    </div>
  );
}
