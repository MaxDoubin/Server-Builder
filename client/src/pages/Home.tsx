import { Suspense, lazy, useEffect, useState, useCallback } from "react";
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
  Terminal,
  Network,
  HardDrive,
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

function TypeWriter({ words, className }: { words: string[]; className?: string }) {
  const [currentWord, setCurrentWord] = useState(0);
  const [currentChar, setCurrentChar] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const tick = useCallback(() => {
    const word = words[currentWord];
    if (isPaused) return;

    if (!isDeleting) {
      if (currentChar < word.length) {
        setCurrentChar((c) => c + 1);
      } else {
        setIsPaused(true);
        setTimeout(() => {
          setIsPaused(false);
          setIsDeleting(true);
        }, 2000);
      }
    } else {
      if (currentChar > 0) {
        setCurrentChar((c) => c - 1);
      } else {
        setIsDeleting(false);
        setCurrentWord((w) => (w + 1) % words.length);
      }
    }
  }, [currentWord, currentChar, isDeleting, isPaused, words]);

  useEffect(() => {
    const speed = isDeleting ? 40 : 80;
    const timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [tick, isDeleting]);

  const displayed = words[currentWord].substring(0, currentChar);

  return (
    <span className={className}>
      {displayed}
      <span className="animate-blink text-primary">|</span>
    </span>
  );
}

function FloatingGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(56,189,248,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.3) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/5 blur-[100px] animate-float-slow" />
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-blue-500/5 blur-[80px] animate-float-slow-reverse" />
    </div>
  );
}

