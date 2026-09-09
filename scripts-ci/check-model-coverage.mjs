/**
 * Every function a practice model exports has to be named by its gate.
 *
 * Written after the same defect turned up three times in one day, each time
 * found by accident:
 *
 *   availableTo() in the disk-full model had no property at all, so a
 *   deliberate breakage that made it ignore quotas passed 4,000 rounds.
 *   Adding one property immediately found a real bug: a zero block write was
 *   refused because free minus reserved had gone negative.
 *
 *   keyOf() in the cache model had none either. Dropping the Vary-named
 *   headers from the key produced one complaint, and it was about answer
 *   positions, because the four options in each case cover all four possible
 *   answers and a shifted answer still matches exactly one of them.
 *
 *   freshness() in the same model was worse. Its only caller uses it to ask
 *   whether any lifetime is present, so which lifetime it picks was never
 *   observed anywhere, and stopping it reading s-maxage changed nothing.
 *
 * All three were found by breaking the code and noticing that nothing broke.
 * That is a good habit and a bad system, because it only finds what you think
 * to break. This finds the rest mechanically.
 *
 * What this check does and does not claim. Naming a function in a gate is not
 * testing it: a gate could name one and assert nothing useful about it. So
 * this is a floor rather than a proof. What it does establish is the converse,
 * which is worth having on its own: a function its gate never mentions is
 * certainly not exercised by it, and every one of the three above was in
 * exactly that state.
 *
 * Comments are stripped from both sides before matching, so a function named
 * only in a gate's prose does not count as covered. That mattered: two of the
 * nine this first found are mentioned in comments and asserted nowhere.
 *
 *     node scripts-ci/check-model-coverage.mjs
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";

const LIB = "client/src/lib";
const GATES = "scripts-ci";

/**
 * Files that hold no logic to exercise.
 *
 * The first version of this check read model.ts and nothing else, which
 * covered eleven surfaces and was blind to thirteen more that keep their
 * logic under a name of their own: cidr.ts, evaluate.ts, parse.ts, resolver.ts,
 * signals.ts, vfs.ts and the rest. Widening it found 34 more functions no gate
 * named, among them IPv4 parsing, CIDR containment and path resolution, which
 * are the three places on this site where a quiet bug would teach a wrong rule
 * with a straight face.
 *
 * types.ts is declarations. progress.ts is four lines of localStorage that only
 * runs in a browser. index.ts is a re-export barrel, and anything real in it is
 * re-exported from a file this does read.
 */
const NOT_LOGIC = new Set(["types.ts", "progress.ts", "index.ts"]);

/**
 * Functions deliberately left to their gate's discretion, with a reason.
 *
 * Explicit and reasoned, because a silent skip list defeats the check. Empty
 * is the intended state: everything found on the first run got a property
 * rather than an entry here.
 */
const DELIBERATELY_UNCOVERED = {
  "motion/*":
    "six React hooks that read matchMedia, navigator and the scroll position. There is nothing for a Node gate to call, and what they do is exercised by the browser sweep across every route at 1440, 390, light theme and reduced motion, which is where a hook that misreads a preference actually shows up.",
};

/** Comments are prose. A function named only in prose is not exercised. */
const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

/**
 * The functions a model exports.
 *
 * Both shapes the models use: `export function name(` and
 * `export const name = (...) =>`. Exported constants that are not functions
 * are left out, because a table of data has nothing to exercise.
 */
function exportsOf(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]*)?=>/g,
  )) {
    names.add(match[1]);
  }
  return names;
}

const problems = [];
let models = 0;
let functions = 0;

/** The logic files of one surface, in a stable order. */
const logicFiles = (surface) =>
  readdirSync(`${LIB}/${surface}`)
    .filter((name) => name.endsWith(".ts") && !NOT_LOGIC.has(name))
    .sort();

