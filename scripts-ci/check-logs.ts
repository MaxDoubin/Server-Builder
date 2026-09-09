/**
 * The logs have to look like logs, and the answers have to be findable in
 * them.
 *
 * Three things this checks that nothing else would.
 *
 * Every line survives a round trip through a strict syslog parser. Synthetic
 * logs drift into shapes no daemon emits, and a log that does not look like
 * a log teaches somebody to recognize something they will never see. The
 * parser is deliberately unforgiving, because a permissive one would accept
 * exactly the malformed lines this exists to catch.
 *
 * The deciding line is never part of the noise. That is the pedagogical
 * invariant of the whole surface: a wall of failed passwords is a bot that
 * got nowhere, and the line that matters is the quiet one. A case whose
 * answer is the loudest pattern in its own log is teaching the opposite of
 * the lesson, and it would look completely fine in review.
 *
 * Every distractor is supported by real lines. An option nothing in the log
 * points at is a throwaway: it makes the exercise easier while looking like
 * it makes it harder, and four options where two are obviously filler is a
 * two-option exercise wearing a costume.
 */

import { CASES } from "../client/src/lib/logs/data/cases";
import { parse, render, timeOf } from "../client/src/lib/logs/format";
import type { Case } from "../client/src/lib/logs/types";

const problems: string[] = [];
const slugs = new Set<string>();

