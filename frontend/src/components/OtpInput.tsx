import { type ClipboardEvent, type KeyboardEvent, useRef } from "react";

const LENGTH = 6;

export function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(LENGTH, " ").split("").slice(0, LENGTH);

  const commit = (next: string) => {
    onChange(next.replace(/\D/g, "").slice(0, LENGTH));
  };

  const focusAt = (index: number) => {
    const el = inputs.current[index];
    if (el) {
      el.focus();
      el.select();
    }
  };

  const setDigit = (index: number, char: string) => {
    const arr = digits.map((d) => (d === " " ? "" : d));
    arr[index] = char;
    commit(arr.join(""));
  };

  const onDigitChange = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      setDigit(index, "");
      return;
    }
    if (cleaned.length > 1) {
      commit((value.slice(0, index) + cleaned).slice(0, LENGTH));
      focusAt(Math.min(index + cleaned.length, LENGTH - 1));
      return;
    }
    setDigit(index, cleaned);
    if (index < LENGTH - 1) focusAt(index + 1);
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index]?.trim() && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
      setDigit(index - 1, "");
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
    }
    if (e.key === "ArrowRight" && index < LENGTH - 1) {
      e.preventDefault();
      focusAt(index + 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!text) return;
    commit(text);
    focusAt(Math.min(text.length, LENGTH) - 1);
  };

  return (
    <div className="otp-boxes" role="group" aria-label="One-time password digits">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputs.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          className="otp-box"
          value={digit === " " ? "" : digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${LENGTH}`}
          onChange={(e) => onDigitChange(index, e.target.value)}
          onKeyDown={(e) => onKeyDown(index, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
