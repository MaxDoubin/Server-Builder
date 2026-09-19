/**
 * The accept queue surface, against the kernel's own arithmetic.
 *
 * The layers that have caught something on the previous surfaces, and three
 * that belong to this one.
 *
 * The first is the fixed points. Four numbers on this surface are quoted in
 * primary sources rather than derived here, and every one of them is a number
 * a plausible refactor would change quietly: somaxconn defaulting to 4096
 * since 5.4 and 128 before, the last SYN-ACK retransmission at 31 seconds, the
 * request being given up on at 63, and the 924.6 seconds ip-sysctl quotes for
 * tcp_retries2. If the model drifts off any of those it is no longer modeling
 * Linux, and the exactly-one check cannot see it because every option moves
 * together.
 *
 * The second is the cap plus one. sk_acceptq_is_full compares with greater
 * than, so the queue holds one more entry than the number in Send-Q, and the
 * kernel carries a note above the function for people who are sure it should
 * be greater or equal. A model that agrees with the people who are sure would
 * be off by one everywhere and look completely reasonable.
 *
 * The third is conservation. Everything that arrived was accepted, or is in
 * the queue, or was dropped, so the three have to add up to the arrivals. That
 * identity is checked against the closed form and then against a simulation
 * that steps through the burst one connection at a time, which is the shape a
 * clamp in the wrong place survives in.
 *
 *     npx tsx scripts-ci/check-backlog.ts
 */

import {
  CASES,
  RTO_MAX_MS,
  RTO_MIN_MS,
  TIMEOUT_INIT_MS,
  accepted,
  asNstat,
  asSs,
  asSysctl,
  clientDelayMs,
  correctOption,
  dataRetransmitTimesMs,
  effectiveCap,
  fate,
  givesUpAfterMs,
  holds,
  humanMs,
  listenDrops,
  matching,
  overflowed,
  peakDepth,
  queueCapacity,
  recoveryTimesMs,
  requestLifetimeMs,
  somaxconnDefault,
  synAckTimesMs,
  waitForSlotMs,
} from "../client/src/lib/backlog/index";
import type { Setup } from "../client/src/lib/backlog/types";

const problems: string[] = [];

/* ── 1. exactly one ─────────────────────────────────────────────────────── */

for (const item of CASES) {
  const hits = matching(item);
  if (hits.length !== 1) {
    problems.push(
      `${item.slug}: ${hits.length} options hold` +
        (hits.length ? ` (${hits.map((h) => h.id).join(", ")})` : "") +
        `. A distractor that happens to be true is two right answers.`,
    );
  }
  if (correctOption(item) === null && hits.length === 1) {
    problems.push(`${item.slug}: one option holds and correctOption still returned nothing`);
  }
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }
  /* Stated the other way round, through holds() directly, so a bug in the
     filter cannot hide a distractor that is true. */
  const trueOnes = item.options.filter((option) => holds(option.says, item.setup));
  if (trueOnes.length !== 1) {
    problems.push(`${item.slug}: holds() says ${trueOnes.length} claims are true of this listener`);
  }
}

/* ── the prose figure and the checked figure ────────────────────────────── */

/*
  Checked by scripts-ci/check-option-prose.ts, generically, for every surface
  that offers options rather than for this one.
*/

/* ── 2. whole numbers, because every one of these is a counter ──────────── */

for (const item of CASES) {
  for (const [name, value] of Object.entries(item.setup)) {
    if (typeof value !== "number") continue;
    if (!Number.isInteger(value)) {
      problems.push(
        `${item.slug}: ${name} is ${value}, and there is no such thing as a fraction of a` +
          ` connection, a jiffy or a counter increment. A case whose inputs a host could not` +
          ` produce teaches from a host that does not exist.`,
      );
    }
    if (value < 0) problems.push(`${item.slug}: ${name} is negative`);
  }
  for (const derived of [
    effectiveCap,
    queueCapacity,
    accepted,
    peakDepth,
    overflowed,
    listenDrops,
    clientDelayMs,
  ]) {
    const value = derived(item.setup);
    if (!Number.isInteger(value)) {
      problems.push(`${item.slug}: ${derived.name}() returned ${value}, which is not a whole number`);
    }
  }
}

/* ── 3. the fixed points, which are quoted rather than derived ──────────── */

