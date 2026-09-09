/**
 * Nine bits, and the three that apply to you are not the three you expect.
 *
 * The visual argument this page makes is one thing, and everything else is
 * arranged around it: once you answer, the two sets of bits the kernel never
 * looked at go dim, in the actual ls output, on every row of the tree. The
 * rwxrwxrwx you have read ten thousand times becomes one triad in the light
 * and six characters of nothing, and the file whose group column says rw- is
 * suddenly, obviously, unwritable.
 *
 * Which is also why the tree renders flat and unhighlighted until an answer
 * is in. Marking the applicable class up front would be handing over most of
 * the puzzle: two of the fourteen cases are entirely about which of the three
 * the kernel picks, and one of them turns on the fact that it picks the
 * restrictive one.
 *
 * The walk then runs down the tree in order, marking each node passed until
 * the one that stopped it, and everything below the stop goes struck through
 * rather than red. Not consulted is a different state from refused, and the
 * whole of the traverse lesson is that people confuse the two: they read an
 * error naming a file that the kernel never opened.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CinematicLayout } from "@/components/cinematic/CinematicLayout";
import { PracticeStage, type StageAccent } from "@/components/practice/PracticeStage";
import { ReadAboutThis } from "@/components/practice/ReadAboutThis";
import { useSEO } from "@/lib/useSEO";
import {
  BORN_DIR,
  BORN_FILE,
  CASES,
  applyUmask,
  bitsFor,
  check,
  classFor,
  loadSolvedPermissions,
  naiveSubtract,
  octal,
  onTarget,
  pathOf,
  recordSolvedPermission,
  symbolic,
  triad,
  type Case,
  type Klass,
  type Node,
  type Operation,
  type Reason,
  type Step,
} from "@/lib/permissions/index";
import { pluralise } from "@/lib/plural";

const SITE_URL = "https://maxdoubin.com";

const OPERATION_LABEL: Record<Operation, string> = {
  read: "Read the file",
  write: "Write to the file",
  execute: "Run it",
  list: "List the directory",
  create: "Create the file",
  delete: "Delete the file",
};

/**
 * Operation to accent.
 *
 * Reads are calm and the things that change the tree are not, which is the
 * only distinction the colour is carrying. Four accents, because those are
 * the four the site has contrast-checked in both themes.
 */
const ACCENT: Record<Operation, StageAccent> = {
  read: "cyan",
  list: "cyan",
  write: "amber",
  create: "amber",
  delete: "danger",
  execute: "signal",
};

const CLASS_LABEL: Record<Klass, string> = {
  owner: "owner",
  group: "group",
  other: "other",
};

/** Where each class sits in the ten characters ls prints. */
const SPAN: Record<Klass, [number, number]> = { owner: [1, 4], group: [4, 7], other: [7, 10] };

/** The masks worth having as buttons, and why each one is here. */
const MASKS: { value: number; note: string }[] = [
  { value: 0o022, note: "the default nearly everywhere" },
  { value: 0o002, note: "the shared-group default on Debian and Ubuntu" },
  { value: 0o077, note: "nothing for anybody else" },
  { value: 0o027, note: "the common hardened setting" },
  { value: 0o013, note: "where subtracting stops working" },
  { value: 0o045, note: "and again, more obviously" },
];

