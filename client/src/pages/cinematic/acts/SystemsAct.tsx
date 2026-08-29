import { Suspense, lazy, useRef, type ReactNode, type RefObject } from "react";
import { useScrollScene } from "@/lib/motion/useScrollScene";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { useHeavySceneAllowed } from "@/lib/motion/useHeavySceneAllowed";

const ContinuousRackScene = lazy(() =>
  import("@/components/cinematic/rack3d/ContinuousRackScene").then((m) => ({
    default: m.ContinuousRackScene,
  })),
);

function ScenePoster() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center"
    >
      <div
        className="relative h-[58vh] w-[230px] overflow-hidden rounded-md border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,#0a0d11_0%,#04050a_100%)]"
        style={{
          boxShadow:
            "0 60px 80px -40px rgba(0,0,0,0.9), inset 0 0 0 1px hsl(var(--brand-iron) / 0.4)",
        }}
      >
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="my-[2px] h-2 rounded-[2px] bg-[hsl(var(--brand-graphite))]"
            style={{ marginInline: "8px", opacity: 0.55 - (i % 3) * 0.1 }}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Beat copy                                                           */
/*                                                                     */
/* Shared by the scrubbed scene and the static fallback so the two     */
/* layouts can never drift apart on wording.                           */
/* ------------------------------------------------------------------ */

const EYEBROW_CLASS =
  "font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]";
const EYEBROW_STYLE = { textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" };
const BODY_CLASS =
  "font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-sm";
const RULE_CLASS = "h-px w-8 bg-[hsl(var(--brand-iron))]";

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className={EYEBROW_CLASS} style={EYEBROW_STYLE}>
      {children}
    </div>
  );
}

function HeroCopy() {
  return (
    <>
      <div
        className={EYEBROW_CLASS}
        style={{ textShadow: "0 0 14px hsl(var(--brand-signal) / 0.54)" }}
      >
        · Max Doubin · South CTA · Las Vegas
      </div>
      <h1 className="mt-6 max-w-[20ch] font-display text-[clamp(2.4rem,7vw,5.4rem)] font-medium leading-[0.95] tracking-[-0.03em] text-[hsl(var(--brand-bone))]">
        Max Doubin.
        <br />
        <span className="signal-text">Cybersecurity, networking, and systems.</span>
      </h1>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))] md:text-[11px]">
        <span>Top 1% · National Cyber League</span>
        <span className={RULE_CLASS} />
        <span>CompTIA Tech+ certified</span>
        <span className={RULE_CLASS} />
        <span>#1 percussionist · Nevada 2024</span>
        <span className={RULE_CLASS} />
        <span>Continue</span>
      </div>
    </>
  );
}

function LeadershipCopy() {
  return (
    <>
      <Eyebrow>· Leadership · Community</Eyebrow>
      <h2 className="mt-4 font-display text-[clamp(1.6rem,4.4vw,3.4rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
        Leadership across school,
        <br />
        <span className="signal-text">civic, and technical spaces.</span>
      </h2>
      <p className={`mt-5 max-w-[42ch] ${BODY_CLASS}`}>
        President of the South CTA Cyber Club and South CTA Music Club, Blue Ribbon Commissioner for the City of Henderson, Big Future Ambassador for College Board, OWINN Youth Advisory Council member, and lead instructor for youth coding camps across the Las Vegas Valley.
      </p>
    </>
  );
}

function CredentialsCopy({ alignRight = false }: { alignRight?: boolean }) {
  return (
    <>
      <Eyebrow>· Cybersecurity · Credentials</Eyebrow>
      <h2 className="mt-4 font-display text-[clamp(1.6rem,4.4vw,3.4rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
        Credentials supported by
        <br />
        <span className="signal-text">competition and practice.</span>
      </h2>
      <p
        className={`mt-5 max-w-[42ch] ${BODY_CLASS}${alignRight ? " md:ml-auto" : ""}`}
      >
        CompTIA Tech+ is complete. Security+, Network+, and Cisco CCNA are in progress. Competition work includes National Cyber League and Cyber Skyline across OSINT, cryptography, log analysis, hash cracking, network forensics, and web exploitation.
      </p>
    </>
  );
}

