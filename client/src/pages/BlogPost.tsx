import { useRoute, Link } from "wouter";
import { Layout } from "@/components/site/Layout";
import {
  getLoadedContent,
  getPostBySlug,
  loadPostContent,
  readMinutes,
} from "@/lib/blogPosts";
import { useMemo, useEffect, useState } from "react";
import { marked } from "marked";
import { scrollableTables } from "@/lib/markdownTables";
import { ArrowLeft } from "lucide-react";
import { useSEO } from "@/lib/useSEO";
import { formatPostDate } from "@/lib/formatDate";

marked.setOptions({
  gfm: true,
  breaks: true,
});
marked.use(scrollableTables);

const SITE_URL = "https://maxdoubin.com";

export function BlogPost() {
  // This page is mounted at two paths. Matching only "/blog/:slug" meant
  // /legacy/blog/<slug> parsed no slug at all and every legacy post URL
  // rendered "Post Not Found".
  const [, legacyParams] = useRoute("/legacy/blog/:slug");
  const [, params] = useRoute("/blog/:slug");
  const slug = legacyParams?.slug ?? params?.slug ?? "";
  const post = getPostBySlug(slug);
  const [mounted, setMounted] = useState(false);
  // Bodies load one chunk at a time. See lib/blogPosts.
  const [content, setContent] = useState<string | null>(
    () => getLoadedContent(slug) ?? null,
  );

  useEffect(() => {
    const cached = getLoadedContent(slug);
    if (cached !== undefined) {
      setContent(cached);
      return;
    }
    setContent(null);
    let cancelled = false;
    void loadPostContent(slug).then((text) => {
      if (!cancelled) setContent(text);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

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
      wordCount: post.wordCount,
    };
  }, [post]);

  useSEO({
    title: post ? `${post.title} | Max Doubin` : "Max Doubin | Cybersecurity Student, Las Vegas",
    description: post?.excerpt ?? "Max Doubin is a 10th grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada.",
    canonical: post ? `${SITE_URL}/blog/${post.slug}` : SITE_URL,
    ogType: post ? "article" : "profile",
    ogImage: post ? `${SITE_URL}${post.coverImage}` : `${SITE_URL}/images/og-image.jpg`,
    ogImageAlt: post ? post.title : "Max Doubin, cybersecurity student",
    schema: postSchema,
    schemaId: "post-schema",
  });

  const htmlContent = useMemo(() => {
    if (!content) return "";
    return marked(content) as string;
  }, [content]);

  if (!post) {
    return (
      <Layout>
        <div className="py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground">Post Not Found</h1>
          <p className="mt-2 text-muted-foreground">The blog post you're looking for doesn't exist.</p>
          <Link
            href="/blog"
            className="mt-4 inline-flex items-center gap-2 text-primary hover:underline"
            data-testid="link-back-to-blog"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Blog
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <article className="pb-16 pt-4" data-testid={`article-${post.slug}`}>
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          data-testid="link-back-to-blog"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Blog
        </Link>

        <div className="mt-8 overflow-hidden rounded-xl">
          <img
            src={post.coverImage}
            alt={post.title}
            className="aspect-[2.5/1] w-full object-cover"
            width="800"
            height="320"
            fetchPriority="high"
          />
        </div>

        <header className="mt-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <time dateTime={post.date}>
              {formatPostDate(post.date)}
            </time>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
            <span>{readMinutes(post)} min read</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl" data-testid="text-post-title">
            {post.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href="/blog"
                className="rounded-full bg-accent/70 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        </header>

        {content === null ? (
          <div className="mt-10" data-testid="blog-post-loading" aria-busy="true">
            <span className="sr-only">Loading the rest of this post.</span>
            {[92, 100, 74, 96, 88, 100, 61].map((width, i) => (
              <div
                key={i}
                aria-hidden
                className="mb-4 h-4 animate-pulse rounded bg-muted"
                style={{ width: `${width}%`, animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
        ) : (
          /*
            [overflow-wrap:anywhere] for the same reason the cinematic prose
            needs it, because this stylesheet is Tailwind Typography and does
            not inherit that fix. The reference URLs at the foot of a post are
            unbreakable words: one measured 1003px here.

            It showed differently, and worse. The cinematic layout has an
            ancestor that clips, so the URL was merely cut off. This layout
            does not, so the overflow reached the viewport, and a mobile
            browser answers that by widening the layout viewport to fit the
            content: window.innerWidth went from 375 to 1059 and the whole
            article rendered zoomed out to a third of its size. A page can be
            too wide without ever scrolling sideways.
          */
          <div
            className="prose prose-neutral dark:prose-invert mt-10 max-w-none [overflow-wrap:anywhere] prose-headings:font-bold prose-a:text-primary prose-code:rounded prose-code:bg-accent/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-pre:bg-accent/30 prose-pre:border prose-pre:border-border/50"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
            data-testid="blog-post-content"
          />
        )}
      </article>
    </Layout>
  );
}
