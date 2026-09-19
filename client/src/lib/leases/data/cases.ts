import type { Case } from "../types";

/**
 * Ten networks and what a lease does to each.
 *
 * Every duration is in seconds and every population is a whole number of
 * clients, because that is what the server hands out and what the log
 * counts. 3600 is an hour, 86400 a day, 2400 the forty minutes the first
 * case is named for.
 */

const HOUR = 3600;
const DAY = 86400;

/** An office with no transient population, so the pool is not in question. */
const office = { pool: 254, arrivalsPerHour: 0, away: 0 };

export const CASES: Case[] = [
  {
    slug: "forty-minutes-a-third",
    name: "Forty minutes, a third of the office",
    brief:
      "An office of 300 machines on one hour leases. The DHCP server, a VM, is rebooted for" +
      " patching and comes back forty minutes later. The helpdesk queue fills with people who" +
      " lost the network somewhere in the middle, and just as many who never noticed.",
    setup: { lease: HOUR, t1: null, t2: null, clients: 300, outage: 2400, ...office },
    question: "How many of the 300 lose their address before the server returns?",
    options: [
      {
        id: "none",
        claim: "0: a forty minute outage is shorter than the hour lease, so every lease outlasts it",
        says: { about: "clients-lost", count: 0 },
      },
      {
        id: "third",
        claim: "100: every client whose remaining lease was under forty minutes, which is a third of them",
        says: { about: "clients-lost", count: 100 },
      },
      {
        id: "twothirds",
        claim: "200: everyone past their renewal timer, which is two thirds of the room at any moment",
        says: { about: "clients-lost", count: 200 },
      },
      {
        id: "all",
        claim: "300: with the server unreachable, no client can renew and all of them expire",
        says: { about: "clients-lost", count: 300 },
      },
    ],
    why:
      "A client that renewed at T1, half an hour into its lease, has a fresh hour. So while the" +
      " server is up every client has between thirty and sixty minutes remaining, spread evenly" +
      " across the room. Forty minutes of silence catches exactly the ones with under forty" +
      " minutes left: the band from thirty to forty out of the band from thirty to sixty, one" +
      " third. The other two hundred renewed at T1 as usual once the server was back, and never" +
      " knew.",
    fix:
      "size the lease against the longest outage you intend to survive: with the default T1 at" +
      " half the lease, a lease of twice the outage loses nobody. Or set T1 short and the lease" +
      " long, which is the next case but one.",
    breaks: "that a DHCP outage shorter than the lease is harmless",
  },
  {
    slug: "a-day-lease-two-hours-dark",
    name: "A day lease, two hours dark",
    brief:
      "Same office, but the leases are twenty four hours. A storage failure takes the DHCP" +
      " server out for two hours in the middle of the working day.",
    setup: { lease: DAY, t1: null, t2: null, clients: 300, outage: 7200, ...office },
    question: "How many of the 300 lose their address?",
    options: [
      {
        id: "twentyfive",
        claim: "25: two hours is a twelfth of a day, so a twelfth of the room",
        says: { about: "clients-lost", count: 25 },
      },
      {
        id: "all",
        claim: "300: DHCP is down, so the network is down",
        says: { about: "clients-lost", count: 300 },
      },
      {
        id: "none",
        claim: "0: every renewing client has at least twelve hours remaining, and two is less than twelve",
        says: { about: "clients-lost", count: 0 },
      },
      {
        id: "half",
        claim: "150: the half of the room that was past T1 when the server went away",
        says: { about: "clients-lost", count: 150 },
      },
    ],
    why:
      "With a day lease and T1 at half, no renewing client ever holds less than twelve hours." +
      " Two hours of outage is inside that margin for every one of them. The clients past T1" +
      " tried to renew, got no answer, kept the address, and retried; the server was back long" +
      " before any of them reached T2, let alone expiry. Nobody noticed, which is the point of" +
      " a lease: it is a promise that outlives the server that made it.",
    fix:
      "nothing, for the outage. A day lease is a good default for machines that come back to" +
      " the same desk. The cost is the pool, which the later cases are about.",
    breaks: "that the DHCP server going down takes the network down with it",
  },
  {
    slug: "ten-minute-leases",
    name: "Ten minute leases",
    brief:
      "A lab network where someone set the lease to ten minutes so that addresses would recycle" +
      " fast between experiments. The DHCP container restarts and takes eight minutes to come" +
      " back because it waits on a database. 300 clients.",
    setup: { lease: 600, t1: null, t2: null, clients: 300, outage: 480, ...office },
    question: "How many of the 300 lose their address?",
    options: [
      {
        id: "most",
        claim: "180: everyone whose remaining time was under eight minutes, which is three fifths of a room whose leases run from five to ten",
        says: { about: "clients-lost", count: 180 },
      },
      {
        id: "none",
        claim: "0: eight minutes is less than the ten minute lease",
        says: { about: "clients-lost", count: 0 },
      },
      {
        id: "fifth",
        claim: "60: the fifth of the room past the eight minute mark",
        says: { about: "clients-lost", count: 60 },
      },
      {
        id: "all",
        claim: "300: with a lease that short, everyone expires during an eight minute gap",
        says: { about: "clients-lost", count: 300 },
      },
    ],
    why:
      "T1 is five minutes, so a renewing client holds between five and ten minutes at any" +
      " instant. Eight minutes of silence catches everyone with under eight left: the band from" +
      " five to eight, three fifths of the room. Not everyone, because the clients that had just" +
      " renewed still had nine or ten minutes and the server made it back. A short lease buys" +
      " fast recycling and pays for it in exactly this way.",
    fix:
      "if the lease has to be short, the server has to be highly available, or the restart has" +
      " to be faster than half the lease. Eight minutes on a ten minute lease is neither.",
    breaks: "that a short lease costs nothing but renewal traffic",
  },
  {
    slug: "when-it-first-asks",
    name: "When it first asks",
    brief:
      "A laptop joins the office network and is granted 10.20.30.117 with a one hour lease, no" +
      " renewal or rebinding options set by the server. The server is up the whole time.",
    setup: { lease: HOUR, t1: null, t2: null, clients: 1, outage: 0, ...office },
    question: "How long after the grant does the laptop first try to renew?",
    options: [
      {
        id: "expiry",
        claim: "3600 seconds, when the lease runs out and it has to ask again",
        says: { about: "first-renewal-at", seconds: 3600 },
      },
      {
        id: "half",
        claim: "1800 seconds, at T1, which defaults to half the lease, by unicast to the server that granted it",
        says: { about: "first-renewal-at", seconds: 1800 },
      },
      {
        id: "seven",
        claim: "3150 seconds, at seven eighths of the lease, leaving a margin before expiry",
        says: { about: "first-renewal-at", seconds: 3150 },
      },
      {
        id: "minute",
        claim: "60 seconds, then every minute, so the server always knows it is there",
        says: { about: "first-renewal-at", seconds: 60 },
      },
    ],
    why:
      "RFC 2131 gives every lease two timers. T1 is when the client starts trying to extend the" +
      " lease it has, by unicast to the server it got it from, and it defaults to half the lease." +
      " A one hour lease renews at thirty minutes, and if the server answers, the clock resets to" +
      " a full hour from that moment. This is why a room of renewing clients never holds less" +
      " than half a lease, and why half the lease is the outage it can absorb.",
    fix:
      "nothing. This is the timer working. A server can move T1 with option 58, which is what" +
      " a later case does on purpose.",
    breaks: "that a client waits for the lease to run out before renewing",
  },
  {
    slug: "when-it-shouts",
    name: "When it shouts",
    brief:
      "The same laptop, the same one hour lease, but this time the server that granted it has" +
      " been switched off and will not be back. Nothing else on the network has changed.",
    setup: { lease: HOUR, t1: null, t2: null, clients: 1, outage: 3600, ...office },
    question: "How long after the grant does the laptop stop unicasting the dead server and broadcast instead?",
    options: [
      {
        id: "t1",
        claim: "1800 seconds: the first renewal gets no answer, so it broadcasts immediately",
        says: { about: "broadcasts-at", seconds: 1800 },
      },
      {
        id: "expiry",
        claim: "3600 seconds: only once the lease has expired does it look for another server",
        says: { about: "broadcasts-at", seconds: 3600 },
      },
      {
        id: "threequarters",
        claim: "2700 seconds, three quarters of the way through",
        says: { about: "broadcasts-at", seconds: 2700 },
      },
      {
        id: "t2",
        claim: "3150 seconds, at T2, seven eighths of the lease, when it gives up on that server and asks any server",
        says: { about: "broadcasts-at", seconds: 3150 },
      },
    ],
    why:
      "T2 defaults to seven eighths of the lease, 3150 seconds of 3600. Between T1 and T2 the" +
      " client keeps unicasting the server it knows, on a backoff, because that server might be" +
      " briefly away. At T2 it broadcasts a DHCPREQUEST for the same address to any server that" +
      " will hear it. If a second server holds the same pool, that is the moment it takes over," +
      " with 450 seconds to spare. If nothing answers, the address is given up at 3600.",
    fix:
      "if there is a second DHCP server, T2 is when it earns its keep; the window between T2" +
      " and expiry is the time it has to answer. If there is not, nothing here matters and the" +
      " lease length is the whole story.",
    breaks: "that a client keeps asking the server it knows until the lease ends",
  },
  {
    slug: "renew-every-five-minutes",
    name: "Renew every five minutes",
    brief:
      "The office from the first case, one hour leases, but the server now sets option 58 to" +
      " 300 seconds so clients renew every five minutes. The same forty minute reboot happens.",
    setup: { lease: HOUR, t1: 300, t2: null, clients: 300, outage: 2400, ...office },
    question: "How many of the 300 lose their address this time?",
    options: [
      {
        id: "none",
        claim: "0: a client that renews every five minutes always holds at least fifty five, and forty is less than fifty five",
        says: { about: "clients-lost", count: 0 },
      },
      {
        id: "third",
        claim: "100: the same third as before, because the lease is the same hour",
        says: { about: "clients-lost", count: 100 },
      },
      {
        id: "ninth",
        claim: "33: a ninth, because the renewal window is now a twelfth of the lease",
        says: { about: "clients-lost", count: 33 },
      },
      {
        id: "all",
        claim: "300: renewing every five minutes means every client notices the outage within five minutes",
        says: { about: "clients-lost", count: 300 },
      },
    ],
    why:
      "What the room can survive is the lease less T1: the least a renewing client ever has in" +
      " hand. With T1 at 300 seconds and the lease at 3600, that is 3300 seconds, fifty five" +
      " minutes. Forty minutes of outage is inside it for everyone. The lease did not change; the" +
      " renewal timer did, and the renewal timer is what sets the margin. Every client did notice" +
      " within five minutes, and noticing is not losing.",
    fix:
      "set T1 low and the lease long when the server is the thing you expect to lose. The cost" +
      " is renewal traffic, twelve unicasts an hour per client, which a server handles without" +
      " noticing.",
    breaks: "that outage tolerance is set by the lease length",
  },
  {
    slug: "the-pool-ran-out",
    name: "The pool ran out",
    brief:
      "A coffee shop with a /24 guest network: 200 addresses in the pool, a twenty four hour" +
      " lease copied from the office template, and about forty new devices walking in every" +
      " hour from opening. Nobody stays more than an hour.",
    setup: { lease: DAY, t1: null, t2: null, clients: 0, outage: 0, pool: 200, arrivalsPerHour: 40, away: 0 },
    question: "How long after opening does the pool have no free address?",
    options: [
      {
        id: "never",
        claim: "Never: nobody stays more than an hour, so at most forty addresses are in use",
        says: { about: "exhausts-after", seconds: null },
      },
      {
        id: "day",
        claim: "86400 seconds, a day, when the first leases start to expire",
        says: { about: "exhausts-after", seconds: 86400 },
      },
      {
        id: "five",
        claim: "18000 seconds, five hours: forty an hour into two hundred, and not one address has come back yet",
        says: { about: "exhausts-after", seconds: 18000 },
      },
      {
        id: "half",
        claim: "1800 seconds, once the first renewals start doubling up",
        says: { about: "exhausts-after", seconds: 1800 },
      },
    ],
    why:
      "The server cannot see a device leave. An address handed out at 09:00 is unavailable" +
      " until 09:00 tomorrow whether the phone is still in the building or across town. So the" +
      " pool drains at the arrival rate, forty an hour, and nothing refills it for a day. Two" +
      " hundred addresses at forty an hour is five hours. At steady state this network wants" +
      " forty times twenty four, 960 addresses, for a room that never holds more than forty" +
      " devices.",
    fix:
      "shorten the lease to the time a device actually stays. The next case does that on the" +
      " same pool. A bigger pool is the wrong fix; 960 is four /24s for forty phones.",
    breaks: "that a pool is sized to the devices present at once",
  },
  {
    slug: "two-hour-leases-same-shop",
    name: "Two hour leases, same shop",
    brief:
      "The same coffee shop, the same 200 address pool and forty arrivals an hour, after the" +
      " lease is cut to two hours.",
    setup: { lease: 2 * HOUR, t1: null, t2: null, clients: 0, outage: 0, pool: 200, arrivalsPerHour: 40, away: 0 },
    question: "How many addresses are in use at steady state?",
    options: [
      {
        id: "still",
        claim: "960: the arrival rate has not changed, so neither has the demand",
        says: { about: "concurrent", count: 960 },
      },
      {
        id: "full",
        claim: "200: the pool still fills, just more slowly",
        says: { about: "concurrent", count: 200 },
      },
      {
        id: "present",
        claim: "40: the number of devices actually in the room",
        says: { about: "concurrent", count: 40 },
      },
      {
        id: "eighty",
        claim: "80: forty arrivals an hour, each holding an address for two hours, whether or not they stayed",
        says: { about: "concurrent", count: 80 },
      },
    ],
    why:
      "Addresses in use equal arrivals per hour times lease hours: forty times two. Eighty of" +
      " two hundred, with more than half the pool free at all times, and every address that is" +
      " held comes back within two hours. This is Little's law and it does not care how many" +
      " devices are physically present; it cares how long the server is obliged to remember each" +
      " one.",
    fix:
      "set guest leases to roughly the visit length, and office leases to roughly the day. The" +
      " same server can do both; the lease is per pool, not per server.",
    breaks: "that the fix for an exhausted pool is more addresses",
  },
  {
    slug: "the-printer-came-back",
    name: "The printer came back",
    brief:
      "An office printer on the staff VLAN, addressed by DHCP with no reservation, on a day" +
      " lease. The pool is 254 addresses and about twelve new or returning devices appear every" +
      " hour. The printer is unplugged on Friday afternoon for a desk move and plugged back in on" +
      " Monday afternoon, three days later.",
    setup: { lease: DAY, t1: null, t2: null, clients: 0, outage: 0, pool: 254, arrivalsPerHour: 12, away: 3 * DAY },
    question: "What address does the printer come back with?",
    options: [
      {
        id: "same",
        claim: "The same one: the server remembers the MAC address and hands the old binding back",
        says: { about: "keeps-address", value: true },
      },
      {
        id: "new",
        claim: "A different one: its lease expired two days ago and, with 288 addresses wanted from a pool of 254, the old one has been given to something else",
        says: { about: "keeps-address", value: false },
      },
      {
        id: "linklocal",
        claim: "A link local address from 169.254.0.0/16, because the server refuses a client whose lease lapsed",
        says: { about: "nothing" },
      },
      {
        id: "none",
        claim: "No address: the pool is full and it has to wait for a lease to expire",
        says: { about: "nothing" },
      },
    ],
    why:
      "A server does prefer to give a returning client its previous address, and it does so" +
      " when that address is still free. This one was not. Twelve arrivals an hour on a day" +
      " lease is 288 addresses wanted at steady state from a pool of 254, so the pool is under" +
      " pressure and expired bindings are reused within hours. Three days away on a one day" +
      " lease is two days expired. Everything that had the printer's old address written down," +
      " every print queue on every desktop, now points at whatever took it.",
    fix:
      "anything that other things address by IP gets a reservation or a static address. A" +
      " lease is a promise to a client, not to the things that talk to it.",
    breaks: "that a device gets its old address back when it returns",
  },
  {
    slug: "the-infinite-lease",
    name: "The infinite lease",
    brief:
      "A well meaning administrator, tired of the printer case, sets the staff pool's lease" +
      " time to infinite so that nothing ever changes address again. Same /24, 254 addresses," +
      " twelve arrivals an hour.",
    setup: { lease: "infinite", t1: null, t2: null, clients: 0, outage: 0, pool: 254, arrivalsPerHour: 12, away: 0 },
    question: "How many addresses come back to the pool per day?",
    options: [
      {
        id: "arrivals",
        claim: "288, matching the arrivals, once the pool has filled and reached steady state",
        says: { about: "recovered-per-day", count: 288 },
      },
      {
        id: "pool",
        claim: "254, the whole pool, because an infinite lease is renewed daily like any other",
        says: { about: "recovered-per-day", count: 254 },
      },
      {
        id: "hourly",
        claim: "12 an hour, so 288 a day, as devices leave",
        says: { about: "recovered-per-day", count: 12 },
      },
      {
        id: "none",
        claim: "0: an infinite lease has no T1, no T2 and no expiry, so an address once given is never returned",
        says: { about: "recovered-per-day", count: 0 },
      },
    ],
    why:
      "RFC 2131 defines the all ones lease time as infinite, and an infinite lease has no" +
      " timers at all. Nothing ever renews, nothing ever expires, and every device that has ever" +
      " appeared holds its address until someone deletes the binding by hand. At twelve new" +
      " devices an hour the pool is gone in about twenty one hours and stays gone. The printer" +
      " problem was that a lease expired; the infinite lease fixes it by making every device a" +
      " printer.",
    fix:
      "reservations for the things that need a fixed address, and a finite lease for everything" +
      " else. Infinite leases belong on networks where the set of devices never changes, which" +
      " is almost none of them.",
    breaks: "that a longer lease is always safer",
  },
];
