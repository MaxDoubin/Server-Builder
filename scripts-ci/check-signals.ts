/**
 * Signal delivery, checked by posting each signal into a kernel-shaped
 * structure rather than by asking the same three questions a second time.
 *
 * The model is a handful of conditions and that is the right shape for a page.
 * It is the wrong shape for a check, because the property that matters is that
 * a standard signal is a BIT and a realtime signal is a QUEUE ENTRY, and a
 * condition can encode that as a single number and still look right on every
 * case where the limit is not binding.
 *
 * So the gate below keeps what the kernel keeps: a pending bitmap, a queue of
 * entries with a shared allowance, and a rule for what happens when the
 * allowance runs out that differs by the sending call. Each send is posted into
 * it one at a time. How many arrive falls out of draining it afterwards, and so
 * does the order, in both of the two orders that exist here.
 *
 * The fixtures at the bottom are the measured tables. They were taken in C: the
 * first attempt used Python, whose C handler sets a flag that the interpreter
 * reads later, so every queued signal collapsed into one call and the result
 * the surface is about vanished.
 */
import { CASES } from "../client/src/lib/signals/data/cases";
import {
  NAMES,
  PENDING_DEFAULT,
  SIGRTMAX,
  SIGRTMIN,
  accepted,
  asSignals,
  claimHolds,
  correctOption,
  delivered,
  dequeueOrder,
  firstDequeued,
  firstHandler,
  handlerOrder,
  humanCount,
  lost,
  nameOf,
  pending,
  queueDepth,
  queues,
  refused,
} from "../client/src/lib/signals/model";
import type { Setup } from "../client/src/lib/signals/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* ------------------------------------------------- what the kernel keeps */

interface Posted {
  /** The signal number. */
  sig: number;
  /** Whether this one holds a queue entry, or is only the pending bit. */
  queued: boolean;
}

/**
 * One process's pending signals.
 *
 * A standard signal is a bit: posting it twice is posting it once. A realtime
 * signal takes an entry from an allowance shared across the user, and when the
 * allowance is gone the two sending calls part company: sigqueue is refused,
 * and kill falls back to the bit, which delivers one and loses the value.
 */
class Pending {
  private bits = new Set<number>();
  private entries: Posted[] = [];
  private used = 0;

  constructor(private readonly allowance: number) {}

  /** Post one signal. Returns whether the sending call reported success. */
  post(sig: number, via: "kill" | "sigqueue"): boolean {
    if (sig < 1 || sig > SIGRTMAX) throw new Error(`there is no signal ${sig} on this kernel`);
    if (sig < SIGRTMIN) {
      this.bits.add(sig);
      return true;
    }
    if (this.used < this.allowance) {
      this.used += 1;
      this.entries.push({ sig, queued: true });
      return true;
    }
    if (via === "kill") {
      this.bits.add(sig);
      return true;
    }
    return false;
  }

  /** Every distinct signal that will be delivered at least once, ascending. */
  distinct(): number[] {
    return [...new Set([...this.bits, ...this.entries.map((entry) => entry.sig)])].sort((a, b) => a - b);
  }

  /** How many times a handler runs in total. */
  deliveries(): number {
    const fromBits = [...this.bits].filter(
      (sig) => !this.entries.some((entry) => entry.sig === sig),
    ).length;
    return this.entries.length + fromBits;
  }
}

/** Post a case's sends into the structure and read the answers back out. */
function post(setup: Setup): { delivered: number; accepted: number; distinct: number[] } {
  /* The queue holds one less than the limit: measured at seven limits. */
  const box = new Pending(Math.max(setup.pendingLimit - 1, 0));
  let ok = 0;
  for (let i = 0; i < setup.sends; i += 1) if (box.post(setup.sig, setup.via)) ok += 1;
  for (const other of setup.alsoQueued) box.post(other, setup.via);
  const forThisSignal = new Pending(Math.max(setup.pendingLimit - 1, 0));
  for (let i = 0; i < setup.sends; i += 1) forThisSignal.post(setup.sig, setup.via);
  return { delivered: forThisSignal.deliveries(), accepted: ok, distinct: box.distinct() };
}

/* ------------------------------------------------------ the cases agree */

