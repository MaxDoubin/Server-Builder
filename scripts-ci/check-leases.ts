/**
 * The lease timing surface, against RFC 2131 as the client state machine
 * reads it.
 *
 * Three things this gate exists to hold in place.
 *
 * The timers are the surface. T1 defaults to half the lease and T2 to seven
 * eighths, a server may set either, and what a room of clients survives
 * follows from the lease less T1 rather than from the lease. The gate
 * recomputes the defaults from the RFC's two fractions directly, checks
 * T1 < T2 < expiry on every finite lease, and checks that moving T1 changes
 * what the room survives while the lease stays where it was.
 *
 * The population count is recomputed by a second method with a different
 * shape: a simulated room of clients whose remaining times are laid across
 * the band from lease-minus-T1 to the lease, counted one client at a time
 * against the outage, with no fraction and nothing rounded. The closed form
 * in the model and the head count here have to agree.
 *
 * The pool result is recomputed the same way: hour by hour, addresses handed
 * out at the arrival rate and handed back a lease later, until the first hour
 * with too few free or a week of hours with the pool never empty. Little's
 * law in the model and the ledger here have to agree.
 *
 *     npx tsx scripts-ci/check-leases.ts
 */

import {
  CASES,
  INFINITE_LEASE,
  asLease,
  asTimeline,
  broadcastsAt,
  clientsLost,
  concurrentLeases,
  correctOption,
  exhaustsAfter,
  expiresAt,
  firstRenewalAt,
  fractionLosing,
  holds,
  human,
  isInfinite,
  keepsAddress,
  leaseSeconds,
  matching,
  poolUnderPressure,
  recoveredPerDay,
  survivesOutageUpTo,
  timers,
} from "../client/src/lib/leases/index";
import type { Setup } from "../client/src/lib/leases/types";

const problems: string[] = [];
const whole = (n: number) => Number.isInteger(n) && n >= 0;

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
  for (const option of item.options) {
    if (holds(option.says, item.setup) !== hits.includes(option)) {
      problems.push(`${item.slug}: holds() and matching() disagree about ${option.id}`);
    }
    if (option.says.about === "nothing" && holds(option.says, item.setup)) problems.push(`${item.slug}: a claim about nothing holds`);
  }
}

/* ── 2. inputs a real lease could hold ──────────────────────────────────── */

if (INFINITE_LEASE !== 0xffffffff) problems.push(`INFINITE_LEASE is ${INFINITE_LEASE}; RFC 2131 section 3.3 reserves 0xffffffff`);

for (const item of CASES) {
  const s = item.setup;
  if (!isInfinite(s.lease)) {
    const L = s.lease as number;
    if (!whole(L) || L < 1 || L >= INFINITE_LEASE) problems.push(`${item.slug}: lease ${L} is not a whole number of seconds below the infinite value`);
    if (s.t1 !== null && (!whole(s.t1) || s.t1 < 1 || s.t1 >= L)) problems.push(`${item.slug}: T1 ${s.t1} is not inside the lease`);
    if (s.t2 !== null && (!whole(s.t2) || s.t2 < 1 || s.t2 >= L)) problems.push(`${item.slug}: T2 ${s.t2} is not inside the lease`);
    if (s.t1 !== null && s.t2 !== null && s.t1 >= s.t2) problems.push(`${item.slug}: T1 is not before T2, which RFC 2131 requires`);
    if (s.arrivalsPerHour > 0 && L % 3600 !== 0) {
      problems.push(`${item.slug}: a pool case needs a lease in whole hours so the ledger below can walk it; ${L} is not`);
    }
  } else if (s.t1 !== null || s.t2 !== null) {
    problems.push(`${item.slug}: an infinite lease has no T1 or T2 to set`);
  }
  for (const field of ["clients", "outage", "pool", "arrivalsPerHour", "away"] as const) {
    if (!whole(s[field])) problems.push(`${item.slug}: ${field} is ${s[field]}, not a whole number`);
  }
  if (s.pool < 1) problems.push(`${item.slug}: a pool of ${s.pool} addresses`);
  if (s.clients === 0 && s.arrivalsPerHour === 0) problems.push(`${item.slug}: no clients and no arrivals; there is nothing to ask about`);
}

