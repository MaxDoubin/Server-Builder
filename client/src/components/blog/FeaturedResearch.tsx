/**
 * The lead card on the blog index: one piece of original research, set
 * above the search box and the archive.
 *
 * Everything the card shows comes from the post index. The constant below
 * names which post and where its interactive results live; the title,
 * excerpt, date, read time and cover are read from the post itself, so the
 * card cannot drift from the article it points at. Until that post is in
 * the index (or while it is a draft) the card renders nothing at all.
 */

import { Link } from "wouter";
import { getPostBySlug, readMinutes } from "@/lib/blogPosts";
import { formatPostDate } from "@/lib/formatDate";
import { HoverShine, ScrollReveal, fadeUp } from "@/lib/framer-animations";

/** The post the blog index leads with, and its companion page. */
export const FEATURED_RESEARCH = {
  slug: "three-apple-afterburner-cards",
  resultsHref: "/afterburner",
} as const;

export function FeaturedResearch() {
  const post = getPostBySlug(FEATURED_RESEARCH.slug);
  if (!post) return null;

  const postHref = `/blog/${post.slug}`;

  return (
    <ScrollReveal variants={fadeUp} delay={0.1}>
      <section
        aria-labelledby="featured-research-heading"
        data-testid="featured-research"
        className="mt-12"
      >
        <HoverShine
          className="group rounded-lg border border-[hsl(var(--brand-signal)/.35)] bg-[hsl(var(--brand-graphite)/.55)] backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/.6)]"
        >
          <div
            aria-hidden
            className="scanline pointer-events-none absolute inset-0 opacity-10"
          />
          {/* Signal rule along the top edge, the mark of the lead item. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, hsl(var(--brand-signal)) 0%, hsl(var(--brand-signal) / 0.35) 45%, transparent 85%)",
            }}
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            {/*
              The cover repeats the "Read the write-up" link for pointer
              users. It is out of the tab order and hidden from assistive
              technology so a keyboard or screen reader user meets that
              destination once, by its words, not twice.

              4:3 on a phone rather than 16:9: covers keep their subject in
              the middle, and at 312px wide a 16:9 frame is a strip.
            */}
            <Link
              href={postHref}
              tabIndex={-1}
              aria-hidden="true"
              className="relative block aspect-[4/3] overflow-hidden bg-[hsl(var(--brand-obsidian))] sm:aspect-[16/9] lg:aspect-auto lg:min-h-[440px]"
            >
              <img
                src={post.coverImage}
                alt=""
                width="1600"
                height="900"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
              />
              {/*
                Opaque, for the reason DifficultyBadge is: over a photograph
                a translucent pill's contrast belongs to whatever image is
                underneath it.
              */}
              <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--brand-signal)/.5)] bg-[hsl(var(--brand-obsidian))] px-3 py-1.5 font-techno text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone))]">
                <span
                  aria-hidden
                  className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                  style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                />
                Original research
              </span>
            </Link>

            <div className="flex flex-col justify-center border-t border-[hsl(var(--brand-iron))] p-6 sm:p-8 lg:border-l lg:border-t-0 xl:p-10">
              <h2
                id="featured-research-heading"
                className="font-techno text-[0.625rem] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
              >
                <span aria-hidden>· </span>Featured research
              </h2>

              {/*
                The rule between date and read time only from sm up: at
                360px the pair wraps, and the rule was left hanging at the
                end of the first line.
              */}
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono-tight text-[0.625rem] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))] sm:gap-x-3">
                <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                <span aria-hidden className="hidden h-px w-4 bg-[hsl(var(--brand-iron))] sm:block" />
                <span>{readMinutes(post)} min read</span>
              </div>

              <h3 className="mt-3 font-display text-[clamp(1.75rem,3.2vw,2.75rem)] font-medium leading-[1.04] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
                {post.title}
              </h3>

              <p className="mt-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {post.excerpt}
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link
                  href={postHref}
                  data-testid="link-featured-writeup"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[hsl(var(--brand-signal))] px-6 sm:min-w-[15.5rem] font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  Read the write-up
                  <span aria-hidden>→</span>
                </Link>
                <Link
                  href={FEATURED_RESEARCH.resultsHref}
                  data-testid="link-featured-results"
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-6 sm:min-w-[15.5rem] font-mono-tight text-[0.6875rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  Explore the results
                  <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          </div>
        </HoverShine>
      </section>
    </ScrollReveal>
  );
}
