import { useEffect, useRef, useSyncExternalStore } from "react";

export type LiveStatus = "idle" | "connecting" | "open" | "closed";
export type LiveChanges = Record<string, string[]>;

type ChangeListener = (changes: LiveChanges) => void;

const UNAUTHORISED = 4401;
const MAX_BACKOFF_MS = 30_000;

class LiveClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<ChangeListener>();
  private statusListeners = new Set<() => void>();
  private status: LiveStatus = "idle";
  private backoff = 1000;
  private retryTimer: number | null = null;
  private running = false;

  start() {
    if (this.running) return;
    this.running = true;
    this.backoff = 1000;
    this.connect();
  }

  stop() {
    this.running = false;
    if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ws?.close(1000);
    this.ws = null;
    this.setStatus("idle");
  }

  getStatus = () => this.status;

  subscribeStatus = (fn: () => void) => {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  };

  onChange(fn: ChangeListener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private setStatus(next: LiveStatus) {
    if (next === this.status) return;
    this.status = next;
    this.statusListeners.forEach((fn) => fn());
  }

  private connect() {
    if (!this.running) return;
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${scheme}://${window.location.host}/api/v1/ws`);
    this.ws = ws;
    this.setStatus("connecting");

    ws.onmessage = (event) => {
      let message: { type?: string; changes?: LiveChanges };
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      if (message.type === "ready") {
        this.backoff = 1000;
        this.setStatus("open");
      } else if (message.type === "change" && message.changes) {
        const changes = message.changes;
        this.listeners.forEach((fn) => fn(changes));
      }
    };

    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus("closed");
      if (event.code === UNAUTHORISED) {
        this.running = false;
        window.dispatchEvent(new Event("nova:unauthorized"));
        return;
      }
      if (!this.running) return;
      const delay = this.backoff + Math.random() * 500;
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
      this.retryTimer = window.setTimeout(() => this.connect(), delay);
    };
  }
}

export const live = new LiveClient();

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(live.subscribeStatus, live.getStatus, live.getStatus);
}

export function useLiveChanges(topics: string[], handler: (ids: string[], topic: string) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const key = topics.join("|");

  useEffect(() => {
    const wanted = key.split("|");
    return live.onChange((changes) => {
      for (const topic of wanted) {
        const ids = changes[topic];
        if (ids) handlerRef.current(ids, topic);
      }
    });
  }, [key]);
}

export function useLiveRefresh(
  topics: string[],
  refresh: () => unknown,
  { enabled = true, fallbackMs, match }: { enabled?: boolean; fallbackMs?: number; match?: string | null } = {},
) {
  const status = useLiveStatus();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const timer = useRef<number | null>(null);

  const schedule = () => {
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void refreshRef.current();
    }, 250);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  useLiveChanges(topics, (ids) => {
    if (!enabled) return;
    if (match && !ids.includes(match)) return;
    schedule();
  });

  const wasOpen = useRef(status === "open");
  useEffect(() => {
    if (status === "open" && !wasOpen.current && enabled) schedule();
    wasOpen.current = status === "open";
  }, [status, enabled]);

  useEffect(() => {
    if (!enabled || !fallbackMs || status === "open") return;
    const id = window.setInterval(() => void refreshRef.current(), fallbackMs);
    return () => window.clearInterval(id);
  }, [enabled, fallbackMs, status]);
}
