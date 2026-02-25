import { Link } from "wouter";
import { siteConfig } from "@/lib/siteConfig";
import { Layout } from "@/components/site/Layout";
import { getAllPosts } from "@/lib/blogPosts";
import {
  ArrowRight,
  Instagram,
  Shield,
  Server,
  Trophy,
  Users,
  ChevronRight,
} from "lucide-react";

export function Home() {
  const recentPosts = getAllPosts().slice(0, 2);

  return (
    <Layout>
      <section className="pb-12 pt-8" data-testid="section-hero">
        <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 p-8 sm:p-12">
          <div
            className="absolute inset-0 opacity-15 dark:opacity-25"
            style={{
              backgroundImage: "url(/images/hero-bg.png)",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/70" />
          <div className="relative z-10">
            <p className="text-sm font-medium uppercase tracking-wider text-primary" data-testid="text-hero-location">
              Las Vegas, NV
            </p>
            <h1
              className="mt-2 text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
              data-testid="text-hero-name"
            >
              {siteConfig.name}
            </h1>
            <p
              className="mt-3 text-lg font-medium text-primary sm:text-xl"
              data-testid="text-hero-tagline"
            >
              {siteConfig.tagline}
            </p>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              {siteConfig.shortBio}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/projects"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                data-testid="button-view-projects"
              >
                View Projects <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                data-testid="button-read-blog"
              >
                Read the Blog
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                data-testid="button-contact"
              >
                Get in Touch
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

      <section className="pb-12" data-testid="section-about">
        <h2 className="text-2xl font-bold text-foreground">About Me</h2>
        <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
          {siteConfig.fullBio.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="pb-12" data-testid="section-highlights">
        <h2 className="text-2xl font-bold text-foreground">What I Focus On</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border">
            <Shield className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold text-foreground">Cybersecurity</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              99th percentile NCL competitor. Challenge-based problem solving across traffic analysis, log investigation, and more.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border">
            <Server className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold text-foreground">Enterprise Networking</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Routing, switching, segmentation, and security controls. Building networks that are reliable and engineered properly.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border">
            <Trophy className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold text-foreground">Music</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              #1 ranked percussionist in Nevada. All-State Band every year from 6th grade through freshman year. Music club president.
            </p>
          </div>
          <div className="rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border">
            <Users className="h-6 w-6 text-primary" />
            <h3 className="mt-3 font-semibold text-foreground">Leadership</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Cyber club president, Blue Ribbon Commissioner, OWINN Youth Advisory Council member. Active in school and community service.
            </p>
          </div>
        </div>
      </section>

      <section className="pb-12" data-testid="section-currently">
        <h2 className="text-2xl font-bold text-foreground">What I am Working On</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {siteConfig.currently.map((section) => (
            <div
              key={section.category}
              className="rounded-xl border border-border/50 bg-card/50 p-6"
            >
              <h3 className="font-semibold text-foreground">{section.category}</h3>
              <ul className="mt-3 space-y-2">
                {section.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-12" data-testid="section-achievements">
        <h2 className="text-2xl font-bold text-foreground">Achievements</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {siteConfig.achievements.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-border/50 bg-card/50 p-6 transition-colors hover:border-border"
            >
              <h3 className="font-semibold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="pb-12" data-testid="section-skills">
        <h2 className="text-2xl font-bold text-foreground">Skills</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {siteConfig.skillCategories.map((category) => (
            <div key={category.name}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                {category.name}
              </h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {category.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full border border-border/50 bg-accent/50 px-3 py-1 text-sm text-foreground"
                    data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, "-").replace(/[()\/]/g, "")}`}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
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
                  <h3 className="mt-1 font-semibold text-foreground transition-colors group-hover:text-primary">
                    {post.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {post.excerpt}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
