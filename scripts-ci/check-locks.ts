/**
 * The three locking interfaces, checked by keeping the kernel's books rather
 * than by asking the same three questions a second time.
 *
 * The model is five conditions in a row, which is the right shape for a page
 * and the wrong shape for a check. Every interesting property here is about
 * OWNERSHIP, and a condition can encode ownership backwards and still look
 * right on most cases: get "the process" and "the open file description" the
 * wrong way round and eight of the eighteen measured cells still agree.
 *
 * So the gate below keeps a table. Open file descriptions, descriptors
 * pointing at them, processes holding descriptors, and lock records on two
 * separate lists with an owner each. Then it replays each case as the sequence
 * of syscalls it describes: open, lock, maybe open and close another, maybe
 * fork and unlock, then the second party's open and lock. Whether the second
 * party gets it falls out of the table, and so does whether the holder still
 * has anything by the time it is asked.
 *
 * The fixtures at the bottom are the measured matrices: every combination of
 * the three interfaces, taken twice, once between two processes and once
 * inside one, plus fork, the unrelated close, and byte ranges.
 */
import { CASES } from "../client/src/lib/locks/data/cases";
import {
  EVENTS,
  asLocks,
  bothShared,
  callOf,
  claimHolds,
  correctOption,
  granted,
  humanRange,
  identity,
  lostBecause,
  overlaps,
  ownerOf,
  sameOwner,
  stillHeld,
  why,
  world,
} from "../client/src/lib/locks/model";
import type { Event, Kind, Party, Setup } from "../client/src/lib/locks/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------------- the kernel's own books */

interface Record_ {
  /** Which of the two lists this record is on. */
  list: "flock" | "record";
  /** Who it belongs to: a process, or an open file description. */
  owner: string;
  start: number;
  /** Exclusive end, Infinity for to the end of the file. */
  end: number;
  exclusive: boolean;
}

/**
 * One file, and everything pointing at it.
 *
 * Descriptions are numbered as they are opened. A descriptor is a process and
 * a description. A fork copies every descriptor the parent holds and does NOT
 * copy the descriptions, which is the whole of why flock behaves as it does.
 */
class File_ {
  private nextDescription = 1;
  private nextFd = 1;
  private fds = new Map<number, { process: string; description: number }>();
  private records: Record_[] = [];

  open(process: string): number {
    const fd = this.nextFd++;
    this.fds.set(fd, { process, description: this.nextDescription++ });
    return fd;
  }

  /** Copy every descriptor the parent holds. Returns parent descriptor to child descriptor. */
  fork(parent: string, child: string): Map<number, number> {
    const inherited = new Map<number, number>();
    for (const [fd, held] of [...this.fds]) {
      if (held.process !== parent) continue;
      const copy = this.nextFd++;
      this.fds.set(copy, { process: child, description: held.description });
      inherited.set(fd, copy);
    }
    return inherited;
  }

  /** Who a lock taken through this descriptor with this interface belongs to. */
  private ownerFor(fd: number, kind: Kind): string {
    const held = this.fds.get(fd);
    if (!held) throw new Error(`no such descriptor ${fd}`);
    if (kind === "fcntl") return `process ${held.process}`;
    if (kind === "flock") return `flock on description ${held.description}`;
    return `description ${held.description}`;
  }

  private listFor(kind: Kind): "flock" | "record" {
    return kind === "flock" ? "flock" : "record";
  }

  /** Try to take a lock. Returns whether it was granted. */
  lock(fd: number, kind: Kind, start: number, length: number, exclusive: boolean): boolean {
    const list = this.listFor(kind);
    const owner = this.ownerFor(fd, kind);
    /* flock is always the whole file whatever range the caller had in mind. */
    const from = kind === "flock" ? 0 : start;
    const to = kind === "flock" ? Infinity : length === 0 ? Infinity : start + length;
    for (const record of this.records) {
      if (record.list !== list) continue;
      if (record.owner === owner) continue;
      if (record.start >= to || from >= record.end) continue;
      if (!record.exclusive && !exclusive) continue;
      return false;
    }
    this.records = this.records.filter(
      (record) => !(record.list === list && record.owner === owner && record.start === from && record.end === to),
    );
    this.records.push({ list, owner, start: from, end: to, exclusive });
    return true;
  }

  unlock(fd: number, kind: Kind): void {
    const list = this.listFor(kind);
    const owner = this.ownerFor(fd, kind);
    this.records = this.records.filter((record) => !(record.list === list && record.owner === owner));
  }

