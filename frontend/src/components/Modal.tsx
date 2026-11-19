import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * A dialog over the whole portal. Rendered into <body> so the animated page container cannot clip it or
 * trap it under the header. Scrolls inside itself on small screens; Escape or the backdrop closes it.
 */
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  size = "md",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div
        className={`relative flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-border bg-surface-raised shadow-lg sm:rounded-2xl ${
          size === "lg" ? "sm:max-w-3xl" : "sm:max-w-md"
        }`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/70 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-content">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-content-muted">{subtitle}</p>}
          </div>
          <button type="button" className="btn-ghost shrink-0 rounded-lg p-1" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
