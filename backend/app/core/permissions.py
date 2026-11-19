"""Permission catalogue for role-based access control.

Every page and every action in the portal maps to one permission here, and every staff API checks one of
them on the server (hiding a page in the UI is not access control). Roles are named bundles of these that
an administrator creates and edits; each staff member has one role plus their own extra and removed
permissions on top of it.

The catalogue lives in code, not the database: a permission only means something if an endpoint checks it,
so adding one is a code change. Roles and assignments live in the database and change without a release.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class Permission:
    key: str
    label: str
    group: str
    description: str


CATALOGUE: tuple[Permission, ...] = (
    # Reporting
    Permission("dashboard.view", "View overview", "Reporting", "The overview dashboard and its figures."),
    Permission("extraction.view", "View extractions", "Reporting", "Extraction runs, their status and logs."),
    Permission("extraction.run", "Run extractions", "Reporting", "Start a Finacle extraction for a date range."),
    Permission("quality.view", "View data quality", "Reporting", "Validation rates, error breakdowns and spot-checks."),
    Permission("transactions.view", "View transactions", "Reporting", "Staged transactions and their CTR, FTR, PEP and STR flags."),
    Permission("reports.generate", "Generate reports", "Reporting", "Create regulatory report files (API)."),
    Permission("reports.approve", "Approve and submit reports", "Reporting", "Approve, reject or submit regulatory reports (API)."),
    Permission("audit.view", "View audit trail", "Reporting", "The log of every action in the portal."),
    # Daily feed
    Permission("dtd.view", "View day transaction detail", "Daily feed", "The same-day Finacle feed and its records."),
    Permission("dtd.control", "Start and stop the daily feed", "Daily feed", "Turn the 30-minute same-day feed on or off."),
    # Screening
    Permission("screening.view", "View screening", "Screening", "Screening alerts, performance and the screening log."),
    Permission("screening.action", "Clear or block alerts", "Screening", "Approve or reject screening alerts, and simulate alerts."),
    Permission("screening.escalate", "Escalate alerts", "Screening", "Escalate a screening alert to senior compliance."),
    # Integration
    Permission("integration.view", "View API documentation", "Integration", "The partner API documentation and tester."),
    Permission("apikeys.manage", "Manage API keys", "Integration", "See, create and revoke partner API keys."),
    # Administration
    Permission("team.view", "View team", "Administration", "The list of staff and their access."),
    Permission("team.manage", "Manage team", "Administration", "Invite, edit and remove staff, and set their role and permissions."),
    Permission("roles.manage", "Manage roles", "Administration", "Create, edit and delete roles."),
)

ALL_PERMISSIONS: frozenset[str] = frozenset(p.key for p in CATALOGUE)

# Who can manage access. At least one active user must always hold both, so nobody locks everyone out.
ACCESS_ADMIN_PERMISSIONS: frozenset[str] = frozenset({"team.manage", "roles.manage"})

_VIEW = (
    "dashboard.view",
    "extraction.view",
    "quality.view",
    "transactions.view",
    "audit.view",
    "dtd.view",
    "screening.view",
    "integration.view",
)

# The four built-in roles start with the access the portal gave them before roles were configurable.
SYSTEM_ROLE_DEFAULTS: dict[str, dict] = {
    "admin": {
        "name": "Admin",
        "description": "Full access, including team, roles and API keys. Always has every permission.",
        "all_permissions": True,
        "permissions": [],
    },
    "approver": {
        "name": "Approver",
        "description": "Senior compliance / MLRO: runs the pipeline and approves reports and escalations.",
        "all_permissions": False,
        "permissions": [
            *_VIEW,
            "extraction.run",
            "dtd.control",
            "reports.generate",
            "reports.approve",
            "screening.action",
            "screening.escalate",
        ],
    },
    "analyst": {
        "name": "Analyst",
        "description": "Compliance analyst: runs extractions and the daily feed, and works screening alerts.",
        "all_permissions": False,
        "permissions": [*_VIEW, "extraction.run", "dtd.control", "reports.generate", "screening.action"],
    },
    "viewer": {
        "name": "Viewer",
        "description": "Read-only: internal audit and other stakeholders.",
        "all_permissions": False,
        "permissions": [*_VIEW],
    },
}


def normalize(keys: Iterable[str] | None) -> list[str]:
    """Known permission keys only, de-duplicated, in catalogue order."""
    wanted = set(keys or ())
    return [p.key for p in CATALOGUE if p.key in wanted]


def unknown(keys: Iterable[str] | None) -> list[str]:
    return sorted(set(keys or ()) - ALL_PERMISSIONS)


def effective_permissions(
    role_permissions: Iterable[str] | None,
    role_all: bool,
    extra: Iterable[str] | None,
    revoked: Iterable[str] | None,
) -> set[str]:
    """What a user can do: their role's permissions, plus their extras, minus their removals."""
    base = set(ALL_PERMISSIONS) if role_all else set(role_permissions or ())
    return ((base | set(extra or ())) - set(revoked or ())) & ALL_PERMISSIONS


def catalogue_payload() -> list[dict]:
    return [{"key": p.key, "label": p.label, "group": p.group, "description": p.description} for p in CATALOGUE]
