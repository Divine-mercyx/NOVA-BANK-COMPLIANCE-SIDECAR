import { type CSSProperties, type ReactNode, useEffect, useId, useRef } from "react";

/**
 * A field of small ↗ arrows over a navy → cobalt → light wash, with a soft light pool behind the
 * headline. The arrows brighten in a slow diagonal wave; the canvas pauses off-screen, in hidden
 * tabs and under "reduce motion" (where it draws one still frame). Purely decorative.
 */
type Variant = "fade" | "solid";

const CELL = 14;
const FPS = 24;

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function makeSprite(color: string, dpr: number) {
  const size = Math.ceil(CELL * dpr);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return c;
  g.scale(dpr, dpr);
  g.strokeStyle = color;
  g.lineWidth = 1.6;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  g.moveTo(3.5, 10.5);
  g.lineTo(10, 4);
  g.moveTo(5.5, 4);
  g.lineTo(10, 4);
  g.lineTo(10, 8.5);
  g.stroke();
  return c;
}

export function ArrowField({
  variant = "fade",
  fadeTo = "#FFFFFF",
  glowAt = { x: 0.5, y: 0.42 },
  fadeStart = 0.5,
  followPointer = false,
  className = "",
  children,
}: {
  /** "fade" washes out to `fadeTo` at the bottom; "solid" stays blue (slim bands). */
  variant?: Variant;
  fadeTo?: string;
  /** Centre of the light pool, as fractions of width/height. */
  glowAt?: { x: number; y: number };
  /** Where (0–1 down the field) the blue starts lifting toward `fadeTo`. Raise it to keep text on solid blue. */
  fadeStart?: number;
  /** Let the light pool drift part of the way toward the pointer (off under reduced motion). */
  followPointer?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const host = wrap.current;
    if (!el || !host) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let white = makeSprite("#FFFFFF", dpr);
    let blue = makeSprite("#2F5FDB", dpr);
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let visible = true;
    // Light-pool position (fractions), eased toward `target` each frame.
    const glow = { x: glowAt.x, y: glowAt.y };
    const target = { x: glowAt.x, y: glowAt.y };
    const follow = followPointer && !reduce;

    const onPointerMove = (e: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const py = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      target.x = glowAt.x + (px - glowAt.x) * 0.45;
      target.y = glowAt.y + (py - glowAt.y) * 0.35;
    };
    const onPointerLeave = () => {
      target.x = glowAt.x;
      target.y = glowAt.y;
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
      if (nextDpr !== dpr) {
        dpr = nextDpr;
        white = makeSprite("#FFFFFF", dpr);
        blue = makeSprite("#2F5FDB", dpr);
      }
      w = rect.width;
      h = rect.height;
      el.width = Math.ceil(w * dpr);
      el.height = Math.ceil(h * dpr);
      draw(performance.now());
    };

    const draw = (time: number) => {
      if (!w || !h) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      const cols = Math.ceil(w / CELL);
      const rows = Math.ceil(h / CELL);
      const gx = glow.x * w;
      const gy = glow.y * h;
      const reach = Math.max(w, h) * 0.32;
      const size = CELL * dpr;
      const phase = reduce ? 0 : time * 0.0011;

      for (let r = 0; r < rows; r++) {
        const y = r * CELL;
        const ny = (y + CELL / 2) / h;
        let aWhite: number;
        let aBlue: number;
        if (variant === "fade") {
          const f = fadeStart;
          const span = 1 - f;
          aWhite = (0.12 + 0.32 * smoothstep(0, f, ny)) * (1 - smoothstep(f + span * 0.1, f + span * 0.6, ny));
          aBlue = 0.55 * smoothstep(f, f + span * 0.44, ny) * (1 - smoothstep(f + span * 0.56, 1, ny));
        } else {
          aWhite = 0.12 + 0.22 * smoothstep(0, 1, ny);
          aBlue = 0;
        }
        if (aWhite <= 0.01 && aBlue <= 0.01) continue;

        for (let c = 0; c < cols; c++) {
          const x = c * CELL;
          const wave = 0.5 + 0.5 * Math.sin((x * 0.6 + y * 0.4) / 80 - phase);
          const dist = Math.hypot(x - gx, y - gy) / reach;
          // Quieter arrows inside the light pool keep the headline readable.
          const calm = 0.35 + 0.65 * smoothstep(0.25, 1, dist);
          const shimmer = 0.7 + 0.45 * wave;
          const px = x * dpr;
          const py = y * dpr;
          if (aWhite > 0.01) {
            ctx.globalAlpha = Math.min(1, aWhite * calm * shimmer);
            ctx.drawImage(white, px, py, size, size);
          }
          if (aBlue > 0.01) {
            ctx.globalAlpha = Math.min(1, aBlue * shimmer);
            ctx.drawImage(blue, px, py, size, size);
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const loop = (time: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      if (time - last < 1000 / FPS) return;
      last = time;
      if (follow) {
        glow.x += (target.x - glow.x) * 0.12;
        glow.y += (target.y - glow.y) * 0.12;
        host.style.setProperty("--glow-x", `${(glow.x * 100).toFixed(2)}%`);
        host.style.setProperty("--glow-y", `${(glow.y * 100).toFixed(2)}%`);
      }
      draw(time);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(host);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(host);
    resize();
    if (!reduce) raf = requestAnimationFrame(loop);
    if (follow) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      ro.disconnect();
      io.disconnect();
    };
  }, [variant, glowAt.x, glowAt.y, fadeStart, followPointer]);

  const wash =
    variant === "fade"
      ? `linear-gradient(180deg, #08194D 0%, #13319E ${Math.round(fadeStart * 52)}%, #2B59D6 ${Math.round(fadeStart * 100)}%, #7FA3EE ${Math.round((fadeStart + (0.96 - fadeStart) * 0.48) * 100)}%, ${fadeTo} 96%)`
      : "linear-gradient(180deg, #08194D 0%, #13319E 55%, #1E43B8 100%)";
  const glow = `radial-gradient(${variant === "fade" ? "34% 30%" : "40% 120%"} at var(--glow-x, ${glowAt.x * 100}%) var(--glow-y, ${glowAt.y * 100}%), rgba(118, 156, 255, 0.55), rgba(118, 156, 255, 0) 70%)`;
  const style: CSSProperties = { backgroundImage: `${glow}, ${wash}` };

  return (
    <div ref={wrap} className={`relative isolate overflow-hidden ${className}`} style={style}>
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 -z-10 h-full w-full" aria-hidden />
      {children}
    </div>
  );
}

/** Gradient geometric marks (arrow, ring, plus, bars) used as section and metric icons. */
export function Glyph({ kind, className = "h-10 w-10" }: { kind: "arrow" | "ring" | "plus" | "bars"; className?: string }) {
  const id = `glyph-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8DB0FA" />
          <stop offset="55%" stopColor="#3B6FE0" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
      </defs>
      {kind === "arrow" && <path d="M8 6h34v34h-9V21.4L12.4 42 6 35.6 26.6 15H8z" fill={`url(#${id})`} />}
      {kind === "ring" && <path d="M24 4a20 20 0 1 1 0 40 20 20 0 0 1 0-40zm0 11a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" fill={`url(#${id})`} fillRule="evenodd" />}
      {kind === "plus" && <path d="M19 4h10v15h15v10H29v15H19V29H4V19h15z" fill={`url(#${id})`} />}
      {kind === "bars" && <path d="M6 28h9v16H6zM19.5 16h9v28h-9zM33 4h9v40h-9z" fill={`url(#${id})`} />}
    </svg>
  );
}
