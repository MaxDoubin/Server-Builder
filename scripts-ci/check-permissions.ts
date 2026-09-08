/**
 * The permission cases have to be right, and the model has to be right about
 * the thing the cases are teaching.
 *
 * Two halves, and the second is the one I would have skipped.
 *
 * The first half is bookkeeping: every case declares which option is correct,
 * the model works out what actually happens, and the two have to agree. That
 * catches a case whose prose says denied and whose data says allowed, which
 * is a mistake I made twice while writing them.
 *
 * The second half tests the model against the rules rather than against
 * itself. The cases were written by hand and checked by hand, so if check()
 * had the additive-permissions bug the cases are about, I would have had to
 * notice it by reading. Instead there are properties here, stated as the
 * rules are stated and checked over generated inputs: that owning a file
 * ends the search, that a delete never consults the file, that an
 * unsearchable ancestor stops everything below it. Those are the three
 * things the surface exists to teach. A model that got any of them wrong
 * would teach the opposite with complete confidence, and the fourteen cases
 * would still all pass.
 */

import { readFileSync } from "node:fs";
import { CASES } from "../client/src/lib/permissions/data/cases";
import {
  bitsFor,
  check,
  classFor,
  applyUmask,
  inheritedGroup,
  naiveSubtract,
  octal,
  onTarget,
  pathOf,
  stickyBlocks,
  symbolic,
  triad,
} from "../client/src/lib/permissions/model";
import { EXEC, STICKY, type Actor, type Node, type Operation } from "../client/src/lib/permissions/types";

const problems: string[] = [];
const OPERATIONS: Operation[] = ["read", "write", "execute", "list", "create", "delete"];

/* ------------------------------------------------------- the cases */

const slugs = new Set<string>();
const breaks = new Set<string>();
const positions = new Map<number, number>();
let allowed = 0;

for (const item of CASES) {
  const where = `${item.slug}`;
  if (slugs.has(item.slug)) problems.push(`${where}: two cases share this slug`);
  slugs.add(item.slug);

  if (breaks.has(item.breaks)) {
    problems.push(
      `${where}: breaks "${item.breaks}", which another case already breaks. Fourteen cases teaching one thing is one case.`,
    );
  }
  breaks.add(item.breaks);
  if (item.breaks.length < 30) problems.push(`${where}: the belief it breaks is too short to be one`);
  if (item.why.length < 200) problems.push(`${where}: the explanation is too short to explain anything`);
  if (item.brief.length < 100) problems.push(`${where}: the brief does not set up a situation`);

  /* The command has to name the path the case is about, or the two have drifted. */
  const full = pathOf(item.path);
  if (!item.command.includes(full)) {
    problems.push(`${where}: the command does not mention ${full}, so the prompt and the tree disagree`);
  }

  /* Everything above the target is a directory, or the walk is nonsense. */
  for (let i = 0; i < item.path.length - 1; i += 1) {
    if (item.path[i].kind !== "dir") problems.push(`${where}: ${item.path[i].name} is in the path and is not a directory`);
  }

  const ids = new Set(item.options.map((option) => option.id));
  if (item.options.length !== 4) problems.push(`${where}: has ${item.options.length} options rather than four`);
  if (ids.size !== item.options.length) problems.push(`${where}: two options share an id`);
  const correct = item.options.find((option) => option.id === item.answer);
  if (!correct) {
    problems.push(`${where}: the answer "${item.answer}" is not one of the options`);
    continue;
  }

  /*
    Every claim has to commit to a verdict in the same words, so that the
    check below can compare them and so that a reader is answering the same
    question every time.
  */
  const verdictOf = (claim: string): boolean | null =>
    claim.startsWith("It works") ? true : claim.startsWith("It fails") ? false : null;
  for (const option of item.options) {
    if (verdictOf(option.claim) === null) {
      problems.push(`${where}: option ${option.id} does not open with "It works" or "It fails"`);
    }
    if (option.claim.length < 40) problems.push(`${where}: option ${option.id} is too short to be a claim`);
  }

  const verdict = check(item.path, item.actor, item.operation);
  const truth = verdict.kind === "allowed";
  if (truth) allowed += 1;

  if (verdictOf(correct.claim) !== truth) {
    problems.push(
      `${where}: the answer says "${correct.claim.slice(0, 30)}" and the model says ${
        truth ? "allowed" : "denied"
      }. One of them is wrong and it is not the model.`,
    );
  }

  /*
    At least two options have to assert the truth's verdict.
    
    Otherwise the reader picks the only "It works" among three failures and
    is right without having understood anything, which is the same shape as
    an exam question whose answer is the longest option.
  */
  const agreeing = item.options.filter((option) => verdictOf(option.claim) === truth).length;
  if (agreeing < 2) {
    problems.push(
      `${where}: only one option says ${truth ? "it works" : "it fails"}, so the verdict alone gives the answer away`,
    );
  }

  const position = item.options.findIndex((option) => option.id === item.answer);
  positions.set(position, (positions.get(position) ?? 0) + 1);
}

