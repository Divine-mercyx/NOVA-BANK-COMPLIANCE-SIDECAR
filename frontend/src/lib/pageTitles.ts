const TITLES: Record<string, string> = {
  "/": "Overview",
  "/extraction": "Extraction",
  "/quality": "Data quality",
  "/reports": "Transactions",
  "/audit": "Audit trail",
  "/users": "Team",
  "/daily": "Day transaction detail",
  "/integration/docs": "API documentation",
  "/integration/keys": "API keys",
};

export function pageTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname];
  if (pathname.startsWith("/integration")) return "Integration";
  return "Compliance";
}
