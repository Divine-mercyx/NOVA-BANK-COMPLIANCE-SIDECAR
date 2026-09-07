import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { EmptyState, PageHeader, TableToolbar } from "../../components/ui";
import { api, ScreeningAuditEvent } from "../../lib/api";
import { actionLabel, formatDate } from "../../lib/format";

export function ScreeningAuditPage() {
  const [events, setEvents] = useState<ScreeningAuditEvent[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.screeningAudit().then(setEvents);
  }, []);

  const filtered = events.filter(
    (e) =>
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.actor_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="Screening log"
        subtitle="Every approve, reject, and escalate decision on flagged transactions."
        count={`${events.length} events`}
      />

      <div className="card overflow-hidden">
        <TableToolbar search={search} onSearchChange={setSearch} />
        {filtered.length === 0 ? (
          <EmptyState icon={Zap} title="No screening decisions yet" description="Actions taken on alerts will appear here." />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Officer</th>
                <th>Action</th>
                <th>Alert</th>
                <th>Details</th>
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
                  <td className="font-mono text-xs">{e.entity_id.slice(0, 8)}</td>
                  <td className="max-w-xs truncate text-xs text-content-muted">
                    {e.details ? JSON.stringify(e.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
