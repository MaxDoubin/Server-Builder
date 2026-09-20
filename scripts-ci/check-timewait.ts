/**
 * The TIME_WAIT set, checked against a clock and a tuple count rather than
 * against the model's expressions.
 *
 * Two things carry every case: how long a state lasts, and how many four
 * tuples exist. So the gate runs a second by second clock over the state
 * machine instead of reading a duration, and counts tuples one port at a time
 * instead of multiplying. The central claim, that no sysctl reaches
 * TIME_WAIT, is checked by sweeping the sysctl rather than by asserting it.
 *
 * The fixtures at the bottom were measured on the host this was written on.
 */
import { CASES } from "../client/src/lib/timewait/data/cases";
import {
  TIME_WAIT_SECONDS,
  asSysctl,
  claimHolds,
  closerState,
  concurrentTimeWait,
  correctOption,
  ephemeralPorts,
  exhausts,
  finWait2Seconds,
  human,
  overflowsBuckets,
  reuseHelps,
  stateSeconds,
  sustainableRate,
  timeWaitSeconds,
  tunableByFinTimeout,
  tupleCapacity,
  waitingSide,
} from "../client/src/lib/timewait/model";
import type { Setup } from "../client/src/lib/timewait/types";

const problems: string[] = [];
const fail = (message: string) => problems.push(message);

/* --------------------------------------------------- the clock, not a table */

/**
 * 2MSL, the way the RFC states it and the kernel comments it, rather than the
 * way the model stores it. If these two ever disagree the constant was edited
 * without the reason behind it being edited too.
 */
const MSL_SECONDS = 30;
if (2 * MSL_SECONDS !== TIME_WAIT_SECONDS) {
  fail(`2MSL is ${2 * MSL_SECONDS}s and TIME_WAIT_SECONDS is ${TIME_WAIT_SECONDS}s`);
}

/**
 * Step a clock through the closing side's state and report when it ends.
 *
 * Deliberately a loop rather than a lookup: a model that returned the right
 * duration from the wrong state, or that fed the sysctl into the wrong timer,
 * disagrees with something that has to tick to get there.
 */
function tickUntilGone(setup: Setup): { state: string; endsAt: number } {
  const state = setup.peerFinSeen ? "TIME_WAIT" : "FIN_WAIT2";
  const timer = state === "TIME_WAIT" ? 2 * MSL_SECONDS : setup.finTimeout;
  let t = 0;
  while (t < timer) t += 1;
  return { state, endsAt: t };
}

for (const c of CASES) {
  const walked = tickUntilGone(c.setup);
  if (walked.state !== closerState(c.setup)) {
    fail(`${c.slug}: the clock is in ${walked.state} and closerState says ${closerState(c.setup)}`);
  }
  if (walked.endsAt !== stateSeconds(c.setup)) {
    fail(`${c.slug}: the clock ran ${walked.endsAt}s and stateSeconds says ${stateSeconds(c.setup)}s`);
  }
}

/* ------------------------------------- sweep the knob everyone reaches for */

/*
  The whole surface rests on tcp_fin_timeout not reaching TIME_WAIT, so move
  it across its entire accepted range and watch both states. FIN_WAIT2 has to
  follow it exactly and TIME_WAIT has to ignore it entirely.
*/
{
  const base: Setup = { ...CASES[0].setup };
  let followed = 0;
  for (let knob = 1; knob <= 600; knob += 1) {
    const waiting: Setup = { ...base, finTimeout: knob, peerFinSeen: true };
    const halfClosed: Setup = { ...base, finTimeout: knob, peerFinSeen: false };
    if (timeWaitSeconds(waiting) !== 60) {
      fail(`sweep: tcp_fin_timeout ${knob} moved TIME_WAIT to ${timeWaitSeconds(waiting)}s`);
    }
    if (stateSeconds(waiting) !== 60) {
      fail(`sweep: tcp_fin_timeout ${knob} moved the waiting socket to ${stateSeconds(waiting)}s`);
    }
    if (finWait2Seconds(halfClosed) !== knob || stateSeconds(halfClosed) !== knob) {
      fail(`sweep: tcp_fin_timeout ${knob} gave FIN_WAIT2 ${stateSeconds(halfClosed)}s`);
    }
    if (tunableByFinTimeout(waiting)) fail(`sweep: TIME_WAIT reported tunable at tcp_fin_timeout ${knob}`);
    followed += 1;
  }
  if (followed !== 600) fail(`sweep: only ${followed} settings were walked`);
}

