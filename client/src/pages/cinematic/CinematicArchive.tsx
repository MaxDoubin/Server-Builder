/**
 * The whole archive on one page.
 *
 * The blog listing paginates, which is right for reading but leaves most of
 * the writing several clicks from any entry point. This page is the flat
 * index: every published post, newest first, one line each, with a link to
 * each. It exists as much for crawlers as for people.
 *
 * Dates are split out of the ISO string rather than passed through Date,
 * because `new Date("2026-05-09")` is midnight UTC, which renders as the
 * 8th anywhere west of Greenwich and would file some posts under the wrong
 * month.
 */

import { useMemo } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { getAllPosts, readMinutes } from "@/lib/blogPosts";
import type { PostMeta } from "@/lib/postIndex";
import { useSEO } from "@/lib/useSEO";

const SITE_URL = "https://maxdoubin.com";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface MonthGroup {
  month: number;
  posts: PostMeta[];
}

interface YearGroup {
  year: number;
  count: number;
  months: MonthGroup[];
}

function groupByYearAndMonth(posts: PostMeta[]): YearGroup[] {
  const years = new Map<number, Map<number, PostMeta[]>>();

  for (const post of posts) {
    const [y, m] = post.date.split("-").map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
    let months = years.get(y);
    if (!months) {
      months = new Map();
      years.set(y, months);
    }
    const bucket = months.get(m);
    if (bucket) bucket.push(post);
    else months.set(m, [post]);
  }

  return Array.from(years.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => ({
      year,
      count: Array.from(months.values()).reduce((n, list) => n + list.length, 0),
      months: Array.from(months.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([month, list]) => ({ month, posts: list })),
    }));
}

export function CinematicArchive() {
  // getAllPosts sorts a fresh array on every call, so hold it.
  const posts = useMemo(() => getAllPosts(), []);
  const groups = useMemo(() => groupByYearAndMonth(posts), [posts]);

  const archiveSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${SITE_URL}/archive`,
      name: "Archive",
      url: `${SITE_URL}/archive`,
      description:
        "Every published field note on maxdoubin.com, in one chronological list.",
      isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
      author: { "@id": `${SITE_URL}/#person` },
      inLanguage: "en-US",
    }),
    [],
  );

  useSEO({
    title: "Archive | Max Doubin",
    description:
      "Every field note on maxdoubin.com in one chronological list, grouped by year and month, with tags and read times.",
    canonical: `${SITE_URL}/archive`,
    schema: archiveSchema,
    schemaId: "archive-schema",
  });

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1100px]">
          <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
            · Journal · Complete Index
          </div>
          <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
            Archive.
          </h1>
          <p className="mt-6 max-w-[62ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Every published note, newest first. {posts.length} in total. The{" "}
            <Link
              href="/blog"
              className="text-[hsl(var(--brand-signal))] underline decoration-[hsl(var(--brand-signal)/0.4)] underline-offset-4 transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              main listing
            </Link>{" "}
            has search and filters; this page has all of it at once. If you
            would rather be pointed at an order, try the{" "}
            <Link
              href="/paths"
              className="text-[hsl(var(--brand-signal))] underline decoration-[hsl(var(--brand-signal)/0.4)] underline-offset-4 transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              reading paths
            </Link>
            .
          </p>

          {groups.length > 1 && (
            <nav
              aria-label="Jump to year"
              className="mt-10 flex flex-wrap items-center gap-2 border-y border-[hsl(var(--brand-iron))] py-4"
            >
              <span className="mr-2 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                year ·
              </span>
              {groups.map((group) => (
                <a
                  key={group.year}
                  href={`#year-${group.year}`}
                  data-testid={`link-year-${group.year}`}
                  className="inline-flex h-9 items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  {group.year}
                  <span className="ml-2 text-[hsl(var(--brand-signal))]">
                    {group.count}
                  </span>
                </a>
              ))}
            </nav>
          )}

          <div className="mt-14 space-y-16">
            {groups.map((group) => (
              <section
                key={group.year}
                id={`year-${group.year}`}
                aria-labelledby={`year-${group.year}-heading`}
                className="scroll-mt-28"
              >
                <div className="flex items-baseline justify-between gap-4 border-b border-[hsl(var(--brand-iron))] pb-3">
                  <h2
                    id={`year-${group.year}-heading`}
                    className="font-display text-3xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-4xl"
                  >
                    {group.year}
                  </h2>
                  <span className="shrink-0 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                    {group.count} note{group.count === 1 ? "" : "s"}
                  </span>
                </div>

                {group.months.map((monthGroup) => (
                  <div key={monthGroup.month} className="mt-8">
                    <h3 className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                      {MONTHS[monthGroup.month - 1] ?? "Undated"}
                    </h3>
                    <ul className="mt-2">
                      {monthGroup.posts.map((post) => {
                        const day = post.date.split("-")[2] ?? "";
                        return (
                          <li key={post.slug}>
                            <Link
                              href={`/blog/${post.slug}`}
                              data-testid={`link-archive-${post.slug}`}
                              className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-[hsl(var(--brand-iron)/0.4)] py-2.5 transition-colors hover:bg-[hsl(var(--brand-graphite)/0.4)]"
                            >
                              <time
                                dateTime={post.date}
                                className="w-8 shrink-0 font-mono-tight text-[11px] tabular-nums text-[hsl(var(--brand-ash))]"
                              >
                                {day}
                              </time>
                              <span className="min-w-0 flex-1 basis-[16rem] font-display text-[0.95rem] leading-snug text-[hsl(var(--brand-bone-dim))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                                {post.title}
                              </span>
                              {/* Not shrink-0: four tags on a 390px screen
                                  are wider than the line, and this span has
                                  to be allowed to wrap inside itself. */}
                              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-mono-tight text-[9px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                                {post.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-full border border-[hsl(var(--brand-iron))] px-2 py-0.5"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                <span className="tabular-nums">
                                  {readMinutes(post)} min
                                </span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>

          <div className="mt-20 border-t border-[hsl(var(--brand-iron))] pt-8">
            <Link
              href="/blog"
              className="inline-flex min-h-[24px] items-center py-1 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← Back to field notes
            </Link>
          </div>
        </div>
      </div>
    </CinematicLayout>
  );
}
