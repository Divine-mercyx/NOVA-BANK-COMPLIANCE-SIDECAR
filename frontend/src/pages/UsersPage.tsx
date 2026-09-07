import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Mail,
  Pencil,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  EmptyState,
  InfoCallout,
  KpiCard,
  PageHeader,
  StatusBadge,
  TableToolbar,
  Tag,
} from "../components/ui";
import { api, CreateStaffRequest, UpdateStaffRequest, User, UserRole } from "../lib/api";
import { roleLabel } from "../lib/format";
import { useAuth } from "../lib/auth";

const ROLES: UserRole[] = ["viewer", "analyst", "approver", "admin"];

const ROLE_DESC: Record<UserRole, string> = {
  admin: "Full access · manage team",
  approver: "Approve & submit reports",
  analyst: "Run ETL · generate reports",
  viewer: "Read-only access",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [removing, setRemoving] = useState<User | null>(null);
  const [form, setForm] = useState<CreateStaffRequest>({
    email: "",
    password: "",
    full_name: "",
    role: "analyst",
  });
  const [editForm, setEditForm] = useState<UpdateStaffRequest & { password?: string }>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const load = () => api.users().then(setUsers);

  useEffect(() => {
    load();
  }, []);

  const activeUsers = users.filter((u) => u.is_active);
  const inactiveUsers = users.filter((u) => !u.is_active);

  const displayed = tab === "active" ? activeUsers : inactiveUsers;

  const filtered = useMemo(
    () =>
      displayed.filter(
        (u) =>
          u.full_name.toLowerCase().includes(search.toLowerCase()) ||
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          u.role.includes(search.toLowerCase())
      ),
    [displayed, search]
  );

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { admin: 0, approver: 0, analyst: 0, viewer: 0 };
    activeUsers.forEach((u) => {
      counts[u.role] = (counts[u.role] ?? 0) + 1;
    });
    return counts;
  }, [activeUsers]);

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await api.createStaff(form);
      setMessage(`${form.full_name} has been added.`);
      setForm({ email: "", password: "", full_name: "", role: "analyst" });
      setShowAdd(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setEditForm({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      password: "",
    });
    setError("");
  };

  const onEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setLoading(true);
    setError("");
    try {
      const payload: UpdateStaffRequest = {
        full_name: editForm.full_name,
        email: editForm.email,
        role: editForm.role,
        is_active: editForm.is_active,
      };
      if (editForm.password) payload.password = editForm.password;
      await api.updateStaff(editing.id, payload);
      setMessage(`${editForm.full_name} has been updated.`);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update member");
    } finally {
      setLoading(false);
    }
  };

  const onRemove = async () => {
    if (!removing) return;
    setLoading(true);
    setError("");
    try {
      await api.removeStaff(removing.id);
      setMessage(`${removing.full_name} has been removed from the team.`);
      setRemoving(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Manage compliance officers, roles, and access levels across the platform."
        count={`${activeUsers.length} active`}
        actions={
          isAdmin ? (
            <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>
              <UserPlus className="h-4 w-4" />
              Add member
            </button>
          ) : undefined
        }
      />

      {(message || error) && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${error ? "border border-danger/30 bg-danger/10 text-danger" : "border border-success/30 bg-success/10 text-success"}`}
        >
          {error || message}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active members" value={activeUsers.length} changeUp />
        <KpiCard label="Admins" value={roleCounts.admin} />
        <KpiCard label="Approvers" value={roleCounts.approver} />
        <KpiCard label="Analysts & viewers" value={roleCounts.analyst + roleCounts.viewer} />
      </div>

      {!isAdmin && (
        <div className="mb-6">
          <InfoCallout title="View only">Contact an admin to add, edit, or remove team members.</InfoCallout>
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
              isAdmin && tab === "active" ? (
                <button type="button" className="btn-primary" onClick={() => setShowAdd(true)}>
                  Add member
                </button>
              ) : undefined
            }
          />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Access</th>
                {isAdmin && <th className="text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          u.id === currentUser?.id ? "bg-brand text-brand-foreground" : "bg-brand-muted text-brand"
                        }`}
                      >
                        {initials(u.full_name)}
                      </div>
                      <div>
                        <p className="font-medium text-content">
                          {u.full_name}
                          {u.id === currentUser?.id && (
                            <span className="ml-2 text-xs font-normal text-brand">(you)</span>
                          )}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-content-muted">
                          <Mail className="h-3 w-3" />
                          {u.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Tag color={u.role === "admin" ? "purple" : u.role === "approver" ? "pink" : "blue"}>
                      {roleLabel(u.role)}
                    </Tag>
                    <p className="mt-1 text-xs text-content-subtle">{ROLE_DESC[u.role]}</p>
                  </td>
                  <td>
                    <StatusBadge status={u.is_active ? "active" : "idle"} />
                  </td>
                  {isAdmin && (
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="btn-ghost rounded-lg p-2"
                          title="Edit"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {u.is_active && u.id !== currentUser?.id && (
                          <button
                            type="button"
                            className="btn-ghost rounded-lg p-2 text-danger hover:bg-danger/10"
                            title="Remove"
                            onClick={() => setRemoving(u)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add modal */}
      {showAdd && isAdmin && (
        <Modal title="Add team member" onClose={() => setShowAdd(false)}>
          <form onSubmit={onAdd} className="space-y-4">
            <Field label="Full name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
            <Field label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} required />
            <Field label="Temporary password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} required minLength={8} />
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{roleLabel(r)} — {ROLE_DESC[r]}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Adding..." : "Add member"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {editing && isAdmin && (
        <Modal title="Edit team member" onClose={() => setEditing(null)}>
          <form onSubmit={onEdit} className="space-y-4">
            <Field label="Full name" value={editForm.full_name ?? ""} onChange={(v) => setEditForm({ ...editForm, full_name: v })} required />
            <Field label="Email" type="email" value={editForm.email ?? ""} onChange={(v) => setEditForm({ ...editForm, email: v })} required />
            <div>
              <label className="label">Role</label>
              <select
                className="input"
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                disabled={editing.id === currentUser?.id}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{roleLabel(r)}</option>
                ))}
              </select>
            </div>
            <Field
              label="New password (optional)"
              type="password"
              value={editForm.password ?? ""}
              onChange={(v) => setEditForm({ ...editForm, password: v })}
              minLength={8}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editForm.is_active ?? true}
                onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                disabled={editing.id === currentUser?.id}
              />
              <span className="text-content-muted">Account is active</span>
            </label>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={loading}>{loading ? "Saving..." : "Save changes"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Remove confirm */}
      {removing && isAdmin && (
        <Modal title="Remove team member" onClose={() => setRemoving(null)}>
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-danger/10 p-3 text-danger">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-content">Remove {removing.full_name}?</p>
              <p className="mt-1 text-sm text-content-muted">
                They will lose access immediately. You can reactivate them later from the Removed tab via Edit.
              </p>
            </div>
          </div>
          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-content">{title}</h2>
          <button type="button" className="btn-ghost rounded-lg p-1" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
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
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type={type}
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
      />
    </div>
  );
}
