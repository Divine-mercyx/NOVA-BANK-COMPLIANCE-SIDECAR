import { Check, Copy, ExternalLink, Key, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, PageHeader, StatusBadge } from "../../components/ui";
import { api, ApiKey, ApiKeyCreated } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { savePartnerApiKey } from "../../lib/partnerApi";

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
  const [modalOpen, setModalOpen] = useState(false);

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
      savePartnerApiKey(result.api_key);
      setName("");
      setDescription("");
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setLoading(false);
    }
  };

  const onRevoke = async (id: string) => {
    if (!confirm("Revoke this API key? Systems using it will lose access immediately.")) return;
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
        title="Administrator access required"
        description="Only administrators can issue export API keys."
      />
    );
  }

  const activeCount = keys.filter((k) => k.is_active).length;

  return (
    <div>
      <PageHeader
        title="API keys"
        subtitle="Machine credentials for GET /api/v1/export/* . The full key is shown once at creation."
        actions={
          <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Issue key
          </button>
        }
      />

      <div className="mb-6 grid gap-px border border-border bg-border sm:grid-cols-3">
        <div className="bg-surface-raised px-4 py-3">
          <p className="text-xs text-content-muted">Active</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-content">{activeCount}</p>
        </div>
        <div className="bg-surface-raised px-4 py-3">
          <p className="text-xs text-content-muted">Revoked</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-content">{keys.filter((k) => !k.is_active).length}</p>
        </div>
        <div className="bg-surface-raised px-4 py-3">
          <p className="text-xs text-content-muted">Issued</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-content">{keys.length}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 border border-border bg-surface-overlay px-4 py-3 text-sm text-content">{error}</div>
      )}

      {created?.api_key && (
        <div className="mb-6 border border-border bg-surface-raised p-5">
          <p className="text-sm font-medium text-content">Copy this key now. It will not be shown again.</p>
          <p className="mt-1 text-xs text-content-muted">
            {created.name} · prefix {created.key_prefix}
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 break-all border border-border bg-surface-overlay px-3 py-2 font-mono text-sm text-content">
              {created.api_key}
            </code>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-secondary" onClick={copyKey}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </button>
              <Link to="/integration/docs" className="btn-secondary">
                <ExternalLink className="h-4 w-4" />
                Documentation
              </Link>
              <button type="button" className="btn-ghost" onClick={() => setCreated(null)}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {keys.length === 0 ? (
        <EmptyState icon={Key} title="No keys issued" description="Issue a key for Nova middleware or the screening vendor." />
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>
                    <p className="font-medium text-content">{key.name}</p>
                    {key.description && <p className="text-xs text-content-muted">{key.description}</p>}
                  </td>
                  <td className="font-mono text-xs">{key.key_prefix}…</td>
                  <td>
                    <StatusBadge status={key.is_active ? "active" : "rejected"} />
                  </td>
                  <td className="whitespace-nowrap text-content-muted">{new Date(key.created_at).toLocaleDateString()}</td>
                  <td className="whitespace-nowrap text-content-muted">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}
                  </td>
                  <td className="text-right">
                    {key.is_active && (
                      <button type="button" className="btn-ghost text-content" onClick={() => onRevoke(key.id)}>
                        <Trash2 className="h-4 w-4" />
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md border border-border bg-surface-raised p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-content">Issue API key</h2>
              <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <form className="mt-5 space-y-4" onSubmit={onCreate}>
              <label className="block text-xs font-medium text-content-muted">
                Name
                <input
                  className="input mt-1 w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nova middleware — production"
                  required
                  minLength={2}
                  autoFocus
                />
              </label>
              <label className="block text-xs font-medium text-content-muted">
                Description
                <input
                  className="input mt-1 w-full"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? "Issuing…" : "Issue key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