  /**
   * Close a descriptor.
   *
   * Two rules, and the first is the one people lose a day to. Closing ANY
   * descriptor to the file drops every fcntl record this process holds on it,
   * however it was taken. Then, if that was the last descriptor referring to
   * the description, the description's own records go too, which is the
   * ordinary way a flock or an open file description lock ends.
   */
  close(fd: number): void {
    const held = this.fds.get(fd);
    if (!held) throw new Error(`no such descriptor ${fd}`);
    this.fds.delete(fd);
    this.records = this.records.filter((record) => record.owner !== `process ${held.process}`);
    const stillOpen = [...this.fds.values()].some((other) => other.description === held.description);
    if (!stillOpen) {
      this.records = this.records.filter(
        (record) =>
          record.owner !== `description ${held.description}` &&
          record.owner !== `flock on description ${held.description}`,
      );
    }
  }

  /** Whether a record taken through this descriptor with this interface is still there. */
  holds(fd: number, kind: Kind): boolean {
    const owner = this.ownerFor(fd, kind);
    const list = this.listFor(kind);
    return this.records.some((record) => record.list === list && record.owner === owner);
  }
}

/** Replay a case as the sequence of syscalls it describes. */
function replay(setup: Setup): { granted: boolean; stillHeld: boolean } {
  const file = new File_();
  const holderFd = file.open("A");
  file.lock(holderFd, setup.held, setup.holderStart, setup.holderLength, setup.holderExclusive);

  let children = 0;
  for (const event of setup.events) {
    if (event === "closed another descriptor") {
      const other = file.open("A");
      file.close(other);
    }
    if (event === "the child unlocked") {
      const child = `C${++children}`;
      const inherited = file.fork("A", child);
      file.unlock(inherited.get(holderFd)!, setup.held);
    }
  }

  const held = file.holds(holderFd, setup.held);

  let askerFd: number;
  if (setup.asker === "another process") askerFd = file.open("B");
  else if (setup.asker === "the same process, a second descriptor") askerFd = file.open("A");
  else {
    const child = `C${++children}`;
    askerFd = file.fork("A", child).get(holderFd)!;
  }
  const got = file.lock(askerFd, setup.asking, setup.askerStart, setup.askerLength, setup.askerExclusive);
  return { granted: got, stillHeld: held };
}

/* -------------------------------------------------------- the cases agree */

for (const item of CASES) {
  const run = replay(item.setup);
  if (run.granted !== granted(item.setup)) {
    fail(`${item.slug}: replaying the syscalls ${run.granted ? "granted" : "refused"} the second party and the model says ${granted(item.setup) ? "granted" : "refused"}`);
  }
  if (run.stillHeld !== stillHeld(item.setup)) {
    fail(`${item.slug}: after the events the table ${run.stillHeld ? "still has" : "no longer has"} the holder's record and the model says ${stillHeld(item.setup)}`);
  }
}


/* ---------------------------------------- what the model can actually say */

const KINDS: Kind[] = ["fcntl", "flock", "ofd"];
const PARTIES: Party[] = ["another process", "the same process, a second descriptor", "the forked child"];

/** Every setup the model can be handed, so a claim naming a string can be checked against them. */
function* everySetup(): Generator<Setup> {
  for (const held of KINDS) {
    for (const asking of KINDS) {
      for (const asker of PARTIES) {
        for (const events of [[], ["closed another descriptor"], ["the child unlocked"]] as Event[][]) {
          for (const [hs, hl, as_, al] of [[0, 0, 0, 0], [0, 100, 200, 100], [0, 100, 50, 100], [0, 100, 100, 100]] as const) {
            for (const hx of [true, false]) {
              for (const ax of [true, false]) {
                yield {
                  host: "h", path: "/f", held, holderStart: hs, holderLength: hl, holderExclusive: hx,
                  asking, asker, askerStart: as_, askerLength: al, askerExclusive: ax, events: [...events],
                };
              }
            }
          }
        }
      }
    }
  }
}

/** Reasons that mean the request went through, so a reason can be checked against the outcome. */
const GRANTING = new Set([
  "flock and fcntl keep separate lists and do not see each other",
  "the byte ranges do not overlap",
  "two shared locks do not conflict",
]);

/**
 * The reasons in the order the page means to give them, written here rather
 * than read out of the model.
 *
 * why() walks its conditions in an order, and more than one of them is often
 * true at once: a second descriptor in the holder's own process asking for a
 * range nobody holds satisfies both the range rule and the ownership rule.
 * Which one it names is what the reader takes away, and nothing else in this
 * file would notice the two being swapped, because the outcome is granted
 * either way. So the precedence is stated once, here, and compared.
 */
