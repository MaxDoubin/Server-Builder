/**
 * Applies the Google Fonts stylesheet that index.html loads at media="print".
 *
 * The sheet is fetched as print so it never blocks the first paint, and it
 * has to be switched to "all" once it arrives. That switch used to be an
 * inline onload attribute, which the production CSP refuses (script-src has
 * no 'unsafe-inline'), so the webfonts never applied on screen. Doing it from
 * the bundle is allowed by 'self'.
 *
 * The sheet may have finished loading before this module runs, in which case
 * no load event is coming: link.sheet is the signal for that. Flipping a
 * sheet that is still in flight would make it render blocking again, so that
 * case waits for load instead.
 */
export function applyDeferredFonts(): void {
  const links = document.querySelectorAll<HTMLLinkElement>("link[data-deferred-fonts]");
  links.forEach((link) => {
    const apply = () => {
      link.media = "all";
    };
    if (link.sheet) apply();
    else link.addEventListener("load", apply, { once: true });
  });
}
