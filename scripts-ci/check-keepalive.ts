/**
 * The idle connection surface, against the three timers as their own
 * documentation states them.
 *
 * The layers that have caught something on the previous surfaces, plus two
 * that belong to this one.
 *
 * The first is the fixed points. This surface has no single function to
 * transcribe, so there is no "recompute it the other way" check that proves
 * the whole thing at once. What there is instead is a handful of numbers
 * that appear verbatim in primary sources: 924.6 seconds for tcp_retries2 at
 * 15, 7875 for keepalive at its defaults, 432000 for conntrack, 350 for an
 * NLB, 240 for an Azure Load Balancer, 1200 for a Cloud NAT gateway. If the
 * model drifts, one of those stops coming out, and the gate says which.
 *
 * The second is the misconception itself, asserted rather than described. On
 * every case where SO_KEEPALIVE is not set, changing tcp_keepalive_time must
 * change nothing at all, because a sysctl no socket opted into cannot affect
 * a socket. A model that quietly probed anyway would pass every arithmetic
 * check here and teach the opposite of the thing the page is for.
 *
 *     npx tsx scripts-ci/check-keepalive.ts
 */

import {
  CASES,
  DEFAULT_KEEPALIVE_INTVL,
  DEFAULT_KEEPALIVE_PROBES,
  DEFAULT_KEEPALIVE_TIME,
  DEFAULT_RETRIES2,
  RTO_MAX_MS,
  RTO_MIN_MS,
  asMiddlebox,
  asSs,
  asSysctl,
  correctOption,
  deadPeerDetection,
  firstProbe,
  forgottenAt,
  heartbeatDetection,
  holds,
  matching,
  nextWrite,
  noticedAt,
  outcome,
  retransmitTimeout,
  retransmitTimeoutMs,
  ssTimer,
  survives,
  wireGap,
} from "../client/src/lib/keepalive/index";
import type { Claim, Setup } from "../client/src/lib/keepalive/types";

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
  if (new Set(item.options.map((o) => o.id)).size !== item.options.length) {
    problems.push(`${item.slug}: two options share an id`);
  }

  /*
    The same question the other way round: holds() against each option one at
    a time, rather than the filter matching() runs. A correctOption that came
    back non-null while some other claim also held would show up here as a
    second true option even if matching() had been broken in the same edit.
  */
  const right = correctOption(item);
  if (right === null) {
    problems.push(`${item.slug}: correctOption returned nothing to mark`);
  } else {
    if (!holds(right.says, item.setup)) {
      problems.push(`${item.slug}: correctOption returned ${right.id}, whose claim does not hold`);
    }
    for (const option of item.options) {
      if (option.id === right.id) continue;
      if (holds(option.says, item.setup)) {
        problems.push(`${item.slug}: distractor ${option.id} is true under the model`);
      }
    }
  }
}

/* ── the prose figure and the checked figure ────────────────────────────── */

/*
  Checked by scripts-ci/check-option-prose.ts, generically, for every surface
  that offers options rather than for this one.
*/

/* ── 2. whole seconds and whole counts ──────────────────────────────────── */

/*
  sysctl prints integers and so does the third column of
  /proc/net/nf_conntrack. A case with a keepalive interval of 7.5 describes a
  host nobody can reproduce. Derived figures are allowed a tenth, because the
  kernel's own documentation states 924.6 seconds, and that is exactly one
  decimal rather than a float that happened to land somewhere.
*/
for (const item of CASES) {
  const scalars: [string, unknown][] = [
    ...Object.entries(item.setup),
    ["middlebox.idleTimeout", item.setup.middlebox.idleTimeout],
  ];
  for (const [name, value] of scalars) {
    if (typeof value !== "number") continue;
    if (!Number.isInteger(value)) {
      problems.push(
        `${item.slug}: ${name} is ${value}, which is not a whole second. sysctl prints integers,` +
          ` so this case describes a host that cannot exist and its answers cannot be reproduced` +
          ` on one.`,
      );
    }
    if (value < 0) problems.push(`${item.slug}: ${name} is negative`);
  }
  for (const derived of [noticedAt, forgottenAt, wireGap, firstProbe, deadPeerDetection]) {
    const value = derived(item.setup);
    if (value === null) continue;
    if (Math.round(value * 10) !== value * 10) {
      problems.push(
        `${item.slug}: ${derived.name}() returns ${value}, which is finer than the tenth of a` +
          ` second the kernel documentation quotes`,
      );
    }
  }
  if (item.setup.heartbeat === 0 && item.setup.heartbeatMisses !== 0) {
    problems.push(`${item.slug}: no heartbeat, and heartbeatMisses is ${item.setup.heartbeatMisses}`);
  }
  if (item.setup.heartbeat > 0 && item.setup.heartbeatMisses < 1) {
    problems.push(`${item.slug}: a heartbeat that tolerates no misses is not a heartbeat`);
  }
}

