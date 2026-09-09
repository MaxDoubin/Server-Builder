/**
 * The path MTU model has to agree with arithmetic, with itself, and with
 * the thing the page claims to teach.
 *
 * The interesting checks are the last two.
 *
 * Agreeing with itself: the path MTU is computed two ways, once as the
 * minimum of the link MTUs and once by walking every packet size from 20
 * bytes upwards and taking the largest that arrives. Those must match on
 * every path. One is arithmetic and the other is the simulation the page
 * actually shows, and a bug in either shows up here as a disagreement
 * rather than hiding behind a shared assumption.
 *
 * Agreeing with the lesson: a blackhole is only a blackhole if a default
 * ping crosses it. That is the entire diagnostic trap, and a path that
 * claims to demonstrate it while ping also fails would be teaching the
 * comfortable version where something reports an error.
 */

import { PATHS } from "../client/src/lib/mtu/data/paths";
import {
  IP_HEADER,
  PING_DEFAULT,
  TCP_HEADER,
  largestThatFits,
  mssFor,
  narrowest,
  pathMtu,
  pingLies,
  send,
} from "../client/src/lib/mtu/model";

const problems: string[] = [];

/* ------------------------------------------------- arithmetic by hand */

/* Ping's default is 20 IP + 8 ICMP + 56 payload = 84 bytes on the wire. */
if (PING_DEFAULT !== 84) problems.push(`a default ping is 84 bytes and the model says ${PING_DEFAULT}`);
/* 1500 - 20 - 20 = 1460, which is the MSS every Ethernet stack advertises. */
if (mssFor(1500) !== 1460) problems.push(`the MSS on a 1500 MTU is 1460 and the model says ${mssFor(1500)}`);
/* PPPoE: 1500 - 8 = 1492, so 1452. */
if (mssFor(1492) !== 1452) problems.push(`the MSS on a PPPoE line is 1452 and the model says ${mssFor(1492)}`);
/* Jumbo: 9000 - 40 = 8960. */
if (mssFor(9000) !== 8960) problems.push(`the MSS on a jumbo frame is 8960 and the model says ${mssFor(9000)}`);
if (IP_HEADER + TCP_HEADER !== 40) problems.push("an IP and TCP header with no options is 40 bytes");

/* ------------------------------------------------------- every path */

const slugs = new Set<string>();
let blackholes = 0;
let honest = 0;

