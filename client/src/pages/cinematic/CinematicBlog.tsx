import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { getAllPosts, getAllTags, readMinutes } from "@/lib/blogPosts";
import type { PostMeta } from "@/lib/postIndex";
import { BlogSearch } from "@/components/blog/BlogSearch";
import { ContinueReading } from "@/components/blog/ContinueReading";
import { DifficultyBadge } from "@/components/blog/DifficultyBadge";
import { DIFFICULTIES, postDifficulty, type Difficulty } from "@/lib/postDifficulty";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";
import { formatPostDate } from "@/lib/formatDate";
import {
  ScrollReveal,
  StaggerGroup,
  StaggerItem,
  fadeUp,
  fadeLeft,
  blurIn,
  TiltCard,
  ScrambleText,
  DrawLine,
  FloatingParticles,
  MorphingBlob,
  ParallaxFloat,
  WordReveal,
  ClipReveal,
  AnimatedGradientText,
  motion,
  AnimatePresence,
} from "@/lib/framer-animations";

const SITE_URL = "https://maxdoubin.com";

export function CinematicBlog() {
  /**
   * Both of these build a fresh array on every call, so they are held.
   * BlogSearch memoises its lowercase index on the array it is handed and
   * publishes results whenever that index changes; feeding it a new array
   * each render would make it publish on every render, and publishing sets
   * state here, which renders again.
   */
  const allPosts = useMemo(() => getAllPosts(), []);
  const allTags = useMemo(() => getAllTags(), []);

  /**
   * Tags ranked by how many posts use them.
   *
   * The archive carries 55 distinct tags and 24 of them sit on a single
   * post. Rendering all of them put a wall of pills between the heading and
   * the first post, which on a phone is most of a screen of scrolling before
   * any writing appears.
   */
  const rankedTags = useMemo(() => {
    const counts = new Map<string, number>();
    allPosts.forEach((post) =>
      post.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)),
    );
    return [...allTags].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
    );
  }, [allTags, allPosts]);

  const [showAllTags, setShowAllTags] = useState(false);
  const visibleTags = showAllTags ? rankedTags : rankedTags.slice(0, 14);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | null>(null);
  /** Ranked search hits, or null when the search box is empty. */
  const [searchResults, setSearchResults] = useState<PostMeta[] | null>(null);
  const [, setLocation] = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Stable so BlogSearch's publish effect does not re-run on every render
  // of this page.
  const handleResults = useCallback((results: PostMeta[] | null) => {
    setSearchResults(results);
  }, []);

  const blogListSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "Blog",
      "@id": `${SITE_URL}/blog`,
      name: "Max Doubin's Blog",
      url: `${SITE_URL}/blog`,
      description:
        "Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering.",
      author: { "@id": `${SITE_URL}/#person` },
      inLanguage: "en-US",
      blogPost: allPosts.slice(0, 10).map((p) => ({
        "@type": "BlogPosting",
        "@id": `${SITE_URL}/blog/${p.slug}`,
        headline: p.title,
        url: `${SITE_URL}/blog/${p.slug}`,
        datePublished: p.date,
        description: p.excerpt,
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useSEO({
    title: "Blog | Max Doubin",
    description:
      "Technical writing on enterprise networking, cybersecurity, homelab infrastructure, and systems engineering by Max Doubin.",
    canonical: `${SITE_URL}/blog`,
    schema: blogListSchema,
    schemaId: "blog-list-schema",
  });

  /**
   * Search first, then the tag and difficulty filters on top of whatever it
   * returned. Search results arrive ranked by relevance, so that ordering is
   * kept; with an empty box the list stays in date order.
   */
  const filteredPosts = useMemo(() => {
    let list = searchResults ?? allPosts;
    if (activeTag) list = list.filter((post) => post.tags.includes(activeTag));
    if (activeDifficulty) {
      list = list.filter((post) => postDifficulty(post) === activeDifficulty);
    }
    return list;
  }, [searchResults, allPosts, activeTag, activeDifficulty]);

  const searching = searchResults !== null;

  /**
   * The archive is a post per day, so it grows without bound. Rendering all
   * of it mounted a card, a cover image and a layout-animated motion tree per
   * post, which is a large DOM and a lot of image bytes for a visitor who
   * mostly wants the newest few. Render a page at a time instead.
   */
  const PAGE = 24;
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => {
    setVisible(PAGE);
  }, [activeTag, activeDifficulty, searchResults]);
  const shownPosts = filteredPosts.slice(0, visible);
  const remaining = filteredPosts.length - shownPosts.length;

  /**
   * Random pick respects whatever is currently on screen, so filtering to
   * "security" and rolling the dice stays inside security. With nothing
   * matched it falls back to the whole archive.
   */
  const openRandomPost = () => {
    const pool = filteredPosts.length > 0 ? filteredPosts : allPosts;
    if (pool.length === 0) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setLocation(`/blog/${pick.slug}`);
  };

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(headerRef.current?.children ?? [], {
        opacity: 0,
        y: 26,
        stagger: 0.1,
        duration: 0.9,
        ease: "power3.out",
      });
    },
    [],
  );

  return (
    <CinematicLayout>
      <div
        ref={rootRef}
        className="relative min-h-screen px-6 pb-32 pt-[22vh] md:px-10"
      >
        {/* Floating particles background */}
        <FloatingParticles
          count={15}
          color="hsl(var(--brand-signal))"
        />

        {/* Grid backdrop */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--brand-iron) / 0.2) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.2) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
            opacity: 0.6,
          }}
        />

        <div className="relative mx-auto max-w-[1200px]">
          {/* MorphingBlob behind header */}
          <MorphingBlob
            className="-top-20 -left-32 opacity-40"
            color="hsl(var(--brand-signal) / 0.08)"
            size={500}
            duration={10}
          />

          {/* Header wrapped in ScrollReveal with fadeLeft */}
          <ScrollReveal variants={fadeLeft} delay={0.1}>
            <div ref={headerRef} className="max-w-[64ch]">
              <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
                <ScrambleText
                  text="· Journal · Field Notes"
                  scrambleDuration={1.5}
                />
              </div>
              <WordReveal
                text="Writing from the rack."
                as="h1"
                className="mt-6 font-display text-[clamp(2.4rem,6vw,5rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
                delay={0.2}
                staggerDelay={0.07}
              />
              <ClipReveal delay={0.4} direction="up">
                <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
                  Long-form notes on networking, cybersecurity, infrastructure, and the
                  nonsense I debug along the way. Unedited. No AI ghostwriting.
                </p>
              </ClipReveal>
            </div>
          </ScrollReveal>

          {/* DrawLine after header */}
          <DrawLine
            className="mt-10"
            color="hsl(var(--brand-signal))"
            width="100%"
            delay={0.6}
          />

          {/*
            Search, random pick, and the two hub pages.

            relative z-40 on the reveal wrapper is load bearing: framer's
            variants leave a transform on it, which makes it a stacking
            context, and the post list below is another one later in the
            document. Without a z-index the results panel paints underneath
            the first card.
          */}
          <ScrollReveal variants={fadeUp} delay={0.15} className="relative z-40">
            <div
              data-print-hide
              className="mt-12 flex flex-col gap-3 lg:flex-row lg:items-center"
            >
              <BlogSearch
                posts={allPosts}
                onResults={handleResults}
                className="min-w-0 flex-1"
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openRandomPost}
                  data-testid="button-random-post"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  <span
                    aria-hidden
                    className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                    style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                  />
                  Random
                </button>
                <Link
                  href="/paths"
                  data-testid="link-reading-paths"
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Paths
                </Link>
                <Link
                  href="/archive"
                  data-testid="link-archive"
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Archive
                </Link>
              </div>
            </div>
          </ScrollReveal>

          <ContinueReading />

          {/* Tag filter strip wrapped in ScrollReveal with fadeUp */}
          <ScrollReveal variants={fadeUp} delay={0.2}>
            <div
              data-testid="blog-tags"
              data-print-hide
              className="mt-10 flex flex-wrap items-center gap-2 border-y border-[hsl(var(--brand-iron))] py-4"
            >
              <span className="mr-4 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                tag ·
              </span>
              <motion.button
                onClick={() => setActiveTag(null)}
                data-testid="button-tag-all"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors ${
                  !activeTag
                    ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/.12)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                {!activeTag && (
                  <span
                    className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                    style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                  />
                )}
                All
              </motion.button>
              {visibleTags.map((tag) => {
                const active = activeTag === tag;
                return (
                  <motion.button
                    key={tag}
                    onClick={() => setActiveTag(active ? null : tag)}
                    data-testid={`button-tag-${tag}`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors ${
                      active
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/.12)] text-[hsl(var(--brand-bone))]"
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-bone))]"
                    }`}
                  >
                    {active && (
                      <span
                        className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                        style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                      />
                    )}
                    {tag}
                  </motion.button>
                );
              })}
              {rankedTags.length > visibleTags.length && (
                <button
                  type="button"
                  data-testid="button-show-all-tags"
                  onClick={() => setShowAllTags(true)}
                  className="inline-flex h-9 items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/.5)] hover:text-[hsl(var(--brand-bone))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-signal))]"
                >
                  + {rankedTags.length - visibleTags.length} more
                </button>
              )}
              <span className="ml-auto font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                <AnimatedGradientText>
                  {filteredPosts.length.toString().padStart(2, "0")} · post
                  {filteredPosts.length === 1 ? "" : "s"}
                </AnimatedGradientText>
              </span>
            </div>
          </ScrollReveal>

          {/* Difficulty filter. The labels are derived, see lib/postDifficulty.ts */}
          <div
            data-testid="blog-difficulty-filter"
            data-print-hide
            className="mt-4 flex flex-wrap items-center gap-2 border-b border-[hsl(var(--brand-iron))] pb-4"
          >
            <span className="mr-4 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              level ·
            </span>
            <button
              type="button"
              onClick={() => setActiveDifficulty(null)}
              data-testid="button-difficulty-all"
              aria-pressed={activeDifficulty === null}
              className={`inline-flex h-9 items-center rounded-full border px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors ${
                activeDifficulty === null
                  ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/.12)] text-[hsl(var(--brand-bone))]"
                  : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-bone))]"
              }`}
            >
              Any
            </button>
            {DIFFICULTIES.map((level) => {
              const active = activeDifficulty === level;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setActiveDifficulty(active ? null : level)}
                  data-testid={`button-difficulty-${level}`}
                  aria-pressed={active}
                  className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors ${
                    active
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/.12)] text-[hsl(var(--brand-bone))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-bone))]"
                  }`}
                >
                  {level}
                </button>
              );
            })}
            <span className="ml-auto font-mono-tight text-[10px] normal-case tracking-[0.12em] text-[hsl(var(--brand-ash))]">
              derived from tags and length
            </span>
          </div>

          {/* Post list with AnimatePresence + StaggerGroup */}
          <StaggerGroup className="mt-10 space-y-4" staggerDelay={0.1} delayChildren={0.15}>
            <AnimatePresence mode="popLayout">
              {shownPosts.map((post, i) => (
                <StaggerItem key={post.slug} variants={fadeUp}>
                  <motion.div
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <TiltCard maxTilt={8} glare className="relative">
                      <Link
                        href={`/blog/${post.slug}`}
                        data-testid={`card-blog-${post.slug}`}
                        className="group relative block overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.4)] backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/.4)]"
                      >
                        <div className="scanline pointer-events-none absolute inset-0 opacity-10" />
                        <div className="relative grid gap-0 sm:grid-cols-[220px_1fr]">
                          <div className="relative aspect-[3/2] overflow-hidden sm:aspect-auto">
                            <ParallaxFloat speed={0.15} direction="up">
                              <img
                                /*
                                  The card renders at 220px wide. Loading the
                                  1600px hero for it made a 24-card page fetch
                                  3.4 MB of imagery; the 480px thumbnail brings
                                  that to 413 KB. Falls back to the hero if a
                                  thumbnail is somehow missing.
                                */
                                src={post.coverImage.replace(
                                  "/images/blog/",
                                  "/images/blog/thumb/",
                                )}
                                onError={(e) => {
                                  const img = e.currentTarget;
                                  if (img.src !== post.coverImage) {
                                    img.src = post.coverImage;
                                  }
                                }}
                                alt={post.title}
                                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                loading="lazy"
                                decoding="async"
                                width="256"
                                height="160"
                              />
                            </ParallaxFloat>
                            <div
                              aria-hidden
                              className="absolute inset-0"
                              style={{
                                background:
                                  "linear-gradient(90deg, transparent 60%, hsl(var(--brand-obsidian)) 100%)",
                              }}
                            />
                            <div className="absolute left-4 top-4 flex items-center gap-2 font-techno text-[9px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone))]">
                              <span
                                className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                                style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                              />
                              NOTE · {String(i + 1).padStart(2, "0")}
                            </div>
                          </div>

                          <div className="flex flex-col justify-center p-6">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                              <time dateTime={post.date}>
                                {formatPostDate(post.date)}
                              </time>
                              <span className="h-px w-4 bg-[hsl(var(--brand-iron))]" />
                              <span>
                                {readMinutes(post)} min read
                              </span>
                              <DifficultyBadge level={postDifficulty(post)} />
                            </div>
                            <h2 className="mt-3 font-display text-xl font-medium leading-tight tracking-tight text-[hsl(var(--brand-bone))] transition-colors group-hover:text-[hsl(var(--brand-signal))] md:text-2xl">
                              {post.title}
                            </h2>
                            <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] line-clamp-2">
                              {post.excerpt}
                            </p>
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {post.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.4)] px-2 py-0.5 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </TiltCard>
                  </motion.div>
                </StaggerItem>
              ))}
            </AnimatePresence>
          </StaggerGroup>

          {remaining > 0 && (
            <div className="mt-12 flex flex-col items-center gap-3">
              {/*
                The button only, not the container: the "Showing 24 of 247"
                line below it is the one thing that makes a printed page of
                the archive honest about being a partial list.
              */}
              <button
                type="button"
                data-print-hide
                data-testid="button-load-more-posts"
                onClick={() => setVisible((v) => v + PAGE)}
                className="group inline-flex items-center gap-3 border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.6)] px-8 py-3 font-mono-tight text-[11px] uppercase tracking-[0.3em] text-[hsl(var(--brand-bone-dim))] backdrop-blur-md transition-colors hover:border-[hsl(var(--brand-signal)/.5)] hover:text-[hsl(var(--brand-bone))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-signal))]"
              >
                Load more
                <span className="text-[hsl(var(--brand-signal))]">
                  {remaining.toString().padStart(2, "0")}
                </span>
              </button>
              <div className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                Showing {shownPosts.length} of {filteredPosts.length}
              </div>
            </div>
          )}

          {filteredPosts.length === 0 && (
            <ScrollReveal variants={blurIn} delay={0.1}>
              <div
                data-testid="text-no-posts"
                className="mt-16 rounded-lg border border-[hsl(var(--brand-iron))] p-12 text-center"
              >
                <div className="font-display text-2xl text-[hsl(var(--brand-bone))]">
                  {searching ? "Nothing matches that." : "No posts with that tag."}
                </div>
                <div className="mt-3 font-mono-tight text-[11px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                  {searching
                    ? "try fewer words, or clear the filters"
                    : "try a different filter"}
                </div>
              </div>
            </ScrollReveal>
          )}
        </div>
      </div>
    </CinematicLayout>
  );
}
