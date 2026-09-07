import { useEffect, useState } from "react";
import { ClipboardList } from "lucide-react";
import { EmptyState, PageHeader, TableToolbar } from "../components/ui";
import { api, AuditEvent } from "../lib/api";
import { actionLabel, formatDate } from "../lib/format";

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.audit().then(setEvents);
  }, []);

  const filtered = events.filter(
    (e) =>
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.actor_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader title="Audit trail" subtitle="Immutable log of compliance actions and submissions." count={`${events.length} events`} />

      <div className="card overflow-hidden">
        <TableToolbar search={search} onSearchChange={setSearch} />
        {filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No events" description="Activity will appear here as you use the platform." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td className="text-content-muted">{formatDate(e.created_at)}</td>
                  <td className="font-medium">{e.actor_name}</td>
                  <td>
                    <span className="rounded-md bg-brand-muted px-2 py-1 text-xs font-medium text-brand">
                      {actionLabel(e.action)}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-content-muted">{e.entity_type}:{e.entity_id.slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
