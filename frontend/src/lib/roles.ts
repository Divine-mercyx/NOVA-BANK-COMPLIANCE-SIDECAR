import type { UserRole } from "./api";

const ANALYST_ROLES: UserRole[] = ["analyst", "approver", "admin"];
const APPROVER_ROLES: UserRole[] = ["approver", "admin"];

export function canRunEtl(role: UserRole | undefined) {
  return role ? ANALYST_ROLES.includes(role) : false;
}

export function canGenerateReports(role: UserRole | undefined) {
  return role ? ANALYST_ROLES.includes(role) : false;
}

export function canApproveReports(role: UserRole | undefined) {
  return role ? APPROVER_ROLES.includes(role) : false;
}

export function canSimulateScreening(role: UserRole | undefined) {
  return role ? ANALYST_ROLES.includes(role) : false;
}

export function canResolveAlerts(role: UserRole | undefined) {
  return role ? ANALYST_ROLES.includes(role) : false;
}

export function canEscalateAlerts(role: UserRole | undefined) {
  return role ? APPROVER_ROLES.includes(role) : false;
}

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
