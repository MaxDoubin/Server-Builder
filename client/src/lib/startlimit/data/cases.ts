import type { Case } from "../types";

/**
 * Ten units and what systemd does with each.
 *
 * Every duration is in milliseconds, because RestartSec is and because the
 * cases turn on tenths of a second. The default limiter, five starts inside
 * ten seconds, is left alone unless a case is about changing it.
 */

const SECOND = 1000;

/** The shipped limiter: StartLimitBurst=5, StartLimitIntervalSec=10s. */
const stock = { burst: 5, intervalMs: 10 * SECOND };

export const CASES: Case[] = [
  {
    slug: "the-fast-crash",
    name: "The fast crash",
    brief:
      "A worker reads a config file at startup, finds a key missing after a bad deploy, logs the" +
      " error and exits 1 about half a second in. The unit has Restart=always and nothing else is" +
      " set. The deploy goes out at 02:00 and at 09:00 the service is still down.",
    setup: { unit: "worker.service", crashAfterMs: 500, exitCode: 1, restart: "always", restartSecMs: 100, ...stock },
    question: "How many times does the service actually start before systemd refuses?",
    options: [
      {
        id: "forever",
        claim: "It never stops starting: Restart=always means always, and the unit restarts until the config is fixed",
        says: { about: "still-restarting", value: true },
      },
      {
        id: "six",
        claim: "6: the limit is five restarts after the original start",
        says: { about: "starts", count: 6 },
      },
      {
        id: "five",
        claim: "5: the default limit is five starts, and the sixth attempt, three seconds in, is refused",
        says: { about: "starts", count: 5 },
      },
      {
        id: "one",
        claim: "1: a unit that exits non-zero on its first start is failed immediately and not retried",
        says: { about: "starts", count: 1 },
      },
    ],
    why:
      "The cycle is the crash plus RestartSec, 600 milliseconds. Starts land at 0, 0.6, 1.2, 1.8" +
      " and 2.4 seconds, which is five inside the ten second window, and the attempt at 3.0" +
      " seconds is refused. systemd logs 'Start request repeated too quickly', puts the unit in" +
      " the failed state with result start-limit-hit, and leaves it there. Restart=always governs" +
      " whether a restart is scheduled. It has no say in whether the start is permitted.",
    fix:
      "read the result in systemctl status before reading the application log: start-limit-hit" +
      " means the unit stopped because of the limiter and the interesting failure is five" +
      " restarts back in the journal. Clearing it needs systemctl reset-failed.",
    breaks: "that Restart=always means the service will always be restarted",
  },
  {
    slug: "the-slow-crash",
    name: "The slow crash",
    brief:
      "The same worker, the same Restart=always, the same bad deploy. This time it opens a" +
      " database connection first and the config error is not reached until 2.3 seconds in. A" +
      " week later somebody notices the host has restarted this service two hundred thousand" +
      " times.",
    setup: { unit: "worker.service", crashAfterMs: 2300, exitCode: 1, restart: "always", restartSecMs: 100, ...stock },
    question: "Where does this unit end up?",
    options: [
      {
        id: "limited",
        claim: "Failed, on start-limit-hit, like the fast crash: the same five starts, just spread out",
        says: { about: "ending", value: "rate-limited" },
      },
      {
        id: "alone",
        claim: "Stopped and left alone once systemd sees the same exit status repeatedly",
        says: { about: "ending", value: "left-alone" },
      },
      {
        id: "slower",
        claim: "Restarting, but with a growing delay, because systemd backs off exponentially after repeated failures",
        says: { about: "nothing" },
      },      {
        id: "forever",
        claim: "Restarting forever: the counter does reach five, and then the window elapses and resets it before a sixth start is judged against it",
        says: { about: "ending", value: "restarting-forever" },
      },
    ],
    why:
      "The cycle is 2.4 seconds, so starts land at 0, 2.4, 4.8, 7.2 and 9.6. That is five inside" +
      " the ten second window and the counter is now full, which is exactly the state that" +
      " stopped the fast crash. The sixth start comes at 12.0, the window that opened at zero has" +
      " elapsed, and systemd's limiter is a fixed window anchored at the first start rather than" +
      " a sliding one: it throws the counter away and starts a new window at 12.0. A sliding" +
      " window would refuse this start, because the five before it span 9.6 seconds. systemd" +
      " permits it, and every one after it, forever. The service that fails slower is the one" +
      " that never stops, and the one nobody notices.",
    fix:
      "do not rely on the limiter to catch a crash loop. It only catches the fast ones. Alert on" +
      " the restart counter, which systemd prints in the journal on every scheduled restart, or" +
      " on service uptime staying under a minute.",
    breaks: "that a crash loop eventually stops itself",
  },
  {
    slug: "exactly-at-the-boundary",
    name: "Exactly at the boundary",
    brief:
      "A unit whose process dies the instant it starts, with RestartSec set to two seconds" +
      " because somebody read that the default of 100 milliseconds was too aggressive. Two" +
      " seconds is the interval divided by the burst, which looks like the safe value.",
    setup: { unit: "importer.service", crashAfterMs: 0, exitCode: 1, restart: "always", restartSecMs: 2 * SECOND, ...stock },
    question: "How long after the first start is a start refused?",
    options: [
      {
        id: "ten",
        claim: "10000 ms, exactly on the interval: the sixth attempt lands at ten seconds and the window has not elapsed yet, because the check is strictly greater than",
        says: { about: "gives-up-at", ms: 10 * SECOND },
      },
      {
        id: "never",
        claim: "Never: five starts two seconds apart span ten seconds, which is the whole interval, so the window resets in time",
        says: { about: "gives-up-at", ms: null },
      },
      {
        id: "twelve",
        claim: "12000 ms, when the sixth restart is scheduled after the fifth crash",
        says: { about: "gives-up-at", ms: 12 * SECOND },
      },
      {
        id: "eight",
        claim: "8000 ms, at the fifth start, because the fifth is the one that exceeds a burst of five",
        says: { about: "gives-up-at", ms: 8 * SECOND },
      },
    ],
    why:
      "Starts land at 0, 2, 4, 6 and 8 seconds, filling the window, and the sixth arrives at" +
      " exactly 10. The limiter resets its window when now minus begin is strictly greater than" +
      " the interval, and 10000 is not greater than 10000, so the window is still open and the" +
      " start is refused by one millisecond of arithmetic. RestartSec of interval over burst is" +
      " the last value that fails, not the first that works.",
    fix:
      "if you are setting RestartSec to dodge the limiter, go past the boundary rather than to" +
      " it. Three seconds here restarts forever; two seconds fails at ten. Or set" +
      " StartLimitIntervalSec=0 and mean it.",
    breaks: "that a restart cycle of interval divided by burst is the safe setting",
  },
  {
    slug: "what-would-have-saved-it",
    name: "What would have saved it",
    brief:
      "Back to the first case: the worker that crashes 500 milliseconds in with the default" +
      " RestartSec of 100 milliseconds, failed on start-limit-hit at three seconds. The crash" +
      " itself will be fixed on Monday. The question tonight is what to put in the drop-in so the" +
      " unit keeps trying over the weekend.",
    setup: { unit: "worker.service", crashAfterMs: 500, exitCode: 1, restart: "always", restartSecMs: 100, ...stock },
    question: "What is the smallest whole second of RestartSec that keeps this unit out of the limit?",
    options: [
      {
        id: "one",
        claim: "1s: ten times the default, which spreads five starts over more than five seconds",
        says: { about: "safe-restart-sec", ms: 1 * SECOND },
      },
      {
        id: "two",
        claim: "2s: five starts at 2.5 second cycles span 12.5 seconds, which walks past the end of the window before the fifth",
        says: { about: "safe-restart-sec", ms: 2 * SECOND },
      },
      {
        id: "ten",
        claim: "10s, the whole interval, because anything shorter allows a second start inside the window",
        says: { about: "safe-restart-sec", ms: 10 * SECOND },
      },
      {
        id: "none",
        claim: "No value works: RestartSec cannot prevent the limit, only StartLimitBurst can",
        says: { about: "safe-restart-sec", ms: null },
      },
    ],
    why:
      "The limiter trips when the burst fits inside the interval, so the cycle has to be long" +
      " enough that it does not. At RestartSec of one second the cycle is 1.5 seconds and five of" +
      " them is 7.5, inside ten, so it still fails. At two seconds the cycle is 2.5 and five is" +
      " 12.5, past the window, so the counter resets and it runs all weekend. The crash time is" +
      " part of the cycle, which is why the answer is not simply the interval over the burst.",
    fix:
      "a drop-in with RestartSec=2s is the smallest change here, and it is a workaround. The" +
      " service still crashes every two and a half seconds and nothing is alerting on it.",
    breaks: "that RestartSec only changes how quickly a service comes back",
  },
  {
    slug: "the-limit-switched-off",
    name: "The limit switched off",
    brief:
      "A network appliance agent that is expected to crash and be restarted continuously while a" +
      " link is flapping. Its packager set StartLimitBurst=0 on purpose. It crashes 500" +
      " milliseconds in, exactly like the first case.",
    setup: { unit: "linkmon.service", crashAfterMs: 500, exitCode: 1, restart: "always", restartSecMs: 100, burst: 0, intervalMs: 10 * SECOND },
    question: "Is the unit still being restarted after ten minutes of this?",
    options: [
      {
        id: "no",
        claim: "No: StartLimitBurst=0 means zero starts are permitted, so the first one is refused",
        says: { about: "still-restarting", value: false },
      },
      {
        id: "gives-up",
        claim: "No: it is refused at 3000 ms, the same as the first case, because the interval is still ten seconds",
        says: { about: "gives-up-at", ms: 3 * SECOND },
      },
      {
        id: "logs",
        claim: "Yes, but systemd downgrades it to a warning in the journal after the fifth restart",
        says: { about: "nothing" },
      },      {
        id: "yes",
        claim: "Yes: either StartLimitBurst or StartLimitIntervalSec at zero disables the limiter entirely",
        says: { about: "still-restarting", value: true },
      },
    ],
    why:
      "Zero reads as off rather than as none. systemd.unit(5) says setting either" +
      " StartLimitIntervalSec or StartLimitBurst to zero disables rate limiting, and the limiter" +
      " returns true without touching its counter. This is the correct setting for something" +
      " genuinely expected to restart constantly, and it is also how a unit ends up restarting" +
      " six thousand times an hour with nothing in the journal to stop it.",
    fix:
      "if you disable the limit, own the consequence with monitoring: the limiter was the only" +
      " thing that would have told you. A unit with the limit off and no alert on restart count" +
      " is a unit nobody is watching.",
    breaks: "that a burst of zero means no starts are allowed",
  },
  {
    slug: "it-exited-cleanly",
    name: "It exited cleanly",
    brief:
      "A queue consumer with Restart=on-failure. It finds the queue empty, decides its work is" +
      " done, and exits 0 half a second after starting. The team expects it to be brought back" +
      " because the unit says restart.",
    setup: { unit: "consumer.service", crashAfterMs: 500, exitCode: 0, restart: "on-failure", restartSecMs: 100, ...stock },
    question: "How many times does the service start?",
    options: [
      {
        id: "one",
        claim: "1: Restart=on-failure does not act on a clean exit, so it stops and is left alone",
        says: { about: "starts", count: 1 },
      },
      {
        id: "five",
        claim: "5, then start-limit-hit, the same as any other service that exits every half second",
        says: { about: "starts", count: 5 },
      },
      {
        id: "forever",
        claim: "It restarts forever: on-failure covers any exit that was not requested by systemctl stop",
        says: { about: "still-restarting", value: true },
      },
      {
        id: "two",
        claim: "2: systemd retries once to distinguish a clean exit from a fast one",
        says: { about: "starts", count: 2 },
      },
    ],
    why:
      "on-failure means a non-zero exit status, a signal, a timeout or a watchdog, and exit 0 is" +
      " none of those. The unit goes inactive and stays there, which is correct behavior and the" +
      " wrong outcome for a consumer that should be running. Nothing appears in the journal after" +
      " the clean exit, so there is no failure to alert on either; the service is simply gone.",
    fix:
      "Restart=always for anything that should be running, and let the exit code mean what it" +
      " means. A consumer that exits when the queue is empty is a design choice to reverse, not" +
      " a restart policy to tune.",
    breaks: "that Restart=on-failure restarts whenever the service stops",
  },
  {
    slug: "the-interval-widened",
    name: "The interval widened",
    brief:
      "The slow crash from earlier, restarting forever every 2.4 seconds. Somebody trying to stop" +
      " the noise widens the window to a minute, reasoning that a longer interval is a more" +
      " forgiving one.",
    setup: { unit: "worker.service", crashAfterMs: 2300, exitCode: 1, restart: "always", restartSecMs: 100, burst: 5, intervalMs: 60 * SECOND },
    question: "How long after the first start is a start refused now?",
    options: [
      {
        id: "never",
        claim: "Never: a longer interval is more permissive, so a unit that survived ten seconds survives sixty",
        says: { about: "gives-up-at", ms: null },
      },
      {
        id: "sixty",
        claim: "60000 ms, at the end of the first window",
        says: { about: "gives-up-at", ms: 60 * SECOND },
      },
      {
        id: "fifteen",
        claim: "12000 ms: the same five starts fill the counter as before, and this time the window is still open when the sixth arrives",
        says: { about: "gives-up-at", ms: 12_000 },
      },
      {
        id: "three",
        claim: "2400 ms, at the second start, because a sixty second window makes every restart count against one budget",
        says: { about: "gives-up-at", ms: 2400 },
      },
    ],
    why:
      "Widening the interval makes the limiter stricter, not kinder. The counter resets when the" +
      " window elapses, so a long window is a long time during which starts accumulate. At ten" +
      " seconds the window elapsed at ten and threw the full counter away; at sixty seconds" +
      " nothing throws it away and the sixth start at 12.0 is refused. The unit that was" +
      " restarting forever now fails permanently, which is what the operator wanted and not what" +
      " they expected to be doing.",
    fix:
      "think of StartLimitIntervalSec as how far back the counter remembers, not as how long the" +
      " service is given. To make a limiter stricter, widen the interval or lower the burst; to" +
      " make it kinder, do the opposite.",
    breaks: "that a longer StartLimitIntervalSec is more forgiving",
  },
  {
    slug: "the-burst-raised-to-fifty",
    name: "The burst raised to fifty",
    brief:
      "The fast crash again, failing at three seconds on start-limit-hit. This time the response" +
      " is StartLimitBurst=50, on the reasoning that fifty attempts is surely enough for a" +
      " transient problem to clear.",
    setup: { unit: "worker.service", crashAfterMs: 500, exitCode: 1, restart: "always", restartSecMs: 100, burst: 50, intervalMs: 10 * SECOND },
    question: "Is the unit still being restarted an hour later?",
    options: [
      {
        id: "no-fifty",
        claim: "No: it gets fifty starts, thirty seconds of them, and then fails on start-limit-hit",
        says: { about: "still-restarting", value: false },
      },
      {
        id: "yes",
        claim: "Yes, forever: fifty starts at 600 ms apart need thirty seconds and the window is ten, so the counter resets long before fifty",
        says: { about: "still-restarting", value: true },
      },
      {
        id: "gives",
        claim: "No: it is refused at 30000 ms, fifty cycles in",
        says: { about: "gives-up-at", ms: 30_000 },
      },
      {
        id: "safe",
        claim: "Yes, and the smallest RestartSec that would have avoided the limit is 2s",
        says: { about: "safe-restart-sec", ms: 2 * SECOND },
      },
    ],
    why:
      "A burst larger than the window can hold is the same as no limit at all. Sixteen starts fit" +
      " in ten seconds at this cycle, the seventeenth opens a new window, and the counter never" +
      " gets near fifty. So raising the burst from five to fifty did not buy fifty attempts, it" +
      " turned the limiter off for this unit while leaving it apparently configured. The unit" +
      " restarts six thousand times an hour and systemctl status says activating.",
    fix:
      "raise the burst only together with a matching interval, or accept that you have disabled" +
      " the limit and say so with StartLimitIntervalSec=0, which at least reads as a decision.",
    breaks: "that raising StartLimitBurst raises the number of restarts you get",
  },
  {
    slug: "a-tenth-of-a-second",
    name: "A tenth of a second",
    brief:
      "Two hosts, the same unit, the same bug. On the first the process dies 1.9 seconds after" +
      " starting; on the second, which has a slightly faster disk, it dies at 2.0 seconds. Both" +
      " have the default limiter and the default RestartSec.",
    setup: { unit: "indexer.service", crashAfterMs: 1900, exitCode: 1, restart: "always", restartSecMs: 100, ...stock },
    question: "The host crashing at 1.9 seconds: where does its unit end up?",
    options: [
      {
        id: "forever",
        claim: "Restarting forever, like any service that takes seconds rather than milliseconds to fail",
        says: { about: "ending", value: "restarting-forever" },
      },
      {
        id: "alone",
        claim: "Inactive and left alone, because systemd stops retrying a unit that has never stayed up",
        says: { about: "ending", value: "left-alone" },
      },
      {
        id: "running",
        claim: "Running: 1.9 seconds is long enough for systemd to consider the start successful",
        says: { about: "ending", value: "running" },
      },      {
        id: "limited",
        claim: "Failed, on start-limit-hit: five two second cycles are exactly ten seconds, which is inside the window",
        says: { about: "ending", value: "rate-limited" },
      },
    ],
    why:
      "The cycle here is 2.0 seconds exactly, so the sixth start lands at 10.0 and the window has" +
      " not elapsed, by the same strictly-greater-than comparison as the boundary case. The" +
      " faster host, crashing at 2.0 seconds, has a 2.1 second cycle, reaches 10.5 on its sixth" +
      " start and resets instead. One tenth of a second of difference decides whether the service" +
      " is dead and quiet or alive and burning, and the difference is in the hardware rather than" +
      " in anything anybody configured.",
    fix:
      "when two identical hosts behave differently under the same limiter, measure the crash" +
      " time rather than the configuration. The limiter is arithmetic on a number nobody set.",
    breaks: "that a service taking seconds to fail is too slow to hit the limit",
  },
  {
    slug: "fifteen-hundred-milliseconds-into-boot",
    name: "Fifteen hundred milliseconds into boot",
    brief:
      "A unit that needs a network mount. At boot the mount is not ready, so the process exits 1" +
      " about 200 milliseconds in. The mount finishes about forty seconds into boot. The unit has" +
      " Restart=always, the default RestartSec, and the default limiter.",
    setup: { unit: "reporting.service", crashAfterMs: 200, exitCode: 1, restart: "always", restartSecMs: 100, ...stock },
    question: "How long after its first start is the unit refused?",
    options: [
      {
        id: "forty",
        claim: "It is not: it keeps retrying until the mount appears at forty seconds, then starts normally",
        says: { about: "gives-up-at", ms: null },
      },
      {
        id: "ten",
        claim: "10000 ms, at the end of the first window",
        says: { about: "gives-up-at", ms: 10 * SECOND },
      },
      {
        id: "fifteen-hundred",
        claim: "1500 ms: five starts at 300 ms apart, and the sixth is refused a second and a half into boot",
        says: { about: "gives-up-at", ms: 1500 },
      },
      {
        id: "thousand",
        claim: "1000 ms, at the fifth start",
        says: { about: "gives-up-at", ms: 1000 },
      },
    ],
    why:
      "The unit burns its whole allowance in the first second and a half of boot, thirty eight" +
      " seconds before the thing it needs exists, and then stays failed for the rest of the" +
      " uptime. Nothing retries it when the mount appears, because the limiter does not expire" +
      " into a retry: it expires into permission to start, and nobody asks. This is the most" +
      " common way a machine comes up with one service missing and no alert, because the failure" +
      " is at 1.5 seconds and the eye goes to whatever was happening at forty.",
    fix:
      "order the unit after what it needs with After= and Requires= on the mount unit rather than" +
      " restarting into it. Where the dependency cannot be expressed, RestartSec long enough to" +
      " outlast the wait, and a burst to match.",
    breaks: "that a unit which fails at boot will be retried once the system settles",
  },
];
