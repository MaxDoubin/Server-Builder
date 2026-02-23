import { useRoute, Link } from "wouter";
import { Layout } from "@/components/site/Layout";
import { getPostBySlug } from "@/lib/blogPosts";
import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { ArrowLeft } from "lucide-react";

marked.setOptions({
  gfm: true,
  breaks: true,
});

export function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const slug = params?.slug ?? "";
  const post = getPostBySlug(slug);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    window.scrollTo(0, 0);
  }, [slug]);

  const htmlContent = useMemo(() => {
    if (!post) return "";
    return marked(post.content) as string;
  }, [post]);

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
          />
        </div>

        <header className="mt-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
            <span>{Math.ceil(post.content.split(/\s+/).length / 200)} min read</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl" data-testid="text-post-title">
            {post.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={`/blog`}
                className="rounded-full bg-accent/70 px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {tag}
              </Link>
            ))}
          </div>
        </header>

        <div
          className="prose prose-neutral dark:prose-invert mt-10 max-w-none prose-headings:font-bold prose-a:text-primary prose-code:rounded prose-code:bg-accent/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-pre:bg-accent/30 prose-pre:border prose-pre:border-border/50"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
          data-testid="blog-post-content"
        />
      </article>
    </Layout>
  );
}
