/**
 * "Found a mistake?" footer link for a post.
 *
 * Opens the reader's own mail client with a correction already addressed,
 * and with the post's URL in the subject and the body so the report says
 * which page it is about. Email is where the site already tells people to
 * send corrections.
 *
 * This used to open the post's markdown file in GitHub's web editor, which
 * linked the site's source repository from every article. The site links
 * Max's GitHub profile and nothing inside it, so the repository link went.
 */

import { siteConfig } from "@/lib/siteConfig";

const SITE_URL = "https://maxdoubin.com";

export function SuggestEdit({ slug }: { slug: string }) {
  const pageUrl = `${SITE_URL}/blog/${slug}`;
  const subject = `Correction: ${pageUrl}`;
  const body = `Page: ${pageUrl}\n\nWhat is wrong, and what it should say:\n\n`;
  const href = `mailto:${siteConfig.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <a
      href={href}
      data-testid="link-suggest-edit"
      className="group inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
    >
      <span aria-hidden>✎</span>
      Found a mistake? Email a correction
      <span className="sr-only">(opens your mail client)</span>
    </a>
  );
}
