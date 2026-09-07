/**
 * Page titles that survive a Google results page.
 *
 * Google renders roughly 60 characters of a <title> and cuts the rest. 114 of
 * this site's pages were over that when it was measured, every one because a
 * specific, well written article title had " | Max Doubin" appended. The branding is what
 * got shown; the words a searcher typed are what got cut.
 *
 * So the suffix is a nice-to-have. Short titles keep it, where the brand is
 * free. Long ones drop it and spend the whole budget on the subject.
 *
 * Both the prerenderer and useSEO go through here, because if they disagree
 * the client would rewrite the title the crawler was served.
 */

export const TITLE_LIMIT = 60;

export const SITE_SUFFIX = "Max Doubin";

/** Join a subject to the site name, dropping the name if the result is too long. */
export function pageTitle(subject: string, suffix: string = SITE_SUFFIX): string {
  const full = `${subject} | ${suffix}`;
  return full.length <= TITLE_LIMIT ? full : subject;
}

/**
 * Trim an already-assembled title.
 *
 * useSEO's callers pass a finished string like "Uses | Max Doubin", so this
 * takes the suffix back off rather than asking every call site to change.
 */
export function trimTitle(title: string, suffix: string = SITE_SUFFIX): string {
  if (title.length <= TITLE_LIMIT) return title;
  const tail = ` | ${suffix}`;
  return title.endsWith(tail) ? title.slice(0, -tail.length) : title;
}
