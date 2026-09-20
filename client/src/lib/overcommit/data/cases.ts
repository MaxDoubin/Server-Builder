import type { Case } from "../types";

/** The machine this was measured on: 15.72 GiB, no swap. */
const RAM = 16_481_980;
const AVAILABLE = 14_596_178;
const COMMITTED = 4_006_572;

/**
 * Ten machines, one allocation each.
 *
 * Every number in an option is produced by the model, and the gate recomputes
 * each of them from /proc/meminfo's own arithmetic before the set ships.
 */
export const CASES: Case[] = [
  {
    slug: "the-limit-is-half-the-memory",
    name: "Half a machine",
    brief:
      "A capacity review reads CommitLimit off a 15.72 GiB host and reports that the machine is already committed to nearly half its memory.",
    setup: {
      host: "app-01",
      ramKb: RAM,
      swapKb: 0,
      mode: 0,
      ratio: 50,
      kbytes: 0,
      committedKb: COMMITTED,
      availableKb: AVAILABLE,
      wantKb: 1_048_576,
    },
    question: "What is CommitLimit on this machine, and where does it come from?",
    options: [
      { id: "half", claim: "8240988 kB, half of MemTotal, because the ratio is 50", says: { about: "limit-kb", value: 8_240_988 } },
      { id: "all", claim: "16481980 kB, which is MemTotal", says: { about: "limit-kb", value: 16_481_980 } },
      { id: "committed", claim: "4006572 kB, which is what is committed", says: { about: "limit-kb", value: 4_006_572 } },
      { id: "none", claim: "There is no limit on a machine with no swap", says: { about: "nothing" } },
    ],
    why:
      "CommitLimit is swap plus overcommit_ratio percent of RAM, and the ratio defaults to 50. With no swap that is half the machine. Walking the ratio across 25, 50, 80, 100 and 150 on this host reproduced the figure every time, to within the two or three kilobytes the kernel loses rounding pages.",
    fix:
      "Nothing, in this mode. Worth knowing before anybody plots Committed_AS against it and calls 48 percent a capacity problem.",
    breaks: "CommitLimit is how much memory the machine has",
  },
  {
    slug: "past-the-limit-and-nothing-fails",
    name: "Over the line, still running",
    brief:
      "Monitoring fires because Committed_AS has passed CommitLimit on a busy host. The host has been like this for a week and nothing has failed.",
    setup: {
      host: "app-04",
      ramKb: RAM,
      swapKb: 0,
      mode: 0,
      ratio: 50,
      kbytes: 0,
      committedKb: 9_000_000,
      availableKb: AVAILABLE,
      wantKb: 1_048_576,
    },
    question: "Committed_AS is past CommitLimit. What is failing?",
    options: [
      { id: "refused", claim: "The next allocation is refused", says: { about: "refuses", value: true } },
      { id: "killer", claim: "The OOM killer runs as soon as the line is crossed", says: { about: "nothing" } },
      { id: "nothing-fails", claim: "Nothing: the heuristic never reads the running total", says: { about: "refuses", value: false } },
      { id: "strict", claim: "The machine is in strict mode by definition of having a limit", says: { about: "mode", name: "strict" } },
    ],
    why:
      "In mode 0 CommitLimit is advisory. The heuristic judges one request at a time and lets the total sit past the line indefinitely, which is why a healthy machine can show Committed_AS above CommitLimit for a week with nothing to show for it.",
    fix:
      "Alert on MemAvailable, or on the killer's own log lines. A threshold on Committed_AS against CommitLimit in mode 0 is an alert about arithmetic.",
    breaks: "exceeding CommitLimit means allocations start failing",
  },
  {
    slug: "strict-refuses-with-memory-free",
    name: "Refused, with fourteen gigabytes free",
    brief:
      "Somebody set vm.overcommit_memory to 2 last night to stop the OOM killer. This morning a worker that asks for 5 GiB will not start.",
    setup: {
      host: "worker-03",
      ramKb: RAM,
      swapKb: 0,
      mode: 2,
      ratio: 50,
      kbytes: 0,
      committedKb: COMMITTED,
      availableKb: AVAILABLE,
      wantKb: 5_242_880,
    },
    question: "The worker asks for 5 GiB. What happens?",
    options: [
      { id: "fine", claim: "It starts: MemAvailable is 13.92 GiB", says: { about: "refuses", value: false } },
      { id: "later", claim: "It starts, and the killer takes something else later", says: { about: "nothing" } },
      { id: "heuristic", claim: "The heuristic lets it through as a reasonable request", says: { about: "mode", name: "heuristic" } },
      { id: "refused", claim: "It is refused, while 13.92 GiB of memory sits unused", says: { about: "refuses", value: true } },
    ],
    why:
      "Strict mode compares reservations against CommitLimit, and CommitLimit here is 7.86 GiB because the ratio is 50 and there is no swap. 4.04 GiB of headroom against a 5 GiB request. Free memory is not in the comparison at all.",
    fix:
      "If strict accounting is really wanted, raise overcommit_ratio, or add swap, which is added to the limit whole. Turning on mode 2 and leaving the ratio at 50 halves the machine.",
    breaks: "strict mode only refuses when memory is actually short",
  },
  {
    slug: "swap-is-added-whole",
    name: "Eight gigabytes of swap",
    brief:
      "The same host, now with an 8 GiB swap file, still in strict mode with the ratio at 50.",
    setup: {
      host: "worker-03",
      ramKb: RAM,
      swapKb: 8_388_608,
      mode: 2,
      ratio: 50,
      kbytes: 0,
      committedKb: COMMITTED,
      availableKb: AVAILABLE,
      wantKb: 5_242_880,
    },
    question: "What is CommitLimit now?",
    options: [
      { id: "both-halved", claim: "12435292 kB, half of RAM and swap together", says: { about: "limit-kb", value: 12_435_292 } },
      { id: "whole", claim: "16629596 kB: swap whole, plus half of RAM", says: { about: "limit-kb", value: 16_629_596 } },
      { id: "unchanged", claim: "8240988 kB, unchanged, because swap is not memory", says: { about: "limit-kb", value: 8_240_988 } },
      { id: "none", claim: "Swap does not enter the calculation", says: { about: "nothing" } },
    ],
    why:
      "The ratio applies to RAM alone and swap is added at its full size. That asymmetry is why adding swap is the cheapest way to make strict mode survivable, and why a machine with no swap has the tightest limit it can have.",
    fix:
      "Nothing to fix. The 5 GiB worker starts now, which is the point.",
    breaks: "overcommit_ratio is a percentage of RAM plus swap",
  },
  {
    slug: "kbytes-overrides-the-ratio",
    name: "Two knobs, one of them ignored",
    brief:
      "A configuration management change sets vm.overcommit_kbytes to 12 GiB. vm.overcommit_ratio is still 50, where it has always been.",
    setup: {
      host: "db-02",
      ramKb: RAM,
      swapKb: 0,
      mode: 2,
      ratio: 50,
      kbytes: 12_582_912,
      committedKb: COMMITTED,
      availableKb: AVAILABLE,
      wantKb: 1_048_576,
    },
    question: "Both knobs are set. Which one decides CommitLimit?",
    options: [
      { id: "ratio", claim: "8240988 kB, the ratio, because it was set first", says: { about: "limit-kb", value: 8_240_988 } },
      { id: "sum", claim: "20823900 kB, the two added together", says: { about: "limit-kb", value: 20_823_900 } },
      { id: "kbytes", claim: "12582912 kB, the kbytes value, and the ratio is ignored entirely", says: { about: "limit-kb", value: 12_582_912 } },
      { id: "none", claim: "The kernel refuses to apply either while both are set", says: { about: "nothing" } },
    ],
    why:
      "They are alternatives, not terms. Setting one makes the kernel ignore the other, and writing to either zeroes its partner in /proc, so the pair a reader sees is the one that is inert and the one that is live.",
    fix:
      "Pick one and put the other back to 0 by hand, so the next person does not read the dead knob and believe it.",
    breaks: "overcommit_ratio always sets the limit",
  },
  {
    slug: "committed-counts-promises",
    name: "Eleven gigabytes reserved, fourteen available",
    brief:
      "A dashboard shows Committed_AS at 11.44 GiB and MemAvailable at 13.92 GiB on a 15.72 GiB machine, and somebody has opened a ticket saying the numbers cannot both be right.",
    setup: {
      host: "app-07",
      ramKb: RAM,
      swapKb: 0,
      mode: 0,
      ratio: 50,
      kbytes: 0,
      committedKb: 12_000_000,
      availableKb: AVAILABLE,
      wantKb: 524_288,
    },
    question: "Is the next half gibibyte refused?",
    options: [
      { id: "contradiction", claim: "One of the two figures has to be wrong", says: { about: "nothing" } },
      { id: "no", claim: "No: one counts reservations and the other counts pages", says: { about: "refuses", value: false } },
      { id: "yes", claim: "Yes, reservations are already past the limit", says: { about: "refuses", value: true } },
      { id: "oom", claim: "The killer can run here with the accounting satisfied", says: { about: "oom-possible", value: true } },
    ],
    why:
      "Committed_AS is the sum of what processes have reserved, including pages they have never touched, and it does not shrink when memory is reclaimed. MemAvailable is an estimate of what a new process could actually use, page cache included. They measure different things and one exceeding the other is ordinary.",
    fix:
      "Close the ticket. If a number is wanted for capacity, MemAvailable is the one that answers the question people mean.",
    breaks: "Committed_AS is how much memory is in use",
  },
  {
    slug: "ratio-above-one-hundred",
    name: "A limit larger than the machine",
    brief:
      "To make strict mode usable, the ratio has been set to 150. The host still has no swap.",
    setup: {
      host: "cache-01",
      ramKb: RAM,
      swapKb: 0,
      mode: 2,
      ratio: 150,
      kbytes: 0,
      committedKb: COMMITTED,
      availableKb: AVAILABLE,
      wantKb: 2_097_152,
    },
    question: "Can this machine still run out of memory?",
    options: [
      { id: "safe", claim: "No, strict accounting guarantees every promise", says: { about: "oom-possible", value: false } },
      { id: "disabled", claim: "No, mode 2 disables the killer", says: { about: "nothing" } },
      { id: "yes", claim: "Yes: the limit is now above RAM plus swap", says: { about: "oom-possible", value: true } },
      { id: "refused", claim: "The allocation is refused before it gets that far", says: { about: "refuses", value: true } },
    ],
    why:
      "A ratio over 100 hands out more than exists, which makes strict accounting a promise the machine cannot keep. Even under 100 it is not a guarantee: Committed_AS counts reservations rather than pages touched, and page cache and shared pages are not in it at all.",
    fix:
      "Decide which problem is being solved. A ratio over 100 in mode 2 is mode 0 with extra steps and a worse failure mode.",
    breaks: "strict mode makes the out of memory killer impossible",
  },
  {
    slug: "mode-one-refuses-nothing",
    name: "Nineteen gigabytes promised",
    brief:
      "A cache host runs vm.overcommit_memory=1 on the vendor's advice. Committed_AS reads 19.07 GiB on a 15.72 GiB machine and the next worker wants 8 GiB.",
    setup: {
      host: "cache-04",
      ramKb: RAM,
      swapKb: 0,
      mode: 1,
      ratio: 50,
      kbytes: 0,
      committedKb: 20_000_000,
      availableKb: AVAILABLE,
      wantKb: 8_388_608,
    },
    question: "Which mode is this, and what does it do with the request?",
    options: [
      { id: "strict", claim: "Strict, so the request is refused", says: { about: "mode", name: "strict" } },
      { id: "heuristic", claim: "Heuristic, so it depends on the size of the request", says: { about: "mode", name: "heuristic" } },
      { id: "always", claim: "Always overcommit, so it refuses nothing at all", says: { about: "mode", name: "always" } },
      { id: "none", claim: "Mode 1 is not a valid setting on a host with no swap", says: { about: "nothing" } },
    ],
    why:
      "Mode 1 is what a database or a cache asks for, because forking a large process reserves a copy of its address space that will never be written. The vendor is not being reckless; refusing that reservation is what would be wrong.",
    fix:
      "Leave it. Watch the killer's logs and MemAvailable, which are the signals that still mean something here.",
    breaks: "mode 1 is reckless and mode 2 is the safe one",
  },
  {
    slug: "the-default-is-not-strict",
    name: "Nothing has been tuned",
    brief:
      "A stock host, freshly installed, nothing under /etc/sysctl.d. Somebody asks what it does when a process asks for more than it can back.",
    setup: {
      host: "stock-01",
      ramKb: RAM,
      swapKb: 0,
      mode: 0,
      ratio: 50,
      kbytes: 0,
      committedKb: COMMITTED,
      availableKb: AVAILABLE,
      wantKb: 1_048_576,
    },
    question: "What is an untuned Linux host doing with allocations?",
    options: [
      { id: "heuristic", claim: "Judging each request on its own and ignoring the running total", says: { about: "mode", name: "heuristic" } },
      { id: "strict", claim: "Refusing anything that would take Committed_AS past CommitLimit", says: { about: "mode", name: "strict" } },
      { id: "always", claim: "Refusing nothing whatsoever", says: { about: "mode", name: "always" } },
      { id: "none", claim: "It depends on the distribution", says: { about: "nothing" } },
    ],
    why:
      "The default is 0, the heuristic, and it has been for the whole life of the setting. It rejects an allocation that is wild on its own terms and says nothing about the total, which is why CommitLimit can be exceeded on a machine nobody has touched.",
    fix:
      "Nothing. The value of knowing this is that it stops mode 2 from looking like the default made explicit, when it is a different policy.",
    breaks: "Linux refuses allocations it cannot back",
  },
  {
    slug: "ratio-one-hundred-is-still-not-ram",
    name: "The whole machine, and still refused",
    brief:
      "After the last outage the ratio was raised to 100 so that strict mode would have the whole machine to work with. A 2.86 GiB allocation is refused anyway.",
    setup: {
      host: "worker-09",
      ramKb: RAM,
      swapKb: 0,
      mode: 2,
      ratio: 100,
      kbytes: 0,
      committedKb: 14_000_000,
      availableKb: AVAILABLE,
      wantKb: 3_000_000,
    },
    question: "The limit is the whole machine now. Why is it still refused?",
    options: [
      { id: "fine", claim: "It is not: at a ratio of 100 the allocation succeeds", says: { about: "refuses", value: false } },
      { id: "available", claim: "It succeeds, because MemAvailable is 13.92 GiB", says: { about: "nothing" } },
      { id: "oom", claim: "The limit is above RAM plus swap, so anything can happen", says: { about: "oom-possible", value: true } },
      { id: "refused", claim: "Reservations plus this request still pass the limit, even at 100 percent", says: { about: "refuses", value: true } },
    ],
    why:
      "13.35 GiB of reservations plus 2.86 GiB is 16.21 GiB against a limit of 15.72 GiB. A ratio of 100 makes the limit equal to memory, and reservations are counted whether or not the pages behind them were ever touched, so the wall still arrives before the memory does.",
    fix:
      "Add swap, which raises the limit whole, or accept that strict accounting costs headroom by design. Raising the ratio alone only moves the wall.",
    breaks: "setting the ratio to 100 makes strict mode safe",
  },
];
