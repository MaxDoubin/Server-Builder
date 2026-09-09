/**
 * Eight symptoms, each with the lookup that explains it.
 *
 * The options are the point. Every wrong answer here is something a competent
 * person actually says in the first five minutes, because from the client side
 * these faults are indistinguishable: "it does not resolve" covers a lame
 * delegation, a missing glue record, a nameserver whose own name has no
 * address, and a CNAME to a name that does not exist. Picking between them
 * needs the trace, which is the whole exercise.
 */

import type { Outcome, RRType } from "../types";

/**
 * One thing somebody might conclude from the symptom.
 *
 * `names` is the resolution this claim describes, and it is how the page
 * knows which option is right: the resolver runs, and the option naming what
 * it reached is the answer. Nothing here says which one that is.
 *
 * This replaced an `answer` index typed in by hand, which was checked for
 * being inside the array and against nothing else. Editing it to point at
 * "The mail server is refusing connections" passed CI, and the page marked
 * that right, on an exercise whose whole subject is that the client-side
 * symptom does not tell you which fault you have.
 *
 * `null` is for a claim the resolver has no opinion about. "The TTL expired"
 * and "The registrar has not published the delegation" are things people say
 * that this model does not represent, so they can never match, which is
 * exactly what a distractor should do. CI requires that one option matches
 * and that the rest do not.
 */
export interface Option {
  claim: string;
  names: Outcome | null;
}

export interface Case {
  id: string;
  /** What the person reporting it said. */
  symptom: string;
  name: string;
  type: RRType;
  /**
   * What the resolver should conclude. CI checks this against the engine.
   *
   * Kept alongside the tagged options rather than derived from them, because
   * the two fail differently: a model change that moves the outcome makes
   * this disagree, and an option retagged by mistake makes the match count
   * wrong. Either one on its own leaves a hole the other covers.
   */
  outcome: Outcome;
  options: Option[];
  explain: string[];
}