for (const item of CASES) {
  const run = post(item.setup);
  if (run.delivered !== delivered(item.setup)) {
    fail(`${item.slug}: posting the sends gives ${run.delivered} deliveries and the model says ${delivered(item.setup)}`);
  }
  if (run.accepted !== accepted(item.setup)) {
    fail(`${item.slug}: posting the sends gives ${run.accepted} accepted and the model says ${accepted(item.setup)}`);
  }
  if (run.distinct.join(",") !== dequeueOrder(item.setup).join(",")) {
    fail(`${item.slug}: the pending set is ${run.distinct.join(", ")} and the model dequeues ${dequeueOrder(item.setup).join(", ")}`);
  }
  if ([...run.distinct].reverse().join(",") !== handlerOrder(item.setup).join(",")) {
    fail(`${item.slug}: the handlers should run in the reverse of the dequeue order`);
  }
  if (lost(item.setup) !== item.setup.sends - delivered(item.setup)) fail(`${item.slug}: lost does not account for every send`);
  if (refused(item.setup) !== item.setup.sends - accepted(item.setup)) fail(`${item.slug}: refused does not account for every send`);
}

/* ------------------------------- and so does everything the model can take */

let exhaustive = 0;
/*
  32 and 33 are left out on purpose. glibc reserves them for its own threading
  and reports SIGRTMIN as 34 because of it, so what the kernel does with those
  two numbers was never measured here and the model should not be asked. 65 is
  left out because there is no such signal.
*/
for (const sig of [1, 2, 10, 12, 15, 17, 18, 28, 31, SIGRTMIN, SIGRTMIN + 1, SIGRTMIN + 15, SIGRTMAX]) {
  for (const sends of [0, 1, 2, 5, 31, 32, 64, 1000]) {
    for (const via of ["kill", "sigqueue"] as const) {
      for (const pendingLimit of [1, 2, 3, 4, 32, 64, PENDING_DEFAULT]) {
        for (const alsoQueued of [[], [1, 15], [SIGRTMIN + 1, SIGRTMIN + 2], [12, SIGRTMIN + 7]]) {
          if (alsoQueued.includes(sig)) continue;
          const setup: Setup = { host: "h", job: "j", sig, sends, via, pendingLimit, alsoQueued };
          exhaustive += 1;
          const run = post(setup);
          const where = `${nameOf(sig)} x${sends} via ${via} at limit ${pendingLimit}` +
            `${alsoQueued.length ? ` beside ${alsoQueued.map(nameOf).join(" and ")}` : ""}`;
          if (run.delivered !== delivered(setup) || run.accepted !== accepted(setup)) {
            fail(
              `${where}: posting gives ${run.delivered} delivered and ${run.accepted} accepted, ` +
                `the model says ${delivered(setup)} and ${accepted(setup)}`,
            );
          }
          /*
            Which signals are pending afterwards is a separate answer from how
            many arrived, and the others draw on whatever allowance the burst
            left. Nothing in the ten cases puts a limit and a second signal
            together, so without this the sharing is untested.
          */
          if (run.distinct.join(",") !== dequeueOrder(setup).join(",")) {
            fail(`${where}: the pending set is [${run.distinct.join(", ")}] and the model dequeues [${dequeueOrder(setup).join(", ")}]`);
          }
        }
      }
    }
  }
}

/* --------------------------------------------------------- the cases hold up */

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
    if (!Number.isInteger(value) || value < 0) fail(`${where}: ${field} is ${value}, and every number here is a count`);
  }
  if (item.setup.sig < 1 || item.setup.sig > SIGRTMAX) fail(`${where}: ${item.setup.sig} is not a signal this kernel has`);
  if (item.setup.pendingLimit < 1) fail(`${where}: RLIMIT_SIGPENDING cannot be below 1`);
  for (const other of item.setup.alsoQueued) {
    if (other === item.setup.sig) fail(`${where}: ${nameOf(other)} is queued alongside itself`);
  }

  const held = item.options.filter((option) => claimHolds(option.says, item.setup));
  if (held.length !== 1) fail(`${where}: ${held.length} of the ${item.options.length} options hold, and exactly one must`);
  positions.push(item.options.findIndex((option) => claimHolds(option.says, item.setup)));

  const seen = new Set<string>();
  const leading = new Set<string>();
  for (const option of item.options) {
    const shapeOf = JSON.stringify(option.says);
    if (seen.has(shapeOf)) fail(`${where}: two options make the same claim, so one of them cannot be wrong on its own`);
    seen.add(shapeOf);
    const number = /^(\d+)/.exec(option.claim);
    if (number) {
      if (leading.has(number[1])) fail(`${where}: two options open with ${number[1]}, which a reader reads as the same answer`);
      leading.add(number[1]);
      const says = option.says as Record<string, unknown>;
      const stated = typeof says.value === "number" ? says.value : null;
      if (stated !== null && stated !== Number(number[1])) {
        fail(`${where}/${option.id}: the prose opens with ${number[1]} and the claim is ${stated}`);
      }
    }
    if (correctOption({ setup: item.setup, options: [option] }) && option.id !== held[0]?.id) {
      fail(`${where}/${option.id}: correctOption and claimHolds disagree`);
    }
  }

  const lines = asSignals(item.setup);
  if (lines.length !== 6) fail(`${where}: asSignals rendered ${lines.length} lines and the page has room for 6`);
  for (const line of lines) if (!line.name || !line.value || !line.unit) fail(`${where}: an asSignals line is missing a part`);
  if (!lines[0].unit.includes("SIGRTMIN")) fail(`${where}: the signal line has to say which side of SIGRTMIN it is on`);
  if (!lines[3].unit.includes("one less")) fail(`${where}: the limit line has to say the queue is one short of it`);
}