/* ── 3. the same answer, worked out a second way ────────────────────────── */

/*
  outcome() builds its answer out of the named helpers. This works the whole
  thing out in one function with no helpers at all, in the order the three
  timers actually run, which is the shape a wiring error survives in: every
  helper correct and one of them consulted at the wrong moment still produces
  correct helpers.
*/
function recomputed(setup: Setup): {
  gap: number | null;
  forgotten: number | null;
  write: string;
  noticed: number | null;
} {
  const ticks: number[] = [];
  if (setup.soKeepalive) ticks.push(setup.keepaliveTime);
  if (setup.heartbeat > 0) ticks.push(setup.heartbeat);
  const gap = ticks.length > 0 ? Math.min(...ticks) : null;

  const box = setup.middlebox;
  const forgotten =
    box.idleTimeout > 0 &&
    box.idleTimeout < setup.idleSeconds &&
    !(gap !== null && gap < box.idleTimeout)
      ? box.idleTimeout
      : null;

  const write =
    forgotten !== null
      ? box.onForgotten === "reset"
        ? "reset"
        : "silence"
      : setup.peer === "gone"
        ? "silence"
        : "delivered";

  /* The RTO ladder, in milliseconds, exactly as ip-sysctl describes it. */
  let rto = RTO_MIN_MS;
  let budget = 0;
  for (let n = 0; n <= setup.retries2; n += 1) {
    budget += rto;
    rto = Math.min(rto * 2, RTO_MAX_MS);
  }

  const quiet = setup.peer === "gone" || forgotten !== null;
  const resets = forgotten !== null && box.onForgotten === "reset";
  const times: number[] = [];
  if (setup.soKeepalive && quiet) {
    times.push(
      resets
        ? setup.keepaliveTime
        : setup.keepaliveTime + setup.keepaliveProbes * setup.keepaliveIntvl,
    );
  }
  if (setup.heartbeat > 0 && quiet) {
    times.push(resets ? setup.heartbeat : setup.heartbeat * setup.heartbeatMisses);
  }
  if (write === "reset") times.push(setup.idleSeconds);
  if (write === "silence") times.push(Math.round((setup.idleSeconds * 1000 + budget) / 100) / 10);

  return { gap, forgotten, write, noticed: times.length > 0 ? Math.min(...times) : null };
}

