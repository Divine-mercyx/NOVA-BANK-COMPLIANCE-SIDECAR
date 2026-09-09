const API_KEY_STORAGE = "nova.partner.apiKey";

export function loadPartnerApiKey(): string {
  return sessionStorage.getItem(API_KEY_STORAGE) ?? "";
}

export function savePartnerApiKey(key: string) {
  if (key.trim()) sessionStorage.setItem(API_KEY_STORAGE, key.trim());
  else sessionStorage.removeItem(API_KEY_STORAGE);
}

export interface PartnerRequestResult<T = unknown> {
  ok: boolean;
  status: number;
  durationMs: number;
  data?: T;
  error?: string;
  url: string;
}

export async function partnerGet<T = unknown>(
  path: string,
  apiKey: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<PartnerRequestResult<T>> {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    });
  }

  const started = performance.now();
  try {
    const res = await fetch(url.toString(), {
      headers: { "X-API-Key": apiKey },
    });
    const durationMs = Math.round(performance.now() - started);
    const text = await res.text();
    let data: T | undefined;
    try {
      data = text ? (JSON.parse(text) as T) : undefined;
    } catch {
      data = text as unknown as T;
    }
    if (!res.ok) {
      const detail =
        typeof data === "object" && data && "detail" in data
          ? String((data as { detail: unknown }).detail)
          : text || res.statusText;
      return { ok: false, status: res.status, durationMs, error: detail, url: url.toString() };
    }
    return { ok: true, status: res.status, durationMs, data, url: url.toString() };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      durationMs: Math.round(performance.now() - started),
      error: err instanceof Error ? err.message : "Network error",
      url: url.toString(),
    };
  }
}
