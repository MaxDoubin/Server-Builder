/**
 * Every gate in this directory has to actually run.
 *
 * WHY THIS EXISTS. Four gates were written in one day, each blinded a dozen
 * ways to prove it caught what it was for, and none of them was added to
 * ci.yml. Forty-six deliberate breakages, all correctly detected, by scripts
 * that ran on one laptop and on no commit. A check that does not run is a
 * check that tests nothing, which is the failure this whole directory exists
 * to prevent, committed four times in a row against the directory itself.
 *
 * It got past every other gate because nothing here reads the workflow. The
 * scripts were verified by globbing scripts-ci/check-*, which finds a file
 * whether or not anything invokes it, and by a local sweep that used the same
 * glob. Both were measuring the presence of a file.
 *
 * So this reads .github/workflows/ci.yml and compares it against the
 * directory, in both directions. A gate the workflow does not invoke fails
 * the build. A gate the workflow invokes that does not exist fails the build,
 * which catches a rename that updated one side.
 *
 * Anything deliberately left out of CI is named below with its reason, so
 * that skipping is a decision somebody wrote down rather than an omission.
 */

import { readFileSync, readdirSync } from "node:fs";

const WORKFLOW = ".github/workflows/ci.yml";
const DIR = "scripts-ci";

/**
 * Gates that must not run in CI, with the reason.
 *
 * check-sources is the only one, and its own file explains at length why: it
 * makes 977 requests to 90 third parties, so as a build gate it would fail
 * whenever any one of them had a bad minute, the fix would never be in this
 * repository, and everybody would learn to ignore a red build.
 */
const DELIBERATELY_OUT = {
  "check-sources.mjs": "makes 977 requests to 90 third parties; a red build nobody here can fix teaches people to ignore red builds",
};

const problems = [];
const workflow = readFileSync(WORKFLOW, "utf8");

/* Every check-* script in the directory, whatever it is written in. */
const scripts = readdirSync(DIR)
  .filter((name) => /^check-.*\.(mjs|ts)$/.test(name))
  .sort();

if (scripts.length < 20) problems.push(`only ${scripts.length} gates found in ${DIR}, which cannot be right`);

/* Forwards: the workflow has to invoke each one. */
for (const name of scripts) {
  const invoked = workflow.includes(`${DIR}/${name}`);
  const excused = name in DELIBERATELY_OUT;
  if (invoked && excused) {
    problems.push(`${name} is listed as deliberately out of CI and the workflow runs it anyway`);
  }
  if (!invoked && !excused) {
    problems.push(
      `${name} is never invoked by ${WORKFLOW}. Add a step for it, or add it to DELIBERATELY_OUT with a reason. ` +
        `A gate that does not run is a gate that tests nothing.`,
    );
  }
}

/* Backwards: everything the workflow invokes has to exist. */
const present = new Set(scripts);
for (const match of workflow.matchAll(new RegExp(`${DIR}/(check-[a-z0-9-]+\\.(?:mjs|ts))`, "g"))) {
  if (!present.has(match[1])) {
    problems.push(`${WORKFLOW} invokes ${DIR}/${match[1]}, which does not exist. A rename updated one side.`);
  }
}

/*
  And the other scripts the workflow runs from script/, because the same
  omission is possible there and one of them is how this was found: the
  internal-links check is a step in ci.yml that no glob over scripts-ci can
  see, so a local sweep built from that glob reported everything passing
  while CI went red.
*/
for (const match of workflow.matchAll(/script\/([A-Za-z0-9]+\.ts)/g)) {
  try {
    readFileSync(`script/${match[1]}`, "utf8");
  } catch {
    problems.push(`${WORKFLOW} runs script/${match[1]}, which does not exist`);
  }
}

if (problems.length) {
  console.error(`\ncheck-ci-coverage: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

const excused = Object.keys(DELIBERATELY_OUT).length;
console.log(
  `OK  ${scripts.length - excused} of ${scripts.length} gates are invoked by ${WORKFLOW}, ` +
    `${excused} deliberately out with a reason, and every script the workflow names exists.`,
);