const PRECEDENCE: { holds: (setup: Setup) => boolean; reason: (setup: Setup) => string }[] = [
  { holds: (setup) => !stillHeld(setup), reason: lostBecause },
  {
    holds: (setup) => world(setup.asking) !== world(setup.held),
    reason: () => "flock and fcntl keep separate lists and do not see each other",
  },
  { holds: (setup) => !overlaps(setup), reason: () => "the byte ranges do not overlap" },
  { holds: (setup) => bothShared(setup), reason: () => "two shared locks do not conflict" },
  { holds: (setup) => sameOwner(setup), reason: (setup) => `both locks belong to ${identity(setup.held, "the holder")}` },
  { holds: () => true, reason: (setup) => `a conflicting lock is held by ${identity(setup.held, "the holder")}` },
];

const REACHABLE_WHY = new Set<string>();
const REACHABLE_OWNER = new Set<string>();
for (const setup of everySetup()) {
  REACHABLE_WHY.add(why(setup));
  REACHABLE_OWNER.add(ownerOf(setup.held));
  /*
    The reason has to agree with the outcome. Without this the ordering inside
    why() is only held up by the ten cases, and a reason that is true but not
    the first true one reads as a different lesson.
  */
  const reason = why(setup);
  const grantedHere = granted(setup);
  const expected = PRECEDENCE.find((rule) => rule.holds(setup))!.reason(setup);
  if (reason !== expected) {
    fail(`the model gives "${reason}" where the first true reason is "${expected}", for ${setup.held} against ${setup.asking} asked by ${setup.asker}`);
  }
  if (GRANTING.has(reason) && !grantedHere) {
    fail(`the model refuses ${setup.held} against ${setup.asking} and gives "${reason}" as the reason`);
  }
  if (!GRANTING.has(reason) && grantedHere && !reason.startsWith("both locks belong") && !stillHeld(setup) === false) {
    fail(`the model grants ${setup.held} against ${setup.asking} and gives "${reason}" as the reason`);
  }

  /* The replay and the model must agree on every one of them, not only on the ten. */
  const run = replay(setup);
  if (run.granted !== granted(setup) || run.stillHeld !== stillHeld(setup)) {
    fail(
      `the table and the model disagree on ${setup.held} held by A, ${setup.asking} asked by ${setup.asker}` +
        `${setup.events.length ? `, after ${setup.events.join(" and ")}` : ""}: ` +
        `table says ${run.granted ? "granted" : "refused"} and held ${run.stillHeld}, ` +
        `model says ${granted(setup) ? "granted" : "refused"} and held ${stillHeld(setup)}`,
    );
  }
}

/* ------------------------------------------------------- the cases hold up */

const slugs = new Set<string>();
const breaks = new Set<string>();
const names = new Set<string>();
const setups = new Set<string>();
const positions: number[] = [];

