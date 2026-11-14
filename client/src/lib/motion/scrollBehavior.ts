/**
 * `behavior` for a programmatic `window.scrollTo`.
 *
 * The global reduced-motion rule sets `scroll-behavior: auto` in CSS, but
 * an explicit `behavior: "smooth"` passed from script overrides the CSS
 * property, so script-driven scrolls have to ask for themselves.
 */
export function scrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    ? "auto"
    : "smooth";
}
