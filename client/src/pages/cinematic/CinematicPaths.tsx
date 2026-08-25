/**
 * Curated reading orders.
 *
 * Reverse-chronological is the wrong order for learning a subject, so this
 * page offers four routes through the archive with a reason attached to
 * every step. The sequences live in lib/readingPaths.ts; anything that no
 * longer resolves to a published post is dropped there rather than rendered
 * as a dead link.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { readMinutes } from "@/lib/blogPosts";
import { postDifficulty } from "@/lib/postDifficulty";
import { DifficultyBadge } from "@/components/blog/DifficultyBadge";
import { pathWordCount, readingPaths, resolvePath } from "@/lib/readingPaths";
import { useSEO } from "@/lib/useSEO";

const SITE_URL = "https://maxdoubin.com";

export function CinematicPaths() {
  const paths = useMemo(
    () =>
      readingPaths
        .map((path) => ({ path, steps: resolvePath(path) }))
        .filter((p) => p.steps.length > 0),
    [],
  );

  const pathsSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/paths`,
      name: "Reading paths",
      url: `${SITE_URL}/paths`,
      description:
        "Four curated routes through the field notes, in the order they make the most sense.",
      author: { "@id": `${SITE_URL}/#person` },
      inLanguage: "en-US",
      mainEntity: paths.map(({ path, steps }) => ({
        "@type": "ItemList",
        name: path.title,
        description: path.blurb,
        numberOfItems: steps.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: steps.map((step, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE_URL}/blog/${step.post.slug}`,
          name: step.post.title,
        })),
      })),
    }),
    [paths],
  );

  useSEO({
    title: "Reading paths | Max Doubin",
    description:
      "Four curated routes through the archive: networking from scratch, security fundamentals, AI meets infrastructure, and homelab operations.",
    canonical: `${SITE_URL}/paths`,
    schema: pathsSchema,
    schemaId: "paths-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1100px]">
          <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
            · Journal · Reading Paths
          </div>
          <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
            Reading paths.
          </h1>
          <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            The archive is in date order, which is the worst possible order for
            learning anything: the newest note assumes the most and the starting
            point is buried. These four routes fix that. Each step says why it
            comes after the one before it. Read them in order or skip around;
            nothing here is gated.
          </p>

          <nav
            aria-label="Jump to a path"
            className="mt-10 flex flex-wrap items-center gap-2 border-y border-[hsl(var(--brand-iron))] py-4"
          >
            <span className="mr-2 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              path ·
            </span>
            {paths.map(({ path, steps }) => (
              <a
                key={path.id}
                href={`#${path.id}`}
                data-testid={`link-path-${path.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
              >
                {path.title}
                <span className="text-[hsl(var(--brand-signal))]">{steps.length}</span>
              </a>
            ))}
          </nav>

          <div className="mt-16 space-y-20">
            {paths.map(({ path, steps }) => {
              const minutes = Math.max(1, Math.ceil(pathWordCount(steps) / 200));
              return (
                <section
                  key={path.id}
                  id={path.id}
                  aria-labelledby={`${path.id}-heading`}
                  className="scroll-mt-28"
                >
                  <div className="border-b border-[hsl(var(--brand-iron))] pb-4">
                    <h2
                      id={`${path.id}-heading`}
                      className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl"
                    >
                      {path.title}
                    </h2>
                    <p className="mt-3 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                      {path.blurb}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      <span>
                        {steps.length} note{steps.length === 1 ? "" : "s"}
                      </span>
                      <span aria-hidden className="h-px w-4 bg-[hsl(var(--brand-iron))]" />
                      <span>about {minutes} min of reading</span>
                    </div>
                  </div>

                  <ol className="mt-6 space-y-3">
                    {steps.map((step, i) => (
                      <li key={step.post.slug}>
                        <Link
                          href={`/blog/${step.post.slug}`}
                          data-testid={`link-path-step-${step.post.slug}`}
                          className="group flex gap-4 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.35)] p-4 transition-colors hover:border-[hsl(var(--brand-signal)/0.45)]"
                        >
                          <span
                            aria-hidden
                            className="mt-[2px] w-6 shrink-0 font-mono-tight text-sm tabular-nums text-[hsl(var(--brand-signal))]"
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-display text-base leading-snug text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                              {step.post.title}
                            </span>
                            <span className="mt-1.5 block font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                              {step.why}
                            </span>
                            <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                              <span>{readMinutes(step.post)} min read</span>
                              <DifficultyBadge level={postDifficulty(step.post)} />
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>

          <div className="mt-20 flex flex-wrap gap-6 border-t border-[hsl(var(--brand-iron))] pt-8">
            <Link
              href="/blog"
              className="inline-flex min-h-[24px] items-center py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← All field notes
            </Link>
            <Link
              href="/archive"
              className="inline-flex min-h-[24px] items-center py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              Full archive →
            </Link>
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}
