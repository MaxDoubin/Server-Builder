import { Suspense, lazy } from "react";
import { Link } from "wouter";
import { siteConfig } from "@/lib/siteConfig";
import { Layout } from "@/components/site/Layout";
import { getAllPosts } from "@/lib/blogPosts";
import { ScrollReveal } from "@/components/site/ScrollReveal";
import { AnimatedCounter } from "@/components/site/AnimatedCounter";
import { HeroErrorBoundary } from "@/components/site/HeroErrorBoundary";
import {
  ArrowRight,
  Instagram,
  Shield,
  Server,
  Users,
  ChevronRight,
  Zap,
  Award,
  Target,
  Music,
  Github,
} from "lucide-react";

const HeroAnimation = lazy(() =>
  import("@/components/hero/HeroAnimation").then((m) => ({
    default: m.HeroAnimation,
  }))
);

function HeroFallback() {
  return (
    <div className="h-full w-full bg-gradient-to-br from-[#020812] via-[#0a1628] to-[#020812]">
      <div className="absolute inset-0 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(56,189,248,0.15),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_30%,rgba(129,140,248,0.12),transparent_50%)]" />
      </div>
    </div>
  );
}

export function Home() {
  const recentPosts = getAllPosts().slice(0, 2);

  return (
    <Layout>
      <section className="relative -mx-6 -mt-4 overflow-hidden" data-testid="section-hero">
        <div className="relative min-h-[85vh] flex items-center">
          <div className="absolute inset-0">
            <HeroErrorBoundary fallback={<HeroFallback />}>
              <Suspense fallback={<HeroFallback />}>
                <HeroAnimation
                  className="absolute inset-0 h-full w-full"
                  variant="about"
                  seed={42}
                />
              </Suspense>
            </HeroErrorBoundary>
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-20">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-xs font-medium uppercase tracking-wider text-primary">
                <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-glow-pulse" />
                South CTA Cybersecurity Program
              </div>

              <h1
                className="mt-6 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl"
                data-testid="text-hero-name"
              >
                {siteConfig.name}
              </h1>

              <p className="mt-4 text-lg font-medium text-blue-300 sm:text-xl" data-testid="text-hero-tagline">
                Enterprise Networking. Cybersecurity. Informatics.
              </p>

              <p className="mt-6 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                Building enterprise-grade infrastructure and competing at the highest levels in cybersecurity.
                99th percentile National Cyber League. 14 TB of RAM in my homelab. #1 percussionist in Nevada.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25"
                  data-testid="button-view-projects"
                >
                  View My Work <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/game"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/30"
                  data-testid="button-play-game"
                >
                  <Zap className="h-4 w-4 text-cyan-400" /> Launch Hyperscale
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/30"
                  data-testid="button-contact"
                >
                  Get in Touch
                </Link>
              </div>

              <div className="mt-8 flex items-center gap-4">
                <a
                  href={siteConfig.social.instagram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
                  data-testid="link-instagram-hero"
                >
                  <Instagram className="h-4 w-4" /> {siteConfig.social.instagram.handle}
                </a>
                <a
                  href={siteConfig.social.github.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
                  data-testid="link-github-hero"
                >
                  <Github className="h-4 w-4" /> {siteConfig.social.github.handle}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative -mx-6 border-y border-border/50 bg-card/80 backdrop-blur-sm" data-testid="section-stats">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground stat-glow sm:text-4xl" data-testid="stat-ram">
                <AnimatedCounter end={14} suffix=" TB" />
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                RAM in Homelab
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground stat-glow sm:text-4xl" data-testid="stat-storage">
                <AnimatedCounter end={500} suffix="+ TB" />
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Storage Capacity
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground stat-glow sm:text-4xl" data-testid="stat-ncl">
                <AnimatedCounter end={99} prefix="Top " suffix="%" />
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                National Cyber League
              </div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground stat-glow sm:text-4xl" data-testid="stat-ranking">
                #<AnimatedCounter end={1} />
              </div>
              <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Percussionist in NV
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="px-0">
        <ScrollReveal>
          <section className="pb-12 pt-16" data-testid="section-about">
            <h2 className="text-2xl font-bold text-foreground">About Me</h2>
            <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
              {siteConfig.fullBio.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </section>
        </ScrollReveal>

        <section className="pb-12" data-testid="section-highlights">
          <ScrollReveal>
            <h2 className="text-2xl font-bold text-foreground">What I Focus On</h2>
          </ScrollReveal>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Shield,
                title: "Cybersecurity",
                desc: "99th percentile National Cyber League competitor. Practical skills across traffic analysis, log investigation, scanning, cryptography, and forensics.",
                color: "text-green-400",
              },
              {
                icon: Server,
                title: "Enterprise Networking",
                desc: "Cisco and Fortinet environments. VLANs, subnetting, routing protocols, STP, firewall policy, and real troubleshooting on enterprise hardware.",
                color: "text-blue-400",
              },
              {
                icon: Music,
                title: "Music",
                desc: "#1 ranked percussionist in Nevada for 2024 and 2025. All-State Band every year since 6th grade. Precision and performance under pressure.",
                color: "text-purple-400",
              },
              {
                icon: Users,
                title: "Leadership",
                desc: "President of Cyber Club and Music Club. Blue Ribbon Commissioner. OWINN Youth Advisory Council. Building teams and serving my community.",
                color: "text-amber-400",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} stagger={i + 1}>
                <div className="card-hover rounded-xl border border-border/50 bg-card/50 p-6">
                  <item.icon className={`h-7 w-7 ${item.color}`} />
                  <h3 className="mt-3 font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="pb-12" data-testid="section-achievements">
          <ScrollReveal>
            <h2 className="text-2xl font-bold text-foreground">Achievements</h2>
          </ScrollReveal>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: Target,
                title: "National Cyber League, 99th Percentile",
                desc: "Ranked in the top 1% nationally across practical cybersecurity challenges. Traffic analysis, log investigation, forensics, and real-world problem solving.",
              },
              {
                icon: Award,
                title: "#1 Percussionist in Nevada (2024, 2025)",
                desc: "Earned the top statewide ranking in percussion performance for two consecutive years. Competing at the highest level since middle school.",
              },
              {
                icon: Music,
                title: "All-State Band, Every Year Since 6th Grade",
                desc: "Selected for Nevada All-State in 6th, 7th, 8th grade, and again as a freshman. Consistent performance at the state's highest level.",
              },
              {
                icon: Shield,
                title: "South CTA Cyber Team, 7th in the Nation",
                desc: "Helped lead a fully freshman school to a top-ten national ranking. Proof that discipline and preparation beat experience.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} stagger={i + 1}>
                <div className="card-hover flex gap-4 rounded-xl border border-border/50 bg-card/50 p-6">
                  <item.icon className="mt-0.5 h-6 w-6 flex-shrink-0 text-primary" />
                  <div>
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="pb-12" data-testid="section-currently">
          <ScrollReveal>
            <h2 className="text-2xl font-bold text-foreground">Currently</h2>
            <p className="mt-2 text-muted-foreground">What I am working on right now.</p>
          </ScrollReveal>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {siteConfig.currently.map((section, i) => (
              <ScrollReveal key={section.category} stagger={i + 1}>
                <div className="card-hover rounded-xl border border-border/50 bg-card/50 p-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                    {section.category}
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {section.items.map((item, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="pb-12" data-testid="section-skills">
          <ScrollReveal>
            <h2 className="text-2xl font-bold text-foreground">Technical Skills</h2>
          </ScrollReveal>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {siteConfig.skillCategories.map((category, i) => (
              <ScrollReveal key={category.name} stagger={(i % 3) + 1}>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-primary">
                    {category.name}
                  </h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {category.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-border/50 bg-accent/50 px-3 py-1 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10"
                        data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, "-").replace(/[()\/]/g, "")}`}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="pb-12" data-testid="section-leadership">
          <ScrollReveal>
            <h2 className="text-2xl font-bold text-foreground">Leadership</h2>
          </ScrollReveal>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {siteConfig.leadership.map((role, i) => (
              <ScrollReveal key={role.title} stagger={(i % 2) + 1}>
                <div className="card-hover rounded-xl border border-border/50 bg-card/50 p-6">
                  <h3 className="font-semibold text-foreground">{role.title}</h3>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wider text-primary">
                    {role.org}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {role.details.map((detail, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/60" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {recentPosts.length > 0 && (
          <section className="pb-16" data-testid="section-recent-posts">
            <ScrollReveal>
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-foreground">Recent Posts</h2>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  data-testid="link-all-posts"
                >
                  View all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </ScrollReveal>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {recentPosts.map((post, i) => (
                <ScrollReveal key={post.slug} stagger={i + 1}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group overflow-hidden rounded-xl border border-border/50 bg-card/50 card-hover block"
                    data-testid={`card-post-${post.slug}`}
                  >
                    <div className="aspect-[2/1] overflow-hidden">
                      <img
                        src={post.coverImage}
                        alt={post.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
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
                </ScrollReveal>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
