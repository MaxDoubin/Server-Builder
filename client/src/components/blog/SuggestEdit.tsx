/**
 * "Suggest an edit" footer link for a post.
 *
 * Points at GitHub's web editor for the post's own markdown file. GitHub
 * forks the repository for anyone without write access and opens a pull
 * request from there, so a reader who spots a typo can fix it without
 * cloning anything.
 *
 * The href is built from the slug, which is also the filename in
 * client/src/content/posts, so this stays correct as posts are added.
 */

const EDIT_BASE =
  "https://github.com/MaxDoubin/Server-Builder/edit/main/client/src/content/posts";

export function SuggestEdit({ slug }: { slug: string }) {
  return (
    <a
      href={`${EDIT_BASE}/${slug}.md`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="link-suggest-edit"
      className="group inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
    >
      <span aria-hidden>✎</span>
      Found a mistake? Suggest an edit
      {/* The arrow marks this as leaving the site. It is decorative; the
          destination is already announced by the link text plus the
          screen-reader note below. */}
      <span
        aria-hidden
        className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      >
        ↗
      </span>
      <span className="sr-only">(opens the post's source file on GitHub)</span>
    </a>
  );
}
