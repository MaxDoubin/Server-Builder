/**
 * A topic hub for one tag.
 *
 * Rendered at /topics/:tag rather than under /blog, so it cannot collide
 * with the /blog/:slug post route. Each one carries real editorial copy
 * from lib/tagPages, which is what separates a topic hub a crawler wants
 * to index from a thin duplicate of the blog index.
 *
 * A tag with no entry in tagPages has no page here and 404s rather than
 * rendering an empty shell.
 */

import { useMemo } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getAllPosts, readMinutes } from "@/lib/blogPosts";
import { getTagPage, TAG_PAGES } from "@/lib/tagPages";

const SITE_URL = "https://maxdoubin.com";

export function CinematicTag() {
  const [, params] = useRoute("/topics/:tag");
  const tag = (params?.tag ?? "").toLowerCase();
  const page = getTagPage(tag);

  const posts = useMemo(
    () => (page ? getAllPosts().filter((p) => p.tags.includes(page.tag)) : []),
    [page],
  );

  useSEO({
    title: page ? `${page.title} | Max Doubin` : "Topic not found | Max Doubin",
    description:
      page?.description ??
      "This topic does not have a page. Browse all writing on networking, security and infrastructure instead.",
    canonical: page ? `${SITE_URL}/topics/${page.tag}` : `${SITE_URL}/blog`,
    noindex: !page,
    schema: page
      ? {
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: page.title,
          description: page.description,
          url: `${SITE_URL}/topics/${page.tag}`,
          isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: posts.length,
            itemListElement: posts.slice(0, 25).map((post, i) => ({
              "@type": "ListItem",
              position: i + 1,
              url: `${SITE_URL}/blog/${post.slug}`,
              name: post.title,
            })),
          },
        }
      : null,
    schemaId: "topic-schema",
  });

  if (!page) {
    return (
      <CinematicLayout>
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="text-center">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
              · Topic · Not found
            </div>
            <h1 className="mt-4 font-display text-4xl font-medium text-[hsl(var(--brand-bone))]">
              No page for that topic.
            </h1>
            <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              Topics with only a post or two stay as filters on the index
              rather than getting their own page.
            </p>
            <Link
              href="/topics"
              className="mt-8 inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All topics
            </Link>
          </div>
        </div>
      </CinematicLayout>
    );
  }

  const related = TAG_PAGES.filter((t) => t.tag !== page.tag).slice(0, 8);

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <nav aria-label="Breadcrumb">
            <Link
              href="/topics"
              data-testid="link-topics-index"
              className="inline-flex min-h-[24px] items-center gap-2 py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All topics
            </Link>
          </nav>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Topic
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              {page.title}
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              {page.intro}
            </p>
            <p className="mt-4 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              {posts.length} {posts.length === 1 ? "post" : "posts"}
            </p>
          </header>

          <ul className="mt-12 space-y-px overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))]">
            {posts.map((post) => (
              <li key={post.slug} className="bg-[hsl(var(--brand-graphite)/0.4)]">
                <Link
                  href={`/blog/${post.slug}`}
                  data-testid={`link-topic-post-${post.slug}`}
                  className="block px-5 py-4 transition-colors hover:bg-[hsl(var(--brand-graphite)/0.8)]"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="font-display text-base text-[hsl(var(--brand-bone))]">
                      {post.title}
                    </span>
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      <time dateTime={post.date}>{post.date}</time> ·{" "}
                      {readMinutes(post)} min
                    </span>
                  </div>
                  <p className="mt-1.5 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {post.excerpt}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <section className="mt-16 border-t border-[hsl(var(--brand-iron))] pt-8">
            <h2 className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
              Other topics
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {related.map((t) => (
                <Link
                  key={t.tag}
                  href={`/topics/${t.tag}`}
                  className="inline-flex min-h-[32px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3.5 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  {t.title}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </CinematicLayout>
  );
}
