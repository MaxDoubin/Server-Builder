import { useRef } from "react";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

/**
 * BIOGRAPHY — Max Doubin, spelled out.
 *
 * A dossier-style editorial panel. Lives between the rack cinematic
 * (SystemsAct) and the live telemetry (TelemetryAct). Four pillars —
 * cybersecurity, certifications, leadership, music — plus a featured
 * "No Service" art piece and the Caltech pillar at the bottom.
 */

interface Pillar {
  id: string;
  eyebrow: string;
  title: string;
  lines: string[];
  accent: "signal" | "cyan";
}

const PILLARS: Pillar[] = [
  {
    id: "cyber",
    eyebrow: "· 01 · Cybersecurity",
    title: "Top 1% nationally.",
    accent: "signal",
    lines: [
      "National Cyber League · top 1% individual",
      "School placed 7th in the country",
      "Student of the Month · South CTA Las Vegas",
      "Red-team / blue-team, both sides of the table",
    ],
  },
  {
    id: "certs",
    eyebrow: "· 02 · Certifications",
    title: "Paper that matches the practice.",
    accent: "cyan",
    lines: [
      "CompTIA Tech+ · FC0-U71 · sealed",
      "CompTIA Security+ · in progress",
      "CompTIA Network+ · in progress",
      "Cisco CCNA · in progress",
    ],
  },
  {
    id: "leadership",
    eyebrow: "· 03 · Leadership",
    title: "Six chairs, one teenager.",
    accent: "signal",
    lines: [
      "Blue Ribbon Commissioner · City of Henderson",
      "Big Future Ambassador · College Board",
      "Nevada OWINN · Youth Advisory Council",
      "President · Cyber Club & Music Club",
      "Lead Instructor · Youth Coding Camps",
      "Past President · NJHS Pinecrest Inspirada",
    ],
  },
  {
    id: "music",
    eyebrow: "· 04 · Percussion",
    title: "#1 in Nevada, 2024.",
    accent: "cyan",
    lines: [
      "Nevada All-State Band · 6th / 7th / 9th grade",
      "#1 percussionist · State of Nevada · 2024",
      "Published composer & arranger",
      "President · Music Club",
    ],
  },
];

const HOMELAB_SPECS: Array<{ label: string; value: string }> = [
  { label: "Dell PowerEdge", value: "10" },
  { label: "DAS arrays", value: "50+" },
  { label: "Total RAM", value: "3 TB" },
  { label: "Storage", value: "Petabytes" },
  { label: "Cisco Catalyst 3650", value: "8" },
  { label: "Load balancer", value: "Radware" },
  { label: "Cabinet", value: "42U · glass door" },
  { label: "Location", value: "Home · Las Vegas" },
];