/* ── 3. the timers, against the RFC's fractions ─────────────────────────── */

let explicitT1 = 0;
let infinite = 0;
let defaults = 0;
for (const item of CASES) {
  const s = item.setup;
  const t = timers(s);
  if (isInfinite(s.lease)) {
    infinite += 1;
    if (leaseSeconds(s) !== Infinity) problems.push(`${item.slug}: leaseSeconds() of an infinite lease is ${leaseSeconds(s)}`);
    if ([t.t1, t.t2, t.expiry, t.guaranteed].some((v) => v !== Infinity)) problems.push(`${item.slug}: an infinite lease has finite timers`);
    continue;
  }
  const L = s.lease as number;
  if (leaseSeconds(s) !== L) problems.push(`${item.slug}: leaseSeconds() says ${leaseSeconds(s)} for a lease of ${L}`);
  /* RFC 2131 section 4.4.5: T1 defaults to 0.5 * duration_of_lease, T2 to 0.875 * duration_of_lease. */
  const wantT1 = s.t1 ?? Math.floor(0.5 * L);
  const wantT2 = s.t2 ?? Math.floor(0.875 * L);
  if (t.t1 !== wantT1) problems.push(`${item.slug}: T1 is ${t.t1}; option 58 or half the lease says ${wantT1}`);
  if (t.t2 !== wantT2) problems.push(`${item.slug}: T2 is ${t.t2}; option 59 or seven eighths says ${wantT2}`);
  if (t.expiry !== L) problems.push(`${item.slug}: expiry is ${t.expiry} on a lease of ${L}`);
  if (!(t.t1 < t.t2 && t.t2 < t.expiry)) problems.push(`${item.slug}: T1 < T2 < expiry does not hold (${t.t1}, ${t.t2}, ${t.expiry})`);
  if (t.guaranteed !== t.expiry - t.t1) problems.push(`${item.slug}: the guaranteed remainder is not the lease less T1`);
  if (firstRenewalAt(s) !== t.t1 || broadcastsAt(s) !== t.t2 || expiresAt(s) !== t.expiry) problems.push(`${item.slug}: the three timer accessors disagree with timers()`);
  if (survivesOutageUpTo(s) !== t.guaranteed) problems.push(`${item.slug}: survivesOutageUpTo() is not the guaranteed remainder`);
  if (s.t1 !== null) explicitT1 += 1;
  else defaults += 1;
  /* Moving T1 moves the margin and nothing else. */
  const moved: Setup = { ...s, t1: Math.max(1, Math.floor(t.t1 / 2)) };
  if (survivesOutageUpTo(moved) <= survivesOutageUpTo(s)) problems.push(`${item.slug}: halving T1 did not lengthen what the room survives`);
  if (expiresAt(moved) !== expiresAt(s)) problems.push(`${item.slug}: moving T1 moved the expiry`);
}
if (explicitT1 === 0) problems.push("no case sets T1 by option 58; the point that the margin is the lease less T1 has nothing to show it");
if (infinite === 0) problems.push("no case has an infinite lease");
if (defaults === 0) problems.push("no case runs on the default timers");

/* ── 4. the room, recomputed as a head count ────────────────────────────── */

/*
  fractionLosing() is a clamp of one subtraction over one division, and
  clientsLost() rounds it. This lays the room out instead: each client at the
  midpoint of its own slice of the band from lease-minus-T1 to the lease, and
  a client is lost if its remaining time is under the outage. No fraction is
  formed, so a wrong sign or a swapped operand in the closed form shows up as
  a different count.
*/
function headCount(s: Setup): number {
  if (isInfinite(s.lease) || s.clients === 0) return 0;
  const L = s.lease as number;
  const t1 = s.t1 ?? Math.floor(L / 2);
  let lost = 0;
  for (let i = 0; i < s.clients; i += 1) {
    const remaining = L - t1 + ((i + 0.5) * t1) / s.clients;
    if (remaining < s.outage) lost += 1;
  }
  return lost;
}