const fixed: [string, () => boolean, string][] = [
  [
    "somaxconn default",
    () =>
      somaxconnDefault("6.8") === 4096 &&
      somaxconnDefault("5.4") === 4096 &&
      somaxconnDefault("5.3") === 128 &&
      somaxconnDefault("4.19") === 128,
    'listen(2): "Since Linux 5.4, the default in this file is 4096; in earlier kernels, the' +
      ' default value is 128."',
  ],
  [
    "the last SYN-ACK retransmission",
    () => {
      const times = synAckTimesMs(5);
      return (
        times.length === 5 &&
        times.join(",") === "1000,3000,7000,15000,31000" &&
        times[times.length - 1] === 31000
      );
    },
    'ip-sysctl on tcp_synack_retries: "Default value is 5, which corresponds to 31seconds till' +
      ' the last retransmission with the current initial RTO of 1second."',
  ],
  [
    "when the request is given up on",
    () => requestLifetimeMs(5) === 63000 && requestLifetimeMs(1) === 3000,
    "syn_ack_recalc expires the request one further timer interval past the last retransmission," +
      " so the default of 5 is 31 seconds plus 32",
  ],
  [
    "the 924.6 second figure",
    () => givesUpAfterMs(RTO_MIN_MS, 15) === 924600 && humanMs(givesUpAfterMs(RTO_MIN_MS, 15)) === "924.6 s",
    'ip-sysctl on tcp_retries2: "The default value of 15 yields a hypothetical timeout of 924.6' +
      ' seconds and is a lower bound for the effective timeout."',
  ],
  [
    "the kernel's own constants",
    () => RTO_MIN_MS === 200 && RTO_MAX_MS === 120000 && TIMEOUT_INIT_MS === 1000,
    "TCP_RTO_MIN is HZ/5, TCP_RTO_MAX_SEC is 120, and TCP_TIMEOUT_INIT is 1*HZ, all from" +
      " include/net/tcp.h",
  ],
  [
    "the silent cap",
    () => {
      const unit: Pick<Setup, "backlog" | "somaxconn"> = { backlog: 4294967295, somaxconn: 4096 };
      return effectiveCap(unit as Setup) === 4096 && effectiveCap({ ...unit, backlog: 511 } as Setup) === 511;
    },
    "__sys_listen_socket clamps the argument to somaxconn and leaves a smaller one alone, which" +
      " is the whole of systemd.socket(5)'s note that the sysctl is typically what matters",
  ],
  [
    "one past the cap",
    () =>
      CASES.every((item) => queueCapacity(item.setup) === effectiveCap(item.setup) + 1) &&
      CASES.every((item) => peakDepth(item.setup) <= effectiveCap(item.setup) + 1),
    "sk_acceptq_is_full compares with greater than, so Send-Q 511 holds 512 and a Recv-Q one above" +
      " Send-Q is the definition rather than a bug",
  ],
  [
    "nginx's own default",
    () => {
      const nginx = CASES.find((item) => item.slug === "somaxconn-went-up-and-nothing-moved")!.setup;
      return nginx.backlog === 511 && effectiveCap(nginx) === 511 && nginx.somaxconn > 511;
    },
    "the nginx listen directive documents backlog as 511 on Linux, which is below any modern" +
      " somaxconn and therefore the binding constraint",
  ],
];

for (const [what, holdsTrue, source] of fixed) {
  if (!holdsTrue()) problems.push(`${what} no longer matches the source. ${source}`);
}

/* ── 4. two ways to the same number ─────────────────────────────────────── */

/*
  givesUpAfterMs() is tcp_model_timeout(), a closed form with an ilog2 and two
  branches. dataRetransmitTimesMs() walks the schedule one interval at a time,
  doubling and clamping. They answer the same question, and the kernel's
  boundary of N is N+1 intervals of that walk, so the two have to meet at every
  boundary on both sides of where the clamp starts biting.
*/
for (const rto of [200, 240, 300, 1000]) {
  for (let boundary = 1; boundary <= 15; boundary += 1) {
    const walked = dataRetransmitTimesMs(rto, boundary + 1);
    const closed = givesUpAfterMs(rto, boundary);
    if (walked[walked.length - 1] !== closed) {
      problems.push(
        `rto ${rto} boundary ${boundary}: walking the backoff gives ${walked[walked.length - 1]} ms` +
          ` and tcp_model_timeout gives ${closed} ms`,
      );
    }
  }
}

