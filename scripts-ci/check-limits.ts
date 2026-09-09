/**
 * The descriptor limit surface, against what the kernel and systemd do.
 *
 * The four layers that have each caught something on the previous surfaces,
 * plus one that belongs to this one specifically.
 *
 * That one is the precedence table. The whole surface is the claim that
 * these five mechanisms are not a hierarchy, so the gate states which
 * mechanism applies to which origin as data, and checks the model against
 * it exhaustively rather than trusting the cases to cover the combinations.
 * Nine origin-and-configuration pairs, each asserted, so a change that makes
 * limits.conf apply to a unit fails here even if no case happens to notice.
 *
 *     npx tsx scripts-ci/check-limits.ts
 */

import {
  CASES,
  KERNEL_DEFAULT,
  asProcLimits,
  asUlimit,
  configured,
  correctOption,
  effective,
  failsWith,
  highestFd,
  limit,
  matching,
  openTotal,
  succeeds,
} from "../client/src/lib/limits/index";
import type { Origin, Pair, Setup, Source } from "../client/src/lib/limits/types";

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
}

/* ── 2. the prose figure and the checked figure ─────────────────────────── */

for (const item of CASES) {
  for (const option of item.options) {
    const says = option.says;
    const want =
      says.about === "soft" || says.about === "hard" || says.about === "highest-fd"
        ? says.value
        : null;
    if (want === null) continue;
    const lead = /^(\d[\d,]*)/.exec(option.claim.trim());
    if (!lead) continue;
    const shown = Number(lead[1].replace(/,/g, ""));
    if (shown !== want) {
      problems.push(
        `${item.slug}/${option.id}: the claim opens with ${shown} and is checked against ${want}.` +
          ` A reader believes the prose.`,
      );
    }
  }
}

/* ── 3. the precedence table, stated as data and checked exhaustively ───── */

/*
  Which mechanism is in scope for which kind of process. This is the whole
  content of the surface, so it is written here as a table rather than left
  implicit in the model, and every combination is checked whether or not a
  case uses it. A change that made limits.conf apply to a systemd unit would
  break one case's answer; it breaks nine assertions here.
*/
const CONF: Pair = { soft: 65536, hard: 65536 };
const UNIT: Pair = { soft: 4096, hard: 8192 };
const RUNTIME: Pair = { soft: 200000, hard: 200000 };
const DEFAULT: Pair = { soft: 1024, hard: 524288 };

const scope: [Origin, "conf" | "unit" | "runtime" | "nothing", Source, Pair][] = [
  ["systemd", "nothing", "DefaultLimitNOFILE", DEFAULT],
  ["systemd", "conf", "DefaultLimitNOFILE", DEFAULT],
  ["systemd", "unit", "LimitNOFILE", UNIT],
  ["login", "nothing", "the kernel default", KERNEL_DEFAULT],
  ["login", "conf", "limits.conf", CONF],
  ["login", "unit", "the kernel default", KERNEL_DEFAULT],
  ["container", "nothing", "the kernel default", KERNEL_DEFAULT],
  ["container", "conf", "the kernel default", KERNEL_DEFAULT],
  ["container", "runtime", "the container runtime", RUNTIME],
];

for (const [origin, sets, wantSource, wantPair] of scope) {
  const setup: Setup = {
    origin,
    limitsConf: sets === "conf" ? CONF : null,
    systemdDefault: DEFAULT,
    unitLimit: sets === "unit" ? UNIT : null,
    containerLimit: sets === "runtime" ? RUNTIME : null,
    nrOpen: 1048576,
    fileMax: 9_000_000,
    openElsewhere: 0,
    raisesItself: false,
    wants: 10,
  };
  const got = configured(setup);
  if (got.source !== wantSource) {
    problems.push(
      `a ${origin} process with ${sets === "nothing" ? "nothing set" : sets + " set"} takes its` +
        ` limit from ${got.source}, and the table says ${wantSource}. These five mechanisms are` +
        ` not a hierarchy and this is where that is written down.`,
    );
  }
  if (got.pair.soft !== wantPair.soft || got.pair.hard !== wantPair.hard) {
    problems.push(
      `a ${origin} process with ${sets} set gets ${got.pair.soft}:${got.pair.hard} and the table` +
        ` says ${wantPair.soft}:${wantPair.hard}`,
    );
  }
}

