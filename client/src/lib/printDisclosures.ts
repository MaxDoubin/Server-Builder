/**
 * Open collapsed disclosures for printing, then put them back.
 *
 * A closed <details> prints as a titled empty box. On /certifications that
 * box is "Exam objective domains (SY0-701)" and what it hides is the whole
 * point of printing the page: the domains, their exam weightings and what
 * each one covers. Three of those printed as three empty rectangles.
 *
 * CSS cannot fix this portably. Chrome hides the contents through
 * ::details-content, which only became styleable in Chrome 131, and Firefox
 * and Safari hide them another way again, so a print rule that works in one
 * browser silently does nothing in the next. beforeprint is supported
 * everywhere and is what the platform offers for exactly this.
 *
 * Disclosures marked data-print-hide are left alone: they are already being
 * dropped from the printed page, and opening them first would be pointless.
 */
export function installPrintDisclosures(): () => void {
  if (typeof window === "undefined") return () => {};

  // Only the ones this code opened get closed again, so a reader who had a
  // section expanded before hitting print still has it expanded after.
  let opened: HTMLDetailsElement[] = [];

  const expand = () => {
    const closed = Array.from(
      document.querySelectorAll<HTMLDetailsElement>("details:not([open])"),
    ).filter((el) => !el.hasAttribute("data-print-hide"));
    // Add to the record rather than replace it. Both paths below can fire
    // for one print, and on the second call nothing is closed any more, so
    // replacing here would throw away the list of what to put back and
    // leave every section expanded after the reader returns to the page.
    opened = opened.concat(closed);
    for (const el of closed) el.open = true;
  };

  const restore = () => {
    for (const el of opened) el.open = false;
    opened = [];
  };

  window.addEventListener("beforeprint", expand);
  window.addEventListener("afterprint", restore);

  // Safari fires no print events. It does flip this media query, which is
  // the documented stand-in, and Chrome and Firefox honour it too, so both
  // paths can fire for a single print. That is why expand() accumulates and
  // restore() clears: whichever fires first opens and records, whichever
  // fires second finds nothing to add, and the first restore puts them back.
  const mq = window.matchMedia?.("print");
  const onMedia = (e: MediaQueryListEvent) => (e.matches ? expand() : restore());
  mq?.addEventListener?.("change", onMedia);

  return () => {
    window.removeEventListener("beforeprint", expand);
    window.removeEventListener("afterprint", restore);
    mq?.removeEventListener?.("change", onMedia);
  };
}