/*
  And the burst. The closed form says the drops are whatever is left after the
  accepts and the queue. This steps through the arrivals one at a time with the
  accepts interleaved, which is the shape a clamp applied in the wrong place
  survives in: a peak depth clamped before the drop is counted still looks
  right on every case where nothing overflowed.
*/
function byHand(setup: Setup): { peak: number; taken: number; dropped: number; left: number } {
  const capacity = effectiveCap(setup) + 1;
  const every = setup.acceptsPerSecond > 0 ? 1000 / setup.acceptsPerSecond : Number.POSITIVE_INFINITY;
  let depth = 0;
  let peak = 0;
  let taken = 0;
  let dropped = 0;
  let nextAccept = every;
  const drain = (until: number) => {
    while (nextAccept <= until) {
      if (depth > 0) {
        depth -= 1;
        taken += 1;
      }
      nextAccept += every;
    }
  };
  for (let n = 0; n < setup.arrivals; n += 1) {
    const at = ((n + 1) * setup.windowMs) / setup.arrivals;
    drain(at);
    if (depth >= capacity) dropped += 1;
    else {
      depth += 1;
      if (depth > peak) peak = depth;
    }
  }
  drain(setup.windowMs);
  return { peak, taken, dropped, left: depth };
}

for (const item of CASES) {
  const s = item.setup;
  const sum = accepted(s) + peakDepth(s) + overflowed(s);
  if (sum !== s.arrivals) {
    problems.push(
      `${item.slug}: ${accepted(s)} accepted plus ${peakDepth(s)} queued plus ${overflowed(s)}` +
        ` dropped is ${sum}, and ${s.arrivals} arrived. Connections do not evaporate.`,
    );
  }
  const hand = byHand(s);
  if (hand.dropped !== overflowed(s)) {
    problems.push(
      `${item.slug}: the closed form says ${overflowed(s)} could not be queued and stepping` +
        ` through the burst says ${hand.dropped}`,
    );
  }
  /*
    Accepted and still queued are compared together rather than one at a time.
    On a listener that is keeping up, whether the last connection of the burst
    counts as accepted or as sitting in the queue at the instant the window
    closes is a knife edge worth nothing, and the two ways of counting land on
    opposite sides of it. Their sum is not a knife edge, and neither is the
    number that matters, which is the drops.
  */
  if (hand.taken + hand.left !== accepted(s) + peakDepth(s)) {
    problems.push(
      `${item.slug}: the closed form has ${accepted(s)} accepted and ${peakDepth(s)} queued and` +
        ` stepping through the burst has ${hand.taken} and ${hand.left}`,
    );
  }
  if (hand.peak > queueCapacity(s) || hand.peak < peakDepth(s)) {
    problems.push(
      `${item.slug}: stepping through the burst peaks at ${hand.peak} against a model depth of` +
        ` ${peakDepth(s)} and a queue that holds ${queueCapacity(s)}`,
    );
  }
  if (overflowed(s) > 0 && hand.peak !== peakDepth(s)) {
    problems.push(
      `${item.slug}: ${overflowed(s)} were dropped, so the queue was full, and stepping through` +
        ` the burst peaks at ${hand.peak} rather than ${peakDepth(s)}`,
    );
  }
  /*
    The closed form assumes the arrival rate stays above the accept rate for
    the whole burst, which is what makes the depth monotonic and the peak the
    depth at the end. A case that overflows without that being true is outside
    what the model claims.
  */
  if (overflowed(s) > 0 && (s.arrivals * 1000) / s.windowMs <= s.acceptsPerSecond) {
    problems.push(
      `${item.slug}: ${overflowed(s)} overflow on a burst arriving slower than the accept rate,` +
        ` which is outside what the closed form claims`,
    );
  }
}

