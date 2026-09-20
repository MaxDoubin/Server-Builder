import type { Case } from "../types";

/**
 * Ten sets of listeners, and where the connections go.
 *
 * Every answer comes from the model, and the gate recomputes each of them by
 * hashing a few thousand imagined four tuples across the listener set and
 * counting, rather than by dividing the connection count a second time.
 *
 * The first two are the same four workers before and after one of them exits,
 * because the whole surface is that the spread stays even and the routing does
 * not stay put.
 */
export const CASES: Case[] = [
  {
    slug: "four-workers-one-port",
    name: "Four workers, one port",
    brief:
      "A web server is rewritten to run four worker processes, each with its own listening socket on port 8080, rather than one process accepting and handing work to threads. Every worker sets SO_REUSEPORT before it binds.",
    setup: { host: "edge-01", job: "four workers", port: 8080, reusePort: true, before: 4, change: "nothing", connections: 400 },
    question: "Four hundred connections arrive. How many does each worker get?",
    options: [
      { id: "even", claim: "100 each. The kernel picks a listener per connection rather than waking them all, and over four hundred connections that comes out even", says: { about: "each", value: 100 } },
      { id: "all", claim: "400 to the first one that called accept, because that is how a shared listening socket behaves", says: { about: "each", value: 400 } },
      { id: "none", claim: "None of them bind, because two sockets cannot hold the same port", says: { about: "binds", value: false } },
      { id: "nothing", claim: "It depends which worker is idle at the moment the connection arrives", says: { about: "nothing" } },
    ],
    why:
      "Measured: 400 connections over four listeners came out 107, 99, 97 and 97, and a second run of the same 400 gave 90, 97, 103 and 110. The kernel is not waking every listener and letting them race, which is what a shared socket does and what the thundering herd is. It chooses one, by hashing the connection.",
    fix:
      "This is the arrangement to use for a multi process server. It removes the accept lock and the herd in one option, and the next nine cases are about the part of it that is not advertised.",
    breaks: "two processes cannot listen on the same port",
  },
  {
    slug: "and-then-one-exits",
    name: "And then one exits",
    brief:
      "The same four workers. One of them is killed by the out of memory killer. Four hundred more connections arrive afterwards.",
    setup: { host: "edge-01", job: "four workers", port: 8080, reusePort: true, before: 4, change: "one left", connections: 400 },
    question: "How many connections does each of the survivors get?",
    options: [
      { id: "same", claim: "100 each, as before, and the dead worker's hundred are lost", says: { about: "each", value: 100 } },
      { id: "even", claim: "133 each. The kernel hashes across whatever listeners are there now, so the three that remain split all four hundred", says: { about: "each", value: 133 } },
      { id: "nothing", claim: "The port stops accepting until the worker is replaced", says: { about: "nothing" } },
      { id: "four", claim: "4 listeners are still registered, because the dead one's socket is not reaped until the process is reaped", says: { about: "after", value: 4 } },
    ],
    why:
      "Measured: 400 connections over the three survivors came out 127, 141 and 132. The set is consulted per connection, so a listener leaving costs nothing for new connections and the rest absorb its share immediately. This is the behavior people expect and it is the one that hides the next case.",
    fix:
      "Nothing to fix. A worker dying is handled, for connections that have not arrived yet, which is not the same as being handled.",
    breaks: "a listener leaving takes its share of the traffic with it",
  },
  {
    slug: "the-client-that-moved",
    name: "The client that moved",
    brief:
      "One client, reconnecting from the same source port each time, to the same server port. Nothing about the client changes. A worker exits between its first connection and its second.",
    setup: { host: "edge-01", job: "four workers", port: 8080, reusePort: true, before: 4, change: "one left", connections: 8 },
    question: "Does that client reach the same worker it reached before?",
    options: [
      { id: "yes", claim: "Yes. The hash is over the connection's four tuple, and none of the four values changed", says: { about: "stable", value: true } },
      { id: "even", claim: "3 connections each, because eight over the three remaining rounds up", says: { about: "each", value: 3 } },
      { id: "no", claim: "Not reliably. The hash is over the four tuple and the current set of listeners, so shrinking the set re-routes most of the hash space: 4 of 8 fixed clients landed somewhere new", says: { about: "stable", value: false } },
      { id: "nothing", claim: "Only if the server sets SO_ATTACH_REUSEPORT_CBPF", says: { about: "nothing" } },
    ],
    why:
      "Measured with eight clients on fixed source ports, so the four tuple was identical across runs and only the listener count changed: 4 of the 8 landed on a different worker after one listener left. The four tuple is an input to the hash and so is the size of the set, and the second one moved. It is a hash across the current listeners, not a consistent hash.",
    fix:
      "Stop assuming affinity. If a worker holds per connection state that a reconnecting client needs, SO_REUSEPORT is not what keeps them together, and nothing in the socket layer is.",
    breaks: "the same client keeps reaching the same worker",
  },
  {
    slug: "the-rolling-restart",
    name: "The rolling restart",
    brief:
      "A deploy replaces all four workers, one at a time: start the new one, stop the old one, move on. The set is four listeners at the beginning and four at the end.",
    setup: { host: "edge-01", job: "four workers", port: 8080, reusePort: true, before: 4, change: "all restarted", connections: 400 },
    question: "What share of clients end up on a different worker than they would have before?",
    options: [
      { id: "none", claim: "None. The set is the same size afterwards, so the hash lands the same way", says: { about: "moved", value: 0 } },
      { id: "quarter", claim: "25 percent, the one worker in four that is being replaced at any moment", says: { about: "moved", value: 25 } },
      { id: "all", claim: "100 percent. Every listener in the set is a different socket than it was, so no client's hash resolves to the process it resolved to before, even though the count never changed", says: { about: "moved", value: 100 } },
      { id: "stable", claim: "The routing is stable, because the count returns to where it started", says: { about: "stable", value: true } },
    ],
    why:
      "The count being the same at the end is not the set being the same. Each step of the restart changes the set twice, once adding and once removing, and every one of those re-routes part of the hash space. By the end no client is on the socket it started on, because none of those sockets exist. A restart is the worst case for this, and it is the operation people run most often.",
    fix:
      "Drain rather than swap. Stop the old worker accepting, let its established connections finish, and only then close the listener, so the re-routing happens to connections that have not started rather than to ones mid handshake.",
    breaks: "a rolling restart is invisible if the worker count never drops",
  },
  {
    slug: "the-bind-that-failed",
    name: "The bind that failed",
    brief:
      "The same four workers, on a build where the SO_REUSEPORT call was moved after the bind by mistake, so the option is not set when each worker binds.",
    setup: { host: "edge-01", job: "four workers", port: 8080, reusePort: false, before: 4, change: "nothing", connections: 400 },
    question: "What happens when the second worker starts?",
    options: [
      { id: "fails", claim: "It fails. The option has to be set on the socket before bind, and without it the second bind to the same address and port is EADDRINUSE", says: { about: "binds", value: false } },
      { id: "binds", claim: "It binds, because the first worker has not accepted anything yet", says: { about: "binds", value: true } },
      { id: "even", claim: "100 each, the same as before, because SO_REUSEADDR covers this", says: { about: "each", value: 100 } },
      { id: "nothing", claim: "It binds and then never receives anything", says: { about: "nothing" } },
    ],
    why:
      "Measured: the first bind to 127.0.0.1:18080 succeeded and the second returned EADDRINUSE, \"Address already in use\". The ordering matters because bind is where the kernel decides whether the address is available, and the option is what it consults at that moment. Setting it afterwards changes nothing about a bind that already happened.",
    fix:
      "setsockopt before bind, always, and check the return of both. A worker that fails to bind and exits looks like a worker that crashed, and the count of live workers is the only symptom.",
    breaks: "the order of setsockopt and bind does not matter",
  },
  {
    slug: "the-worker-that-joined",
    name: "The worker that joined",
    brief:
      "Three workers are running and an autoscaler starts a fourth to absorb a traffic spike. Nothing else changes.",
    setup: { host: "edge-02", job: "an autoscaled pool", port: 8080, reusePort: true, before: 3, change: "one joined", connections: 400 },
    question: "What share of existing clients are re-routed by that one addition?",
    options: [
      { id: "quarter", claim: "25 percent, the share the new worker takes", says: { about: "moved", value: 25 } },
      { id: "most", claim: "75 percent. The hash is across four listeners now rather than three, so a client keeps its worker only when the new hash happens to land where the old one did", says: { about: "moved", value: 75 } },
      { id: "none", claim: "None. Adding a listener only affects connections that would have been rejected", says: { about: "moved", value: 0 } },
      { id: "nothing", claim: "It depends whether the new worker binds before or after the spike", says: { about: "nothing" } },
    ],
    why:
      "Adding is as disruptive as removing, which surprises people who think of it as spare capacity coming online. Measured on the removal side at 4 of 8 clients moving when four listeners became three. The share that keeps its worker is roughly one in the number of listeners, so scaling from three to four leaves about a quarter in place and moves the rest.",
    fix:
      "Scale the pool when it is quiet, not when it is busy, if anything downstream cares which worker it reaches. Autoscaling into a spike re-routes the traffic that is already there.",
    breaks: "adding capacity only affects the new capacity",
  },
  {
    slug: "the-spread-that-looked-fine",
    name: "The spread that looked fine",
    brief:
      "A pool of five workers, with per worker connection counts on a dashboard. Somebody is checking whether the deploy that just finished caused any disruption.",
    setup: { host: "edge-02", job: "an autoscaled pool", port: 8080, reusePort: true, before: 3, change: "two joined", connections: 400 },
    question: "The counts are even across the five. What does that tell you about whether clients were re-routed?",
    options: [
      { id: "fine", claim: "That nothing was disrupted, since an uneven spread is what disruption would look like", says: { about: "stable", value: true } },
      { id: "each", claim: "100 each, which is what the counts would read if nobody had moved", says: { about: "each", value: 100 } },
      { id: "clean", claim: "That the deploy went cleanly, which is what the dashboard exists to tell you", says: { about: "nothing" } },
      { id: "moved", claim: "80 percent of the clients are on a different worker than before, and the counts cannot show it. The spread is even before and after every change here, including the ones that moved almost everybody", says: { about: "moved", value: 80 } },
    ],
    why:
      "Measured at every count: 400 over four came out 107, 99, 97, 97; over three, 127, 141, 132; over five, 76, 65, 90, 71, 98. Even in all three, and between the first and the last most of the clients changed worker. A per worker connection count cannot see a re-route, because a re-route moves a connection from one bar to another and leaves both bars the same height.",
    fix:
      "Measure the thing that hurts, which is failed or reset connections during the change, not the distribution afterwards. The distribution is even by construction and says nothing.",
    breaks: "an even spread means nothing was disturbed",
  },
  {
    slug: "the-only-listener",
    name: "The only listener",
    brief:
      "A single process, one listening socket, no SO_REUSEPORT anywhere, which is what the server was before anybody touched it.",
    setup: { host: "edge-01", job: "one process", port: 8080, reusePort: false, before: 1, change: "nothing", connections: 400 },
    question: "Does this bind, and where do the connections go?",
    options: [
      { id: "fails", claim: "It fails, because the option is not set", says: { about: "binds", value: false } },
      { id: "nothing", claim: "It binds, but connections are refused until a second listener exists", says: { about: "nothing" } },
      { id: "moved", claim: "It binds, and 100 percent of clients are re-routed on every restart", says: { about: "moved", value: 100 } },
      { id: "binds", claim: "It binds and takes all 400. The option is about sharing a port with other sockets, and with one socket there is nothing to share it with", says: { about: "each", value: 400 } },
    ],
    why:
      "The option is not required to listen; it is required for a second socket to listen on an address the first one already has. One process binding a port it is the only user of needs nothing special, which is why the option is easy to forget when a server grows a second worker and easy to misplace when it does.",
    fix:
      "Nothing to fix. This is the arrangement the others are a change from, and it is worth noting that it has none of the routing problem above because there is nothing to route between.",
    breaks: "SO_REUSEPORT is something a listening socket needs",
  },
  {
    slug: "eight-workers-and-a-restart",
    name: "Eight workers and a restart",
    brief:
      "A larger pool, eight workers, and the same one at a time rolling restart. Somebody argues that with eight the disruption is smaller, because each worker is only an eighth of the traffic.",
    setup: { host: "edge-03", job: "eight workers", port: 8080, reusePort: true, before: 8, change: "all restarted", connections: 800 },
    question: "Is the disruption smaller with eight workers than with four?",
    options: [
      { id: "eighth", claim: "Yes, an eighth rather than a quarter is affected at any moment", says: { about: "moved", value: 13 } },
      { id: "same", claim: "No. Every listener ends up a different socket than it started as, whatever the count, so 100 percent of clients are re-routed either way and a bigger pool just takes longer to get there", says: { about: "moved", value: 100 } },
      { id: "each", claim: "80 each afterwards, which is fewer per worker than before, so the disruption is spread thinner", says: { about: "each", value: 80 } },
      { id: "nothing", claim: "It is smaller, because more listeners make the hash more stable", says: { about: "nothing" } },
    ],
    why:
      "The share re-routed by a single step does shrink with the pool size, and the number of steps grows to match, and at the end every socket is new. A larger pool spreads the disruption over a longer window rather than reducing it, which on a dashboard looks like an improvement and to the clients does not.",
    fix:
      "The size of the pool is not the lever. Draining is the lever, and an eBPF reuseport program that pins the hash is the other one.",
    breaks: "a bigger pool makes a restart less disruptive",
  },
  {
    slug: "the-listeners-that-are-left",
    name: "The listeners that are left",
    brief:
      "Six workers, and a bad deploy kills one of them outright without a replacement. The team wants to know what the pool looks like now.",
    setup: { host: "edge-03", job: "eight workers", port: 8080, reusePort: true, before: 6, change: "one left", connections: 500 },
    question: "How many listeners are serving, and how is the traffic split?",
    options: [
      { id: "five", claim: "5 listeners, and the split is even across them straight away, because the set is consulted for each connection rather than fixed when the pool started", says: { about: "after", value: 5 } },
      { id: "six", claim: "6 listeners, with the dead one's share queued until it comes back", says: { about: "after", value: 6 } },
      { id: "each", claim: "83 each, which is 500 over the six the pool was sized for", says: { about: "each", value: 83 } },
      { id: "nothing", claim: "It cannot be worked out without knowing the backlog on each listener", says: { about: "nothing" } },
    ],
    why:
      "Measured on the same shape at four listeners becoming three: the survivors took 127, 141 and 132 of 400, which is all of it, evenly. There is no queue for the departed listener and no delay while anything notices. The cost of the loss is not in the traffic split; it is that most of the clients are now talking to a different worker than they were.",
    fix:
      "Alert on the listener count, which is the thing that changed and the thing nothing else will show you. The connection counts will look healthy throughout.",
    breaks: "losing a listener shows up in the traffic split",
  },
];
