import { useRef } from "react";
import { useScrollReveal } from "@/lib/motion/useScrollScene";
import { PRESS } from "@/lib/siteConfig";

interface Pillar {
  id: string;
  eyebrow: string;
  title: string;
  lines: string[];
  accent: "signal" | "cyan";
}

const HOMELAB_DISCIPLINES: Array<{ label: string; value: string }> = [
  { value: "Networking", label: "Switching · VLANs · Routing" },
  { value: "Virtualization", label: "Hypervisors · Clustering" },
  { value: "Storage", label: "Arrays · Redundancy · Backup" },
  { value: "Operations", label: "Power · Cooling · Cabling" },
];

const PILLARS: Pillar[] = [
  {
    id: "cyber",
    eyebrow: "· 01 · Cybersecurity",
    title: "Competition, credentials, and applied practice.",
    accent: "signal",
    lines: [
      "Top 1% in National Cyber League competition",
      "Helped lead South CTA to a 7th-ranked school finish in the nation",
      "Active on Cyber Skyline across OSINT, cryptography, log analysis, hash cracking, network forensics, and web exploitation",
      "CompTIA Tech+ certified; Security+, Network+, and CCNA in progress",
    ],
  },
  {
    id: "leadership",
    eyebrow: "· 02 · Leadership",
    title: "School leadership, civic service, and instruction.",
    accent: "cyan",
    lines: [
      "President, South CTA Cyber Club",
      "President, South CTA Music Club (2026/2027)",
      "Blue Ribbon Commissioner, City of Henderson, Nevada",
      "Big Future Ambassador, College Board",
      "Youth Advisory Council Member, Nevada OWINN",
      "Lead Instructor for youth coding camps across the Las Vegas Valley",
    ],
  },
  {
    id: "music",
    eyebrow: "· 03 · Percussion",
    title: "Performance credentials alongside technical work.",
    accent: "signal",
    lines: [
      "Nevada All-State Band in 6th, 7th, and 9th grade",
      "Ranked #1 percussionist in Nevada in 2024",
    ],
  },
  {
    id: "academics",
    eyebrow: "· 04 · Academics",
    title: "Coursework in cybersecurity and computing.",
    accent: "cyan",
    lines: [
      "South Career Technical Academy, Las Vegas, Nevada",
      "PBS Varsity Quiz state finalist in 2026, on an all-freshman team",
      "AP Computer Science Principles and AP Human Geography",
      "CYBER.ORG coursework in Google Dorking, recon, ARP poisoning, and Wireshark or PCAP analysis",
      "Preferred languages: Python and JavaScript",
    ],
  },
];