if (CASES.length < 10) problems.push(`only ${CASES.length} cases, which is too few to cover the rules`);

/* A reader who always answers denied should not do well. */
if (allowed < CASES.length * 0.25) {
  problems.push(
    `only ${allowed} of ${CASES.length} cases succeed. Answering denied every time would score ${
      Math.round(((CASES.length - allowed) / CASES.length) * 100
    )}%.`,
  );
}

/* Nor should a reader who always picks the same position. */
for (const [position, count] of positions) {
  if (count > CASES.length * 0.4) {
    problems.push(`the answer is in position ${position + 1} for ${count} of ${CASES.length} cases`);
  }
}

/* Every way the model can refuse has to be somewhere in the set. */
const reasons = new Set(
  CASES.map((item) => check(item.path, item.actor, item.operation)).flatMap((verdict) =>
    verdict.kind === "denied" ? [verdict.reason] : [],
  ),
);
for (const reason of ["search", "directory-write", "bits", "sticky", "no-exec-bit"]) {
  if (!reasons.has(reason as never)) {
    problems.push(`no case ends in a "${reason}" denial, so that rule is written and never demonstrated`);
  }
}

/* ------------------------------------------- the model, against the rules */

/**
 * A reproducible generator, and then a check that it generated anything.
 *
 * The first version of this used a linear congruential generator masked to
 * 31 bits and took `next() % n` for every choice. The low bits of an LCG with
 * a power-of-two modulus have a period of two, four, eight, and `% 6` locked
 * onto a subset of the operations: in four thousand rounds it produced zero
 * deletes and zero successful accesses. Every property below was passing on a
 * corpus that never reached a target node, which is to say passing on
 * nothing, and it would have kept doing that through any bug in the model.
 *
 * So two changes. Xorshift, whose bits are usable at both ends. And, more to
 * the point, the corpus is now measured before the properties are trusted: if
 * the generated paths do not include successes, and deletes, and walks that
 * reach the last node, the gate fails on that rather than reporting OK.
 */
let seed = 0x5eed1e5;
const next = () => {
  seed ^= seed << 13;
  seed >>>= 0;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  seed >>>= 0;
  return seed;
};
const pick = <T,>(list: T[]): T => list[next() % list.length];

const USERS = ["alina", "bruno", "mikhail", "jenkins"];
const GROUPS = ["alina", "bruno", "staff", "deploy", "engineering"];

/**
 * Modes that occur, mixed with modes that do not.
 *
 * Purely random modes give a walk that dies at the first directory almost
 * every time, which tests the first hop over and over. The realistic pool
 * pulls the sample towards paths that go somewhere, and the random half keeps
 * the corner cases in.
 */
const REAL_MODES = [
  0o755, 0o750, 0o700, 0o775, 0o711, 0o710, 0o644, 0o640, 0o600, 0o666, 0o664,
  0o1777, 0o2775, 0o2755, 0o000, 0o004,
];

const randomMode = () => (next() % 5 < 3 ? pick(REAL_MODES) : next() % 0o10000);

function randomNode(kind: "dir" | "file"): Node {
  return { name: `${kind[0]}${next() % 100}`, kind, owner: pick(USERS), group: pick(GROUPS), mode: randomMode() };
}

function randomCase(): { path: Node[]; actor: Actor; operation: Operation } {
  const depth = 2 + (next() % 3);
  const path: Node[] = [];
  for (let i = 0; i < depth; i += 1) path.push(randomNode("dir"));
  path.push(randomNode(next() % 2 === 0 ? "file" : "dir"));
  return {
    path,
    actor: { user: pick(USERS), groups: [pick(GROUPS), pick(GROUPS)] },
    operation: pick(OPERATIONS),
  };
}

const ROUNDS = 6000;
const failures: string[] = [];
const note = (message: string) => {
  if (!failures.includes(message)) failures.push(message);
};

