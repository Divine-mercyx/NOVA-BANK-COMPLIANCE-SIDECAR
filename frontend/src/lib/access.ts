import type { User } from "./api";
import { can } from "./roles";

/**
 * Which permission opens each page (any one of them is enough). The server checks the same permissions on
 * every request; this only decides what the menu shows and when to show "Access denied".
 */
export const PAGE_PERMISSIONS: Record<string, string[]> = {
  "/": ["dashboard.view"],
  "/extraction": ["extraction.view"],
  "/quality": ["quality.view"],
  "/reports": ["transactions.view"],
  "/audit": ["audit.view"],
  "/users": ["team.view", "team.manage"],
  "/roles": ["roles.manage", "team.manage", "team.view"],
  "/daily": ["dtd.view"],
  "/integration/docs": ["integration.view"],
  "/integration/keys": ["apikeys.manage"],
};

type MaybeUser = Pick<User, "permissions"> | null | undefined;

export function canOpen(user: MaybeUser, path: string): boolean {
  const needed = PAGE_PERMISSIONS[path];
  return needed ? can(user, ...needed) : true;
}

/** Where to land someone who cannot see the overview: the first page they are allowed to open. */
export function firstAllowedPath(user: MaybeUser): string | null {
  return Object.keys(PAGE_PERMISSIONS).find((path) => canOpen(user, path)) ?? null;
}
