/**
 * Five tables, each with a destination that catches somebody.
 *
 * The traps are the ones people actually hit: reading top to bottom like a
 * firewall chain, reaching for the administrative distance column because
 * it looks like a priority, assuming a default route is a fallback rather
 * than a /0 competing on the same terms, and forgetting that a blackhole
 * route is a route and wins on length like anything else.
 */

import type { Table } from "../types";

export const TABLES: Table[] = [
  {
    slug: "read-it-in-order",
    name: "The one that punishes reading it in order",
    brief:
      "A branch router. The output is printed in the order the routes were learned, which is not the order they are consulted, and the two answers differ for exactly one of these destinations.",
    routes: [
      { network: "0.0.0.0", length: 0, nextHop: "203.0.113.1", iface: "wan0", protocol: "static", distance: 1, metric: 0 },
      { network: "10.0.0.0", length: 8, nextHop: "10.90.0.1", iface: "tun0", protocol: "ospf", distance: 110, metric: 20 },
      { network: "10.20.0.0", length: 16, nextHop: "10.90.0.5", iface: "tun0", protocol: "ospf", distance: 110, metric: 30 },
      { network: "10.20.40.0", length: 24, nextHop: "10.90.0.9", iface: "tun1", protocol: "bgp", distance: 20, metric: 100 },
      { network: "192.168.1.0", length: 24, nextHop: null, iface: "lan0", protocol: "connected", distance: 0, metric: 0 },
    ],
    probes: [
      {
        destination: "10.20.40.17",
        trap: 0,
        why: "Three routes contain this address and the /24 wins because it is the longest, not because BGP is trusted more than OSPF. Reading top to bottom the way you would read a firewall chain stops at the default route on the first line and sends internal traffic out of the WAN, which is a worse outcome than being merely wrong.",
      },
      {
        destination: "10.20.99.4",
        trap: 0,
        why: "The /24 does not contain this address, so the /16 wins. The /8 is still there and /16 beats /8, which is the whole rule. Reading in order still stops at the default on line one, and the default is a prefix like any other rather than a fallback consulted last.",
      },
      {
        destination: "8.8.8.8",
        trap: null,
        why: "Nothing but the default contains it, so the default carries it. A /0 is not a fallback mechanism, it is a prefix that contains every address and loses to anything longer.",
      },
    ],
  },
  {
    slug: "distance-is-not-priority",
    name: "The distance column is not a priority",
    brief:
      "Two paths to the same place, learned by different protocols at different prefix lengths. The trusted one loses, and the reason is not that anything is misconfigured.",
    routes: [
      { network: "172.16.0.0", length: 16, nextHop: "10.0.0.2", iface: "eth1", protocol: "static", distance: 1, metric: 0 },
      { network: "172.16.8.0", length: 24, nextHop: "10.0.0.6", iface: "eth2", protocol: "ospf", distance: 110, metric: 65 },
      { network: "172.16.8.0", length: 24, nextHop: "10.0.0.10", iface: "eth3", protocol: "rip", distance: 120, metric: 3 },
      { network: "0.0.0.0", length: 0, nextHop: "203.0.113.1", iface: "wan0", protocol: "static", distance: 1, metric: 0 },
    ],
    probes: [
      {
        destination: "172.16.8.44",
        trap: 0,
        why: "The static /16 has a distance of 1 and loses to an OSPF /24 with a distance of 110, because length is compared before distance and nothing about a lower distance changes that. Distance then settles the two /24s, and OSPF at 110 beats RIP at 120.",
      },
      {
        destination: "172.16.30.9",
        trap: null,
        why: "Only the static /16 and the default contain this one, so the static wins on length. Same table, same static route, and this time it is the answer: what changed is the destination, not the trust.",
      },
    ],
  },
  {
    slug: "equal-cost",
    name: "When everything ties",
    brief:
      "Two routes with the same prefix, the same protocol and the same distance. Real routers install both and hash flows across them; this one has to pick, and the metric is what is left.",
    routes: [
      { network: "10.50.0.0", length: 16, nextHop: "10.0.1.1", iface: "eth1", protocol: "ospf", distance: 110, metric: 40 },
      { network: "10.50.0.0", length: 16, nextHop: "10.0.2.1", iface: "eth2", protocol: "ospf", distance: 110, metric: 40 },
      { network: "10.50.7.0", length: 24, nextHop: "10.0.3.1", iface: "eth3", protocol: "eigrp", distance: 90, metric: 28160 },
      { network: "0.0.0.0", length: 0, nextHop: "203.0.113.1", iface: "wan0", protocol: "static", distance: 1, metric: 0 },
    ],
    probes: [
      {
        destination: "10.50.7.200",
        trap: 0,
        why: "The EIGRP /24 wins on length. Its metric of 28,160 looks enormous next to OSPF's 40 and is not comparable to it: metrics only mean anything within one protocol, which is exactly why distance exists as a separate column.",
      },
      {
        destination: "10.50.90.1",
        trap: null,
        why: "Both /16s contain it, both are OSPF, both have distance 110 and both have a metric of 40. Nothing separates them, and a real router installs both and load-shares. Picking the first is this page simplifying, and it is the one place here that is not how a router behaves.",
      },
    ],
  },
  {
    slug: "the-host-route",
    name: "One address, routed somewhere else entirely",
    brief:
      "A /32 in the middle of a subnet the router is directly connected to. Somebody added it during an incident and it is still there.",
    routes: [
      { network: "192.168.10.0", length: 24, nextHop: null, iface: "lan0", protocol: "connected", distance: 0, metric: 0 },
      { network: "192.168.10.53", length: 32, nextHop: "192.168.99.7", iface: "mgmt0", protocol: "static", distance: 1, metric: 0 },
      { network: "0.0.0.0", length: 0, nextHop: "203.0.113.1", iface: "wan0", protocol: "static", distance: 1, metric: 0 },
    ],
    probes: [
      {
        destination: "192.168.10.53",
        trap: 0,
        why: "A connected route is the strongest thing most people expect and it still loses, because a /32 is longer than a /24. This is how one host on a working subnet becomes unreachable while every other address on it is fine, and it is invisible unless you look for a host route specifically.",
      },
      {
        destination: "192.168.10.54",
        trap: null,
        why: "One address along, and everything is normal. That is what makes the previous case so hard to report: the subnet works, the gateway answers, and a single machine does not.",
      },
    ],
  },
  {
    slug: "the-blackhole",
    name: "A route that goes nowhere on purpose",
    brief:
      "Null routing is how you drop traffic at line rate without touching a firewall. It is also a route, and it wins or loses on exactly the same terms as any other.",
    routes: [
      { network: "10.0.0.0", length: 8, nextHop: "10.1.0.1", iface: "core0", protocol: "ospf", distance: 110, metric: 10 },
      { network: "10.66.0.0", length: 16, nextHop: null, iface: "null0", protocol: "static", distance: 1, metric: 0 },
      { network: "10.66.4.0", length: 24, nextHop: "10.1.0.9", iface: "core1", protocol: "bgp", distance: 20, metric: 50 },
      { network: "0.0.0.0", length: 0, nextHop: "203.0.113.1", iface: "wan0", protocol: "static", distance: 1, metric: 0 },
    ],
    probes: [
      {
        destination: "10.66.90.3",
        trap: 0,
        why: "The /16 to null0 wins on length and the traffic is discarded. Nothing logs it, nothing sends an unreachable, and the symptom at the far end is a timeout rather than a rejection: this is the intended behaviour and it is also why a forgotten null route is so unpleasant to find.",
      },
      {
        destination: "10.66.4.12",
        trap: 1,
        why: "The BGP /24 punches a hole in the blackhole, because it is longer. The trap here is not reading order, it is assuming a drop wins over a forward the way a deny rule would in a firewall. A null route has no special standing at all: it is a prefix with an interface that happens to discard, and a longer prefix takes the traffic back off it.",
      },
    ],
  },
];

export const tableFor = (slug: string) => TABLES.find((table) => table.slug === slug);