/*
  The soft limit is never above the hard limit, whatever the settings say,
  and a process that raises itself lands exactly on its hard limit. Both are
  properties of every setup rather than of any one case.
*/
for (const item of CASES) {
  const e = effective(item.setup);
  if (e.soft > e.hard) {
    problems.push(`${item.slug}: the soft limit ${e.soft} is above the hard limit ${e.hard}`);
  }
  if (e.hard > item.setup.nrOpen) {
    problems.push(
      `${item.slug}: the hard limit ${e.hard} is above fs.nr_open at ${item.setup.nrOpen}, which` +
        ` setrlimit(2) returns EPERM for`,
    );
  }
  const raised = effective({ ...item.setup, raisesItself: true });
  if (raised.soft !== raised.hard) {
    problems.push(
      `${item.slug}: a process raising its own soft limit reaches ${raised.soft} and its hard` +
        ` limit is ${raised.hard}. setrlimit(2) allows exactly the hard limit without privilege.`,
    );
  }
  if (highestFd(item.setup) !== e.soft - 1) {
    problems.push(
      `${item.slug}: the highest descriptor is ${highestFd(item.setup)} with a soft limit of` +
        ` ${e.soft}. RLIMIT_NOFILE is one greater than the highest number.`,
    );
  }
}

/* ── 4. the two errnos, which point at different files ──────────────────── */

/*
  EMFILE is this process against its own soft limit; ENFILE is the machine
  against fs.file-max. Checked by moving each limit independently: raising
  the per process limit must never turn ENFILE into success, and emptying
  the machine wide table must never turn EMFILE into success.
*/
for (const item of CASES) {
  const errno = failsWith(item.setup);
  if (errno === "ENFILE") {
    const generous: Setup = { ...item.setup, unitLimit: { soft: 1048576, hard: 1048576 } };
    if (failsWith(generous) !== "ENFILE") {
      problems.push(
        `${item.slug}: raising the process's own limit changed an ENFILE, which is a machine wide` +
          ` limit and cannot be affected by it`,
      );
    }
  }
  if (errno === "EMFILE") {
    const empty: Setup = { ...item.setup, openElsewhere: 0, fileMax: 9_000_000_000 };
    if (failsWith(empty) !== "EMFILE") {
      problems.push(
        `${item.slug}: emptying the machine wide table changed an EMFILE, which is this process` +
          ` against its own soft limit`,
      );
    }
  }
  if (succeeds(item.setup) !== (errno === null)) {
    problems.push(`${item.slug}: succeeds() and failsWith() disagree`);
  }
  if (openTotal(item.setup) > item.setup.fileMax && errno !== "ENFILE") {
    problems.push(`${item.slug}: more descriptors open than fs.file-max allows and no ENFILE`);
  }
}

/* ── 5. direct properties ───────────────────────────────────────────────── */

const find = (slug: string) => CASES.find((item) => item.slug === slug)!.setup;

