/**
 * Ten advisories, and the queue your scanner built is in the wrong order.
 *
 * The visual argument is at the bottom and everything else leads to it: the
 * two queues side by side, base score on the left and what to do about it on
 * the right, with a line drawn between each finding's two positions. The
 * lines cross. A Medium sits second and a 9.9 sits fifth, and no amount of
 * prose about how the base score is not a risk score does what looking at
 * that does.
 *
 * The exercise above it is one finding at a time, and it asks for the tier
 * rather than for the decision points. That is deliberate: extracting the
 * four points from a description of your own estate is the part people get
 * wrong, so the page makes you commit to an answer that depends on all four
 * and then shows you which one you must have read differently. Two findings
 * are the same product with different answers, and two more are the same
 * appliance, because exposure is a property of a component and almost
 * everybody applies it to a box.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  FINDINGS,
  PRIORITY_LABEL,
  byPriority,
  byScore,
  displacement,
  invertedPairs,
  loadSolvedPatches,
  priorityFor,
  recordSolvedPatch,
  type Finding,
  type Points,
  type Priority,
} from "@/lib/patch/index";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

const TIERS: Priority[] = ["immediate", "out-of-cycle", "scheduled", "defer"];

/** What each tier means in practice, which is a schedule and not a severity. */
const TIER_MEANS: Record<Priority, string> = {
  immediate: "Drop what you are doing. Overtime, and downtime if that is what it takes.",
  "out-of-cycle": "Sooner than the next window, but planned rather than panicked.",
  scheduled: "The next regular maintenance window.",
  defer: "Do nothing now. Record it and move on.",
};

/** Tier to accent, so the room says how bad this turned out to be. */
const ACCENT: Record<Priority, StageAccent> = {
  immediate: "danger",
  "out-of-cycle": "amber",
  scheduled: "signal",
  defer: "cyan",
};

const POINT_LABEL: Record<keyof Points, string> = {
  exploitation: "Exploitation",
  exposure: "System exposure",
  automatable: "Automatable",
  impact: "Human impact",
};

/** The value names as the framework writes them. */
const VALUE_LABEL: Record<string, string> = {
  none: "None",
  "public-poc": "Public PoC",
  active: "Active",
  small: "Small",
  controlled: "Controlled",
  open: "Open",
  no: "No",
  yes: "Yes",
  low: "Low",
  medium: "Medium",
  high: "High",
  "very-high": "Very High",
};

const SEVERITY_COLOUR: Record<Finding["severity"], string> = {
  Critical: "text-[hsl(var(--brand-danger))]",
  High: "text-[hsl(var(--brand-amber))]",
  Medium: "text-[hsl(var(--brand-signal))]",
  Low: "text-[hsl(var(--brand-ash))]",
};