export function Home() {
  const recentPosts = getAllPosts().slice(0, 3);

  return (
    <Layout>
      <section className="relative -mx-6 -mt-4 overflow-hidden" data-testid="section-hero">
        <div className="relative min-h-[100vh] flex items-center">
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
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-black/50" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          </div>

          <FloatingGrid />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
            <div className="max-w-2xl hero-content-entrance">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-primary/90 backdrop-blur-sm">
                <div className="relative h-2 w-2">
                  <div className="absolute inset-0 rounded-full bg-green-400" />
                  <div className="absolute inset-0 rounded-full bg-green-400 animate-ping" />
                </div>
                Available for opportunities
              </div>

              <h1
                className="mt-8 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl"
                data-testid="text-hero-name"
              >
                {siteConfig.name}
              </h1>

              <div className="mt-5 h-8 sm:h-10" data-testid="text-hero-tagline">
                <TypeWriter
                  words={[
                    "Enterprise Networking",
                    "Cybersecurity",
                    "Infrastructure Architecture",
                    "Systems Engineering",
                  ]}
                  className="text-lg font-mono font-medium text-blue-400 sm:text-xl lg:text-2xl"
                />
              </div>

              <p className="mt-8 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
                {siteConfig.shortBio}
              </p>

              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  href="/projects"
                  className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.02]"
                  data-testid="button-view-projects"
                >
                  View My Work
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/game"
                  className="group inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 hover:bg-white/10 hover:border-white/25 hover:scale-[1.02]"
                  data-testid="button-play-game"
                >
                  <Zap className="h-4 w-4 text-cyan-400 transition-all group-hover:text-cyan-300 group-hover:drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                  Launch Hyperscale
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition-all duration-300 hover:bg-white/10 hover:border-white/25 hover:scale-[1.02]"
                  data-testid="button-contact"
                >
                  Get in Touch
                </Link>
              </div>

              <div className="mt-10 flex items-center gap-5">
                <a
                  href={siteConfig.social.instagram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/40 transition-all duration-300 hover:text-white"
                  data-testid="link-instagram-hero"
                >
                  <Instagram className="h-4 w-4" /> {siteConfig.social.instagram.handle}
                </a>
                <a
                  href={siteConfig.social.github.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-white/40 transition-all duration-300 hover:text-white"
                  data-testid="link-github-hero"
                >
                  <Github className="h-4 w-4" /> {siteConfig.social.github.handle}
                </a>
              </div>
            </div>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce-slow">
            <div className="flex flex-col items-center gap-2 text-white/30">
              <span className="text-xs uppercase tracking-widest">Scroll</span>
              <div className="h-8 w-[1px] bg-gradient-to-b from-white/30 to-transparent" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative -mx-6 border-y border-border/30 bg-gradient-to-r from-card/90 via-card/60 to-card/90 backdrop-blur-lg" data-testid="section-stats">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {[
              { end: 1, prefix: "Top ", suffix: "%", label: "Cyber League", icon: Shield },
              { end: 7, prefix: "#", suffix: "", label: "Nationally, Team", icon: Target },
              { end: 1, prefix: "#", suffix: "", label: "Percussionist, NV", icon: Music },
              { end: 2019, prefix: "", suffix: "+", label: "All-State Since", icon: Award },
            ].map((stat, i) => (
              <ScrollReveal key={stat.label} stagger={i + 1}>
                <div className="group text-center">
                  <stat.icon className="mx-auto h-5 w-5 text-primary/50 mb-3 transition-colors group-hover:text-primary" />
                  <div className="text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl" data-testid={`stat-${stat.label.toLowerCase().replace(/[\s,]/g, "-")}`}>
                    <AnimatedCounter end={stat.end} prefix={stat.prefix} suffix={stat.suffix} />
                  </div>
                  <div className="mt-2 text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
                    {stat.label}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <div className="px-0 relative">
        <FloatingGrid />

        <ScrollReveal>
          <section className="pb-16 pt-20" data-testid="section-about">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">About</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
            <div className="max-w-3xl mx-auto space-y-5 text-muted-foreground leading-relaxed text-center sm:text-lg">
              {siteConfig.fullBio.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </div>
          </section>
        </ScrollReveal>

        <section className="pb-16" data-testid="section-highlights">
          <ScrollReveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Expertise</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </ScrollReveal>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Shield,
                title: "Cybersecurity",
                desc: "Top 1 percent National Cyber League. Traffic analysis, log investigation, scanning, cryptography, forensics, and incident response.",
                color: "from-green-500/10 to-green-500/5",
                iconColor: "text-green-400",
                borderColor: "hover:border-green-500/30",
              },
              {
                icon: Network,
                title: "Enterprise Networking",
                desc: "Cisco and Fortinet platforms. VLANs, subnetting, routing protocols, STP, firewall policy, and real troubleshooting on production hardware.",
                color: "from-blue-500/10 to-blue-500/5",
                iconColor: "text-blue-400",
                borderColor: "hover:border-blue-500/30",
              },
              {
                icon: Terminal,
                title: "Infrastructure",
                desc: "Enterprise servers running virtualization, ZFS, network segmentation, and monitoring at scale. Real hardware, real workloads.",
                color: "from-cyan-500/10 to-cyan-500/5",
                iconColor: "text-cyan-400",
                borderColor: "hover:border-cyan-500/30",
              },
              {
                icon: Users,
                title: "Leadership",
                desc: "President of multiple organizations. Blue Ribbon Commissioner. OWINN Youth Advisory Council. Building teams and driving results.",
                color: "from-amber-500/10 to-amber-500/5",
                iconColor: "text-amber-400",
                borderColor: "hover:border-amber-500/30",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} stagger={i + 1}>
                <div className={`group card-hover rounded-xl border border-border/30 bg-gradient-to-b ${item.color} p-6 ${item.borderColor} h-full`}>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-background/50 p-2 ring-1 ring-border/30 transition-all group-hover:ring-primary/30">
                      <item.icon className={`h-5 w-5 ${item.iconColor}`} />
                    </div>
                    <h3 className="font-semibold text-foreground">{item.title}</h3>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="pb-16" data-testid="section-achievements">
          <ScrollReveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Achievements</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </ScrollReveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: Target,
                title: "National Cyber League, Top 1 Percent",
                desc: "Ranked in the top 1 percent nationally across practical cybersecurity challenges, including traffic analysis, log investigation, forensics, and real-world problem solving.",
              },
              {
                icon: Award,
                title: "#1 Percussionist in Nevada (2024, 2025)",
                desc: "Earned the top statewide ranking in percussion performance for two consecutive years.",
              },
              {
                icon: Music,
                title: "All-State Band, Every Year Since 2019",
                desc: "Selected for Nevada All-State Band every year since 2019. Consistent top-level performance in competitive auditions.",
              },
              {
                icon: Shield,
                title: "Cyber Team, 7th in the Nation",
                desc: "Helped build and lead a team to a top-ten national ranking in competitive cybersecurity. Discipline and preparation over everything.",
              },
            ].map((item, i) => (
              <ScrollReveal key={item.title} stagger={i + 1}>
                <div className="group card-hover flex gap-4 rounded-xl border border-border/30 bg-card/30 p-6 hover:bg-card/50">
                  <div className="mt-0.5 flex-shrink-0 rounded-lg bg-primary/10 p-2 ring-1 ring-primary/20 transition-all group-hover:bg-primary/15 group-hover:ring-primary/30">
                    <item.icon className="h-4 w-4 text-primary" />
                  </div>
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

        <section className="pb-16" data-testid="section-currently">
          <ScrollReveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Currently</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </ScrollReveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {siteConfig.currently.map((section, i) => (
              <ScrollReveal key={section.category} stagger={i + 1}>
                <div className="card-hover rounded-xl border border-border/30 bg-card/30 p-6 hover:bg-card/50 h-full">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-primary/80">
                    {section.category}
                  </h3>
                  <ul className="mt-4 space-y-2.5">
                    {section.items.map((item, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2.5 text-sm text-muted-foreground"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/40" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </section>

        <section className="pb-16" data-testid="section-skills">
          <ScrollReveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Technical Skills</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </ScrollReveal>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {siteConfig.skillCategories.map((category, i) => (
              <ScrollReveal key={category.name} stagger={(i % 3) + 1}>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">
                    {category.name}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {category.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-border/30 bg-card/40 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-all duration-300 hover:border-primary/30 hover:bg-primary/10 hover:text-foreground"
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

        <section className="pb-16" data-testid="section-leadership">
          <ScrollReveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Leadership</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </ScrollReveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {siteConfig.leadership.map((role, i) => (
              <ScrollReveal key={role.title} stagger={(i % 2) + 1}>
                <div className="card-hover rounded-xl border border-border/30 bg-card/30 p-6 hover:bg-card/50 h-full">
                  <h3 className="font-semibold text-foreground">{role.title}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-primary/60">
                    {role.org}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {role.details.map((detail, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2.5 text-sm text-muted-foreground"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/40" />
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
          <section className="pb-20" data-testid="section-recent-posts">
            <ScrollReveal>
              <div className="flex items-center gap-3 mb-8">
                <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
                <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Latest Posts</h2>
                <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
              </div>
            </ScrollReveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentPosts.map((post, i) => (
                <ScrollReveal key={post.slug} stagger={i + 1}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group overflow-hidden rounded-xl border border-border/30 bg-card/30 card-hover block hover:bg-card/50 h-full"
                    data-testid={`card-post-${post.slug}`}
                  >
                    <div className="aspect-[2/1] overflow-hidden">
                      <img
                        src={post.coverImage}
                        alt={post.title}
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground/60">
                          {new Date(post.date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        {post.tags[0] && (
                          <>
                            <span className="text-muted-foreground/30">|</span>
                            <span className="text-xs font-medium text-primary/60">{post.tags[0]}</span>
                          </>
                        )}
                      </div>
                      <h3 className="mt-2 font-semibold text-foreground transition-colors group-hover:text-primary">
                        {post.title}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground/70 line-clamp-2">
                        {post.excerpt}
                      </p>
                    </div>
                  </Link>
                </ScrollReveal>
              ))}
            </div>
            <ScrollReveal>
              <div className="mt-8 text-center">
                <Link
                  href="/blog"
                  className="group inline-flex items-center gap-2 text-sm font-medium text-primary transition-all hover:gap-3"
                  data-testid="link-all-posts"
                >
                  View all posts
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </ScrollReveal>
          </section>
        )}
      </div>
    </Layout>
  );
}