for (const item of CASES) {
  const again = recomputed(item.setup);
  const parts = outcome(item.setup);
  const pairs: [string, unknown, unknown][] = [
    ["wireGap", wireGap(item.setup), again.gap],
    ["forgottenAt", forgottenAt(item.setup), again.forgotten],
    ["nextWrite", nextWrite(item.setup), again.write],
    ["noticedAt", noticedAt(item.setup), again.noticed],
  ];
  for (const [name, mine, theirs] of pairs) {
    if (mine !== theirs) {
      problems.push(`${item.slug}: ${name}() says ${mine} and a straight recomputation says ${theirs}`);
    }
  }
  /* And the bundle against the accessors, which the page uses interchangeably. */
  if (parts.forgottenAt !== forgottenAt(item.setup)) {
    problems.push(`${item.slug}: outcome().forgottenAt and forgottenAt() disagree`);
  }
  if (parts.wireGap !== wireGap(item.setup)) {
    problems.push(`${item.slug}: outcome().wireGap and wireGap() disagree`);
  }
  if (parts.firstProbe !== firstProbe(item.setup)) {
    problems.push(`${item.slug}: outcome().firstProbe and firstProbe() disagree`);
  }
  if (parts.deadPeerAt !== deadPeerDetection(item.setup)) {
    problems.push(`${item.slug}: outcome().deadPeerAt and deadPeerDetection() disagree`);
  }
  if (parts.heartbeatAt !== heartbeatDetection(item.setup)) {
    problems.push(`${item.slug}: outcome().heartbeatAt and heartbeatDetection() disagree`);
  }
  if (parts.nextWrite !== nextWrite(item.setup)) {
    problems.push(`${item.slug}: outcome().nextWrite and nextWrite() disagree`);
  }
  if (survives(item.setup) !== (forgottenAt(item.setup) === null)) {
    problems.push(`${item.slug}: survives() and forgottenAt() disagree about the same flow`);
  }
  if ((parts.noticedBy === "nothing") !== (parts.noticedAt === null)) {
    problems.push(`${item.slug}: noticedBy is ${parts.noticedBy} and noticedAt is ${parts.noticedAt}`);
  }
}

/* ── 4. the fixed points, which come from the documents ─────────────────── */

const fixed: [string, () => boolean, string][] = [
  [
    "tcp_retries2",
    () => retransmitTimeoutMs(15) === 924600 && retransmitTimeout(15) === 924.6,
    `ip-sysctl: "The default value of 15 yields a hypothetical timeout of 924.6 seconds"`,
  ],
  [
    "RTO ladder",
    () =>
      RTO_MIN_MS === 200 &&
      RTO_MAX_MS === 120000 &&
      retransmitTimeoutMs(9) === 204600 &&
      retransmitTimeoutMs(10) - retransmitTimeoutMs(9) === RTO_MAX_MS &&
      retransmitTimeout(3) === 3,
    "TCP_RTO_MIN of 200 ms doubling to the TCP_RTO_MAX ceiling of 120 s, so ten doublings make" +
      " 204.6 s and every retry after that adds the ceiling",
  ],
  [
    "the keepalive defaults",
    () =>
      DEFAULT_KEEPALIVE_TIME === 7200 &&
      DEFAULT_KEEPALIVE_INTVL === 75 &&
      DEFAULT_KEEPALIVE_PROBES === 9 &&
      DEFAULT_RETRIES2 === 15,
    `ip-sysctl: tcp_keepalive_time "Default: 2hours", tcp_keepalive_probes "Default value: 9",` +
      ` tcp_keepalive_intvl "Default value: 75sec"`,
  ],
  [
    "dead peer detection at the defaults",
    () => {
      const stock = CASES.find((item) => item.slug === "the-peer-that-vanished")!.setup;
      return (
        deadPeerDetection(stock) === 7875 &&
        deadPeerDetection(stock) ===
          DEFAULT_KEEPALIVE_TIME + DEFAULT_KEEPALIVE_PROBES * DEFAULT_KEEPALIVE_INTVL
      );
    },
    "7200 + 9 x 75 = 7875 seconds, the only figure on this surface that nothing but keepalive" +
      " can produce",
  ],
  [
    "keepalive off is keepalive absent",
    () => {
      const off: Setup = {
        ...CASES[0].setup,
        soKeepalive: false,
        keepaliveTime: 1,
        keepaliveIntvl: 1,
        keepaliveProbes: 1,
      };
      return firstProbe(off) === null && deadPeerDetection(off) === null && wireGap(off) === null;
    },
    "RFC 1122: keep-alives \"MUST default to off\", so the three sysctls describe nothing at all" +
      " until a socket sets SO_KEEPALIVE",
  ],
  [
    "the documented middlebox timeouts",
    () => {
      const seen = new Map(CASES.map((item) => [item.setup.middlebox.idleTimeout, item.setup.middlebox]));
      return [350, 300, 432000, 240, 1200].every((value) => seen.has(value));
    },
    "350 for an NLB, 240 for an Azure Load Balancer, 1200 for a Cloud NAT gateway, 432000 for" +
      " stock conntrack, and a firewall turned down to 300",
  ],
  [
    "ss prints a lossy timer",
    () =>
      ssTimer(7875) === "131min" &&
      ssTimer(7200) === "120min" &&
      ssTimer(350) === "5min50sec" &&
      ssTimer(45) === "45sec" &&
      ssTimer(0) === "",
    "print_ms_timer in misc/ss.c stops printing seconds once the minutes pass nine, so a" +
      " keepalive timer of 7875 s shows as 131min with the fifteen seconds dropped",
  ],
];