export function CinematicPatch() {
  useSEO({
    title: "The Queue Is Sorted Wrong | Max Doubin",
    description:
      "Every scanner sorts by CVSS base score, and the specification says the base score is not a risk score. Ten advisories in one week: call each one with the published deployer decision tree and watch a Medium outrank a 9.9.",
    canonical: `${SITE_URL}/patch`,
  });

  const [active, setActive] = useState<Finding>(FINDINGS[0]);
  const [chosen, setChosen] = useState<Priority | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setSolved(loadSolvedPatches());
    setMounted(true);
  }, []);

  const truth = useMemo(() => priorityFor(active.points), [active]);
  const answered = chosen !== null;
  const right = chosen === truth;

  const scored = useMemo(() => byScore(FINDINGS), []);
  const ranked = useMemo(() => byPriority(FINDINGS), []);
  const moves = useMemo(() => displacement(FINDINGS), []);
  const { inverted, pairs } = useMemo(() => invertedPairs(FINDINGS), []);

  const open = useCallback((finding: Finding) => {
    setActive(finding);
    setChosen(null);
  }, []);

  const answer = useCallback(
    (tier: Priority) => {
      if (chosen !== null) return;
      setChosen(tier);
      if (tier === priorityFor(active.points)) {
        recordSolvedPatch(active.id);
        setSolved(loadSolvedPatches());
      }
    },
    [active, chosen],
  );

  const mood = !answered ? "calm" : right ? "recovering" : "tense";

  return (
    <CinematicLayout>
      <PracticeStage accent={answered ? ACCENT[truth] : "signal"} mood={mood} flashKey={0} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {FINDINGS.length} advisories, one week
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The queue is sorted wrong.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every vulnerability management tool sorts by base score, because that is the only
              number that arrives with the advisory. So a 9.8 goes to the top, a 6.5 goes near the
              bottom, and whoever works the queue starts at the top.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              The scoring specification says plainly that the base score describes intrinsic
              characteristics and is meant to be adjusted by environmental metrics that almost
              nobody fills in. It cannot know whether the affected component is reachable from
              where an attacker is, whether the feature is even enabled in your build, whether
              anybody is exploiting it, or what the machine does. All four change the answer.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="patch-list">
            {scored.map((finding) => (
              <li key={finding.id}>
                <button
                  type="button"
                  onClick={() => open(finding)}
                  aria-pressed={active.id === finding.id}
                  data-testid={`patch-${finding.id}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.id === finding.id
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-mono-tight text-[11px] tabular-nums text-[hsl(var(--brand-ash))]">
                      {finding.id}
                    </span>
                    <span
                      className={`font-techno text-[9.5px] uppercase tracking-[0.2em] tabular-nums ${SEVERITY_COLOUR[finding.severity]}`}
                    >
                      {finding.cvss.toFixed(1)}
                    </span>
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[12.5px] leading-snug text-[hsl(var(--brand-bone))]">
                    {finding.product}
                  </span>
                  {mounted && solved.includes(finding.id) ? (
                    <span className="mt-1 font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                      called
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
                {active.product}
              </h2>
              <p className="font-mono-tight text-[12px] tabular-nums text-[hsl(var(--brand-ash))]">
                {active.id} ·{" "}
                <span className={SEVERITY_COLOUR[active.severity]}>
                  {active.severity} {active.cvss.toFixed(1)}
                </span>
              </p>
            </div>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="patch-summary"
            >
              {active.summary}
            </p>

            <h3 className="mt-6 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · What your estate looks like
            </h3>
            <ul className="mt-3 space-y-2" data-testid="patch-estate">
              {active.estate.map((note) => (
                <li
                  key={note}
                  className="border-l-2 border-[hsl(var(--brand-iron))] pl-3.5 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
                >
                  {note}
                </li>
              ))}
            </ul>

            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · What do you do about it
            </h3>
            <div className="mt-3 space-y-2">
              {TIERS.map((tier) => {
                const picked = chosen === tier;
                const correct = tier === truth;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => answer(tier)}
                    disabled={answered}
                    data-testid={`patch-tier-${tier}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-default ${
                      !answered
                        ? "border-[hsl(var(--brand-iron))] hover:border-[hsl(var(--brand-signal)/0.5)]"
                        : correct
                          ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.1)]"
                          : picked
                            ? "border-[hsl(var(--brand-danger)/0.8)] bg-[hsl(var(--brand-danger)/0.1)]"
                            : "border-[hsl(var(--brand-iron))] opacity-60"
                    }`}
                  >
                    <span className="font-techno text-[11px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone))]">
                      {PRIORITY_LABEL[tier]}
                    </span>
                    <span className="mt-1 block font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                      {TIER_MEANS[tier]}
                    </span>
                  </button>
                );
              })}
            </div>

            {answered ? (
              <div className="mt-6 space-y-4" data-testid="patch-verdict" aria-live="polite">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {right
                    ? `${PRIORITY_LABEL[truth]}, yes.`
                    : `Not ${PRIORITY_LABEL[chosen].toLowerCase()}. The tree says ${PRIORITY_LABEL[truth].toLowerCase()}.`}{" "}
                  The four points it reads, and where each one comes from:
                </p>
                <ul className="space-y-2.5" data-testid="patch-points">
                  {(Object.keys(POINT_LABEL) as (keyof Points)[]).map((key) => (
                    <li
                      key={key}
                      className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] px-4 py-3"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-techno text-[10px] uppercase tracking-[0.26em] text-[hsl(var(--brand-ash))]">
                          {POINT_LABEL[key]}
                        </span>
                        <span className="font-mono-tight text-[13px] text-[hsl(var(--brand-signal))]">
                          {VALUE_LABEL[active.points[key]]}
                        </span>
                      </span>
                      <span className="mt-1.5 block font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                        {active.because[key]}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The reading to avoid ·{" "}
                  </span>
                  {active.trap}.
                </p>
                <p className="font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                  {(() => {
                    const move = moves.get(active.id) ?? 0;
                    const at = scored.findIndex((item) => item.id === active.id) + 1;
                    const to = ranked.findIndex((item) => item.id === active.id) + 1;
                    if (move === 0) {
                      return `Your scanner puts this ${at} of ${FINDINGS.length} and so does the tree. Base score is not always wrong, it is just not evidence.`;
                    }
                    return `Your scanner puts this ${at} of ${FINDINGS.length}. The tree puts it ${to}, which is ${Math.abs(move)} ${pluralise(Math.abs(move), "position")} ${move > 0 ? "sooner" : "later"}.`;
                  })()}
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="patch-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                Everything you need is above. The advisory gives you the score and the mechanism;
                the estate notes give you the four things the score cannot know.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="patch-progress"
          >
            {mounted
              ? `${solved.length} of ${FINDINGS.length} ${pluralise(FINDINGS.length, "call")} right`
              : " "}
          </p>

          {/* ── the two queues ── */}
          <section className="mt-14" data-testid="patch-queues">
            <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
              · The same week, sorted two ways
            </h2>
            <p className="mt-3 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
              On the left, the order a scanner hands you. On the right, the order the tree
              produces. {inverted} of the {pairs} pairs are the other way round, and the
              disagreements are not small: the thing at the bottom of the left column is second on
              the right, and it is a Medium.
            </p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <QueueColumn
                heading="By base score"
                caption="What the tool gives you"
                findings={scored}
                moves={moves}
                other={ranked}
                active={active.id}
                onPick={open}
                sortedByScore
              />
              <QueueColumn
                heading="By what to do about it"
                caption="What the tree gives you"
                findings={ranked}
                moves={moves}
                other={scored}
                active={active.id}
                onPick={open}
              />
            </div>
          </section>

          <ReadAboutThis href="/patch" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The tree is the published deployer decision tree, all seventy-two rows of it,
            transcribed rather than reimplemented: the point of using somebody else's framework is
            lost if you rewrite its judgements into heuristics of your own on the way in. CI checks
            the transcription by a property rather than by fetching the source on every build,
            because a gate that fails when a third party has a bad minute is a gate everybody
            learns to ignore. Worsening any single decision point must never lower the priority,
            which holds across all one hundred and eighty six single-step comparisons and which a
            mistyped cell breaks.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The advisories are constructed, which is why they are numbered ADV rather than CVE:
            nothing here should be quotable as a real published vulnerability. The scoring system,
            the decision points and the tree are real, and cited below.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            The same shape of problem, where a stated rule and the order you read it in disagree,
            is at{" "}
            <Link
              href="/firewall"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              the firewall exercises
            </Link>
            . One unpatched appliance, played out as an incident rather than a queue, is{" "}
            <Link
              href="/scenarios/no-patch-until-tuesday"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              No Patch Until Tuesday
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
          <h2 className="mt-12 font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
            · Where this comes from
          </h2>
          <ul className="mt-4 space-y-2">
            {[
              ["Prioritizing vulnerability response: SSVC, and the deployer decision tree", "https://certcc.github.io/SSVC/howto/deployer_tree/"],
              ["CVSS v4.0 specification, on what a base score is and is not", "https://www.first.org/cvss/v4.0/specification-document"],
              ["CVSS v3.1 specification, the version most advisories still quote", "https://www.first.org/cvss/v3.1/specification-document"],
              ["EPSS, on the probability that a vulnerability is exploited", "https://www.first.org/epss/"],
              ["NIST SP 800-40r4: enterprise patch management planning", "https://csrc.nist.gov/pubs/sp/800/40/r4/final"],
            ].map(([label, href]) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))] underline-offset-4 hover:text-[hsl(var(--brand-signal))] hover:underline"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </CinematicLayout>
  );
}

/* --------------------------------------------------------------- a queue */

interface ColumnProps {
  heading: string;
  caption: string;
  findings: Finding[];
  other: Finding[];
  moves: Map<string, number>;
  active: string;
  onPick: (finding: Finding) => void;
  sortedByScore?: boolean;
}

function QueueColumn({ heading, caption, findings, other, moves, active, onPick, sortedByScore }: ColumnProps) {
  return (
    <div className="rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.5)] p-4">
      <h3 className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-bone))]">
        {heading}
      </h3>
      <p className="mt-1 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))]">{caption}</p>
      <ol className="mt-4 space-y-1.5" data-testid={sortedByScore ? "queue-score" : "queue-priority"}>
        {findings.map((finding, index) => {
          const move = moves.get(finding.id) ?? 0;
          const elsewhere = other.findIndex((item) => item.id === finding.id) + 1;
          const tier = priorityFor(finding.points);
          return (
            <li key={finding.id}>
              <button
                type="button"
                onClick={() => onPick(finding)}
                data-testid={`queue-${sortedByScore ? "score" : "priority"}-${index}`}
                className={`flex w-full items-baseline gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                  active === finding.id
                    ? "border-[hsl(var(--brand-signal)/0.6)] bg-[hsl(var(--brand-signal)/0.06)]"
                    : "border-transparent hover:border-[hsl(var(--brand-iron))]"
                }`}
              >
                <span className="w-5 shrink-0 font-mono-tight text-[11px] tabular-nums text-[hsl(var(--brand-ash)/0.7)]">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone))]">
                    {finding.product}
                  </span>
                  <span className="mt-0.5 block font-mono-tight text-[10.5px] tabular-nums text-[hsl(var(--brand-ash))]">
                    {sortedByScore
                      ? `${finding.cvss.toFixed(1)} · the tree puts it ${elsewhere}`
                      : `${PRIORITY_LABEL[tier]} · the score puts it ${elsewhere}`}
                  </span>
                </span>
                {/*
                  Only the movers are marked. Marking every row with a zero
                  would make the three that did not move look like the same
                  kind of fact as the one that moved seven places.
                */}
                {move === 0 ? null : (
                  <span
                    className={`shrink-0 font-techno text-[10px] uppercase tracking-[0.14em] tabular-nums ${
                      move > 0
                        ? "text-[hsl(var(--brand-danger))]"
                        : "text-[hsl(var(--brand-cyan))]"
                    }`}
                  >
                    {move > 0 ? `+${move}` : move}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
