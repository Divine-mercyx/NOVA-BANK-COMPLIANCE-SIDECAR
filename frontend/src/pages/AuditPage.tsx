import { useEffect, useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { AnimatedRow, AnimatedTBody, StaggerItem } from "../components/motion";
import { EmptyState, PageHeader, Pagination, TableToolbar, usePagination } from "../components/ui";
import {
  BatchBar,
  DetailList,
  Drawer,
  downloadCsv,
  ExportButton,
  SelectBox,
  SelectPageBox,
  SortHeader,
  useSelection,
  useSort,
} from "../components/workbench";
import { api, AuditEvent } from "../lib/api";
import { actionLabel, formatDate, formatRelative } from "../lib/format";
import { useLiveRefresh } from "../lib/live";

export function AuditPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState("");
  const [inspecting, setInspecting] = useState<AuditEvent | null>(null);

  const load = () => api.audit().then(setEvents);

  useEffect(() => {
    void load();
  }, []);

  // New entries appear as they are written.
  useLiveRefresh(["audit"], load);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        actionLabel(e.action).toLowerCase().includes(q) ||
        e.actor_name.toLowerCase().includes(q) ||
        e.entity_type.toLowerCase().includes(q) ||
        e.entity_id.toLowerCase().includes(q),
    );
  }, [events, search]);

  const { sorted, sort, toggle } = useSort(
    filtered,
    { time: (e) => e.created_at, actor: (e) => e.actor_name, action: (e) => actionLabel(e.action), entity: (e) => e.entity_type },
    { key: "time", dir: "desc" },
  );
  const { pageItems, ...pager } = usePagination(sorted, 25);
  const selection = useSelection(filtered.map((e) => e.id));
  const pageIds = pageItems.map((e) => e.id);

  const exportSelected = () => {
    const rows = events.filter((e) => selection.selected.has(e.id));
    downloadCsv(
      `nova-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Timestamp", "Actor", "Action", "Entity type", "Entity id", "Details"],
      rows.map((e) => [e.created_at, e.actor_name, actionLabel(e.action), e.entity_type, e.entity_id, e.details ? JSON.stringify(e.details) : ""]),
    );
  };

  const history = inspecting
    ? events.filter((e) => e.entity_id === inspecting.entity_id && e.entity_type === inspecting.entity_type)
    : [];

  return (
    <div>
      <PageHeader eyebrow="Compliance" title="Audit trail" subtitle="Immutable log of compliance actions and submissions." count={`${events.length} events`} />

      <StaggerItem className="card overflow-hidden">
        <TableToolbar search={search} onSearchChange={setSearch} />
        <BatchBar count={selection.selected.size} onClear={selection.clear}>
          <ExportButton onClick={exportSelected} />
        </BatchBar>
        {filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No events" description="Activity will appear here as you use the platform." />
        ) : (
          <>
            <div className="max-h-[640px] overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <SelectPageBox pageIds={pageIds} selected={selection.selected} setMany={selection.setMany} />
                    </th>
                    <SortHeader label="Timestamp" column="time" sort={sort} onSort={toggle} />
                    <SortHeader label="Actor" column="actor" sort={sort} onSort={toggle} />
                    <SortHeader label="Action" column="action" sort={sort} onSort={toggle} />
                    <SortHeader label="Entity" column="entity" sort={sort} onSort={toggle} />
                  </tr>
                </thead>
                <AnimatedTBody>
                  {pageItems.map((e, rowIndex) => (
                    <AnimatedRow
                      key={e.id}
                      index={rowIndex}
                      onClick={() => setInspecting(e)}
                      className={`cursor-pointer ${selection.selected.has(e.id) ? "bg-brand-muted/50" : ""}`}
                    >
                      <td>
                        <SelectBox checked={selection.selected.has(e.id)} onChange={() => selection.toggle(e.id)} label={`Select ${actionLabel(e.action)} by ${e.actor_name}`} />
                      </td>
                      <td className="whitespace-nowrap text-content-muted">{formatDate(e.created_at)}</td>
                      <td className="font-medium">{e.actor_name}</td>
                      <td>
                        <button
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setInspecting(e);
                          }}
                          className="inline-flex rounded-full bg-brand-muted px-2.5 py-0.5 text-xs font-medium text-brand hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                        >
                          {actionLabel(e.action)}
                        </button>
                      </td>
                      <td className="font-mono text-xs text-content-muted">
                        {e.entity_type}:{e.entity_id.slice(0, 8)}
                      </td>
                    </AnimatedRow>
                  ))}
                </AnimatedTBody>
              </table>
            </div>
            <Pagination {...pager} onPage={pager.setPage} />
          </>
        )}
      </StaggerItem>

      <Drawer
        open={Boolean(inspecting)}
        onClose={() => setInspecting(null)}
        title={inspecting ? actionLabel(inspecting.action) : ""}
        subtitle={inspecting ? `${inspecting.actor_name} · ${formatDate(inspecting.created_at)}` : undefined}
      >
        {inspecting && (
          <div className="space-y-6">
            <DetailList
              items={[
                ["Action code", <span className="font-mono text-xs">{inspecting.action}</span>],
                ["Actor", inspecting.actor_name],
                ["Entity", `${inspecting.entity_type}`],
                ["Entity id", <span className="font-mono text-xs">{inspecting.entity_id}</span>],
                ["Recorded", formatDate(inspecting.created_at)],
              ]}
            />
            {inspecting.details && Object.keys(inspecting.details).length > 0 && (
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted">Details</h3>
                <DetailList
                  items={Object.entries(inspecting.details).map(([k, v]) => [
                    k.replace(/_/g, " "),
                    typeof v === "object" ? <span className="font-mono text-xs">{JSON.stringify(v)}</span> : String(v),
                  ])}
                />
              </section>
            )}
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                History for this {inspecting.entity_type} ({history.length})
              </h3>
              <ol className="space-y-0 border-l border-border pl-4">
                {history.slice(0, 20).map((h) => (
                  <li key={h.id} className="relative py-2">
                    <span
                      className={`absolute -left-[21px] top-3.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${h.id === inspecting.id ? "bg-brand" : "bg-slate-300"}`}
                      aria-hidden
                    />
                    <p className="text-sm font-medium text-content">{actionLabel(h.action)}</p>
                    <p className="text-xs text-content-muted">
                      {h.actor_name} · {formatRelative(h.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )}
      </Drawer>
    </div>
  );
}
