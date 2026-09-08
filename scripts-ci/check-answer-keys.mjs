/**
 * A page must ask the model which option is right, never carry the answer.
 *
 * This is the property every practise surface here is built on. The data
 * carries a situation and some claims about it; the model works out what the
 * situation implies; the page marks the claim that matches. Nothing declares
 * an answer, so prose that has drifted from its own arithmetic cannot pass,
 * and two options that are secretly the same answer are caught by counting
 * the matches instead of trusting an index.
 *
 * It only holds if the page actually asks. A page that reads an answer off
 * its own data looks identical from the outside and reintroduces exactly what
 * the design removes, because the declaration and the model can disagree and
 * the declaration is what the reader sees.
 *
 * Four of twenty-three surface gates read their page, and the two newest did
 * not, which is an inconsistency in one day's work. Rather than paste the
 * same block into each gate and hope the next one remembers, this checks it
 * once for every surface that offers options, so a surface added next month
 * is covered without anybody deciding to cover it.
 *
 * The denominator matters more than the check. An earlier version of this
 * file looked for four function names it already knew about and reported "5
 * of 5 surfaces", which is a pass rate over the set the check had picked:
 * /resolve and /chain both marked an option correct from a hand-typed index
 * and neither appeared in the count at all. So the denominator here is every
 * surface whose data offers options, found by looking for the field rather
 * than from a list, and a surface in it is covered, excused with a reason, or
 * a failure.
 *
 *     node scripts-ci/check-answer-keys.mjs
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";

const LIB = "client/src/lib";
const PAGES = "client/src/pages/cinematic";
const GATES = "scripts-ci";

/**
 * The names a model uses for "which claim is true here".
 *
 * Several shapes are in use and all are fine: correctOption returns the
 * option to mark, canonical returns the value the right option has to carry.
 * A page calling any of them is asking rather than deciding.
 */
const ASKS = ["correctOption", "canonical", "correctAnswer", "answerFor"];

/**
 * Anything else that looks like it decides an answer.
 *
 * Without this, a model that names its answer function something not in the
 * list above makes its surface silently uncovered, which is the failure this
 * file exists to stop and would be embarrassing twice.
 */
const ANSWER_SHAPED = /correct|canonical|answer|verdict|truth/i;

/**
 * Exports that read as answer-shaped and are not, with why.
 *
 * The net above is deliberately wide, so it catches domain vocabulary too. A
 * name here has been looked at and is a fact about the situation rather than
 * a statement about which option to mark, and the difference is whether the
 * page could use it to skip asking.
 */
const NOT_AN_ANSWER = {
  answerTime: "how long a layer takes to answer the one above it, in seconds; a duration",
};

/**
 * Surfaces whose answer is not something a model can compute, with why.
 *
 * Both of these are real and neither is a shortcut. A log case asks what you
 * conclude from prose, and there is no arithmetic under it: the exercise is
 * reading, and the gate checks instead that the right claim cites the
 * deciding line, that the brief does not contain its own answer, and that
 * the answers are spread across the option positions.
 */
const DECIDED_IN_DATA = {
  logs:
    "what a log means is a reading rather than a computation, so there is nothing to derive it" +
    " from; check-logs holds the answer to its citation, its brief and its position instead",
  permissions:
    "the answer is an id and the model returns a verdict, so check-permissions compares the two" +
    " on every case and fails when the marked claim disagrees with what check() decides",
};

/** Comments are prose. A function named only in prose is not called. */
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/** Every .ts file under a surface, data subdirectories included. */
const filesUnder = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return filesUnder(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });

const problems = [];
const pageFiles = readdirSync(PAGES).filter((name) => name.endsWith(".tsx"));

let offering = 0;
let asking = 0;
const excused = [];

