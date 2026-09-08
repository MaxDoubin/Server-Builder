/**
 * One packet down the netfilter path, and its reply back up a different one.
 *
 * The request is traced hook by hook, because where the rewrite happens is
 * the whole subject. The reply is not traced through the same rules: it is
 * routed from the server, and it is translated only if it passes back through
 * the router that holds the binding. That asymmetry is the surface.
 *
 * Addresses are strings and networks are prefixes, compared by masking. No
 * IPv6, no fragments, no port ranges: the cases are about which box rewrites
 * which field, and every one of those would be scenery.
 */

import type { Case, Claim, Exchange, Host, Match, Nic, Packet, Router, Rule, Step } from "./types";

/** Dotted quad to a number, or null when it is not one. */
export function toNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    out = out * 256 + octet;
  }
  return out >>> 0;
}

/** Is an address inside a prefix, or equal to a bare address? */
export function within(address: string, prefix: string): boolean {
  if (!prefix.includes("/")) return address === prefix;
  const [network, bits] = prefix.split("/");
  const size = Number(bits);
  const one = toNumber(address);
  const other = toNumber(network);
  if (one === null || other === null || !Number.isInteger(size) || size < 0 || size > 32) return false;
  if (size === 0) return true;
  const mask = (0xffffffff << (32 - size)) >>> 0;
  return ((one & mask) >>> 0) === ((other & mask) >>> 0);
}

/**
 * Addresses nobody on the internet will route to you.
 *
 * Here because one case is a router whose own WAN address is one of these,
 * which is what carrier grade NAT looks like from inside: a port forward that
 * is correct, on a box the internet cannot reach.
 */
export const PRIVATE = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"];

export const isPrivate = (address: string): boolean =>
  PRIVATE.some((prefix) => within(address, prefix));

export const nicFor = (router: Router, address: string): Nic | undefined =>
  router.nics.find((nic) => within(address, nic.network));

export const hostAt = (hosts: Host[], address: string): Host | undefined =>
  hosts.find((host) => host.address === address);

/** Does a rule's match apply, given the interfaces in play? */
export function matches(rule: Rule, packet: Packet, iif: string | null, oif: string | null): boolean {
  const m: Match = rule.match;
  if (m.iif !== undefined && m.iif !== iif) return false;
  if (m.oif !== undefined && m.oif !== oif) return false;
  if (m.saddr !== undefined && !within(packet.saddr, m.saddr)) return false;
  if (m.daddr !== undefined && !within(packet.daddr, m.daddr)) return false;
  if (m.dport !== undefined && m.dport !== packet.dport) return false;
  return true;
}

/**
 * The first rule in a chain that sets up a binding.
 *
 * First, not best and not last: the nftables manual is explicit that the
 * first matching rule adding a mapping is the one used for the connection.
 */
export const firstMatch = (
  router: Router,
  chain: Rule["chain"],
  packet: Packet,
  iif: string | null,
  oif: string | null,
): Rule | undefined =>
  router.rules.find((rule) => rule.chain === chain && matches(rule, packet, iif, oif));

/** Which interface a packet with this destination would leave by. */
export const egress = (router: Router, daddr: string): Nic | undefined => {
  const direct = nicFor(router, daddr);
  if (direct) return direct;
  if (!router.upstream) return undefined;
  return nicFor(router, router.upstream);
};

const copy = (packet: Packet): Packet => ({ ...packet });

/**
 * Trace one connection and its reply.
 *
 * The request walks the hooks in priority order. The reply does not: it is a
 * new packet leaving the server, routed by the server's own table, and the
 * only reason it comes back translated is that it passes through the router
 * again. When the server and the client are on one network, it does not.
 */
