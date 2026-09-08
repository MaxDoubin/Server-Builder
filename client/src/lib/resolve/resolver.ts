/**
 * The iterative resolver.
 *
 * It starts at the root and walks down, exactly as a recursive resolver does
 * with a cold cache, and it records every query. There is no caching, because
 * a cache is the thing that makes DNS problems intermittent and this is meant
 * to be the version you can reason about.
 *
 * The interesting code is all in the failure paths. Getting an answer is four
 * lines; distinguishing a lame delegation from a missing glue record from a
 * server with no address is the part worth having.
 */

import {
  canon,
  depth,
  inZone,
  type Outcome,
  type Query,
  type Resolution,
  type ResourceRecord,
  type RRType,
  type World,
  type Zone,
} from "./types";

const MAX_QUERIES = 24;
const MAX_CNAMES = 8;

/** The zone in this world that is the closest enclosing one for a name. */
function bestZone(world: World, name: string): Zone | undefined {
  let best: Zone | undefined;
  for (const zone of world.zones) {
    if (!inZone(name, zone.origin)) continue;
    if (!best || depth(zone.origin) > depth(best.origin)) best = zone;
  }
  return best;
}

/**
 * A delegation held by `zone` that is on the path to `name`, if any.
 *
 * Driven by the NS records the zone actually holds, not by the world's list
 * of zones. Those are different things and the difference is the bug I wrote
 * first: taking the deepest zone on the path made the root refer straight to
 * northbay.example, skipping the TLD, because the root "knows about" that zone
 * in the data structure. A real root server knows one thing about it, which is
 * nothing. It holds NS for example and that is the whole of its opinion.
 */
function delegationFor(world: World, zone: Zone, name: string): Zone | undefined {
  let owner = "";
  for (const record of zone.records) {
    if (record.type !== "NS") continue;
    if (record.name === zone.origin) continue; // the zone's own NS set, not a delegation
    if (!inZone(name, record.name)) continue;
    if (depth(record.name) > depth(owner)) owner = record.name;
  }
  if (!owner) return undefined;
  return world.zones.find((candidate) => candidate.origin === owner);
}

const ROOT_SERVER = "a.root-servers.net";