for (const item of CASES) {
  if (slugs.has(item.slug)) problems.push(`${item.slug}: two cases share a slug`);
  slugs.add(item.slug);

  if (Number.isNaN(Date.parse(item.epoch))) {
    problems.push(`${item.slug}: the epoch "${item.epoch}" is not a date`);
    continue;
  }
  if (!item.epoch.endsWith("Z")) {
    problems.push(`${item.slug}: the epoch is not UTC, so the rendered clock depends on where the build ran`);
  }

  if (item.lines.length < 6) problems.push(`${item.slug}: ${item.lines.length} lines is not a log to read`);

  /* ------------------------------------------- every line is a real line */

  item.lines.forEach((line, index) => {
    const text = render(item, line);
    const back = parse(text);
    if (!back) {
      problems.push(`${item.slug} line ${index}: does not survive the parser: ${text}`);
      return;
    }
    if (back.host !== line.host || back.process !== line.process || back.message !== line.message) {
      problems.push(
        `${item.slug} line ${index}: round trip changed it, ` +
          `host ${line.host}->${back.host}, process ${line.process}->${back.process}`,
      );
    }
    if (line.message.length < 12) {
      problems.push(`${item.slug} line ${index}: the message says nothing`);
    }
  });

  /* ------------------------------------------------------- the timeline */

  /*
    Logs run forwards. A case where they do not has to declare it, because
    clock skew is a real thing to exercise and a rule written for the common
    case must not quietly exclude the interesting one.
  */
  const backwards = item.lines.filter((line, index) => index > 0 && line.at < item.lines[index - 1].at);
  if (backwards.length && !item.clockSkew) {
    problems.push(
      `${item.slug}: the timestamps go backwards ${backwards.length} time(s) and the case does not declare clockSkew`,
    );
  }
  if (!backwards.length && item.clockSkew) {
    problems.push(`${item.slug}: declares clockSkew and its timestamps run forwards throughout`);
  }
  const span = timeOf(item, item.lines[item.lines.length - 1]).getTime() - timeOf(item, item.lines[0]).getTime();
  if (span <= 0 && !item.clockSkew) {
    problems.push(`${item.slug}: the whole log happens at one instant`);
  }

  /* ------------------------------------------------------- the question */

  const ids = new Set(item.options.map((option) => option.id));
  if (ids.size !== item.options.length) problems.push(`${item.slug}: two options share an id`);
  if (item.options.length < 3) problems.push(`${item.slug}: ${item.options.length} options is not a choice`);
  if (!ids.has(item.answer)) problems.push(`${item.slug}: the answer "${item.answer}" is not one of its options`);

  if (item.deciding < 0 || item.deciding >= item.lines.length) {
    problems.push(`${item.slug}: the deciding line index ${item.deciding} is not a line`);
    continue;
  }

  /*
    The right answer has to cite the deciding line. An answer supported only
    by other lines means either the citation or the answer is wrong, and both
    look correct on their own.
  */
  const right = item.options.find((option) => option.id === item.answer)!;
  if (!right.supportedBy.includes(item.deciding)) {
    problems.push(
      `${item.slug}: the answer "${item.answer}" does not cite line ${item.deciding}, which is the line said to settle it`,
    );
  }

  for (const option of item.options) {
    if (option.supportedBy.length === 0) {
      problems.push(`${item.slug}: option "${option.id}" has nothing in the log pointing at it, so it is filler`);
    }
    for (const index of option.supportedBy) {
      if (index < 0 || index >= item.lines.length) {
        problems.push(`${item.slug}: option "${option.id}" cites line ${index}, which does not exist`);
      }
    }
    if (option.claim.length < 25) problems.push(`${item.slug}: option "${option.id}" is too terse to judge`);
  }

  /* --------------------------------- the deciding line is not the noise */

  if (item.noise) {
    const noisy = item.lines
      .map((line, index) => ({ index, hit: line.message.includes(item.noise!) }))
      .filter((row) => row.hit)
      .map((row) => row.index);
    if (noisy.length < 3) {
      problems.push(
        `${item.slug}: the declared noise "${item.noise}" appears on ${noisy.length} line(s), which is not a loud pattern`,
      );
    }
    if (noisy.includes(item.deciding)) {
      problems.push(
        `${item.slug}: the deciding line is part of the noise. The whole point of this surface is that the loudest ` +
          `pattern is not the answer, and this case teaches the opposite.`,
      );
    }
  }

  /*
    The most repeated message shape in a log is its noise whether or not the
    case names it, so the invariant is checked either way. Two lines that
    differ only in numbers are the same shape.
  */
  const shapes = new Map<string, number[]>();
  item.lines.forEach((line, index) => {
    const shape = line.message.replace(/\d+/g, "#").slice(0, 60);
    shapes.set(shape, [...(shapes.get(shape) ?? []), index]);
  });
  let loudest: [string, number[]] | null = null;
  for (const entry of shapes) {
    if (!loudest || entry[1].length > loudest[1].length) loudest = entry;
  }
  if (loudest && loudest[1].length >= 4 && loudest[1].includes(item.deciding)) {
    problems.push(
      `${item.slug}: the deciding line is one of ${loudest[1].length} lines with the same shape, so it cannot be the ` +
        `one that settles anything. Either the answer is the noise or the citation points at the wrong row.`,
    );
  }

  /* ----------------------------------------------- no giving it away */

  if (item.brief.length < 100) problems.push(`${item.slug}: the brief is too short to reason from`);
  if (item.why.length < 120) problems.push(`${item.slug}: the explanation does not explain`);

  /*
    The brief must not contain the answer. A brief that names the conclusion
    turns the exercise into reading comprehension.
  */
  const brief = item.brief.toLowerCase();
  for (const word of right.claim.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 6)) {
    /*
      Generic infrastructure nouns are not a giveaway. "traffic" appearing in
      both the brief and the answer to a firewall question says nothing; the
      check is for a brief that names the conclusion.
    */
    const GENERIC = ["service", "process", "network", "traffic", "connection", "message", "request", "certificate", "database", "filesystem", "clients", "seconds", "minutes"];
    if (brief.includes(word) && !GENERIC.includes(word)) {
      problems.push(`${item.slug}: the brief contains "${word}" from its own answer`);
    }
  }
}

/* Facilities should be spread, or the surface is one kind of log wearing eight hats. */
const facilities = new Set(CASES.map((item) => item.facility));
if (facilities.size < 5) {
  problems.push(`only ${facilities.size} kinds of log across ${CASES.length} cases; that is one surface, not eight`);
}

/* The answers should be spread across the option positions, or the position is the answer. */
const positions = CASES.map((item: Case) => item.options.findIndex((option) => option.id === item.answer));
const counts = new Map<number, number>();
for (const position of positions) counts.set(position, (counts.get(position) ?? 0) + 1);
for (const [position, count] of counts) {
  if (count > Math.ceil(CASES.length / 2)) {
    problems.push(
      `${count} of ${CASES.length} answers are option ${position + 1}; a reader who always picks that one passes`,
    );
  }
}

if (problems.length) {
  console.error(`\ncheck-logs: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} cases across ${facilities.size} kinds of log, ` +
    `${CASES.reduce((sum, item) => sum + item.lines.length, 0)} lines all surviving a strict syslog parser, ` +
    `every deciding line outside its log's loudest pattern, and every option supported by real lines.`,
);