for (const item of CASES) {
  const s = item.setup;
  const f = fractionLosing(s);
  if (f < 0 || f > 1) problems.push(`${item.slug}: fractionLosing() is ${f}`);
  const counted = headCount(s);
  /* Two discretizations of a continuum can differ by one at a slice boundary; the direct properties below pin the exact numbers. */
  if (Math.abs(counted - clientsLost(s)) > 1) {
    problems.push(`${item.slug}: clientsLost() says ${clientsLost(s)} and a head count of the room says ${counted}`);
  }
  if (clientsLost(s) > s.clients) problems.push(`${item.slug}: more clients lost than there are`);
  if (isInfinite(s.lease)) {
    if (f !== 0 || clientsLost({ ...s, clients: 300, outage: 10 * 86400 }) !== 0) problems.push(`${item.slug}: an infinite lease lost clients to an outage`);
    continue;
  }
  const t = timers(s);
  if ((f === 0) !== (s.outage <= t.guaranteed)) problems.push(`${item.slug}: nobody is lost exactly when the outage is within the guaranteed remainder, and this case disagrees`);
  if ((f === 1) !== (s.outage >= t.expiry)) problems.push(`${item.slug}: everybody is lost exactly when the outage reaches the lease, and this case disagrees`);
  if (s.clients > 0) {
    if (clientsLost({ ...s, outage: t.guaranteed }) !== 0) problems.push(`${item.slug}: an outage exactly as long as the guaranteed remainder lost someone`);
    if (clientsLost({ ...s, outage: t.expiry }) !== s.clients) problems.push(`${item.slug}: an outage as long as the lease did not lose everyone`);
    if (clientsLost({ ...s, outage: s.outage + 60 }) < clientsLost(s)) problems.push(`${item.slug}: a longer outage lost fewer clients`);
    /* And across the whole band, not only at the outage the case happens to use. */
    for (let k = 0; k <= 20; k += 1) {
      const swept: Setup = { ...s, outage: t.guaranteed + Math.round((k * t.t1) / 20) };
      if (Math.abs(clientsLost(swept) - headCount(swept)) > 1) {
        problems.push(`${item.slug}: with the outage ${swept.outage} s into the band, clientsLost() says ${clientsLost(swept)} and a head count says ${headCount(swept)}`);
        break;
      }
    }
  }
}

/*
  With the default timers the guaranteed remainder equals T1, so a formula
  that divides by the wrong one of the two, or subtracts the wrong one, gives
  the right answer on every default case. The one case with option 58 set
  returns from the guard before the division. This setup does neither: T1 at
  five minutes, and an outage reaching exactly halfway through the band, which
  has to catch exactly half the room.
*/
const swapProof: Setup = { lease: 3600, t1: 300, t2: null, clients: 300, outage: 3300 + 150, pool: 254, arrivalsPerHour: 0, away: 0 };
if (clientsLost(swapProof) !== 150) {
  problems.push(`an outage halfway through the band of a five-minute-T1 lease catches ${clientsLost(swapProof)} of 300 rather than 150`);
}
if (headCount(swapProof) !== 150) problems.push(`the head count itself is off: ${headCount(swapProof)} rather than 150 halfway through the band`);

/* ── 5. the pool, recomputed as a ledger ────────────────────────────────── */

/*
  concurrentLeases() is a multiplication and exhaustsAfter() a division. This
  keeps the books instead: every hour the arrivals take addresses, and every
  address comes back a lease later, or never. The first hour that cannot be
  served is exhaustion; a week without one is a pool that never fills.
*/
function ledger(s: Setup): { exhaustedAtHour: number | null; held: number } {
  if (s.arrivalsPerHour === 0) return { exhaustedAtHour: null, held: 0 };
  const leaseHours = isInfinite(s.lease) ? Infinity : (s.lease as number) / 3600;
  const returns = new Map<number, number>();
  let free = s.pool;
  let held = 0;
  for (let hour = 0; hour < 24 * 7; hour += 1) {
    const back = returns.get(hour) ?? 0;
    free += back;
    held -= back;
    if (free < s.arrivalsPerHour) return { exhaustedAtHour: hour, held };
    free -= s.arrivalsPerHour;
    held += s.arrivalsPerHour;
    if (leaseHours !== Infinity) returns.set(hour + leaseHours, (returns.get(hour + leaseHours) ?? 0) + s.arrivalsPerHour);
  }
  return { exhaustedAtHour: null, held };
}