for (const entry of readdirSync(LIB, { withFileTypes: true }).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory()) continue;
  const files = filesUnder(`${LIB}/${entry.name}`);
  const sources = files.map((file) => readFileSync(file, "utf8"));

  /* A surface that offers options is a surface where one of them is right. */
  if (!sources.some((source) => /\boptions\??:\s*([A-Za-z]+\[\]|\[)/.test(source))) continue;
  offering += 1;

  /* What this surface's model offers as the answer, and what it nearly does. */
  const offered = new Set();
  for (const source of sources.map(strip)) {
    for (const match of source.matchAll(/export\s+(?:const|function)\s+([A-Za-z][A-Za-z0-9]*)/g)) {
      const name = match[1];
      if (ASKS.includes(name)) offered.add(name);
      else if (ANSWER_SHAPED.test(name) && !(name in NOT_AN_ANSWER)) {
        problems.push(
          `${LIB}/${entry.name} exports ${name}, which looks like it decides an answer and is not` +
            ` a name this check knows. Add it to ASKS if it is one, so the surface is not counted` +
            ` as covered by a function nobody looks for.`,
        );
      }
    }
  }

  const reason = DECIDED_IN_DATA[entry.name];
  if (offered.size === 0) {
    if (!reason) {
      problems.push(
        `${LIB}/${entry.name} offers options and exports none of ${ASKS.join(", ")}, so whichever` +
          ` option is right is written down somewhere rather than worked out. Either derive it or` +
          ` add an entry to DECIDED_IN_DATA saying why it cannot be derived.`,
      );
      continue;
    }
    /* An excused surface still has to be checked, by its own gate. */
    const gate = [`${GATES}/check-${entry.name}.ts`, `${GATES}/check-${entry.name}.mjs`].find(
      (candidate) => existsSync(candidate),
    );
    if (!gate) {
      problems.push(
        `${LIB}/${entry.name} is excused from deriving its answer and has no gate to check the` +
          ` answer it declares, which leaves the declaration checked by nothing at all.`,
      );
    } else if (!/\.answer\b/.test(strip(readFileSync(gate, "utf8")))) {
      problems.push(
        `${gate} does not read the answer its surface declares, so the reason in DECIDED_IN_DATA` +
          ` describes checking that is not happening.`,
      );
    }
    excused.push(entry.name);
    continue;
  }

  if (reason) {
    problems.push(
      `${LIB}/${entry.name} both exports ${[...offered].join(" and ")} and has an entry in` +
        ` DECIDED_IN_DATA. It can derive its answer, so the entry is out of date.`,
    );
  }

  /*
    The page for this surface, matched case-insensitively on the directory
    name: CinematicClock.tsx for lib/clock, CinematicCapture.tsx for
    lib/capture, where the plural is on the gate rather than the page.
  */
  const wanted = `cinematic${entry.name}.tsx`.toLowerCase();
  const page = pageFiles.find((name) => name.toLowerCase() === wanted);
  if (!page) {
    problems.push(
      `${LIB}/${entry.name} exports ${[...offered].join(" and ")} and there is no` +
        ` ${PAGES}/Cinematic${entry.name}.tsx to use it. Either the page is named something else,` +
        ` in which case this check needs to know, or the answer function is dead.`,
    );
    continue;
  }

  const source = strip(readFileSync(`${PAGES}/${page}`, "utf8"));
  const called = [...offered].filter((name) => new RegExp(`\\b${name}\\s*\\(`).test(source));
  if (called.length === 0) {
    problems.push(
      `${page} never calls ${[...offered].join(" or ")}, so it is deciding for itself which option` +
        ` is right. The design of these surfaces is that the data carries no answer and the model` +
        ` works it out.`,
    );
    continue;
  }
  asking += 1;

  /*
    And the half that would slip through. A page that asks the model and also
    reads an answer off the data has two sources of truth for one answer, and
    the one that wins is whichever is used last.
  */
  for (const [pattern, what] of [
    [/\bactive\.answer\b/, "an answer field off the active case"],
    [/\bitem\.answer\b/, "an answer field off the case"],
    [/\.isCorrect\b/, "an isCorrect flag"],
    [/\bcorrect:\s*true\b/, "a hardcoded correct: true"],
  ]) {
    if (pattern.test(source)) {
      problems.push(
        `${page} calls ${called.join(" and ")} and also reads ${what}, which is two sources of` +
          ` truth for one answer, and the one that wins is whichever is used last.`,
      );
    }
  }
}

/* A surface listed as excused that no longer offers options is stale. */
for (const name of Object.keys(DECIDED_IN_DATA)) {
  if (!excused.includes(name)) {
    problems.push(
      `DECIDED_IN_DATA names ${name}, which is not a surface offering options that needs excusing.` +
        ` Either it was renamed or it can derive its answer now.`,
    );
  }
}

if (!statSync(PAGES).isDirectory()) problems.push(`${PAGES} is not there to read`);

if (problems.length) {
  console.error(`check-answer-keys: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${offering} surfaces offer options; ${asking} have a page that asks the model which one is` +
    ` right and reads no answer off their own data, ${excused.length} declare it with a reason` +
    ` their own gate checks (${excused.join(", ")}).`,
);
