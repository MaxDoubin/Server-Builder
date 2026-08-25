/**
 * Index of every topic hub.
 *
 * A crawler entry point into the archive by subject rather than by date,
 * and a way for a reader to find the seam they care about without
 * scrolling 236 posts.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";
import { getAllPosts } from "@/lib/blogPosts";
import { TAG_PAGES } from "@/lib/tagPages";

const SITE_URL = "https://maxdoubin.com";

export function CinematicTopics() {
  const withCounts = useMemo(() => {
    const posts = getAllPosts();
    return TAG_PAGES.map((page) => ({
      ...page,
      count: posts.filter((p) => p.tags.includes(page.tag)).length,
    })).sort((a, b) => b.count - a.count);
  }, []);

  useSEO({
    title: "Topics | Max Doubin",
    description:
      "Browse writing on networking, servers, security, Linux, storage, AI infrastructure and more, organised by subject rather than by date.",
    canonical: `${SITE_URL}/topics`,
    schema: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Topics",
      url: `${SITE_URL}/topics`,
      description:
        "Subject index for the writing archive on maxdoubin.com.",
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: withCounts.length,
        itemListElement: withCounts.map((t, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE_URL}/topics/${t.tag}`,
          name: t.title,
        })),
      },
    },
    schemaId: "topics-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1000px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Index · Topics
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.25rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              By subject.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              The archive organised by what things are about rather than when
              they were written. Subjects with only a post or two stay as
              filters on the index instead of getting a page here.
            </p>
          </header>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {withCounts.map((topic) => (
              <Link
                key={topic.tag}
                href={`/topics/${topic.tag}`}
                data-testid={`link-topic-${topic.tag}`}
                className="group rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.5)]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-lg font-medium text-[hsl(var(--brand-bone))]">
                    {topic.title}
                  </h2>
                  <span className="shrink-0 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                    {topic.count}
                  </span>
                </div>
                <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  {topic.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}
