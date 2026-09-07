import { Copy, Key, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { EmptyState, PageHeader, StatusBadge } from "../../components/ui";
import { api, ApiKey, ApiKeyCreated } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export function ApiKeysPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => api.listApiKeys().then(setKeys).catch((e) => setError(String(e.message)));

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await api.createApiKey({ name, description: description || undefined });
      setCreated(result);
      setName("");
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setLoading(false);
    }
  };

  const onRevoke = async (id: string) => {
    if (!confirm("Revoke this API key? Nova middleware using it will stop working immediately.")) return;
    setError("");
    try {
      await api.revokeApiKey(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    }
  };

  const copyKey = async () => {
    if (!created?.api_key) return;
    await navigator.clipboard.writeText(created.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAdmin) {
    return (
      <EmptyState
        icon={Key}
        title="Admin access required"
        description="Only administrators can manage partner API keys."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="API Keys"
        subtitle="Issue keys for Nova middleware to push transactions and run screening checks."
        count={`${keys.filter((k) => k.is_active).length} active`}
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreated(null)}>
            <Plus className="h-4 w-4" />
            New key
          </button>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {created?.api_key && (
        <div className="card mb-6 border-brand/30 bg-brand-muted/20 p-5">
          <p className="text-sm font-semibold text-content">Copy your new API key now</p>
          <p className="mt-1 text-xs text-content-muted">This is the only time the full key is shown.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-surface px-3 py-2 font-mono text-sm text-content">{created.api_key}</code>
            <button type="button" className="btn-secondary" onClick={copyKey}>
              <Copy className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card overflow-hidden">
          <div className="border-b border-border px-4 py-4">
            <h2 className="text-sm font-semibold text-content">Issued keys</h2>
          </div>
          {keys.length === 0 ? (
            <EmptyState icon={Key} title="No API keys yet" description="Create a key for Nova middleware integration." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-content-muted">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Prefix</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Last used</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id} className="border-b border-border/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-content">{key.name}</p>
                        {key.description && <p className="text-xs text-content-muted">{key.description}</p>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{key.key_prefix}…</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={key.is_active ? "active" : "rejected"} />
                      </td>
                      <td className="px-4 py-3 text-content-muted">
                        {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {key.is_active && (
                          <button type="button" className="btn-ghost text-danger" onClick={() => onRevoke(key.id)}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <form className="card h-fit space-y-4 p-5" onSubmit={onCreate}>
          <h2 className="text-sm font-semibold text-content">Create API key</h2>
          <label className="block text-xs font-medium text-content-muted">
            Name
            <input className="input mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
          </label>
          <label className="block text-xs font-medium text-content-muted">
            Description (optional)
            <input className="input mt-1 w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? "Creating…" : "Generate key"}
          </button>
        </form>
      </div>
    </div>
  );
}
