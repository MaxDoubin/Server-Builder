import { Link } from "wouter";
import { Layout } from "@/components/site/Layout";
import { getAllPosts, getAllTags } from "@/lib/blogPosts";
import { useEffect, useState, useMemo } from "react";
import { useSEO } from "@/lib/useSEO";

const SITE_URL = "https://maxdoubin.com";

export function Blog() {
  const allPosts = getAllPosts();
  const allTags = getAllTags();
  const [activeTag, setActiveTag] = useState<string | null>(null);

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

  /**
   * The archive grows by a post a day. Rendering all of it made this page
   * 42,000px tall with a card and cover per post, the same problem the
   * cinematic index had.
   */
  const PAGE = 24;
  const [visible, setVisible] = useState(PAGE);
  useEffect(() => setVisible(PAGE), [activeTag]);

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

  return (
    <Layout>
      <div className="pb-16 pt-4">
        <h1
          className="text-3xl font-bold text-foreground"
          data-testid="text-blog-title"
        >
          Blog
        </h1>
        <p className="mt-2 text-muted-foreground">
          Writing about networking, cybersecurity, infrastructure, and what I am learning along the way.
        </p>

        <div className="mt-6 flex flex-wrap gap-2" data-testid="blog-tags">
          <button
            onClick={() => setActiveTag(null)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              !activeTag
                ? "bg-primary text-primary-foreground"
                : "border border-border/50 bg-accent/50 text-foreground hover:bg-accent"
            }`}
            data-testid="button-tag-all"
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                activeTag === tag
                  ? "bg-primary text-primary-foreground"
                  : "border border-border/50 bg-accent/50 text-foreground hover:bg-accent"
              }`}
              data-testid={`button-tag-${tag}`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="mt-8 space-y-6">
          {filteredPosts.slice(0, visible).map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-border/50 bg-card/50 transition-colors hover:border-border sm:flex-row"
              data-testid={`card-blog-${post.slug}`}
            >
              <div className="aspect-[2/1] w-full overflow-hidden sm:aspect-auto sm:w-64 sm:flex-shrink-0">
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                  width="256"
                  height="160"
                />
              </div>
              <div className="flex-1 p-5">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <time dateTime={post.date}>
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  <span>
                    {Math.ceil(post.content.split(/\s+/).length / 200)} min read
                  </span>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                  {post.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                  {post.excerpt}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-accent/70 px-2 py-0.5 text-xs text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>

        {filteredPosts.length > visible && (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              data-testid="button-load-more-legacy"
              onClick={() => setVisible((v) => v + PAGE)}
              className="rounded-lg border border-border px-6 py-2.5 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Load more ({filteredPosts.length - visible})
            </button>
          </div>
        )}

        {filteredPosts.length === 0 && (
          <div
            className="mt-12 text-center text-muted-foreground"
            data-testid="text-no-posts"
          >
            No posts found for this tag.
          </div>
        )}
      </div>
    </Layout>
  );
}
