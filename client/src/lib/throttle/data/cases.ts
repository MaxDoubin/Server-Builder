/**
 * Ten cgroups against one quota.
 *
 * Every figure in the options came out of the model rather than a keyboard,
 * and CI requires exactly one of them to hold. The distractors are the
 * numbers you get by making the assumption the case is about: the limit read
 * as a core count, the utilisation read as a health check, the period
 * ignored, the thread count ignored.
 */

import type { Case } from "../types";

export const CASES: Case[] = [
  {
    slug: "four-threads-one-cpu",
    name: "One CPU, four threads",
    brief:
      "A Go service with GOMAXPROCS left at the node's core count, so four worker goroutines are" +
      " runnable at all times, in a container with limits.cpu: 1 on a sixteen core node. There is" +
      " always work queued.",
    setup: {
      cores: 16,
      threads: 4,
      periodMs: 100,
      quotaMs: 100,
      burstMs: 0,
      arrivals: [{ at: 0, cpuMs: 100000, label: "always something queued" }],
      windowMs: 1000,
    },
    question: "How far into each 100ms period does the quota run out?",
    options: [
      {
        id: "quarter",
        claim: "25ms, because four threads spend 100ms of CPU time in 25ms of wall clock",
        says: { about: "exhausts-at", ms: 25 },
      },
      {
        id: "full",
        claim: "It does not: one CPU of quota is exactly one thread's worth for the whole period",
        says: { about: "never-throttled" },
      },
      {
        id: "by-cores",
        claim: "6.25ms, because the node has sixteen cores to drain it with",
        says: { about: "exhausts-at", ms: 6.25 },
      },
      {
        id: "half",
        claim: "50ms, because the scheduler gives the group half of each period",
        says: { about: "exhausts-at", ms: 50 },
      },
    ],
    why:
      "Quota is CPU time and a period is wall clock time, and threads convert between them. Four" +
      " threads running in parallel consume four milliseconds of quota per millisecond of wall" +
      " clock, so 100ms of quota is gone 25ms in, and every thread in the group is then stopped" +
      " until the period boundary. The container is stopped for 75ms of every 100, on a node with" +
      " twelve idle cores.",
    fix:
      "match the runtime's parallelism to the limit. GOMAXPROCS from the limit rather than from" +
      " the node, or -XX:ActiveProcessorCount, or automaxprocs. The quota is not the problem; four" +
      " threads trying to spend it at once is.",
    breaks: "that a limit of one CPU lets a container use a core continuously",
  },
  {
    slug: "thirty-percent-and-throttled",
    name: "Thirty percent, and stopped",
    brief:
      "A batch job that needs 300ms of CPU, running in a container with limits.cpu: 1 across eight" +
      " worker threads. It runs once a second. The dashboard shows CPU usage at 30 percent of the" +
      " limit and somebody has proposed lowering the limit to save quota.",
    setup: {
      cores: 16,
      threads: 8,
      periodMs: 100,
      quotaMs: 100,
      burstMs: 0,
      arrivals: [{ at: 0, cpuMs: 300, label: "the batch, 300ms of CPU" }],
      windowMs: 1000,
    },
    question: "The graph says 30 percent of the limit. How many of the ten periods were throttled?",
    options: [
      {
        id: "none",
        claim: "None: it is using less than a third of what it is allowed",
        says: { about: "never-throttled" },
      },
      {
        id: "three",
        claim: "Three, one for each period the job was running in",
        says: { about: "periods-throttled", count: 3 },
      },
      {
        id: "two",
        claim: "Two, because the quota is per period and the average is over the window",
        says: { about: "periods-throttled", count: 2 },
      },
      {
        id: "one",
        claim: "One, the last period, where the job finally runs past its quota",
        says: { about: "periods-throttled", count: 1 },
      },
    ],
    why:
      "Both numbers are true and they are about different things. The average across the window is" +
      " 30 percent because the job only runs for part of it. Inside the periods where it does run," +
      " eight threads take the full 100ms of quota in 12.5ms and are stopped for the other 87.5," +
      " twice over, before the third period finishes the work at 212.5ms. Work needing 300ms of" +
      " CPU on eight threads should have taken 37.5ms of wall clock. It took five and a half times" +
      " that, and the utilisation graph shows a third of the limit.",
    fix:
      "alert on nr_throttled from cpu.stat, not on utilisation. Utilisation over any window longer" +
      " than the period cannot show this, and the period is 100ms, so almost every dashboard in" +
      " existence is averaging it away.",
    breaks: "that using less than the limit means the limit is not biting",
  },
  {
    slug: "forty-threads-half-a-cpu",
    name: "Half a CPU, forty threads",
    brief:
      "A JVM with default settings in a container with limits.cpu: 500m, on a thirty two core" +
      " node. The default thread pool sized itself from the node, so forty threads are runnable.",
    setup: {
      cores: 32,
      threads: 40,
      periodMs: 100,
      quotaMs: 50,
      burstMs: 0,
      arrivals: [{ at: 0, cpuMs: 100000, label: "a full request queue" }],
      windowMs: 1000,
    },
    question: "How far into each period does the quota run out?",
    options: [
      {
        id: "correct",
        claim: "1.563ms, because thirty two of the forty threads can actually run at once",
        says: { about: "exhausts-at", ms: 1.563 },
      },
      {
        id: "by-threads",
        claim: "1.25ms, being 50ms of quota divided across all forty threads",
        says: { about: "exhausts-at", ms: 1.25 },
      },
      {
        id: "half",
        claim: "50ms, which is what half a CPU of quota means",
        says: { about: "exhausts-at", ms: 50 },
      },
      {
        id: "half-cores",
        claim: "3.125ms, because half a CPU of quota only gets half the cores",
        says: { about: "exhausts-at", ms: 3.125 },
      },
    ],
    why:
      "Threads beyond the core count do not drain quota faster, because they are not running:" +
      " thirty two of the forty are on a CPU and eight are waiting for one. So the drain rate is" +
      " thirty two milliseconds of quota per millisecond of wall clock, and 50ms of quota lasts" +
      " 1.563ms. The container runs for one and a half milliseconds and is stopped for the other" +
      " 98.4, ten times a second, forever. Every request that touches it inherits up to 98ms of" +
      " stall that has nothing to do with the work.",
    fix:
      "set the pool size from the limit. A JVM newer than 8u191 reads the cgroup limit for" +
      " availableProcessors, but library pools sized at build time and anything reading /proc" +
      " directly do not. And a limit under one CPU with any thread pool at all is a shape to avoid:" +
      " give it a whole CPU or give it a much longer period.",
    breaks: "that the thread count does not matter if the work is the same",
  },
  {
    slug: "the-period-not-the-ratio",
    name: "Twenty percent, two ways",
    brief:
      "Two containers configured to the same fraction of a CPU by two different people. One has" +
      " cpu.max of 20000 100000, the other 10000 50000. Both have four runnable threads and more" +
      " work than they can do.",
    setup: {
      cores: 8,
      threads: 4,
      periodMs: 50,
      quotaMs: 10,
      burstMs: 0,
      arrivals: [{ at: 0, cpuMs: 1000, label: "saturated" }],
      windowMs: 1000,
    },
    question: "For the one with the 50ms period, how many periods in a second are throttled?",
    options: [
      {
        id: "ten",
        claim: "Ten, the same as the 100ms one, since the ratio is the same",
        says: { about: "periods-throttled", count: 10 },
      },
      {
        id: "twenty",
        claim: "Twenty, because halving the period doubles the number of them",
        says: { about: "periods-throttled", count: 20 },
      },
      {
        id: "exhausts",
        claim: "It runs out of quota 5ms into each period",
        says: { about: "exhausts-at", ms: 5 },
      },
      {
        id: "none",
        claim: "Neither is throttled: 20 percent of a CPU is 20 percent of a CPU",
        says: { about: "never-throttled" },
      },
    ],
    why:
      "Same ratio, same total CPU per second, completely different latency. The 100ms version runs" +
      " for 5ms and stops for 95, ten times a second. The 50ms version runs for 2.5ms and stops for" +
      " 47.5, twenty times a second. Total throttled time is 950ms either way. What changes is the" +
      " longest single stall, and for anything with a request in flight that is the number that" +
      " matters: 95ms of dead time is a p99, 47.5ms is half of one.",
    fix:
      "shorten the period for latency sensitive work, at the cost of burst capacity, and lengthen" +
      " it for batch. cpu.cfs_period_us takes 1ms to 1s. Kubernetes does not expose it, which is" +
      " why almost everything in a cluster is on the 100ms default whether that suits it or not.",
    breaks: "that two limits with the same ratio behave the same",
  },
  {
    slug: "more-threads-finished-sooner",
    name: "The threads were not the problem",
    brief:
      "One request needing 200ms of CPU, in a container with limits.cpu: 1. Somebody has read that" +
      " threads cause throttling and proposes running it single threaded. Compare four worker" +
      " threads against one.",
    setup: {
      cores: 16,
      threads: 4,
      periodMs: 100,
      quotaMs: 100,
      burstMs: 0,
      arrivals: [{ at: 0, cpuMs: 200, label: "one request, 200ms of CPU" }],
      windowMs: 500,
    },
    question: "With four threads, when does the request finish?",
    options: [
      {
        id: "single",
        claim: "200ms, the same as single threaded, because the quota caps the total either way",
        says: { about: "finishes-at", ms: 200 },
      },
      {
        id: "worse",
        claim: "275ms: it is throttled once, and the 75ms stall is added to the 200",
        says: { about: "finishes-at", ms: 275 },
      },
      {
        id: "parallel",
        claim: "50ms, since four threads do 200ms of work in 50ms of wall clock",
        says: { about: "finishes-at", ms: 50 },
      },
      {
        id: "correct",
        claim: "125ms, sooner than single threaded, despite being throttled once",
        says: { about: "finishes-at", ms: 125 },
      },
    ],
    why:
      "Threading still helps. The quota caps CPU time, not parallelism, so the same 200ms of work" +
      " costs the same 200ms of quota either way, and the only question is how quickly the group" +
      " can spend it. Four threads spend the first period's 100ms in 25ms, wait 75ms, then spend" +
      " the second period's 100ms in another 25 and finish at 125ms. One thread takes the full" +
      " 100ms of each period and finishes at 200ms, never throttled at all. Being throttled is not" +
      " the same as being slow, and cutting threads to make nr_throttled go down made this slower.",
    fix:
      "reach for the throttling metric to explain latency, not to minimize. A group throttled once" +
      " that finished in 125ms is doing better than one never throttled that took 200ms. The number" +
      " to reduce is the stall a request actually waits through, which means raising the quota or" +
      " shortening the period, not removing the parallelism that is spending it.",
    breaks: "that fewer threads is always the fix for throttling",
  },
  {
    slug: "the-burst-absorbs-it",
    name: "What burst is for",
    brief:
      "A service that ticks over at 20ms of CPU per 100ms period and then takes one request needing" +
      " 250ms of CPU, on eight threads with limits.cpu: 1. The same workload with cpu.max.burst" +
      " set to 200ms.",
    setup: {
      cores: 8,
      threads: 8,
      periodMs: 100,
      quotaMs: 100,
      burstMs: 200,
      arrivals: [
        { at: 0, cpuMs: 20, label: "ticking over" },
        { at: 100, cpuMs: 20, label: "ticking over" },
        { at: 200, cpuMs: 20, label: "ticking over" },
        { at: 300, cpuMs: 20, label: "ticking over" },
        { at: 400, cpuMs: 250, label: "one large request" },
      ],
      windowMs: 800,
    },
    question: "With cpu.max.burst at 200ms, how many periods are throttled?",
    options: [
      {
        id: "two",
        claim: "Two, the same as without burst: the spike still needs more than one period",
        says: { about: "periods-throttled", count: 2 },
      },
      {
        id: "one",
        claim: "One, since burst covers the first period of the spike but not the second",
        says: { about: "periods-throttled", count: 1 },
      },
      {
        id: "none",
        claim: "None: four periods of underrun banked enough to absorb the whole spike",
        says: { about: "never-throttled" },
      },
      {
        id: "four",
        claim: "Four, one for each quiet period that had to give up its unused quota",
        says: { about: "periods-throttled", count: 4 },
      },
    ],
    why:
      "Each of the four quiet periods used 20ms of its 100ms and banked the other 80, up to the" +
      " 200ms cap. When the 250ms request arrives the group has 300ms available in that one period" +
      " and spends 250 of it in 31.25ms of wall clock, throttled not at all, finishing at 431.25ms." +
      " Without burst the same workload is stopped in two periods and does not finish until" +
      " 606.25ms: 175ms slower for a request that needed 250ms of CPU on a node with eight cores" +
      " and nothing else to do. The average utilisation is 41 percent either way, which is again a" +
      " number that cannot see the difference.",
    fix:
      "set cpu.max.burst for anything whose load is spiky and whose average is comfortably under" +
      " the limit, which is most request serving. It has been in the kernel since 5.14 and in" +
      " Kubernetes behind a feature gate. It is not free: a group bursting is interference for" +
      " everything else on the node, bounded by the burst value.",
    breaks: "that a container cannot use more than its limit in a single period",
  },
  {
    slug: "not-everything-is-throttling",
    name: "Nothing is stopped here",
    brief:
      "Two threads and 300ms of CPU to do, in a container with limits.cpu: 2. The service is slow" +
      " and somebody has already decided the limit is the reason.",
    setup: {
      cores: 8,
      threads: 2,
      periodMs: 100,
      quotaMs: 200,
      burstMs: 0,
      arrivals: [{ at: 0, cpuMs: 300, label: "the work" }],
      windowMs: 500,
    },
    question: "What does cpu.stat say?",
    options: [
      {
        id: "sixty",
        claim: "Throttled in the first period, because 300ms of work exceeds the 200ms quota",
        says: { about: "periods-throttled", count: 1 },
      },
      {
        id: "never",
        claim: "Nothing was throttled: two threads cannot spend two CPUs of quota in one period",
        says: { about: "never-throttled" },
      },
      {
        id: "finishes",
        claim: "The work finishes at 100ms, which is the whole first period",
        says: { about: "finishes-at", ms: 100 },
      },
      {
        id: "util",
        claim: "Utilisation is 60 percent of the limit",
        says: { about: "utilisation", percent: 60 },
      },
    ],
    why:
      "Two threads drain quota at two milliseconds per millisecond, and the period is 100ms, so the" +
      " most they can physically spend is 200ms of CPU, which is exactly the quota. There is no" +
      " arrangement of work that gets this group throttled. It runs flat out for the first period," +
      " does the last 100ms in 50ms of the second, and finishes at 150ms. If it is slow, the limit" +
      " is not why, and nr_throttled staying at zero is how you know before you change anything.",
    fix:
      "read cpu.stat before assuming. nr_throttled at zero after hours of load means the quota is" +
      " not in the path, and the time is going somewhere else: a lock, a dependency, or the work" +
      " genuinely taking that long.",
    breaks: "that a slow container under a limit is being throttled",
  },
  {
    slug: "threads-past-the-cores",
    name: "Two hundred threads, four cores",
    brief:
      "The same limits.cpu: 1 container, but scheduled onto a four core node instead of a thirty" +
      " two core one, and the application has two hundred runnable threads.",
    setup: {
      cores: 4,
      threads: 200,
      periodMs: 100,
      quotaMs: 100,
      burstMs: 0,
      arrivals: [{ at: 0, cpuMs: 100000, label: "saturated" }],
      windowMs: 1000,
    },
    question: "How far into each period does the quota run out?",
    options: [
      {
        id: "by-threads",
        claim: "0.5ms, because two hundred threads spend 100ms of quota very quickly",
        says: { about: "exhausts-at", ms: 0.5 },
      },
      {
        id: "full",
        claim: "100ms: one CPU of quota over a 100ms period is one CPU continuously",
        says: { about: "exhausts-at", ms: 100 },
      },
      {
        id: "never",
        claim: "It is not throttled, because the node only has four cores anyway",
        says: { about: "never-throttled" },
      },
      {
        id: "correct",
        claim: "25ms, because only four of the two hundred can be on a CPU at once",
        says: { about: "exhausts-at", ms: 25 },
      },
    ],
    why:
      "The drain rate is the number of threads that can actually be running, which is capped by the" +
      " host's cores. Two hundred threads on four cores drain quota at four, the same as four" +
      " threads would, so this is identical to the four thread case: exhausted at 25ms, stopped for" +
      " 75. The thread count stops mattering once it passes the core count, which is why the same" +
      " deployment throttles differently on differently sized nodes and why a node pool migration" +
      " changes a service's p99 with no code change at all.",
    fix:
      "when comparing throttling between environments, compare the node's core count first. And be" +
      " aware which way it goes: a bigger node makes throttling worse for a threaded application," +
      " because more of its threads can run at once and spend the quota faster.",
    breaks: "that a container behaves the same on any node with enough capacity",
  },
  {
    slug: "it-arrived-after-the-quota-went",
    name: "Yours arrived at thirty milliseconds",
    brief:
      "Eight threads and limits.cpu: 1. A request needing 100ms of CPU arrives at the start of a" +
      " period. Yours needs 40ms and arrives 30ms in, by which time the quota is long gone.",
    setup: {
      cores: 16,
      threads: 8,
      periodMs: 100,
      quotaMs: 100,
      burstMs: 0,
      arrivals: [
        { at: 0, cpuMs: 100, label: "somebody else's request" },
        { at: 30, cpuMs: 40, label: "yours" },
      ],
      windowMs: 400,
    },
    question: "When does the work all finish?",
    options: [
      {
        id: "immediate",
        claim: "35ms: yours needs 40ms of CPU and there are eight threads free",
        says: { about: "finishes-at", ms: 35 },
      },
      {
        id: "sum",
        claim: "17.5ms, being 140ms of CPU across eight threads",
        says: { about: "finishes-at", ms: 17.5 },
      },
      {
        id: "correct",
        claim: "105ms, because nothing runs between 12.5ms and the next period boundary",
        says: { about: "finishes-at", ms: 105 },
      },
      {
        id: "twoperiods",
        claim: "200ms, because each request needs its own period",
        says: { about: "finishes-at", ms: 200 },
      },
    ],
    why:
      "The quota went at 12.5ms, so from then until 100ms the whole cgroup is stopped, and your" +
      " request arriving at 30ms sits in that stop. It does not get a thread, it does not get a" +
      " share, it gets nothing until the period boundary refills the quota, and then it takes 5ms." +
      " A 40ms piece of work took 75ms, and 70 of that was the container not being allowed to run" +
      " while the node had fifteen idle cores. This is what throttling does to a latency" +
      " distribution: it does not slow requests down evenly, it adds a stall whose size depends" +
      " only on when in the period the request arrived.",
    fix:
      "look at the p99 against the period. Throttling produces a latency distribution with a" +
      " shoulder at roughly the period length, and if your p99 is suspiciously close to 100ms, or a" +
      " multiple of it, that is the shape to suspect before you profile anything.",
    breaks: "that throttling slows every request by the same proportion",
  },
  {
    slug: "the-limit-is-not-a-core-count",
    name: "Two CPUs of quota, and it never stops",
    brief:
      "limits.cpu: 2 with two runnable threads, saturated with work, on an eight core node. The" +
      " utilisation graph is pinned at 100 percent of the limit and an alert is firing on it.",
    setup: {
      cores: 8,
      threads: 2,
      periodMs: 100,
      quotaMs: 200,
      burstMs: 0,
      arrivals: [{ at: 0, cpuMs: 100000, label: "saturated" }],
      windowMs: 500,
    },
    question: "It is at 100 percent of its limit. How much is it being throttled?",
    options: [
      {
        id: "all",
        claim: "Every period, since it is using its entire quota in every one of them",
        says: { about: "periods-throttled", count: 5 },
      },
      {
        id: "first",
        claim: "The first period only, while the two threads get going",
        says: { about: "periods-throttled", count: 1 },
      },
      {
        id: "some",
        claim: "Half of them, because two threads reach the quota half way through",
        says: { about: "periods-throttled", count: 2 },
      },
      {
        id: "never",
        claim: "Not at all: it is using everything it is allowed and never being stopped",
        says: { about: "never-throttled" },
      },
    ],
    why:
      "Using the whole quota and being throttled are different events. Two threads spend at most" +
      " 200ms of CPU in a 100ms period, and the quota is exactly 200ms, so the group runs flat out" +
      " to the boundary and the next period's quota arrives precisely as it needs it. It never" +
      " sits idle waiting. An alert on utilisation fires here and there is nothing to fix; an alert" +
      " on nr_throttled stays quiet, correctly.",
    fix:
      "alert on nr_throttled and throttled_usec, and use utilisation for capacity planning rather" +
      " than for incidents. A container that is meant to be busy will sit at 100 percent of its" +
      " limit, and that is the limit working.",
    breaks: "that a container at 100 percent of its limit is being throttled",
  },
];