for (const item of CASES) {
  const s = item.setup;
  const books = ledger(s);
  const dry = exhaustsAfter(s);
  if ((dry === null) !== (books.exhaustedAtHour === null)) {
    problems.push(`${item.slug}: exhaustsAfter() says ${dry === null ? "never" : `${dry} s`} and the ledger says ${books.exhaustedAtHour === null ? "never" : `hour ${books.exhaustedAtHour}`}`);
  } else if (dry !== null && Math.floor(dry / 3600) !== books.exhaustedAtHour) {
    problems.push(`${item.slug}: exhaustsAfter() says hour ${Math.floor(dry / 3600)} and the ledger runs dry in hour ${books.exhaustedAtHour}`);
  }
  if (dry === null && concurrentLeases(s) !== books.held) {
    problems.push(`${item.slug}: concurrentLeases() says ${concurrentLeases(s)} and the ledger holds ${books.held} at the end of a week`);
  }
  if (poolUnderPressure(s) !== (dry !== null)) problems.push(`${item.slug}: poolUnderPressure() and exhaustsAfter() disagree`);
  if (poolUnderPressure(s) && !(concurrentLeases(s) > s.pool)) problems.push(`${item.slug}: under pressure with demand inside the pool`);
  const wantRecovered = s.arrivalsPerHour > 0 && !isInfinite(s.lease) ? s.arrivalsPerHour * 24 : 0;
  if (recoveredPerDay(s) !== wantRecovered) problems.push(`${item.slug}: recoveredPerDay() says ${recoveredPerDay(s)}; what goes in comes out, so ${wantRecovered}`);
  const wantKeeps = s.away === 0 || s.away <= leaseSeconds(s) || !poolUnderPressure(s);
  if (keepsAddress(s) !== wantKeeps) problems.push(`${item.slug}: keepsAddress() says ${keepsAddress(s)}; the lease and the pool say ${wantKeeps}`);
  if (s.arrivalsPerHour === 0 && (concurrentLeases(s) !== 0 || dry !== null || recoveredPerDay(s) !== 0)) {
    problems.push(`${item.slug}: a pool nobody arrives at has demand on it`);
  }
}

/* ── 6. direct properties ───────────────────────────────────────────────── */

const find = (slug: string) => CASES.find((item) => item.slug === slug)!.setup;

