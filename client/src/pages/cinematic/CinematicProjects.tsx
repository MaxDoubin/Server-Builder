import { useRef, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { siteConfig } from "@/lib/siteConfig";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "networking", label: "Networking" },
  { value: "simulation", label: "Simulation" },
  { value: "web", label: "Web" },
];

export function CinematicProjects() {
  useSEO({
    title: "Projects | Max Doubin",
    description:
      "Projects by Max Doubin in cybersecurity, enterprise networking, 3D datacenter simulation, and web development.",
    canonical: "https://maxdoubin.com/projects",
  });

  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState("all");

  const filteredProjects =
    activeCategory === "all"
      ? siteConfig.projects
      : siteConfig.projects.filter((p) => p.category === activeCategory);

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(headerRef.current?.children ?? [], {
        opacity: 0,
        y: 28,
        duration: 0.9,
        stagger: 0.1,
        ease: "power3.out",
      });
    },
    [],
  );

  return (
    <CinematicLayout>
      <div
        ref={rootRef}
        className="relative min-h-screen px-6 pb-32 pt-[22vh] md:px-10"
      >
        {/* Grid backdrop */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--brand-iron) / 0.25) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.25) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at top, black 40%, transparent 80%)",
            opacity: 0.6,
          }}
        />

        <div className="relative mx-auto max-w-[1200px]">
          <div ref={headerRef} className="max-w-[58ch]">
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · Index · Projects
            </div>
            <h1
              data-testid="text-projects-title"
              className="mt-6 font-display text-[clamp(2.4rem,6vw,5rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
            >
              Things I have <span className="signal-text">built</span> and am building.
            </h1>
            <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
              Each entry below is something I've stood up, stress-tested, or broken
              on purpose to learn from. The filter below scopes by domain.
            </p>
          </div>

          {/* Filter strip */}
          <div
            data-testid="project-filters"
            className="mt-14 flex flex-wrap items-center gap-2 border-y border-[hsl(var(--brand-iron))] py-4"
          >
            <span className="mr-4 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              filter ·
            </span>
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setActiveCategory(cat.value)}
                  data-testid={`button-filter-${cat.value}`}
                  className={`group relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors ${
                    active
                      ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/.12)] text-[hsl(var(--brand-bone))]"
                      : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-bone))]"
                  }`}
                >
                  {active && (
                    <span
                      className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                      style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                    />
                  )}
                  {cat.label}
                </button>
              );
            })}
            <span className="ml-auto font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              {filteredProjects.length.toString().padStart(2, "0")} · result
              {filteredProjects.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Project grid */}
          <div ref={gridRef} className="mt-10 grid gap-6 md:grid-cols-2">
            {filteredProjects.map((project, idx) => (
              <article
                key={project.id}
                data-testid={`card-project-${project.id}`}
                className="group relative flex flex-col overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.5)] backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/.4)]"
              >
                <div className="scanline pointer-events-none absolute inset-0 opacity-10" />

                {project.coverImage && (
                  <div className="relative aspect-[16/9] overflow-hidden">
                    <img
                      src={project.coverImage}
                      alt={project.title}
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          "linear-gradient(180deg, transparent 50%, hsl(var(--brand-obsidian) / 0.85) 100%)",
                      }}
                    />
                    <div className="absolute left-4 top-4 flex items-center gap-2 font-techno text-[9px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone))]">
                      <span
                        className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                        style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                      />
                      UNIT · {String(idx + 1).padStart(2, "0")}
                    </div>
                    <div className="absolute right-4 top-4 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-bone-dim))]">
                      {project.category}
                    </div>
                  </div>
                )}

                <div className="relative flex flex-1 flex-col p-6">
                  <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
                    {project.title}
                  </h2>
                  <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {project.description}
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {project.tech.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.5)] px-2.5 py-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-[hsl(var(--brand-iron))] pt-5">
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                      {project.isGame ? "interactive · 3D" : project.link ? "external" : "ongoing"}
                    </span>
                    {project.isGame ? (
                      <Link
                        href={project.link}
                        data-testid={`button-play-${project.id}`}
                        className="inline-flex items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                      >
                        <span
                          className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                          style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                        />
                        Play the game →
                      </Link>
                    ) : project.link ? (
                      <Link
                        href={project.link}
                        data-testid={`link-project-${project.id}`}
                        className="inline-flex items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:text-[hsl(var(--brand-signal))]"
                      >
                        Open project →
                      </Link>
                    ) : (
                      <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                        private · no link
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filteredProjects.length === 0 && (
            <div
              data-testid="text-no-projects"
              className="mt-16 rounded-lg border border-[hsl(var(--brand-iron))] p-12 text-center"
            >
              <div className="font-display text-2xl text-[hsl(var(--brand-bone))]">
                No projects in this category.
              </div>
              <div className="mt-3 font-mono-tight text-[11px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                try a different filter
              </div>
            </div>
          )}
        </div>
      </div>
    </CinematicLayout>
  );
}
