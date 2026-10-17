/** The product's twelve-spoke compass mark, white on a cobalt rounded square. */
export function BrandMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-soft ${className}`}>
      <svg viewBox="0 0 32 32" className="h-[60%] w-[60%]" fill="currentColor" aria-hidden>
        <circle cx="16" cy="16" r="3" />
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6;
          return (
            <line
              key={i}
              x1={16 + Math.cos(a) * 6}
              y1={16 + Math.sin(a) * 6}
              x2={16 + Math.cos(a) * 11}
              y2={16 + Math.sin(a) * 11}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </span>
  );
}