export function BiographyAct() {
  const rootRef = useRef<HTMLElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLParagraphElement>(null);
  const pillarsRef = useRef<HTMLDivElement>(null);
  const homelabRef = useRef<HTMLDivElement>(null);
  const caltechRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<HTMLDivElement>(null);

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      const trigger = rootRef.current;
      const enter = { start: "top 80%", toggleActions: "play none none reverse" } as const;

      gsap.from(eyebrowRef.current, {
        opacity: 0,
        y: 14,
        duration: 0.7,
        ease: "power3.out",
        scrollTrigger: { trigger, ...enter },
      });
      gsap.from(leadRef.current, {
        opacity: 0,
        y: 28,
        duration: 1,
        ease: "power3.out",
        delay: 0.1,
        scrollTrigger: { trigger, ...enter },
      });
      gsap.from(pillarsRef.current?.children ?? [], {
        opacity: 0,
        y: 36,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out",
        scrollTrigger: { trigger: pillarsRef.current, start: "top 85%", toggleActions: "play none none reverse" },
      });
      gsap.from(homelabRef.current?.querySelectorAll<HTMLElement>("[data-spec]") ?? [], {
        opacity: 0,
        y: 18,
        duration: 0.6,
        stagger: 0.05,
        ease: "power3.out",
        scrollTrigger: { trigger: homelabRef.current, start: "top 85%", toggleActions: "play none none reverse" },
      });
      gsap.from(caltechRef.current, {
        opacity: 0,
        y: 30,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: caltechRef.current, start: "top 85%", toggleActions: "play none none reverse" },
      });
      gsap.from(pressRef.current, {
        opacity: 0,
        y: 26,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: { trigger: pressRef.current, start: "top 88%", toggleActions: "play none none reverse" },
      });
    },
    [],
  );

  return (
    <section
      ref={rootRef as React.RefObject<HTMLElement>}
      id="dossier"
      data-scroll-scene="biography"
      data-testid="section-cinematic-biography"
      className="relative overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6 py-[18vh] md:px-10"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 hairline" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron)) 1px, transparent 1px)",
          backgroundSize: "84px 84px",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 82%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 82%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[9vw] top-[10vh] h-[34vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-signal) / 0.35) 40%, transparent 100%)",
          boxShadow: "0 0 24px hsl(var(--brand-signal) / 0.22)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[9vw] top-[24vh] h-[30vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-cyan) / 0.32) 40%, transparent 100%)",
          boxShadow: "0 0 24px hsl(var(--brand-cyan) / 0.2)",
        }}
      />

      <div className="relative mx-auto max-w-[1200px]">
        <div
          ref={eyebrowRef}
          className="flex items-center gap-3 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]"
        >
          <span>· Dossier · Max Doubin</span>
          <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" />
          <span className="text-[hsl(var(--brand-signal))]">public profile</span>
        </div>

        <p
          ref={leadRef}
          className="mt-8 max-w-[56ch] font-display text-[clamp(1.8rem,4vw,3.2rem)] font-medium leading-[1.08] tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
        >
          Max Doubin is a 10th-grade cybersecurity student at South Career Technical Academy in Las Vegas, Nevada. His work spans enterprise networking, server infrastructure, competitive cybersecurity, percussion performance, and community leadership.
        </p>

        <div
          ref={pillarsRef}
          className="mt-20 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        >
          {PILLARS.map((p) => (
            <PillarCard key={p.id} pillar={p} />
          ))}
        </div>

        <div
          ref={homelabRef}
          className="relative mt-24 overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.4)] backdrop-blur-md"
        >
          <div className="scanline pointer-events-none absolute inset-0 opacity-20" />
          <div className="relative grid gap-0 md:grid-cols-12">
            <div className="border-b border-[hsl(var(--brand-iron))] p-8 md:col-span-5 md:border-b-0 md:border-r">
              <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
                · 05 · Home Data Center
              </div>
              <h3 className="mt-4 font-display text-[clamp(1.6rem,3.6vw,2.6rem)] font-medium leading-[1.05] tracking-[-0.02em] text-[hsl(var(--brand-bone))]">
                Infrastructure built and maintained
                <span className="signal-text"> at home.</span>
              </h3>
              <p className="mt-5 max-w-[40ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-sm">
                Max designed, built, and operates a large home data center. The work covers enterprise switching and segmentation, virtualization, large-scale storage, application delivery, and the power, cooling, and structured cabling planning that keeps it all running.
              </p>
            </div>
            <div className="p-8 md:col-span-7">
              <div className="grid grid-cols-2 gap-y-6 gap-x-8 md:grid-cols-2">
                {HOMELAB_DISCIPLINES.map((spec) => (
                  <div key={spec.value} data-spec className="flex flex-col gap-1">
                    <div className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-[1.75rem]">
                      {spec.value}
                    </div>
                    <div className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      {spec.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={caltechRef}
          className="mt-24 flex flex-col items-center gap-6 text-center"
        >
          <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
            · 07 · Academic Direction
          </div>
          <h3 className="max-w-[24ch] font-display text-[clamp(1.8rem,4.6vw,3rem)] font-medium leading-[1.02] tracking-[-0.03em] text-[hsl(var(--brand-bone))]">
            Caltech is the dream school.
            <span className="signal-text"> Long-term work points toward networking or systems engineering research.</span>
          </h3>
          <p className="max-w-[56ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            Current academic work includes AP Computer Science Principles, AP Human Geography, and cybersecurity coursework through CYBER.ORG. Long-term goals include advanced research in networking or systems engineering.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
            <span>South CTA</span>
            <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
            <span>AP Computer Science Principles</span>
            <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
            <span>AP Human Geography</span>
            <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
            <span>CYBER.ORG</span>
          </div>
        </div>

        <div ref={pressRef} className="mt-24">
          <div className="text-center font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
            · 08 · Press
          </div>
          <a
            href={PRESS.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-press-las-vegas-weekly"
            className="group mx-auto mt-6 block max-w-[64ch] border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.6)] p-6 backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-signal)/.55)] focus:outline-none focus-visible:border-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] md:p-8"
          >
            <div className="flex flex-wrap items-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
              <span className="text-[hsl(var(--brand-signal))]">{PRESS.outlet}</span>
              <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
              <time dateTime={PRESS.isoDate}>{PRESS.displayDate}</time>
              <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
              <span>By {PRESS.author}</span>
            </div>

            <h3 className="mt-4 font-display text-[clamp(1.4rem,3.2vw,2.2rem)] font-medium leading-[1.08] tracking-[-0.02em] text-[hsl(var(--brand-bone))]">
              {PRESS.headline}
            </h3>

            <blockquote className="mt-5 border-l border-[hsl(var(--brand-signal)/.5)] pl-4 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              “Most people don’t know what they want to do for work until their
              20s or 30s. South Career and Technical Academy student Max Doubin
              is an exception.”
            </blockquote>

            <p className="mt-4 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-sm">
              The Weekly’s back-to-school feature on CCSD career and technical
              academies opens on South CTA’s cybersecurity track, and notes
              leading the team to seventh in the nation at the National Cyber
              League in 2025.
            </p>

            <span className="mt-6 inline-flex items-center gap-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
              Read at lasvegasweekly.com
              <span
                aria-hidden
                className="transition-transform duration-300 group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </a>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 hairline" />
    </section>
  );
}

function PillarCard({ pillar }: { pillar: Pillar }) {
  const accentColor =
    pillar.accent === "signal" ? "hsl(var(--brand-signal))" : "hsl(var(--brand-cyan))";
  return (
    <div
      data-testid={`card-pillar-${pillar.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.45)] p-6 backdrop-blur-md transition-colors hover:border-[hsl(var(--brand-bone)/.4)]"
    >
      <div className="scanline pointer-events-none absolute inset-0 opacity-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${accentColor} 50%, transparent 100%)`,
          opacity: 0.5,
        }}
      />
      <div
        className="relative font-techno text-[9px] uppercase tracking-[0.42em]"
        style={{ color: accentColor, textShadow: `0 0 10px ${accentColor}55` }}
      >
        {pillar.eyebrow}
      </div>
      <h3 className="relative mt-3 font-display text-[1.5rem] font-medium leading-[1.08] tracking-tight text-[hsl(var(--brand-bone))]">
        {pillar.title}
      </h3>
      <ul className="relative mt-5 flex flex-col gap-2 font-mono-tight text-[12px] leading-snug text-[hsl(var(--brand-bone-dim))]">
        {pillar.lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-[0.45em] inline-block h-[4px] w-[4px] flex-shrink-0 rounded-full"
              style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

