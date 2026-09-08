/**
 * The articles behind a practise surface, and the surface behind an article.
 *
 * Two of two hundred and sixty articles linked to a practise surface, and one
 * surface of twenty linked back. A reader finishing an article on path MTU
 * had no idea there was a page that walks a packet down one; a reader on that
 * page had no idea there were three articles about it. The two halves of the
 * site were built by the same person on the same subjects and did not know
 * about each other.
 *
 * Both directions come from one curated map in the practise registry, so the
 * link a reader follows one way is the same relationship read the other way,
 * and neither can drift from the other.
 */

import { Link } from "wouter";
import { PRACTISE_SURFACES } from "@/lib/practiseSurfaces";
import { postIndex } from "@/lib/postIndex";

/** The articles for a surface, in the order they were curated. */
export function ReadAboutThis({ href }: { href: string }) {
  const surface = PRACTISE_SURFACES.find((item) => item.href === href);
  const slugs = surface?.reading ?? [];
  if (slugs.length === 0) return null;

  const posts = slugs
    .map((slug) => postIndex.find((post) => post.slug === slug))
    .filter((post): post is (typeof postIndex)[number] => post !== undefined && !post.draft);
  if (posts.length === 0) return null;

  return (
    <section className="mt-14" data-testid="read-about-this">
      <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
        · Read about this
      </h2>
      <p className="mt-3 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
        The written version, where the reasoning is worked through rather than
        exercised.
      </p>
      <ul className="mt-5 space-y-2.5">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link
              href={`/blog/${post.slug}`}
              data-testid={`read-${post.slug}`}
              className="block rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.4)] px-4 py-3 transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              <span className="font-mono-tight text-[13.5px] text-[hsl(var(--brand-bone))]">
                {post.title}
              </span>
              <span className="mt-1 block font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
                {post.excerpt}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The surface an article's subject is practised on, if there is one.
 *
 * An article can belong to two: first-match-wins is cited by the firewall
 * exercises and by the routing tables, because it is the same rule and its
 * opposite. Both are shown, because that pair is the point.
 */
export function PractiseThis({ slug }: { slug: string }) {
  const surfaces = PRACTISE_SURFACES.filter((item) => (item.reading ?? []).includes(slug));
  if (surfaces.length === 0) return null;

  return (
    <aside
      className="mt-10 rounded-2xl border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.05)] p-5"
      data-testid="practise-this"
    >
      <h2 className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
        · {surfaces.length === 1 ? "Practise this" : "Practise this, two ways"}
      </h2>
      <ul className="mt-3 space-y-2">
        {surfaces.map((surface) => (
          <li key={surface.href}>
            <Link
              href={surface.href}
              data-testid={`practise-${surface.href.slice(1)}`}
              className="font-mono-tight text-[13.5px] text-[hsl(var(--brand-bone))] underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
            >
              {surface.title}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
        In the browser, with nothing to install and nothing sent anywhere.
      </p>
    </aside>
  );
}
