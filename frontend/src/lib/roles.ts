import type { User } from "./api";

/** True when the user holds any of the given permissions (see backend app/core/permissions.py). */
export function can(user: Pick<User, "permissions"> | null | undefined, ...permissions: string[]): boolean {
  if (!user?.permissions) return false;
  return permissions.some((p) => user.permissions.includes(p));
}

type MaybeUser = Pick<User, "permissions"> | null | undefined;

export const canRunEtl = (user: MaybeUser) => can(user, "extraction.run");
export const canControlDailyFeed = (user: MaybeUser) => can(user, "dtd.control");
export const canGenerateReports = (user: MaybeUser) => can(user, "reports.generate");
export const canApproveReports = (user: MaybeUser) => can(user, "reports.approve");
export const canSimulateScreening = (user: MaybeUser) => can(user, "screening.action");
export const canResolveAlerts = (user: MaybeUser) => can(user, "screening.action");
export const canEscalateAlerts = (user: MaybeUser) => can(user, "screening.escalate");
export const canManageApiKeys = (user: MaybeUser) => can(user, "apikeys.manage");
export const canManageTeam = (user: MaybeUser) => can(user, "team.manage");
export const canManageRoles = (user: MaybeUser) => can(user, "roles.manage");

export function extractModeLabel(mode: string) {
  if (mode === "oracle") return "Oracle (live Finacle)";
  if (mode === "csv") return "CSV samples (UAT export)";
  if (mode === "mock") return "Mock data";
  return mode;
}

export function extractSourceLabel(source: string) {
  const labels: Record<string, string> = {
    finacle_replica: "Finacle replica",
    api_ingest: "Nova middleware push",
    csv: "CSV file export",
    oracle: "Oracle UAT",
    mock: "Mock generator",
  };
  return labels[source] ?? source.replace(/_/g, " ");
}