export function trace(item: Case): Exchange {
  const { router, hosts, packet } = item;
  const request: Step[] = [];
  const reply: Step[] = [];

  const client = hostAt(hosts, packet.saddr);

  /*
    A packet from the internet to an address the internet does not route to is
    not a packet that arrives late, it is a packet that never left. Traced
    honestly rather than followed through the hooks, because a page that drew
    a working trace under an explanation saying nothing arrives would be
    teaching the opposite of both.
  */
  const fromOutside = client !== undefined && !nicFor(router, packet.saddr);
  if (fromOutside && !wanRoutable(router)) {
    request.push({
      where: `${client.name} sends`,
      packet: copy(packet),
      note: `${packet.daddr} is not an address the internet routes to`,
    });
    return { request, reply, outcome: "unreachable", seenBy: null };
  }
  /*
    Which interface it came in on. A source on one of our own networks arrives
    on that interface; anything else came from the internet, which means the
    interface the default route points out of.
  */
  const arrives =
    nicFor(router, packet.saddr) ?? (router.upstream ? nicFor(router, router.upstream) : undefined);
  const iif = arrives?.name ?? null;

  request.push({
    where: `${client?.name ?? packet.saddr} sends`,
    packet: copy(packet),
    note:
      client && !within(packet.daddr, client.network)
        ? client.gateway
          ? `off its own network, so via ${client.gateway}`
          : "from the internet"
        : undefined,
  });

  /*
    A packet whose destination is on the sender's own network never reaches
    the router at all, which is the whole of one case: the port forward is
    fine and no packet was ever offered to it.
  */
  if (client && within(packet.daddr, client.network) && packet.daddr !== router.nics.find((n) => within(n.address, client.network))?.address) {
    const server = hostAt(hosts, packet.daddr);
    if (!server) return { request, reply, outcome: "unreachable", seenBy: null };
    request.push({ where: `${server.name} receives`, packet: copy(packet), note: "delivered on the local network, the router never saw it" });
    return { request, reply, outcome: "connected", seenBy: packet.saddr };
  }

  if (!arrives) return { request, reply, outcome: "unreachable", seenBy: null };

  /* prerouting, dstnat, priority -100. */
  const afterDnat = copy(packet);
  const dnat = firstMatch(router, "prerouting", packet, iif, null);
  if (dnat && dnat.kind === "dnat") {
    if (dnat.to?.address) afterDnat.daddr = dnat.to.address;
    if (dnat.to?.port !== undefined) afterDnat.dport = dnat.to.port;
    request.push({ where: `${router.name} prerouting`, packet: copy(afterDnat), note: dnat.written });
  } else {
    request.push({ where: `${router.name} prerouting`, packet: copy(afterDnat), note: "no dnat rule matched" });
  }

  /* The routing decision, made on the destination as it is now. */
  const out = egress(router, afterDnat.daddr);
  const oif = out?.name ?? null;
  request.push({
    where: `${router.name} routing`,
    packet: copy(afterDnat),
    note: out ? `leaves by ${out.name}` : "no route",
  });
  if (!out) return { request, reply, outcome: "unreachable", seenBy: null };

  /*
    Destined for the router itself. It goes up to the local input hook rather
    than across the forward hook, so there is no postrouting and no source
    rewrite: the earlier version of this walked it through both and produced a
    packet from 203.0.113.7 to 203.0.113.7, which is not a thing.
  */
  if (router.nics.some((nic) => nic.address === afterDnat.daddr)) {
    request.push({
      where: `${router.name} input`,
      packet: copy(afterDnat),
      note: "the destination is the router's own address, so it is delivered locally rather than forwarded",
    });
    return { request, reply, outcome: "no-rule-matched", seenBy: null };
  }

  /*
    The forward filter hook, priority 0. Between the two NAT points, which is
    why it sees the translated destination and the original source.
  */
  request.push({
    where: `${router.name} forward filter`,
    packet: copy(afterDnat),
    note: dnat ? "sees the translated destination and the original source" : "nothing was rewritten",
  });

  /* postrouting, srcnat, priority +100. */
  const afterSnat = copy(afterDnat);
  const snat = firstMatch(router, "postrouting", afterDnat, iif, oif);
  if (snat && (snat.kind === "snat" || snat.kind === "masquerade")) {
    afterSnat.saddr = snat.kind === "masquerade" ? out.address : (snat.to?.address ?? out.address);
    request.push({ where: `${router.name} postrouting`, packet: copy(afterSnat), note: snat.written });
  } else {
    request.push({ where: `${router.name} postrouting`, packet: copy(afterSnat), note: "no snat rule matched" });
  }

  const server = hostAt(hosts, afterSnat.daddr);
  if (!server) {
    return {
      request,
      reply,
      outcome: dnat ? "unreachable" : "no-rule-matched",
      seenBy: null,
    };
  }
  request.push({ where: `${server.name} receives`, packet: copy(afterSnat) });

  /* And the reply, which is a new packet routed by the server. */
  const back: Packet = {
    saddr: afterSnat.daddr,
    sport: afterSnat.dport,
    daddr: afterSnat.saddr,
    dport: afterSnat.sport,
  };
  const direct = within(back.daddr, server.network);
  reply.push({
    where: `${server.name} replies`,
    packet: copy(back),
    note: direct
      ? "on its own network, so straight there"
      : server.gateway
        ? `off its network, so via ${server.gateway}`
        : "back the way it came",
  });

  /*
    Two ways the reply can reach the box holding the binding, and they are the
    difference between every working case and every broken one. Either the
    reply is addressed to the router, because the source was translated to one
    of its addresses, or it is off the server's network and the server's
    gateway happens to be the router.

    A reply that is neither is the whole subject: it never meets the binding,
    so nothing reverses it.
  */
  const addressedToRouter = router.nics.some((nic) => nic.address === back.daddr);
  const viaRouter = !direct && router.nics.some((nic) => nic.address === server.gateway);

  if (!addressedToRouter && !viaRouter) {
    if (direct) {
      reply.push({ where: `${packet.saddr} receives`, packet: copy(back), note: "no binding was consulted" });
      return {
        request,
        reply,
        outcome: back.saddr === packet.daddr ? "connected" : "reply-from-the-wrong-address",
        seenBy: afterSnat.saddr,
      };
    }
    reply.push({ where: `${server.gateway ?? "nowhere"} receives`, packet: copy(back), note: "not the box holding the binding" });
    return { request, reply, outcome: "reply-took-another-path", seenBy: afterSnat.saddr };
  }

  /* The binding, applied in reverse. No rule is consulted. */
  const untranslated: Packet = {
    saddr: packet.daddr,
    sport: packet.dport,
    daddr: packet.saddr,
    dport: packet.sport,
  };
  reply.push({ where: `${router.name} reverses the binding`, packet: copy(untranslated), note: "conntrack, not a rule" });
  reply.push({ where: `${client?.name ?? packet.saddr} receives`, packet: copy(untranslated) });
  return { request, reply, outcome: "connected", seenBy: afterSnat.saddr };
}

