/**
 * One port forward, ten places it goes differently.
 *
 * The ruleset is nearly the same in every case, because that is the point:
 * these are not ten different mistakes in the rule, they are ten different
 * paths the reply takes. Six of the ten have a port forward that is written
 * exactly as the documentation says to write it.
 *
 * Addresses are from the documentation ranges in RFC 5737 and the shared
 * address space in RFC 6598, so anybody who copies one out of here and pastes
 * it into a terminal reaches nothing at all.
 */

import type { Case, Host, Nic } from "../types";

const LAN: Nic = { name: "eth1", address: "192.168.1.1", network: "192.168.1.0/24" };
const WAN: Nic = { name: "eth0", address: "203.0.113.7", network: "203.0.113.0/24" };

const web: Host = { name: "web", address: "192.168.1.10", network: "192.168.1.0/24", gateway: "192.168.1.1" };
const laptop: Host = { name: "laptop", address: "192.168.1.50", network: "192.168.1.0/24", gateway: "192.168.1.1" };
const visitor: Host = { name: "visitor", address: "198.51.100.9", network: "198.51.100.0/24" };

const FORWARD_443 = {
  chain: "prerouting" as const,
  kind: "dnat" as const,
  match: { daddr: "203.0.113.7", dport: 443 },
  to: { address: "192.168.1.10", port: 443 },
  written: "tcp dport 443 dnat to 192.168.1.10",
};

const MASQUERADE_OUT = {
  chain: "postrouting" as const,
  kind: "masquerade" as const,
  match: { oif: "eth0" },
  written: "oifname eth0 masquerade",
};

