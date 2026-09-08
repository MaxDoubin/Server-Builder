/**
 * Every function a practise model exports has to be named by its gate.
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
 * Functions deliberately left to their gate's discretion, with a reason.
 *
 * Explicit and reasoned, because a silent skip list defeats the check. Empty
 * is the intended state: everything found on the first run got a property
 * rather than an entry here.
 */
const DELIBERATELY_UNCOVERED = {};

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

for (const entry of readdirSync(LIB, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue;
  const model = `${LIB}/${entry.name}/model.ts`;
  if (!existsSync(model)) continue;
  models += 1;

  const gate = `${GATES}/check-${entry.name}.ts`;
  if (!existsSync(gate)) {
    problems.push(
      `${model} exists and ${gate} does not. A model with no gate is a model nothing checks.`,
    );
    continue;
  }

  const named = exportsOf(strip(readFileSync(model, "utf8")));
  functions += named.size;
  const gateSource = strip(readFileSync(gate, "utf8"));

  for (const name of [...named].sort()) {
    if (new RegExp(`\\b${name}\\b`).test(gateSource)) continue;
    const excused = DELIBERATELY_UNCOVERED[`${entry.name}/${name}`];
    if (excused) continue;
    problems.push(
      `${entry.name}: ${name}() is exported by the model and never named by ${gate}` +
        ` outside a comment, so nothing there exercises it. Give it a property, or add` +
        ` "${entry.name}/${name}" to DELIBERATELY_UNCOVERED with a reason.`,
    );
  }
}

/* And the other direction: an excuse for something that no longer exists. */
for (const key of Object.keys(DELIBERATELY_UNCOVERED)) {
  const [surface, name] = key.split("/");
  const model = `${LIB}/${surface}/model.ts`;
  if (!existsSync(model) || !exportsOf(strip(readFileSync(model, "utf8"))).has(name)) {
    problems.push(`DELIBERATELY_UNCOVERED names ${key}, which the model no longer exports.`);
  }
}

if (problems.length) {
  console.error(`check-model-coverage: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const excused = Object.keys(DELIBERATELY_UNCOVERED).length;
console.log(
  `OK  ${functions} functions exported by ${models} practise models, every one named by its own` +
    ` gate outside a comment${excused ? `, ${excused} deliberately uncovered with a reason` : ""}.`,
);
