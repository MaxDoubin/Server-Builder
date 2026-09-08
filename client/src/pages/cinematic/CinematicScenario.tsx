/**
 * One branching incident, played.
 *
 * Three stages: the brief, a run of scenes, and an ending. State is a trail of
 * the choices taken rather than a current node, which buys three things for
 * almost nothing: the clock is the sum of the trail, the ending can show the
 * route you took, and rewinding to any earlier decision is a slice.
 *
 * Nothing here is timed in real seconds. Real incident pressure comes from
 * not knowing, not from a countdown, and a countdown would only punish the
 * reader who stops to read the evidence properly, which is the behaviour this
 * is trying to build.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRoute } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { EvidenceBlock } from "@/components/scenarios/EvidenceBlock";
import { ScenarioStage, accentFor } from "@/components/scenarios/ScenarioStage";
import { useSEO } from "@/lib/useSEO";
import { getScenario } from "@/lib/scenarios/index";
import {
  DIFFICULTY_LABEL,
  GRADE_LABEL,
  percent,
  rarityOf,
  type Choice,
  type EndingGrade,
  type Scenario,
  type SceneMood,
} from "@/lib/scenarios/types";
import { loadFoundFor, recordEnding } from "@/lib/scenarios/progress";
import { CinematicNotFound } from "@/pages/cinematic/CinematicNotFound";

const SITE_URL = "https://maxdoubin.com";

/** One decision, as taken. */
interface Step {
  from: string;
  label: string;
  to: string;
  cost: number;
}

