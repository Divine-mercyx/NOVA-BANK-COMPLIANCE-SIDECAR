import { useEffect } from "react";

/**
 * Keeps form fields clear of a mobile on-screen keyboard.
 *
 * - Publishes the keyboard height as `--kb-inset` (from the visual viewport), which the auth
 *   shell uses as bottom padding so the primary button can scroll above the keyboard.
 * - When a field gains focus, scrolls it to the middle of the visible area once the keyboard has
 *   finished opening. The ambient background is `position: fixed`, so it is never cut off.
 *
 * Pairs with `interactive-widget=resizes-content` in the viewport meta (Chrome/Android), where the
 * layout viewport itself shrinks and the inset simply stays 0.
 */
export function useKeyboardAwareLayout() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;

    const update = () => {
      if (!vv) return;
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches("input, textarea, select")) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(() => target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" }), 280);
    };

    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.removeEventListener("focusin", onFocusIn);
      root.style.removeProperty("--kb-inset");
    };
  }, []);
}
