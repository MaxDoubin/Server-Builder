/**
 * You do not have backups. You have restores, and you have not tested them.
 *
 * The page puts the copies in a row and then runs the incident across them,
 * and the thing worth watching is how many go dark. A posture that passes an
 * audit on Thursday has three copies; the same posture on Friday has none,
 * and the field that decided it was visible in the configuration the whole
 * time.
 *
 * Two scenarios here differ in exactly one boolean. Reading them back to
 * back is the argument: immutability is not another copy, it is the only
 * property that ever mattered.
 */

import { useCallback, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { useSEO } from "@/lib/useSEO";
import {
  SCENARIOS,
  assessAll,
  best,
  domains,
  duration,
  hoursToMove,
  type Incident,
  type Medium,
  type Scenario,
} from "@/lib/restore/index";
import { pluralise } from "@/lib/plural";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";

const SITE_URL = "https://maxdoubin.com";

const INCIDENT_LABEL: Record<Incident, string> = {
  "array-failure": "The array failed",
  ransomware: "Ransomware",
  "accidental-delete": "Somebody deleted it",
  "silent-corruption": "Silent corruption",
  "site-loss": "The site is gone",
};

const MEDIUM_LABEL: Record<Medium, string> = {
  snapshot: "snapshot",
  disk: "disk",
  object: "object store",
  cold: "cold archive",
  tape: "tape",
};

export function CinematicRestore() {
  useSEO({
    title: "You Have Backups, Not Restores | Max Doubin",
    description:
      "Every organization that lost data had backups. Six incidents, each with a backup posture that would pass an audit, and between zero and one copy that turns out to be worth anything.",
    canonical: `${SITE_URL}/restore`,
  });

  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [revealed, setRevealed] = useState(false);

  const choose = useCallback((next: Scenario) => {
    setScenario(next);
    setRevealed(false);
  }, []);

  const rows = useMemo(() => assessAll(scenario), [scenario]);
  const chosen = useMemo(() => best(scenario), [scenario]);
  const lost = rows.filter((row) => !row.verdict.usable).length;
  const spread = useMemo(() => domains(scenario.copies), [scenario]);

  const accent: StageAccent = !revealed ? "signal" : chosen === null ? "danger" : lost > 0 ? "amber" : "signal";

  return (
    <CinematicLayout>
      <PracticeStage
        accent={accent}
        mood={!revealed ? "calm" : chosen === null ? "critical" : "recovering"}
        flashKey={0}
      />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[980px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {SCENARIOS.length} incidents
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              You have backups, not restores.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every organisation that lost data had backups. That is not a paradox and it is not
              carelessness: a backup is a job that reports success, and a restore is a thing nobody
              does until the worst day of the year. The gap between the two is where the losses
              live.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Each of these would pass an audit. The job runs, the report is green, the retention
              meets the policy, and there are three copies. Read the posture, decide which copies
              you would actually be able to use, then run the incident.
            </p>
          </header>

          <div className="mt-11 flex flex-wrap gap-2">
            {SCENARIOS.map((item) => (
              <button
                key={item.slug}
                type="button"
                onClick={() => choose(item)}
                aria-pressed={scenario.slug === item.slug}
                data-testid={`scenario-${item.slug}`}
                className={`rounded-full border px-4 py-2 text-left font-mono-tight text-[11.5px] transition-colors ${
                  scenario.slug === item.slug
                    ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                    : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:text-[hsl(var(--brand-bone))]"
                }`}
              >
                {item.name}
              </button>
            ))}
          </div>

          <section className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                {scenario.name}
              </h2>
              <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-danger))]">
                {INCIDENT_LABEL[scenario.incident]}
              </span>
            </div>
            <p className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="brief">
              {scenario.brief}
            </p>

            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-1 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))]">
              <li>{scenario.gigabytes.toLocaleString()} GB to restore</li>
              <li>noticed after {duration(scenario.detectionHours)}</li>
              <li>{duration(scenario.rebuildHours)} of rebuild on top</li>
              <li data-testid="domains">
                {spread} independent failure {pluralise(spread, "domain")}
              </li>
            </ul>

            <ul className="mt-6 space-y-2" data-testid="copies">
              {rows.map(({ copy, verdict, index }) => {
                const isChoice = revealed && chosen?.index === index;
                return (
                  <li
                    key={copy.name}
                    data-testid={`copy-${index}`}
                    className={`rounded-xl border px-4 py-3 transition-colors ${
                      !revealed
                        ? "border-[hsl(var(--brand-iron))]"
                        : isChoice
                          ? "border-[hsl(var(--brand-signal)/0.75)] bg-[hsl(var(--brand-signal)/0.08)]"
                          : verdict.usable
                            ? "border-[hsl(var(--brand-iron))]"
                            : "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.06)] opacity-80"
                    }`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone))]">
                        {copy.name}
                        {isChoice ? (
                          <span className="ml-2 font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-signal))]">
                            restore from this
                          </span>
                        ) : null}
                        {revealed && !verdict.usable ? (
                          <span className="ml-2 font-techno text-[9.5px] uppercase tracking-[0.22em] text-[hsl(var(--brand-danger))]">
                            gone
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
                        {MEDIUM_LABEL[copy.medium]} · every {duration(copy.intervalHours)} · kept{" "}
                        {copy.retentionDays} {pluralise(copy.retentionDays, "day")}
                        {copy.immutable ? " · immutable" : ""}
                        {copy.sharesWith !== "none" ? ` · shares the ${copy.sharesWith}` : ""}
                      </span>
                    </div>
                    {revealed ? (
                      <p className="mt-2 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {verdict.usable ? (
                          <>
                            Back in <strong className="font-medium text-[hsl(var(--brand-bone))]">{duration(verdict.hours)}</strong>:{" "}
                            {duration(copy.retrievalHours)} to reach it,{" "}
                            {duration(hoursToMove(scenario.gigabytes, copy.restoreMbps))} to move{" "}
                            {scenario.gigabytes.toLocaleString()} GB at {copy.restoreMbps} MB/s, then{" "}
                            {duration(scenario.rebuildHours)} of rebuild. Losing up to{" "}
                            {duration(verdict.rpoHours)} of work.
                            {!copy.everRestored ? (
                              <span className="text-[hsl(var(--brand-amber))]">
                                {" "}
                                Nobody has ever restored from this one.
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[hsl(var(--brand-bone-dim))]">{verdict.reason}.</span>
                        )}
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            {!revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                data-testid="run"
                className="mt-6 rounded-full border border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.08)] px-5 py-2.5 font-mono-tight text-[12px] uppercase tracking-[0.16em] text-[hsl(var(--brand-bone))] transition-colors hover:bg-[hsl(var(--brand-signal)/0.14)]"
              >
                Run the incident
              </button>
            ) : (
              <div className="mt-6 space-y-4" data-testid="outcome" aria-live="polite">
                <p className="font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {chosen === null
                    ? `All ${scenario.copies.length} copies are gone. There is no restore.`
                    : `${lost} of ${scenario.copies.length} ${pluralise(scenario.copies.length, "copy", "copies")} gone. Back in ${duration(chosen.verdict.hours)} from ${chosen.copy.name.toLowerCase()}.`}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    What people conclude ·{" "}
                  </span>
                  {scenario.trap}
                </p>
                <button
                  type="button"
                  onClick={() => setRevealed(false)}
                  data-testid="again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Read the posture again
                </button>
              </div>
            )}
          </section>

          <section className="mt-12">
            <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · The three things this keeps showing
            </h2>
            <dl className="mt-4 space-y-4">
              {[
                [
                  "A copy is only a copy if the incident cannot reach it",
                  "3-2-1 counts copies, media and sites, and the number that matters is none of those: it is how many ways there are to lose all of them at once. Three copies behind one credential is one copy with extra steps.",
                ],
                [
                  "Recovery point is the interval plus the lag",
                  "The newest copy is only useful if it predates the problem. For silent corruption that lag is measured in weeks, and what decides whether you recover is retention reaching back past the start rather than how often you take a copy.",
                ],
                [
                  "Recovery time is mostly not the transfer",
                  "It is working out what to restore, getting the media back, moving bytes at restore speed rather than backup speed, rebuilding what sat on top, and proving it is right. The transfer is often the smallest of the five, and the cheap storage tier is the one that costs the most time.",
                ],
              ].map(([term, detail]) => (
                <div key={term}>
                  <dt className="font-mono-tight text-[13px] text-[hsl(var(--brand-bone))]">{term}</dt>
                  <dd className="mt-1 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                    {detail}
                  </dd>
                </div>
              ))}
            </dl>
          </section>


          <ReadAboutThis href="/restore" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The arithmetic here is deliberately optimistic: it assumes you know what to restore, the
            media is where the inventory says, and nothing fails during the restore. A real
            recovery is longer than the number this page gives you, every time.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The failure with the same shape, where a rate looks fine and the ceiling is elsewhere,
            is at{" "}
            <Link
              href="/transfer"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              why the transfer is slow
            </Link>
            , and the rest is at the{" "}
            <Link
              href="/practice"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              practice hub
            </Link>
            .
          </p>
        </div>
      </div>
    </CinematicLayout>
  );
}
