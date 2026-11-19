import { useEffect, useState } from "react";

/** True while the media query matches; follows resizes and rotation. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== "undefined" && "matchMedia" in window ? window.matchMedia(query).matches : true);
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** The sidebar sits beside the content from this width up; below it, it opens as a drawer. */
export const DESKTOP_QUERY = "(min-width: 1024px)";