export function CinematicPermissions() {
  useSEO({
    title: "The First Class That Matches | Max Doubin",
    description:
      "Unix permissions pick exactly one of owner, group and other, and never add them together. Fourteen accesses to call: a file you own and cannot write, a file you cannot read and can delete, a home directory at 711 that is not private, and the one thing root cannot do.",
    canonical: `${SITE_URL}/permissions`,
  });

  const [active, setActive] = useState<Case>(CASES[0]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [solved, setSolved] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [umask, setUmask] = useState(0o022);

  useEffect(() => {
    setSolved(loadSolvedPermissions());
    setMounted(true);
  }, []);

  const verdict = useMemo(
    () => check(active.path, active.actor, active.operation),
    [active],
  );
  const answered = chosen !== null;
  const right = chosen === active.answer;
  const stoppedAt = verdict.kind === "denied" ? verdict.at : -1;

  const open = useCallback((item: Case) => {
    setActive(item);
    setChosen(null);
  }, []);

  const answer = useCallback(
    (id: string) => {
      if (chosen !== null) return;
      setChosen(id);
      if (id === active.answer) {
        recordSolvedPermission(active.slug);
        setSolved(loadSolvedPermissions());
      }
    },
    [active, chosen],
  );

  const accent = ACCENT[active.operation];
  const mood = !answered ? "calm" : right ? "recovering" : "tense";
  const last = active.path.length - 1;
  const stepFor = (index: number): Step | undefined =>
    verdict.steps.find((step) => step.index === index);

  return (
    <CinematicLayout>
      <PracticeStage accent={accent} mood={mood} flashKey={0} />
      <div className="relative px-6 pb-32 pt-32 md:px-10">
        <div className="mx-auto max-w-[1040px]">
          <header>
            <div className="font-techno text-[10px] uppercase tracking-[0.48em] text-[hsl(var(--brand-signal))]">
              · {CASES.length} accesses
            </div>
            <h1 className="mt-4 font-display text-[clamp(2.5rem,6vw,4.5rem)] font-medium leading-[0.95] tracking-[-0.04em] text-[hsl(var(--brand-bone))]">
              The first class that matches.
            </h1>
            <p className="mt-6 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-bone-dim))]">
              Every other permission system you have met is additive. Roles, groups in a directory
              service, IAM policies, the access control lists bolted on beside these very bits: in
              all of them rights accumulate, and being in one more group can only help. So the
              model arrives fully formed and wrong, because these nine bits pick exactly one of the
              three sets and ignore the other two entirely.
            </p>
            <p className="mt-4 max-w-2xl font-mono-tight text-sm leading-relaxed text-[hsl(var(--brand-ash))]">
              Own the file and you get the owner bits. Not the owner bits plus the group bits. If
              they say you cannot write it then you cannot write it, no matter that the group can,
              no matter that the whole world can, and no matter that you are in the group as well.
              First match wins, and a more permissive later class never rescues a restrictive
              earlier one.
            </p>
          </header>

          <ul className="mt-11 grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="permission-list">
            {CASES.map((item) => (
              <li key={item.slug}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-pressed={active.slug === item.slug}
                  data-testid={`permission-${item.slug}`}
                  className={`flex h-full w-full flex-col rounded-xl border p-3.5 text-left transition-colors ${
                    active.slug === item.slug
                      ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.06)]"
                      : "border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] hover:border-[hsl(var(--brand-signal)/0.4)]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-signal))]">
                      {OPERATION_LABEL[item.operation]}
                    </span>
                    {mounted && solved.includes(item.slug) ? (
                      <span className="font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                        called
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 font-mono-tight text-[12.5px] leading-snug text-[hsl(var(--brand-bone))]">
                    {item.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <section className="mt-8 rounded-2xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-graphite)/0.5)] p-6">
            <h2 className="font-display text-lg font-medium leading-snug text-[hsl(var(--brand-bone))]">
              {active.title}
            </h2>
            <p
              className="mt-3 font-mono-tight text-[13.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
              data-testid="permission-brief"
            >
              {active.brief}
            </p>

            {/* ── who you are ── */}
            <div className="mt-6 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
              <p className="whitespace-nowrap font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
                <span className="text-[hsl(var(--brand-cyan))]">$</span> id
                <br />
                uid={active.actor.user === "root" ? "0" : "1001"}(
                <span className="text-[hsl(var(--brand-bone))]">{active.actor.user}</span>) groups=
                {active.actor.groups.map((group, index) => (
                  <span key={group}>
                    {index > 0 ? "," : ""}
                    <span className="text-[hsl(var(--brand-bone))]">{group}</span>
                  </span>
                ))}
              </p>

              {/* ── the tree ── */}
              <table className="mt-4 w-full min-w-[560px] border-collapse text-left">
                <caption className="sr-only">
                  The path, one directory per row, as ls -l would print it. Once you have
                  answered, each row says which of the three sets of bits applied to you, what it
                  holds, and what the operation needed.
                </caption>
                {/*
                  The header row is hidden rather than absent. On screen this is meant to read as
                  terminal output, where a column of headings would be wrong, and a table with no
                  headings at all leaves a screen reader announcing five unlabelled cells per row.
                */}
                <thead className="sr-only">
                  <tr>
                    {["Mode", "Owner and group", "Octal", "Name", "Outcome"].map((head) => (
                      <th key={head} scope="col">
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody data-testid="permission-tree">
                  {active.path.map((node, index) => (
                    <TreeRow
                      key={index}
                      node={node}
                      index={index}
                      depth={index}
                      isTarget={index === last}
                      step={answered ? stepFor(index) : undefined}
                      answered={answered}
                      stoppedAt={stoppedAt}
                      operation={active.operation}
                    />
                  ))}
                </tbody>
              </table>

              <p className="mt-4 whitespace-nowrap font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone))]">
                <span className="text-[hsl(var(--brand-cyan))]">
                  {active.actor.user === "root" ? "#" : "$"}
                </span>{" "}
                {active.command}
              </p>
            </div>

            {/* ── the call ── */}
            <h3 className="mt-7 font-techno text-[10px] uppercase tracking-[0.32em] text-[hsl(var(--brand-signal))]">
              · Does it work
            </h3>
            <div className="mt-3 space-y-2">
              {active.options.map((option) => {
                const picked = chosen === option.id;
                const correct = option.id === active.answer;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => answer(option.id)}
                    disabled={answered}
                    data-testid={`permission-option-${option.id}`}
                    className={`block w-full rounded-xl border px-4 py-3 text-left font-mono-tight text-[13px] leading-relaxed transition-colors disabled:cursor-default ${
                      !answered
                        ? "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-bone-dim))] hover:border-[hsl(var(--brand-signal)/0.5)] hover:text-[hsl(var(--brand-bone))]"
                        : correct
                          ? "border-[hsl(var(--brand-signal)/0.8)] bg-[hsl(var(--brand-signal)/0.1)] text-[hsl(var(--brand-bone))]"
                          : picked
                            ? "border-[hsl(var(--brand-danger)/0.8)] bg-[hsl(var(--brand-danger)/0.1)] text-[hsl(var(--brand-bone))]"
                            : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))]"
                    }`}
                  >
                    {option.claim}
                  </button>
                );
              })}
            </div>

            {answered ? (
              <div className="mt-5 space-y-4" data-testid="permission-verdict" aria-live="polite">
                <p className="font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
                  {right ? "Yes." : "No."}{" "}
                  {verdict.kind === "allowed"
                    ? "The call succeeds."
                    : refusal(active, verdict.at, verdict.reason)}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-signal)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-signal))]">
                    Why ·{" "}
                  </span>
                  {active.why}
                </p>
                <p className="border-l-2 border-[hsl(var(--brand-amber)/0.6)] pl-4 font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                  <span className="font-techno text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--brand-amber))]">
                    The belief this breaks ·{" "}
                  </span>
                  {active.breaks}.
                </p>
                <button
                  type="button"
                  onClick={() => open(active)}
                  data-testid="permission-again"
                  className="rounded-full border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-[11.5px] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))]"
                >
                  Clear the answer
                </button>
              </div>
            ) : (
              <p className="mt-5 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-ash))]">
                The tree is unmarked on purpose. Which of the three sets of bits applies to you at
                each row is most of the question, so the page does not answer it before you do.
              </p>
            )}
          </section>

          <p
            className="mt-6 font-mono-tight text-[12px] uppercase tracking-[0.2em] text-[hsl(var(--brand-ash))]"
            aria-live="polite"
            data-testid="permission-progress"
          >
            {mounted
              ? `${solved.length} of ${CASES.length} ${pluralise(CASES.length, "call")} right`
              : " "}
          </p>

          <UmaskPanel umask={umask} onPick={setUmask} />

          <ReadAboutThis href="/permissions" />

          <p className="mt-12 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            Nothing above is written down as an answer. Each case declares which option is correct
            and the verdict comes from a model of the rules, so a case whose prose disagrees with
            its own tree fails the build. The model is checked separately against the rules
            themselves rather than against the cases: that owning a file ends the search, that a
            delete never consults the file, that an unsearchable directory stops everything below
            it, over four thousand generated paths on every commit.
          </p>
          <p className="mt-4 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
            To build a mode rather than read one, there is a{" "}
            <Link
              href="/tools/chmod-calculator"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              permissions calculator
            </Link>{" "}
            in the tools. The same first-match-wins rule, applied to packets instead of files, is
            at the{" "}
            <Link
              href="/firewall"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              firewall exercises
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

/* ------------------------------------------------------------------ rows */

interface RowProps {
  node: Node;
  index: number;
  depth: number;
  isTarget: boolean;
  step?: Step;
  answered: boolean;
  stoppedAt: number;
  operation: Operation;
}

function TreeRow({ node, index, depth, isTarget, step, answered, stoppedAt, operation }: RowProps) {
  const line = symbolic(node);
  const beyond = stoppedAt >= 0 && index > stoppedAt;
  const halted = stoppedAt === index;

  /*
    Three states, and the third is the one worth building for. A row that
    passed, a row that stopped the walk, and a row the kernel never reached.
    The last is struck rather than red: it did not refuse anything, it was
    not asked, and a reader chasing an error message that names it needs to
    see that difference.
  */
  return (
    <tr
      data-testid={`permission-row-${index}`}
      data-state={!answered ? "unmarked" : halted ? "halted" : beyond ? "unreached" : "passed"}
      className={`permission-row align-baseline ${beyond ? "opacity-40" : ""}`}
      style={answered ? { animationDelay: `${index * 110}ms` } : undefined}
    >
      <td className="whitespace-nowrap py-1 pr-4 font-mono-tight text-[12.5px] tabular-nums">
        {answered && step ? (
          <>
            <span className="text-[hsl(var(--brand-ash))]">{line[0]}</span>
            {(["owner", "group", "other"] as Klass[]).map((klass) => (
              <span
                key={klass}
                className={
                  step.using === klass
                    ? halted
                      ? "text-[hsl(var(--brand-danger))]"
                      : "text-[hsl(var(--brand-signal))]"
                    : "text-[hsl(var(--brand-ash)/0.35)]"
                }
              >
                {line.slice(SPAN[klass][0], SPAN[klass][1])}
              </span>
            ))}
          </>
        ) : (
          <span className="text-[hsl(var(--brand-bone-dim))]">{line}</span>
        )}
      </td>
      <td className="whitespace-nowrap py-1 pr-4 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash))]">
        {node.owner} {node.group}
      </td>
      <td className="whitespace-nowrap py-1 pr-4 font-mono-tight text-[11.5px] text-[hsl(var(--brand-ash)/0.7)]">
        {octal(node.mode)}
      </td>
      <td className="w-full py-1 font-mono-tight text-[12.5px]">
        <span style={{ paddingLeft: `${depth * 0.85}rem` }} className="text-[hsl(var(--brand-bone))]">
          {node.name}
          {node.kind === "dir" && node.name !== "/" ? "/" : ""}
        </span>
        {answered && step ? (
          <span className="ml-3 font-mono-tight text-[11px] text-[hsl(var(--brand-ash))]">
            {step.bypassed
              ? "root, so no check"
              : `${CLASS_LABEL[step.using]} ${triad(step.has)}, needs ${
                  step.needs === 0 ? "nothing" : triad(step.needs)
                }`}
          </span>
        ) : null}
        {node.note ? (
          <span className="ml-3 font-mono-tight text-[11px] italic text-[hsl(var(--brand-ash)/0.75)]">
            {node.note}
          </span>
        ) : null}
        {answered && isTarget && node.interpreted && operation === "execute" ? (
          <span className="ml-3 font-mono-tight text-[11px] text-[hsl(var(--brand-amber))]">
            a script, so the interpreter has to read it too
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap py-1 pl-3 text-right font-techno text-[10px] uppercase tracking-[0.18em]">
        {!answered ? null : halted ? (
          <span className="text-[hsl(var(--brand-danger))]">stops here</span>
        ) : beyond ? (
          <span className="text-[hsl(var(--brand-ash)/0.6)]">not reached</span>
        ) : (
          <span className="text-[hsl(var(--brand-signal))]">pass</span>
        )}
      </td>
    </tr>
  );
}

/** The sentence under the verdict, which is different for every way of failing. */
function refusal(item: Case, at: number, reason: Reason): string {
  const node = item.path[at];
  const where = pathOf(item.path, at);
  const target = item.path[item.path.length - 1];
  switch (reason) {
    case "search":
      return `The walk stops at ${where}. You have no execute bit there, and execute on a directory is search, so nothing below it was ever consulted.`;
    case "directory-write":
      return `You can enter ${where} and not change the list of names it holds, which is what creating and deleting are.`;
    case "sticky":
      return `${where} is sticky. In a writable directory that restricts removing and renaming to the owner of the file, and ${target.name} belongs to ${target.owner}.`;
    case "no-exec-bit":
      return `Root skips the permission check, and here there is no permission check to skip: nothing in ${octal(node.mode)} says this file is a program.`;
    case "bits":
    default: {
      const klass = classFor(item.actor, node);
      return `You reach ${where} and the ${CLASS_LABEL[klass]} bits are the only ones consulted. They are ${triad(
        bitsFor(node.mode, klass),
      )} and this needs ${triad(onTarget(node, item.operation))}.`;
    }
  }
}

/* ----------------------------------------------------------------- umask */

/**
 * The mask is a mask, and everybody learns it by watching 022 turn 666 into
 * 644, which is also what subtracting gives. It keeps agreeing for 002 and
 * 022 and 077, which between them are almost every umask anybody sets, so
 * the wrong method survives for years and then quietly produces 653 where
 * the kernel produces 664.
 */
function UmaskPanel({ umask, onPick }: { umask: number; onPick: (value: number) => void }) {
  const rows = [
    { label: "touch a file", born: BORN_FILE },
    { label: "mkdir a directory", born: BORN_DIR },
  ];
  const disagrees = rows.some((row) => applyUmask(row.born, umask) !== naiveSubtract(row.born, umask));

  return (
    <section className="mt-14" data-testid="umask-panel">
      <h2 className="font-techno text-[11px] uppercase tracking-[0.4em] text-[hsl(var(--brand-signal))]">
        · And the arithmetic that is not arithmetic
      </h2>
      <p className="mt-3 max-w-2xl font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-ash))]">
        A umask clears bits. It does not subtract, and the reason nearly everybody believes it
        subtracts is that for the two or three masks anybody actually sets, the two methods give
        the same answer. Pick one of the others and they part company.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {MASKS.map((mask) => (
          <button
            key={mask.value}
            type="button"
            onClick={() => onPick(mask.value)}
            aria-pressed={umask === mask.value}
            data-testid={`umask-${octal(mask.value)}`}
            className={`rounded-full border px-3.5 py-1.5 font-mono-tight text-[12px] transition-colors ${
              umask === mask.value
                ? "border-[hsl(var(--brand-signal)/0.7)] bg-[hsl(var(--brand-signal)/0.08)] text-[hsl(var(--brand-bone))]"
                : "border-[hsl(var(--brand-iron))] text-[hsl(var(--brand-ash))] hover:border-[hsl(var(--brand-signal)/0.5)]"
            }`}
          >
            umask {octal(mask.value)}
          </button>
        ))}
      </div>
      <p className="mt-3 font-mono-tight text-[12px] text-[hsl(var(--brand-ash))]">
        {MASKS.find((mask) => mask.value === umask)?.note}
      </p>

      <div className="mt-5 overflow-x-auto rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] p-4">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr>
              {["", "Born as", "Masked", "Subtracted", "Result"].map((head) => (
                <th
                  key={head}
                  scope="col"
                  className="pb-2 pr-4 font-techno text-[9.5px] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody data-testid="umask-rows">
            {rows.map((row) => {
              const masked = applyUmask(row.born, umask);
              const naive = naiveSubtract(row.born, umask);
              const same = masked === naive;
              return (
                <tr key={row.label} data-testid={`umask-row-${row.born.toString(8)}`}>
                  <td className="py-1.5 pr-4 font-mono-tight text-[12.5px] text-[hsl(var(--brand-bone-dim))]">
                    {row.label}
                  </td>
                  <td className="py-1.5 pr-4 font-mono-tight text-[12.5px] tabular-nums text-[hsl(var(--brand-ash))]">
                    {octal(row.born)}
                  </td>
                  <td className="py-1.5 pr-4 font-mono-tight text-[12.5px] tabular-nums text-[hsl(var(--brand-signal))]">
                    {octal(masked)}
                  </td>
                  <td
                    className={`py-1.5 pr-4 font-mono-tight text-[12.5px] tabular-nums ${
                      same ? "text-[hsl(var(--brand-ash))]" : "text-[hsl(var(--brand-danger))]"
                    }`}
                  >
                    {octal(naive)}
                  </td>
                  <td className="py-1.5 font-mono-tight text-[12px] text-[hsl(var(--brand-bone-dim))]">
                    {symbolic({
                      name: "",
                      kind: row.born === BORN_DIR ? "dir" : "file",
                      owner: "",
                      group: "",
                      mode: masked,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p
        className="mt-3 font-mono-tight text-[12.5px] leading-relaxed text-[hsl(var(--brand-bone-dim))]"
        aria-live="polite"
        data-testid="umask-verdict"
      >
        {disagrees
          ? "The two disagree here, and the masked column is the one the kernel produces. Subtracting borrows across digits and clamps at zero; masking clears bit by bit and never touches a bit the mask does not name."
          : "The two agree here, which is exactly the problem: this is one of the handful of masks that let the wrong method survive."}
      </p>
      <p className="mt-3 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
        Files are born 666 and directories 777, and the execute bit a file never gets is why a
        script needs a chmod after you write it. A mask cannot add a bit, so no umask makes a new
        file executable and none of them can hand out setuid either.
      </p>
    </section>
  );
}
