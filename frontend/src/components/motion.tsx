import { createPortal } from "react-dom";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type HTMLMotionProps,
} from "motion/react";
import { type ReactNode, useEffect } from "react";
import { formatNumber } from "../lib/format";
import {
  ENTRANCE,
  MAX_ANIMATED_ROWS,
  containerVariants,
  itemVariants,
  pageVariants,
  rowVariants,
  spring,
  tbodyVariants,
} from "../lib/motion";

/** Route transition: fade + slight rise in, quick fade out. Key it on the pathname. */
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={routeKey} variants={pageVariants} initial="hidden" animate="visible" exit="exit">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Orchestrates a staggered entrance of any `StaggerItem` (or other variant-only) descendants. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={containerVariants}>
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  /** Adds a subtle lift + scale on hover (for tiles that read as interactive cards). */
  hover?: boolean;
}) {
  return (
    <motion.div
      className={className}
      variants={itemVariants}
      whileHover={hover ? { y: -3, scale: 1.02 } : undefined}
      transition={spring}
    >
      {children}
    </motion.div>
  );
}

/**
 * Banner that springs in and out. Pass `show` — the previous children are kept while the exit
 * animation plays, so the message does not blank out before it fades.
 */
export function AnimatedAlert({
  show,
  className,
  children,
  role = "alert",
  shakeKey,
}: {
  show: boolean;
  className?: string;
  children: ReactNode;
  role?: "alert" | "status";
  /** Change this value to replay a small horizontal shake (used for failed sign-ins). */
  shakeKey?: number | string;
}) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key={shakeKey ?? "alert"}
          role={role}
          className={className}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0, x: shakeKey !== undefined ? [0, -6, 6, -4, 4, 0] : 0 }}
          exit={{ opacity: 0, y: -6, transition: { duration: 0.15 } }}
          transition={shakeKey !== undefined ? { duration: 0.4 } : spring}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Shimmering placeholder. The shimmer is a CSS transform animation (see index.css). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonCard({ className = "h-64" }: { className?: string }) {
  return <Skeleton className={`rounded-xl border border-border ${className}`} />;
}

/**
 * Dialog shell with a fading backdrop and a spring-in panel. Mount it inside an
 * <AnimatePresence> (conditionally) so the exit animation can run.
 */
export function ModalShell({
  onClose,
  children,
  labelledBy,
  panelClassName = "max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-lg",
  overlayClassName = "absolute inset-0 bg-slate-900/40",
  dismissible = true,
}: {
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
  panelClassName?: string;
  overlayClassName?: string;
  dismissible?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissible) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, dismissible]);

  // Portalled to <body> so the dialog layers above the sticky app header.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        className={overlayClassName}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={() => dismissible && onClose()}
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative z-10 w-full ${panelClassName}`}
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.14 } }}
        transition={spring}
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}

/** Table body that staggers its rows in. Rows beyond MAX_ANIMATED_ROWS render plainly. */
export function AnimatedTBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.tbody className={className} variants={tbodyVariants}>
      {children}
    </motion.tbody>
  );
}

export function AnimatedRow({
  index,
  children,
  className,
  onClick,
}: {
  index: number;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  if (index >= MAX_ANIMATED_ROWS) {
    return (
      <tr className={className} onClick={onClick}>
        {children}
      </tr>
    );
  }
  return (
    <motion.tr variants={rowVariants} className={className} onClick={onClick}>
      {children}
    </motion.tr>
  );
}

const PLAIN_INTEGER = /^(\d{1,3}(,\d{3})+|\d+)$/;

function toInteger(value: string | number): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const t = value.trim();
  return PLAIN_INTEGER.test(t) ? Number(t.replace(/,/g, "")) : null;
}

/**
 * Counts up to an integer (and between values when it changes), so a figure that has just
 * arrived or updated is noticed. Anything that is not a plain integer (a percentage, a date, "—")
 * is rendered as-is. With reduced motion it simply shows the final value.
 */
export function AnimatedNumber({ value, className = "" }: { value: string | number; className?: string }) {
  const target = toInteger(value);
  const reduce = useReducedMotion();
  const mv = useMotionValue(target !== null && reduce ? target : 0);
  const text = useTransform(mv, (v) => formatNumber(Math.round(v)));

  useEffect(() => {
    if (target === null) return;
    if (reduce) {
      mv.set(target);
      return;
    }
    const controls = animate(mv, target, { duration: 0.7, ease: "easeOut" });
    return () => controls.stop();
  }, [target, reduce, mv]);

  if (target === null) return <span className={className}>{value}</span>;
  return <motion.span className={`tabular-nums ${className}`}>{text}</motion.span>;
}

/** A section that fades in (10px rise) the first time it scrolls into view. For long pages. */
export function RevealSection({ children, ...props }: HTMLMotionProps<"section">) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -40px 0px" }}
      transition={ENTRANCE}
      {...props}
    >
      {children}
    </motion.section>
  );
}
