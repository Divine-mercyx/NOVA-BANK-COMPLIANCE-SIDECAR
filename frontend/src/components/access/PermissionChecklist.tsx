import { useMemo, type ReactElement } from "react";
import type { PermissionInfo } from "../../lib/api";

function groupByGroup(catalogue: PermissionInfo[]) {
  const groups = new Map<string, PermissionInfo[]>();
  for (const p of catalogue) {
    if (!groups.has(p.group)) groups.set(p.group, []);
    groups.get(p.group)!.push(p);
  }
  return [...groups.entries()];
}

function Row({
  perm,
  checked,
  disabled,
  note,
  noteTone,
  onToggle,
}: {
  perm: PermissionInfo;
  checked: boolean;
  disabled: boolean;
  note?: string;
  noteTone?: "added" | "removed";
  onToggle: () => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl px-3 py-2.5 transition ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-surface-overlay/60"
      }`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-content">
          <span className={noteTone === "removed" ? "line-through decoration-danger/60" : ""}>{perm.label}</span>
          {note && (
            <span
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                noteTone === "added" ? "bg-success/15 text-success" : "bg-danger/10 text-danger"
              }`}
            >
              {note}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-content-muted">{perm.description}</span>
      </span>
    </label>
  );
}

function Groups({ catalogue, render }: { catalogue: PermissionInfo[]; render: (p: PermissionInfo) => ReactElement }) {
  const groups = useMemo(() => groupByGroup(catalogue), [catalogue]);
  return (
    <div className="space-y-4">
      {groups.map(([group, perms]) => (
        <fieldset key={group}>
          <legend className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-content-subtle">{group}</legend>
          <div className="grid gap-0.5 sm:grid-cols-2">{perms.map(render)}</div>
        </fieldset>
      ))}
    </div>
  );
}

/** A role's permissions: a plain set. */
export function RolePermissionChecklist({
  catalogue,
  value,
  onChange,
  locked = false,
  grantable,
}: {
  catalogue: PermissionInfo[];
  value: string[];
  onChange: (next: string[]) => void;
  /** The Admin role: everything, not editable. */
  locked?: boolean;
  /** Permissions the editor holds; they cannot add others (the server refuses too). */
  grantable: string[];
}) {
  const selected = new Set(value);
  return (
    <Groups
      catalogue={catalogue}
      render={(p) => {
        const on = locked || selected.has(p.key);
        const cannotAdd = !on && !grantable.includes(p.key);
        return (
          <Row
            key={p.key}
            perm={p}
            checked={on}
            disabled={locked || cannotAdd}
            onToggle={() => {
              const next = new Set(selected);
              if (next.has(p.key)) next.delete(p.key);
              else next.add(p.key);
              onChange(catalogue.map((c) => c.key).filter((k) => next.has(k)));
            }}
          />
        );
      }}
    />
  );
}

/**
 * One staff member's permissions: what their role gives, with per-person additions and removals on top.
 * Ticking something the role does not give adds it for this person; unticking something the role gives
 * removes it for this person only.
 */
export function StaffPermissionChecklist({
  catalogue,
  rolePermissions,
  roleName,
  extra,
  revoked,
  onChange,
  grantable,
  disabled = false,
}: {
  catalogue: PermissionInfo[];
  rolePermissions: string[];
  roleName: string;
  extra: string[];
  revoked: string[];
  onChange: (extra: string[], revoked: string[]) => void;
  grantable: string[];
  disabled?: boolean;
}) {
  const fromRole = new Set(rolePermissions);
  const added = new Set(extra.filter((k) => !fromRole.has(k)));
  const removed = new Set(revoked.filter((k) => fromRole.has(k)));
  const order = catalogue.map((c) => c.key);
  const changes = added.size + removed.size;

  const toggle = (key: string) => {
    const nextAdded = new Set(added);
    const nextRemoved = new Set(removed);
    if (fromRole.has(key)) {
      if (nextRemoved.has(key)) nextRemoved.delete(key);
      else nextRemoved.add(key);
    } else if (nextAdded.has(key)) nextAdded.delete(key);
    else nextAdded.add(key);
    onChange(order.filter((k) => nextAdded.has(k)), order.filter((k) => nextRemoved.has(k)));
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-overlay/60 px-3 py-2 text-xs text-content-muted">
        <span>
          Starts from the <strong className="text-content">{roleName}</strong> role.
          {changes > 0
            ? ` ${added.size} added and ${removed.size} removed for this person.`
            : " No changes for this person."}
        </span>
        {changes > 0 && !disabled && (
          <button type="button" className="font-semibold text-accent hover:underline" onClick={() => onChange([], [])}>
            Reset to role
          </button>
        )}
      </div>
      <Groups
        catalogue={catalogue}
        render={(p) => {
          const inRole = fromRole.has(p.key);
          const on = (inRole && !removed.has(p.key)) || added.has(p.key);
          const cannotAdd = !on && !grantable.includes(p.key);
          return (
            <Row
              key={p.key}
              perm={p}
              checked={on}
              disabled={disabled || cannotAdd}
              note={added.has(p.key) ? "Added" : removed.has(p.key) ? "Removed" : undefined}
              noteTone={added.has(p.key) ? "added" : removed.has(p.key) ? "removed" : undefined}
              onToggle={() => toggle(p.key)}
            />
          );
        }}
      />
    </div>
  );
}