export function resolve(world: World, rawName: string, type: RRType = "A"): Resolution {
  const name = canon(rawName);
  const queries: Query[] = [];
  const chain: string[] = [];

  const done = (outcome: Outcome, summary: string, answer: ResourceRecord[] = []): Resolution => ({
    name,
    type,
    queries,
    answer,
    chain,
    outcome,
    summary,
  });

  let target = name;

  /*
    The loop over CNAME redirections. Each alias restarts the walk at the root,
    which is what a real resolver does with a cold cache and is the reason a
    long chain is slow rather than merely inelegant. The bound is the chain
    limit, so falling out of the loop is itself the loop error.
  */
  for (let followed = 0; followed <= MAX_CNAMES; followed += 1) {
    let servers = world.zones.find((zone) => zone.origin === "")?.servers ?? [ROOT_SERVER];
    let fromZone = "";

    // The loop down the delegation chain for one name.
    for (;;) {
      if (queries.length >= MAX_QUERIES) {
        return done(
          "too-many-steps",
          `Gave up after ${MAX_QUERIES} queries. A resolution that takes this many is a loop somewhere in the delegations.`,
        );
      }

      /*
        Try the delegated servers in order, because that is what a resolver
        does and because a zone with two servers where one is dead is a zone
        that works. Reporting the first dead one as the answer would teach
        that redundancy does not function.
      */
      let server = "";
      let serverIp = "";
      let holder: Zone | undefined;
      let lastFailure: Outcome | null = null;
      let lastMessage = "";

      for (const candidate of servers) {
        const ip = world.hosts[candidate];
        if (!ip) {
          queries.push({
            name: target,
            type,
            server: candidate,
            serverIp: "none",
            response: "no address for this server",
            kind: "unreachable",
          });
          lastFailure = "no-address";
          lastMessage = `${candidate} is named in the delegation for ${fromZone || "the root"} and has no address anywhere. A delegation to a host that does not resolve is a delegation to nothing.`;
          continue;
        }
        const held = world.zones.find((zone) => zone.servers.includes(candidate));
        if (!held || !held.loaded) {
          queries.push({
            name: target,
            type,
            server: candidate,
            serverIp: ip,
            response: "REFUSED, this server is not authoritative for the zone",
            kind: "lame",
          });
          lastFailure = "lame";
          lastMessage = `${candidate} is listed in the delegation for ${held?.origin || fromZone} and does not hold that zone. This is a lame delegation: the parent points somewhere the data is not, and from a client it looks exactly like a network problem.`;
          continue;
        }
        server = candidate;
        serverIp = ip;
        holder = held;
        break;
      }

      if (!holder) {
        return done(
          lastFailure ?? "lame",
          servers.length > 1
            ? `Every server delegated ${fromZone || "the root"} failed. ${lastMessage}`
            : lastMessage,
        );
      }

      // A delegation to a deeper zone takes priority over records here.
      const delegation = delegationFor(world, holder, target);
      if (delegation) {
        const glue = world.glue[holder.origin] ?? [];
        const withGlue = delegation.servers.filter((host) => glue.includes(host));
        const reachable = withGlue.length > 0 ? withGlue : delegation.servers;

        /*
          Glue is required when the nameserver's own name is inside the zone
          being delegated: resolving it would need the servers you are trying
          to find. Without glue there is nothing to break the circle, and the
          resolution stops here rather than looping.
        */
        const needsGlue = delegation.servers.every((host) => inZone(host, delegation.origin));
        if (needsGlue && withGlue.length === 0) {
          queries.push({
            name: target,
            type,
            server,
            serverIp,
            response: `referral to ${delegation.servers.join(", ")}, no glue`,
            kind: "referral",
          });
          return done(
            "no-glue",
            `${holder.origin || "the root"} delegates ${delegation.origin} to ${delegation.servers.join(" and ")}, which are inside ${delegation.origin}, and sends no glue. Finding their addresses needs the servers being looked for.`,
          );
        }

        queries.push({
          name: target,
          type,
          server,
          serverIp,
          response: `referral to ${delegation.origin || "."} via ${reachable.join(", ")}`,
          kind: "referral",
        });
        servers = reachable;
        fromZone = delegation.origin;
        continue;
      }

      // This server holds the closest zone. It answers from its own records.
      const here = holder.records.filter((record) => record.name === target);
      const cname = here.find((record) => record.type === "CNAME");
      const matching = here.filter((record) => record.type === type);

      if (matching.length > 0) {
        queries.push({
          name: target,
          type,
          server,
          serverIp,
          response: `${matching.length} ${type} ${matching.length === 1 ? "record" : "records"}: ${matching.map((r) => r.value).join(", ")}`,
          kind: "answer",
        });
        return done(
          "answer",
          chain.length > 0
            ? `${name} resolves through ${chain.length} ${chain.length === 1 ? "alias" : "aliases"} to ${matching.map((r) => r.value).join(", ")}.`
            : `${name} resolves to ${matching.map((r) => r.value).join(", ")}.`,
          matching,
        );
      }

      if (cname && type !== "CNAME") {
        queries.push({
          name: target,
          type,
          server,
          serverIp,
          response: `CNAME to ${cname.value}`,
          kind: "cname",
        });
        if (chain.includes(cname.value)) {
          chain.push(cname.value);
          return done(
            "loop",
            `${cname.name} is a CNAME to ${cname.value}, which is already in the chain. The aliases point at each other.`,
          );
        }
        chain.push(cname.value);
        target = cname.value;
        break; // restart at the root for the new name
      }

      /*
        The difference between these two is the one people get wrong, and it
        matters: NODATA means the name exists and has no records of this type,
        so a resolver caches it briefly and a client should stop asking for
        that type. NXDOMAIN means the name does not exist, which is a fact
        about every type at once.
      */
      const nameExists = holder.records.some(
        (record) => record.name === target || record.name.endsWith(`.${target}`),
      );
      if (nameExists) {
        queries.push({
          name: target,
          type,
          server,
          serverIp,
          response: `NOERROR, 0 answers (the name exists, no ${type})`,
          kind: "nodata",
        });
        return done(
          "nodata",
          `${target} exists in ${holder.origin || "the root"} and has no ${type} record. This is NODATA, not NXDOMAIN, and the distinction is why a client that keeps asking for AAAA is not misbehaving.`,
        );
      }

      queries.push({
        name: target,
        type,
        server,
        serverIp,
        response: "NXDOMAIN",
        kind: "nxdomain",
      });
      return done(
        "nxdomain",
        chain.length > 0
          ? `${name} is an alias for ${target}, and ${target} does not exist. The alias resolves, its target does not.`
          : `${target} does not exist in ${holder.origin || "the root"}.`,
      );
    }
  }

  return done("loop", `The CNAME chain from ${name} is longer than ${MAX_CNAMES}. That is a loop.`);
}
