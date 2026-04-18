import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { getAllPosts, getAllTags } from "@/lib/blogPosts";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

const SITE_URL = "https://maxdoubin.com";

export function CinematicBlog() {
  const allPosts = getAllPosts();
  const allTags = getAllTags();
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

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

  const filteredPosts = activeTag
    ? allPosts.filter((post) => post.tags.includes(activeTag))
    : allPosts;

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
          <div ref={headerRef} className="max-w-[64ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Journal · Field Notes
            </div>
            <h1
              data-testid="text-blog-title"
              className="mt-6 font-display text-[clamp(2.4rem,6vw,5rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
            >
              Writing from the <span className="signal-text">rack.</span>
            </h1>
            <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
              Long-form notes on networking, cybersecurity, infrastructure, and the
              nonsense I debug along the way. Unedited. No AI ghostwriting.
            </p>
          </div>

          {/* Tag filter strip */}
          <div
            data-testid="blog-tags"
            className="mt-14 flex flex-wrap items-center gap-2 border-y border-[hsl(var(--brand-iron))] py-4"
          >
            <span className="mr-4 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              tag ·
            </span>
            <button
              onClick={() => setActiveTag(null)}
              data-testid="button-tag-all"
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
            </button>
            {allTags.map((tag) => {
              const active = activeTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setActiveTag(active ? null : tag)}
                  data-testid={`button-tag-${tag}`}
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
                </button>
              );
            })}
            <span className="ml-auto font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              {filteredPosts.length.toString().padStart(2, "0")} · post
              {filteredPosts.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Post list */}
          <div className="mt-10 space-y-4">
            {filteredPosts.map((post, i) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                data-testid={`card-blog-${post.slug}`}
                className="group relative block overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.4)] backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/.4)]"
              >
                <div className="scanline pointer-events-none absolute inset-0 opacity-10" />
                <div className="relative grid gap-0 sm:grid-cols-[220px_1fr]">
                  <div className="relative aspect-[3/2] overflow-hidden sm:aspect-auto">
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                      decoding="async"
                      width="256"
                      height="160"
                    />
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
                    <div className="flex items-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                      <time dateTime={post.date}>
                        {new Date(post.date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </time>
                      <span className="h-px w-4 bg-[hsl(var(--brand-iron))]" />
                      <span>
                        {Math.ceil(post.content.split(/\s+/).length / 200)} min read
                      </span>
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
            ))}
          </div>

          {filteredPosts.length === 0 && (
            <div
              data-testid="text-no-posts"
              className="mt-16 rounded-lg border border-[hsl(var(--brand-iron))] p-12 text-center"
            >
              <div className="font-display text-2xl text-[hsl(var(--brand-bone))]">
                No posts with that tag.
              </div>
              <div className="mt-3 font-mono-tight text-[11px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                try a different filter
              </div>
            </div>
          )}
        </div>
      </div>
    </CinematicLayout>
  );
}
