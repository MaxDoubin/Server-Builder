import { Link } from "wouter";
import { Layout } from "@/components/site/Layout";
import { getAllPosts, getAllTags } from "@/lib/blogPosts";
import { useState } from "react";

export function Blog() {
  const allPosts = getAllPosts();
  const allTags = getAllTags();
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filteredPosts = activeTag
    ? allPosts.filter((post) => post.tags.includes(activeTag))
    : allPosts;

  return (
    <Layout>
      <div className="pb-16 pt-4">
        <h1 className="text-3xl font-bold text-foreground" data-testid="text-blog-title">Blog</h1>
        <p className="mt-2 text-muted-foreground">
          Thoughts on engineering, creative coding, and building things.
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
          {filteredPosts.map((post) => (
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
                  <span>{Math.ceil(post.content.split(/\s+/).length / 200)} min read</span>
                </div>
                <h2 className="mt-2 text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
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

        {filteredPosts.length === 0 && (
          <div className="mt-12 text-center text-muted-foreground" data-testid="text-no-posts">
            No posts found for this tag.
          </div>
        )}
      </div>
    </Layout>
  );
}