/* ------------------------------------------- tuples, counted not multiplied */

function countTuples(setup: Setup): number {
  const [low, high] = setup.portRange;
  let n = 0;
  for (let port = low; port <= high; port += 1) n += setup.destinations;
  return n;
}

/** floor(tuples / hold), reached by adding one connection per second at a time. */
function rateByDraining(tuples: number, hold: number): number {
  let rate = 0;
  while ((rate + 1) * hold <= tuples) rate += 1;
  return rate;
}

for (const c of CASES) {
  const [low, high] = c.setup.portRange;
  let ports = 0;
  for (let port = low; port <= high; port += 1) ports += 1;
  if (ports !== ephemeralPorts(c.setup)) {
    fail(`${c.slug}: counting the range gives ${ports} ports and ephemeralPorts says ${ephemeralPorts(c.setup)}`);
  }
  const tuples = countTuples(c.setup);
  if (tuples !== tupleCapacity(c.setup)) {
    fail(`${c.slug}: counting gives ${tuples} tuples and tupleCapacity says ${tupleCapacity(c.setup)}`);
  }
  const drained = rateByDraining(tuples, TIME_WAIT_SECONDS);
  if (drained !== sustainableRate(c.setup)) {
    fail(`${c.slug}: draining gives ${drained}/s and sustainableRate says ${sustainableRate(c.setup)}/s`);
  }
  if (exhausts(c.setup) !== c.setup.attemptsPerSecond > drained) {
    fail(`${c.slug}: exhausts says ${exhausts(c.setup)} at ${c.setup.attemptsPerSecond}/s against ${drained}/s`);
  }
  if (concurrentTimeWait(c.setup) !== c.setup.attemptsPerSecond * TIME_WAIT_SECONDS) {
    fail(`${c.slug}: the steady state count does not match rate times the hold`);
  }
  if (overflowsBuckets(c.setup) !== concurrentTimeWait(c.setup) > c.setup.twBuckets) {
    fail(`${c.slug}: overflowsBuckets disagrees with the count against the cap`);
  }
}

/* The boundary: exhaustion has to flip exactly at the sustainable rate. */
{
  const base: Setup = { ...CASES[7].setup };
  for (const destinations of [1, 2, 3, 6, 11]) {
    const s: Setup = { ...base, destinations };
    const edge = sustainableRate(s);
    if (exhausts({ ...s, attemptsPerSecond: edge })) fail(`boundary: ${edge}/s over ${destinations} dst reported as exhausting`);
    if (!exhausts({ ...s, attemptsPerSecond: edge + 1 })) fail(`boundary: ${edge + 1}/s over ${destinations} dst reported as fitting`);
    if (sustainableRate({ ...s, destinations: destinations * 2 }) < edge * 2 - 1) {
      fail(`boundary: doubling the destinations did not roughly double the rate`);
    }
  }
}

/* ------------------------------------------------ reuse, as a truth table */

/*
  Three independent conditions, so write all twenty four combinations out
  longhand and compare. An implementation that dropped any one of them passes
  a spot check and fails this.
*/
{
  const base: Setup = { ...CASES[0].setup };
  let checked = 0;
  for (const twReuse of [0, 1, 2] as const) {
    for (const timestamps of [true, false]) {
      for (const loopback of [true, false]) {
        for (const closedFirst of ["client", "server"] as const) {
          const s: Setup = { ...base, twReuse, timestamps, loopback, closedFirst };
          let want: boolean;
          if (!timestamps) want = false;
          else if (closedFirst === "server") want = false;
          else if (twReuse === 0) want = false;
          else if (twReuse === 1) want = true;
          else want = loopback;
          if (reuseHelps(s) !== want) {
            fail(`reuse: tw_reuse=${twReuse} timestamps=${timestamps} loopback=${loopback} closer=${closedFirst} gives ${reuseHelps(s)}, expected ${want}`);
          }
          checked += 1;
        }
      }
    }
  }
  if (checked !== 24) fail(`reuse: ${checked} combinations were walked and there are 24`);
}

