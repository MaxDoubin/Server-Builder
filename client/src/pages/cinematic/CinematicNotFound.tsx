import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { useSEO } from "@/lib/useSEO";

export function CinematicNotFound() {
  useSEO({
    title: "404 · Signal Lost | Max Doubin",
    description: "The page you're looking for isn't on the wire. Head back to the home signal.",
    canonical: "https://maxdoubin.com/404",
    ogType: "website",
    // Every mistyped URL renders this page. Indexing it would put an error
    // page in the results for arbitrary paths.
    noindex: true,
  });

  return (
    <CinematicLayout skipPreloader>
      <section
        data-testid="section-cinematic-not-found"
        className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[hsl(var(--brand-obsidian))] px-6 text-center"
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--brand-iron) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand-iron) / 0.4) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 72%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 30%, transparent 72%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[60vw] w-[60vw] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle at center, hsl(var(--brand-signal) / 0.12), transparent 60%)",
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-8">
          <div
            className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]"
            style={{ textShadow: "0 0 14px hsl(var(--brand-signal) / 0.54)" }}
          >
            · Signal · Lost
          </div>

          <h1
            className="font-display text-[clamp(5rem,18vw,14rem)] font-medium leading-[0.9] tracking-[-0.04em] text-[hsl(var(--brand-bone))]"
            data-testid="text-404-code"
          >
            4<span className="signal-text">0</span>4
          </h1>

          <p className="max-w-[42ch] font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))] md:text-base">
            This rack isn't in the hall. The port may have been re-cabled, the
            path deprecated, or you followed a trace that ended mid-run.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              data-testid="link-404-home"
              className="inline-flex items-center gap-2 border border-[hsl(var(--brand-signal))] bg-[hsl(var(--brand-signal)/0.08)] px-6 py-3 font-mono-tight text-xs uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))] transition hover:bg-[hsl(var(--brand-signal)/0.18)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Return to signal
            </Link>
            <Link
              href="/projects"
              data-testid="link-404-projects"
              className="inline-flex items-center gap-2 border border-[hsl(var(--brand-iron))] px-6 py-3 font-mono-tight text-xs uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))] transition hover:border-[hsl(var(--brand-bone))] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-bone))]"
            >
              Browse projects
            </Link>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 font-mono-tight text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]">
          // trace · dropped · returning to main
        </div>
      </section>
    </CinematicLayout>
  );
}

export default CinematicNotFound;
