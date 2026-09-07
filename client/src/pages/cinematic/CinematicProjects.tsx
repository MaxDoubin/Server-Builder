import { useRef, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { siteConfig } from "@/lib/siteConfig";
import { useSEO } from "@/lib/useSEO";
import { useScrollReveal } from "@/lib/motion/useScrollScene";
import {
  ScrollReveal,
  StaggerGroup,
  StaggerItem,
  fadeUp,
  fadeRight,
  blurIn,
  TiltCard,
  HoverShine,
  Magnetic,
  ScrambleText,
  DrawLine,
  FloatingParticles,
  MorphingBlob,
  ParallaxFloat,
  WordReveal,
  ClipReveal,
  AnimatedGradientText,
  PulseGlow,
  motion,
  AnimatePresence,
  useInView,
} from "@/lib/framer-animations";

/**
 * Filters, derived from the projects that actually exist.
 *
 * This list used to be hardcoded, so it drifted: it offered Web and Art
 * after both of those projects were removed, and offered nothing for the
 * categories added since. A filter that returns an empty page is worse
 * than no filter.
 */
const CATEGORIES = [
  { value: "all", label: "All" },
  ...Array.from(new Set(siteConfig.projects.map((p) => p.category)))
    .sort()
    .map((value) => ({
      value,
      label: value.charAt(0).toUpperCase() + value.slice(1).replace(/-/g, " "),
    })),
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

  // Keep GSAP scroll reveal for coexistence
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
    <CinematicLayout overHero>
      <div
        ref={rootRef}
        className="relative min-h-screen px-6 pb-32 pt-[22vh] md:px-10"
      >
        {/* Floating particles layer */}
        <FloatingParticles count={18} color="hsl(var(--brand-cyan))" />

        {/* Morphing blob background */}
        <MorphingBlob
          color="hsl(var(--brand-cyan) / 0.08)"
          size={500}
          className="left-1/2 top-[10%] -translate-x-1/2"
        />

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
          {/* Header wrapped in ScrollReveal with fadeRight */}
          <ScrollReveal variants={fadeRight} delay={0.1}>
            <div ref={headerRef} className="max-w-[58ch]">
              <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
                <ScrambleText text="· Index · Projects" scrambleDuration={1.8} />
              </div>

              <WordReveal
                text="Things I have built and am building."
                as="h1"
                className="mt-6 font-display text-[clamp(2.4rem,6vw,5rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]"
                delay={0.2}
                staggerDelay={0.07}
              />

              <ClipReveal delay={0.5} direction="up">
                <p className="mt-6 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
                  Each entry below is something I've stood up, stress-tested, or broken
                  on purpose to learn from. The filter below scopes by domain.
                </p>
              </ClipReveal>
            </div>
          </ScrollReveal>

          {/* DrawLine divider before filters */}
          <DrawLine
            className="mt-14"
            color="hsl(var(--brand-signal) / 0.4)"
            delay={0.6}
          />

          {/* Filter strip */}
          <ScrollReveal variants={fadeUp} delay={0.3}>
            <div
              data-testid="project-filters"
              data-print-hide
              className="flex flex-wrap items-center gap-2 border-y border-[hsl(var(--brand-iron))] py-4"
            >
              <span className="mr-4 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                filter ·
              </span>
              {CATEGORIES.map((cat) => {
                const active = activeCategory === cat.value;
                return (
                  <motion.button
                    key={cat.value}
                    onClick={() => setActiveCategory(cat.value)}
                    data-testid={`button-filter-${cat.value}`}
                    className={`group relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-full border px-4 font-mono-tight text-[11px] uppercase tracking-[0.24em] transition-colors ${
                      active
                        ? "border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/.12)] text-[hsl(var(--brand-bone))]"
                        : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-bone))]"
                    }`}
                    whileHover={{
                      scale: 1.07,
                      transition: { type: "spring", stiffness: 400, damping: 15 },
                    }}
                    whileTap={{
                      scale: 0.93,
                      transition: { type: "spring", stiffness: 500, damping: 20 },
                    }}
                  >
                    <AnimatePresence mode="wait">
                      {active && (
                        <motion.span
                          key="dot"
                          className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                          style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: "spring", stiffness: 500, damping: 25 }}
                        />
                      )}
                    </AnimatePresence>
                    {cat.label}
                  </motion.button>
                );
              })}
              <span className="ml-auto font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                <AnimatedGradientText>
                  {filteredProjects.length.toString().padStart(2, "0")}
                </AnimatedGradientText>
                {" "}· result
                {filteredProjects.length === 1 ? "" : "s"}
              </span>
            </div>
          </ScrollReveal>

          {/* DrawLine divider after filters */}
          <DrawLine
            className="mb-10"
            color="hsl(var(--brand-iron) / 0.5)"
            delay={0.8}
          />

          {/* Project grid with AnimatePresence for filter transitions */}
          <AnimatePresence mode="popLayout">
            <StaggerGroup
              key={activeCategory}
              className="mt-10 grid gap-6 md:grid-cols-2"
              staggerDelay={0.1}
              delayChildren={0.15}
            >
              {filteredProjects.map((project, idx) => (
                <StaggerItem key={project.id} variants={fadeUp}>
                  <TiltCard maxTilt={10} glare={true} className="h-full">
                    <HoverShine>
                      <motion.article
                        layout
                        data-testid={`card-project-${project.id}`}
                        className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.5)] backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/.4)]"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        transition={{
                          layout: { type: "spring", stiffness: 300, damping: 30 },
                          opacity: { duration: 0.4 },
                        }}
                      >
                        <div className="scanline pointer-events-none absolute inset-0 opacity-10" />

                        {project.coverImage && (
                          <ParallaxFloat speed={0.2}>
                            <div className="relative aspect-[16/9] overflow-hidden">
                              {/*
                                Intrinsic size so the browser reserves the
                                card's aspect ratio before the file lands.
                                Without it each cover popped in and pushed
                                the grid around as it loaded. Every cover is
                                16:9 at 1600x900.
                              */}
                              <img
                                src={project.coverImage}
                                alt={project.title}
                                width={1600}
                                height={900}
                                className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                                loading="lazy"
                                decoding="async"
                              />
                              <div
                                aria-hidden
                                className="absolute inset-0"
                                style={{
                                  background:
                                    "linear-gradient(180deg, transparent 50%, hsl(var(--brand-obsidian) / 0.85) 100%)",
                                }}
                              />
                              <motion.div
                                className="absolute left-4 top-4 flex items-center gap-2 font-techno text-[9px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone))]"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.3 + idx * 0.05, duration: 0.5 }}
                              >
                                <span
                                  className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                                  style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                                />
                                UNIT · {String(idx + 1).padStart(2, "0")}
                              </motion.div>
                              <motion.div
                                className="absolute right-4 top-4 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-bone-dim))]"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.35 + idx * 0.05, duration: 0.5 }}
                              >
                                {project.category}
                              </motion.div>
                            </div>
                          </ParallaxFloat>
                        )}

                        <div className="relative flex flex-1 flex-col p-6">
                          <h2 className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
                            {project.title}
                          </h2>
                          <p className="mt-3 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                            {project.description}
                          </p>

                          {/* Tech tags with stagger animation on hover */}
                          <motion.div
                            className="mt-5 flex flex-wrap gap-2"
                            initial="rest"
                            whileHover="hover"
                            variants={{
                              rest: {},
                              hover: {
                                transition: {
                                  staggerChildren: 0.04,
                                },
                              },
                            }}
                          >
                            {project.tech.map((t) => (
                              <motion.span
                                key={t}
                                className="rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.5)] px-2.5 py-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))]"
                                variants={{
                                  rest: { scale: 1, y: 0 },
                                  hover: {
                                    scale: 1.08,
                                    y: -2,
                                    borderColor: "hsl(var(--brand-signal) / 0.4)",
                                    color: "hsl(var(--brand-bone))",
                                    transition: {
                                      type: "spring",
                                      stiffness: 400,
                                      damping: 15,
                                    },
                                  },
                                }}
                              >
                                {t}
                              </motion.span>
                            ))}
                          </motion.div>

                          {/* DrawLine divider inside card */}
                          <DrawLine
                            className="mt-6"
                            color="hsl(var(--brand-iron))"
                            delay={0.4 + idx * 0.1}
                          />

                          <div className="mt-0 flex items-center justify-between pt-5">
                            <span className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                              {project.isGame
                                ? "interactive · 3D"
                                : !project.link
                                  ? "ongoing"
                                  : project.link.startsWith("/")
                                    ? "on this site"
                                    : "external"}
                            </span>
                            {project.isGame ? (
                              <PulseGlow color="hsl(var(--brand-signal))">
                                <Magnetic strength={0.2} radius={120}>
                                  <Link
                                    href={project.link}
                                    data-testid={`button-play-${project.id}`}
                                    className="inline-flex py-[14px] -my-[14px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                                  >
                                    <span
                                      className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
                                      style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
                                    />
                                    Play the game →
                                  </Link>
                                </Magnetic>
                              </PulseGlow>
                            ) : project.link && !project.link.startsWith("/") ? (
                              // Off-site: a real anchor, so the router does not
                              // try to resolve another origin as a route.
                              <Magnetic strength={0.15} radius={100}>
                                <a
                                  href={project.link}
                                  target="_blank"
                                  rel="noreferrer noopener"
                                  data-testid={`link-project-${project.id}`}
                                  className="inline-flex py-[14px] -my-[14px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:text-[hsl(var(--brand-signal))]"
                                >
                                  Open project →
                                </a>
                              </Magnetic>
                            ) : project.link ? (
                              <Magnetic strength={0.15} radius={100}>
                                <Link
                                  href={project.link}
                                  data-testid={`link-project-${project.id}`}
                                  className="inline-flex py-[14px] -my-[14px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone))] transition-colors hover:text-[hsl(var(--brand-signal))]"
                                >
                                  See the work →
                                </Link>
                              </Magnetic>
                            ) : (
                              /*
                                Four of the six cards used to land here and
                                render "private · no link", which dead-ended
                                the page and was not even accurate: a public
                                coding camp and a school club are not private.
                                Each now points at the page on this site that
                                substantiates it, so this branch is the
                                genuine no-evidence case only.
                              */
                              <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
                                no public link
                              </span>
                            )}
                          </div>
                        </div>
                      </motion.article>
                    </HoverShine>
                  </TiltCard>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {filteredProjects.length === 0 && (
              <motion.div
                key="empty-state"
                data-testid="text-no-projects"
                className="mt-16 rounded-lg border border-[hsl(var(--brand-iron))] p-12 text-center"
                initial={{ opacity: 0, scale: 0.95, filter: "blur(8px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.95, filter: "blur(8px)" }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="font-display text-2xl text-[hsl(var(--brand-bone))]">
                  No projects in this category.
                </div>
                <div className="mt-3 font-mono-tight text-[11px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                  try a different filter
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </CinematicLayout>
  );
}
