import { Link } from "wouter";
import { siteConfig } from "@/lib/siteConfig";
import { Layout } from "@/components/site/Layout";
import { getAllPosts } from "@/lib/blogPosts";
import { ArrowRight, Instagram, Sparkles } from "lucide-react";

export function Home() {
  const recentPosts = getAllPosts().slice(0, 2);

  return (
    <Layout>
      <section className="pb-16 pt-8" data-testid="section-hero">
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-8 sm:p-12">
          <div
            className="absolute inset-0 opacity-20 dark:opacity-30"
            style={{
              backgroundImage: "url(/images/hero-bg.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/60" />
          <div className="relative z-10">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl" data-testid="text-hero-name">
              {siteConfig.name}
            </h1>
            <p className="mt-3 text-xl text-primary font-medium" data-testid="text-hero-tagline">
              {siteConfig.tagline}
            </p>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {siteConfig.shortBio}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                data-testid="button-read-blog"
              >
                Read the Blog <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                data-testid="button-view-projects"
              >
                View Projects
              </Link>
              <Link
                href="/game"
                className="inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-5 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
                data-testid="button-play-game"
              >
                <Sparkles className="h-4 w-4" /> Play the Game
              </Link>
            </div>
            <a
              href={siteConfig.social.instagram.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              data-testid="link-instagram-hero"
            >
              <Instagram className="h-4 w-4" /> {siteConfig.social.instagram.handle}
            </a>
          </div>
        </div>
      </section>

      <section className="pb-16" data-testid="section-about">
        <h2 className="text-2xl font-bold text-foreground">About Me</h2>
        <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
          {siteConfig.fullBio.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="pb-16" data-testid="section-highlights">
        <h2 className="text-2xl font-bold text-foreground">What I Do</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {siteConfig.highlights.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border"
            >
              <h3 className="font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-16" data-testid="section-skills">
        <h2 className="text-2xl font-bold text-foreground">Skills</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {siteConfig.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-border/50 bg-accent/50 px-3 py-1 text-sm text-foreground"
              data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {skill}
            </span>
          ))}
        </div>
      </section>

      {recentPosts.length > 0 && (
        <section className="pb-16" data-testid="section-recent-posts">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-foreground">Recent Posts</h2>
            <Link
              href="/blog"
              className="text-sm text-primary hover:underline"
              data-testid="link-all-posts"
            >
              View all posts
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {recentPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group overflow-hidden rounded-xl border border-border/50 bg-card/50 transition-colors hover:border-border"
                data-testid={`card-post-${post.slug}`}
              >
                <div className="aspect-[2/1] overflow-hidden">
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="p-5">
                  <div className="text-xs text-muted-foreground">
                    {new Date(post.date).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                  <h3 className="mt-1 font-semibold text-foreground group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
