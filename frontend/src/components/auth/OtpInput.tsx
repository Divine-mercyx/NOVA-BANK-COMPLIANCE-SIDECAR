import { useRef, useState } from "react";

/**
 * Six-cell one-time-code field. One real <input> sits transparently over the cells, so paste,
 * autofill (`one-time-code`), the numeric keyboard and screen readers all behave like a normal
 * input; the cells are only the visual layer. The active cell is a plain 1.5px border change.
 */
export function OtpInput({
  id,
  value,
  onChange,
  invalid = false,
  length = 6,
  disabled = false,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  invalid?: boolean;
  length?: number;
  disabled?: boolean;
  describedBy?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const activeIndex = Math.min(value.length, length - 1);

  return (
    <div className="relative" onClick={() => ref.current?.focus()}>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden>
        {Array.from({ length }).map((_, i) => {
          const char = value[i];
          const active = focused && i === activeIndex;
          return (
            <div key={i} className={`auth-otp-cell ${active ? "is-active" : ""} ${invalid ? "is-invalid" : ""}`}>
              {char}
              {active && !char && <span className="auth-otp-caret" />}
            </div>
          );
        })}
      </div>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={length}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
        aria-label="One-time password"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
    </div>
  );
}