for (const [name, check, source] of fixed) {
  if (!check()) {
    problems.push(`the ${name} figure no longer comes out of the model. Source: ${source}`);
  }
}

/* ── 5. the misconception, asserted ─────────────────────────────────────── */

/*
  The whole surface rests on two statements. A socket without SO_KEEPALIVE is
  unaffected by the three sysctls, and a socket with them at their defaults
  is unaffected by anything a middlebox does inside the first two hours. Both
  are checked here by mutation rather than by arithmetic, because a model
  that got them wrong would still produce internally consistent numbers.
*/
let keepaliveOff = 0;
for (const item of CASES) {
  if (item.setup.soKeepalive) continue;
  keepaliveOff += 1;
  const tuned: Setup = { ...item.setup, keepaliveTime: 1, keepaliveIntvl: 1, keepaliveProbes: 1 };
  if (noticedAt(tuned) !== noticedAt(item.setup) || forgottenAt(tuned) !== forgottenAt(item.setup)) {
    problems.push(
      `${item.slug}: SO_KEEPALIVE is not set and lowering the three sysctls changed the answer.` +
        ` A sysctl no socket opted into cannot affect that socket, and this is the misconception` +
        ` the surface exists to break.`,
    );
  }
}
if (keepaliveOff === 0) {
  problems.push(
    `every case has SO_KEEPALIVE set, so nothing in the set shows the default state of a socket`,
  );
}

const tooLate = [...new Set(CASES.map((item) => item.setup.middlebox.idleTimeout))].filter(
  (timeout) => timeout < DEFAULT_KEEPALIVE_TIME,
);
if (tooLate.length < 4) {
  problems.push(
    `only ${tooLate.length} of the middlebox timeouts in the set are under tcp_keepalive_time's` +
      ` default of ${DEFAULT_KEEPALIVE_TIME}. The point is that the first probe is later than` +
      ` almost every device in the path, and a set that does not show it has nothing in it.`,
  );
}

/* Every claim shape has to be used, or holds() has a branch nothing runs. */
const shapes = new Set(CASES.flatMap((item) => item.options.map((option) => option.says.about)));
for (const shape of [
  "survives",
  "forgotten",
  "next-write",
  "notices-after",
  "first-probe",
  "no-probe",
  "wire-gap",
  "nothing",
] as Claim["about"][]) {
  if (!shapes.has(shape)) problems.push(`no option anywhere claims "${shape}", so holds() has a dead arm`);
}

/* ── 6. direct properties, one per case ─────────────────────────────────── */

const find = (slug: string) => CASES.find((item) => item.slug === slug)!.setup;

/**
 * A difference of two one-decimal figures, rounded back to one decimal.
 *
 * 1284.6 minus 360 is 924.5999999999999 in binary floating point, and the
 * documentation says 924.6. The model never subtracts, because it works in
 * whole milliseconds and rounds once on the way out; the gate does subtract,
 * so it rounds the same way rather than comparing a figure nobody wrote.
 */
const apart = (a: number, b: number): number => Math.round((a - b) * 10) / 10;