/**
 * Is the address the world would have to reach one the world can route to?
 *
 * A port forward on a box whose outside address is 100.64.x.x is correct and
 * unreachable, and from inside the network everything looks right: the rule
 * is there, the service is up, and no packet ever arrives. This is what
 * carrier grade NAT looks like from the customer end.
 */
export function wanRoutable(router: Router): boolean {
  const outside = router.upstream ? nicFor(router, router.upstream) : undefined;
  return outside !== undefined && !isPrivate(outside.address);
}

/** What the forward filter hook is matching against, for the filter claims. */
export function filterSees(item: Case): Packet | null {
  const step = trace(item).request.find((entry) => entry.where.endsWith("forward filter"));
  return step ? step.packet : null;
}

/** Does a claim hold of an exchange? */
export function holds(claim: Claim, exchange: Exchange, item: Case): boolean {
  switch (claim.about) {
    case "outcome":
      return exchange.outcome === claim.is;
    case "seen-as":
      return exchange.seenBy === claim.address;
    case "wan-routable":
      return wanRoutable(item.router) === claim.is;
    case "filter-sees": {
      const seen = filterSees(item);
      return seen !== null && seen.daddr === claim.daddr;
    }
    case "nothing":
      return false;
  }
}

/** Every option whose claim holds of what the model computed. */
export const matching = (item: Case) => {
  const exchange = trace(item);
  return item.options.filter((option) => holds(option.says, exchange, item));
};

/**
 * The option that is right, found rather than declared.
 *
 * The data carries a topology, a ruleset and one packet. The model traces it.
 * CI requires exactly one option to hold, so an option set that has drifted
 * from its own ruleset fails the build.
 */
export const correctOption = (item: Case) => {
  const hits = matching(item);
  return hits.length === 1 ? hits[0] : null;
};

/** A packet as a person would write it down. */
export const asText = (packet: Packet): string =>
  `${packet.saddr}:${packet.sport} -> ${packet.daddr}:${packet.dport}`;

export const OUTCOME_LABEL: Record<Exchange["outcome"], string> = {
  connected: "the connection works",
  "reply-from-the-wrong-address": "the reply comes from an address the client never contacted",
  "reply-took-another-path": "the reply leaves by a path with no binding on it",
  "no-rule-matched": "nothing matched, so the packet was for the router itself",
  unreachable: "there is no route to it",
};