function InfrastructureCopy() {
  return (
    <>
      <Eyebrow>· Home Data Center · Infrastructure</Eyebrow>
      <h2 className="mt-3 max-w-[28ch] font-display text-[clamp(1.6rem,4.2vw,3.2rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
        A large-scale home data center
        <span className="signal-text"> built for serious systems work.</span>
      </h2>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))] md:text-[11px]">
        <span>Enterprise switching</span>
        <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
        <span>VLAN segmentation</span>
        <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
        <span>Virtualization</span>
        <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
        <span>Large-scale storage</span>
        <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
        <span>Application delivery</span>
        <span className="h-px w-6 bg-[hsl(var(--brand-iron))]" />
        <span>Power and cooling</span>
      </div>
    </>
  );
}

type CounterRefs = {
  rack: RefObject<HTMLSpanElement>;
  ram: RefObject<HTMLSpanElement>;
  u: RefObject<HTMLSpanElement>;
};

/**
 * The closing stat row. When the scroll scene drives it the numbers count
 * up from zero through the refs; the static fallback has nothing to drive
 * them, so it renders the settled values directly.
 */
function HighlightsCopy({ counters }: { counters?: CounterRefs }) {
  return (
    <>
      <Eyebrow>· Highlights · Verified</Eyebrow>
      <h2 className="mt-3 max-w-[28ch] text-center font-display text-[clamp(1.6rem,4.2vw,3.2rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]">
        Technical work,
        <br />
        <span className="signal-text">music, and public leadership.</span>
      </h2>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/.7)] px-4 py-3 backdrop-blur-md sm:gap-8 sm:px-8 md:gap-14">
        <Stat label="National Cyber League">
          Top <span ref={counters?.rack}>{counters ? "0" : "1"}</span>%
        </Stat>
        <Stat label="Team Rank · Nationally">
          #<span ref={counters?.ram}>{counters ? "0" : "7"}</span>
        </Stat>
        <Stat label="Percussionist · Nevada">
          #<span ref={counters?.u}>{counters ? "0" : "1"}</span>
        </Stat>
        <Stat label="All-State Band">
          <span className="text-[hsl(var(--brand-signal))]">3×</span>
        </Stat>
      </div>
    </>
  );
}

/**
 * Static, top-to-bottom rendering of the same five beats.
 *
 * The scrubbed version stacks every beat in one pinned viewport and
 * cross-fades between them on scroll. Under `prefers-reduced-motion` there
 * is no scrub to run, so that layout collapses to whichever beat the
 * timeline was left on and the other four -- the page's `h1` among them --
 * stay at `opacity: 0` with no way to reach them. This renders them as
 * ordinary flowed sections instead.
 */
function SystemsActStatic() {
  return (
    <section
      data-scroll-scene="systems"
      data-testid="section-cinematic-systems"
      className="relative w-full bg-[hsl(var(--brand-obsidian))]"
    >
      <div className="relative h-[62vh] w-full overflow-hidden">
        {/*
          The still poster, not the WebGL scene.

          Someone who has asked for reduced motion gets no scroll story here,
          so the canvas would render a single frame they cannot interact with
          while still pulling three.js and react-three-fiber (about 950 KB)
          and holding a GPU context open for the life of the page. The poster
          is the same silhouette in CSS. This is also the cheapest path for
          anyone on a machine that sets the preference for battery reasons.
        */}
        <ScenePoster />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 34%, hsl(var(--brand-obsidian)) 92%)",
          }}
        />
      </div>

      <div className="mx-auto flex max-w-[70ch] flex-col gap-[12vh] px-6 py-[12vh] md:px-10">
        <div className="flex flex-col items-center text-center">
          <HeroCopy />
        </div>
        <div className="text-left">
          <LeadershipCopy />
        </div>
        <div className="text-left">
          <CredentialsCopy />
        </div>
        <div className="flex flex-col items-center text-center">
          <InfrastructureCopy />
        </div>
        <div className="flex flex-col items-center">
          <HighlightsCopy />
        </div>
      </div>
    </section>
  );
}