/* ── 5. the model against itself ────────────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;
  const f = fate(s);

  if (clientDelayMs(s) !== f.delayMs) {
    problems.push(`${item.slug}: clientDelayMs is ${clientDelayMs(s)} and fate says ${f.delayMs}`);
  }
  if (listenDrops(s) < overflowed(s)) {
    problems.push(
      `${item.slug}: ListenDrops ${listenDrops(s)} is below ListenOverflows ${overflowed(s)}, and` +
        ` the overflow path increments both`,
    );
  }
  if (overflowed(s) === 0 && f.ending !== "queued") {
    problems.push(`${item.slug}: nothing overflowed and the fate is "${f.ending}"`);
  }
  if (f.ending === "late") {
    const chances = recoveryTimesMs(s);
    if (!chances.some((one) => one.atMs === f.delayMs && one.by === f.by)) {
      problems.push(
        `${item.slug}: it lands at ${f.delayMs} ms by "${f.by}" and no such chance is in the` +
          ` retransmission schedule`,
      );
    }
    const wait = waitForSlotMs(s);
    if (f.delayMs < wait) {
      problems.push(`${item.slug}: it lands at ${f.delayMs} ms and a slot only exists at ${wait} ms`);
    }
    const earlier = chances.filter((one) => one.atMs >= wait && one.atMs < f.delayMs);
    if (earlier.length > 0) {
      problems.push(
        `${item.slug}: it lands at ${f.delayMs} ms and ${earlier[0].atMs} ms was already a chance`,
      );
    }
    if (f.delayMs > requestLifetimeMs(s.synackRetries)) {
      problems.push(`${item.slug}: it lands at ${f.delayMs} ms, after the request was given up on`);
    }
  }
  /* No accepts at all and something overflowed means no slot, ever. */
  const wantsNever = overflowed(s) > 0 && s.acceptsPerSecond === 0;
  if (wantsNever !== (waitForSlotMs(s) < 0)) {
    problems.push(
      `${item.slug}: waitForSlotMs returned ${waitForSlotMs(s)} with ${s.acceptsPerSecond} accepts` +
        ` a second and ${overflowed(s)} waiting`,
    );
  }
  if (s.abortOnOverflow === 1 && overflowed(s) > 0 && f.ending !== "reset") {
    problems.push(`${item.slug}: tcp_abort_on_overflow is 1 and the fate is "${f.ending}"`);
  }
}

/* ── 6. what the page renders ───────────────────────────────────────────── */

for (const item of CASES) {
  const s = item.setup;

  const ss = asSs(s).split("\n");
  if (ss.length !== 2 || !ss[0].includes("Recv-Q") || !ss[0].includes("Send-Q")) {
    problems.push(`${item.slug}: ss -ltn does not render its two queue columns`);
  }
  const cells = ss[1].trim().split(/\s+/);
  if (cells[0] !== "LISTEN") problems.push(`${item.slug}: the ss row is not a LISTEN row`);
  if (Number(cells[1]) !== peakDepth(s)) {
    problems.push(`${item.slug}: ss prints Recv-Q ${cells[1]} and the depth is ${peakDepth(s)}`);
  }
  if (Number(cells[2]) !== effectiveCap(s)) {
    problems.push(`${item.slug}: ss prints Send-Q ${cells[2]} and the cap is ${effectiveCap(s)}`);
  }
  if (!ss[1].includes(`0.0.0.0:${s.port}`)) {
    problems.push(`${item.slug}: the ss row is not on port ${s.port}`);
  }

  const counters = Object.fromEntries(
    asNstat(s)
      .split("\n")
      .filter((line) => line.startsWith("TcpExt"))
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return [parts[0], Number(parts[1])];
      }),
  );
  if (counters.TcpExtListenOverflows !== overflowed(s)) {
    problems.push(
      `${item.slug}: nstat prints ListenOverflows ${counters.TcpExtListenOverflows} and the model` +
        ` says ${overflowed(s)}`,
    );
  }
  if (counters.TcpExtListenDrops !== listenDrops(s)) {
    problems.push(
      `${item.slug}: nstat prints ListenDrops ${counters.TcpExtListenDrops} and the model says` +
        ` ${listenDrops(s)}`,
    );
  }
  if (counters.TcpExtListenDrops < counters.TcpExtListenOverflows) {
    problems.push(`${item.slug}: the rendered ListenDrops is below the rendered ListenOverflows`);
  }

  const sysctl = asSysctl(s);
  for (const [line, want] of [
    ["net.core.somaxconn", s.somaxconn],
    ["net.ipv4.tcp_abort_on_overflow", s.abortOnOverflow],
    ["net.ipv4.tcp_max_syn_backlog", s.maxSynBacklog],
    ["net.ipv4.tcp_syncookies", s.syncookies],
    ["net.ipv4.tcp_synack_retries", s.synackRetries],
  ] as [string, number][]) {
    if (!sysctl.includes(`${line} = ${want}`)) {
      problems.push(`${item.slug}: sysctl output is missing "${line} = ${want}"`);
    }
  }
  /* The queue columns and the counters, not the address column: 0.0.0.0 is
     four integers with dots between them and is not a fraction of anything. */
  for (const figure of [cells[1], cells[2], ...Object.values(counters).map(String)]) {
    if (!/^\d+$/.test(figure)) {
      problems.push(`${item.slug}: a rendered counter or queue depth reads "${figure}"`);
    }
  }
}

