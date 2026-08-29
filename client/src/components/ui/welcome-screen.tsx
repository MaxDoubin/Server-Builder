import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Cpu, Eye, Hammer, Shield, Sparkles } from "lucide-react";
import { siteConfig } from "@/lib/siteConfig";

type StartMode = "build" | "explore";

const LIVE_MODULES = [
  {
    title: "Cybersecurity",
    subtitle: "Competition and credentials",
    lines: ["Top 1% NCL", "Cyber Skyline", "Security+ / Network+ / CCNA"],
  },
  {
    title: "Infrastructure",
    subtitle: "Home data center",
    lines: ["Enterprise networking", "Virtualization", "Large-scale storage"],
  },
  {
    title: "Leadership",
    subtitle: "School and community",
    lines: ["South CTA clubs", "Henderson commission", "Youth coding camps"],
  },
] as const;

export function WelcomeScreen({
  isVisible,
  onStart,
  defaultMode = "build",
}: {
  isVisible: boolean;
  onStart?: (mode: StartMode) => void;
  defaultMode?: StartMode;
}) {
  const [mode, setMode] = useState<StartMode>(defaultMode);
  const [showPanels, setShowPanels] = useState(false);

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode]);

  /*
    Gated on isVisible. The early return below is after the hooks, so this
    listener stayed bound to window for the whole life of the game page even
    once the gate was dismissed: every "e" the visitor typed kept flipping
    hidden state, and re-opening the gate showed panels nobody asked for.

    The target and modifier guards are the other half of the same defect. An
    unmodified single-letter shortcut on window fires while the caret is in a
    text field, so typing "e" anywhere on the page tripped it, and Ctrl/Cmd+E
    fired it alongside the browser's own shortcut.
  */
  useEffect(() => {
    if (!isVisible) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT"
      ) {
        return;
      }
      if (event.key.toLowerCase() === "e") {
        setShowPanels((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    /*
      Absolute, not fixed. This is the lab's entry gate and belongs to the
      scene box. Pinned to the viewport it covered the whole page including
      the briefing above it, so /game presented two competing entry screens
      and the briefing was never seen. In fullscreen the scene box is the
      viewport anyway, so that case is unchanged.
    */
    <div className="absolute inset-0 z-[100] overflow-hidden bg-[hsl(var(--brand-obsidian))] text-[hsl(var(--brand-bone))]">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 14% 18%, hsl(var(--brand-cyan) / 0.18), transparent 26%), radial-gradient(circle at 84% 16%, hsl(var(--brand-signal) / 0.16), transparent 22%), radial-gradient(circle at 50% 72%, hsl(var(--brand-cyan) / 0.08), transparent 34%), linear-gradient(180deg, rgba(2, 6, 23, 0.2) 0%, rgba(2, 6, 23, 0.64) 54%, rgba(2, 6, 23, 0.92) 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148, 163, 184, 0.22) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.18) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />
      <div className="absolute inset-0 scanline opacity-20" />
      <div
        aria-hidden
        className="absolute left-[10vw] top-[16vh] h-[48vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-cyan) / 0.48) 28%, transparent 100%)",
          boxShadow: "0 0 32px hsl(var(--brand-cyan) / 0.3)",
        }}
      />
      <div
        aria-hidden
        className="absolute right-[10vw] top-[22vh] h-[42vh] w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent 0%, hsl(var(--brand-signal) / 0.42) 32%, transparent 100%)",
          boxShadow: "0 0 32px hsl(var(--brand-signal) / 0.28)",
        }}
      />
      <div className="pointer-events-none absolute inset-x-[12vw] top-[34vh] h-[20vh] bg-[linear-gradient(180deg,transparent,hsl(var(--brand-cyan)/0.08),hsl(var(--brand-signal)/0.08),transparent)] blur-3xl" />

      <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-center px-6 py-10">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 rounded-full border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] px-4 py-2 font-techno text-[10px] uppercase tracking-[0.42em] text-[hsl(var(--brand-signal))] backdrop-blur-md">
              <span
                className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--brand-signal))]"
                style={{ boxShadow: "0 0 12px hsl(var(--brand-signal))" }}
              />
              Max Doubin Interactive Lab
            </div>

            <div className="max-w-4xl space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.12)] text-[hsl(var(--brand-bone))]">
                  South CTA
                </Badge>
                <Badge className="border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-bone)/0.06)] text-[hsl(var(--brand-bone-dim))]">
                  Top 1% NCL
                </Badge>
                <Badge className="border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.12)] text-[hsl(var(--brand-bone))]">
                  Blue Ribbon Commissioner
                </Badge>
              </div>

              <div className="space-y-3">
                {/*
                  h2, not h1. This gate renders inside the game page, which
                  already has its own h1 in the briefing above it, so this
                  gave the document two top-level headings.
                */}
                <h2 className="font-display text-[clamp(3rem,8vw,6.5rem)] font-medium leading-[0.92] tracking-[-0.05em] text-[hsl(var(--brand-bone))]">
                  {siteConfig.name}
                </h2>
                <p className="max-w-2xl font-mono-tight text-base text-[hsl(var(--brand-bone-dim))] sm:text-lg">
                  {siteConfig.tagline}
                </p>
                <p className="max-w-3xl text-sm leading-relaxed text-[hsl(var(--brand-ash))] sm:text-base">
                  Build opens the interactive data center experience. Explore presents a guided profile of Max Doubin's work in cybersecurity, enterprise networking, systems infrastructure, leadership, and music.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.86),hsl(var(--brand-obsidian)/0.8))] px-5 py-5 shadow-[0_30px_120px_-48px_rgba(0,0,0,0.82)] backdrop-blur-xl sm:px-6">
              <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--brand-signal)),transparent)] opacity-75" />
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="max-w-xl">
                  <div className="font-techno text-[10px] uppercase tracking-[0.36em] text-[hsl(var(--brand-signal))]">
                    Choose your entry point
                  </div>
                  <p className="mt-2 font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    Build opens the interactive rack and data center environment. Explore opens a guided presentation of credentials, projects, leadership, and technical work.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant={mode === "build" ? "default" : "ghost"}
                    onClick={() => {
                      setMode("build");
                      onStart?.("build");
                    }}
                    className={
                      mode === "build"
                        ? "border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.14)] text-[hsl(var(--brand-bone))]"
                        : "border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-bone)/0.04)] text-[hsl(var(--brand-bone-dim))]"
                    }
                  >
                    <Hammer className="mr-2 h-4 w-4" />
                    Build
                  </Button>
                  <Button
                    type="button"
                    variant={mode === "explore" ? "default" : "ghost"}
                    onClick={() => {
                      setMode("explore");
                      onStart?.("explore");
                    }}
                    className={
                      mode === "explore"
                        ? "border border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.14)] text-[hsl(var(--brand-bone))]"
                        : "border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-bone)/0.04)] text-[hsl(var(--brand-bone-dim))]"
                    }
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Explore
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    asChild
                    className="border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.08)] text-[hsl(var(--brand-bone))] hover:bg-[hsl(var(--brand-cyan)/0.14)]"
                  >
                    <Link href="/">Profile Home</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <InfoCard
              icon={<Shield className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />}
              title="Cybersecurity"
              body="Top 1 percent National Cyber League performance, active Cyber Skyline competition work, and continuing study toward Security+, Network+, and CCNA."
            />
            <InfoCard
              icon={<Cpu className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />}
              title="Infrastructure"
              body="A large home data center designed, built, and operated end to end: enterprise switching, virtualization, storage, and long-running systems operations."
            />
            <InfoCard
              icon={<Sparkles className="h-4 w-4 text-[hsl(var(--brand-cyan))]" />}
              title="Leadership & Music"
              body="Student leadership, public service, youth instruction, and Nevada percussion performance credentials alongside technical work."
            />
          </div>
        </div>

        {showPanels && (
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {LIVE_MODULES.map((module) => (
              <div
                key={module.title}
                className="overflow-hidden rounded-2xl border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.82),hsl(var(--brand-obsidian)/0.72))] p-4 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.8)] backdrop-blur-lg"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-techno text-[10px] uppercase tracking-[0.34em] text-[hsl(var(--brand-signal))]">
                      {module.title}
                    </div>
                    <div className="mt-1 text-sm text-[hsl(var(--brand-bone-dim))]">{module.subtitle}</div>
                  </div>
                  <Badge className="border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-cyan)/0.08)] text-[hsl(var(--brand-bone))]">
                    Live
                  </Badge>
                </div>

                <div className="space-y-3">
                  {module.lines.map((line, lineIndex) => (
                    <div key={line} className="space-y-2">
                      <div className="flex items-center justify-between font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        <span>{line}</span>
                        <span className="text-[hsl(var(--brand-bone-dim))]">Ready</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--brand-carbon))]">
                        <div
                          className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--brand-cyan)),hsl(var(--brand-signal)))] animate-pulse"
                          style={{ width: `${64 + lineIndex * 10}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="absolute right-6 top-1/2 z-20 -translate-y-1/2">
        {/*
          aria-expanded: the glyph flips between two chevrons, so the only cue
          that the panels are already open was visual and the button announced
          the same name in both states.

          The `before:` box is a pointer target only, no paint: the painted
          circle stays 40px, which is under the 44px minimum for a standalone
          touch control, so the hit area is grown around it instead.
        */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => setShowPanels((prev) => !prev)}
          aria-expanded={showPanels}
          className="relative h-10 w-10 rounded-full border border-[hsl(var(--brand-cyan)/0.35)] bg-[hsl(var(--brand-graphite)/0.64)] text-[hsl(var(--brand-bone))] shadow-[0_0_16px_hsl(var(--brand-cyan)/0.24)] before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
          aria-label="Toggle intro panels"
        >
          <span aria-hidden>{showPanels ? "⟨" : "⟩"}</span>
        </Button>
        <div className="mt-2 text-center font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-bone-dim))]">
          Press E
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[linear-gradient(180deg,hsl(var(--brand-graphite)/0.82),hsl(var(--brand-obsidian)/0.72))] p-4 backdrop-blur-lg">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <div className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
          {title}
        </div>
      </div>
      <p className="text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">{body}</p>
    </div>
  );
}