/** What the corpus actually contained, checked afterwards. */
const seenOps = new Map<Operation, number>();
let succeeded = 0;
let reachedTarget = 0;
let stickyDeletes = 0;
let ownedTarget = 0;

for (let round = 0; round < ROUNDS; round += 1) {
  const { path, actor, operation } = randomCase();
  const last = path.length - 1;
  const verdict = check(path, actor, operation);

  seenOps.set(operation, (seenOps.get(operation) ?? 0) + 1);
  if (verdict.kind === "allowed") succeeded += 1;
  if (verdict.steps.length === path.length) reachedTarget += 1;
  if (operation === "delete" && (path[last - 1].mode & STICKY) !== 0) stickyDeletes += 1;
  if (path[last].owner === actor.user) ownedTarget += 1;

  /*
    triad() renders three bits, and a reader believes what it renders.

    Round-tripped rather than compared against a table, because a table would
    be a second copy of the same mapping. Every value it prints has to parse
    back to the bits it was given, and each letter has to appear exactly when
    its bit is set.
  */
  for (const bits of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const rendered = triad(bits);
    if (rendered.length !== 3) problems.push(`round ${round}: triad(${bits}) is "${rendered}"`);
    const back =
      (rendered[0] === "r" ? 4 : 0) + (rendered[1] === "w" ? 2 : 0) + (rendered[2] === "x" ? 1 : 0);
    if (back !== bits) problems.push(`round ${round}: triad(${bits}) reads back as ${back}`);
    if ((rendered[0] === "r") !== ((bits & 4) !== 0)) problems.push(`round ${round}: triad(${bits}) got read wrong`);
    if ((rendered[1] === "w") !== ((bits & 2) !== 0)) problems.push(`round ${round}: triad(${bits}) got write wrong`);
    if ((rendered[2] === "x") !== ((bits & 1) !== 0)) problems.push(`round ${round}: triad(${bits}) got execute wrong`);
  }

  /*
    stickyBlocks() is the sticky bit, and it protects the name rather than the
    bytes: on a sticky directory, only the file's owner or the directory's
    owner may unlink it, whatever the directory's write bit says.

    Three properties, because all three are ways to get it wrong. It must
    never fire without the bit. It must never block the target's owner. And
    it must never block the directory's owner, which is the clause people
    forget, because it is what lets root's /tmp be tidied by root.
  */
  if (last >= 1) {
    const parent = path[last - 1];
    const target = path[last];
    const blocked = stickyBlocks(parent, target, actor);
    if (blocked && (parent.mode & STICKY) === 0) {
      problems.push(`round ${round}: sticky blocked a delete on a directory with no sticky bit`);
    }
    if (blocked && actor.user === target.owner) {
      problems.push(`round ${round}: sticky blocked ${actor.user} from unlinking its own file`);
    }
    if (blocked && actor.user === parent.owner) {
      problems.push(`round ${round}: sticky blocked the directory's own owner`);
    }
    /* And with the bit set and neither ownership, it must fire. */
    const sticky = { ...parent, mode: parent.mode | STICKY, owner: "somebody-else" };
    const notOurs = { ...target, owner: "somebody-else" };
    if (actor.user !== "somebody-else" && !stickyBlocks(sticky, notOurs, actor)) {
      problems.push(`round ${round}: sticky did not block a stranger unlinking a stranger's file`);
    }
  }

  /*
    inheritedGroup() is setgid on a directory, which decides what group a new
    file gets. Without it the file takes the creator's primary group, which is
    the default nobody notices until a shared directory stops being shared.
  */
  {
    const parent = path[Math.max(0, last - 1)];
    const withSetgid = { ...parent, mode: parent.mode | 0o2000 };
    const withoutSetgid = { ...parent, mode: parent.mode & ~0o2000 };
    if (inheritedGroup(withSetgid, actor) !== parent.group) {
      problems.push(`round ${round}: setgid on ${parent.name} did not pass on its group`);
    }
    if (inheritedGroup(withoutSetgid, actor) !== actor.groups[0]) {
      problems.push(`round ${round}: without setgid the new file did not take the creator's group`);
    }
    /* And the two disagree exactly when the groups differ, which is the point. */
    const same = parent.group === actor.groups[0];
    const agrees = inheritedGroup(withSetgid, actor) === inheritedGroup(withoutSetgid, actor);
    if (agrees !== same) {
      problems.push(`round ${round}: setgid changed nothing on a directory whose group differs`);
    }
  }

  /*
    Rule: the class is the first one that matches, so on a node the actor
    owns, the group and other bits are not consulted. Changing them must
    change nothing. This is the property the whole surface is about, and an
    additive implementation fails it on the first owned node.
  */
  const scrambled = path.map((node) =>
    node.owner === actor.user ? { ...node, mode: (node.mode & 0o7700) | (next() % 0o100) } : node,
  );
  if (JSON.stringify(check(scrambled, actor, operation)) !== JSON.stringify(verdict)) {
    note(`changing the group and other bits of a node the actor owns changed the verdict for a ${operation}`);
  }

  /*
    Rule: a delete is a directory operation, so whether it succeeds does not
    depend on the target's mode. Compared on the verdict rather than on the
    whole walk, because the walk records what each node holds and that is the
    thing being changed.
  */
  if (operation === "delete") {
    const other = [...path];
    other[last] = { ...other[last], mode: randomMode() };
    const again = check(other, actor, "delete");
    if (again.kind !== verdict.kind) {
      note("changing the mode of the file being deleted changed whether the delete succeeded");
    }
  }

  /*
    Rule: an ancestor without search permission stops the walk, so nothing
    below it can succeed however permissive it is.
  */
  const blocked = path.slice(0, last).some((node) => (bitsFor(node.mode, classFor(actor, node)) & EXEC) === 0);
  if (blocked && verdict.kind === "allowed") {
    note(`an unsearchable directory on the path did not stop a ${operation}`);
  }

  /* Rule: more bits never take access away. */
  const open = check(path.map((node) => ({ ...node, mode: 0o777 })), actor, operation);
  if (open.kind !== "allowed") {
    note(`0777 on everything still denied a ${operation}`);
  }

  /*
    Rule: root is refused exactly once, for executing something with no
    execute bit anywhere. Everything else it asks for succeeds.
  */
  const asRoot = check(path, { user: "root", groups: ["root"] }, operation);
  const shouldRefuse = operation === "execute" && (path[last].mode & 0o111) === 0;
  if ((asRoot.kind === "denied") !== shouldRefuse) {
    note(`root got ${asRoot.kind} for a ${operation} on mode ${octal(path[last].mode)}`);
  }
}

