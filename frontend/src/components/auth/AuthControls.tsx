import { motion, type HTMLMotionProps } from "motion/react";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { spring } from "../../lib/motion";

/** Filled cobalt CTA at full width. Press feedback only; hover is a plain colour change. */
export function PrimaryButton({ children, disabled, ...props }: HTMLMotionProps<"button">) {
  return (
    <motion.button
      data-motion
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={spring}
      className="btn-primary group h-11 w-full !py-0 font-bold shadow-[0_8px_20px_-10px_rgba(30,64,175,0.65)] hover:shadow-[0_10px_24px_-10px_rgba(30,64,175,0.8)]"
      {...props}
    >
      <>
        {children}
        <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-disabled:translate-x-0" aria-hidden />
      </>
    </motion.button>
  );
}

/** Text toggle that sits inside a field (Show / Hide password). */
export function FieldToggle({ children, ...props }: HTMLMotionProps<"button">) {
  return (
    <motion.button
      data-motion
      type="button"
      whileTap={{ scale: 0.98 }}
      transition={spring}
      className="absolute right-1.5 top-1/2 h-8 -translate-y-1/2 rounded-md px-2.5 text-sm font-semibold text-brand transition-colors hover:bg-brand-muted hover:text-brand-hover"
      {...props}
    >
      {children}
    </motion.button>
  );
}

const MotionLink = motion.create(Link);

/** Filled dark-slate CTA rendered as a link, with the same tap spring as PrimaryButton. */
export function SecondaryLink({ to, children, compact = false }: { to: string; children: ReactNode; compact?: boolean }) {
  return (
    <MotionLink
      to={to}
      data-motion
      whileTap={{ scale: 0.98 }}
      transition={spring}
      className={`btn-dark !py-0 font-bold ${compact ? "h-10" : "h-11 w-full"}`}
    >
      {children}
    </MotionLink>
  );
}
