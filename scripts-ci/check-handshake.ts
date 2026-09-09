/**
 * A handshake has to be a conversation, and a break has to stop it somewhere.
 *
 * The failure this guards is a break whose stopsAt drifts past the end of the
 * sequence, or lands on a step the message could not have reached. The page
 * would still render: it would draw a diagram, gray out nothing, and describe
 * a symptom that belongs to a step that does not exist.
 */

import { HANDSHAKES } from "../client/src/lib/handshake/data/handshakes";

const problems: string[] = [];
const note = (slug: string, message: string) => problems.push(`${slug}: ${message}`);

const seen = new Set<string>();
let stepCount = 0;
let breakCount = 0;
const owners = new Set<string>();

for (const handshake of HANDSHAKES) {
  if (seen.has(handshake.slug)) note(handshake.slug, "duplicate slug");
  seen.add(handshake.slug);
  stepCount += handshake.steps.length;
  breakCount += handshake.breaks.length;

  if (handshake.steps.length < 3) note(handshake.slug, "fewer than three steps is not a handshake");
  if (handshake.breaks.length < 3) note(handshake.slug, "fewer than three breaks");
  if (handshake.brief.length < 2) note(handshake.slug, "the brief is too thin");
  if (handshake.notes.length < 1) note(handshake.slug, "no closing notes");

  handshake.steps.forEach((step, index) => {
    if (step.n !== index + 1) {
      note(handshake.slug, `step ${index + 1} is numbered ${step.n}; numbering must match order`);
    }
    if (step.from === step.to) {
      note(handshake.slug, `step ${step.n} goes from ${step.from} to itself`);
    }
    if (!step.label.trim()) note(handshake.slug, `step ${step.n} has no label`);
    if (!step.detail.trim()) note(handshake.slug, `step ${step.n} has no detail`);
    if (step.carries.length === 0) note(handshake.slug, `step ${step.n} carries nothing`);
  });

  /*
    A conversation alternates, unless a step says it is continuing a flight.

    The first version of this rule had no exception and flagged TLS 1.3 and
    802.1X, both of which really do send two messages in a row in the same
    direction. The rule was wrong rather than the data. But dropping it
    entirely would stop catching a direction copied from the line above, so
    the exception has to be declared on the step rather than assumed.
  */
  for (let i = 1; i < handshake.steps.length; i += 1) {
    const previous = handshake.steps[i - 1];
    const current = handshake.steps[i];
    if (previous.from === current.from && previous.to === current.to && !current.sameFlight) {
      note(
        handshake.slug,
        `steps ${previous.n} and ${current.n} both go ${previous.from} to ${previous.to}. Mark it sameFlight if that is deliberate, otherwise a step is missing or a direction was copied.`,
      );
    }
    if (current.sameFlight && (previous.from !== current.from || previous.to !== current.to)) {
      note(
        handshake.slug,
        `step ${current.n} claims to continue a flight and goes the other way from step ${previous.n}`,
      );
    }
  }

  const breakIds = new Set<string>();
  for (const item of handshake.breaks) {
    if (breakIds.has(item.id)) note(handshake.slug, `duplicate break id ${item.id}`);
    breakIds.add(item.id);
    owners.add(item.owner);

    if (item.stopsAt < 1 || item.stopsAt > handshake.steps.length) {
      note(
        handshake.slug,
        `break "${item.id}" stops at step ${item.stopsAt}, and there are ${handshake.steps.length} steps`,
      );
    }
    if (!item.symptom.trim()) note(handshake.slug, `break "${item.id}" has no symptom`);
    if (item.explain.length < 2) note(handshake.slug, `break "${item.id}" explains too little`);
  }

  /*
    Breaks must not all stop in the same place. A set that all stop at step one
    is four ways of saying "it did not start", and the whole point is that the
    stopping point is the diagnosis.
  */
  const stops = new Set(handshake.breaks.map((item) => item.stopsAt));
  if (stops.size < 2) {
    note(handshake.slug, `every break stops at step ${[...stops][0]}; the stopping point is the diagnosis`);
  }

  /* At least one break should reach the final step, or the last step is never exercised. */
  if (!handshake.breaks.some((item) => item.stopsAt === handshake.steps.length)) {
    note(
      handshake.slug,
      `no break reaches step ${handshake.steps.length}, so the last step is never shown failing`,
    );
  }
}

/* The owners have to vary, since attributing the failure is half the exercise. */
if (owners.size < 3) {
  problems.push(`only ${owners.size} distinct owners across every break`);
}

if (problems.length) {
  console.error(`\ncheck-handshake: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

const flights = HANDSHAKES.reduce(
  (sum, handshake) => sum + handshake.steps.filter((step) => step.sameFlight).length,
  0,
);

console.log(
  `OK  ${HANDSHAKES.length} handshakes, ${stepCount} steps whose directions alternate except for ${flights} declared as continuing a flight, ` +
    `${breakCount} breaks that each stop at a real step, across ${owners.size} different parties to fix.`,
);