const properties: [string, () => boolean, string][] = [
  [
    "limits-conf-does-nothing",
    () => {
      const s = find("limits-conf-does-nothing");
      const asLogin: Setup = { ...s, origin: "login" };
      /* The same host, the same file, two different answers. Both halves. */
      return (
        s.limitsConf !== null &&
        effective(s).soft === s.systemdDefault.soft &&
        effective(asLogin).soft === s.limitsConf.soft &&
        effective(s).soft !== effective(asLogin).soft
      );
    },
    "the same limits.conf giving one answer to a unit and a different one to a login",
  ],
  [
    "the-daemon-raises-itself",
    () => {
      const s = find("the-daemon-raises-itself");
      const passive: Setup = { ...s, raisesItself: false };
      return (
        s.raisesItself &&
        succeeds(s) &&
        !succeeds(passive) &&
        effective(s).soft === effective(s).hard
      );
    },
    "succeeding only because it raised itself, and failing when it does not",
  ],
  [
    "emfile-is-not-enfile",
    () => {
      const s = find("emfile-is-not-enfile");
      /* Comfortably inside its own limit and failing anyway. */
      return failsWith(s) === "ENFILE" && s.wants < effective(s).soft / 4;
    },
    "failing at under a quarter of its own soft limit, so the errno cannot be EMFILE",
  ],
  [
    "infinity-is-nr-open",
    () => {
      const s = find("infinity-is-nr-open");
      return (
        effective(s).clamped &&
        effective(s).hard === s.nrOpen &&
        s.unitLimit !== null &&
        s.unitLimit.hard > s.nrOpen
      );
    },
    "a unit asking for more than fs.nr_open and getting exactly fs.nr_open",
  ],
  [
    "one-greater-than-the-highest",
    () => {
      const s = find("one-greater-than-the-highest");
      /* Wants exactly the limit, which succeeds, and the top fd is one less. */
      return s.wants === effective(s).soft && succeeds(s) && highestFd(s) === s.wants - 1;
    },
    "holding exactly as many descriptors as the limit, with the highest numbered one below it",
  ],
  [
    "the-shell-was-not-the-service",
    () => {
      const s = find("the-shell-was-not-the-service");
      const asUnit: Setup = { ...s, origin: "systemd" };
      return (
        effective(s).source === "limits.conf" &&
        effective(asUnit).source === "DefaultLimitNOFILE" &&
        effective(s).soft > effective(asUnit).soft
      );
    },
    "the login reading higher than the unit on the same host, from the same file",
  ],
  [
    "the-container-brought-its-own",
    () => {
      const s = find("the-container-brought-its-own");
      /* Exactly at nr_open and therefore not clamped, which is the detail. */
      return (
        effective(s).source === "the container runtime" &&
        !effective(s).clamped &&
        s.containerLimit?.hard === s.nrOpen
      );
    },
    "the runtime's limit landing exactly on fs.nr_open and not being clamped",
  ],
  [
    "nobody-set-anything",
    () => {
      const s = find("nobody-set-anything");
      const raised: Setup = { ...s, raisesItself: true };
      /* Even raising itself does not reach what it wants. */
      return (
        effective(s).hard === KERNEL_DEFAULT.hard &&
        !succeeds(s) &&
        effective(raised).soft < 5000
      );
    },
    "the kernel's own hard limit, low enough that raising itself still does not help much",
  ],
  [
    "the-unit-wins-over-the-default",
    () => {
      const s = find("the-unit-wins-over-the-default");
      /* The unit lowered the ceiling below what the default would have given. */
      return (
        effective(s).hard === s.unitLimit?.hard &&
        effective(s).hard < s.systemdDefault.hard &&
        succeeds(s)
      );
    },
    "a unit setting that lowered its own hard ceiling below the host default",
  ],
  [
    "a-thousand-is-enough",
    () => {
      const s = find("a-thousand-is-enough");
      return succeeds(s) && s.wants < effective(s).soft && effective(s).soft === 1024;
    },
    "the default soft limit of 1024 and a process comfortably inside it",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-limits names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(
      `${slug} no longer has the property it exists to teach: ${what}. The exactly-one check` +
        ` cannot see this.`,
    );
  }
}

/* ── 6. what the page renders ───────────────────────────────────────────── */

for (const item of CASES) {
  const e = effective(item.setup);
  const ulimit = asUlimit(item.setup);
  if (!new RegExp(`ulimit -Sn\\n${e.soft}\\n`).test(ulimit)) {
    problems.push(`${item.slug}: the rendered ulimit -Sn is not ${e.soft}`);
  }
  if (!new RegExp(`ulimit -Hn\\n${e.hard}$`).test(ulimit)) {
    problems.push(`${item.slug}: the rendered ulimit -Hn is not ${e.hard}`);
  }
  const proc = asProcLimits(item.setup);
  const line = proc.split("\n")[1] ?? "";
  const fields = line.replace("Max open files", "").trim().split(/\s+/);
  if (Number(fields[0]) !== e.soft || Number(fields[1]) !== e.hard) {
    problems.push(
      `${item.slug}: /proc/PID/limits renders ${fields[0]}:${fields[1]} and the model says` +
        ` ${e.soft}:${e.hard}`,
    );
  }
  if (!/files$/.test(line)) problems.push(`${item.slug}: the /proc/PID/limits line has no units column`);
}

for (const [value, want] of [
  [1024, "1024"],
  [524288, "524288"],
  [1048576, "1,048,576"],
] as [number, string][]) {
  if (limit(value) !== want) problems.push(`limit(${value}) is "${limit(value)}" and the page needs "${want}"`);
}

/* ── 7. spread and uniqueness ───────────────────────────────────────────── */

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
  console.error(`check-limits: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} processes against five mechanisms, each with exactly one option that holds,` +
    ` ${scope.length} origin and configuration pairs checked against a stated precedence table,` +
    ` ${properties.length} direct properties, both errnos checked to move only with their own` +
    ` limit, and answers spread ${spread.join("/")}.`,
);
