/**
 * Eight faults in a packet filter, each with the ruleset that has it.
 *
 * The expectations are the specification, and they are also the marking
 * scheme: a exercise is solved when every listed packet gets the verdict it
 * should. That shape is deliberate. A predicate that checks "did they add a
 * rule containing --dport 22" marks the shape of an answer rather than its
 * effect, and it fails the reader who found a better one. Checking behaviour
 * accepts any ruleset that works, which is the only fair thing to check.
 *
 * Each carries a solution CI replays, and CI also asserts the starting
 * ruleset is NOT solved. Without that second half an exercise that was
 * already correct would sit there passing forever.
 */

import type { Action, Packet } from "../types";

export type Difficulty = "easy" | "medium" | "hard";

export interface Expectation {
  label: string;
  packet: Packet;
  expect: Action;
}

export interface Exercise {
  slug: string;
  title: string;
  difficulty: Difficulty;
  tagline: string;
  brief: string[];
  /** The ruleset as the reader finds it. */
  start: string;
  expectations: Expectation[];
  hints: string[];
  /** A ruleset that satisfies every expectation. Replayed by CI, never shown until asked. */
  solution: string;
  debrief: string[];
}

const tcp = (
  src: string,
  dst: string,
  dport: number,
  state: Packet["state"] = "NEW",
  iface = "eth0",
  sport = 51000,
): Packet => ({ proto: "tcp", src, dst, sport, dport, state, iface });

