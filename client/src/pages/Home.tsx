import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { siteConfig } from "@/lib/siteConfig";
import { Layout } from "@/components/site/Layout";
import { getAllPosts } from "@/lib/blogPosts";
import { useSEO } from "@/lib/useSEO";
import { AnimatedCounter } from "@/components/site/AnimatedCounter";
import { formatPostDate } from "@/lib/formatDate";
import {
  ArrowRight,
  Instagram,
  Shield,
  Users,
  ChevronRight,
  Award,
  Target,
  Music,
  Github,
  Terminal,
  Network,
  MapPin,
  Mail,
  BookOpen,
} from "lucide-react";

function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).style.opacity = "1";
            (entry.target as HTMLElement).style.transform = "translateY(0)";
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1 }
    );
    for (const el of els) {
      el.style.opacity = "0";
      el.style.transform = "translateY(24px)";
      el.style.transition = "opacity 0.6s ease, transform 0.6s ease";
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);
}

function TypeWriter({ words, className }: { words: string[]; className?: string }) {
  const [displayed, setDisplayed] = useState("");
  const wordIndexRef = useRef(0);
  const charIndexRef = useRef(0);
  const deletingRef = useRef(false);
  const pauseUntilRef = useRef(0);

  useEffect(() => {
    let timeoutId: number | undefined;
    const tick = () => {
      const now = Date.now();
      if (now < pauseUntilRef.current) {
        timeoutId = window.setTimeout(tick, 40);
        return;
      }
      const word = words[wordIndexRef.current] ?? "";
      if (!deletingRef.current) {
        if (charIndexRef.current < word.length) {
          charIndexRef.current += 1;
        } else {
          pauseUntilRef.current = now + 1400;
          deletingRef.current = true;
        }
      } else if (charIndexRef.current > 0) {
        charIndexRef.current -= 1;
      } else {
        deletingRef.current = false;
        wordIndexRef.current = (wordIndexRef.current + 1) % words.length;
      }
      const currentWord = words[wordIndexRef.current] ?? "";
      setDisplayed(currentWord.slice(0, charIndexRef.current));
      timeoutId = window.setTimeout(tick, deletingRef.current ? 28 : 52);
    };
    tick();
    return () => { if (timeoutId) window.clearTimeout(timeoutId); };
  }, [words]);

  return (
    <span className={className}>
      {displayed}
      <span className="animate-blink text-primary">|</span>
    </span>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-8" data-reveal>
      <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
      <h2 className="text-xs font-bold uppercase tracking-widest text-primary">{label}</h2>
      <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
    </div>
  );
}

