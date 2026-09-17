import type { ExtractionLog } from "./api";

export interface HtdProgress {
  kind: string;
  day: string;
  day_index: number;
  days: number;
  page: number;
  legs_fetched: number;
  legs_total: number | null;
  staged: number;
  skipped: number;
  invalid: number;
  valid: number;
}

export function parseHtdProgressMessage(message: string): HtdProgress | null {
  const marker = "PROGRESS {";
  const start = message.indexOf(marker);
  if (start < 0) return null;
  const jsonStart = start + "PROGRESS ".length;
  let depth = 0;
  for (let i = jsonStart; i < message.length; i++) {
    const ch = message[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(message.slice(jsonStart, i + 1)) as HtdProgress;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function latestHtdProgress(logs: ExtractionLog[]): HtdProgress | null {
  for (let i = logs.length - 1; i >= 0; i--) {
    const parsed = parseHtdProgressMessage(logs[i].message);
    if (parsed) return parsed;
  }
  return null;
}

export function displayLogMessage(message: string): string {
  const parsed = parseHtdProgressMessage(message);
  if (!parsed) return message;
  const legs =
    parsed.legs_total != null ? `${parsed.legs_fetched}/${parsed.legs_total}` : String(parsed.legs_fetched);
  return (
    `${parsed.day_index}/${parsed.days} ${parsed.day} page ${parsed.page} · ` +
    `${legs} HTD legs → ${parsed.staged} transactions (entered ${parsed.staged}, ` +
    `already in staging ${parsed.skipped}, invalid ${parsed.invalid})`
  );
}

export function progressLabel(logs: ExtractionLog[], fallback?: string | null): string | null {
  const last = logs[logs.length - 1];
  if (!last) return fallback ?? null;
  return displayLogMessage(last.message);
}