/* The waiting side is the closing side, whatever else is set. */
for (const closedFirst of ["client", "server"] as const) {
  for (const peerFinSeen of [true, false]) {
    const s: Setup = { ...CASES[0].setup, closedFirst, peerFinSeen };
    if (waitingSide(s) !== closedFirst) fail(`side: closer ${closedFirst} reported as ${waitingSide(s)}`);
  }
}

/* ------------------------------------------------------------- the set */

const seenBreaks = new Map<string, string>();
const seenSlugs = new Set<string>();
const answerAt: number[] = [];

for (const c of CASES) {
  if (seenSlugs.has(c.slug)) fail(`${c.slug}: two cases share a slug`);
  seenSlugs.add(c.slug);
  const previous = seenBreaks.get(c.breaks);
  if (previous) fail(`${c.slug}: breaks the same belief as ${previous}, "${c.breaks}"`);
  seenBreaks.set(c.breaks, c.slug);

  const holds = c.options.map((o, i) => [i, claimHolds(o.says, c.setup)] as const).filter(([, v]) => v);
  if (holds.length !== 1) {
    fail(`${c.slug}: ${holds.length} options hold, and a case has exactly one answer`);
    continue;
  }
  answerAt.push(holds[0][0]);

  const asked = correctOption(c);
  if (asked?.id !== c.options[holds[0][0]].id) {
    fail(`${c.slug}: correctOption returns ${asked?.id ?? "nothing"} and the scan finds ${c.options[holds[0][0]].id}`);
  }

  const ids = new Set(c.options.map((o) => o.id));
  if (ids.size !== c.options.length) fail(`${c.slug}: two options share an id`);

  /*
    Two options naming the same number is how a case ends up with two right
    answers, and on the receive buffer set it happened for real.
  */
  const numbers = c.options
    .map((o) => (o.says.about === "seconds" || o.says.about === "rate" || o.says.about === "ports" ? o.says.value : null))
    .filter((v): v is number => v !== null);
  if (new Set(numbers).size !== numbers.length) {
    fail(`${c.slug}: two options name the same number, so one of them is right by accident`);
  }

  for (const o of c.options) {
    const opens = o.claim.match(/^([\d,]+)/);
    if (!opens) continue;
    const stated = Number(opens[1].replace(/,/g, ""));
    const checked =
      o.says.about === "seconds" || o.says.about === "rate" || o.says.about === "ports" ? o.says.value : null;
    if (checked !== null && checked !== stated) {
      fail(`${c.slug}/${o.id}: the prose opens with ${stated} but the claim checks ${checked}`);
    }
  }

  for (const [k, v] of Object.entries(c.setup)) {
    if (typeof v === "number" && !Number.isInteger(v)) fail(`${c.slug}: ${k} is ${v}, and these are whole units`);
  }
  const [low, high] = c.setup.portRange;
  if (low >= high) fail(`${c.slug}: ip_local_port_range reads ${low} ${high}`);
  if (c.setup.finTimeout < 1) fail(`${c.slug}: tcp_fin_timeout is ${c.setup.finTimeout} and the kernel's floor is 1`);
  if (c.setup.destinations < 1) fail(`${c.slug}: a workload connects to at least one destination`);

  const lines = asSysctl(c.setup);
  if (lines.length !== 5) fail(`${c.slug}: asSysctl rendered ${lines.length} lines and there are five sysctls`);
  if (!lines.some((l) => /NOT TIME_WAIT/.test(l.unit))) {
    fail(`${c.slug}: asSysctl does not say that tcp_fin_timeout is not the TIME_WAIT knob`);
  }
  if (!lines.some((l) => /COUNT/.test(l.unit))) {
    fail(`${c.slug}: asSysctl does not say that tcp_max_tw_buckets is a count`);
  }
  if (!c.why.trim() || !c.fix.trim()) fail(`${c.slug}: every case explains itself and says what to do`);
}

