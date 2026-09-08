/**
 * One thing from every practise surface, chosen by the date.
 *
 * The site has more than a dozen places to practise and a reader arriving at
 * the hub has to choose between them before they have done anything. This
 * removes that choice for anyone who does not want it: one item from each,
 * picked by the day, the same set for everybody, gone tomorrow.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PractiseStage } from "@/components/practise/PractiseStage";
import { useSEO } from "@/lib/useSEO";
import { cycleDays, dayNumber, picksFor } from "@/lib/today/index";
import { readProgress, recordVisit, type Line } from "@/lib/today/progress";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

const DATE = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function CinematicToday() {
  useSEO({
    title: "Today | Max Doubin",
    description:
      "One thing from every practise surface, chosen by the date and the same for everybody: an incident to decide, a host to diagnose, a capture to read, a flag to find, a message to judge, a chain to reorder, a name to resolve, a certificate to attribute, a block to divide and a slow transfer to explain.",
    canonical: `${SITE_URL}/today`,
  });

  const day = dayNumber();
  const picks = useMemo(() => picksFor(day), [day]);

  const [progress, setProgress] = useState<Line[]>([]);
  const [visits, setVisits] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProgress(readProgress());
    setVisits(recordVisit(day));
    setMounted(true);
  }, [day]);

  const done = progress.reduce((sum, line) => sum + line.done, 0);
  const total = progress.reduce((sum, line) => sum + line.total, 0);

  return (
    <CinematicLayout>
      <PractiseStage accent="signal" mood="calm" flashKey={0} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[940px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {DATE.format(new Date())}
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              Today.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              One thing from each of the {picks.length} practise surfaces, chosen by the date. The
              same {picks.length} for everybody, and different tomorrow.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The selection is a rotation rather than a shuffle, so each surface walks through
              everything it has before repeating any of it. Nothing is stored and nothing is
              fetched: the date is the whole of the state, which is also why a link to this page
              still shows today's set when you open it twice.
            </p>
          </header>

          <ol className="mt-11 grid gap-4 sm:grid-cols-2">
            {picks.map((pick, index) => (
              <li key={pick.surface}>
                <Link
                  href={pick.href}
                  data-testid={`today-${pick.surface}`}
                  className="flex h-full flex-col rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-5 transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:bg-[hsl(var(--brand-signal)/0.04)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
                      · {pick.eyebrow}
                    </span>
                    <span className="font-mono-tight text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))]">
                      {String(index + 1).padStart(2, "0")} of {picks.length}
                    </span>
                  </span>
                  <span className="mt-2 font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                    {pick.title}
                  </span>
                  <span className="mt-2 flex-1 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                    {pick.blurb}
                  </span>
                  <span className="mt-4 font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                    1 of {pick.outOf} in {pick.surface}
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <section className="mt-12">
            <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · Where you are
            </h2>
            <p className="mt-3 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
              Read from what each surface already records in this browser, so this cannot disagree
              with the page it is summarising. Clearing site data clears it, and it has never left
              the machine you are on.
            </p>
            <ul className="mt-5 space-y-2.5" data-testid="today-progress">
              {(mounted ? progress : []).map((line) => (
                <li key={line.href}>
                  <Link
                    href={line.href}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono-tight text-[13px] text-[hsl(var(--brand-bone-dim))] hover:text-[hsl(var(--brand-bone))]"
                  >
                    <span className="min-w-[150px]">{line.label}</span>
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-[hsl(var(--brand-iron))]"
                    >
                      <span
                        className="block h-full rounded-full bg-[hsl(var(--brand-signal))]"
                        style={{
                          width: `${line.total === 0 ? 0 : Math.round((line.done / line.total) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="text-[11.5px] text-[hsl(var(--brand-ash))]">
                      {line.done} of {line.total} {line.noun}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p
              className="mt-5 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
              aria-live="polite"
              data-testid="today-summary"
            >
              {mounted ? `${done} of ${total} across everything` : " "}
              {mounted && visits > 1 ? ` · ${visits} ${pluralise(visits, "day")} here` : ""}
            </p>
            {mounted && visits > 1 ? (
              <p className="mt-2 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
                A count, not a streak. Nothing resets if you miss a day, because a number that
                punishes you for having a life is not a number worth keeping.
              </p>
            ) : null}
          </section>

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The full set repeats every {cycleDays().toLocaleString()} days, which is the least
            common multiple of the surface sizes rather than a design goal. Individually each
            surface comes round much sooner: the shortest is a few days and the longest is a few
            weeks.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            To choose for yourself instead, the{" "}
            <Link
              href="/practise"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              practise hub
            </Link>{" "}
            has all of it with what each one is for.
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
