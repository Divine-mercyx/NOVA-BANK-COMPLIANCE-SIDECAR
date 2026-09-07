import { BookOpen, Copy, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { InfoCallout, PageHeader } from "../../components/ui";
import { api, IntegrationInfo } from "../../lib/api";

const SAMPLE_INGEST = `curl -X POST http://localhost:8000/api/v1/ingest/transactions \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: nova_your_key_here" \\
  -d '{
    "batch_id": "NOVA-2026-001",
    "transactions": [{
      "finacle_ref": "NIP123456789",
      "channel": "NIP",
      "transaction_date": "2026-03-01T10:30:00Z",
      "amount": 1500000,
      "currency": "NGN",
      "sender_name": "John Doe",
      "sender_account": "0123456789",
      "receiver_name": "Jane Smith",
      "receiver_account": "9876543210",
      "branch_code": "001",
      "narration": "Transfer"
    }]
  }'`;

const SAMPLE_SCREENING = `curl -X POST http://localhost:8000/api/v1/screening/check \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: nova_your_key_here" \\
  -d '{
    "finacle_ref": "NIP123456789",
    "sender_name": "John Doe",
    "receiver_name": "Jane Smith",
    "amount": 1500000,
    "currency": "NGN",
    "channel": "NIP"
  }'`;

function CodeBlock({ title, code }: { title: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-content">{title}</p>
        <button type="button" className="btn-ghost text-xs" onClick={copy}>
          <Copy className="h-3.5 w-3.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto bg-surface p-4 text-xs leading-relaxed text-content-muted">{code}</pre>
    </div>
  );
}

export function IntegrationApiDocsPage() {
  const [info, setInfo] = useState<IntegrationInfo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.integrationInfo()
      .then(setInfo)
      .catch((e) => setError(String(e.message)));
  }, []);

  return (
    <div>
      <PageHeader
        title="Integration API"
        subtitle="Nova middleware pushes transactions and screening checks into the compliance sidecar."
        actions={
          info && (
            <a href={info.openapi_url} target="_blank" rel="noreferrer" className="btn-secondary">
              <BookOpen className="h-4 w-4" />
              OpenAPI docs
            </a>
          )
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      {info && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-content-muted">Base URL</p>
            <p className="mt-1 font-mono text-sm text-content">{info.base_url}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-content-muted">Finacle mode</p>
            <p className="mt-1 text-sm font-semibold text-content">{info.finacle_mode}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-content-muted">Auth</p>
            <p className="mt-1 text-sm text-content">X-API-Key header (machine-to-machine)</p>
          </div>
        </div>
      )}

      <InfoCallout title="Partner endpoints">
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 h-4 w-4 shrink-0" />
          <ul className="list-inside list-disc">
            <li><code>POST /api/v1/ingest/transactions</code> — batch push from Nova middleware</li>
            <li><code>GET /api/v1/ingest/batches/&#123;batch_id&#125;</code> — batch status lookup</li>
            <li><code>POST /api/v1/screening/check</code> — synchronous screening decision</li>
          </ul>
        </div>
      </InfoCallout>

      <div className="space-y-6">
        <CodeBlock title="Ingest transactions" code={SAMPLE_INGEST} />
        <CodeBlock title="Screening check" code={SAMPLE_SCREENING} />
      </div>
    </div>
  );
}