const limit = Math.ceil(CASES.length / 2);
for (let slot = 0; slot < 4; slot += 1) {
  const here = positions.filter((position) => position === slot).length;
  if (here > limit) fail(`${here} of the ${CASES.length} answers sit in slot ${slot}, and a reader would notice at ${limit}`);
}

/* ------------------------------------------- the measured tables reproduce

    blocked, sent N, unblocked, handler calls counted in C:

      SIGUSR1  via kill      1, 2, 5, 100, 1000 sent  ->  1 every time
      SIGHUP   via kill      the same five rows       ->  1 every time
      SIGRTMIN via kill      1, 2, 5, 100, 1000       ->  1, 2, 5, 100, 1000
      SIGUSR1  via sigqueue  1, 2, 5, 100, 1000       ->  1 every time
      SIGRTMIN via sigqueue  1, 2, 5, 100, 1000       ->  1, 2, 5, 100, 1000

    five SIGRTMIN at small limits:

      limit 1  kill      accepted 5  delivered 1
      limit 1  sigqueue  accepted 0  delivered 0   EAGAIN
      limit 2  kill      accepted 5  delivered 1
      limit 2  sigqueue  accepted 1  delivered 1   EAGAIN
      limit 3  kill      accepted 5  delivered 2
      limit 3  sigqueue  accepted 2  delivered 2   EAGAIN
      limit 4  kill      accepted 5  delivered 3
      limit 4  sigqueue  accepted 3  delivered 3   EAGAIN

    queue depth: limits 1, 2, 4, 8, 16, 32 took 0, 1, 3, 7, 15, 31, and the
    default 64313 took 64312.

    order: sigtimedwait gave 10, 12, 34, 36, 39 from both a scrambled and an
    ascending send order, and 1, 10, 15 from SIGTERM, SIGUSR1, SIGHUP.
    Handlers gave 39, 36, 34, 12, 10 and 15, 12, 10, 1, never nesting.
*/
{
  const base: Setup = { host: "the host these came from", job: "counts", sig: 10, sends: 1, via: "kill", pendingLimit: PENDING_DEFAULT, alsoQueued: [] };

  for (const sends of [1, 2, 5, 100, 1000]) {
    for (const via of ["kill", "sigqueue"] as const) {
      for (const sig of [1, 10]) {
        const s: Setup = { ...base, sig, sends, via };
        if (delivered(s) !== 1) fail(`measured: ${nameOf(sig)} x${sends} via ${via} delivered 1 and the model says ${delivered(s)}`);
      }
      const rt: Setup = { ...base, sig: SIGRTMIN, sends, via };
      if (delivered(rt) !== sends) fail(`measured: SIGRTMIN x${sends} via ${via} delivered ${sends} and the model says ${delivered(rt)}`);
    }
  }

  const small: [number, "kill" | "sigqueue", number, number][] = [
    [1, "kill", 5, 1], [1, "sigqueue", 0, 0],
    [2, "kill", 5, 1], [2, "sigqueue", 1, 1],
    [3, "kill", 5, 2], [3, "sigqueue", 2, 2],
    [4, "kill", 5, 3], [4, "sigqueue", 3, 3],
  ];
  for (const [pendingLimit, via, acc, del] of small) {
    const s: Setup = { ...base, sig: SIGRTMIN, sends: 5, via, pendingLimit };
    if (accepted(s) !== acc) fail(`measured: 5 SIGRTMIN via ${via} at limit ${pendingLimit} had ${acc} accepted and the model says ${accepted(s)}`);
    if (delivered(s) !== del) fail(`measured: 5 SIGRTMIN via ${via} at limit ${pendingLimit} delivered ${del} and the model says ${delivered(s)}`);
    if (via === "sigqueue" && refused(s) !== 5 - acc) fail(`measured: the rest came back EAGAIN at limit ${pendingLimit}`);
  }

  for (const [pendingLimit, depth] of [[1, 0], [2, 1], [4, 3], [8, 7], [16, 15], [32, 31], [PENDING_DEFAULT, 64_312]] as const) {
    if (queueDepth(pendingLimit) !== depth) fail(`measured: a limit of ${pendingLimit} queued ${depth} and the model says ${queueDepth(pendingLimit)}`);
    const s: Setup = { ...base, sig: SIGRTMIN, sends: depth + 10, via: "sigqueue", pendingLimit };
    if (delivered(s) !== depth) fail(`measured: a limit of ${pendingLimit} delivered ${depth} of a burst past it`);
  }

  const mixed: Setup = { ...base, sig: 39, sends: 1, via: "sigqueue", alsoQueued: [12, 34, 10, 36] };
  if (dequeueOrder(mixed).join(",") !== "10,12,34,36,39") fail(`measured: sigtimedwait gave 10, 12, 34, 36, 39 and the model gives ${dequeueOrder(mixed).join(", ")}`);
  if (handlerOrder(mixed).join(",") !== "39,36,34,12,10") fail(`measured: the handlers ran 39, 36, 34, 12, 10 and the model gives ${handlerOrder(mixed).join(", ")}`);
  if (firstDequeued(mixed) !== 10 || firstHandler(mixed) !== 39) fail(`measured: the first dequeued and the first handler are not the same signal`);
  const standard: Setup = { ...base, sig: 15, sends: 1, alsoQueued: [10, 1] };
  if (dequeueOrder(standard).join(",") !== "1,10,15") fail(`measured: SIGTERM, SIGUSR1, SIGHUP came off as 1, 10, 15`);
  if (handlerOrder(standard).join(",") !== "15,10,1") fail(`measured: their handlers ran 15, 10, 1`);

  /* The pieces the answers are built from. */
  /*
    Written as literals rather than against the constants, because a test that
    moves when the constant moves cannot catch the constant being wrong. 34 and
    64 are what this kernel reports and what every measurement above used.
  */
  if (SIGRTMIN !== 34) fail(`SIGRTMIN measured 34 on this kernel and the model says ${SIGRTMIN}`);
  if (SIGRTMAX !== 64) fail(`SIGRTMAX measured 64 on this kernel and the model says ${SIGRTMAX}`);
  if (SIGRTMAX - SIGRTMIN + 1 !== 31) fail(`there were 31 realtime signals and the model has ${SIGRTMAX - SIGRTMIN + 1}`);
  for (const sig of [1, 10, 15, 31, 33]) if (queues(sig)) fail(`signal ${sig} is below SIGRTMIN and does not queue`);
  for (let sig = 34; sig <= 64; sig += 1) if (!queues(sig)) fail(`signal ${sig} is a realtime signal and queues`);
  if (queues(65)) fail(`there is no signal 65 on this kernel`);
  if (nameOf(SIGRTMIN) !== "SIGRTMIN" || nameOf(SIGRTMIN + 5) !== "SIGRTMIN+5") fail(`nameOf got a realtime name wrong: ${nameOf(SIGRTMIN + 5)}`);
  if (nameOf(1) !== "SIGHUP" || nameOf(10) !== "SIGUSR1") fail(`nameOf got a standard name wrong`);
  if (!Object.keys(NAMES).every((key) => Number(key) < SIGRTMIN)) fail(`NAMES carries a realtime number, which nameOf builds instead`);
  if (humanCount(1) !== "once" || humanCount(3) !== "3 times") fail(`humanCount reads wrong: ${humanCount(1)}, ${humanCount(3)}`);
  const none: Setup = { ...base, sends: 0 };
  if (delivered(none) !== 0 || lost(none) !== 0) fail(`nothing sent should deliver and lose nothing`);
  if (pending(mixed).length !== 5) fail(`pending should list every distinct signal once`);
  const repeated: Setup = { ...base, sig: 10, sends: 1, alsoQueued: [34, 34, 12, 34] };
  if (pending(repeated).join(",") !== "10,12,34") fail(`pending listed a signal twice: ${pending(repeated).join(", ")}`);
  if (handlerOrder(repeated).join(",") !== "34,12,10") fail(`the handler order should be the reverse of the same distinct set`);
}

/* ---------------------------------------------------------------- reporting */

if (problems.length) {
  console.error(`\ncheck-signals: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} signal cases: a pending bitmap and a queue with a shared allowance agree with the model on every ` +
    `one of them and on ${exhaustive} combinations of signal, count, sending call and limit; a standard signal collapses ` +
    `1000 sends into one whichever call sent them and a realtime one keeps all 1000; the queue holds RLIMIT_SIGPENDING ` +
    `minus one at all seven measured limits; kill accepts what it is about to drop where sigqueue returns EAGAIN, and the ` +
    `two deliver the same number; and the dequeue order is lowest first where the handlers run in the reverse.`,
);
