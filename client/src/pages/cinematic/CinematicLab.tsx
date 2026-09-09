/**
 * One lab: a brief, a terminal, hints, and a check.
 *
 * The check is a button rather than something that fires on every command,
 * because a lab that congratulates you the instant a predicate happens to go
 * true takes away the moment where you decide you have finished. It also
 * makes the predicate's behavior legible: you asked, it answered.
 *
 * Hints are opened one at a time and stay open. Nothing is scored, so there
 * is no reason to make taking a hint feel expensive, and a hint the reader
 * refuses to open because it might cost them something is a hint that does
 * not exist.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { Terminal } from "@/components/labs/Terminal";
import { useSEO } from "@/lib/useSEO";
import { getLab } from "@/lib/labs/labs";
import { recordSolved } from "@/lib/labs/progress";
import { CinematicNotFound } from "@/pages/cinematic/CinematicNotFound";
import type { Machine } from "@/lib/labs/machine";
import type { Lab } from "@/lib/labs/labs";

const SITE_URL = "https://maxdoubin.com";

export function CinematicLab() {
  const [, params] = useRoute("/labs/:slug");
  const lab = params?.slug ? getLab(params.slug) : undefined;

  useSEO({
    title: lab ? `${lab.title} | Labs | Max Doubin` : "Lab not found",
    description: lab ? lab.tagline : "",
    canonical: lab ? `${SITE_URL}/labs/${lab.slug}` : `${SITE_URL}/labs`,
    noindex: !lab,
  });

  if (!lab) return <CinematicNotFound />;
  return <LabView key={lab.slug} lab={lab} />;
}

function LabView({ lab }: { lab: Lab }) {
  const [run, setRun] = useState(0);
  const machineRef = useRef<Machine>(lab.build());
  const [hintsOpen, setHintsOpen] = useState(0);
  const [checked, setChecked] = useState<null | boolean>(null);
  const [solved, setSolved] = useState(false);
  const [commandCount, setCommandCount] = useState(0);

  /* A restart is a new machine, not a cleared screen. */
  const restart = useCallback(() => {
    machineRef.current = lab.build();
    setChecked(null);
    setSolved(false);
    setCommandCount(0);
    setRun((n) => n + 1);
  }, [lab]);

  const check = useCallback(() => {
    const ok = lab.solved(machineRef.current);
    setChecked(ok);
    if (ok && !solved) {
      setSolved(true);
      recordSolved(lab.slug);
    }
  }, [lab, solved]);

  const banner = useMemo(
    () => [
      `Simulated ${machineRef.current.hostname}. Nothing here touches a real machine.`,
      `Type 'help' for the commands this shell knows, or 'man NAME' for one of them.`,
      "",
    ],
    [run],
  );

  return (
    <CinematicLayout>
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[900px]">
          <Link
            href="/labs"
            className="inline-flex min-h-[36px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
          >
            ← All labs
          </Link>

          <header className="mt-6">
            <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Lab · {lab.difficulty}
            </div>
            <h1 className="mt-4 font-display text-[clamp(1.8rem,4.5vw,3rem)] font-medium leading-[1.02] tracking-[-0.035em] text-[hsl(var(--brand-bone))]">
              {lab.title}
            </h1>
          </header>

          <div className="mt-7 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · The brief
            </h2>
            {lab.brief.map((paragraph, index) => (
              <p
                key={index}
                className="mt-4 font-mono-tight text-[14px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
              >
                {paragraph}
              </p>
            ))}
          </div>

          <div className="mt-6">
            <Terminal
              key={run}
              machine={machineRef.current}
              banner={banner}
              onCommand={() => setCommandCount((n) => n + 1)}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={check}
              data-testid="button-check"
              className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              Check
            </button>
            <button
              type="button"
              onClick={restart}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-5 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
            >
              Restart the machine
            </button>
            <span className="font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              {commandCount} command{commandCount === 1 ? "" : "s"} run
            </span>
          </div>

          <div aria-live="polite">
            {checked === false ? (
              <p
                className="mt-4 rounded-xl border border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.07)] px-4 py-3 font-mono-tight text-[13px] text-[hsl(var(--brand-bone-dim))]"
                data-testid="check-not-yet"
              >
                Not yet. Nothing is scored, so try something else, or open a hint.
              </p>
            ) : null}
            {checked === true ? (
              <div
                className="mt-6 rounded-2xl border border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.06)] p-6"
                data-testid="check-solved"
              >
                <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                  · Solved
                </h2>
                {lab.debrief.map((paragraph, index) => (
                  <p
                    key={index}
                    className="mt-4 font-mono-tight text-[14px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          <section className="mt-10">
            <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Hints, {hintsOpen} of {lab.hints.length} open
            </h2>
            <ol className="mt-4 space-y-3">
              {lab.hints.slice(0, hintsOpen).map((hint, index) => (
                <li
                  key={index}
                  className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] px-4 py-3 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  {hint}
                </li>
              ))}
            </ol>
            {hintsOpen < lab.hints.length ? (
              <button
                type="button"
                onClick={() => setHintsOpen((n) => n + 1)}
                data-testid="button-hint"
                className="mt-4 inline-flex min-h-[36px] items-center font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
              >
                Open hint {hintsOpen + 1}
              </button>
            ) : null}
          </section>

          {lab.reading?.length ? (
            <section className="mt-10">
              <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                · The written version
              </h2>
              <ul className="mt-4 space-y-2">
                {lab.reading.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone-dim))] underline decoration-[hsl(var(--brand-iron))] underline-offset-4 transition-colors hover:text-[hsl(var(--brand-bone))] hover:decoration-[hsl(var(--brand-signal))]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </CinematicLayout>
  );
}