for (const [value, want] of [
  [0, "0 ms"],
  [200, "200 ms"],
  [3000, "3 s"],
  [63000, "63 s"],
  [102200, "102.2 s"],
  [924600, "924.6 s"],
] as [number, string][]) {
  if (humanMs(value) !== want) {
    problems.push(`humanMs(${value}) is "${humanMs(value)}" and the page needs "${want}"`);
  }
}

/* ── 7. what the set has to contain ─────────────────────────────────────── */

const capBoundByBacklog = CASES.filter((item) => item.setup.backlog < item.setup.somaxconn);
const capBoundBySomaxconn = CASES.filter((item) => item.setup.somaxconn < item.setup.backlog);
if (capBoundByBacklog.length === 0 || capBoundBySomaxconn.length === 0) {
  problems.push(
    `every case is bound by the same side of min(backlog, somaxconn)` +
      ` (${capBoundByBacklog.length} backlog, ${capBoundBySomaxconn.length} somaxconn). The whole` +
      ` point is that the advice which fixes one does nothing for the other.`,
  );
}

const oldKernel = CASES.filter((item) => somaxconnDefault(item.setup.kernel) === 128);
const newKernel = CASES.filter((item) => somaxconnDefault(item.setup.kernel) === 4096);
if (oldKernel.length === 0 || newKernel.length === 0) {
  problems.push(
    `the set is all on one side of the 5.4 somaxconn change (${oldKernel.length} before,` +
      ` ${newKernel.length} after), and the change is half of why this is confusing`,
  );
}
if (!oldKernel.some((item) => item.setup.somaxconn === 128)) {
  problems.push(`no pre-5.4 case is actually running that kernel's default somaxconn of 128`);
}
if (!newKernel.some((item) => item.setup.somaxconn === 4096)) {
  problems.push(`no post-5.4 case is actually running that kernel's default somaxconn of 4096`);
}

const endings = new Set(CASES.map((item) => fate(item.setup).ending));
for (const wanted of ["queued", "late", "reset"]) {
  if (!endings.has(wanted as "queued")) {
    problems.push(`no case ends "${wanted}", and the three endings are the point of the fate`);
  }
}
if (!CASES.some((item) => item.setup.abortOnOverflow === 1)) {
  problems.push(`no case has tcp_abort_on_overflow set, so the silence is never contrasted with a RST`);
}
if (!CASES.some((item) => overflowed(item.setup) === 0)) {
  problems.push(`no case has a queue that never filled, so ListenOverflows at zero proves nothing here`);
}
if (!CASES.some((item) => listenDrops(item.setup) > overflowed(item.setup))) {
  problems.push(`no case separates ListenDrops from ListenOverflows, which is the reason for both`);
}
if (!CASES.some((item) => item.setup.acceptsPerSecond === 0)) {
  problems.push(`no case has the accept loop stopped, which is the surface's own headline`);
}

/* ── 8. spread and uniqueness ───────────────────────────────────────────── */

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(
    `${Math.max(...spread)} of ${CASES.length} answers are in the same option position (${spread.join("/")})`,
  );
}

const seen = new Map<string, string>();
for (const item of CASES) {
  const prior = seen.get(item.breaks);
  if (prior) problems.push(`${item.slug} and ${prior} break the same belief: "${item.breaks}"`);
  seen.set(item.breaks, item.slug);
  for (const field of ["brief", "question", "why", "fix"] as const) {
    if (!item[field] || item[field].length < 20) problems.push(`${item.slug}: ${field} is thin`);
  }
}
if (new Set(CASES.map((item) => item.slug)).size !== CASES.length) {
  problems.push(`two cases share a slug`);
}

if (problems.length) {
  console.error(`check-backlog: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} listeners through min(backlog, somaxconn), each with exactly one option` +
    ` that holds, ${fixed.length} fixed points checked against listen(2), ip-sysctl and the kernel` +
    ` source, the backoff walked and closed-form both ways at 60 boundaries, every burst conserved` +
    ` (accepted plus queued plus dropped equals arrivals) and re-derived by stepping through it,` +
    ` both sides of the min represented (${capBoundByBacklog.length} backlog,` +
    ` ${capBoundBySomaxconn.length} somaxconn), both sides of the 5.4 default` +
    ` (${oldKernel.length} before, ${newKernel.length} after), all three endings present, and` +
    ` answers spread ${spread.join("/")}.`,
);
