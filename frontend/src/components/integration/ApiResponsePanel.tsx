import { AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { PartnerRequestResult } from "../../lib/partnerApi";
import { ApiCopyButton } from "./ApiCopyButton";

export function ApiResponsePanel({ result }: { result: PartnerRequestResult | null }) {
  if (!result) {
    return (
      <div className="flex h-full min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-overlay/30 p-6 text-center">
        <p className="text-sm font-medium text-content-muted">No response yet</p>
        <p className="mt-1 max-w-xs text-xs text-content-subtle">Run an endpoint to see the live JSON response here.</p>
      </div>
    );
  }

  const body = result.error ?? JSON.stringify(result.data, null, 2);
  const curl = `curl -s "${result.url}" -H "X-API-Key: YOUR_API_KEY"`;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#0d1117] shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {result.ok ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {result.status}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-400">
              <AlertCircle className="h-3.5 w-3.5" />
              {result.status || "Error"}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {result.durationMs}ms
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ApiCopyButton text={body} label="Copy response" />
          <ApiCopyButton text={curl} label="Copy cURL" />
        </div>
      </div>
      <pre className="max-h-[420px] overflow-auto p-4 font-mono text-xs leading-relaxed text-slate-300">{body}</pre>
    </div>
  );
}
