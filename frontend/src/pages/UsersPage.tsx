import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Mail, Pencil, Shield, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { StaffPermissionChecklist } from "../components/access/PermissionChecklist";
import { Modal } from "../components/Modal";
import { EmptyState, InfoCallout, KpiCard, PageHeader, StatusBadge, TableToolbar, Tag } from "../components/ui";
import { api, PermissionInfo, Role, User } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canManageTeam } from "../lib/roles";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Every permission a role gives (the Admin role gives all of them). */
function rolePermissions(role: Role | undefined, catalogue: PermissionInfo[]): string[] {
  if (!role) return [];
  return role.all_permissions ? catalogue.map((p) => p.key) : role.permissions;
}

interface StaffForm {
  full_name: string;
  email: string;
  password: string;
  role_id: string;
  extra_permissions: string[];
  revoked_permissions: string[];
  is_active: boolean;
}

const EMPTY_FORM: StaffForm = {
  full_name: "",
  email: "",
  password: "",
  role_id: "",
  extra_permissions: [],
  revoked_permissions: [],
  is_active: true,
};

export function UsersPage() {
  const { user: currentUser, refreshUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalogue, setCatalogue] = useState<PermissionInfo[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [showAdd, setShowAdd] = useState(false);
  const [customiseNew, setCustomiseNew] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const isManager = canManageTeam(currentUser);
  const grantable = currentUser?.permissions ?? [];
  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const defaultRoleId = roles.find((r) => r.system_key === "viewer")?.id ?? roles[0]?.id ?? "";

  const load = useCallback(async () => {
    const [u, r, c] = await Promise.all([api.users(), api.roles(), api.permissionCatalogue()]);
    setUsers(u);
    setRoles(r);
    setCatalogue(c);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load the team"));
  }, [load]);

  const activeUsers = users.filter((u) => u.is_active);
  const inactiveUsers = users.filter((u) => !u.is_active);
  const displayed = tab === "active" ? activeUsers : inactiveUsers;
  const customised = activeUsers.filter((u) => u.extra_permissions.length + u.revoked_permissions.length > 0).length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return displayed.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role_name ?? "").toLowerCase().includes(q),
    );
  }, [displayed, search]);

  /** A role can only be handed out by someone who holds everything it gives. */
  const canAssign = (role: Role) => rolePermissions(role, catalogue).every((p) => grantable.includes(p));

  const openAdd = () => {
    setForm({ ...EMPTY_FORM, role_id: defaultRoleId });
    setCustomiseNew(false);
    setFormError("");
    setShowAdd(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      full_name: u.full_name,
      email: u.email,
      password: "",
      role_id: u.role_id ?? defaultRoleId,
      extra_permissions: u.extra_permissions,
      revoked_permissions: u.revoked_permissions,
      is_active: u.is_active,
    });
    setFormError("");
  };

  const changeRole = (role_id: string) => {
    // Per-person changes are relative to the role; keep only those that still mean something.
    const fromRole = new Set(rolePermissions(roleById.get(role_id), catalogue));
    setForm((f) => ({
      ...f,
      role_id,
      extra_permissions: f.extra_permissions.filter((k) => !fromRole.has(k)),
      revoked_permissions: f.revoked_permissions.filter((k) => fromRole.has(k)),
    }));
  };

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      await api.createStaff({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        role_id: form.role_id,
        extra_permissions: customiseNew ? form.extra_permissions : [],
        revoked_permissions: customiseNew ? form.revoked_permissions : [],
      });
      setMessage(`${form.full_name} has been added as ${roleById.get(form.role_id)?.name ?? "staff"}.`);
      setError("");
      setShowAdd(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  const onEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const self = editing.id === currentUser?.id;
    setLoading(true);
    setFormError("");
    try {
      await api.updateStaff(editing.id, {
        full_name: form.full_name,
        email: form.email,
        ...(form.password ? { password: form.password } : {}),
        ...(self
          ? {}
          : {
              role_id: form.role_id,
              extra_permissions: form.extra_permissions,
              revoked_permissions: form.revoked_permissions,
              is_active: form.is_active,
            }),
      });
      setMessage(`${form.full_name} has been updated.`);
      setError("");
      setEditing(null);
      await load();
      if (self) await refreshUser();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setLoading(false);
    }
  };

  const onResetTwoFactor = async () => {
    if (!resetting) return;
    setLoading(true);
    setFormError("");
    try {
      await api.resetTwoFactor(resetting.id);
      setMessage(`${resetting.full_name} will set up a new authenticator app the next time they sign in.`);
      setError("");
      setResetting(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to reset two-factor sign-in");
    } finally {
      setLoading(false);
    }
  };

  const onRemove = async () => {
    if (!removing) return;
    setLoading(true);
    setFormError("");
    try {
      await api.removeStaff(removing.id);
      setMessage(`${removing.full_name} has been removed from the team.`);
      setError("");
      setRemoving(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setLoading(false);
    }
  };

  const formRole = roleById.get(form.role_id);
  const roleSelect = (disabled: boolean) => (
    <div>
      <label className="label" htmlFor="staff-role">Role</label>
      <select
        id="staff-role"
        className="input"
        value={form.role_id}
        onChange={(e) => changeRole(e.target.value)}
        disabled={disabled}
        required
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id} disabled={!canAssign(r) && r.id !== form.role_id}>
            {r.name}
            {r.description ? ` — ${r.description}` : ""}
            {!canAssign(r) ? " (needs access you do not have)" : ""}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Staff, their role, and anything added or removed for them personally."
        count={`${activeUsers.length} active`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/roles" className="btn-secondary">
              <ShieldCheck className="h-4 w-4" />
              Roles & permissions
            </Link>
            {isManager && (
              <button type="button" className="btn-primary" onClick={openAdd}>
                <UserPlus className="h-4 w-4" />
                Add member
              </button>
            )}
          </div>
        }
      />

      {(message || error) && (
        <div
          role="status"
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${error ? "border border-danger/30 bg-danger/10 text-danger" : "border border-success/30 bg-success/10 text-success"}`}
        >
          {error || message}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active members" value={activeUsers.length} />
        <KpiCard label="Roles" value={roles.length} />
        <KpiCard label="With personal changes" value={customised} />
        <KpiCard label="Removed" value={inactiveUsers.length} />
      </div>

      {!isManager && (
        <div className="mb-6">
          <InfoCallout title="View only">Ask an administrator to add, edit or remove team members.</InfoCallout>
        </div>
      )}

      <div className="card overflow-hidden">
        <TableToolbar
          tabs={[
            { id: "active", label: `Active (${activeUsers.length})` },
            { id: "inactive", label: `Removed (${inactiveUsers.length})` },
          ]}
          activeTab={tab}
          onTabChange={setTab}
          search={search}
          onSearchChange={setSearch}
        />

        {filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={tab === "active" ? "No active members" : "No removed members"}
            description={tab === "active" ? "Add your first team member to get started." : "Removed members appear here."}
            action={
              isManager && tab === "active" ? (
                <button type="button" className="btn-primary" onClick={openAdd}>
                  Add member
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role and access</th>
                  <th>Status</th>
                  {isManager && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const added = u.extra_permissions.length;
                  const removed = u.revoked_permissions.length;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              u.id === currentUser?.id ? "bg-accent text-accent-foreground" : "bg-accent-muted text-accent"
                            }`}
                          >
                            {initials(u.full_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-content">
                              {u.full_name}
                              {u.id === currentUser?.id && <span className="ml-2 text-xs font-normal text-accent">(you)</span>}
                            </p>
                            <p className="flex items-center gap-1 text-xs text-content-muted">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{u.email}</span>
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Tag color={roleById.get(u.role_id ?? "")?.all_permissions ? "purple" : "blue"}>{u.role_name ?? "No role"}</Tag>
                        <p className="mt-1 text-xs text-content-subtle">
                          {u.permissions.length} permission{u.permissions.length === 1 ? "" : "s"}
                          {added + removed > 0 && (
                            <span className="ml-1 text-content-muted">
                              · personal: {added > 0 ? `+${added}` : ""}
                              {added > 0 && removed > 0 ? " " : ""}
                              {removed > 0 ? `−${removed}` : ""}
                            </span>
                          )}
                        </p>
                      </td>
                      <td>
                        <StatusBadge status={u.is_active ? "active" : "idle"} />
                        <p className="mt-1 flex items-center gap-1 text-xs text-content-subtle">
                          <KeyRound className="h-3 w-3" />
                          {u.two_factor_enabled ? "Authenticator on" : "Not set up yet"}
                        </p>
                      </td>
                      {isManager && (
                        <td>
                          <div className="flex justify-end gap-2">
                            <button type="button" className="btn-ghost rounded-lg p-2" title="Edit" aria-label={`Edit ${u.full_name}`} onClick={() => openEdit(u)}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            {u.is_active && u.id !== currentUser?.id && u.two_factor_enabled && (
                              <button
                                type="button"
                                className="btn-ghost rounded-lg p-2"
                                title="Reset two-factor sign-in"
                                aria-label={`Reset two-factor sign-in for ${u.full_name}`}
                                onClick={() => {
                                  setFormError("");
                                  setResetting(u);
                                }}
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                            )}
                            {u.is_active && u.id !== currentUser?.id && (
                              <button
                                type="button"
                                className="btn-ghost rounded-lg p-2 text-danger hover:bg-danger/10"
                                title="Remove"
                                aria-label={`Remove ${u.full_name}`}
                                onClick={() => {
                                  setFormError("");
                                  setRemoving(u);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && isManager && (
        <Modal title="Add team member" subtitle="Choose their role. You can also adjust what they personally can do." onClose={() => setShowAdd(false)} size="lg">
          <form onSubmit={onAdd} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            </div>
            <Field label="Temporary password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required minLength={8} />
            {roleSelect(false)}
            <label className="flex items-center gap-2 text-sm text-content">
              <input type="checkbox" checked={customiseNew} onChange={(e) => setCustomiseNew(e.target.checked)} />
              Adjust permissions for this person
            </label>
            {customiseNew && formRole && (
              <StaffPermissionChecklist
                catalogue={catalogue}
                rolePermissions={rolePermissions(formRole, catalogue)}
                roleName={formRole.name}
                extra={form.extra_permissions}
                revoked={form.revoked_permissions}
                onChange={(extra_permissions, revoked_permissions) => setForm({ ...form, extra_permissions, revoked_permissions })}
                grantable={grantable}
              />
            )}
            {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading || !form.role_id}>{loading ? "Adding..." : "Add member"}</button>
            </div>
          </form>
        </Modal>
      )}

      {editing && isManager && (
        <Modal title={`Edit ${editing.full_name}`} subtitle={editing.email} onClose={() => setEditing(null)} size="lg">
          <form onSubmit={onEdit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
              <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            </div>
            {editing.id === currentUser?.id && (
              <InfoCallout title="Your own account">
                You cannot change your own role, permissions or status. Another administrator has to.
              </InfoCallout>
            )}
            {roleSelect(editing.id === currentUser?.id)}
            {formRole && (
              <div>
                <p className="label">Permissions</p>
                <StaffPermissionChecklist
                  catalogue={catalogue}
                  rolePermissions={rolePermissions(formRole, catalogue)}
                  roleName={formRole.name}
                  extra={form.extra_permissions}
                  revoked={form.revoked_permissions}
                  onChange={(extra_permissions, revoked_permissions) => setForm({ ...form, extra_permissions, revoked_permissions })}
                  grantable={grantable}
                  disabled={editing.id === currentUser?.id}
                />
              </div>
            )}
            <Field label="New password (optional)" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} minLength={8} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                disabled={editing.id === currentUser?.id}
              />
              <span className="text-content-muted">Account is active</span>
            </label>
            {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Saving..." : "Save changes"}</button>
            </div>
          </form>
        </Modal>
      )}

      {resetting && isManager && (
        <Modal title="Reset two-factor sign-in" onClose={() => setResetting(null)}>
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-accent/10 p-3 text-accent">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-content">Reset the authenticator app for {resetting.full_name}?</p>
              <p className="mt-1 text-sm text-content-muted">
                Use this when they have lost their phone and have no recovery codes left. Their old authenticator app and
                recovery codes stop working; they sign in with their password and set up a new app. This is recorded in the audit trail.
              </p>
            </div>
          </div>
          {formError && <p className="mt-4 text-sm text-danger" role="alert">{formError}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setResetting(null)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={loading} onClick={onResetTwoFactor}>
              {loading ? "Resetting..." : "Reset"}
            </button>
          </div>
        </Modal>
      )}

      {removing && isManager && (
        <Modal title="Remove team member" onClose={() => setRemoving(null)}>
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-danger/10 p-3 text-danger">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-content">Remove {removing.full_name}?</p>
              <p className="mt-1 text-sm text-content-muted">
                They lose access immediately. You can reactivate them later from the Removed tab via Edit.
              </p>
            </div>
          </div>
          {formError && <p className="mt-4 text-sm text-danger" role="alert">{formError}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRemoving(null)}>Cancel</button>
            <button type="button" className="btn-primary bg-danger hover:opacity-90" disabled={loading} onClick={onRemove}>
              {loading ? "Removing..." : "Remove member"}
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  const id = `field-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={type === "password" ? "new-password" : undefined}
      />
    </div>
  );
}
