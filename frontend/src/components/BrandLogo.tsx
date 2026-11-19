import { useState } from "react";
import { NOVA_BANK_LOGO_URL } from "../lib/brand";

/**
 * The Nova Bank logo, or a NOVA wordmark when the image cannot load (no internet on the bank network, a
 * blocked host, a moved file), instead of a broken-image icon.
 */
export function BrandLogo({
  className = "",
  tone = "dark",
  compact = false,
}: {
  className?: string;
  /** "dark" text for light backgrounds, "light" for dark ones. */
  tone?: "dark" | "light";
  /** Just the initial, for the collapsed sidebar. */
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        role="img"
        aria-label="Nova Bank"
        className={`inline-flex items-center font-extrabold tracking-[0.18em] leading-none ${
          tone === "light" ? "text-white" : "text-[#0b2a5b]"
        } ${compact ? "text-base" : "text-lg"}`}
      >
        {compact ? "N" : "NOVA"}
        {!compact && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-[#00a3e0]" aria-hidden />}
      </span>
    );
  }

  return <img src={NOVA_BANK_LOGO_URL} alt="Nova Bank" className={className} onError={() => setFailed(true)} />;
}