/*
  And now the part the first version of this file did not have. A property
  that never met an input it could fail on is a comment.
*/
for (const operation of OPERATIONS) {
  const count = seenOps.get(operation) ?? 0;
  if (count < ROUNDS / 20) {
    problems.push(`the generator produced ${count} ${operation} cases out of ${ROUNDS}, so that operation is barely tested`);
  }
}
if (succeeded < ROUNDS / 20) {
  problems.push(
    `only ${succeeded} of ${ROUNDS} generated accesses succeeded. The properties below are checked against denials and never against a walk that finished.`,
  );
}
if (reachedTarget < ROUNDS / 20) {
  problems.push(
    `only ${reachedTarget} of ${ROUNDS} walks reached the last node, so the rules about the target itself are barely exercised`,
  );
}
if (stickyDeletes < 20) problems.push(`only ${stickyDeletes} generated deletes were in a sticky directory`);
if (ownedTarget < ROUNDS / 20) problems.push(`the actor owned the target in only ${ownedTarget} of ${ROUNDS} cases`);

for (const failure of failures) problems.push(`the model breaks its own rule: ${failure}`);

/* Sticky only ever affects a delete, which is easy to get wrong by putting the check too early. */
{
  const parent: Node = { name: "t", kind: "dir", owner: "root", group: "root", mode: 0o1777 };
  const target: Node = { name: "f", kind: "file", owner: "jenkins", group: "jenkins", mode: 0o666 };
  const root: Node = { name: "/", kind: "dir", owner: "root", group: "root", mode: 0o755 };
  const alina: Actor = { user: "alina", groups: ["alina"] };
  for (const operation of OPERATIONS) {
    const withSticky = check([root, parent, target], alina, operation);
    const without = check([root, { ...parent, mode: parent.mode & ~STICKY }, target], alina, operation);
    const differs = JSON.stringify(withSticky) !== JSON.stringify(without);
    if (differs !== (operation === "delete")) {
      problems.push(
        `the sticky bit ${differs ? "changed" : "did not change"} a ${operation}, and it should ${
          operation === "delete" ? "" : "not "
        }have`,
      );
    }
  }
}