for (const item of CASES) {
  const where = item.slug;
  if (slugs.has(item.slug)) fail(`${where}: two cases share a slug`);
  slugs.add(item.slug);
  if (breaks.has(item.breaks)) fail(`${where}: two cases break the same belief, "${item.breaks}"`);
  breaks.add(item.breaks);
  if (names.has(item.name)) fail(`${where}: two cases share a name`);
  names.add(item.name);
  const shape = JSON.stringify(item.setup);
  if (setups.has(shape)) fail(`${where}: two cases have the same setup, so one of them teaches nothing new`);
  setups.add(shape);

  for (const [field, value] of Object.entries(item.setup)) {
    if (typeof value !== "number") continue;
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is a count of bytes`);
  }
  for (const event of item.setup.events) {
    if (!EVENTS.includes(event)) fail(`${where}: the event "${event}" is not one the model applies`);
  }
  if (item.setup.held === "flock" && item.setup.holderLength !== 0) {
    fail(`${where}: the holder used flock, which is always the whole file, but the case states a length`);
  }

  const held = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (held.length !== 1) fail(`${where}: ${held.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

  const seen = new Set<string>();
  for (const option of item.options) {
    const shapeOf = JSON.stringify(option.says);
    if (seen.has(shapeOf)) fail(`${where}: two options make the same claim, so one of them cannot be wrong on its own`);
    seen.add(shapeOf);
    if (option.says.about === "why" && !REACHABLE_WHY.has(option.says.name)) {
      fail(`${where}/${option.id}: "${option.says.name}" is not a reason the model ever gives, so this option is false for the wrong reason`);
    }
    if (option.says.about === "owner" && !REACHABLE_OWNER.has(option.says.name)) {
      fail(`${where}/${option.id}: "${option.says.name}" is not a thing a lock belongs to`);
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== held[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asLocks(item.setup);
  if (lines.length !== 6) fail(`${where}: asLocks rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) {
    if (!line.name || !line.value || !line.unit) fail(`${where}: an asLocks line is missing a part`);
  }
  if (!lines[1].unit.includes("difference")) fail(`${where}: the ownership line has to say why it matters`);
  if (!lines[5].unit.includes("flock keeps its own")) fail(`${where}: the list line has to say which list is which`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* ------------------------------------------- the measured matrices reproduce

    Two processes, the holder already locked, both exclusive, whole file:

      holder     fcntl asks   flock asks   OFD asks
      fcntl      blocked      GRANTED      blocked
      flock      GRANTED      blocked      GRANTED
      OFD        blocked      GRANTED      blocked

    The same, but the asker is a second descriptor in the holder's process.
    One cell moves, and it is fcntl against fcntl:

      holder     fcntl asks   flock asks   OFD asks
      fcntl      GRANTED      GRANTED      blocked
      flock      GRANTED      blocked      GRANTED
      OFD        blocked      GRANTED      blocked
*/
{
  const base: Setup = {
    host: "the host these came from", path: "/tmp/lockprobe.dat",
    held: "fcntl", holderStart: 0, holderLength: 0, holderExclusive: true,
    asking: "fcntl", asker: "another process", askerStart: 0, askerLength: 0, askerExclusive: true,
    events: [],
  };
  const OUTSIDE: Record<string, string[]> = {
    fcntl: ["blocked", "granted", "blocked"],
    flock: ["granted", "blocked", "granted"],
    ofd: ["blocked", "granted", "blocked"],
  };
  const INSIDE: Record<string, string[]> = {
    fcntl: ["granted", "granted", "blocked"],
    flock: ["granted", "blocked", "granted"],
    ofd: ["blocked", "granted", "blocked"],
  };
  for (const [party, table] of [["another process", OUTSIDE], ["the same process, a second descriptor", INSIDE]] as const) {
    for (const held of KINDS) {
      KINDS.forEach((asking, column) => {
        const setup: Setup = { ...base, held, asking, asker: party as Party };
        const measured = table[held][column] === "granted";
        if (granted(setup) !== measured) {
          fail(`measured: ${held} held, ${asking} asked by ${party}, was ${table[held][column]} and the model says ${granted(setup) ? "granted" : "blocked"}`);
        }
      });
    }
  }

  /* Closing an unrelated descriptor: fcntl loses the lock, the other two keep it. */
  for (const [held, keeps] of [["fcntl", false], ["flock", true], ["ofd", true]] as const) {
    const setup: Setup = { ...base, held, asking: held, events: ["closed another descriptor"] };
    if (stillHeld(setup) !== keeps) {
      fail(`measured: after an unrelated close a ${held} lock was ${keeps ? "still held" : "gone"} and the model says ${stillHeld(setup)}`);
    }
    if (granted(setup) === keeps) {
      fail(`measured: after an unrelated close an outsider ${keeps ? "was refused" : "took the lock"} against ${held}`);
    }
  }

  /* The forked child, on the descriptor it inherited. */
  for (const [held, childGets] of [["fcntl", false], ["flock", true], ["ofd", true]] as const) {
    const setup: Setup = { ...base, held, asking: held, asker: "the forked child" };
    if (granted(setup) !== childGets) {
      fail(`measured: the forked child ${childGets ? "got" : "did not get"} a ${held} lock on the inherited descriptor and the model says ${granted(setup)}`);
    }
  }

  /* And when that child calls the unlock instead. */
  for (const [held, survives] of [["fcntl", true], ["flock", false], ["ofd", false]] as const) {
    const setup: Setup = { ...base, held, asking: held, events: ["the child unlocked"] };
    if (stillHeld(setup) !== survives) {
      fail(`measured: after the child unlocked the inherited descriptor a ${held} lock ${survives ? "survived" : "was released"} and the model says ${stillHeld(setup)}`);
    }
  }

  /* Byte ranges: fcntl and OFD have them, flock does not. */
  for (const held of ["fcntl", "ofd"] as const) {
    const same: Setup = { ...base, held, asking: held, holderStart: 0, holderLength: 100, askerStart: 0, askerLength: 100 };
    const apart: Setup = { ...same, askerStart: 200 };
    if (granted(same)) fail(`measured: a ${held} holder on bytes 0 to 99 blocked an outsider asking for the same bytes`);
    if (!granted(apart)) fail(`measured: a ${held} holder on bytes 0 to 99 let an outsider have bytes 200 to 299`);
    if (!overlaps(same) || overlaps(apart)) fail(`overlaps disagrees with the ranges on ${held}`);
    /* Bytes 0 to 99 and 100 to 199 share no byte, and an inclusive comparison would say they do. */
    const touching: Setup = { ...same, askerStart: 100 };
    if (overlaps(touching)) fail(`bytes 0 to 99 and 100 to 199 do not share a byte and overlaps says they do`);
    if (!granted(touching)) fail(`measured: a ${held} holder on bytes 0 to 99 let an outsider have bytes 100 to 199`);
  }
  const wholeFile: Setup = { ...base, held: "flock", asking: "flock", askerStart: 200, askerLength: 100 };
  if (granted(wholeFile)) fail(`measured: flock is the whole file and an outsider asking for bytes 200 to 299 was still refused`);

  /* Shared locks, for both lists. */
  for (const held of ["fcntl", "flock"] as const) {
    const sharedShared: Setup = { ...base, held, asking: held, holderExclusive: false, askerExclusive: false };
    const sharedExclusive: Setup = { ...sharedShared, askerExclusive: true };
    if (!granted(sharedShared)) fail(`measured: two shared ${held} locks did not conflict`);
    if (granted(sharedExclusive)) fail(`measured: a shared ${held} lock blocked an exclusive request`);
    if (!bothShared(sharedShared) || bothShared(sharedExclusive)) fail(`bothShared disagrees on ${held}`);
  }

  /* The pieces the reasons are built from. */
  if (world("flock") === world("fcntl")) fail(`flock and fcntl are on one list and they were measured not seeing each other`);
  if (world("ofd") !== world("fcntl")) fail(`open file description locks were measured conflicting with fcntl in both directions`);
  if (ownerOf("fcntl") === ownerOf("ofd")) fail(`the whole surface is that these two belong to different things`);
  if (identity("fcntl", "the forked child") === identity("fcntl", "the holder")) fail(`a forked child is a different process`);
  if (identity("ofd", "the forked child") !== identity("ofd", "the holder")) fail(`a forked child shares the description`);
  if (!sameOwner({ ...base, asker: "the same process, a second descriptor" })) fail(`two fcntl locks in one process have one owner`);
  if (lostBecause(base) !== "") fail(`nothing happened to this holder and lostBecause named a reason`);
  if (!lostBecause({ ...base, events: ["closed another descriptor"] }).includes("closing any descriptor")) {
    fail(`the unrelated close has to say what it was`);
  }
  if (humanRange(0, 100) !== "bytes 0 to 99") fail(`humanRange got a range wrong: ${humanRange(0, 100)}`);
  if (humanRange(4096, 0) !== "byte 4096 to the end of the file") fail(`humanRange got an open range wrong: ${humanRange(4096, 0)}`);
  if (humanRange(7, 1) !== "byte 7") fail(`humanRange got one byte wrong: ${humanRange(7, 1)}`);
  if (callOf("ofd", true) !== "fcntl(fd, F_OFD_SETLK, F_WRLCK)") fail(`callOf wrote the OFD call as ${callOf("ofd", true)}`);
  if (callOf("flock", false) !== "flock(fd, LOCK_SH)") fail(`callOf wrote the flock call as ${callOf("flock", false)}`);
  if (!callOf("fcntl", true).includes("F_SETLK")) fail(`callOf wrote the fcntl call as ${callOf("fcntl", true)}`);
}

/* ---------------------------------------------------------------- reporting */

if (problems.length) {
  console.error(`\ncheck-locks: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}
console.log(
  `OK  ${CASES.length} locking cases: a table of descriptors, open file descriptions and two lists of records agrees with ` +
    `the model on every one of them and on all ${[...everySetup()].length} setups the model can be handed, the measured ` +
    `matrices reproduce both between processes and inside one, fcntl loses its lock to an unrelated close where flock and ` +
    `the open file description version keep theirs, a forked child can take and release the two that belong to the ` +
    `description and neither for the one that belongs to the process, and flock is the whole file where the other two are ` +
    `byte ranges.`,
);