export function SystemsAct() {
  const reducedMotion = useReducedMotion();
  const heavySceneAllowed = useHeavySceneAllowed();

  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef(0);

  const heroRef = useRef<HTMLDivElement>(null);
  const installRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef<HTMLDivElement>(null);
  const anatomyRef = useRef<HTMLDivElement>(null);
  const hallRef = useRef<HTMLDivElement>(null);

  const beatCounterRef = useRef<HTMLSpanElement>(null);
  const beatLabelRef = useRef<HTMLSpanElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const rackCountRef = useRef<HTMLSpanElement>(null!);
  const ramCountRef = useRef<HTMLSpanElement>(null!);
  const uCountRef = useRef<HTMLSpanElement>(null!);

  const vignetteRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /**
   * Push a 0..1 story position into everything the scene shows: the R3F rig,
   * the beat readout, and the progress bar.
   *
   * This lives outside the timeline on purpose. When it was only a tween's
   * onUpdate, a ScrollTrigger refresh (fired by the resize observer, a font
   * load, or a lazy section landing) could leave the timeline re-measured
   * without the callback having run, freezing the camera and the readout at
   * whatever the last scrubbed value happened to be. The trigger now calls
   * this on refresh too, so the scene always matches the scroll position.
   */
  const applyProgress = (raw: number) => {
    // onRefresh hands us whatever the trigger currently computes, which is
    // taken over distances the pin spacer is itself changing. Clamp rather
    // than trust it: everything downstream indexes beats off this number.
    const p = Math.max(0, Math.min(1, raw));
    progressRef.current = p;
    const beat =
      p < 0.14 ? { n: "01", l: "Profile" }
      : p < 0.38 ? { n: "02", l: "Leadership" }
      : p < 0.58 ? { n: "03", l: "Cybersecurity" }
      : p < 0.80 ? { n: "04", l: "Infrastructure" }
      : p < 0.90 ? { n: "05", l: "Hardware" }
      : { n: "06", l: "Highlights" };
    if (beatCounterRef.current) beatCounterRef.current.textContent = beat.n;
    if (beatLabelRef.current) beatLabelRef.current.textContent = beat.l;
    if (progressBarRef.current) {
      progressBarRef.current.style.transform = `scaleX(${p})`;
    }
  };

  useScrollScene(
    rootRef,
    ({ gsap, timeline }) => {
      // The static layout already shows every beat; running the builder
      // here would re-apply the cross-fade opacities and hide them again.
      if (reducedMotion) return;

      gsap.set([installRef.current, pullRef.current, anatomyRef.current, hallRef.current], {
        opacity: 0,
        y: 18,
      });
      gsap.set(heroRef.current, { opacity: 1, y: 0 });
      gsap.set(vignetteRef.current, { opacity: 0.7 });
      gsap.set(gridRef.current, { opacity: 0.16 });

      const fadeIn = (el: Element | null, at: number) => {
        if (!el) return;
        timeline.to(el, { opacity: 1, y: 0, duration: 0.06 }, at);
      };
      const fadeOut = (el: Element | null, at: number) => {
        if (!el) return;
        timeline.to(el, { opacity: 0, y: -14, duration: 0.06 }, at);
      };

      fadeOut(heroRef.current, 0.13);
      fadeIn(installRef.current, 0.16);

      fadeOut(installRef.current, 0.36);
      fadeIn(pullRef.current, 0.40);

      fadeOut(pullRef.current, 0.54);
      fadeIn(anatomyRef.current, 0.58);

      fadeOut(anatomyRef.current, 0.80);
      fadeIn(hallRef.current, 0.90);

      timeline.to(vignetteRef.current, { opacity: 0.4, duration: 0.1 }, 0.90);
      timeline.to(gridRef.current, { opacity: 0.06, duration: 0.1 }, 0.90);

      // Counts up to the settled values shown in HighlightsCopy.
      const countUp = (
        to: number,
        ref: React.RefObject<HTMLSpanElement>,
      ) => {
        const target = { v: 0 };
        timeline.to(
          target,
          {
            v: to,
            duration: 0.1,
            onUpdate: () => {
              if (ref.current) {
                ref.current.textContent = Math.round(target.v).toString();
              }
            },
          },
          0.90,
        );
      };
      countUp(1, rackCountRef);
      countUp(7, ramCountRef);
      countUp(1, uCountRef);

      const proxy = { p: 0 };
      timeline.to(
        proxy,
        {
          p: 1,
          duration: 1,
          ease: "none",
          onUpdate: () => applyProgress(proxy.p),
        },
        0,
      );
    },
    [reducedMotion],
    {
      end: "+=900%",
      pin: true,
      scrub: 0.85,
      onRefresh: (self: { progress: number }) => applyProgress(self.progress),
    },
  );

  /*
    The static beats also stand in for a visitor on Save-Data or a 2g class
    connection, who would otherwise wait on 804 KB of WebGL. The scene is
    behind `lazy()`, so returning here means the chunk is never requested.
  */
  if (!heavySceneAllowed) return <SystemsActStatic />;

  return (
    <section
      ref={rootRef}
      data-scroll-scene="systems"
      data-testid="section-cinematic-systems"
      className="relative h-screen w-full overflow-hidden bg-[hsl(var(--brand-obsidian))]"
    >
      <div
        ref={gridRef}
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.4) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 78%)",
        }}
      />

      <div className="absolute inset-0">
        <Suspense fallback={<ScenePoster />}>
          <ContinuousRackScene progressRef={progressRef} />
        </Suspense>
      </div>

      <div
        ref={vignetteRef}
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 28%, hsl(var(--brand-obsidian)) 88%)",
        }}
      />

      <div className="pointer-events-none absolute left-6 top-24 z-20 flex items-baseline gap-4 font-mono-tight md:left-10 md:top-28">
        <span
          className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
          style={{ textShadow: "0 0 12px hsl(var(--brand-signal) / 0.5)" }}
        >
          · Unit
        </span>
        <span ref={beatCounterRef} className="font-display text-xl text-[hsl(var(--brand-bone))]">
          01
        </span>
        <span ref={beatLabelRef} className="text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone-dim))]">
          Profile
        </span>
      </div>

      <div className="pointer-events-none absolute right-6 top-24 z-20 hidden flex-col items-end gap-1 font-mono-tight text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--brand-ash))] md:flex md:right-10 md:top-28">
        <span>South CTA · Las Vegas</span>
        <span>cybersecurity · networking</span>
        <span>signal · verified</span>
      </div>

      <div
        ref={heroRef}
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-center px-6 pb-[11vh] text-center"
      >
        <HeroCopy />
      </div>

      <div
        ref={installRef}
        className="pointer-events-none absolute inset-x-6 bottom-[14vh] z-10 max-w-[30ch] text-left md:inset-x-auto md:left-12 md:max-w-[38ch]"
      >
        <LeadershipCopy />
      </div>

      <div
        ref={pullRef}
        className="pointer-events-none absolute inset-x-6 bottom-[14vh] z-10 max-w-[30ch] text-left md:inset-x-auto md:right-12 md:max-w-[38ch] md:text-right"
      >
        <CredentialsCopy alignRight />
      </div>

      <div
        ref={anatomyRef}
        className="pointer-events-none absolute inset-x-0 top-[16vh] z-10 flex flex-col items-center px-6 text-center md:top-[20vh]"
      >
        <InfrastructureCopy />
      </div>

      <div
        ref={hallRef}
        className="pointer-events-none absolute inset-x-0 bottom-10 z-10 flex flex-col items-center px-4 md:bottom-16"
      >
        <HighlightsCopy
          counters={{ rack: rackCountRef, ram: ramCountRef, u: uCountRef }}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-6 bottom-3 z-10 h-px bg-[hsl(var(--brand-iron))] md:inset-x-10">
        <div
          ref={progressBarRef}
          className="h-full origin-left bg-[hsl(var(--brand-signal))]"
          style={{
            transform: "scaleX(0)",
            boxShadow: "0 0 10px hsl(var(--brand-signal))",
          }}
        />
      </div>
    </section>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="font-display text-2xl font-medium tracking-tight text-[hsl(var(--brand-bone))] md:text-3xl">
        {children}
      </div>
      <div className="font-mono-tight text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
        {label}
      </div>
    </div>
  );
}
