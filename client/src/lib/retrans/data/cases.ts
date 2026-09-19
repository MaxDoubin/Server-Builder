import type { Case } from "../types";

/**
 * Ten connections into a hole, one question each.
 *
 * Every number in every setup is whole: a count, a millisecond, a
 * millisecond. The arithmetic is two lines of kernel source and the answers
 * are still surprising, which is the case for putting them on a page.
 *
 * The two figures the whole set turns on were measured on a real kernel
 * rather than read: with tcp_retries2 at 5 a black-holed connection errored
 * after 13.25 seconds having retransmitted 6 segments, and at 6 it errored
 * after 26.39 seconds having retransmitted 7. The model says 12.6 and 6,
 * and 25.4 and 7. The extra half second each time is the first RTO before
 * retrans_stamp is set, plus the jiffy of slack the kernel allows itself.
 */
export const CASES: Case[] = [
  {
    slug: "the-fifteen-that-is-not-fifteen",
    name: "The fifteen that is not fifteen",
    brief: "A stock host, a healthy path, and a peer that stops answering mid-transfer.",
    setup: { peer: "10.4.1.20:5432", retries2: 15, rtoMs: 200, userTimeoutMs: 0, peerReturnsAtMs: null },
    question: "How long does the socket sit there before the write fails?",
    options: [
      {
        id: "the-real-one",
        claim: "925 seconds, near enough fifteen and a half minutes.",
        says: { about: "budget-seconds", seconds: 925 },
      },
      {
        id: "fifteen-rtos",
        claim: "3 seconds. Fifteen retransmissions with a 200ms timeout doubling is over in moments.",
        says: { about: "budget-seconds", seconds: 3 },
      },
      {
        id: "two-minutes",
        claim: "120 seconds, because that is the ceiling a retransmit timeout backs off to.",
        says: { about: "budget-seconds", seconds: 120 },
      },
      {
        id: "count-holds",
        claim: "Exactly as many retransmissions go out as the sysctl names.",
        says: { about: "count-matches-sysctl", value: true },
      },
    ],
    why:
      "tcp_retries2 is not counted. retransmits_timed_out turns it into a length of time with " +
      "tcp_model_timeout and compares the elapsed wall clock against that. The model sums a doubling " +
      "series from TCP_RTO_MIN until it reaches the 120 second ceiling, which takes ten terms, then " +
      "adds flat 120 second intervals for the rest: 1023 times 200ms is 204.6 seconds, plus six more " +
      "at 120 seconds is 720, and the total is 924.6. That number is the same on every Linux host on " +
      "earth, because both constants are compile time and neither is the connection's own timeout.",
    fix:
      "If fifteen minutes of a dead socket is too long, and for anything user facing it is, set " +
      "TCP_USER_TIMEOUT on the socket. It is the one knob here whose value is the deadline rather " +
      "than an input to a model.",
    breaks: "tcp_retries2 is a count of retransmissions.",
  },
  {
    slug: "the-satellite-link",
    name: "The satellite link",
    brief: "The same sysctl, the same failure, a path with a five second retransmit timeout.",
    setup: { peer: "10.9.0.7:443", retries2: 15, rtoMs: 5000, userTimeoutMs: 0, peerReturnsAtMs: null },
    question: "How many retransmissions actually go out before this one gives up?",
    options: [
      {
        id: "fifteen",
        claim: "15, the same as anywhere else. That is what the sysctl is for.",
        says: { about: "retransmissions", count: 15 },
      },
      {
        id: "sixteen",
        claim: "16, the same as on a fast path.",
        says: { about: "retransmissions", count: 16 },
      },
      {
        id: "twelve",
        claim: "12. The slower the path, the fewer attempts it gets.",
        says: { about: "retransmissions", count: 12 },
      },
      {
        id: "longer",
        claim: "It waits longer than a fast path does, because each attempt costs more.",
        says: { about: "budget-seconds", seconds: 1200 },
      },
    ],
    why:
      "The deadline is modeled from TCP_RTO_MIN whatever the path costs, so it is 924.6 seconds " +
      "here as well. The schedule is not modeled: it backs off from this connection's own five " +
      "second timeout, hits the 120 second ceiling in five doublings rather than ten, and spends the " +
      "same budget in twelve attempts instead of sixteen. A worse path gets fewer chances to recover " +
      "in the same wall clock, which is the opposite of what you would design.",
    fix:
      "On long fat paths, raise tcp_retries2 or set TCP_USER_TIMEOUT deliberately rather than " +
      "assuming the default gives every connection the same number of attempts. It gives every " +
      "connection the same number of seconds.",
    breaks: "A slower path gets the same number of retransmissions as a fast one.",
  },
  {
    slug: "the-one-where-it-matches",
    name: "The one where it matches",
    brief: "A path across a region, about six hundred milliseconds of retransmit timeout.",
    setup: { peer: "10.30.2.9:6379", retries2: 15, rtoMs: 600, userTimeoutMs: 0, peerReturnsAtMs: null },
    question: "Does the number of retransmissions match the fifteen in the sysctl here?",
    options: [
      {
        id: "yes",
        claim: "Yes, on this particular path it does.",
        says: { about: "count-matches-sysctl", value: true },
      },
      {
        id: "never",
        claim: "No. The count and the sysctl never line up, on any path.",
        says: { about: "count-matches-sysctl", value: false },
      },
      {
        id: "seventeen",
        claim: "17 retransmissions go out, which is two more than the sysctl.",
        says: { about: "retransmissions", count: 17 },
      },
      {
        id: "recovers",
        claim: "The connection recovers before the question arises.",
        says: { about: "ending", value: "recovered" },
      },
    ],
    why:
      "At around six hundred milliseconds of retransmit timeout the schedule happens to fit fifteen " +
      "attempts into the 924.6 second budget, so the count and the sysctl agree. It is a coincidence " +
      "of this path, not a property of the setting: a hundred milliseconds either side and it is " +
      "sixteen or fourteen. A documented number that is right for one round trip time and wrong for " +
      "every other is worse than one that is always wrong, because it survives the one test somebody " +
      "runs.",
    fix:
      "Do not tune against the count. Work out the budget in seconds, which is what the kernel " +
      "actually enforces, and decide whether that is the failure detection time you want.",
    breaks: "The retransmission count and the sysctl never agree.",
  },
  {
    slug: "the-short-fuse",
    name: "The short fuse",
    brief: "Somebody set tcp_retries2 to 5 to fail over faster. This one was measured on a real kernel.",
    setup: { peer: "10.4.1.20:5432", retries2: 5, rtoMs: 200, userTimeoutMs: 0, peerReturnsAtMs: null },
    question: "How many retransmissions go out before this connection is abandoned?",
    options: [
      {
        id: "five",
        claim: "5, which is what the sysctl says.",
        says: { about: "retransmissions", count: 5 },
      },
      {
        id: "four",
        claim: "4, because the first send is not a retransmission.",
        says: { about: "retransmissions", count: 4 },
      },
      {
        id: "six",
        claim: "6, one more than the sysctl names.",
        says: { about: "retransmissions", count: 6 },
      },
      {
        id: "thirteen-s",
        claim: "None of them is the last. The peer comes back before the budget runs out.",
        says: { about: "gives-up-at", seconds: null },
      },
    ],
    why:
      "Five is under the backoff threshold, so the budget is the plain doubling series: 2 to the " +
      "sixth minus one, times 200ms, which is 12.6 seconds. The sends land at 0, 0.2, 0.6, 1.4, 3.0 " +
      "and 6.2 seconds, and the seventh timer fires at 12.6 to find the budget spent. Six go out. " +
      "Measured on a real kernel rather than derived: with tcp_retries2 at 5 and the peer black " +
      "holed, the socket returned ETIMEDOUT after 13.25 seconds and the host's RetransSegs counter " +
      "had gone up by exactly 6.",
    fix:
      "Expect one more retransmission than the number you write, and expect the wall clock rather " +
      "than the count to be what you have configured. If you want a five second failover, ask for " +
      "five seconds with TCP_USER_TIMEOUT.",
    breaks: "Setting tcp_retries2 to N gives you N retransmissions.",
  },
  {
    slug: "below-the-knee",
    name: "Below the knee",
    brief: "An operator halves tcp_retries2 from fifteen to eight, expecting to halve the wait.",
    setup: { peer: "10.4.1.20:5432", retries2: 8, rtoMs: 200, userTimeoutMs: 0, peerReturnsAtMs: null },
    question: "Fifteen gave 925 seconds. What does eight give?",
    options: [
      {
        id: "half",
        claim: "462 seconds, half of what fifteen gave.",
        says: { about: "budget-seconds", seconds: 462 },
      },
      {
        id: "one-oh-two",
        claim: "102 seconds, a ninth of it.",
        says: { about: "budget-seconds", seconds: 102 },
      },
      {
        id: "two-oh-five",
        claim: "205 seconds.",
        says: { about: "budget-seconds", seconds: 205 },
      },
      {
        id: "nine-out",
        claim: "8 retransmissions go out, matching the sysctl.",
        says: { about: "retransmissions", count: 8 },
      },
    ],
    why:
      "Eight is still under the backoff threshold of nine, so the whole budget is the doubling " +
      "series and nothing is spent at the ceiling: 2 to the ninth minus one, times 200ms, which is " +
      "102.2 seconds. The relationship between the sysctl and the time is exponential below the " +
      "threshold and linear above it, so halving the number does not halve anything. Fifteen to " +
      "eight takes 924.6 seconds down to 102.2, a factor of nine.",
    fix:
      "Read the budget off the model rather than scaling it in your head. Below nine, each step " +
      "doubles the time; at nine and above, each step adds a flat two minutes.",
    breaks: "Halving tcp_retries2 halves the time before the connection gives up.",
  },
  {
    slug: "at-the-knee",
    name: "At the knee",
    brief: "Nine is where the doubling stops and the flat intervals start.",
    setup: { peer: "10.30.2.9:6379", retries2: 9, rtoMs: 200, userTimeoutMs: 0, peerReturnsAtMs: null },
    question: "What is the budget at exactly nine?",
    options: [
      {
        id: "two-oh-five",
        claim: "205 seconds, the last value the doubling series reaches on its own.",
        says: { about: "budget-seconds", seconds: 205 },
      },
      {
        id: "three-two-five",
        claim: "325 seconds.",
        says: { about: "budget-seconds", seconds: 325 },
      },
      {
        id: "one-oh-two",
        claim: "102 seconds, the same as eight, because the ceiling has been reached.",
        says: { about: "budget-seconds", seconds: 102 },
      },
      {
        id: "ten-out",
        claim: "9 retransmissions go out here.",
        says: { about: "retransmissions", count: 9 },
      },
    ],
    why:
      "linear_backoff_thresh is ilog2 of the ceiling over the floor, which is ilog2 of 120 seconds " +
      "over 200 milliseconds: ilog2 of 600, which is nine. At exactly nine the first branch still " +
      "applies, so the budget is 2 to the tenth minus one times 200ms: 204.6 seconds. Ten adds one " +
      "flat interval of 120 seconds and gives 324.6, and every step after that adds another 120. " +
      "The threshold is where a setting that behaved exponentially starts behaving linearly, and " +
      "nothing in the manual page mentions it exists.",
    fix:
      "If you are choosing a value, choose it from the two seconds figures either side of it. Nine " +
      "is three and a half minutes and ten is five and a half, and no arithmetic you do in your head " +
      "from the numbers 9 and 10 will tell you that.",
    breaks: "Each increment of tcp_retries2 doubles the time.",
  },
  {
    slug: "the-socket-option",
    name: "The socket option",
    brief: "The same dead peer, on a connection where the application set TCP_USER_TIMEOUT.",
    setup: { peer: "10.4.1.20:5432", retries2: 15, rtoMs: 250, userTimeoutMs: 20_000, peerReturnsAtMs: null },
    question: "tcp_retries2 is still fifteen. When does this one fail?",
    options: [
      {
        id: "still-925",
        claim: "925 seconds. The sysctl is a system wide setting and the socket option cannot undercut it.",
        says: { about: "budget-seconds", seconds: 925 },
      },
      {
        id: "sixteen-out",
        claim: "16 retransmissions go out before it fails.",
        says: { about: "retransmissions", count: 16 },
      },
      {
        id: "recovered",
        claim: "It recovers, because a shorter timeout retries harder.",
        says: { about: "ending", value: "recovered" },
      },
      {
        id: "lower-wins",
        claim: "At the socket option, and the sysctl is not consulted at all.",
        says: { about: "ending", value: "user-timeout" },
      },
    ],
    why:
      "TCP_USER_TIMEOUT is the third argument to retransmits_timed_out. The function only builds a " +
      "model when that argument is zero: pass a non-zero value and the modeled budget is never " +
      "computed and your milliseconds are the deadline. It is the only setting in this whole " +
      "mechanism that means what it says, and it is per socket, so one application can have a twenty " +
      "second failure detection on a host where everything else waits a quarter of an hour.",
    fix:
      "Set it. For a database client, a cache client, anything behind a load balancer, twenty or " +
      "thirty seconds of dead socket is the difference between a failover and an outage, and it does " +
      "not need a sysctl or a reboot or a conversation with anybody who owns the host.",
    breaks: "tcp_retries2 is the only way to change how long a connection waits.",
  },
  {
    slug: "the-peer-comes-back",
    name: "The peer comes back",
    brief: "A switch reboots. The path is gone for forty-five seconds and then it is not.",
    setup: { peer: "10.30.2.9:6379", retries2: 15, rtoMs: 300, userTimeoutMs: 0, peerReturnsAtMs: 45_000 },
    question: "The peer answers again after forty-five seconds. What happened to the connection?",
    options: [
      {
        id: "dead",
        claim: "It was abandoned. Forty-five seconds of silence is well past any reasonable patience.",
        says: { about: "ending", value: "timed-out" },
      },
      {
        id: "alive",
        claim: "It survived, and the application never knew.",
        says: { about: "ending", value: "recovered" },
      },
      {
        id: "gives-up",
        claim: "925 seconds from the first retransmission, it errors.",
        says: { about: "gives-up-at", seconds: 925 },
      },
      {
        id: "eight",
        claim: "9 retransmissions went out during the outage.",
        says: { about: "retransmissions", count: 9 },
      },
    ],
    why:
      "Forty-five seconds is nothing against a 924.6 second budget. Eight retransmissions went out " +
      "during the outage, the ninth would have been at 76.5 seconds, and the peer answered long " +
      "before that. The same patience that makes a dead socket sit there for a quarter of an hour is " +
      "what carries a live one through a switch reboot without the application noticing, which is " +
      "why the default is not simply wrong.",
    fix:
      "Nothing to fix here. This is the case the default is for, and it is worth holding in mind " +
      "before shortening the timeout everywhere: a short TCP_USER_TIMEOUT turns this survivable " +
      "outage into a reconnect storm.",
    breaks: "Once retransmission starts the connection is effectively lost.",
  },
  {
    slug: "raising-it",
    name: "Raising it",
    brief: "A storage team asks for tcp_retries2 at twenty, so their long transfers survive more.",
    setup: { peer: "10.9.0.7:3260", retries2: 20, rtoMs: 400, userTimeoutMs: 0, peerReturnsAtMs: null },
    question: "Five more than the default. How long does a dead socket last now?",
    options: [
      {
        id: "modest",
        claim: "1045 seconds, a couple of minutes more than the default.",
        says: { about: "budget-seconds", seconds: 1045 },
      },
      {
        id: "the-real-one",
        claim: "1525 seconds, ten minutes more than the default.",
        says: { about: "budget-seconds", seconds: 1525 },
      },
      {
        id: "doubled",
        claim: "1849 seconds, double the default, because five more doublings is a lot.",
        says: { about: "budget-seconds", seconds: 1849 },
      },
      {
        id: "twenty",
        claim: "20 retransmissions go out, matching the sysctl.",
        says: { about: "retransmissions", count: 20 },
      },
    ],
    why:
      "Twenty is past the threshold, so those five extra steps are five flat intervals of 120 " +
      "seconds: 924.6 plus 600 is 1524.6. Ten minutes, not the doubling somebody might fear and not " +
      "the couple of minutes somebody might hope. Above the threshold the setting is linear and each " +
      "unit is worth exactly two minutes, which makes it the only part of this that is easy to " +
      "reason about.",
    fix:
      "Say the change in minutes when you propose it. Twenty means twenty-five minutes of a dead " +
      "socket, and a connection pool holding sockets for twenty-five minutes after the far end has " +
      "gone is a different conversation from one about a sysctl going from fifteen to twenty.",
    breaks: "Raising tcp_retries2 above fifteen adds roughly what the lower values added.",
  },
  {
    slug: "the-three-second-abort",
    name: "The three second abort",
    brief: "Somebody reads that the RFC minimum is a hundred seconds and sets tcp_retries2 to 3.",
    setup: { peer: "10.4.1.20:8080", retries2: 3, rtoMs: 200, userTimeoutMs: 0, peerReturnsAtMs: null },
    question: "How long does a connection survive a blip now?",
    options: [
      {
        id: "hundred",
        claim: "100 seconds, the RFC minimum the manual page mentions.",
        says: { about: "budget-seconds", seconds: 100 },
      },
      {
        id: "three-out",
        claim: "3 retransmissions go out.",
        says: { about: "retransmissions", count: 3 },
      },
      {
        id: "thirteen",
        claim: "13 seconds.",
        says: { about: "budget-seconds", seconds: 13 },
      },
      {
        id: "three",
        claim: "3 seconds.",
        says: { about: "budget-seconds", seconds: 3 },
      },
    ],
    why:
      "Three is far below the threshold, so the budget is 2 to the fourth minus one times 200ms: " +
      "three seconds exactly. Four retransmissions, at 0, 0.2, 0.6 and 1.4 seconds, and then the " +
      "socket errors. The hundred second RFC 1122 minimum that tcp(7) mentions is a statement about " +
      "what the RFC requires, not a floor the kernel enforces: nothing stops you configuring an " +
      "abort a thirtieth of that, and at three seconds a garbage collection pause on the far end " +
      "kills the connection.",
    fix:
      "Anything under about eight is short enough that ordinary jitter will break connections that " +
      "would have recovered. If a few seconds of failure detection is genuinely what you need, use " +
      "TCP_USER_TIMEOUT on the sockets that need it rather than a system wide sysctl every process " +
      "on the host inherits.",
    breaks: "The kernel will not let you set a give-up time below the RFC minimum.",
  },
];