const properties: [string, () => boolean, string][] = [
  [
    "forty-minutes-a-third",
    () => {
      const s = find("forty-minutes-a-third");
      return (
        s.lease === 3600 &&
        s.t1 === null &&
        timers(s).t1 === 1800 &&
        s.outage === 2400 &&
        clientsLost(s) === 100 &&
        clientsLost(s) * 3 === s.clients &&
        clientsLost({ ...s, outage: 1800 }) === 0 &&
        clientsLost({ ...s, outage: 3600 }) === s.clients
      );
    },
    "forty minutes dark on one hour leases losing exactly a third, nobody at thirty minutes and everybody at sixty",
  ],
  [
    "a-day-lease-two-hours-dark",
    () => {
      const s = find("a-day-lease-two-hours-dark");
      return s.lease === 86400 && s.outage === 7200 && clientsLost(s) === 0 && survivesOutageUpTo(s) === 43200 && clientsLost({ ...s, lease: 3600 }) === s.clients;
    },
    "two hours dark losing nobody on day leases, and everybody on hour leases",
  ],
  [
    "ten-minute-leases",
    () => {
      const s = find("ten-minute-leases");
      return s.lease === 600 && s.outage === 480 && timers(s).t1 === 300 && fractionLosing(s) === 0.6 && clientsLost(s) === 180;
    },
    "eight minutes dark on ten minute leases losing three fifths of the room",
  ],
  [
    "when-it-first-asks",
    () => {
      const s = find("when-it-first-asks");
      return s.t1 === null && firstRenewalAt(s) === 1800 && firstRenewalAt(s) * 2 === expiresAt(s) && broadcastsAt(s) === 3150 && firstRenewalAt({ ...s, t1: 300 }) === 300;
    },
    "T1 at half the lease by default, and wherever option 58 puts it otherwise",
  ],
  [
    "when-it-shouts",
    () => {
      const s = find("when-it-shouts");
      return broadcastsAt(s) === 3150 && broadcastsAt(s) * 8 === expiresAt(s) * 7 && expiresAt(s) - broadcastsAt(s) === 450 && broadcastsAt(s) > firstRenewalAt(s);
    },
    "T2 at seven eighths, leaving 450 seconds of the hour for another server to answer",
  ],
  [
    "renew-every-five-minutes",
    () => {
      const s = find("renew-every-five-minutes");
      const first = find("forty-minutes-a-third");
      /* Same office, same outage, same lease; only option 58 differs. */
      return (
        s.t1 === 300 &&
        s.lease === first.lease &&
        s.outage === first.outage &&
        s.clients === first.clients &&
        survivesOutageUpTo(s) === 3300 &&
        clientsLost(s) === 0 &&
        clientsLost(first) === 100 &&
        clientsLost({ ...s, t1: null }) === 100
      );
    },
    "the first case's outage losing nobody once T1 is five minutes, with the lease unchanged",
  ],
  [
    "the-pool-ran-out",
    () => {
      const s = find("the-pool-ran-out");
      return (
        s.pool === 200 &&
        s.arrivalsPerHour === 40 &&
        s.lease === 86400 &&
        exhaustsAfter(s) === 18000 &&
        exhaustsAfter(s) === (s.pool / s.arrivalsPerHour) * 3600 &&
        concurrentLeases(s) === 960 &&
        poolUnderPressure(s) &&
        recoveredPerDay(s) === 960
      );
    },
    "forty an hour into two hundred on a day lease: dry in five hours, 960 wanted at steady state",
  ],
  [
    "two-hour-leases-same-shop",
    () => {
      const s = find("two-hour-leases-same-shop");
      const before = find("the-pool-ran-out");
      return (
        s.pool === before.pool &&
        s.arrivalsPerHour === before.arrivalsPerHour &&
        s.lease === 7200 &&
        concurrentLeases(s) === 80 &&
        !poolUnderPressure(s) &&
        exhaustsAfter(s) === null &&
        exhaustsAfter({ ...s, lease: before.lease }) === 18000
      );
    },
    "the same shop holding eighty addresses on two hour leases and never running dry",
  ],
  [
    "the-printer-came-back",
    () => {
      const s = find("the-printer-came-back");
      return (
        s.away === 3 * 86400 &&
        s.away > leaseSeconds(s) &&
        concurrentLeases(s) === 288 &&
        s.pool === 254 &&
        poolUnderPressure(s) &&
        !keepsAddress(s) &&
        keepsAddress({ ...s, away: 86400 }) &&
        keepsAddress({ ...s, arrivalsPerHour: 0 })
      );
    },
    "three days away on a day lease, on a pool wanting 288 of 254, losing the address; kept if back in time or if nothing else wanted it",
  ],
  [
    "the-infinite-lease",
    () => {
      const s = find("the-infinite-lease");
      return (
        isInfinite(s.lease) &&
        recoveredPerDay(s) === 0 &&
        concurrentLeases(s) === Infinity &&
        timers(s).t1 === Infinity &&
        expiresAt(s) === Infinity &&
        poolUnderPressure(s) &&
        asLease(s).includes(`dhcp-lease-time ${INFINITE_LEASE};`) &&
        recoveredPerDay({ ...s, lease: 86400 }) === 288
      );
    },
    "an infinite lease returning nothing to the pool, where a day lease on the same arrivals returns 288",
  ],
];

for (const [slug, holdsTrue, what] of properties) {
  if (!CASES.some((item) => item.slug === slug)) {
    problems.push(`check-leases names a case ${slug} that is not in the set any more`);
    continue;
  }
  if (!holdsTrue()) {
    problems.push(`${slug} no longer has the property it exists to teach: ${what}. The exactly-one check cannot see this.`);
  }
}

/* ── 7. what the page renders ───────────────────────────────────────────── */

