/*
  One slug rule for article headings, used on both sides.

  The prerenderer stamps ids onto h2 and h3 in the static HTML so a section
  is linkable before any JavaScript runs, and so a crawler can offer a jump
  to it. After hydration usePostHeadings walks the same headings and stamps
  ids again for the table of contents.

  If the two disagreed by one character, every deep link would break the
  moment the page hydrated: the anchor in the static HTML would point at an
  id that no longer exists. They import this instead of each keeping a copy.
*/

/** Ids that belong to the page shell and that a heading must not steal. */
export const RESERVED_PAGE_IDS = new Set(["root", "main-content"]);

export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * The id for one heading, given the slugs already taken on this page.
 *
 * Mirrors the client's collision rule exactly: a repeat gets -2, then -3,
 * and the page shell's own ids are treated as taken so a heading called
 * "Root" cannot collide with the React mount point.
 *
 * Mutates `used`, which is how the caller carries state across a document.
 */
export function uniqueHeadingId(text: string, used: Set<string>): string {
  const base = slugifyHeading(text);
  let id = base;
  let n = 2;
  while (used.has(id) || RESERVED_PAGE_IDS.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  used.add(id);
  return id;
}