export const CASES: Case[] = [
  {
    slug: "from-outside-it-works",
    name: "The port forward, doing exactly what it says",
    brief:
      "The ordinary case, first, so the other nine have something to differ from. Somebody on the internet opens the site.",
    router: { name: "gw", nics: [WAN, LAN], rules: [FORWARD_443, MASQUERADE_OUT], upstream: "203.0.113.1" },
    hosts: [web, laptop, visitor],
    from: "visitor",
    packet: { saddr: "198.51.100.9", sport: 51000, daddr: "203.0.113.7", dport: 443 },
    question: "What address does the web server's access log show for this request?",
    options: [
      { id: "real", claim: "198.51.100.9, the client's own address. Only the destination was rewritten", says: { about: "seen-as", address: "198.51.100.9" } },
      { id: "public", claim: "203.0.113.7, the router's outside address, because that is what the client connected to", says: { about: "seen-as", address: "203.0.113.7" } },
      { id: "router", claim: "192.168.1.1, the router's inside address, because the packet came from it", says: { about: "seen-as", address: "192.168.1.1" } },
      { id: "broken", claim: "Nothing, because the reply cannot find its way back", says: { about: "outcome", is: "reply-took-another-path" } },
    ],
    why:
      "A port forward rewrites the destination and nothing else. The source stays as it was, all the way to the server, which is why an access log behind a port forward shows real client addresses and an access log behind a reverse proxy usually does not. The reply goes back out through the router because the server's default gateway is the router, and there the binding is reversed: the client sees a reply from 203.0.113.7, which is what it asked.",
    fix:
      "Nothing to fix. Worth knowing as the baseline, because the next four cases have the same rule and a different answer, and the difference is never in the rule.",
    breaks: "a port forward rewrites the source as well",
  },
  {
    slug: "the-hairpin",
    name: "It works from your phone on mobile data and not on the wifi",
    brief:
      "The same router and the same rule. This time somebody on the LAN opens the same public address, because that is the name in DNS and there is only one name.",
    router: { name: "gw", nics: [WAN, LAN], rules: [FORWARD_443, MASQUERADE_OUT], upstream: "203.0.113.1" },
    hosts: [web, laptop, visitor],
    from: "laptop",
    packet: { saddr: "192.168.1.50", sport: 52000, daddr: "203.0.113.7", dport: 443 },
    question: "What happens?",
    options: [
      { id: "works", claim: "It works. The rule matches from either side, so the connection is the same one", says: { about: "outcome", is: "connected" } },
      { id: "norule", claim: "Nothing matches and the packet is treated as being for the router itself", says: { about: "outcome", is: "no-rule-matched" } },
      { id: "loop", claim: "The switch drops it, because a frame cannot leave and re-enter the same port", says: { about: "nothing" } },
      { id: "hairpin", claim: "The request arrives and the reply comes back from an address the laptop never contacted, so the laptop throws it away", says: { about: "outcome", is: "reply-from-the-wrong-address" } },
    ],
    why:
      "Everything up to the server is right. The rule matched, the destination was rewritten, and the request arrived. Then the server looked at 192.168.1.50, saw an address on its own network, and replied straight to it over the switch, without going near the router. So no binding was consulted, and the laptop received a reply from 192.168.1.10 to a connection it opened to 203.0.113.7. It has no such connection, so it discards the packet, and the browser sits there until it times out.",
    fix:
      "Two real answers. Split horizon DNS, where the internal resolver answers with 192.168.1.10 and the LAN never involves the router, is the clean one. Hairpin NAT, where the router also rewrites the source on that path so the reply has to come back through it, works and costs you the client addresses in the log. Turning the reply into someone else's problem by adding a second port forward does not work at all.",
    breaks: "a port forward behaves the same from inside the network as from outside",
  },
  {
    slug: "the-hairpin-masqueraded",
    name: "The hairpin fix, and the price of it",
    brief:
      "The same port forward with one more rule: traffic from the LAN, going back out to the LAN, is masqueraded so that the reply has to come back through the router.",
    router: {
      name: "gw",
      nics: [WAN, LAN],
      rules: [
        FORWARD_443,
        {
          chain: "postrouting",
          kind: "masquerade",
          match: { oif: "eth1", saddr: "192.168.1.0/24", daddr: "192.168.1.10", dport: 443 },
          written: "oifname eth1 ip saddr 192.168.1.0/24 ip daddr 192.168.1.10 tcp dport 443 masquerade",
        },
        MASQUERADE_OUT,
      ],
      upstream: "203.0.113.1",
    },
    hosts: [web, laptop, visitor],
    from: "laptop",
    packet: { saddr: "192.168.1.50", sport: 52000, daddr: "203.0.113.7", dport: 443 },
    question: "It works now. What does the access log show for this request?",
    options: [
      { id: "laptop", claim: "192.168.1.50, the laptop. Only the destination was ever rewritten", says: { about: "seen-as", address: "192.168.1.50" } },
      { id: "router", claim: "192.168.1.1, the router. Every request from the LAN now looks like it came from the gateway", says: { about: "seen-as", address: "192.168.1.1" } },
      { id: "public", claim: "203.0.113.7, the address the laptop connected to", says: { about: "seen-as", address: "203.0.113.7" } },
      { id: "broken", claim: "Nothing. The extra rule breaks the reply path", says: { about: "outcome", is: "reply-from-the-wrong-address" } },
    ],
    why:
      "The masquerade is what forces the reply back through the router: the server now sees the request coming from 192.168.1.1, so it replies to 192.168.1.1, and the router holds the binding and reverses it. That is the fix working. It also means every internal client is 192.168.1.1 in the log, so rate limits, fail2ban rules and audit trails on that server can no longer tell one LAN machine from another.",
    fix:
      "Prefer split horizon DNS if you run a resolver, because it makes the LAN path shorter and keeps the client addresses. Where hairpin NAT is the only option, narrow it exactly as this rule does: one destination and one port, rather than masquerading everything that leaves eth1, which would rewrite the source of ordinary LAN traffic that has no business being touched.",
    breaks: "the hairpin fix is free",
  },
  {
    slug: "the-rule-that-only-matches-outside",
    name: "The same fix, written with an input interface",
    brief:
      "A careful person writes the port forward with iifname eth0 on it, so that it only applies to traffic from the internet. Then somebody on the LAN opens the public address.",
    router: {
      name: "gw",
      nics: [WAN, LAN],
      rules: [
        { ...FORWARD_443, match: { iif: "eth0", daddr: "203.0.113.7", dport: 443 }, written: "iifname eth0 tcp dport 443 dnat to 192.168.1.10" },
        MASQUERADE_OUT,
      ],
      upstream: "203.0.113.1",
    },
    hosts: [web, laptop, visitor],
    from: "laptop",
    packet: { saddr: "192.168.1.50", sport: 52000, daddr: "203.0.113.7", dport: 443 },
    question: "What happens to the laptop's packet?",
    options: [
      { id: "works", claim: "It works, because the interface condition only narrows which traffic is forwarded", says: { about: "outcome", is: "connected" } },
      { id: "hairpin", claim: "The request arrives and the reply comes back from the wrong address", says: { about: "outcome", is: "reply-from-the-wrong-address" } },
      { id: "norule", claim: "No rule matches, so the destination stays 203.0.113.7 and the packet is for the router itself", says: { about: "outcome", is: "no-rule-matched" } },
      { id: "filter", claim: "The forward filter hook sees a packet for 192.168.1.10", says: { about: "filter-sees", daddr: "192.168.1.10" } },
    ],
    why:
      "The interface condition did exactly what it was written to do, and what it was written to do turns out to be the bug. From the LAN the packet arrives on eth1, the rule does not match, the destination is never rewritten, and 203.0.113.7 is the router's own address, so the packet is delivered locally to a router that is not listening on 443. Connection refused rather than a timeout, which at least tells you something.",
    fix:
      "The iifname was not wrong, it was incomplete: it needs a second rule for the hairpin path, or split horizon DNS so the LAN never asks for the public address. What it should not become is the rule with no interface condition at all, which produces the previous case's silent timeout instead of this case's honest refusal.",
    breaks: "narrowing a rule by interface can only make it safer",
  },
  {
    slug: "the-filter-rule-that-never-matches",
    name: "The filter rule written against the public address",
    brief:
      "The port forward works. Somebody adds a forward rule to allow only two source networks to reach the site, and writes it against the address in DNS.",
    router: { name: "gw", nics: [WAN, LAN], rules: [FORWARD_443, MASQUERADE_OUT], upstream: "203.0.113.1" },
    hosts: [web, laptop, visitor],
    from: "visitor",
    packet: { saddr: "198.51.100.9", sport: 51000, daddr: "203.0.113.7", dport: 443 },
    question: "What destination address is the forward filter hook matching against?",
    options: [
      { id: "private", claim: "192.168.1.10, because the destination was rewritten one hook earlier", says: { about: "filter-sees", daddr: "192.168.1.10" } },
      { id: "public", claim: "203.0.113.7, because that is what the packet was addressed to", says: { about: "filter-sees", daddr: "203.0.113.7" } },
      { id: "either", claim: "Either, since conntrack remembers both and the rule can name whichever you prefer", says: { about: "nothing" } },
      { id: "seen", claim: "It is matching a packet whose source has already become 192.168.1.1", says: { about: "seen-as", address: "192.168.1.1" } },
    ],
    why:
      "The two NAT points sit on either side of the routing decision, and the forward filter sits between them. dstnat runs in prerouting at priority -100, the route is chosen on the new destination, forward filter runs at priority 0, and srcnat runs in postrouting at priority +100. So by the time a filter rule sees this packet its destination is already 192.168.1.10, and its source is still the real client. A rule written against 203.0.113.7 matches nothing and quietly allows everything the default policy allows.",
    fix:
      "Write forward rules against the translated destination and the original source, which is what that hook actually sees. If you want to be sure rather than to remember, ct status dnat and ct original daddr let you match on the pre-translation address explicitly, and say so to the next person reading the ruleset.",
    breaks: "a filter rule sees the packet as it was sent",
  },
  {
    slug: "the-server-points-elsewhere",
    name: "The server's default gateway is not the router",
    brief:
      "The port forward is right and the site is unreachable from the internet. The server was given a static route out through a VPN appliance during a migration and nobody changed it back.",
    router: { name: "gw", nics: [WAN, LAN], rules: [FORWARD_443, MASQUERADE_OUT], upstream: "203.0.113.1" },
    hosts: [
      { ...web, gateway: "192.168.1.254" },
      laptop,
      visitor,
      { name: "vpn", address: "192.168.1.254", network: "192.168.1.0/24" },
    ],
    from: "visitor",
    packet: { saddr: "198.51.100.9", sport: 51000, daddr: "203.0.113.7", dport: 443 },
    question: "What happens?",
    options: [
      { id: "works", claim: "It works. The reply follows the same path back automatically", says: { about: "outcome", is: "connected" } },
      { id: "norule", claim: "Nothing matches on the way in", says: { about: "outcome", is: "no-rule-matched" } },
      { id: "public", claim: "The server sees the request as coming from 203.0.113.7", says: { about: "seen-as", address: "203.0.113.7" } },
      { id: "elsewhere", claim: "The request arrives, and the reply leaves by a box that has no binding for it, so nothing reverses the translation", says: { about: "outcome", is: "reply-took-another-path" } },
    ],
    why:
      "This is the asymmetric routing failure, and it is invisible from either end on its own. On the router, conntrack shows the connection and a packet count that only ever goes up in one direction. On the server, the access log shows the request arriving and the application shows it answering. Both are telling the truth. The reply is a new packet routed by the server's table, and the server's table sends it to a box that has never heard of this connection.",
    fix:
      "Check the return path before the rule, always, because the rule is the part people look at. conntrack -L on the router with a zero reply counter is the tell, and ip route get 198.51.100.9 on the server is the answer in one line.",
    breaks: "a reply follows the path the request took",
  },
  {
    slug: "the-address-nobody-can-route-to",
    name: "The rule is right and nothing ever arrives",
    brief:
      "A new connection, and the router's outside address is 100.64.12.9. The port forward is written correctly, the service is up, and no packet has ever reached it from the internet.",
    router: {
      name: "gw",
      nics: [{ name: "eth0", address: "100.64.12.9", network: "100.64.0.0/10" }, LAN],
      rules: [
        { ...FORWARD_443, match: { daddr: "100.64.12.9", dport: 443 }, written: "tcp dport 443 dnat to 192.168.1.10" },
        { ...MASQUERADE_OUT },
      ],
      upstream: "100.64.0.1",
    },
    hosts: [web, laptop, visitor],
    from: "visitor",
    packet: { saddr: "198.51.100.9", sport: 51000, daddr: "100.64.12.9", dport: 443 },
    question: "Why does nothing arrive?",
    options: [
      { id: "rule", claim: "The rule needs an iifname to match traffic from the internet", says: { about: "nothing" } },
      { id: "cgnat", claim: "100.64.12.9 is not an address the internet routes to. The rule is on a box nobody outside can address", says: { about: "wan-routable", is: false } },
      { id: "hairpin", claim: "The reply comes back from the wrong address", says: { about: "outcome", is: "reply-from-the-wrong-address" } },
      { id: "gateway", claim: "The server's default gateway is wrong", says: { about: "outcome", is: "reply-took-another-path" } },
    ],
    why:
      "100.64.0.0/10 is the shared address space in RFC 6598, handed out by an ISP doing carrier grade NAT. It is not private and it is not public: it is an address inside the ISP's own translation layer, so the router has a perfectly real address that no packet from outside can be sent to. Every check made from inside the network passes, which is why this one is usually diagnosed last.",
    fix:
      "Compare what the router thinks its address is against what the internet sees: ip addr on the WAN interface next to a lookup of your own address from an outside service. If they differ and the first is in 100.64.0.0/10, no rule on that box will help. The answers are a static address from the ISP, IPv6, which usually is not translated, or a tunnel to somewhere that has a routable address.",
    breaks: "an address on the WAN interface is an address the world can reach",
  },
  {
    slug: "masquerade-uses-the-exit",
    name: "Two uplinks, and the address the far end sees",
    brief:
      "The router has a second uplink on eth2 and the default route now points out of it. A LAN machine looks up a name.",
    router: {
      name: "gw",
      nics: [WAN, LAN, { name: "eth2", address: "198.18.5.2", network: "198.18.5.0/24" }],
      rules: [
        { chain: "postrouting", kind: "masquerade", match: { oif: "eth0" }, written: "oifname eth0 masquerade" },
        { chain: "postrouting", kind: "masquerade", match: { oif: "eth2" }, written: "oifname eth2 masquerade" },
      ],
      upstream: "198.18.5.1",
    },
    hosts: [
      web,
      laptop,
      { name: "resolver", address: "198.18.9.9", network: "198.18.9.0/24" },
    ],
    from: "laptop",
    packet: { saddr: "192.168.1.50", sport: 53000, daddr: "198.18.9.9", dport: 53 },
    question: "What source address does the resolver see?",
    options: [
      { id: "wan", claim: "203.0.113.7, the address on the first uplink", says: { about: "seen-as", address: "203.0.113.7" } },
      { id: "laptop", claim: "192.168.1.50, because masquerade only rewrites the destination", says: { about: "seen-as", address: "192.168.1.50" } },
      { id: "eth2", claim: "198.18.5.2, the address on the interface the packet actually leaves by", says: { about: "seen-as", address: "198.18.5.2" } },
      { id: "lan", claim: "192.168.1.1, the router's inside address, because that is where the packet came from", says: { about: "seen-as", address: "192.168.1.1" } },
    ],
    why:
      "masquerade is snat with the address left to the kernel, and the address it picks is the one on the interface the routing decision chose. That is the whole difference between masquerade and snat: masquerade follows the route, and snat is a number you wrote down. On a box with one uplink and a static address they are the same thing with different costs; on this box they are different answers, and the one you wrote down would be wrong half the time.",
    fix:
      "Use masquerade on anything whose outside address can change or be chosen, which is a dialup, a DHCP WAN, or a multi homed router like this one. Use snat where the address is fixed and you want to be certain which one is used, and then keep the rule next to the route that decides it, because they have to agree and nothing checks that they do.",
    breaks: "masquerade and snat differ only in how much you have to type",
  },
  {
    slug: "the-name-that-resolves-inside",
    name: "Split horizon DNS, and the router never sees it",
    brief:
      "The hairpin case with the other fix: the internal resolver answers the site's name with 192.168.1.10, so the laptop connects to the server directly.",
    router: { name: "gw", nics: [WAN, LAN], rules: [FORWARD_443, MASQUERADE_OUT], upstream: "203.0.113.1" },
    hosts: [web, laptop, visitor],
    from: "laptop",
    packet: { saddr: "192.168.1.50", sport: 52000, daddr: "192.168.1.10", dport: 443 },
    question: "What does the access log show, and what did the port forward do?",
    options: [
      { id: "laptop", claim: "192.168.1.50, and the port forward did nothing, because no packet was ever offered to it", says: { about: "seen-as", address: "192.168.1.50" } },
      { id: "router", claim: "192.168.1.1, because the packet still goes through the router", says: { about: "seen-as", address: "192.168.1.1" } },
      { id: "public", claim: "203.0.113.7, because the port forward still applies", says: { about: "seen-as", address: "203.0.113.7" } },
      { id: "broken", claim: "Nothing, because the reply comes back from the wrong address", says: { about: "outcome", is: "reply-from-the-wrong-address" } },
    ],
    why:
      "Both machines are on 192.168.1.0/24, so the laptop puts the frame on the wire addressed to the server and the switch delivers it. The router is not in the path in either direction, which is why this is the fix that keeps the client addresses and adds no rules: there is no translation because there is nothing to translate. The cost is a second answer for the same name, which has to be maintained, and a laptop that has cached the public address and then walks onto the wifi will still hairpin until the TTL expires.",
    fix:
      "Keep the two answers in one place if you can, which for most homelabs means the resolver that already serves the LAN. And keep the TTL short on that record, because the failure mode of split horizon is a cached answer from the other side of the horizon.",
    breaks: "a port forward is involved whenever the public name is used",
  },
  {
    slug: "dnat-to-nowhere",
    name: "The forward points at an address that moved",
    brief:
      "The server was rebuilt on a different subnet during a migration and the port forward still names the old address. The router has no interface on that network and a default route out of the WAN.",
    router: {
      name: "gw",
      nics: [WAN, LAN],
      rules: [
        { ...FORWARD_443, to: { address: "10.20.0.5", port: 443 }, written: "tcp dport 443 dnat to 10.20.0.5" },
        MASQUERADE_OUT,
      ],
      upstream: "203.0.113.1",
    },
    hosts: [web, laptop, visitor],
    from: "visitor",
    packet: { saddr: "198.51.100.9", sport: 51000, daddr: "203.0.113.7", dport: 443 },
    question: "What happens to the packet after the rule rewrites it?",
    options: [
      { id: "works", claim: "It reaches the server anyway, because conntrack remembers where the connection was going", says: { about: "outcome", is: "connected" } },
      { id: "filter", claim: "The forward filter hook still sees 203.0.113.7", says: { about: "filter-sees", daddr: "203.0.113.7" } },
      { id: "gone", claim: "It is routed at the new destination, which the router has no path to, and there is nothing at the other end of the default route either", says: { about: "outcome", is: "unreachable" } },
      { id: "back", claim: "The router sends it back out of the interface it arrived on", says: { about: "nothing" } },
    ],
    why:
      "The routing decision is made after the rewrite and on the new destination, so the packet is now routed towards 10.20.0.5. The router has no interface on that network, so the default route takes it, which means an internal address leaving out of the WAN interface towards an ISP that will drop it. The masquerade on the way out fired too, so what leaves the WAN interface is a packet from the router's own public address to a private one, which is a shape worth alerting on all by itself. Nothing on the router logs an error: the rule matched, the packet was forwarded, and it went where the routing table said.",
    fix:
      "Watch for private addresses leaving the WAN interface, which is worth a counter on its own and catches this as well as several worse things. And treat a port forward as a pair with the address it names: if a rebuild changes an address, the rule naming it is part of the rebuild.",
    breaks: "the routing decision is made on the address the packet arrived with",
  },
];