export const EXERCISES: Exercise[] = [
  {
    slug: "the-rule-below",
    title: "The Rule Below",
    difficulty: "easy",
    tagline: "SSH from the office is refused, and the rule that allows it is right there.",
    brief: [
      "The office can no longer reach the server over SSH. Someone added a rule to stop SSH from the internet, and the rule allowing the office is still in the file, spelled correctly.",
      "Fix it without removing either intention: the office keeps SSH, the internet does not get it.",
    ],
    start: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 22 -j DROP
-A INPUT -p tcp --dport 22 -s 10.10.0.0/16 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    expectations: [
      { label: "Office SSH gets in", packet: tcp("10.10.4.19", "10.10.1.5", 22), expect: "ACCEPT" },
      {
        label: "Internet SSH does not",
        packet: tcp("203.0.113.7", "10.10.1.5", 22),
        expect: "DROP",
      },
      { label: "HTTPS still works", packet: tcp("203.0.113.7", "10.10.1.5", 443), expect: "ACCEPT" },
    ],
    hints: [
      "Trace the office packet and read every step, not just the verdict.",
      "Both SSH rules match that packet. Only one of them runs.",
      "Nothing needs rewriting. Two lines need to swap.",
    ],
    solution: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 22 -s 10.10.0.0/16 -j ACCEPT
-A INPUT -p tcp --dport 22 -j DROP
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    debrief: [
      "Evaluation stops at the first match. The office packet matched the DROP on line three and never reached the ACCEPT on line four, which is why the allow rule looked correct and did nothing.",
      "The general shape is specific first, general last. Every exception has to sit above the rule it is an exception to, and a chain read top to bottom should get narrower as it goes.",
      "This is the single most common firewall fault there is, and no interface shows it to you. iptables -L -v gives you per-rule counters, so you can see that a rule fired, but not which packet it stole or which rule was hoping for it.",
    ],
  },
  {
    slug: "the-missing-prefix",
    title: "The Missing Prefix",
    difficulty: "easy",
    tagline: "One host in the subnet can reach the database. The other four hundred cannot.",
    brief: [
      "The application subnet is 10.20.0.0/16. The rule meant to let it reach Postgres was written without a prefix length.",
      "One machine works. Make the subnet work, and keep everything outside it out.",
    ],
    start: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 5432 -s 10.20.0.0 -j ACCEPT`,
    expectations: [
      {
        label: "10.20.0.0 reaches Postgres",
        packet: tcp("10.20.0.0", "10.30.0.9", 5432),
        expect: "ACCEPT",
      },
      {
        label: "10.20.7.31 reaches Postgres",
        packet: tcp("10.20.7.31", "10.30.0.9", 5432),
        expect: "ACCEPT",
      },
      {
        label: "10.21.0.4 does not",
        packet: tcp("10.21.0.4", "10.30.0.9", 5432),
        expect: "DROP",
      },
      {
        label: "The internet does not",
        packet: tcp("198.51.100.6", "10.30.0.9", 5432),
        expect: "DROP",
      },
    ],
    hints: [
      "Trace 10.20.7.31 and look at what -s reports.",
      "An address with no prefix is not a network.",
      "iptables reads a bare address as /32.",
    ],
    solution: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 5432 -s 10.20.0.0/16 -j ACCEPT`,
    debrief: [
      "A bare address in -s is /32, one host. The rule was doing exactly what it said, and what it said was not what the author meant.",
      "It survives review because 10.20.0.0 reads as a network to a human. It is the network address, and it is also a perfectly good host address as far as a prefix match is concerned. The one machine that happened to hold it worked, which is the worst possible outcome: the rule appeared to function.",
      "The habit worth building is writing the prefix always, even /32. A rule that says -s 10.20.0.5/32 tells the next reader you meant one host.",
    ],
  },
  {
    slug: "the-policy-nobody-set",
    title: "The Policy Nobody Set",
    difficulty: "easy",
    tagline: "Three services are allowed. Everything else is allowed too.",
    brief: [
      "This chain lists exactly the three services the host is supposed to expose. A port scan came back with a great deal more than three.",
      "Close the host down to what the rules describe.",
    ],
    start: `-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 22 -s 10.10.0.0/16 -j ACCEPT
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    expectations: [
      { label: "HTTP is allowed", packet: tcp("198.51.100.4", "10.30.0.2", 80), expect: "ACCEPT" },
      {
        label: "Office SSH is allowed",
        packet: tcp("10.10.9.2", "10.30.0.2", 22),
        expect: "ACCEPT",
      },
      {
        label: "Redis is not exposed",
        packet: tcp("198.51.100.4", "10.30.0.2", 6379),
        expect: "DROP",
      },
      {
        label: "The admin panel is not exposed",
        packet: tcp("198.51.100.4", "10.30.0.2", 8080),
        expect: "DROP",
      },
    ],
    hints: [
      "Trace the Redis packet. Which rule decided it?",
      "None of them did.",
      "A chain with no policy set has one anyway.",
    ],
    solution: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 22 -s 10.10.0.0/16 -j ACCEPT
-A INPUT -p tcp --dport 80 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    debrief: [
      "A chain's default policy is ACCEPT until you say otherwise, so a list of allow rules with nothing at the end is a list of things that were going to be allowed regardless.",
      "The failure is quiet in the most dangerous way: everything in the list works, so the ruleset looks correct in every test anyone thinks to run. What is missing only shows up in a scan, or in an incident.",
      "Some people prefer a final -A INPUT -j DROP over -P INPUT DROP. Either closes this. The difference is that a policy still applies if the rules are flushed halfway through a script, and a final rule does not.",
    ],
  },
  {
    slug: "no-way-back",
    title: "No Way Back",
    difficulty: "medium",
    tagline: "The server can open connections. Nothing ever comes back.",
    brief: [
      "This host makes outbound calls to an API and pulls packages. Neither works: the requests leave and the replies never arrive.",
      "The INPUT chain is the whole problem. Let the replies in without opening anything new.",
    ],
    start: `-P INPUT DROP
-A INPUT -p tcp --dport 22 -s 10.10.0.0/16 -j ACCEPT`,
    expectations: [
      {
        label: "The reply to an outbound call arrives",
        packet: {
          proto: "tcp",
          src: "198.51.100.30",
          dst: "10.30.0.2",
          sport: 443,
          dport: 51000,
          state: "ESTABLISHED",
          iface: "eth0",
        },
        expect: "ACCEPT",
      },
      {
        label: "Office SSH still works",
        packet: tcp("10.10.9.2", "10.30.0.2", 22),
        expect: "ACCEPT",
      },
      {
        label: "A new inbound connection is still refused",
        packet: tcp("198.51.100.30", "10.30.0.2", 8080),
        expect: "DROP",
      },
      {
        label: "A packet conntrack calls INVALID is refused",
        packet: {
          proto: "tcp",
          src: "198.51.100.30",
          dst: "10.30.0.2",
          sport: 443,
          dport: 51000,
          state: "INVALID",
          iface: "eth0",
        },
        expect: "DROP",
      },
    ],
    hints: [
      "A reply is inbound. It arrives on INPUT like anything else.",
      "You cannot allow it by port: the local port is ephemeral and different every time.",
      "conntrack knows this packet belongs to a connection you started.",
    ],
    solution: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 22 -s 10.10.0.0/16 -j ACCEPT`,
    debrief: [
      "A default-drop INPUT chain blocks replies, because a reply is an inbound packet and the chain does not know or care that you asked for it. Something has to say so.",
      "Matching by port cannot work. The local end of an outbound connection is an ephemeral port chosen at connect time, so allowing it means allowing the whole ephemeral range inbound, which is most of the port space.",
      "ESTABLISHED means conntrack has seen this flow in both directions. RELATED is the one people leave out: it covers a new connection that belongs to an existing one, which is how active FTP data channels and several ICMP errors get back in.",
      "Note the INVALID case. Accepting ESTABLISHED,RELATED does not accept INVALID, and it should not: a packet conntrack cannot place is usually a scan or a fragment of something that timed out.",
    ],
  },
  {
    slug: "the-range-was-generous",
    title: "The Range Was Generous",
    difficulty: "medium",
    tagline: "A rule for the media ports also opened the database.",
    brief: [
      "A streaming service needs UDP 30000 to 30100 from anywhere. Whoever added it wrote the range wide enough to cover the ephemeral ports as well, and did it for TCP too.",
      "MySQL is now reachable from the internet. Narrow the rule to what the service actually needs.",
    ],
    start: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p udp --dport 1024:65535 -j ACCEPT
-A INPUT -p tcp --dport 1024:65535 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    expectations: [
      {
        label: "Media traffic gets in",
        packet: {
          proto: "udp",
          src: "203.0.113.44",
          dst: "10.30.0.2",
          sport: 40000,
          dport: 30050,
          state: "NEW",
          iface: "eth0",
        },
        expect: "ACCEPT",
      },
      {
        label: "The bottom of the range works",
        packet: {
          proto: "udp",
          src: "203.0.113.44",
          dst: "10.30.0.2",
          sport: 40000,
          dport: 30000,
          state: "NEW",
          iface: "eth0",
        },
        expect: "ACCEPT",
      },
      {
        label: "The top of the range works",
        packet: {
          proto: "udp",
          src: "203.0.113.44",
          dst: "10.30.0.2",
          sport: 40000,
          dport: 30100,
          state: "NEW",
          iface: "eth0",
        },
        expect: "ACCEPT",
      },
      {
        label: "MySQL is closed",
        packet: tcp("203.0.113.44", "10.30.0.2", 3306),
        expect: "DROP",
      },
      {
        label: "The admin panel is closed",
        packet: tcp("203.0.113.44", "10.30.0.2", 8080),
        expect: "DROP",
      },
      { label: "HTTPS still works", packet: tcp("203.0.113.44", "10.30.0.2", 443), expect: "ACCEPT" },
    ],
    hints: [
      "Two rules here open the high ports. The service only asked for one protocol.",
      "A range in iptables is written low:high and both ends are inclusive.",
      "30000:30100 is 101 ports, and that is all the service needs.",
    ],
    solution: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p udp --dport 30000:30100 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    debrief: [
      "The TCP copy of the rule was the expensive one. The service is UDP; the TCP line was added by symmetry and it opened every service on the host above 1024, which is nearly all of them.",
      "Ranges are inclusive at both ends. 30000:30100 is 101 ports, not 100, and a service documented as needing 30000 to 30100 needs exactly that.",
      "Replies to outbound connections do not need the ephemeral range opened, which is the reasoning that usually produces a rule like this one. The conntrack rule at the top already handles them.",
    ],
  },
  {
    slug: "monitoring-cannot-ping",
    title: "Monitoring Cannot Ping",
    difficulty: "medium",
    tagline: "ICMP is blocked wholesale, and the monitoring host needs it.",
    brief: [
      "Someone dropped all ICMP after reading that ping is a security risk. The monitoring host at 10.40.0.8 now reports every server as down, and path MTU discovery has quietly stopped working for everyone.",
      "Let the monitoring host through, and let the ICMP that belongs to existing connections through, while leaving the internet without a ping.",
    ],
    start: `-P INPUT DROP
-A INPUT -p icmp -j DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    expectations: [
      {
        label: "Monitoring can ping",
        packet: {
          proto: "icmp",
          src: "10.40.0.8",
          dst: "10.30.0.2",
          state: "NEW",
          iface: "eth0",
        },
        expect: "ACCEPT",
      },
      {
        label: "A related ICMP error gets through",
        packet: {
          proto: "icmp",
          src: "198.51.100.9",
          dst: "10.30.0.2",
          state: "RELATED",
          iface: "eth0",
        },
        expect: "ACCEPT",
      },
      {
        label: "The internet cannot ping",
        packet: {
          proto: "icmp",
          src: "203.0.113.9",
          dst: "10.30.0.2",
          state: "NEW",
          iface: "eth0",
        },
        expect: "DROP",
      },
      { label: "HTTPS still works", packet: tcp("203.0.113.9", "10.30.0.2", 443), expect: "ACCEPT" },
    ],
    hints: [
      "The ICMP drop is above the conntrack rule, so it catches RELATED errors too.",
      "Order decides both problems here.",
      "One line moves, one line is added.",
    ],
    solution: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p icmp -s 10.40.0.8/32 -j ACCEPT
-A INPUT -p icmp -j DROP
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    debrief: [
      "Dropping ICMP wholesale breaks more than ping. Fragmentation needed messages are ICMP, and without them path MTU discovery fails silently: connections establish, small requests work, and anything large hangs. It is one of the classic hard-to-diagnose outages.",
      "The blanket drop sat above the conntrack rule, so it also caught the RELATED errors that belong to connections this host opened itself. Moving conntrack to the top fixes that on its own.",
      "The monitoring exception then goes above the remaining drop, because specific comes before general.",
    ],
  },
  {
    slug: "the-exclamation-mark",
    title: "The Exclamation Mark",
    difficulty: "hard",
    tagline: "A rule meant to keep outsiders out lets them all in.",
    brief: [
      "The intention was: anything not from the internal network should be refused. What was written accepts it instead.",
      "Make the chain do what the comment says. Internal reaches the service, nothing else does, and replies still work.",
    ],
    start: `-P INPUT ACCEPT
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# anything not internal should not be here
-A INPUT ! -s 10.0.0.0/8 -j ACCEPT
-A INPUT -p tcp --dport 8443 -s 10.0.0.0/8 -j ACCEPT`,
    expectations: [
      {
        label: "Internal reaches the service",
        packet: tcp("10.50.2.9", "10.30.0.2", 8443),
        expect: "ACCEPT",
      },
      {
        label: "The internet does not reach the service",
        packet: tcp("203.0.113.11", "10.30.0.2", 8443),
        expect: "DROP",
      },
      {
        label: "The internet reaches nothing else either",
        packet: tcp("203.0.113.11", "10.30.0.2", 22),
        expect: "DROP",
      },
      {
        label: "Replies to outbound calls still arrive",
        packet: {
          proto: "tcp",
          src: "198.51.100.30",
          dst: "10.30.0.2",
          sport: 443,
          dport: 51000,
          state: "ESTABLISHED",
          iface: "eth0",
        },
        expect: "ACCEPT",
      },
      {
        label: "Internal traffic to another port is not silently allowed",
        packet: tcp("10.50.2.9", "10.30.0.2", 9999),
        expect: "DROP",
      },
    ],
    hints: [
      "Read the negated rule out loud with its target: if the source is not internal, then accept.",
      "The policy is ACCEPT as well, which is doing damage of its own.",
      "There are two ways to write the fix. Either negate and DROP, or drop the negation and let the policy catch the rest.",
    ],
    solution: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 8443 -s 10.0.0.0/8 -j ACCEPT`,
    debrief: [
      "The negation was correct and the target was not. ! -s 10.0.0.0/8 -j ACCEPT reads as: if the source is not internal, accept it, which is the exact opposite of the comment above it.",
      "Negated matches are worth being careful with generally, because they read naturally in English and invert awkwardly in a chain. ! -s X -j DROP and -s X -j ACCEPT followed by a drop look equivalent and behave differently the moment a second rule is involved.",
      "The simplest fix removes the negated rule entirely. With a DROP policy, anything the allow rules do not cover is already refused, and a rule that says so adds a line that can be got wrong.",
      "The ACCEPT policy was the second half of the fault. Even with the negated rule fixed, a chain that ends in ACCEPT allows everything it did not consider.",
    ],
  },
  {
    slug: "management-only",
    title: "Management Only",
    difficulty: "hard",
    tagline: "The admin interface is on both networks, and it should be on one.",
    brief: [
      "This host has two interfaces: eth0 faces the campus and eth1 is the management network. The admin panel on 8443 and SSH should be reachable on eth1 only.",
      "At the moment both are open on both, and the campus can reach the management addresses by routing to them. Close it to eth1 without breaking the public service on 443.",
    ],
    start: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -p tcp --dport 22 -j ACCEPT
-A INPUT -p tcp --dport 8443 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    expectations: [
      {
        label: "SSH on the management interface",
        packet: tcp("10.60.0.4", "10.60.0.2", 22, "NEW", "eth1"),
        expect: "ACCEPT",
      },
      {
        label: "Admin panel on the management interface",
        packet: tcp("10.60.0.4", "10.60.0.2", 8443, "NEW", "eth1"),
        expect: "ACCEPT",
      },
      {
        label: "SSH from the campus is refused",
        packet: tcp("10.10.7.7", "10.30.0.2", 22, "NEW", "eth0"),
        expect: "DROP",
      },
      {
        label: "Admin panel from the campus is refused",
        packet: tcp("10.10.7.7", "10.30.0.2", 8443, "NEW", "eth0"),
        expect: "DROP",
      },
      {
        label: "The public service still works on eth0",
        packet: tcp("203.0.113.20", "10.30.0.2", 443, "NEW", "eth0"),
        expect: "ACCEPT",
      },
      {
        label: "The public service also works on eth1",
        packet: tcp("10.60.0.4", "10.60.0.2", 443, "NEW", "eth1"),
        expect: "ACCEPT",
      },
    ],
    hints: [
      "Filtering by source address does not do this: the campus can route to a management address.",
      "The INPUT chain knows which interface a packet arrived on.",
      "-i takes an interface name and matches the one the packet came in on.",
    ],
    solution: `-P INPUT DROP
-A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
-A INPUT -i eth1 -p tcp --dport 22 -j ACCEPT
-A INPUT -i eth1 -p tcp --dport 8443 -j ACCEPT
-A INPUT -p tcp --dport 443 -j ACCEPT`,
    debrief: [
      "Binding a service to a management address is not the same as restricting it to a management network. A campus host with a route to 10.60.0.0/24 reaches the address regardless of which interface the operator was thinking of.",
      "-i matches the interface a packet actually arrived on, which is a property of the packet rather than of anyone's intention. That is why it is the right control here.",
      "-i is only available in INPUT, FORWARD and PREROUTING, because those are the only points where the kernel still knows the arrival interface. In OUTPUT the packet has not been routed yet, and -o is what you want there.",
    ],
  },
];

export const EXERCISE_ORDER: Difficulty[] = ["easy", "medium", "hard"];
