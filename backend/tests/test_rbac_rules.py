"""Role-based access control: the catalogue, the built-in roles, and that every staff route checks a permission."""

from fastapi.routing import APIRoute, APIWebSocketRoute

from app.core.permissions import (
    ACCESS_ADMIN_PERMISSIONS,
    ALL_PERMISSIONS,
    CATALOGUE,
    SYSTEM_ROLE_DEFAULTS,
    effective_permissions,
    normalize,
)


def test_catalogue_keys_are_unique_and_grouped():
    keys = [p.key for p in CATALOGUE]
    assert len(keys) == len(set(keys))
    assert all(p.group and p.label for p in CATALOGUE)
    assert ACCESS_ADMIN_PERMISSIONS <= ALL_PERMISSIONS


def test_effective_permissions_role_plus_extra_minus_revoked():
    assert effective_permissions(["audit.view", "dashboard.view"], False, ["quality.view"], ["dashboard.view"]) == {
        "audit.view",
        "quality.view",
    }
    assert effective_permissions([], True, [], []) == set(ALL_PERMISSIONS)
    assert effective_permissions([], True, [], ["team.manage"]) == set(ALL_PERMISSIONS) - {"team.manage"}
    assert effective_permissions(["not.a.permission"], False, ["also.not"], []) == set()


def test_builtin_roles_keep_the_access_they_had_before():
    def perms(key):
        spec = SYSTEM_ROLE_DEFAULTS[key]
        return effective_permissions(spec["permissions"], spec["all_permissions"], [], [])

    viewer, analyst, approver, admin = perms("viewer"), perms("analyst"), perms("approver"), perms("admin")
    assert admin == set(ALL_PERMISSIONS)
    assert not any(p.endswith((".run", ".control", ".manage", ".action", ".escalate")) for p in viewer)
    assert {"extraction.run", "dtd.control", "screening.action"} <= analyst
    assert "screening.escalate" not in analyst
    assert "screening.escalate" in approver
    assert not any(p.startswith("reports.") for p in ALL_PERMISSIONS)  # report generate/approve is no longer part of the portal
    for role in (viewer, analyst, approver):
        assert not role & {"team.manage", "roles.manage", "apikeys.manage", "team.view"}
    assert viewer < analyst < approver < admin


def test_normalize_orders_and_drops_unknown():
    assert normalize(["team.manage", "audit.view", "bogus", "audit.view"]) == ["audit.view", "team.manage"]


def _checks_a_permission(dependant) -> bool:
    for dep in dependant.dependencies:
        call = getattr(dep, "call", None)
        if call is not None and "require_permission" in getattr(call, "__qualname__", ""):
            return True
        if _checks_a_permission(dep):
            return True
    return False


# Routes that are meant to need only a session (or none): sign-in, your own session, the catalogue, the live
# socket (it carries row ids only; data comes from permission-checked endpoints).
SESSION_ONLY = {
    "/api/v1/auth/login",
    "/api/v1/auth/verify-otp",
    # First sign-in (the challenge from the password step is the credential) and your own two-factor settings.
    "/api/v1/auth/2fa/setup",
    "/api/v1/auth/2fa/enable",
    "/api/v1/auth/2fa",
    "/api/v1/auth/2fa/recovery-codes",
    "/api/v1/auth/me",
    "/api/v1/auth/logout",
    "/api/v1/access/permissions",
    "/api/v1/ws",
}


def _all_routes(app):
    """Every route in the app. Newer FastAPI versions keep included routers wrapped instead of copying their
    routes into app.routes, so look inside the wrapper too."""
    found = []
    for route in app.routes:
        if isinstance(route, (APIRoute, APIWebSocketRoute)):
            found.append(route)
        elif hasattr(route, "original_router"):
            found.extend(r for r in route.original_router.routes if isinstance(r, (APIRoute, APIWebSocketRoute)))
    return found


def test_every_staff_route_checks_a_permission():
    from app.main import app

    routes = _all_routes(app)
    staff = [r for r in routes if r.path.startswith("/api/v1/") and not r.path.startswith("/api/v1/export")]
    # Guard against checking nothing: the portal has dozens of staff routes.
    assert len(staff) >= 40, f"only found {len(staff)} staff routes; the route walk is broken"

    unguarded = []
    for route in staff:
        path = route.path
        if path in SESSION_ONLY:
            continue
        if not _checks_a_permission(route.dependant):
            unguarded.append(f"{','.join(sorted(getattr(route, 'methods', None) or ['WS']))} {path}")
    assert unguarded == [], f"staff routes with no permission check: {unguarded}"
