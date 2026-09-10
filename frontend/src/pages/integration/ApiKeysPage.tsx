import { Check, Copy, ExternalLink, Key, Plus, Shield, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, StatusBadge } from "../../components/ui";
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

  const activeCount = keys.filter((k) => k.is_active).length;
  const revokedCount = keys.filter((k) => !k.is_active).length;

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
    if (!confirm("Revoke this API key? Any system using it will lose access immediately.")) return;
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
        description="Only administrators can issue Export API keys for Nova Bank IT."
      />
    );
  }

  return (
    <div className="pb-10">
      {/* Hero */}
      <div className="relative mb-8 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-indigo-600 via-brand to-violet-600 p-[1px]">
        <div className="rounded-[15px] bg-surface-raised/95 p-6 backdrop-blur-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand">Integration</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-content">API Keys</h1>
              <p className="mt-2 max-w-xl text-sm text-content-muted">
                Issue secure keys for Nova Bank middleware to pull translated transactions and download regulatory reports.
              </p>
            </div>
            <button type="button" className="btn-primary shrink-0" onClick={() => setModalOpen(true)}>
              <Plus className="h-4 w-4" />
              Create new key
            </button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <StatChip label="Active keys" value={activeCount} tone="emerald" />
            <StatChip label="Revoked" value={revokedCount} tone="rose" />
            <StatChip label="Total issued" value={keys.length} tone="violet" />
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {/* New key reveal */}
      {created?.api_key && (
        <div className="relative mb-8 overflow-hidden rounded-2xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-50 via-surface-raised to-violet-50 p-6 dark:from-amber-500/10 dark:via-surface-raised dark:to-violet-500/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
                <Shield className="h-4 w-4" />
                Save this key now — it won&apos;t be shown again
              </p>
              <p className="mt-1 text-xs text-content-muted">
                Key for <strong>{created.name}</strong> · prefix <code className="font-mono">{created.key_prefix}</code>
              </p>
            </div>
            <button type="button" className="btn-ghost" onClick={() => setCreated(null)} aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <code className="flex-1 break-all rounded-xl border border-border bg-[#0d1117] px-4 py-3 font-mono text-sm text-emerald-400">
              {created.api_key}
            </code>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-secondary" onClick={copyKey}>
                {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy key"}
              </button>
              <Link to="/integration/docs" className="btn-primary">
                <ExternalLink className="h-4 w-4" />
                Test in API Docs
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* How to use */}
      <div className="card mb-8 grid gap-0 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          { step: "1", title: "Create key", desc: "Name it after the team or system (e.g. Nova Middleware UAT)." },
          { step: "2", title: "Copy once", desc: "The full key is shown only at creation. Store it in your secrets vault." },
          { step: "3", title: "Pull data", desc: "Use X-API-Key header on GET /api/v1/export/* endpoints." },
        ].map((item) => (
          <div key={item.step} className="p-5">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
              {item.step}
            </span>
            <p className="mt-3 font-semibold text-content">{item.title}</p>
            <p className="mt-1 text-sm text-content-muted">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Key list */}
      {keys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No API keys yet"
          description="Create your first key to let Nova IT pull translated compliance data."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {keys.map((key) => (
            <div
              key={key.id}
              className={`card relative overflow-hidden p-5 transition ${
                key.is_active ? "hover:shadow-lg" : "opacity-70"
              }`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${key.is_active ? "bg-gradient-to-r from-emerald-400 to-cyan-400" : "bg-gray-300 dark:bg-gray-600"}`} />
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-content">{key.name}</p>
                  {key.description && <p className="mt-0.5 line-clamp-2 text-xs text-content-muted">{key.description}</p>}
                </div>
                <StatusBadge status={key.is_active ? "active" : "rejected"} />
              </div>
              <div className="mt-4 space-y-2 rounded-lg bg-surface-overlay/60 p-3 font-mono text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-content-subtle">Prefix</span>
                  <span className="text-content">{key.key_prefix}…</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-content-subtle">Created</span>
                  <span className="text-content">{new Date(key.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-content-subtle">Last used</span>
                  <span className="text-content">
                    {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "Never"}
                  </span>
                </div>
              </div>
              {key.is_active && (
                <button
                  type="button"
                  className="btn-ghost mt-4 w-full text-danger hover:bg-danger/10"
                  onClick={() => onRevoke(key.id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Revoke key
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-content">Create API key</h2>
              <button type="button" className="btn-ghost" onClick={() => setModalOpen(false)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm text-content-muted">Keys authenticate machine-to-machine export requests.</p>
            <form className="mt-5 space-y-4" onSubmit={onCreate}>
              <label className="block text-xs font-medium text-content-muted">
                Key name <span className="text-danger">*</span>
                <input
                  className="input mt-1 w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nova Middleware — Production"
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
                  placeholder="Pulls CTR/FTR for NFIU filing pipeline"
                />
              </label>
              <div className="flex gap-2 pt-2">
                <button type="button" className="btn-secondary flex-1" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? "Creating…" : "Generate key"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: number; tone: "emerald" | "rose" | "violet" }) {
  const tones = {
    emerald: "border-emerald-200/60 bg-emerald-50/80 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400",
    rose: "border-rose-200/60 bg-rose-50/80 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400",
    violet: "border-violet-200/60 bg-violet-50/80 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-400",
  };
  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
