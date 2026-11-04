#!/usr/bin/env tsx
/**
 * Known-answer tests for the tools in client/src/lib/toolkit.
 *
 * Every tool there was checked by a second reader against the standard it
 * implements before it shipped: published test vectors, worked examples from
 * the RFC or specification, boundary values, malformed input and, for the
 * parsers, structured fuzzing. Those checks are the files in
 * scripts-ci/toolkit-tests, one per tool, and this runs all of them.
 *
 * Each file is run in its own process, so one tool's failure cannot hide
 * another's. A file passes when it exits zero and says "passed" somewhere in
 * its output (the files count their own checks and word it a little
 * differently, "104 assertions passed", "21 test groups passed", "all tests
 * passed"). A file that exits non-zero, or never says it passed, fails.
 *
 * Usage: npx tsx scripts-ci/run-toolkit-tests.ts [name ...]
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const DIR = "scripts-ci/toolkit-tests";

/*
  Helper modules a test imports for their side effects. They are part of
  another file's run and have nothing to run on their own.
*/
const HELPERS = new Set([
  "endianness-converter.verifier.ts",
  "ieee754-inspector.verifier.ts",
  "route-summarizer.verify.test.ts",
  "ip-address-converter.verify.test.ts",
]);

const wanted = process.argv.slice(2);
const files = readdirSync(DIR)
  .filter((name) => name.endsWith(".test.ts") && !HELPERS.has(name))
  .filter((name) => wanted.length === 0 || wanted.some((w) => name.startsWith(w)))
  .sort();

if (files.length === 0) {
  console.error("run-toolkit-tests: no test files matched.");
  process.exit(1);
}

const failures: string[] = [];
let checks = 0;

for (const file of files) {
  const started = Date.now();
  const run = spawnSync("npx", ["tsx", `${DIR}/${file}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const passed = out.match(/\bpassed\b/i);
  if (run.status !== 0 || !passed) {
    failures.push(`${file}: ${run.status !== 0 ? `exit ${run.status}` : "no pass line"}\n${out.split("\n").slice(-12).join("\n")}`);
    continue;
  }
  const counted = out.match(/(\d+) (?:tests?|assertions?|test groups?|groups?|cases?) passed/i);
  if (counted) checks += Number(counted[1]);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (wanted.length > 0) console.log(`  ok  ${file.replace(".test.ts", "")}  ${counted ? counted[0] : "passed"}  ${seconds}s`);
}

if (failures.length > 0) {
  console.error(`\nFAIL  run-toolkit-tests: ${failures.length} of ${files.length} files failed\n`);
  for (const failure of failures) console.error(`${failure}\n`);
  process.exit(1);
}
console.log(`OK  all ${files.length} toolkit test files passed (${checks} counted checks in the files that report a count).`);