for (const path of PATHS) {
  if (slugs.has(path.slug)) problems.push(`${path.slug}: two paths share a slug`);
  slugs.add(path.slug);

  if (path.hops.length < 3) problems.push(`${path.slug}: ${path.hops.length} hops is not a path`);
  for (const hop of path.hops) {
    /* 68 is the IPv4 minimum any link must carry; 9216 is the usual jumbo ceiling. */
    if (hop.mtu < 68 || hop.mtu > 9216) problems.push(`${path.slug}: ${hop.name} has an MTU of ${hop.mtu}`);
  }

  /*
    Two independent computations of the same number. The minimum is
    arithmetic; largestThatFits walks a packet of every size through the
    simulation the page draws.
  */
  const byMinimum = pathMtu(path);
  const byWalking = largestThatFits(path);
  if (byMinimum !== byWalking) {
    problems.push(
      `${path.slug}: the minimum link MTU is ${byMinimum} and walking every size says ${byWalking}. ` +
        `One of the two is wrong and they cannot both be trusted.`,
    );
  }

  /* One byte over the path MTU must not arrive, or the boundary is off by one. */
  if (byMinimum < path.senderMtu) {
    const over = send(path, { size: byMinimum + 1, df: true });
    if (over.kind === "delivered") {
      problems.push(`${path.slug}: a packet one byte over the path MTU was delivered`);
    }
  }

  /* The narrowest hop must be the one that stops an oversized packet. */
  if (byMinimum < path.senderMtu) {
    const fate = send(path, { size: path.senderMtu, df: true });
    if (fate.kind === "delivered" || fate.kind === "fragmented") {
      problems.push(`${path.slug}: a full-size packet with DF set was not stopped`);
    } else if (fate.at !== narrowest(path)) {
      problems.push(
        `${path.slug}: the packet stopped at hop ${fate.at} and the narrowest link is hop ${narrowest(path)}`,
      );
    } else if (fate.needs !== byMinimum) {
      problems.push(`${path.slug}: the ICMP offers ${fate.needs} and the path MTU is ${byMinimum}`);
    }
  }

  /* Without DF, an oversized packet fragments rather than dying. */
  if (byMinimum < path.senderMtu) {
    const fate = send(path, { size: path.senderMtu, df: false });
    if (fate.kind !== "fragmented") {
      problems.push(`${path.slug}: an oversized packet with DF clear came back as "${fate.kind}"`);
    } else if (fate.into < 2) {
      problems.push(`${path.slug}: fragmenting produced ${fate.into} fragment, which is not fragmenting`);
    }
  }

  /*
    A blackhole is only a blackhole if ping crosses it. Otherwise the fault
    reports itself and the page is teaching the comfortable version.
  */
  const blocking = path.hops.some((hop) => hop.blocksIcmp);
  const fate = send(path, { size: path.senderMtu, df: true });
  if (blocking && fate.kind === "blackholed") {
    blackholes += 1;
    if (!pingLies(path)) {
      problems.push(
        `${path.slug}: claims to be a blackhole and a default ping does not cross it, so the fault reports itself`,
      );
    }
    /*
      The hop blamed for the silence is not merely "a hop that blocks ICMP".
      It is exactly the last blocker at or before the drop point, because
      the message travels back from the drop point towards the sender and
      dies at the first thing it meets.

      Stating it that way rather than as swallowedAt <= at is the difference
      between a check that works and one that looks like it does. The weaker
      form passes on a path with one blocker, and on a path whose blockers
      happen to be ordered conveniently, which is how the first version of
      this file failed to notice the model walking the return path the wrong
      way round and blaming the wrong firewall.
    */
    let expected = -1;
    for (let index = fate.at; index >= 0; index -= 1) {
      if (path.hops[index].blocksIcmp) {
        expected = index;
        break;
      }
    }
    if (fate.swallowedAt !== expected) {
      problems.push(
        `${path.slug}: blames hop ${fate.swallowedAt} (${path.hops[fate.swallowedAt]?.name}) for swallowing an ICMP ` +
          `generated at hop ${fate.at}, and the first blocker it meets traveling back is hop ${expected} ` +
          `(${path.hops[expected]?.name})`,
      );
    }
  }
  if (!blocking && fate.kind === "blackholed") {
    problems.push(`${path.slug}: reports a blackhole with no hop blocking ICMP`);
  }
  if (blocking && fate.kind === "rejected") {
    problems.push(`${path.slug}: has a hop blocking ICMP and the sender heard the ICMP anyway`);
  }
  if (fate.kind === "rejected" || fate.kind === "delivered") honest += 1;

  /* A note is where a number came from, so every unusual MTU needs one. */
  for (const hop of path.hops) {
    if (hop.mtu !== 1500 && hop.mtu !== 9000 && !hop.note) {
      problems.push(`${path.slug}: ${hop.name} is ${hop.mtu} and nothing says why`);
    }
  }
}

/*
  A default ping crossing a path that large packets cannot is the entire
  point. If no path does that, the surface demonstrates nothing.
*/
if (blackholes < 2) {
  problems.push(`only ${blackholes} path blackholes; the trap this page is about needs more than one shape`);
}
if (honest < 2) {
  problems.push(`only ${honest} paths behave correctly; without those the blackholes have nothing to contrast with`);
}
for (const path of PATHS) {
  if (send(path, { size: PING_DEFAULT, df: false }).kind !== "delivered") {
    problems.push(`${path.slug}: a default ping does not cross it, which no real path in this set should manage`);
  }
}

if (problems.length) {
  console.error(`\ncheck-mtu: ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(
  `OK  ${PATHS.length} paths, each with its MTU computed both as a minimum and by walking every packet size, ` +
    `${blackholes} of them blackholing silently while a default ping crosses all ${PATHS.length}.`,
);