export function BiographyAct() {
  const rootRef = useRef<HTMLElement>(null);
  const eyebrowRef = useRef<HTMLDivElement>(null);
  const leadRef = useRef<HTMLParagraphElement>(null);
  const pillarsRef = useRef<HTMLDivElement>(null);
  const homelabRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const caltechRef = useRef<HTMLDivElement>(null);

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
      gsap.from(artRef.current, {
        opacity: 0,
        y: 40,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: artRef.current, start: "top 80%", toggleActions: "play none none reverse" },
      });
      gsap.from(caltechRef.current, {
        opacity: 0,
        y: 30,
        duration: 0.9,
        ease: "power3.out",
        scrollTrigger: { trigger: caltechRef.current, start: "top 85%", toggleActions: "play none none reverse" },
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
      {/* Hairline + faint grid + vertical accents */}
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
        {/* Lead */}
        <div
          ref={eyebrowRef}
          className="flex items-center gap-3 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]"
        >
          <span>· Dossier · Max Doubin</span>
          <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" />
          <span className="text-[hsl(var(--brand-signal))]">classified · public</span>
        </div>

        <p
          ref={leadRef}
          className="mt-8 max-w-[48ch] font-display text-[clamp(1.8rem,4vw,3.2rem)] font-medium leading-[1.08] tracking-[-0.02em] text-[hsl(var(--brand-bone))]"
        >
          Max Doubin is a nationally recognized cybersecurity competitor,
          certified IT professional, and award-winning percussionist who has
          built a reputation most professionals chase for decades. He is{" "}
          <span className="signal-text">fifteen years old.</span>
        </p>

        {/* Four pillars */}
        <div
          ref={pillarsRef}
          className="mt-20 grid gap-4 md:grid-cols-2 lg:grid-cols-4"
        >
          {PILLARS.map((p) => (
            <PillarCard key={p.id} pillar={p} />
          ))}
        </div>

        {/* Homelab spec block */}
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
                Most kids get a <span className="signal-text">gaming PC.</span>
              </h3>
              <p className="mt-5 max-w-[38ch] font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-sm">
                I built a production data center in my house. Ten Dell PowerEdge
                servers, fifty-plus direct-attached storage arrays, petabytes
                online, three terabytes of RAM, eight Cisco Catalyst 3650
                switches, a Radware load balancer, all in one 42U glass-door
                cabinet. It runs twenty-four hours a day, and it answers to me.
              </p>
            </div>
            <div className="p-8 md:col-span-7">
              <div className="grid grid-cols-2 gap-y-6 gap-x-8 md:grid-cols-2">
                {HOMELAB_SPECS.map((spec) => (
                  <div key={spec.label} data-spec className="flex flex-col gap-1">
                    <div className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-[2rem]">
                      {spec.value}
                    </div>
                    <div className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
                      {spec.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* No Service art installation */}
        <div
          ref={artRef}
          className="relative mt-24 overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[linear-gradient(135deg,hsl(var(--brand-graphite)/.5)_0%,hsl(var(--brand-obsidian)/.8)_100%)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-[hsl(var(--brand-signal)/.6)] to-transparent"
            style={{ boxShadow: "0 0 12px hsl(var(--brand-signal) / 0.7)" }}
          />
          <div className="grid gap-0 md:grid-cols-12">
            <div className="p-10 md:col-span-7">
              <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-cyan))]">
                · 06 · Featured Work · Art
              </div>
              <h3 className="mt-4 font-display text-[clamp(1.8rem,4.2vw,3rem)] font-medium leading-[1.04] tracking-[-0.02em] text-[hsl(var(--brand-bone))]">
                "No Service."
                <br />
                <span style={{ color: "hsl(var(--brand-cyan))" }}>
                  Two hundred phones,
                </span>{" "}
                one question.
              </h3>
              <p className="mt-5 max-w-[54ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                A mixed-media installation: two hundred decommissioned phones
                arranged as a single sculptural wall, each screen dark, each
                speaker silent. The piece asks what it means to be a generation
                raised by the network, then abandoned by it. Cybersecurity is
                the day job — this is the other half of the brain.
              </p>
            </div>
            <div className="relative flex items-center justify-center border-t border-[hsl(var(--brand-iron))] p-10 md:col-span-5 md:border-l md:border-t-0">
              <PhoneGrid />
            </div>
          </div>
        </div>

        {/* Caltech pillar */}
        <div
          ref={caltechRef}
          className="mt-24 flex flex-col items-center gap-6 text-center"
        >
          <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
            · 07 · Long game
          </div>
          <h3 className="max-w-[20ch] font-display text-[clamp(2.2rem,6vw,4.8rem)] font-medium leading-[0.98] tracking-[-0.03em] text-[hsl(var(--brand-bone))]">
            Caltech. <span className="signal-text">Then a PhD.</span>
          </h3>
          <p className="max-w-[52ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
            The plan is cybersecurity research at the doctorate level. The
            receipts so far suggest that the plan is on schedule.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
            <span>Class of 2029</span>
            <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
            <span>South CTA · Las Vegas</span>
            <span className="h-px w-8 bg-[hsl(var(--brand-iron))]" />
            <span className="text-[hsl(var(--brand-signal))]">trajectory · locked</span>
          </div>
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

function PhoneGrid() {
  // Visual proxy for the art piece: 200 tiny dark phone rectangles in a grid.
  const cells = Array.from({ length: 200 });
  return (
    <div
      aria-hidden
      className="grid aspect-[4/5] w-full max-w-[260px] gap-[2px]"
      style={{ gridTemplateColumns: "repeat(10, minmax(0, 1fr))" }}
    >
      {cells.map((_, i) => (
        <div
          key={i}
          className="rounded-[2px] border border-[hsl(var(--brand-iron)/.6)] bg-[hsl(var(--brand-obsidian))]"
          style={{
            boxShadow:
              i % 47 === 3
                ? "inset 0 0 4px hsl(var(--brand-cyan) / 0.5)"
                : "inset 0 0 2px rgba(0,0,0,0.6)",
          }}
        />
      ))}
    </div>
  );
}