export const CASES: Case[] = [
  {
    id: "the-alias-that-went-nowhere",
    symptom: "Mail to the district bounces with a DNS error. The web site is fine.",
    name: "mail.northbay.example",
    type: "A",
    outcome: "nxdomain",
    options: [
      { claim: "The northbay.example zone is down", names: null },
      { claim: "mail.northbay.example is a CNAME to a name that does not exist", names: "nxdomain" },
      { claim: "The MX record is missing", names: "nodata" },
      { claim: "The mail server is refusing connections", names: null },
    ],
    explain: [
      "The alias resolves perfectly. Its target does not exist, and that is where the NXDOMAIN comes from: not from the name that was asked for, but from the name it pointed at.",
      "This is the reason an NXDOMAIN on a name you can see in your own zone file is not a contradiction. The zone is fine. What is missing is somewhere else entirely, and in this case it is a whole zone that was never created.",
      "The trace shows the CNAME being followed and the resolution restarting at the root for the new name. That restart is why long alias chains are slow, and why the failure appears to come from a name the reporter never typed.",
    ],
  },
  {
    id: "the-server-that-forgot",
    symptom: "One old subdomain stopped resolving. Nothing was changed.",
    name: "old.northbay.example",
    type: "A",
    outcome: "lame",
    options: [
      { claim: "The nameserver is blocked by a firewall", names: null },
      { claim: "The zone was deleted", names: "nxdomain" },
      { claim: "The parent delegates to a server that does not hold the zone", names: "lame" },
      { claim: "The TTL expired", names: null },
    ],
    explain: [
      "The parent zone still delegates archive.example to ns1.retired-dns.example, and that server answers, and what it answers is that it is not authoritative. The delegation outlived the hosting.",
      "This is a lame delegation, and it is the fault most often misdiagnosed as a firewall, because from a client both produce a query that yields nothing useful. The difference is that a firewall gives you silence and a lame server gives you a reply. The trace shows a reply.",
      "Nothing was changed on the side that broke, which is the other half of why it is confusing. Somebody decommissioned a nameserver somewhere else, and the record pointing at it was never anyone's job.",
      "The fix is at the parent, not the child: the delegation has to be updated or removed. Nobody can fix this from inside archive.example, because archive.example is not where the wrong data is.",
    ],
  },
  {
    id: "the-circle",
    symptom: "A newly delegated zone does not resolve from anywhere, and the zone file is correct.",
    name: "www.quarry.example",
    type: "A",
    outcome: "no-glue",
    options: [
      { claim: "The zone file has a syntax error", names: null },
      { claim: "The nameservers are inside the zone and the parent sends no glue", names: "no-glue" },
      { claim: "The serial number was not incremented", names: null },
      { claim: "The registrar has not published the delegation", names: null },
    ],
    explain: [
      "quarry.example is served by ns1.quarry.example and ns2.quarry.example, which are inside quarry.example. To find their addresses a resolver needs to ask the servers for quarry.example, which are the things it is trying to find.",
      "Glue is what breaks the circle: A records for those hostnames, held at the parent, handed out with the referral. They are the parent's copy of the child's data, which is why they go stale when the child renumbers and nobody tells the registrar.",
      "The zone file really is correct. Every record inside quarry.example is right, including the A records for its own nameservers, and none of it can be reached. This is why the fault survives every check the zone's owner knows how to run.",
      "Two ways out. Add glue at the parent, which the registrar does, or move the nameservers to names outside the zone, which is why plenty of organizations run ns1.example-dns.net rather than ns1.their-own-domain.",
    ],
  },
  {
    id: "a-delegation-to-nothing",
    symptom: "A supplier says their new subdomain is live. It resolves for nobody.",
    name: "www.depot.example",
    type: "A",
    outcome: "no-address",
    options: [
      { claim: "The nameserver named in the delegation has no address record anywhere", names: "no-address" },
      { claim: "The zone is lame", names: "lame" },
      { claim: "The name does not exist", names: "nxdomain" },
      { claim: "The parent zone is missing the delegation", names: null },
    ],
    explain: [
      "The delegation exists and names ns1.depot-dns.example. That host has no A record in any zone a resolver can reach, so there is nothing to send the query to.",
      "It is worth separating this from a lame delegation. Lame means the server answered and disclaimed the zone. This means there is no server: the resolution stops one step earlier, before any packet is sent.",
      "It is usually a typo in a delegation, or a nameserver hostname that was planned and never created. Both are invisible in the child zone, because the child zone is not where the mistake is.",
    ],
  },
  {
    id: "two-servers-one-alive",
    symptom: "Monitoring says one of the supplier's nameservers is down. Is anything broken?",
    name: "www.orionsupply.example",
    type: "A",
    outcome: "answer",
    options: [
      { claim: "Yes, half of lookups will fail", names: null },
      { claim: "Yes, resolution will be slow for everyone", names: null },
      { claim: "No, this is what a second nameserver is for", names: "answer" },
      { claim: "No, because DNS caches the answer", names: null },
    ],
    explain: [
      "A resolver that gets no useful reply from one server tries the next one in the set. Two servers where one is dead is a zone that works, which is the entire reason a delegation lists more than one.",
      "The lookup here succeeds and the trace shows why. This is included precisely because the other seven cases are faults: an exercise made only of broken things teaches that everything unusual is broken.",
      "It is still worth fixing, because the redundancy is now spent. The failure that matters is the second one.",
      "The one thing worth checking is whether the failures are correlated: two nameservers in the same rack, on the same power feed, or in the same routing domain are one nameserver with extra paperwork.",
    ],
  },
  {
    id: "the-difference-that-matters",
    symptom: "An application logs a DNS error for a host that definitely exists.",
    name: "dev.northbay.example",
    type: "AAAA",
    outcome: "nodata",
    options: [
      { claim: "The name does not exist", names: "nxdomain" },
      { claim: "The name exists and has no record of the type asked for", names: "nodata" },
      { claim: "The zone is misconfigured", names: null },
      { claim: "The resolver is broken", names: null },
    ],
    explain: [
      "NOERROR with zero answers is not NXDOMAIN. The name exists; it has no AAAA. The application asked for an address family the host does not have.",
      "The distinction matters operationally. NXDOMAIN is a fact about a name across every record type, and a resolver caches it that way. NODATA is a fact about one type, and the same name may answer perfectly for A a microsecond later.",
      "It also explains behavior people read as a bug. A dual-stack client asking AAAA then A is not misbehaving, it is doing the only correct thing, and the AAAA NODATA in your logs is the normal case rather than the error.",
    ],
  },
  {
    id: "the-chain",
    symptom: "The portal is slow to load the first time and fine afterwards.",
    name: "portal.northbay.example",
    type: "A",
    outcome: "answer",
    options: [
      { claim: "The web server is slow to start", names: null },
      { claim: "The name goes through two aliases, each restarting resolution at the root", names: "answer" },
      { claim: "The nameserver is far away", names: null },
      { claim: "The TTL is too long", names: null },
    ],
    explain: [
      "portal.northbay.example is a CNAME to portal.cdn.example, which is a CNAME to edge-42.cdn.example. Each alias sends the resolver back to the root to start again with the new name.",
      "Nine queries for one address, and every one of them is a round trip. On a cold cache that is the whole of the delay, and it disappears on the second lookup because everything in the chain is now cached, which is exactly the shape the reporter described.",
      "Chained aliases are usually a CDN handing off to a CDN, and there is often one link that nobody meant to leave in. Flattening the chain by one link removes one full walk from the root.",
      "This one resolves correctly. The lesson is that correct and cheap are different properties.",
    ],
  },
  {
    id: "the-aliases-that-point-at-each-other",
    symptom: "A hostname makes the resolver hang and then give up.",
    name: "ring.cdn.example",
    type: "A",
    outcome: "loop",
    options: [
      { claim: "The nameserver is overloaded", names: null },
      { claim: "Two CNAMEs point at each other", names: "loop" },
      { claim: "The zone is lame", names: "lame" },
      { claim: "The name does not exist", names: "nxdomain" },
    ],
    explain: [
      "ring.cdn.example is a CNAME to ring-b.cdn.example, and ring-b.cdn.example is a CNAME back to ring.cdn.example. Neither is wrong on its own and together they never terminate.",
      "A resolver detects this with a hop limit rather than by understanding it, so what a client sees is a delay followed by SERVFAIL, which reads as a server problem. The server is fine; the data is a circle.",
      "It happens most often when two teams each add an alias to point at the other's canonical name, and each one is correct in isolation. Nothing in a zone file check catches it, because each zone is individually valid.",
    ],
  },
];
