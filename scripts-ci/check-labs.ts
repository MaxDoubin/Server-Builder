/**
 * Every lab must be solvable by its own recorded solution.
 *
 * A lab is a simulated machine plus a predicate that says when the reader has
 * finished. Both drift: a command's output format changes, a scene's file
 * moves, a predicate is tightened. When they drift apart the lab becomes
 * unsolvable, and the only way anyone finds out is a reader spending an hour
 * on something that cannot be done.
 *
 * So each lab ships a transcript that solves it, and this replays it through
 * the real shell against a real build of the machine. That proves three
 * things at once: the lab is solvable, the predicate matches the intended
 * route, and every command the solution uses still works.
 *
 * It also checks the negative: an empty session must NOT report solved. A
 * predicate that is true before the reader types anything is the other way
 * this breaks, and it is invisible from the inside.
 *
 * Usage: npx tsx scripts-ci/check-labs.ts
 */

import { LABS } from "../client/src/lib/labs/labs";
import { runLine } from "../client/src/lib/labs/shell";
import { REGISTRY } from "../client/src/lib/labs/commands/index";

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

for (const lab of LABS) {
  if (lab.solution.length === 0) {
    note(lab.slug, "has no recorded solution");
    continue;
  }
  if (lab.hints.length === 0) note(lab.slug, "has no hints");
  if (lab.debrief.length === 0) note(lab.slug, "has no debrief");

  /* The negative: nothing typed, nothing solved. */
  if (lab.solved(lab.build())) {
    note(lab.slug, "reports solved before the reader has typed anything");
  }

  /* The positive: the recorded transcript solves it. */
  const machine = lab.build();
  const transcript: string[] = [];
  for (const line of lab.solution) {
    machine.history.push(line);
    const result = runLine(line, machine, REGISTRY);
    const text = result.lines.map((l) => `${l.stream === "err" ? "! " : "  "}${l.text}`).join("\n");
    transcript.push(`$ ${line}\n${text}`);

    /*
      A solution step that errors is a bug, even when the lab still passes.

      The permissions lab and the log-reading lab both shipped solutions in
      which every real command failed (Operation not permitted, Permission
      denied) and the final `answer` still satisfied the predicate, so the
      gate was green and neither lab was solvable. Checking only the
      predicate checks the last line of the transcript.

      Matched on failure shapes rather than on exit status, because plenty of
      legitimate steps exit non-zero: grep with no match is 1, and
      `systemctl is-active` on a failed unit is 3.
    */
    const BROKEN = [
      /: command not found$/,
      /Permission denied/,
      /Operation not permitted/,
      /No such file or directory/,
      /only understands/,
      /is not supported/,
      /not available in this lab/,
      /could not be found/,
      /invalid regular expression/,
      /unterminated quote/,
    ];
    for (const line of result.lines) {
      if (line.stream !== "err") continue;
      if (BROKEN.some((pattern) => pattern.test(line.text))) {
        note(lab.slug, `a solution step errored: ${line.text}`);
      }
    }
  }

  if (!lab.solved(machine)) {
    note(lab.slug, "its own recorded solution does not solve it");
    if (process.env.LAB_DEBUG) console.error(transcript.join("\n\n"));
  }
}

/* Reading links must resolve, same rule as the branching scenarios. */
const { postIndex } = await import("../client/src/lib/postIndex");
const { TOOLS } = await import("../client/src/lib/toolsRegistry");
const known = new Set([
  ...postIndex.map((post) => `/blog/${post.slug}`),
  ...TOOLS.map((tool) => `/tools/${tool.slug}`),
  "/labs", "/blog", "/tools", "/study", "/ncl", "/scenarios",
]);
for (const lab of LABS) {
  for (const link of lab.reading ?? []) {
    if (!known.has(link.href.split("#")[0].replace(/\/$/, ""))) {
      note(lab.slug, `reading link "${link.href}" does not resolve`);
    }
  }
}

if (LABS.length === 0) {
  console.error("FAIL  no labs are registered, so this check proved nothing.");
  process.exit(1);
}

if (problems.length) {
  console.error(`FAIL  ${problems.length} problem(s) in the hands-on labs:\n`);
  for (const problem of problems) console.error(`        ${problem}`);
  console.error("\n      Re-run with LAB_DEBUG=1 to see the failing transcript.");
  process.exit(1);
}

const steps = LABS.reduce((sum, lab) => sum + lab.solution.length, 0);
console.log(
  `OK  ${LABS.length} labs, ${steps} solution steps replayed through the real shell, all solvable.`,
);
