import { AlertCircle, Check } from "lucide-react";
import { type InputHTMLAttributes, type ReactNode, useId } from "react";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: string;
  /** Persistent helper text under the field. */
  hint?: string;
  /** Inline validation message; turns the border red and is announced to screen readers. */
  error?: string;
  /** Non-blocking caution (e.g. Caps Lock is on). */
  warning?: string;
  /** Field passes validation: shows a check mark. */
  valid?: boolean;
  /** Right-aligned control inside the field, such as the show/hide toggle. */
  trailing?: ReactNode;
  /** Small icon inside the left edge of the field. */
  leading?: ReactNode;
};

/**
 * Plain labelled input on the app's own `.input` style. The label is always visible above the
 * control, focus is a border-colour change, and hint / warning / error text is wired to the input
 * with aria-describedby so it is read out with the field. 16px text avoids iOS zoom-on-focus.
 */
export function Field({ label, hint, error, warning, valid, trailing, leading, id, ...input }: FieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const noteId = `${fieldId}-note`;
  const note = error ?? warning ?? hint;

  return (
    <div>
      <label htmlFor={fieldId} className="label">
        {label}
      </label>
      <div className="group relative">
        {leading && (
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-content-subtle transition-colors group-focus-within:text-brand"
            aria-hidden
          >
            {leading}
          </span>
        )}
        <input
          {...input}
          id={fieldId}
          className={`input h-11 text-base aria-[invalid=true]:border-danger aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-danger/30 ${
            trailing ? "pr-16" : valid && !error ? "pr-10" : ""
          } ${leading ? "pl-10" : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
        />
        {valid && !error && !trailing && (
          <Check
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success"
            strokeWidth={2.5}
            aria-hidden
          />
        )}
        {trailing}
      </div>
      {note && (
        <p
          id={noteId}
          role={error ? "alert" : warning ? "status" : undefined}
          className={`mt-1.5 flex items-start gap-1.5 text-sm leading-5 ${
            error ? "text-danger" : warning ? "text-amber-700" : "text-content-muted"
          }`}
        >
          {(error || warning) && <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
          {note}
        </p>
      )}
    </div>
  );
}