/* An interpreted file needs read as well as execute, and nothing else changes. */
{
  const script: Node = { name: "s.sh", kind: "file", owner: "root", group: "root", mode: 0o711, interpreted: true };
  const binary: Node = { ...script, name: "s", interpreted: undefined };
  if (onTarget(script, "execute") === onTarget(binary, "execute")) {
    problems.push("a script and a binary need the same bits to run, and they do not");
  }
  for (const operation of OPERATIONS.filter((op) => op !== "execute")) {
    if (onTarget(script, operation) !== onTarget(binary, operation)) {
      problems.push(`being a script changed what ${operation} needs, and it should not have`);
    }
  }
}

/* ------------------------------------------------------------ the umask */

/*
  The claim on the page is that subtracting works for the masks everybody
  uses and fails for the rest. Both halves are checked, because the page
  makes both and either one being wrong makes the point backwards.
*/
for (const umask of [0o002, 0o022, 0o077]) {
  for (const born of [0o666, 0o777]) {
    if (applyUmask(born, umask) !== naiveSubtract(born, umask)) {
      problems.push(`the page says subtracting works for umask ${octal(umask)}, and for ${octal(born)} it does not`);
    }
  }
}
let diverges = 0;
for (let umask = 0; umask <= 0o777; umask += 1) {
  if (applyUmask(0o666, umask) !== naiveSubtract(0o666, umask)) diverges += 1;
}
if (diverges < 100) {
  problems.push(`subtracting only disagrees with masking for ${diverges} of 512 masks, which is not a trap worth naming`);
}

/* ------------------------------------------------------------ rendering */

if (symbolic({ name: "t", kind: "dir", owner: "r", group: "r", mode: 0o1777 }) !== "drwxrwxrwt") {
  problems.push(`symbolic() does not render the sticky bit as a t: got ${symbolic({ name: "t", kind: "dir", owner: "r", group: "r", mode: 0o1777 })}`);
}
if (symbolic({ name: "p", kind: "dir", owner: "r", group: "r", mode: 0o2755 }) !== "drwxr-sr-x") {
  problems.push(`symbolic() does not render setgid: got ${symbolic({ name: "p", kind: "dir", owner: "r", group: "r", mode: 0o2755 })}`);
}
/* The capital is the interesting one: a special bit set where there is no execute under it. */
if (symbolic({ name: "p", kind: "dir", owner: "r", group: "r", mode: 0o2745 }) !== "drwxr-Sr-x") {
  problems.push(`symbolic() does not use a capital S when the execute bit under setgid is absent`);
}
if (octal(0o1777) !== "1777" || octal(0o644) !== "644") {
  problems.push(`octal() renders the high bits wrong: ${octal(0o1777)} and ${octal(0o644)}`);
}

/* -------------------------------------------------------------- the page */

/*
  And the page has to render the model's walk rather than the case's prose.
  Checking that the file imports check() is satisfied by an unused import,
  which is the mistake this file's neighbours have each made once, so this
  looks for the call and for the steps being mapped over.
*/
const page = readFileSync("client/src/pages/cinematic/CinematicPermissions.tsx", "utf8");
/*
  This list started as a check for `.steps.map(`, which the page failed while
  rendering the steps perfectly well: it looks them up per row rather than
  mapping the array. Checking for one way of writing something is not
  checking that it was done, so what is here now is the four values a reader
  has to be able to see. Which class the kernel picked, what that class
  holds, and what the operation needed are the working. A page showing only
  the verdict is an oracle, and an oracle teaches nothing.
*/
for (const [pattern, complaint] of [
  [/check\(/, "does not call check(), so the verdict it shows is not the model's"],
  [/verdict\.steps/, "never reads the walk out of the verdict"],
  [/step\.using/, "does not show which class the kernel picked, which is the whole lesson"],
  [/step\.has/, "does not show what that class holds"],
  [/step\.needs/, "does not show what the operation needed"],
  [/symbolic\(/, "does not render the ls line, so the tree is not what a reader would see on a terminal"],
  [/recordSolvedPermission\(/, "does not record progress, so the surface forgets on reload"],
  [/<ReadAboutThis\s/, "does not link the articles behind it"],
] as [RegExp, string][]) {
  if (!pattern.test(page)) problems.push(`the page ${complaint}`);
}

if (problems.length) {
  console.error(`\ncheck-permissions: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} cases, ${allowed} of them succeeding, ${breaks.size} distinct beliefs broken, ` +
    `every denial reason demonstrated, and the model held its own rules over ${ROUNDS} generated paths ` +
    `(${succeeded} of them succeeding, ${reachedTarget} reaching the last node).`,
);
