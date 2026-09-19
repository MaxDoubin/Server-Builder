import type { Case } from "../types";

/**
 * Ten names, and how many times each is asked for.
 *
 * Addresses are from the documentation ranges (RFC 5737) or private space,
 * never a real service's address, so a reader who types one into a terminal
 * reaches nothing.
 */

/** A pod's resolv.conf as kubelet writes it, with one node search domain appended. */
const CLUSTER = ["prod.svc.cluster.local", "svc.cluster.local", "cluster.local", "ec2.internal"];

const STRIPE = "203.0.113.10";

export const CASES: Case[] = [
  {
    slug: "kubernetes-ten-queries",
    name: "Ten queries for one name",
    brief:
      "A pod in the prod namespace calls api.stripe.com on every checkout. The cluster DNS is" +
      " busy, latency is up, and the DNS dashboard is mostly red. Its resolv.conf is the one" +
      " kubelet wrote, with the node's search domain appended at the end.",
    setup: {
      name: "api.stripe.com",
      ndots: 5,
      search: CLUSTER,
      families: 2,
      glibc: "2.26+",
      records: { "api.stripe.com": STRIPE },
      wildcards: {},
      connectionsPerSecond: 0,
    },
    question: "How many DNS queries does one new connection cost?",
    options: [
      {
        id: "two",
        claim: "2 queries, an A and an AAAA for the name as written",
        says: { about: "queries", count: 2 },
      },
      {
        id: "five",
        claim: "5 queries, one for each name the resolver tries",
        says: { about: "queries", count: 5 },
      },
      {
        id: "eight",
        claim: "8 queries in total; the two for the real name are answered from the local cache",
        says: { about: "queries", count: 8 },
      },
      {
        id: "ten",
        claim: "10 queries, two for each of five names, eight of them for names that do not exist",
        says: { about: "queries", count: 10 },
      },
    ],
    why:
      "api.stripe.com has two dots and ndots is five. Two is fewer than five, so the resolver" +
      " appends each search domain first and asks for the name as written last. Four search" +
      " domains plus the name itself is five attempts, and getaddrinfo sends A and AAAA for each," +
      " so ten queries go out and eight come back NXDOMAIN. Nothing failed. This is the algorithm" +
      " in resolv.conf(5) doing what it says.",
    fix:
      "write the name with a trailing dot where the code calls it, api.stripe.com., which makes it" +
      " fully qualified and skips the search list; or set ndots:2 in the pod's dnsConfig if nothing" +
      " in it needs the deeper search; or point external names at a resolver that caches the" +
      " NXDOMAINs.",
    breaks: "that a fully qualified hostname is one lookup",
  },
  {
    slug: "the-trailing-dot",
    name: "The trailing dot",
    brief:
      "Same pod, same resolv.conf. A developer read the previous case and changed one string in" +
      " the HTTP client from api.stripe.com to api.stripe.com. with a dot on the end. Code review" +
      " flagged it as a typo.",
    setup: {
      name: "api.stripe.com.",
      ndots: 5,
      search: CLUSTER,
      families: 2,
      glibc: "2.26+",
      records: { "api.stripe.com": STRIPE },
      wildcards: {},
      connectionsPerSecond: 0,
    },
    question: "With the trailing dot, how many queries does one connection cost?",
    options: [
      {
        id: "same",
        claim: "10 queries, the dot changes nothing on the wire because every DNS name ends in the root",
        says: { about: "queries", count: 10 },
      },
      {
        id: "eight",
        claim: "8 queries, the dot saves the two for the last search domain only",
        says: { about: "queries", count: 8 },
      },
      {
        id: "two",
        claim: "2 queries, because a name ending in a dot is fully qualified and the search list is never consulted",
        says: { about: "queries", count: 2 },
      },
      {
        id: "one",
        claim: "1 query, because the dot also tells the resolver to skip the AAAA lookup",
        says: { about: "queries", count: 1 },
      },
    ],
    why:
      "A trailing dot is how a name says it is complete. The resolver strips it, sends the name" +
      " exactly once for each address family, and does not look at the search list at all. Two" +
      " queries instead of ten, and the answer arrives on the first attempt rather than the" +
      " fifth. It is the one change that fixes this from inside the application without touching" +
      " anything the cluster owns.",
    fix:
      "keep the dot, and add a comment above it saying why, because the next reviewer will also" +
      " call it a typo. Some HTTP clients and TLS libraries mishandle a trailing dot in the Host" +
      " header or the SNI, so test the whole request, not just the lookup.",
    breaks: "that the trailing dot is a typo",
  },
  {
    slug: "ndots-two",
    name: "ndots:2",
    brief:
      "The platform team adds dnsConfig to the checkout deployment with options ndots:2 and leaves" +
      " the search list alone. The same api.stripe.com string, no trailing dot, from the same" +
      " pod.",
    setup: {
      name: "api.stripe.com",
      ndots: 2,
      search: CLUSTER,
      families: 2,
      glibc: "2.26+",
      records: { "api.stripe.com": STRIPE },
      wildcards: {},
      connectionsPerSecond: 0,
    },
    question: "How many queries now?",
    options: [
      {
        id: "ten",
        claim: "10 queries, because ndots counts search domains and there are still four of them",
        says: { about: "queries", count: 10 },
      },
      {
        id: "two",
        claim: "2 queries, because two dots is not fewer than two, so the name as written is tried first and answers",
        says: { about: "queries", count: 2 },
      },
      {
        id: "four",
        claim: "4 queries, the name as written plus the first search domain",
        says: { about: "queries", count: 4 },
      },
      {
        id: "six",
        claim: "6 queries, because ndots:2 keeps two of the four search domains",
        says: { about: "queries", count: 6 },
      },
    ],
    why:
      "ndots is a threshold on the dots in the name, not a count of anything in the search list." +
      " api.stripe.com has two dots; two is not fewer than two; so the resolver sends the name as" +
      " written first, it answers, and the search list is never reached. Every external name with" +
      " at least two dots now costs two queries. The search list is untouched, so a bare service" +
      " name like db still walks it.",
    fix:
      "prefer this over rewriting call sites when many external names are involved. Check what" +
      " else the pod resolves: a cross-namespace name like db.billing has one dot, which is still" +
      " fewer than two, so it keeps the search-first behavior it needs.",
    breaks: "that ndots is the length of the search list",
  },
  {
    slug: "lowering-it-to-one",
    name: "Lowering it to one",
    brief:
      "Another team went further and set ndots:1, the glibc default, on a service that talks to a" +
      " database in the billing namespace as db.billing. Nothing broke, but the DNS graphs for" +
      " that service did not improve. The pod's search list is the cluster's three domains.",
    setup: {
      name: "db.billing",
      ndots: 1,
      search: ["prod.svc.cluster.local", "svc.cluster.local", "cluster.local"],
      families: 2,
      glibc: "2.26+",
      records: { "db.billing.svc.cluster.local": "10.100.4.20" },
      wildcards: {},
      connectionsPerSecond: 0,
    },
    question: "How many queries does db.billing cost with ndots set to 1?",
    options: [
      {
        id: "two",
        claim: "2 queries, the search list finds it on the first domain",
        says: { about: "queries", count: 2 },
      },
      {
        id: "four",
        claim: "4 queries, two names: the first search domain misses and the second hits",
        says: { about: "queries", count: 4 },
      },
      {
        id: "eight",
        claim: "8 queries, every search domain and then the name as written",
        says: { about: "queries", count: 8 },
      },
      {
        id: "six",
        claim: "6 queries: the name as written first, which does not exist, then two search domains",
        says: { about: "queries", count: 6 },
      },
    ],
    why:
      "db.billing has one dot and ndots is one, so it is not fewer than ndots and the resolver" +
      " tries db.billing as an absolute name first. There is no such top-level domain, so that is" +
      " two NXDOMAINs before the search list even starts. Then db.billing.prod.svc.cluster.local" +
      " misses and db.billing.svc.cluster.local answers. Six queries. With the kubelet default of" +
      " five, the same name goes search-first and costs four. ndots:5 exists precisely so that" +
      " every name a cluster hands out is tried under the search list before anything else.",
    fix:
      "set ndots to the smallest value that still keeps in-cluster names search-first, which is" +
      " one more than the most dots any of them has. For service.namespace that is 2. Measure" +
      " with the DNS dashboard before and after, per deployment, rather than cluster-wide.",
    breaks: "that lowering ndots to one is free",
  },
  {
    slug: "bare-hostname",
    name: "A bare hostname",
    brief:
      "A laptop on the corporate network, resolv.conf written by DHCP: one search domain," +
      " corp.example.com, and no options line. Someone types ssh db.",
    setup: {
      name: "db",
      ndots: 1,
      search: ["corp.example.com"],
      families: 2,
      glibc: "2.26+",
      records: { "db.corp.example.com": "10.20.0.5" },
      wildcards: {},
      connectionsPerSecond: 0,
    },
    question: "What is the first name that goes on the wire?",
    options: [
      {
        id: "asis",
        claim: "db, exactly as typed, and the search list only if that fails",
        says: { about: "first-tried", name: "db" },
      },
      {
        id: "suffixed",
        claim: "db.corp.example.com, because zero dots is fewer than one, so the search domain goes on first",
        says: { about: "first-tried", name: "db.corp.example.com" },
      },
      {
        id: "zone",
        claim: "corp.example.com, to find the domain's nameserver before asking about db",
        says: { about: "first-tried", name: "corp.example.com" },
      },
      {
        id: "label",
        claim: "db.corp, the first label of the search domain, then more labels if that fails",
        says: { about: "first-tried", name: "db.corp" },
      },
    ],
    why:
      "This is the case the search list was invented for. A bare hostname has no dots, the" +
      " default ndots is one, and fewer than one means the resolver appends the search domain" +
      " before it tries anything else. db.corp.example.com answers on the first attempt and the" +
      " name as written is never sent. Two queries, both useful.",
    fix:
      "nothing. This is the search list working. It is worth knowing that the same file makes" +
      " every external name with fewer than one dot, which is none of them, so on a laptop with" +
      " ndots:1 the cost of the search list is close to zero.",
    breaks: "that a bare hostname is looked up as itself",
  },
  {
    slug: "third-domain-wins",
    name: "The third domain",
    brief:
      "A build server whose resolv.conf lists three search domains: eng.example.com," +
      " ops.example.com, example.com, in that order. A script fetches from a host called intranet," +
      " which exists only as intranet.example.com.",
    setup: {
      name: "intranet",
      ndots: 1,
      search: ["eng.example.com", "ops.example.com", "example.com"],
      families: 2,
      glibc: "2.26+",
      records: { "intranet.example.com": "10.0.8.4" },
      wildcards: {},
      connectionsPerSecond: 0,
    },
    question: "How many NXDOMAIN responses does the resolver receive before it gets an answer?",
    options: [
      {
        id: "four",
        claim: "4: an A and an AAAA for each of the two domains that came before the right one",
        says: { about: "nxdomain", count: 4 },
      },
      {
        id: "none",
        claim: "0, because the resolver asks all three domains at once and keeps the one that answers",
        says: { about: "nxdomain", count: 0 },
      },
      {
        id: "two",
        claim: "2, one for each domain it had to skip",
        says: { about: "nxdomain", count: 2 },
      },
      {
        id: "six",
        claim: "6, because the name as written is also tried and also fails",
        says: { about: "nxdomain", count: 6 },
      },
    ],
    why:
      "The search list is an order, not a set. The resolver appends eng.example.com and gets" +
      " NXDOMAIN for both A and AAAA, then ops.example.com and gets the same, then example.com" +
      " and gets an answer. Four failures, then success, on every single lookup of that name from" +
      " this machine. The name as written is not tried, because something answered before the" +
      " list ran out.",
    fix:
      "put the domain that answers most often first. Or stop relying on the list for names a" +
      " script uses and write them out in full; a script does not benefit from the convenience" +
      " the list exists to provide.",
    breaks: "that the search list is a set rather than an order",
  },
  {
    slug: "the-seventh-domain",
    name: "The seventh domain",
    brief:
      "An old CentOS 7 host, glibc 2.17. Its resolv.conf has grown to seven search domains over" +
      " the years as teams were added. A wiki exists as wiki.g.example.com, and g.example.com is" +
      " the last entry in the list. ssh wiki fails with Name or service not known.",
    setup: {
      name: "wiki",
      ndots: 1,
      search: [
        "a.example.com",
        "b.example.com",
        "c.example.com",
        "d.example.com",
        "e.example.com",
        "f.example.com",
        "g.example.com",
      ],
      families: 2,
      glibc: "2.25",
      records: { "wiki.g.example.com": "10.7.0.1" },
      wildcards: {},
      connectionsPerSecond: 0,
    },
    question: "Does wiki resolve on this host?",
    options: [
      {
        id: "seventh",
        claim: "Yes, as wiki.g.example.com, once the resolver reaches the seventh entry",
        says: { about: "resolves-to", name: "wiki.g.example.com" },
      },
      {
        id: "asis",
        claim: "Yes, as wiki, because the resolver falls back to the name as written",
        says: { about: "resolves-to", name: "wiki" },
      },
      {
        id: "no",
        claim: "No: glibc before 2.26 uses only the first six search domains, and g.example.com is the seventh",
        says: { about: "resolves-to", name: null },
      },
      {
        id: "six",
        claim: "No, and the resolver gives up after 6 queries, one per domain",
        says: { about: "queries", count: 6 },
      },
    ],
    why:
      "resolv.conf(5) says it: in glibc 2.25 and earlier the search list is limited to six" +
      " domains with a total of 256 characters. The seventh entry is read and silently ignored." +
      " The resolver tries wiki under six domains, then wiki as written, gets NXDOMAIN seven" +
      " times over for both families, fourteen queries, and reports the name unknown. Move" +
      " g.example.com anywhere into the first six and it resolves. Since glibc 2.26 the list is" +
      " unlimited, which is why the same file works on a newer host and the bug looks like it" +
      " comes and goes.",
    fix:
      "on hosts that cannot be upgraded, keep the list to six and put the domains that answer" +
      " most often first. A DNS search list with seven entries is also a sign that names are" +
      " being used bare where they should be written in full.",
    breaks: "that the search list has no length limit",
  },
  {
    slug: "the-wildcard-answered",
    name: "The wildcard answered",
    brief:
      "A pod with the usual cluster search list, except the node's domain is" +
      " internal.example.com, and somebody once added a wildcard A record for" +
      " *.internal.example.com pointing at an internal proxy so that any new hostname would" +
      " work without a ticket. The pod calls api.stripe.com.",
    setup: {
      name: "api.stripe.com",
      ndots: 5,
      search: ["prod.svc.cluster.local", "svc.cluster.local", "cluster.local", "internal.example.com"],
      families: 2,
      glibc: "2.26+",
      records: { "api.stripe.com": STRIPE },
      wildcards: { "internal.example.com": "10.0.0.1" },
      connectionsPerSecond: 0,
    },
    question: "Which address does the program connect to?",
    options: [
      {
        id: "stripe",
        claim: "203.0.113.10, the real address of api.stripe.com, found on the last attempt",
        says: { about: "address", address: STRIPE },
      },
      {
        id: "wildcard",
        claim: "10.0.0.1, whatever *.internal.example.com points at, because api.stripe.com.internal.example.com matches it",
        says: { about: "address", address: "10.0.0.1" },
      },
      {
        id: "none",
        claim: "No address; NXDOMAIN, because api.stripe.com is not a name under internal.example.com",
        says: { about: "address", address: null },
      },
      {
        id: "resolver",
        claim: "10.96.0.10, the cluster nameserver, which the wildcard record points back at",
        says: { about: "address", address: "10.96.0.10" },
      },
    ],
    why:
      "Two dots is fewer than five, so the search list goes first. Three cluster domains return" +
      " NXDOMAIN. The fourth attempt is api.stripe.com.internal.example.com, and a wildcard" +
      " matches any name beneath its zone at any depth when no closer name exists, which RFC" +
      " 4592 spells out. The resolver gets a NOERROR answer with 10.0.0.1 and stops. The real" +
      " name is never asked for. The connection goes to the internal proxy, TLS fails on the" +
      " certificate name if it is checked, and if it is not checked the request is delivered to" +
      " the wrong host with no error anywhere.",
    fix:
      "never put a zone with a wildcard record in a search list, and never put a wildcard in a" +
      " zone that is in one. Audit search domains for wildcards with dig: a random label under" +
      " the zone that returns an address is a wildcard. Then fix the names with trailing dots or" +
      " ndots as in the earlier cases.",
    breaks: "that a search list can only add failed lookups, never wrong answers",
  },
  {
    slug: "four-thousand-a-second",
    name: "Four thousand a second",
    brief:
      "The checkout pod from the first case, under load: it opens 500 new connections a second" +
      " to api.stripe.com and its HTTP client does not cache DNS. The cluster resolver is a" +
      " CoreDNS deployment with two replicas.",
    setup: {
      name: "api.stripe.com",
      ndots: 5,
      search: CLUSTER,
      families: 2,
      glibc: "2.26+",
      records: { "api.stripe.com": STRIPE },
      wildcards: {},
      connectionsPerSecond: 500,
    },
    question: "How many NXDOMAIN responses per second does the cluster resolver serve for this one pod?",
    options: [
      {
        id: "four",
        claim: "4000 per second, eight NXDOMAINs for each of 500 connections",
        says: { about: "nxdomain-per-second", perSecond: 4000 },
      },
      {
        id: "five",
        claim: "500 per second, one failed lookup per connection",
        says: { about: "nxdomain-per-second", perSecond: 500 },
      },
      {
        id: "thousand",
        claim: "1000 per second, an A and an AAAA failure per connection",
        says: { about: "nxdomain-per-second", perSecond: 1000 },
      },
      {
        id: "all",
        claim: "5000 per second, every query this pod sends",
        says: { about: "nxdomain-per-second", perSecond: 5000 },
      },
    ],
    why:
      "Every connection costs ten queries of which eight are NXDOMAIN, so 500 connections a" +
      " second is 4000 NXDOMAINs a second from one pod, plus 1000 real queries. That load is" +
      " proportional to connections, not to distinct hostnames; a service that talks to one" +
      " external API can dominate a cluster's DNS traffic. CoreDNS answers NXDOMAIN cheaply but" +
      " not free, and every one of those has to be forwarded upstream first unless negative" +
      " caching holds it.",
    fix:
      "any one of the three earlier fixes removes 80 percent of this pod's DNS traffic. Also" +
      " check whether the client caches lookups at all; 500 connections a second to one host" +
      " should be a connection pool, which resolves once.",
    breaks: "that DNS load scales with the number of hostnames rather than the number of connections",
  },
  {
    slug: "ipv4-only",
    name: "IPv4 only",
    brief:
      "Same pod, same resolv.conf, same api.stripe.com, but this service is written in a" +
      " language whose runtime asks for IPv4 addresses only: getaddrinfo with AF_INET, or the old" +
      " gethostbyname.",
    setup: {
      name: "api.stripe.com",
      ndots: 5,
      search: CLUSTER,
      families: 1,
      glibc: "2.26+",
      records: { "api.stripe.com": STRIPE },
      wildcards: {},
      connectionsPerSecond: 0,
    },
    question: "How many queries does the same name cost from this program?",
    options: [
      {
        id: "ten",
        claim: "10 queries, because the address family does not change how the search list is walked",
        says: { about: "queries", count: 10 },
      },
      {
        id: "five",
        claim: "5 queries, one per name, because the AAAA half of each attempt is never sent",
        says: { about: "queries", count: 5 },
      },
      {
        id: "two",
        claim: "2 queries, because a program that asks for one family skips the search list",
        says: { about: "queries", count: 2 },
      },
      {
        id: "four",
        claim: "4 queries, one for each search domain, and the name as written is answered locally",
        says: { about: "queries", count: 4 },
      },
    ],
    why:
      "The search walk is identical: four search domains then the name as written, five" +
      " attempts. What changes is that each attempt is one query instead of two, because nothing" +
      " asks for an AAAA record. Five queries, four of them NXDOMAIN. The query count is a" +
      " property of the name, the resolv.conf, and the program together, and any one of the" +
      " three can double it.",
    fix:
      "do not use this as the fix. Asking for one address family to halve DNS traffic trades a" +
      " DNS problem for an IPv6 one. Fix the search walk instead.",
    breaks: "that the query count is a property of the name alone",
  },
];