const spread = [0, 1, 2, 3].map((i) => answerAt.filter((a) => a === i).length);
if (Math.max(...spread) > CASES.length / 2) {
  fail(`answers sit at ${spread.join("/")}, which is a pattern to learn instead of a model`);
}
if (CASES.length !== 10) fail(`the set has ${CASES.length} cases and the surface is built for ten`);

/* ------------------------------------------------------ measured fixtures */

/*
  Taken on the host this was written on, kernel 6.18.44, by watching
  /proc/net/tcp on loopback connections. tcp_fin_timeout was restored after
  each run.

    tcp_fin_timeout 5,  TIME_WAIT held           60.2s
    tcp_fin_timeout 5,  FIN_WAIT2 reaped after    5.3s
    tcp_fin_timeout 20, FIN_WAIT2 reaped after   20.9s
    client closes first: client FIN_WAIT2 -> TIME_WAIT, server CLOSE_WAIT
    ip_local_port_range 32768 60999, tcp_max_tw_buckets 65536
    tcp_tw_reuse 2, tcp_timestamps 1, no tcp_tw_recycle file
*/
{
  const measured: Setup = {
    host: "the host these came from",
    closedFirst: "client",
    peerFinSeen: true,
    finTimeout: 5,
    twBuckets: 65_536,
    twReuse: 2,
    timestamps: true,
    loopback: true,
    portRange: [32_768, 60_999],
    destinations: 1,
    attemptsPerSecond: 1,
  };

  /* The measurement the whole surface is built on. */
  if (stateSeconds(measured) !== 60) {
    fail(`the measured TIME_WAIT ran 60.2s at tcp_fin_timeout 5 and the model says ${stateSeconds(measured)}s`);
  }

  /* The same knob, the other state, at two settings. */
  const half = { ...measured, peerFinSeen: false };
  if (stateSeconds(half) !== 5) fail(`FIN_WAIT2 measured 5.3s at tcp_fin_timeout 5 and the model says ${stateSeconds(half)}s`);
  if (stateSeconds({ ...half, finTimeout: 20 }) !== 20) {
    fail(`FIN_WAIT2 measured 20.9s at tcp_fin_timeout 20 and the model says ${stateSeconds({ ...half, finTimeout: 20 })}s`);
  }

  /* The closer waits and the peer does not. */
  if (waitingSide(measured) !== "client") fail(`the measured client closed first and the model waits on ${waitingSide(measured)}`);
  if (closerState(half) !== "FIN_WAIT2") fail(`before the peer's FIN the measured state was FIN_WAIT2, model says ${closerState(half)}`);

  /* 32768 through 60999 inclusive is 28,232 ports, and 470 a second. */
  if (ephemeralPorts(measured) !== 28_232) fail(`the measured range holds 28232 ports and the model counts ${ephemeralPorts(measured)}`);
  if (sustainableRate(measured) !== 470) fail(`28232 ports over 60s is 470/s and the model says ${sustainableRate(measured)}/s`);

  /* tw_reuse 2 covers loopback and nothing else. */
  if (!reuseHelps(measured)) fail(`tw_reuse 2 on loopback from the dialing side should help`);
  if (reuseHelps({ ...measured, loopback: false })) fail(`tw_reuse 2 should not reach traffic that is not loopback`);

  if (human(28_232) !== "28,232") fail(`human() renders the measured port count as ${human(28_232)}`);
}

/* ------------------------------------------------------------------ report */

if (problems.length) {
  console.error(`\ncheck-timewait: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems.slice(0, 30)) console.error(`  ${problem}`);
  if (problems.length > 30) console.error(`  ... and ${problems.length - 30} more`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} TIME_WAIT cases: a ticking clock agrees with every duration, 600 settings of tcp_fin_timeout ` +
    `move FIN_WAIT2 and never move TIME_WAIT, tuples counted one port at a time agree with the rate ceiling, all 24 ` +
    `reuse combinations match a longhand table, and the measured 60.2s hold, 5.3s and 20.9s reaps and 28,232 ports ` +
    `all reproduce.`,
);