const GRADE_TONE: Record<EndingGrade, string> = {
  best: "text-[hsl(var(--brand-signal))] border-[hsl(var(--brand-signal)/0.5)] bg-[hsl(var(--brand-signal)/0.08)]",
  good: "text-[hsl(var(--brand-signal))] border-[hsl(var(--brand-signal)/0.35)] bg-[hsl(var(--brand-signal)/0.05)]",
  mixed: "text-[hsl(var(--brand-amber))] border-[hsl(var(--brand-amber)/0.4)] bg-[hsl(var(--brand-amber)/0.06)]",
  bad: "text-[hsl(var(--brand-amber))] border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)]",
  catastrophic: "text-[hsl(var(--brand-danger))] border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)]",
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * "Tuesday 02:14" plus 47 minutes is "Tuesday 03:01", and plus 700 is
 * "Tuesday 13:54". Past midnight it rolls the day name, because a scenario
 * that runs into the small hours and still says Tuesday reads as a bug.
 */
function clockAfter(start: string, minutes: number): string {
  const match = /^(\w+)?\s*(\d{1,2}):(\d{2})$/.exec(start.trim());
  if (!match) return start;
  const [, day, hh, mm] = match;
  const total = Number(hh) * 60 + Number(mm) + minutes;
  const dayShift = Math.floor(total / 1440);
  const inDay = ((total % 1440) + 1440) % 1440;
  const time = `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
  if (!day) return time;
  const index = DAYS.indexOf(day);
  if (index === -1 || dayShift === 0) return `${day} ${time}`;
  return `${DAYS[(index + dayShift) % 7]} ${time}`;
}

function elapsedLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours}h ${rest}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function CinematicScenario() {
  const [, params] = useRoute("/scenarios/:slug");
  const scenario = params?.slug ? getScenario(params.slug) : undefined;

  useSEO({
    title: scenario ? `${scenario.title} | Incident scenarios | Max Doubin` : "Scenario not found",
    description: scenario
      ? `${scenario.tagline} A branching ${DIFFICULTY_LABEL[scenario.difficulty].toLowerCase()} incident scenario with ${scenario.endings.length} endings.`
      : "",
    // The 404 branch keeps a canonical too: useSEO requires one, and a
    // mistyped slug should point at the index rather than at itself.
    canonical: scenario ? `${SITE_URL}/scenarios/${scenario.slug}` : `${SITE_URL}/scenarios`,
    noindex: !scenario,
  });

  if (!scenario) return <CinematicNotFound />;
  return <Player key={scenario.slug} scenario={scenario} />;
}

function Player({ scenario }: { scenario: Scenario }) {
  const [started, setStarted] = useState(false);
  const [trail, setTrail] = useState<Step[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const rarity = useMemo(() => rarityOf(scenario), [scenario]);
  const endingsById = useMemo(
    () => new Map(scenario.endings.map((ending) => [ending.id, ending])),
    [scenario],
  );
  const scenesById = useMemo(
    () => new Map(scenario.scenes.map((scene) => [scene.id, scene])),
    [scenario],
  );

  const currentId = trail.length ? trail[trail.length - 1].to : scenario.start;
  const ending = endingsById.get(currentId);
  const scene = scenesById.get(currentId);
  const elapsed = trail.reduce((sum, step) => sum + step.cost, 0);

  useEffect(() => {
    setFound(loadFoundFor(scenario.slug));
  }, [scenario.slug]);

  // Record an ending the first time it is reached, and only then.
  useEffect(() => {
    if (ending) setFound(recordEnding(scenario.slug, ending.id));
  }, [ending, scenario.slug]);

  /*
    Move focus to the new heading on every scene change.

    Without this a keyboard or screen-reader user picks a choice, the page
    swaps underneath them, and focus is on a button that no longer exists, so
    it falls back to the document and they are silently returned to the top of
    the page with no announcement that anything happened.
  */
  useEffect(() => {
    if (started) headingRef.current?.focus();
  }, [currentId, started]);

  const take = useCallback(
    (choice: Choice, from: string) => {
      setTrail((previous) => [
        ...previous,
        { from, label: choice.label, to: choice.to, cost: choice.cost ?? 0 },
      ]);
    },
    [],
  );

  /* Number keys pick a choice, which is how anyone reads a list of four. */
  useEffect(() => {
    if (!scene || !started) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0 && index < scene.choices.length) {
        event.preventDefault();
        take(scene.choices[index], scene.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, started, take]);

  const restart = () => {
    setTrail([]);
    setStarted(true);
  };
  const rewindTo = (index: number) => setTrail((previous) => previous.slice(0, index));

  const foundCount = found.filter((id) => endingsById.has(id)).length;

  /*
    What the room looks like right now.

    Before you begin it is calm, because nothing has happened yet. During a
    scene it is whatever that scene says, defaulting to tense. At an ending
    the outcome's grade takes over the accent entirely.
  */
  const mood: SceneMood = !started ? "calm" : (scene?.mood ?? (ending ? "recovering" : "tense"));

  return (
    <CinematicLayout>
      <ScenarioStage
        accent={accentFor(scenario.category)}
        mood={mood}
        ending={ending?.grade}
        flashKey={trail.length}
      />
      <div className="relative z-10 px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[780px]">
          <Link
            href="/scenarios"
            className="inline-flex min-h-[36px] items-center gap-2 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
            data-testid="link-scenarios-back"
          >
            ← All scenarios
          </Link>

          <header className="mt-6">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              <span>· {scenario.category}</span>
              <span className="text-[hsl(var(--brand-ash))]">
                {DIFFICULTY_LABEL[scenario.difficulty]}
              </span>
              <span className="text-[hsl(var(--brand-ash))]">
                {scenario.endings.length} endings
              </span>
            </div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className={`mt-4 font-display font-medium leading-[1.02] tracking-[-0.035em] text-[hsl(var(--brand-bone))] transition-[font-size] duration-500 focus:outline-none ${
                started
                  ? "text-[clamp(1.5rem,3.2vw,2.1rem)]"
                  : "text-[clamp(2rem,5vw,3.4rem)]"
              }`}
            >
              {started && ending ? ending.title : scenario.title}
            </h1>
          </header>

          {started ? (
            <div
              className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-[hsl(var(--brand-iron))] py-3 font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
              data-testid="scenario-clock"
            >
              <span
                className={
                  elapsed >= 240
                    ? "text-[hsl(var(--brand-danger))]"
                    : elapsed >= 60
                      ? "text-[hsl(var(--brand-amber))]"
                      : "text-[hsl(var(--brand-bone))]"
                }
              >
                {clockAfter(scenario.clockStart, elapsed)}
              </span>
              <span>{elapsedLabel(elapsed)} elapsed</span>
              <span>
                {trail.length} decision{trail.length === 1 ? "" : "s"}
              </span>
              <span>
                {foundCount} of {scenario.endings.length} endings found
              </span>
            </div>
          ) : null}

          {started && scene?.where ? (
            <p
              className="mt-5 font-techno text-[10px] uppercase tracking-[0.42em] text-[hsl(var(--brand-bone-dim))]"
              data-testid="scene-where"
            >
              {scene.where}
            </p>
          ) : null}

          {!started ? (
            <Brief scenario={scenario} foundCount={foundCount} onBegin={() => setStarted(true)} />
          ) : scene ? (
            <section key={scene.id} className="scenario-scene mt-7" data-testid={`scene-${scene.id}`}>
              {scene.body.map((paragraph, index) => (
                <p
                  key={index}
                  className="mt-4 font-mono-tight text-[15px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
                >
                  {paragraph}
                </p>
              ))}
              {scene.evidence?.map((evidence, index) => (
                <EvidenceBlock key={index} evidence={evidence} />
              ))}

              <h2 className="mt-9 font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
                What do you do?
              </h2>
              <ul className="mt-4 space-y-3">
                {scene.choices.map((choice, index) => (
                  <li key={choice.label}>
                    <button
                      type="button"
                      onClick={() => take(choice, scene.id)}
                      data-testid={`choice-${index + 1}`}
                      className="scenario-choice group flex w-full items-start gap-4 rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.7)] px-5 py-4 text-left backdrop-blur-sm transition-colors hover:border-[hsl(var(--brand-bone-dim)/0.5)] hover:bg-[hsl(var(--brand-graphite)/0.9)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
                    >
                      <span
                        aria-hidden
                        className="mt-0.5 shrink-0 rounded border border-[hsl(var(--brand-iron))] px-1.5 py-0.5 font-mono-tight text-[10px] text-[hsl(var(--brand-ash))] group-hover:border-[hsl(var(--brand-signal)/0.5)] group-hover:text-[hsl(var(--brand-signal))]"
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-mono-tight text-[14px] leading-snug text-[hsl(var(--brand-bone))]">
                          {choice.label}
                        </span>
                        {choice.detail ? (
                          <span className="mt-1 block font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
                            {choice.detail}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <p className="mt-5 font-mono-tight text-[10px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Press 1 to {scene.choices.length} to choose
              </p>

              {trail.length ? (
                <button
                  type="button"
                  onClick={() => rewindTo(trail.length - 1)}
                  data-testid="button-undo"
                  className="mt-6 inline-flex min-h-[36px] items-center font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))] transition-colors hover:text-[hsl(var(--brand-bone))]"
                >
                  ← Undo the last decision
                </button>
              ) : null}
            </section>
          ) : ending ? (
            <EndingView
              scenario={scenario}
              ending={ending}
              rarity={rarity[ending.id]}
              trail={trail}
              elapsed={elapsed}
              found={found}
              onRestart={restart}
              onRewind={rewindTo}
            />
          ) : (
            <p className="mt-8 font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              This route does not lead anywhere, which is a bug in the scenario rather than in
              anything you did.
            </p>
          )}
        </div>
      </div>
    </CinematicLayout>
  );
}

function Brief({
  scenario,
  foundCount,
  onBegin,
}: {
  scenario: Scenario;
  foundCount: number;
  onBegin: () => void;
}) {
  return (
    <section className="mt-8">
      <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
        {scenario.role}
      </p>
      <div className="mt-6 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6 md:p-8">
        <div className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
          · The brief · {scenario.clockStart}
        </div>
        {scenario.brief.map((paragraph, index) => (
          <p
            key={index}
            className="mt-4 font-mono-tight text-[15px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
          >
            {paragraph}
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={onBegin}
        data-testid="button-begin"
        className="mt-7 inline-flex min-h-[44px] w-full items-center justify-center rounded-full bg-[hsl(var(--brand-signal))] px-8 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] sm:w-auto"
      >
        Begin
      </button>
      <p className="mt-4 font-mono-tight text-[11px] leading-relaxed text-[hsl(var(--brand-ash))]">
        {foundCount > 0
          ? `You have found ${foundCount} of the ${scenario.endings.length} endings. Nothing you do here is scored, and you can undo any decision.`
          : `${scenario.endings.length} endings. Nothing here is scored or timed in real seconds, and you can undo any decision.`}
      </p>
    </section>
  );
}

function EndingView({
  scenario,
  ending,
  rarity,
  trail,
  elapsed,
  found,
  onRestart,
  onRewind,
}: {
  scenario: Scenario;
  ending: import("@/lib/scenarios/types").Ending;
  rarity: import("@/lib/scenarios/types").Rarity;
  trail: Step[];
  elapsed: number;
  found: string[];
  onRestart: () => void;
  onRewind: (index: number) => void;
}) {
  const allRarity = useMemo(() => rarityOf(scenario), [scenario]);
  const foundCount = found.filter((id) => scenario.endings.some((e) => e.id === id)).length;

  return (
    <section className="scenario-scene mt-8" data-testid={`ending-${ending.id}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full border px-3 py-1 font-techno text-[10px] uppercase tracking-[0.28em] ${GRADE_TONE[ending.grade]}`}
        >
          {GRADE_LABEL[ending.grade]}
        </span>
        <span
          className="rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone-dim))]"
          data-testid="ending-rarity"
        >
          {rarity.label} · {percent(rarity.share)} of routes
        </span>
        <span className="font-mono-tight text-[11px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
          {trail.length} decisions · {elapsedLabel(elapsed)}
        </span>
      </div>

      {ending.body.map((paragraph, index) => (
        <p
          key={index}
          className="mt-4 font-mono-tight text-[15px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
        >
          {paragraph}
        </p>
      ))}

      <div className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-6 backdrop-blur-sm">
        <h2 className="font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
          · What separated this from the best outcome
        </h2>
        {ending.lesson.map((paragraph, index) => (
          <p
            key={index}
            className="mt-4 font-mono-tight text-[14px] leading-[1.75] text-[hsl(var(--brand-bone-dim))]"
          >
            {paragraph}
          </p>
        ))}
      </div>

      <h2 className="mt-10 font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
        · The route you took
      </h2>
      <ol className="mt-4 space-y-2">
        {trail.map((step, index) => (
          <li key={index} className="flex items-start gap-3">
            <span
              aria-hidden
              className="mt-1 shrink-0 font-mono-tight text-[10px] text-[hsl(var(--brand-ash))]"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <button
              type="button"
              onClick={() => onRewind(index)}
              className="min-h-[32px] text-left font-mono-tight text-[13px] leading-snug text-[hsl(var(--brand-bone-dim))] underline decoration-[hsl(var(--brand-iron))] underline-offset-4 transition-colors hover:text-[hsl(var(--brand-bone))] hover:decoration-[hsl(var(--brand-signal))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
            >
              {step.label}
            </button>
          </li>
        ))}
      </ol>
      <p className="mt-3 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
        Any of those is a decision you can take again differently.
      </p>

      <h2 className="mt-10 font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
        · Endings, {foundCount} of {scenario.endings.length} found
      </h2>
      <ul className="mt-4 space-y-2">
        {scenario.endings.map((other) => {
          const seen = found.includes(other.id);
          const r = allRarity[other.id];
          return (
            <li
              key={other.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-[hsl(var(--brand-iron)/0.6)] pb-2"
            >
              <span
                className={`font-mono-tight text-[13px] ${seen ? "text-[hsl(var(--brand-bone))]" : "text-[hsl(var(--brand-ash))]"}`}
              >
                {seen ? other.title : "Not found yet"}
              </span>
              <span className="font-mono-tight text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]">
                {r.label} · {percent(r.share)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRestart}
          data-testid="button-replay"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-[hsl(var(--brand-signal))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-obsidian))] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]"
        >
          Run it again
        </button>
        <Link
          href="/scenarios"
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[hsl(var(--brand-iron))] px-6 font-mono-tight text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
        >
          Another scenario
        </Link>
      </div>

      {scenario.reading?.length ? (
        <>
          <h2 className="mt-12 font-techno text-[10px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
            · The written version
          </h2>
          <ul className="mt-4 space-y-2">
            {scenario.reading.map((link) => (
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
        </>
      ) : null}
    </section>
  );
}
