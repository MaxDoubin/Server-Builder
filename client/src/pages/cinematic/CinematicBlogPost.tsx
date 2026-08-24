import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import { marked } from "marked";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { getAllPosts, getPostBySlug } from "@/lib/blogPosts";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

marked.setOptions({ gfm: true, breaks: true });

const SITE_URL = "https://maxdoubin.com";

export function CinematicBlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug ?? "";
  const post = getPostBySlug(slug);

  /**
   * Onward links.
   *
   * A post used to end with a single "all field notes" link, so every one
   * of 236 pages was a dead end: nothing to read next, and nothing linking
   * posts to each other for a crawler to follow. Neighbours come from the
   * date ordering; related posts are the nearest by shared tags, most
   * specific tag first so a post about one narrow subject does not just
   * pull in whatever else is tagged "networking".
   */
  const { prev, next, related } = useMemo(() => {
    const all = getAllPosts();
    const i = all.findIndex((p) => p.slug === slug);
    if (i === -1) return { prev: undefined, next: undefined, related: [] };

    const tagCounts = new Map<string, number>();
    all.forEach((p) => p.tags.forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)));

    const current = all[i];
    const scored = all
      .filter((p) => p.slug !== slug)
      .map((p) => ({
        post: p,
        score: p.tags
          .filter((t) => current.tags.includes(t))
          // A tag shared by few posts says more than one shared by many.
          .reduce((sum, t) => sum + 1 / (tagCounts.get(t) ?? 1), 0),
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (a.post.date < b.post.date ? 1 : -1));

    return {
      // getAllPosts is newest first, so the later index is the older post.
      next: all[i - 1],
      prev: all[i + 1],
      related: scored.slice(0, 3).map((x) => x.post),
    };
  }, [slug]);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    window.scrollTo(0, 0);
  }, [slug]);

  const postSchema = useMemo(() => {
    if (!post) return null;
    return {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `${SITE_URL}/blog/${post.slug}`,
      headline: post.title,
      name: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.date,
      url: `${SITE_URL}/blog/${post.slug}`,
      image: {
        "@type": "ImageObject",
        url: `${SITE_URL}${post.coverImage}`,
        contentUrl: `${SITE_URL}${post.coverImage}`,
      },
      author: {
        "@type": "Person",
        "@id": `${SITE_URL}/#person`,
        name: "Max Doubin",
        url: SITE_URL,
      },
      publisher: {
        "@type": "Person",
        "@id": `${SITE_URL}/#person`,
        name: "Max Doubin",
        url: SITE_URL,
      },
      isPartOf: { "@type": "Blog", "@id": `${SITE_URL}/#blog` },
      keywords: post.tags.join(", "),
      inLanguage: "en-US",
      mainEntityOfPage: {
        "@type": "WebPage",
        "@id": `${SITE_URL}/blog/${post.slug}`,
      },
      wordCount: post.content.split(/\s+/).length,
    };
  }, [post]);

  useSEO({
    title: post ? `${post.title} | Max Doubin` : "Max Doubin | Cybersecurity Specialist & Enterprise Networking Expert",
    description:
      post?.excerpt ??
      "Max Doubin is a nationally recognized cybersecurity specialist and enterprise networking expert based in Las Vegas, Nevada.",
    canonical: post ? `${SITE_URL}/blog/${post.slug}` : SITE_URL,
    ogType: post ? "article" : "profile",
    ogImage: post ? `${SITE_URL}${post.coverImage}` : `${SITE_URL}/images/og-image.png`,
    ogImageAlt: post ? post.title : "Max Doubin - Cybersecurity Specialist",
    schema: postSchema,
    schemaId: "post-schema",
  });

  const htmlContent = useMemo(() => {
    if (!post) return "";
    return marked(post.content) as string;
  }, [post]);

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(heroRef.current?.children ?? [], {
        opacity: 0,
        y: 28,
        stagger: 0.08,
        duration: 0.8,
        ease: "power3.out",
      });
    },
    [post?.slug],
  );

  // Reading-progress bar
  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${pct})`;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!post) {
    return (
      <CinematicLayout>
        <div className="flex min-h-screen items-center justify-center px-6">
          <div className="text-center">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
              · Error · 404
            </div>
            <h1 className="mt-4 font-display text-4xl font-medium text-[hsl(var(--brand-bone))]">
              Post not found.
            </h1>
            <p className="mt-4 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              The field note you're looking for isn't in the rack.
            </p>
            <Link
              href="/blog"
              data-testid="link-back-to-blog"
              className="mt-8 inline-flex items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            >
              ← Back to field notes
            </Link>
          </div>
        </div>
      </CinematicLayout>
    );
  }

  const readMinutes = Math.ceil(post.content.split(/\s+/).length / 200);

  return (
    <CinematicLayout>
      <div
        ref={progressRef}
        className="fixed left-0 right-0 top-0 z-[60] h-[2px] origin-left bg-[hsl(var(--brand-signal))]"
        style={{ transform: "scaleX(0)", boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
      />

      <article
        ref={rootRef as React.RefObject<HTMLElement>}
        data-testid={`article-${post.slug}`}
        className="relative pb-32"
      >
        {/* Full-bleed cover */}
        <div className="relative h-[70vh] w-full overflow-hidden">
          <img
            src={post.coverImage}
            alt={post.title}
            className="absolute inset-0 h-full w-full object-cover"
            width="1600"
            height="900"
            fetchPriority="high"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, hsl(var(--brand-obsidian) / 0.55) 0%, hsl(var(--brand-obsidian) / 0.2) 40%, hsl(var(--brand-obsidian) / 0.85) 85%, hsl(var(--brand-obsidian)) 100%)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--brand-iron) / 0.3) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.3) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              mixBlendMode: "screen",
              opacity: 0.4,
            }}
          />

          {post.coverCredit && (
            <p className="absolute bottom-2 right-3 z-10 max-w-[70vw] truncate font-mono-tight text-[9px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] md:right-6 md:text-[10px]">
              Photo{" "}
              <a
                href={post.coverCredit.sourceUrl}
                target="_blank"
                rel="noopener noreferrer license"
                className="underline decoration-[hsl(var(--brand-iron))] underline-offset-2 transition-colors hover:text-[hsl(var(--brand-bone))]"
              >
                {post.coverCredit.author}
              </a>{" "}
              ·{" "}
              <a
                href={post.coverCredit.licenseUrl}
                target="_blank"
                rel="noopener noreferrer license"
                className="underline decoration-[hsl(var(--brand-iron))] underline-offset-2 transition-colors hover:text-[hsl(var(--brand-bone))]"
              >
                {post.coverCredit.license}
              </a>
            </p>
          )}

          <div className="absolute inset-x-0 bottom-0 px-6 pb-16 md:px-10">
            <div ref={heroRef} className="mx-auto max-w-[860px]">
              <Link
                href="/blog"
                data-testid="link-back-to-blog"
                className="inline-flex items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
              >
                ← Field notes
              </Link>
              <div className="mt-6 flex items-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                <span
                  className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                  style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                />
                <time dateTime={post.date}>
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <span className="h-px w-4 bg-[hsl(var(--brand-iron))]" />
                <span>{readMinutes} min read</span>
              </div>
              <h1
                data-testid="text-post-title"
                className="mt-4 font-display text-[clamp(2rem,5.2vw,4.2rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]"
              >
                {post.title}
              </h1>
              <div className="mt-6 flex flex-wrap gap-2">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    href="/blog"
                    className="rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.5)] px-3 py-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] backdrop-blur-sm transition-colors hover:text-[hsl(var(--brand-bone))]"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="relative px-6 md:px-10">
          <div className="mx-auto mt-16 max-w-[760px]">
            <div
              className="cinematic-prose prose prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
              data-testid="blog-post-content"
            />

            <div className="mt-20 border-t border-[hsl(var(--brand-iron))] pt-8">
              <div className="flex items-center justify-between font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                <span>end of note</span>
                <Link
                  href="/blog"
                  className="text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  ← All field notes
                </Link>
              </div>
            </div>

            {(prev || next) && (
              <nav
                aria-label="Adjacent posts"
                className="mt-10 grid gap-4 sm:grid-cols-2"
                data-testid="post-neighbours"
              >
                {prev ? (
                  <Link
                    href={`/blog/${prev.slug}`}
                    data-testid="link-prev-post"
                    className="group rounded-lg border border-[hsl(var(--brand-iron))] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/.5)]"
                  >
                    <div className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                      ← Previous
                    </div>
                    <div className="mt-2 font-display text-base leading-snug text-[hsl(var(--brand-bone-dim))] transition-colors group-hover:text-[hsl(var(--brand-bone))]">
                      {prev.title}
                    </div>
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link
                    href={`/blog/${next.slug}`}
                    data-testid="link-next-post"
                    className="group rounded-lg border border-[hsl(var(--brand-iron))] p-5 text-right transition-colors hover:border-[hsl(var(--brand-signal)/.5)] sm:col-start-2"
                  >
                    <div className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                      Next →
                    </div>
                    <div className="mt-2 font-display text-base leading-snug text-[hsl(var(--brand-bone-dim))] transition-colors group-hover:text-[hsl(var(--brand-bone))]">
                      {next.title}
                    </div>
                  </Link>
                )}
              </nav>
            )}

            {related.length > 0 && (
              <section className="mt-12" data-testid="related-posts">
                <h2 className="font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                  · Related
                </h2>
                <ul className="mt-4 space-y-3">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/blog/${r.slug}`}
                        data-testid={`link-related-${r.slug}`}
                        className="group flex items-baseline gap-3"
                      >
                        <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                          {r.date}
                        </span>
                        <span className="font-display text-[hsl(var(--brand-bone-dim))] transition-colors group-hover:text-[hsl(var(--brand-signal))]">
                          {r.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </article>
    </CinematicLayout>
  );
}