export function Home() {
  const recentPosts = getAllPosts().slice(0, 3);
  useScrollReveal();

  /*
    This page had no SEO call at all. On a client-side navigation nothing
    reset the document head, so it kept the previous route's title,
    description and canonical: arriving here from a blog post left the
    browser tab and the canonical URL still claiming to be that post.

    The canonical points at "/" rather than "/legacy" on purpose. This is an
    alternate presentation of the same profile, so search engines should
    consolidate it onto the main page instead of indexing both.
  */
  useSEO({
    title:
      "Max Doubin | Cybersecurity, Networking, Systems Infrastructure, and Leadership",
    description: siteConfig.shortBio,
    canonical: "https://maxdoubin.com/",
    ogType: "profile",
  });

  return (
    <Layout>
      <section
        className="relative -mx-6 -mt-4 overflow-hidden border-b border-border/20"
        data-testid="section-hero"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[#020812] via-[#0a1628] to-[#020812]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(56,189,248,0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(129,140,248,0.06),transparent_50%)]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(56,189,248,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.3) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-transparent dark:from-background" />

        <div className="relative z-10 mx-auto max-w-5xl px-6 py-20 sm:py-28">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
            <div className="flex-shrink-0 flex justify-center lg:justify-start">
              <div className="relative">
                <div className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl bg-gradient-to-br from-primary/20 via-blue-600/20 to-indigo-600/20 ring-1 ring-primary/20 flex items-center justify-center shadow-2xl shadow-primary/10">
                  <span className="text-5xl sm:text-6xl font-black text-primary/80 select-none">MD</span>
                </div>
                <div className="absolute -bottom-2 -right-2 flex items-center gap-1.5 rounded-full border border-green-500/30 bg-[#020812]/90 px-3 py-1 text-xs font-medium text-green-400 shadow-lg backdrop-blur-sm">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
                  </span>
                  Open
                </div>
              </div>
            </div>

            <div className="flex-1 text-center lg:text-left">
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-2">Profile</p>
              <h1
                className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl"
                data-testid="text-hero-name"
              >
                {siteConfig.name}
              </h1>

              <div className="mt-3 h-7" data-testid="text-hero-tagline">
                <TypeWriter
                  words={[
                    "Cybersecurity",
                    "Enterprise Networking",
                    "Systems Infrastructure",
                    "Community Leadership",
                  ]}
                  className="font-mono text-base font-medium text-blue-400 sm:text-lg"
                />
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-white/60 lg:justify-start">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> Las Vegas, Nevada
                </span>
                <span aria-hidden="true" className="hidden sm:inline text-white/40">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-blue-400/70" /> Top 1% NCL
                </span>
                <span aria-hidden="true" className="hidden sm:inline text-white/40">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Award className="h-3.5 w-3.5 text-amber-400/70" /> CompTIA Tech+
                </span>
              </div>

              <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/55 sm:text-base">
                {siteConfig.shortBio}
              </p>

              <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.02]"
                  data-testid="button-contact"
                >
                  <Mail className="h-4 w-4" /> Get in Touch
                </Link>
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/25 hover:scale-[1.02]"
                  data-testid="button-view-projects"
                >
                  Projects <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/25 hover:scale-[1.02]"
                  data-testid="button-blog"
                >
                  <BookOpen className="h-4 w-4" /> Blog
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5 lg:justify-start">
                <a
                  href={siteConfig.social.instagram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white"
                  data-testid="link-instagram-hero"
                >
                  <Instagram className="h-3.5 w-3.5" /> {siteConfig.social.instagram.handle}
                </a>
                <a
                  href={siteConfig.social.github.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white"
                  data-testid="link-github-hero"
                >
                  <Github className="h-3.5 w-3.5" /> {siteConfig.social.github.handle}
                </a>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="inline-flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white"
                  data-testid="link-email-hero"
                >
                  <Mail className="h-3.5 w-3.5" /> {siteConfig.email}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="relative -mx-6 border-b border-border/20 bg-card/40 backdrop-blur-sm"
        data-testid="section-stats"
      >
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { end: 1, prefix: "Top ", suffix: "%", label: "NCL Finish", icon: Shield },
              { end: 7, prefix: "#", suffix: "", label: "School Rank", icon: Target },
              { end: 1, prefix: "Top ", suffix: "%", label: "National Cyber League", icon: Terminal },
              { end: 42, prefix: "", suffix: "U", label: "Rack Cabinet", icon: Award },
            ].map((stat) => (
              <div key={stat.label} className="group text-center" data-reveal>
                <stat.icon className="mx-auto mb-2 h-4 w-4 text-primary/70 transition-colors group-hover:text-primary" />
                <div
                  className="text-3xl font-black text-foreground sm:text-4xl transition-colors group-hover:text-primary"
                  data-testid={`stat-${stat.label.toLowerCase().replace(/[\s,]/g, "-")}`}
                >
                  <AnimatedCounter end={stat.end} prefix={stat.prefix} suffix={stat.suffix} />
                </div>
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-0">
        <section className="pt-16 pb-12" data-testid="section-about">
          <SectionHeader label="About" />
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-4">
              {siteConfig.fullBio.map((paragraph, i) => (
                <p
                  key={i}
                  className="text-muted-foreground leading-relaxed sm:text-[15px]"
                  data-reveal
                >
                  {paragraph}
                </p>
              ))}
            </div>
            <div className="space-y-3" data-reveal>
              <div className="rounded-xl border border-border/30 bg-card/40 p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">Quick Info</p>
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/70" />
                    Las Vegas, Nevada
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400/70" />
                    South Career Technical Academy
                  </li>
                  <li className="flex items-start gap-2">
                    <Award className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400/70" />
                    CompTIA Tech+ (FC0-U71)
                  </li>
                  <li className="flex items-start gap-2">
                    <Target className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-green-400/70" />
                    Top 1% National Cyber League
                  </li>
                  <li className="flex items-start gap-2">
                    <Music className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-purple-400/70" />
                    #1 Percussionist in Nevada (2024)
                  </li>
                  <li className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/70" />
                    <a href={`mailto:${siteConfig.email}`} className="hover:text-foreground transition-colors break-all">
                      {siteConfig.email}
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-12" data-testid="section-highlights">
          <SectionHeader label="Expertise" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Shield,
                title: "Cybersecurity",
                desc: "Competitive cybersecurity work across National Cyber League and Cyber Skyline, including OSINT, cryptography, log analysis, hash cracking, network forensics, and web exploitation.",
                color: "from-green-500/8 to-transparent",
                iconColor: "text-green-400",
                border: "hover:border-green-500/30",
              },
              {
                icon: Network,
                title: "Enterprise Networking",
                desc: "Hands-on networking work across Cisco switching, rack connectivity, segmentation, monitoring, and infrastructure planning.",
                color: "from-blue-500/8 to-transparent",
                iconColor: "text-blue-400",
                border: "hover:border-blue-500/30",
              },
              {
                icon: Terminal,
                title: "Systems Infrastructure",
                desc: "Designed, built, and operates a large home data center covering enterprise switching, virtualization, large-scale storage, and power and cooling planning.",
                color: "from-cyan-500/8 to-transparent",
                iconColor: "text-cyan-400",
                border: "hover:border-cyan-500/30",
              },
              {
                icon: Users,
                title: "Leadership",
                desc: "President of South CTA Cyber Club and Music Club, Blue Ribbon Commissioner, Big Future Ambassador, OWINN Youth Advisory Council member, and youth coding camp instructor.",
                color: "from-amber-500/8 to-transparent",
                iconColor: "text-amber-400",
                border: "hover:border-amber-500/30",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={`group rounded-xl border border-border/30 bg-gradient-to-b ${item.color} p-5 ${item.border} h-full transition-all duration-300 hover:shadow-lg`}
                data-reveal
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="rounded-lg bg-background/60 p-2 ring-1 ring-border/30 transition-all group-hover:scale-110">
                    <item.icon className={`h-4 w-4 ${item.iconColor}`} />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-12" data-testid="section-achievements">
          <SectionHeader label="Highlights" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                icon: Target,
                title: "Top 1% National Cyber League",
                desc: "Placed in the top 1 percent of all National Cyber League competitors through practical cybersecurity challenge work.",
              },
              {
                icon: Shield,
                title: "South CTA Ranked 7th Among U.S. High Schools",
                desc: "Helped lead South Career Technical Academy to 7th nationally among high schools in the Fall 2025 Cyber Power Rankings.",
              },
              {
                icon: Music,
                title: "Nevada Music Honors",
                desc: "Selected for Nevada All-State Band in 6th, 7th, and 9th grade and ranked #1 percussionist in Nevada in 2024.",
              },
              {
                icon: Users,
                title: "Leadership and Instruction",
                desc: "Leads student organizations, serves in civic and state advisory roles, and teaches youth coding camps across the Las Vegas Valley.",
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className="group flex gap-4 rounded-xl border border-border/30 bg-card/30 p-5 hover:bg-card/50 transition-all duration-300"
                data-reveal
                style={{ transitionDelay: `${i * 60}ms` }}
              >
                <div className="mt-0.5 flex-shrink-0 rounded-lg bg-primary/10 p-2 ring-1 ring-primary/20 transition-all group-hover:bg-primary/20 group-hover:scale-110">
                  <item.icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-12" data-testid="section-leadership">
          <SectionHeader label="Leadership & Community" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {siteConfig.leadership.map((role, i) => (
              <div
                key={role.title + role.org}
                className="rounded-xl border border-border/30 bg-card/30 p-5 hover:bg-card/50 hover:border-primary/20 transition-all duration-300"
                data-reveal
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <h3 className="text-sm font-semibold text-foreground leading-snug">{role.title}</h3>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-primary">{role.org}</p>
                <ul className="mt-3 space-y-2">
                  {role.details.map((detail, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary/70" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-12" data-testid="section-currently">
          <SectionHeader label="Current Focus" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {siteConfig.currently.map((section, i) => (
              <div
                key={section.category}
                className="rounded-xl border border-border/30 bg-card/30 p-5 hover:bg-card/50 transition-all duration-300"
                data-reveal
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-3">
                  {section.category}
                </h3>
                <ul className="space-y-2">
                  {section.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary/70" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-12" data-testid="section-skills">
          <SectionHeader label="Skills & Coursework" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {siteConfig.skillCategories.map((category, i) => (
              <div key={category.name} data-reveal style={{ transitionDelay: `${i * 60}ms` }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  {category.name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {category.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full border border-border/30 bg-card/40 px-3 py-1 text-xs font-medium text-foreground/70 transition-all hover:border-primary/40 hover:bg-primary/8 hover:text-foreground"
                      data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, "-").replace(/[()\/+.]/g, "")}`}
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
          <section className="pb-20" data-testid="section-recent-posts">
            <div className="flex items-center justify-between mb-8" data-reveal>
              <div className="flex items-center gap-3 flex-1">
                <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent max-w-[80px]" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-primary">Latest Posts</h2>
              </div>
              <Link
                href="/blog"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {recentPosts.map((post, i) => (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group block overflow-hidden rounded-xl border border-border/30 bg-card/30 hover:bg-card/60 hover:border-primary/20 transition-all duration-300 hover:shadow-lg"
                  data-reveal
                  style={{ transitionDelay: `${i * 80}ms` }}
                  data-testid={`card-post-${post.slug}`}
                >
                  <div className="aspect-[2/1] overflow-hidden">
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-primary mb-1.5">
                      {formatPostDate(post.date)}
                    </p>
                    <h3 className="text-sm font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{post.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
