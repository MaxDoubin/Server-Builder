import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { siteConfig } from "@/lib/siteConfig";
import { Layout } from "@/components/site/Layout";
import { getAllPosts } from "@/lib/blogPosts";
import { AnimatedCounter } from "@/components/site/AnimatedCounter";
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


type RevealProps = {
  children: ReactNode;
};

function Reveal({ children }: RevealProps) {
  return <>{children}</>;
}

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
          pauseUntilRef.current = now + 1200;
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
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [words]);

  return (
    <span className={className}>
      {displayed}
      <span className="animate-blink text-primary">|</span>
    </span>
  );
}


function FloatingGrid() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(56,189,248,0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.22) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
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
            <HeroFallback />
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/70 to-black/50" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          </div>

          <FloatingGrid />

          <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-24 sm:py-32">
            <div className="max-w-2xl hero-content-entrance">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-primary/90 backdrop-blur-sm">
                <div className="relative h-2 w-2">
                  <div className="absolute inset-0 rounded-full bg-green-400" />
                  <div className="absolute inset-0 rounded-full bg-green-400 opacity-60" />
                </div>
                Available for opportunities
              </div>

              <h1
                className="mt-8 text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl xl:text-8xl animate-slide-up"
                data-testid="text-hero-name"
              >
                {siteConfig.name}
              </h1>

              <div className="mt-5 h-8 sm:h-10 animate-slide-up [animation-delay:200ms]" data-testid="text-hero-tagline">
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

              <p className="mt-8 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg animate-slide-up [animation-delay:400ms]">
                {siteConfig.shortBio}
              </p>

              <div className="mt-10 flex flex-wrap gap-3 animate-slide-up [animation-delay:600ms]">
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
                  className="group inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-white/25 hover:scale-[1.02]"
                  data-testid="button-play-game"
                >
                  <Zap className="h-4 w-4 text-cyan-400 transition-all group-hover:text-cyan-300 group-hover:drop-shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                  Launch Hyperscale
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:border-white/25 hover:scale-[1.02]"
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

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
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
              { end: 1, prefix: "#", suffix: "", label: "Percussionist", icon: Music },
              { end: 2023, prefix: "", suffix: "+", label: "All-State", icon: Award },
            ].map((stat, i) => (
              <Reveal key={stat.label} stagger={i + 1}>
                <div className="group text-center transition-all duration-500 hover:scale-110">
                  <stat.icon className="mx-auto h-5 w-5 text-primary/50 mb-3 transition-all duration-300 group-hover:text-primary group-hover:animate-bounce" />
                  <div className="text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl group-hover:animate-glow" data-testid={`stat-${stat.label.toLowerCase().replace(/[\s,]/g, "-")}`}>
                    <AnimatedCounter end={stat.end} prefix={stat.prefix} suffix={stat.suffix} />
                  </div>
                  <div className="mt-2 text-xs font-medium uppercase tracking-widest text-muted-foreground/70">
                    {stat.label}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <div className="px-0 relative">
        <FloatingGrid />

        <Reveal>
          <section className="pb-16 pt-20" data-testid="section-about">
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">About</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
            <div className="max-w-3xl mx-auto space-y-5 text-muted-foreground leading-relaxed text-center sm:text-lg animate-pulse-subtle">
              {siteConfig.fullBio.map((paragraph, i) => (
                <p key={i} className="transition-all duration-700 hover:text-foreground hover:translate-y-[-2px]">{paragraph}</p>
              ))}
            </div>
          </section>
        </Reveal>

        <section className="pb-16" data-testid="section-highlights">
          <Reveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Expertise</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </Reveal>
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
              <Reveal key={item.title} stagger={i + 1}>
                <div className={`group card-hover rounded-xl border border-border/30 bg-gradient-to-b ${item.color} p-6 ${item.borderColor} h-full transition-all duration-500 hover:shadow-2xl hover:shadow-primary/20`}>
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-background/50 p-2 ring-1 ring-border/30 transition-all duration-300 group-hover:ring-primary/50 group-hover:scale-110 group-hover:rotate-3">
                      <item.icon className={`h-5 w-5 ${item.iconColor} transition-transform duration-500 group-hover:animate-pulse`} />
                    </div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{item.title}</h3>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground group-hover:text-foreground transition-colors">
                    {item.desc}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pb-16" data-testid="section-achievements">
          <Reveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Achievements</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: Target,
                title: "National Cyber League, Top 1 Percent",
                desc: "Nationally recognized for practical cybersecurity challenges, including traffic analysis, log investigation, forensics, and real-world problem solving.",
              },
              {
                icon: Shield,
                title: "Cyber Team, 7th in the Nation",
                desc: "Helped build and lead a team to a top-ten national ranking in competitive cybersecurity. Prep and technical discipline at scale.",
              },
              {
                icon: Music,
                title: "#1 Percussionist in Nevada",
                desc: "Earned the top statewide ranking in percussion performance for two consecutive years.",
              },
            ].map((item, i) => (
              <Reveal key={item.title} stagger={i + 1}>
                <div className="group card-hover flex gap-4 rounded-xl border border-border/30 bg-card/30 p-6 hover:bg-card/50 transition-all duration-500 hover:shadow-xl hover:shadow-primary/10">
                  <div className="mt-0.5 flex-shrink-0 rounded-lg bg-primary/10 p-2 ring-1 ring-primary/20 transition-all duration-300 group-hover:bg-primary/20 group-hover:ring-primary/50 group-hover:scale-110 group-hover:-rotate-3">
                    <item.icon className="h-4 w-4 text-primary transition-transform duration-500 group-hover:scale-125" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground group-hover:text-foreground transition-colors">
                      {item.desc}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pb-16" data-testid="section-currently">
          <Reveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Currently</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {siteConfig.currently.map((section, i) => (
              <Reveal key={section.category} stagger={i + 1}>
                <div className="card-hover rounded-xl border border-border/30 bg-card/30 p-6 hover:bg-card/50 h-full transition-all duration-500 hover:shadow-lg hover:border-primary/20">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-primary/80 group-hover:animate-pulse">
                    {section.category}
                  </h3>
                  <ul className="mt-4 space-y-2.5">
                    {section.items.map((item, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2.5 text-sm text-muted-foreground transition-all duration-300 hover:text-foreground hover:translate-x-1"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/40 transition-colors group-hover:text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pb-16" data-testid="section-skills">
          <Reveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Technical Skills</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </Reveal>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {siteConfig.skillCategories.map((category, i) => (
              <Reveal key={category.name} stagger={(i % 3) + 1}>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/60 mb-3">
                    {category.name}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {category.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full border border-border/30 bg-card/40 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-all duration-500 hover:border-primary/50 hover:bg-primary/10 hover:text-foreground hover:scale-110 hover:shadow-md hover:shadow-primary/10"
                        data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, "-").replace(/[()\/]/g, "")}`}
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="pb-16" data-testid="section-leadership">
          <Reveal>
            <div className="flex items-center gap-3 mb-8">
              <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
              <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Leadership</h2>
              <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
            </div>
          </Reveal>
          <div className="grid gap-4 sm:grid-cols-2">
            {siteConfig.leadership.map((role, i) => (
              <Reveal key={role.title} stagger={(i % 2) + 1}>
                <div className="card-hover rounded-xl border border-border/30 bg-card/30 p-6 hover:bg-card/50 h-full transition-all duration-500 hover:shadow-xl hover:border-primary/20">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{role.title}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-primary/60 group-hover:animate-pulse">
                    {role.org}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {role.details.map((detail, j) => (
                      <li
                        key={j}
                        className="flex items-start gap-2.5 text-sm text-muted-foreground transition-all duration-300 hover:text-foreground hover:translate-x-1"
                      >
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/40 group-hover:text-primary" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {recentPosts.length > 0 && (
          <section className="pb-20" data-testid="section-recent-posts">
            <Reveal>
              <div className="flex items-center gap-3 mb-8">
                <div className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" />
                <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">Latest Posts</h2>
                <div className="h-px flex-1 bg-gradient-to-l from-primary/30 to-transparent" />
              </div>
            </Reveal>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recentPosts.map((post, i) => (
                <Reveal key={post.slug} stagger={i + 1}>
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
                        decoding="async"
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
                </Reveal>
              ))}
            </div>
            <Reveal>
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
            </Reveal>
          </section>
        )}
      </div>
    </Layout>
  );
}
