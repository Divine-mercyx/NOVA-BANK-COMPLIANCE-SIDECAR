import { MotionConfig, type Transition, type Variants } from "motion/react";
import type { ReactNode } from "react";

/** Shared easing — a soft "out-expo" feel for entrances. */
export const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Spring used for modals, drawers, pills and other physical movement. */
export const spring: Transition = { type: "spring", stiffness: 300, damping: 30 };

/**
 * Route-level variants. The page wrapper owns "hidden" / "visible" / "exit"; any descendant
 * motion element that only declares `variants` (no initial/animate) inherits these labels,
 * which is what makes the staggered entrance work without prop drilling.
 */
/** Functional entrance: a 0.2s linear fade with a 10px rise. Nothing bounces or overshoots. */
export const ENTRANCE: Transition = { duration: 0.2, ease: "linear" };

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { ...ENTRANCE, staggerChildren: 0.04, delayChildren: 0.02 },
  },
  exit: { opacity: 0, transition: { duration: 0.1, ease: "linear" } },
};

export const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
};

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: ENTRANCE },
};

export const tbodyVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.03 } },
};

export const rowVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: ENTRANCE },
};

/** Only the first N table rows are animated so very long tables stay cheap. */
export const MAX_ANIMATED_ROWS = 12;

/**
 * Honours `prefers-reduced-motion`: with `reducedMotion="user"` Motion drops transform and
 * layout animations (translate, scale, layoutId morphs) and keeps only opacity fades.
 */
export function AppMotionConfig({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
