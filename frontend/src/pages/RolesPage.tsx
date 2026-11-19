import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from "lucide-react";
import { RolePermissionChecklist } from "../components/access/PermissionChecklist";
import { Modal } from "../components/Modal";
import { EmptyState, InfoCallout, PageHeader, Tag } from "../components/ui";
import { api, PermissionInfo, Role } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canManageRoles } from "../lib/roles";

interface RoleForm {
  name: string;
  description: string;
  permissions: string[];
}

export function RolesPage() {
  const { user, refreshUser } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [catalogue, setCatalogue] = useState<PermissionInfo[]>([]);
  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleForm>({ name: "", description: "", permissions: [] });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const canEdit = canManageRoles(user);
  const grantable = user?.permissions ?? [];

  const load = useCallback(async () => {
    const [r, c] = await Promise.all([api.roles(), api.permissionCatalogue()]);
    setRoles(r);
    setCatalogue(c);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : "Could not load roles"));
  }, [load]);

  const label = (key: string) => catalogue.find((p) => p.key === key)?.label ?? key;

  const openNew = () => {
    setForm({ name: "", description: "", permissions: [] });
    setFormError("");
    setEditing("new");
  };

  const openEdit = (role: Role) => {
    setForm({ name: role.name, description: role.description ?? "", permissions: role.permissions });
    setFormError("");
    setEditing(role);
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (editing === "new") {
        await api.createRole({ name: form.name, description: form.description || null, permissions: form.permissions });
        setMessage(`Role "${form.name}" created.`);
      } else if (editing) {
        await api.updateRole(editing.id, {
          ...(editing.all_permissions ? {} : { name: form.name, permissions: form.permissions }),
          description: form.description || null,
        });
        setMessage(`Role "${form.name}" saved. Everyone with this role has the new access straight away.`);
      }
      setError("");
      setEditing(null);
      await load();
      await refreshUser(); // in case the change affects the signed-in user
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the role");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    setFormError("");
    try {
      await api.deleteRole(deleting.id);
      setMessage(`Role "${deleting.name}" deleted.`);
      setError("");
      setDeleting(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not delete the role");
    } finally {
      setSaving(false);
    }
  };

  const editingRole = editing && editing !== "new" ? editing : null;

  return (
    <div>
      <PageHeader
        title="Roles & permissions"
        subtitle="A role is a set of permissions. Give staff a role on the Team page, and adjust individuals there."
        count={`${roles.length} roles`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/users" className="btn-secondary">
              <Users className="h-4 w-4" />
              Team
            </Link>
            {canEdit && (
              <button type="button" className="btn-primary" onClick={openNew}>
                <Plus className="h-4 w-4" />
                New role
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

      {!canEdit && (
        <div className="mb-6">
          <InfoCallout title="View only">Ask an administrator to create or change roles.</InfoCallout>
        </div>
      )}

      {roles.length === 0 ? (
        <div className="card">
          <EmptyState icon={ShieldCheck} title="No roles yet" description="Create a role to start giving staff access." />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {roles.map((role) => (
            <div key={role.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-content">{role.name}</h3>
                    {role.system_key && <Tag color="gray">Built-in</Tag>}
                    {role.all_permissions && <Tag color="purple">All permissions</Tag>}
                  </div>
                  {role.description && <p className="mt-1 text-sm text-content-muted">{role.description}</p>}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className="btn-ghost rounded-lg p-2" title="Edit" aria-label={`Edit ${role.name}`} onClick={() => openEdit(role)}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    {!role.system_key && (
                      <button
                        type="button"
                        className="btn-ghost rounded-lg p-2 text-danger hover:bg-danger/10"
                        title="Delete"
                        aria-label={`Delete ${role.name}`}
                        onClick={() => {
                          setFormError("");
                          setDeleting(role);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs font-medium text-content-subtle">
                {role.all_permissions ? catalogue.length : role.permissions.length} permissions · {role.user_count} active staff
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.all_permissions ? (
                  <span className="text-xs text-content-muted">Every permission, including new ones as they are added.</span>
                ) : role.permissions.length === 0 ? (
                  <span className="text-xs text-content-muted">No permissions yet.</span>
                ) : (
                  role.permissions.map((p) => (
                    <span key={p} className="rounded-md bg-surface-overlay px-2 py-0.5 text-[11px] text-content-muted">
                      {label(p)}
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && canEdit && (
        <Modal
          title={editing === "new" ? "New role" : `Edit ${editingRole?.name}`}
          subtitle="Tick what people with this role can see and do."
          onClose={() => setEditing(null)}
          size="lg"
        >
          <form onSubmit={onSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="role-name">Name</label>
                <input
                  id="role-name"
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  maxLength={80}
                  disabled={Boolean(editingRole?.all_permissions)}
                />
              </div>
              <div>
                <label className="label" htmlFor="role-description">Description</label>
                <input
                  id="role-description"
                  className="input"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  maxLength={255}
                  placeholder="Who this role is for"
                />
              </div>
            </div>
            {editingRole?.all_permissions ? (
              <InfoCallout title="Admin always has every permission">
                <span className="inline-flex items-center gap-1">
                  <Lock className="h-3.5 w-3.5" /> Its permissions cannot be narrowed. Create a new role for narrower access.
                </span>
              </InfoCallout>
            ) : (
              <RolePermissionChecklist
                catalogue={catalogue}
                value={form.permissions}
                onChange={(permissions) => setForm({ ...form, permissions })}
                grantable={grantable}
              />
            )}
            {editingRole && editingRole.user_count > 0 && !editingRole.all_permissions && (
              <p className="text-xs text-content-muted">
                {editingRole.user_count} active staff have this role. Saving changes their access immediately.
              </p>
            )}
            {formError && <p className="text-sm text-danger" role="alert">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>{saving ? "Saving..." : editing === "new" ? "Create role" : "Save role"}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && canEdit && (
        <Modal title="Delete role" onClose={() => setDeleting(null)}>
          <p className="text-sm text-content">
            Delete <strong>{deleting.name}</strong>?
            {deleting.user_count > 0
              ? ` ${deleting.user_count} active staff still have it. Move them to another role on the Team page first.`
              : " Nobody active has this role."}
          </p>
          {formError && <p className="mt-4 text-sm text-danger" role="alert">{formError}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
            <button type="button" className="btn-primary bg-danger hover:opacity-90" disabled={saving || deleting.user_count > 0} onClick={onDelete}>
              {saving ? "Deleting..." : "Delete role"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
