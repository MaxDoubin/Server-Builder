import { useEffect, useRef, useState } from "react";
import { useScrollReveal } from "@/lib/motion/useScrollScene";

/**
 * TELEMETRY — Act 6
 *
 * NOC-style HUD overlay. Four live tiles animate sparklines + counters,
 * grouped as: Fabric · Thermal · Power · Availability.
 */

interface TileConfig {
  id: string;
  label: string;
  unit: string;
  color: string;
  base: number;
  variance: number;
  format?: (v: number) => string;
}

const TILES: TileConfig[] = [
  {
    id: "pps",
    label: "Fabric · PPS",
    unit: "M/s",
    color: "hsl(72 100% 50%)",
    base: 14.2,
    variance: 2.6,
    format: (v) => v.toFixed(2),
  },
  {
    id: "temp",
    label: "Thermal · Core",
    unit: "°C",
    color: "hsl(195 80% 64%)",
    base: 41.2,
    variance: 1.4,
    format: (v) => v.toFixed(1),
  },
  {
    id: "power",
    label: "Power · Draw",
    unit: "kW",
    color: "hsl(32 100% 55%)",
    base: 28.8,
    variance: 3.2,
    format: (v) => v.toFixed(1),
  },
  {
    id: "uptime",
    label: "Uptime",
    unit: "d",
    color: "hsl(72 100% 50%)",
    base: 642,
    variance: 0.01,
    format: (v) => Math.floor(v).toString(),
  },
];

function useSparklineSeries(length: number, base: number, variance: number) {
  const [series, setSeries] = useState<number[]>(() =>
    Array.from({ length }, () => base + (Math.random() - 0.5) * variance),
  );
  useEffect(() => {
    const id = window.setInterval(() => {
      setSeries((prev) => {
        const next = prev.slice(1);
        const last = prev[prev.length - 1];
        const drift = (Math.random() - 0.5) * variance * 0.18;
        const bounded = Math.max(base - variance * 1.4, Math.min(base + variance * 1.4, last + drift));
        next.push(bounded);
        return next;
      });
    }, 420);
    return () => window.clearInterval(id);
  }, [base, variance]);
  return series;
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length === 0) return null;
  const w = 220;
  const h = 52;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(max - min, 0.0001);
  const step = w / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(" L ")}`;
  const areaPath = `${path} L ${w},${h} L 0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-[52px] w-full" aria-hidden>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.38" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${color})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={w}
        cy={h - ((data[data.length - 1] - min) / range) * (h - 4) - 2}
        r={2.4}
        fill={color}
      />
    </svg>
  );
}

function TelemetryTile({ cfg }: { cfg: TileConfig }) {
  const series = useSparklineSeries(40, cfg.base, cfg.variance);
  const latest = series[series.length - 1];
  return (
    <div
      data-testid={`tile-telemetry-${cfg.id}`}
      className="group relative overflow-hidden rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/.5)] p-5 backdrop-blur-md"
    >
      <div className="scanline pointer-events-none absolute inset-0 opacity-15" />
      <div className="relative flex items-start justify-between">
        <div>
          <div className="font-techno text-[9px] uppercase tracking-[0.34em] text-[hsl(var(--brand-ash))]">
            {cfg.label}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className="font-display text-3xl font-medium tracking-tight text-[hsl(var(--brand-bone))] tabular-nums"
              style={{ color: cfg.color }}
            >
              {cfg.format ? cfg.format(latest) : latest.toFixed(2)}
            </span>
            <span className="font-mono-tight text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
              {cfg.unit}
            </span>
          </div>
        </div>
        <span
          className="h-[7px] w-[7px] rounded-full"
          style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}` }}
        />
      </div>
      <Sparkline data={series} color={cfg.color} />
      <div className="relative mt-3 flex items-center justify-between font-mono-tight text-[9px] uppercase tracking-[0.28em] text-[hsl(var(--brand-ash))]">
        <span>sample · 420ms</span>
        <span>window · 16s</span>
      </div>
    </div>
  );
}

export function TelemetryAct() {
  const rootRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  useScrollReveal(
    rootRef,
    ({ gsap }) => {
      gsap.from(titleRef.current, {
        opacity: 0,
        y: 30,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(subtitleRef.current, {
        opacity: 0,
        y: 20,
        duration: 0.8,
        ease: "power3.out",
        delay: 0.1,
        scrollTrigger: { trigger: rootRef.current, start: "top 75%", toggleActions: "play none none reverse" },
      });
      gsap.from(gridRef.current?.children ?? [], {
        opacity: 0,
        y: 40,
        duration: 0.9,
        stagger: 0.12,
        ease: "power3.out",
        scrollTrigger: { trigger: gridRef.current, start: "top 85%", toggleActions: "play none none reverse" },
      });
      gsap.from(stripRef.current?.children ?? [], {
        opacity: 0,
        y: 10,
        duration: 0.5,
        stagger: 0.06,
        ease: "power2.out",
        scrollTrigger: { trigger: stripRef.current, start: "top 90%", toggleActions: "play none none reverse" },
      });
    },
    [],
  );

  return (
    <section
      ref={rootRef as React.RefObject<HTMLElement>}
      data-scroll-scene="telemetry"
      data-testid="section-cinematic-telemetry"
      className="relative min-h-screen w-full overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6 py-[14vh] md:px-10"
    >
      {/* Background grid */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand-iron) / 0.25) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.25) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse at center top, black 40%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at center top, black 40%, transparent 80%)",
          opacity: 0.5,
        }}
      />
      <div className="absolute inset-x-0 top-0 hairline" />

      <div className="relative mx-auto max-w-[1200px]">
        <div className="flex items-center gap-3 font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-ash))]">
          <span>· Unit 06 · NOC</span>
          <span className="h-px w-10 bg-[hsl(var(--brand-iron))]" />
          <span className="text-[hsl(var(--brand-signal))]">LIVE</span>
        </div>
        <h2
          ref={titleRef}
          className="mt-6 max-w-[20ch] font-display text-[clamp(2.2rem,5.4vw,4.6rem)] font-medium leading-[1.02] tracking-[-0.025em] text-[hsl(var(--brand-bone))]"
        >
          If it isn't <span className="signal-text">measured,</span> it doesn't exist.
        </h2>
        <div
          ref={subtitleRef}
          className="mt-6 max-w-[56ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]"
        >
          A rack only earns trust when you can answer, at any hour: how many packets
          moved, how warm, how much power, how long up. These four tiles are what
          every NOC I run starts with.
        </div>

        <div ref={gridRef} className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {TILES.map((tile) => (
            <TelemetryTile key={tile.id} cfg={tile} />
          ))}
        </div>

        {/* Incident strip */}
        <div
          ref={stripRef}
          className="mt-10 flex flex-wrap items-center gap-x-10 gap-y-3 border-y border-[hsl(var(--brand-iron))] py-4 font-mono-tight text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))]"
        >
          <span className="flex items-center gap-2 text-[hsl(var(--brand-signal))]">
            <span
              className="h-[6px] w-[6px] rounded-full bg-[hsl(var(--brand-signal))]"
              style={{ boxShadow: "0 0 6px hsl(var(--brand-signal))" }}
            />
            green
          </span>
          <span>fabric · 14.2 M pps</span>
          <span>l2 · 0 errors</span>
          <span>bgp · 3 peers</span>
          <span>storage · 0 resilver</span>
          <span>snmp · ok</span>
          <span>alerts · 0 active</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 hairline" />
    </section>
  );
}