const readings: [number, string][] = [
  [2400, "40 min"],
  [3600, "1 h"],
  [86400, "1 d"],
  [76200, "21.2 h"],
  [3150, "52.5 min"],
  [45, "45 s"],
  [Infinity, "never"],
];
for (const [seconds, want] of readings) {
  if (human(seconds) !== want) problems.push(`human(${seconds}) reads "${human(seconds)}" rather than "${want}"`);
}

for (const item of CASES) {
  const s = item.setup;
  const t = timers(s);
  const file = asLease(s);
  const line = asTimeline(s).split("\n");
  if (isInfinite(s.lease)) {
    if (!file.includes(`dhcp-lease-time ${INFINITE_LEASE};`)) problems.push(`${item.slug}: the lease file does not record the infinite value`);
    if (file.includes("dhcp-renewal-time") || file.includes("dhcp-rebinding-time")) problems.push(`${item.slug}: an infinite lease printed a T1 or T2`);
    if (!asTimeline(s).includes("no T1")) problems.push(`${item.slug}: the timeline of an infinite lease does not say there is no T1`);
    continue;
  }
  if (!file.includes(`dhcp-lease-time ${s.lease};`)) problems.push(`${item.slug}: the lease file does not record option 51 as ${s.lease}`);
  if (!file.includes(`dhcp-renewal-time ${t.t1};`)) problems.push(`${item.slug}: the lease file does not record T1 as ${t.t1}`);
  if (!file.includes(`dhcp-rebinding-time ${t.t2};`)) problems.push(`${item.slug}: the lease file does not record T2 as ${t.t2}`);
  if (line.length !== (s.outage > 0 ? 5 : 4)) problems.push(`${item.slug}: the timeline has ${line.length} lines`);
  if (!line[1].startsWith(String(t.t1)) || !line[1].includes("T1")) problems.push(`${item.slug}: the second timeline row is not T1 at ${t.t1}`);
  if (!line[2].startsWith(String(t.t2)) || !line[2].includes("T2")) problems.push(`${item.slug}: the third timeline row is not T2 at ${t.t2}`);
  if (!line[3].startsWith(String(t.expiry)) || !line[3].includes("expiry")) problems.push(`${item.slug}: the fourth timeline row is not the expiry`);
  if (s.outage > 0) {
    const lost = clientsLost(s);
    if (lost === 0 && !line[4].includes("nobody")) problems.push(`${item.slug}: nobody is lost and the timeline does not say so`);
    if (lost > 0 && !line[4].includes(`${Math.round(fractionLosing(s) * 100)}%`)) problems.push(`${item.slug}: the timeline does not show the share of the room lost`);
  }
}

/* ── 8. spread, uniqueness, and both halves of the file ─────────────────── */

const positions = CASES.map((item) => item.options.findIndex((o) => o === correctOption(item)));
const spread = [0, 0, 0, 0];
for (const at of positions) if (at >= 0) spread[at] += 1;
if (Math.max(...spread) > CASES.length / 2) {
  problems.push(`${Math.max(...spread)} of ${CASES.length} answers are in the same option position (${spread.join("/")})`);
}

const answers = CASES.map((item) => correctOption(item)?.says.about ?? "none");
const room = answers.filter((about) => about === "clients-lost").length;
if (room < 3) problems.push(`${room} cases ask how many clients are lost; the surface is named for that question and needs at least three`);
const timerKinds = new Set(["first-renewal-at", "broadcasts-at", "expires-at"]);
const poolKinds = new Set(["concurrent", "exhausts-after", "recovered-per-day", "keeps-address"]);
if (!answers.some((about) => timerKinds.has(about))) problems.push("no case is answered by a timer; T1 and T2 are the mechanism and need a case each");
if (!answers.some((about) => poolKinds.has(about))) problems.push("no case is about the pool; the second half of the surface is missing");

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
  console.error(`check-leases: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(
  `OK  ${CASES.length} networks through RFC 2131's timers, each with exactly one option that holds,` +
    ` every population count recomputed as a head count of the room and every pool result as an hourly ledger,` +
    ` T1 and T2 checked against the RFC's fractions on ${defaults} default and ${explicitT1} option-58 lease${explicitT1 === 1 ? "" : "s"},` +
    ` ${infinite} infinite, ${properties.length} direct properties, and answers spread ${spread.join("/")}.`,
);