const properties: [string, () => boolean, string][] = [
  [
    "six-minutes-of-silence",
    () => {
      const s = find("six-minutes-of-silence");
      /* Nothing on the wire at all, and the flow gone before the write. */
      return wireGap(s) === null && forgottenAt(s) === 350 && s.idleSeconds - 350 < 30;
    },
    "a flow forgotten with under thirty seconds to spare, on a connection that sends nothing",
  ],
  [
    "what-the-write-gets",
    () => {
      const s = find("what-the-write-gets");
      const quiet: Setup = { ...s, middlebox: { ...s.middlebox, onForgotten: "silence" } };
      /* Same flow, same moment, and the device's choice is worth 924.6 s. */
      return (
        nextWrite(s) === "reset" &&
        noticedAt(s) === s.idleSeconds &&
        nextWrite(quiet) === "silence" &&
        apart(noticedAt(quiet)!, noticedAt(s)!) === 924.6
      );
    },
    "a reset and a silent drop on the same flow, 924.6 seconds apart",
  ],
  [
    "nobody-turned-it-on",
    () => {
      const s = find("nobody-turned-it-on");
      return firstProbe(s) === null && !s.soKeepalive && s.keepaliveTime === DEFAULT_KEEPALIVE_TIME;
    },
    "a host with the stock tcp_keepalive_time and a socket that will never send a probe",
  ],
  [
    "two-hours-against-five-minutes",
    () => {
      const s = find("two-hours-against-five-minutes");
      /* Keepalive on, and later than the firewall by well over an hour. */
      return (
        s.soKeepalive && firstProbe(s)! > s.middlebox.idleTimeout + 3600 && forgottenAt(s) === 300
      );
    },
    "keepalive switched on and still more than an hour later than the firewall's timer",
  ],
  [
    "keepidle-under-the-timeout",
    () => {
      const before = find("two-hours-against-five-minutes");
      const after = find("keepidle-under-the-timeout");
      /* Identical but for the three socket options, and the answers differ. */
      const sameBut: Setup = {
        ...before,
        keepaliveTime: after.keepaliveTime,
        keepaliveIntvl: after.keepaliveIntvl,
        keepaliveProbes: after.keepaliveProbes,
      };
      return (
        JSON.stringify(sameBut) === JSON.stringify(after) &&
        !survives(before) &&
        survives(after) &&
        wireGap(after)! < after.middlebox.idleTimeout
      );
    },
    "identical to the case before it but for TCP_KEEPIDLE, with the opposite answer",
  ],
  [
    "the-ping-that-keeps-it-warm",
    () => {
      const s = find("the-ping-that-keeps-it-warm");
      /* The kernel contributes nothing and the flow lives anyway. */
      return firstProbe(s) === null && wireGap(s) === s.heartbeat && survives(s);
    },
    "a flow kept alive with SO_KEEPALIVE off, entirely by the application",
  ],
  [
    "the-peer-that-vanished",
    () => {
      const s = find("the-peer-that-vanished");
      /* Keepalive is the only thing that finds it: nothing else even fires. */
      return (
        s.peer === "gone" &&
        survives(s) &&
        heartbeatDetection(s) === null &&
        noticedAt(s) === 7875 &&
        outcome(s).noticedBy === "keepalive"
      );
    },
    "a dead peer found at 7875 seconds by keepalive, with no middlebox and no heartbeat in play",
  ],
  [
    "four-minutes-then-fifteen",
    () => {
      const s = find("four-minutes-then-fifteen");
      /* Forgotten long before the request, and the failure is a quarter of an
         hour after the request rather than at it. */
      return (
        forgottenAt(s) === 240 &&
        nextWrite(s) === "silence" &&
        apart(noticedAt(s)!, s.idleSeconds) === 924.6 &&
        outcome(s).noticedBy === "the retransmit timeout"
      );
    },
    "a flow dropped six minutes before the request and a write that takes 924.6 s to fail",
  ],
  [
    "ssh-noticed-in-three-minutes",
    () => {
      const s = find("ssh-noticed-in-three-minutes");
      /* Both keepalives on one socket, and the application's wins by 40x. */
      return (
        s.soKeepalive &&
        deadPeerDetection(s) === 7875 &&
        heartbeatDetection(s) === 180 &&
        noticedAt(s) === 180 &&
        deadPeerDetection(s)! / noticedAt(s)! > 40
      );
    },
    "a kernel keepalive and an application heartbeat on one socket, the application forty times faster",
  ],
  [
    "the-two-knobs-that-did-nothing",
    () => {
      const s = find("the-two-knobs-that-did-nothing");
      const stock: Setup = { ...s, keepaliveIntvl: 75, keepaliveProbes: 9 };
      /* The two knobs moved the tail and not the start, and the flow is gone
         either way. */
      return (
        firstProbe(s) === firstProbe(stock) &&
        deadPeerDetection(s) === 7230 &&
        deadPeerDetection(stock) === 7875 &&
        forgottenAt(s) === forgottenAt(stock)
      );
    },
    "a change that moved dead peer detection from 7875 to 7230 and the first probe not at all",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-keepalive names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(
      `${slug} no longer has the property it exists to teach: ${what}. The exactly-one check` +
        ` cannot see this.`,
    );
  }
}