for (const entry of readdirSync(LIB, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const files = logicFiles(entry.name);
  if (files.length === 0) continue;

  /*
    What each file exports, read first, because a directory with nothing to
    exercise needs no gate.

    The first widened version demanded a gate for any directory holding a .ts
    file, and reported lib/racks, which is sixteen files of hardware data
    tables and exports not one function. A check that asks for a gate over
    nothing is the same mistake as a gate that checks nothing.
  */
  const perFile = files.map((file) => ({
    file,
    named: exportsOf(strip(readFileSync(`${LIB}/${entry.name}/${file}`, "utf8"))),
  }));
  const anyFunctions = perFile.some(({ named }) => named.size > 0);
  if (!anyFunctions) continue;

  /*
    The gate that owns this directory.
    
    Named after it, except where the gate is plural and the directory is not:
    client/src/lib/capture is checked by check-captures.ts, which the first
    version of this missed and reported as having no gate at all. A plural is
    the only variation in use, so it is the only one resolved rather than
    searching every gate, which would lose the useful part of the message,
    namely which gate ought to own the function.
  */
  const gate = [
    `${GATES}/check-${entry.name}.ts`,
    `${GATES}/check-${entry.name}.mjs`,
    `${GATES}/check-${entry.name}s.ts`,
    `${GATES}/check-${entry.name}s.mjs`,
  ].find((candidate) => existsSync(candidate));
  if (!gate) {
    /*
      A directory that exports functions and has no gate at all. Reported
      rather than skipped, because that is strictly worse than a function a
      gate forgot, and excusing it needs a reason like anything else.
    */
    if (!DELIBERATELY_UNCOVERED[`${entry.name}/*`]) {
      const exported = perFile.flatMap(({ named }) => [...named]).sort();
      problems.push(
        `${LIB}/${entry.name} exports ${exported.join(", ")} and no ${GATES}/check-${entry.name}` +
          ` exists. Logic with no gate is logic nothing checks. Add one, or add` +
          ` "${entry.name}/*" to DELIBERATELY_UNCOVERED with a reason.`,
      );
    }
    continue;
  }
  models += 1;

  const gateSource = strip(readFileSync(gate, "utf8"));
  for (const { file, named } of perFile) {
    functions += named.size;
    for (const name of [...named].sort()) {
      if (new RegExp(`\\b${name}\\b`).test(gateSource)) continue;
      if (DELIBERATELY_UNCOVERED[`${entry.name}/${name}`]) continue;
      problems.push(
        `${entry.name}: ${name}() is exported by ${file} and never named by ${gate}` +
          ` outside a comment, so nothing there exercises it. Give it a property, or add` +
          ` "${entry.name}/${name}" to DELIBERATELY_UNCOVERED with a reason.`,
      );
    }
  }
}

/* And the other direction: an excuse for something that no longer exists. */
for (const key of Object.keys(DELIBERATELY_UNCOVERED)) {
  const [surface, name] = key.split("/");
  if (!existsSync(`${LIB}/${surface}`)) {
    problems.push(`DELIBERATELY_UNCOVERED names ${key}, and ${LIB}/${surface} does not exist.`);
    continue;
  }
  if (name === "*") {
    if (
      [".ts", ".mjs"].some(
        (extension) =>
          existsSync(`${GATES}/check-${surface}${extension}`) ||
          existsSync(`${GATES}/check-${surface}s${extension}`),
      )
    ) {
      problems.push(`DELIBERATELY_UNCOVERED excuses all of ${surface}, which now has a gate.`);
    }
    continue;
  }
  const found = logicFiles(surface).some((file) =>
    exportsOf(strip(readFileSync(`${LIB}/${surface}/${file}`, "utf8"))).has(name),
  );
  if (!found) problems.push(`DELIBERATELY_UNCOVERED names ${key}, which nothing exports any more.`);
}

if (problems.length) {
  console.error(`check-model-coverage: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const excused = Object.keys(DELIBERATELY_UNCOVERED).length;
console.log(
  `OK  ${functions} functions exported across ${models} surfaces, every one named by its own` +
    ` gate outside a comment${excused ? `, ${excused} deliberately uncovered with a reason` : ""}.`,
);