/* ── 7. what the page renders ───────────────────────────────────────────── */

for (const item of CASES) {
  const sysctl = asSysctl(item.setup);
  for (const [key, want] of [
    ["net.ipv4.tcp_keepalive_time", item.setup.keepaliveTime],
    ["net.ipv4.tcp_keepalive_intvl", item.setup.keepaliveIntvl],
    ["net.ipv4.tcp_keepalive_probes", item.setup.keepaliveProbes],
    ["net.ipv4.tcp_retries2", item.setup.retries2],
  ] as [string, number][]) {
    if (!sysctl.includes(`${key} = ${want}`)) {
      problems.push(`${item.slug}: sysctl output does not carry ${key} = ${want}`);
    }
  }
  if (/\.\d/.test(sysctl.replace(/net\.ipv4\.\S+/g, ""))) {
    problems.push(`${item.slug}: sysctl output has a fractional value in it`);
  }

  const socket = asSs(item.setup);
  const hasTimer = socket.includes("timer:(keepalive,");
  if (hasTimer !== item.setup.soKeepalive) {
    problems.push(
      `${item.slug}: ss ${hasTimer ? "prints" : "omits"} a keepalive timer and SO_KEEPALIVE is` +
        ` ${item.setup.soKeepalive}. The absence of that field is the evidence for half this set.`,
    );
  }
  if (item.setup.soKeepalive && !socket.includes(ssTimer(item.setup.keepaliveTime))) {
    problems.push(`${item.slug}: ss does not print the timer as ${ssTimer(item.setup.keepaliveTime)}`);
  }
  if (!socket.includes(`lastsnd:${item.setup.idleSeconds * 1000}`)) {
    problems.push(`${item.slug}: ss does not show ${item.setup.idleSeconds} s of quiet`);
  }
  if (!socket.includes(item.setup.local) || !socket.includes(item.setup.remote)) {
    problems.push(`${item.slug}: ss does not print the socket pair the case describes`);
  }

  const box = asMiddlebox(item.setup);
  if (!box.includes(String(item.setup.middlebox.idleTimeout))) {
    problems.push(`${item.slug}: the middlebox view does not carry its own idle timeout`);
  }
  if (item.setup.middlebox.tracker === "conntrack" && !box.includes("ESTABLISHED")) {
    problems.push(`${item.slug}: a conntrack row with no state column`);
  }
  if (item.setup.middlebox.tracker === "documented" && box.includes("nf_conntrack")) {
    problems.push(`${item.slug}: a managed service rendered as a conntrack row it does not have`);
  }
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

if (problems.length) {
  console.error(`check-keepalive: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} connections through three timers, each with exactly one option that holds` +
    ` and no distractor that does, every outcome recomputed from a second pass with no helpers,` +
    ` ${fixed.length} documented fixed points intact (924.6 s for tcp_retries2, 7875 s for stock` +
    ` keepalive, 432000/1200/350/300/240 s of middlebox), ${keepaliveOff} cases proving a sysctl` +
    ` no socket opted into changes nothing, ${properties.length} direct properties, whole seconds` +
    ` throughout, and answers spread ${spread.join("/")}.`,
);
