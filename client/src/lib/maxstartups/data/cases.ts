import type { Case } from "../types";

/**
 * Ten daemons, ten arrival patterns, one question each.
 *
 * The numbers in every setup are whole: connections a minute, seconds, and
 * the three integers out of sshd_config. Nothing here needs a calculator,
 * and that is the point. The arithmetic is easy and almost nobody does it,
 * because the shape of the answer is so unlike what the words suggest.
 */
export const CASES: Case[] = [
  {
    slug: "the-eleventh-connection",
    name: "The eleventh connection",
    brief: "A stock bastion, two hundred logins a minute, and nobody is doing anything wrong.",
    setup: {
      host: "bastion-1",
      begin: 10,
      rate: 30,
      full: 100,
      graceSeconds: 120,
      arrivalsPerMinute: 200,
      authSeconds: 3,
      stuckPerMinute: 0,
    },
    question: "Every client here authenticates, and quickly. What happens to the next connection?",
    options: [
      {
        id: "refused-outright",
        claim: "It is refused. Ten concurrent unauthenticated connections is the limit and the limit has been reached.",
        says: { about: "certainty", value: "dropped" },
      },
      {
        id: "thirty",
        claim: "30 percent of the time it is refused, and the rest of the time it is not.",
        says: { about: "drop-percent", percent: 30 },
      },
      {
        id: "fine",
        claim: "Nothing is refused. The daemon is nowhere near a hundred.",
        says: { about: "certainty", value: "accepted" },
      },
      {
        id: "twelve",
        claim: "12 connections stand unauthenticated at any one moment.",
        says: { about: "in-flight", count: 12 },
      },
    ],
    why:
      "Two hundred connections a minute, each holding a slot for three seconds, is ten slots standing: " +
      "200 times 3 is 600 connection-seconds a minute, and 600 over 60 is 10. That is exactly the start " +
      "value, and the start value is where refusing begins rather than where it becomes certain. " +
      "should_drop_connection returns early with zero only while startups is below begin; at begin it " +
      "falls through to the arithmetic, and the arithmetic at that point is the rate and nothing else, " +
      "because startups minus begin is zero.",
    fix:
      "Nothing is wrong with the daemon. If a thirty percent chance of a refused connection is not " +
      "acceptable, and on a bastion it is not, MaxStartups 30:30:100 costs nothing and moves the whole " +
      "ramp out of the way of ordinary traffic.",
    breaks: "MaxStartups 10 means the eleventh connection is refused.",
  },
  {
    slug: "run-it-again",
    name: "Run it again",
    brief: "It failed, you ran the same command, and it worked. Nothing changed in between.",
    setup: {
      host: "bastion-1",
      begin: 10,
      rate: 30,
      full: 100,
      graceSeconds: 120,
      arrivalsPerMinute: 220,
      authSeconds: 3,
      stuckPerMinute: 0,
    },
    question: "One more connection a minute than a moment ago. What are the odds now?",
    options: [
      {
        id: "thirty-one",
        claim: "31 percent, one point higher than at ten standing.",
        says: { about: "drop-percent", percent: 31 },
      },
      {
        id: "thirty-seven",
        claim: "37 percent, because the ramp is steep near the bottom.",
        says: { about: "drop-percent", percent: 37 },
      },
      {
        id: "still-thirty",
        claim: "30 percent, the same as it was at ten.",
        says: { about: "drop-percent", percent: 30 },
      },
      {
        id: "eleven-in-flight",
        claim: "13 connections stand unauthenticated at any one moment.",
        says: { about: "in-flight", count: 13 },
      },
    ],
    why:
      "The comment above should_drop_connection says the probability increases linearly, and every step " +
      "of the calculation is integer arithmetic. At eleven standing the middle term is 70 times 1, " +
      "divided by 90, which truncates to zero, so the answer is the bare rate again. On the default " +
      "setting the probability holds at thirty across two values, then thirty-one across two more, and " +
      "so on: a staircase with steps about one and a third connections wide. The line in the comment is " +
      "what the author meant, not what the code does.",
    fix:
      "Stop reading a single failure as a threshold being crossed. The useful measurement is the " +
      "proportion of connections refused over a minute, which is a number the ramp predicts and a " +
      "single retry cannot tell you anything about.",
    breaks: "The drop probability rises smoothly, a little with each extra connection.",
  },
  {
    slug: "ten-a-minute-that-never-finish",
    name: "Ten a minute that never finish",
    brief: "A scanner that opens connections and says nothing. Ten a minute. Barely a blip on the graph.",
    setup: {
      host: "edge-ssh",
      begin: 10,
      rate: 30,
      full: 100,
      graceSeconds: 120,
      arrivalsPerMinute: 60,
      authSeconds: 2,
      stuckPerMinute: 10,
    },
    question: "Sixty real connections a minute at two seconds each, plus ten that never authenticate. How many slots are standing?",
    options: [
      {
        id: "two",
        claim: "2 slots. Sixty a minute at two seconds each is two, and the scanner is a rounding error.",
        says: { about: "in-flight", count: 2 },
      },
      {
        id: "twelve",
        claim: "12 slots: the two real ones plus the ten the scanner opened this minute.",
        says: { about: "in-flight", count: 12 },
      },
      {
        id: "no-drops",
        claim: "Nothing is refused at this rate.",
        says: { about: "certainty", value: "accepted" },
      },
      {
        id: "twenty-two",
        claim: "22 slots, and only two of them belong to anybody real.",
        says: { about: "in-flight", count: 22 },
      },
    ],
    why:
      "A slot is held for as long as the connection stays unauthenticated, and a connection that never " +
      "authenticates holds one until LoginGraceTime cuts it off. Ten a minute times a hundred and " +
      "twenty seconds is twelve hundred connection-seconds a minute, which is twenty standing, on top " +
      "of the two the real traffic holds. Ten connections a minute is nothing on a bandwidth graph and " +
      "twice the default start value in the only unit sshd cares about.",
    fix:
      "LoginGraceTime 30 turns those twenty slots into five, at the cost of disconnecting anybody who " +
      "takes more than half a minute to type a password. PerSourceMaxStartups is the better answer when " +
      "the source is one address, because it caps that source without touching everybody else.",
    breaks: "Ten connections a minute is too little traffic to exhaust anything.",
  },
  {
    slug: "the-grace-that-never-expires",
    name: "The grace that never expires",
    brief: "Somebody set LoginGraceTime 0 to stop cutting off slow logins over a bad link.",
    setup: {
      host: "field-jump",
      begin: 10,
      rate: 30,
      full: 100,
      graceSeconds: 0,
      arrivalsPerMinute: 30,
      authSeconds: 4,
      stuckPerMinute: 2,
    },
    question: "Two connections a minute never authenticate, and now nothing disconnects them. Where does the count settle?",
    options: [
      {
        id: "four",
        claim: "4 standing: thirty a minute at four seconds each, and two a minute is negligible.",
        says: { about: "in-flight", count: 4 },
      },
      {
        id: "never",
        claim: "It does not settle. The count climbs until every connection is refused, and stays there.",
        says: { about: "in-flight", count: null },
      },
      {
        id: "ten",
        claim: "10 standing, which is where the start value pins it.",
        says: { about: "in-flight", count: 10 },
      },
      {
        id: "coin",
        claim: "It settles somewhere on the ramp, so each connection is a throw of the dice.",
        says: { about: "certainty", value: "coin" },
      },
    ],
    why:
      "LoginGraceTime is the only thing that reclaims a slot from a connection that will never finish. " +
      "Set it to zero and sshd_config(5) means exactly what it says: there is no time limit. Two a " +
      "minute that never authenticate is a hundred and twenty a hour of slots taken and none given " +
      "back, so the count crosses the start value, crosses the full value, and stops climbing only " +
      "because everything past that point is refused. The daemon does not recover on its own and " +
      "restarting it is the only thing that clears the count.",
    fix:
      "Put LoginGraceTime back. If slow links are the problem, raise it rather than remove it: 300 " +
      "gives a struggling client five minutes and still reclaims the slot in the end.",
    breaks: "LoginGraceTime 0 is the permissive setting, so it cannot cause a refusal.",
  },
  {
    slug: "past-the-ceiling",
    name: "Past the ceiling",
    brief: "A password-spraying run from a botnet, and the graph of successful logins goes to zero.",
    setup: {
      host: "edge-ssh",
      begin: 10,
      rate: 30,
      full: 100,
      graceSeconds: 120,
      arrivalsPerMinute: 60,
      authSeconds: 2,
      stuckPerMinute: 55,
    },
    question: "Fifty-five connections a minute hold their slots for the full grace. What happens to a real login now?",
    options: [
      {
        id: "high-odds",
        claim: "It gets through most of the time: the ramp is steep here but it has not topped out.",
        says: { about: "certainty", value: "coin" },
      },
      {
        id: "ninety-nine",
        claim: "99 percent of connections are refused, which leaves a narrow way in.",
        says: { about: "drop-percent", percent: 99 },
      },
      {
        id: "sixty",
        claim: "60 percent of connections are refused.",
        says: { about: "drop-percent", percent: 60 },
      },
      {
        id: "certain",
        claim: "It is refused, along with every other connection, until the spray stops.",
        says: { about: "certainty", value: "dropped" },
      },
    ],
    why:
      "Fifty-five a minute at a hundred and twenty seconds is a hundred and ten standing, plus two from " +
      "the real traffic: a hundred and twelve, past the full value of a hundred. The second guard " +
      "clause in should_drop_connection returns one without reaching the arithmetic, so there is no " +
      "probability left to be lucky against. Random early drop is only random between the first number " +
      "and the third.",
    fix:
      "PerSourceMaxStartups and PerSourcePenalties exist for this and are checked before MaxStartups in " +
      "drop_connection, so they refuse the spray without spending slots on it. Raising MaxStartups " +
      "instead buys a larger number for the botnet to fill.",
    breaks: "Random early drop means a connection always has some chance of getting through.",
  },
  {
    slug: "the-rate-that-is-a-hundred",
    name: "The rate that is a hundred",
    brief: "MaxStartups 10:100:200, written by somebody who read the third number as the one that matters.",
    setup: {
      host: "build-runner",
      begin: 10,
      rate: 100,
      full: 200,
      graceSeconds: 120,
      arrivalsPerMinute: 240,
      authSeconds: 3,
      stuckPerMinute: 0,
    },
    question: "Twelve connections are standing, well under the two hundred this daemon allows. What happens next?",
    options: [
      {
        id: "roomy",
        claim: "Nothing is refused. Twelve is nowhere near two hundred.",
        says: { about: "certainty", value: "accepted" },
      },
      {
        id: "small-chance",
        claim: "1 percent of connections are refused, which is the ramp barely starting.",
        says: { about: "drop-percent", percent: 1 },
      },
      {
        id: "all-of-them",
        claim: "Every connection past the tenth is refused, and the two hundred never comes into it.",
        says: { about: "certainty", value: "dropped" },
      },
      {
        id: "safe-begin-none",
        claim: "No start value helps while the rate is a hundred.",
        says: { about: "safe-begin", value: null },
      },
    ],
    why:
      "The third guard clause is the one that catches this: if the rate is a hundred, the function " +
      "returns one, whatever the full value says. It has to, because the arithmetic below it would " +
      "compute a probability of a hundred plus a non-negative term and the comparison against " +
      "arc4random_uniform(100) would be a formality. Writing 100 as the middle number turns a three " +
      "part random early drop into a hard limit at the first number, which is the opposite of what " +
      "raising the third number was meant to do.",
    fix:
      "MaxStartups 10:30:200 is the setting that was intended: the rate is the chance at the bottom of " +
      "the ramp, so it belongs well under a hundred. If a hard limit is what you want, write it as one " +
      "number: MaxStartups 200.",
    breaks: "The last of the three numbers is the one that decides when connections are refused.",
  },
  {
    slug: "nine-standing",
    name: "Nine standing",
    brief: "The daemon is busy, the dashboard is red, and somebody wants MaxStartups raised.",
    setup: {
      host: "bastion-1",
      begin: 10,
      rate: 30,
      full: 100,
      graceSeconds: 120,
      arrivalsPerMinute: 180,
      authSeconds: 3,
      stuckPerMinute: 0,
    },
    question: "One hundred and eighty connections a minute, three seconds each. Is the limit involved?",
    options: [
      {
        id: "no",
        claim: "No. Nothing is refused at this rate, and raising the limit would change nothing.",
        says: { about: "certainty", value: "accepted" },
      },
      {
        id: "yes-thirty",
        claim: "30 percent of connections are refused, which is what the dashboard is showing.",
        says: { about: "drop-percent", percent: 30 },
      },
      {
        id: "some",
        claim: "Some are refused and some are not, which is why it looks intermittent.",
        says: { about: "certainty", value: "coin" },
      },
      {
        id: "eleven",
        claim: "11 connections stand unauthenticated, one past the start value.",
        says: { about: "in-flight", count: 11 },
      },
    ],
    why:
      "A hundred and eighty a minute at three seconds each is five hundred and forty connection-seconds " +
      "a minute, which is nine standing. Nine is below the start value of ten, so the first guard " +
      "clause returns zero and the connection is accepted without any dice being thrown. Whatever the " +
      "dashboard is red about, it is not this, and the drop-connection lines that would prove it are " +
      "absent from the log.",
    fix:
      "Look for the actual refusal before changing the limit that would cause one. A daemon under " +
      "MaxStartups pressure logs drop connection #N ... MaxStartups, and no such line means the " +
      "mechanism never ran.",
    breaks: "A daemon busy enough to worry about is already dropping connections.",
  },
  {
    slug: "the-narrow-ramp",
    name: "The narrow ramp",
    brief: "MaxStartups 10:30:60, copied from the example in the manual page.",
    setup: {
      host: "git-ssh",
      begin: 10,
      rate: 30,
      full: 60,
      graceSeconds: 120,
      arrivalsPerMinute: 60,
      authSeconds: 5,
      stuckPerMinute: 15,
    },
    question: "Thirty-five connections are standing on a ten-thirty-sixty daemon. What are the odds of a refusal?",
    options: [
      {
        id: "thirty",
        claim: "30 percent. That is what the middle number means.",
        says: { about: "drop-percent", percent: 30 },
      },
      {
        id: "thirty-seven",
        claim: "37 percent, the same place the default setting reaches at this count.",
        says: { about: "drop-percent", percent: 37 },
      },
      {
        id: "sixty-five",
        claim: "65 percent, because the ramp has half the distance to cover.",
        says: { about: "drop-percent", percent: 65 },
      },
      {
        id: "thirty-five-standing",
        claim: "40 connections stand unauthenticated at this arrival rate.",
        says: { about: "in-flight", count: 40 },
      },
    ],
    why:
      "The middle number is the chance at the bottom of the ramp, not along it. Thirty-five standing is " +
      "twenty-five past the start, out of the fifty between start and full, so the term the code adds " +
      "to the rate is 70 times 25 over 50, which is thirty-five exactly. Sixty-five percent. The same " +
      "count on the default 10:30:100 gives thirty-seven, because there the twenty-five is out of " +
      "ninety. Narrowing the gap between the first and third numbers makes every intermediate " +
      "probability higher, which is the part the example in the manual page does not say.",
    fix:
      "Pick the third number from how many connections you are willing to have standing, not by copying " +
      "an example. The distance between the first and the third is the whole of the ramp, and a short " +
      "ramp is a cliff.",
    breaks: "The middle number is the drop probability while the limit is in effect.",
  },
  {
    slug: "raise-the-right-number",
    name: "Raise the right number",
    brief: "The change request says MaxStartups 10:30:400. It will not help.",
    setup: {
      host: "ci-ssh",
      begin: 10,
      rate: 30,
      full: 100,
      graceSeconds: 100,
      arrivalsPerMinute: 125,
      authSeconds: 4,
      stuckPerMinute: 7,
    },
    question: "What is the smallest MaxStartups start value that would refuse none of these connections?",
    options: [
      {
        id: "nineteen-standing",
        claim: "19 connections stand unauthenticated at this arrival rate.",
        says: { about: "in-flight", count: 19 },
      },
      {
        id: "twenty-one",
        claim: "21, one more than what is standing.",
        says: { about: "safe-begin", value: 21 },
      },
      {
        id: "twenty",
        claim: "20, which is what is standing.",
        says: { about: "safe-begin", value: 20 },
      },
      {
        id: "none",
        claim: "No start value helps. The third number is what decides this.",
        says: { about: "safe-begin", value: null },
      },
    ],
    why:
      "A hundred and twenty-five a minute at four seconds is five hundred connection-seconds, and seven " +
      "a minute at the hundred second grace is seven hundred: twelve hundred a minute, which is twenty " +
      "standing once the count settles. Divide each of those two by sixty before adding them and you " +
      "get eight and eleven, which is nineteen, and nineteen is one of the answers offered above. The " +
      "daemon holds connection-seconds, not roundings, so the division belongs at the end. The first " +
      "guard clause is the only one in the function that returns a definite accept and it compares " +
      "against begin alone, so the start value has to be strictly greater than what is standing: " +
      "twenty-one. Raising the full value to four hundred instead would flatten the ramp and take the " +
      "odds at twenty standing from thirty-seven percent down to thirty-one, and thirty-one is not zero.",
    fix:
      "MaxStartups 40:30:200 on a host like this: the first number clear of the real occupancy, the " +
      "third far enough out that the ramp is gentle. Then fix the seven a minute that never " +
      "authenticate, because they account for seven hundred of the twelve hundred connection-seconds.",
    breaks: "Raising the last number in MaxStartups is how you stop connections being dropped.",
  },
  {
    slug: "the-slow-directory",
    name: "The slow directory",
    brief: "The directory server went to a replica across a region. Authentication went from two seconds to thirty.",
    setup: {
      host: "corp-bastion",
      begin: 10,
      rate: 30,
      full: 100,
      graceSeconds: 120,
      arrivalsPerMinute: 60,
      authSeconds: 30,
      stuckPerMinute: 0,
    },
    question: "Same sixty connections a minute as yesterday. Authentication now takes thirty seconds. What changed?",
    options: [
      {
        id: "just-slow",
        claim: "Logins are slower and nothing else. Nothing is refused.",
        says: { about: "certainty", value: "accepted" },
      },
      {
        id: "forty-five",
        claim: "45 percent of connections are now refused outright at some point in the attempt.",
        says: { about: "drop-percent", percent: 45 },
      },
      {
        id: "two-standing",
        claim: "2 connections stand unauthenticated, the same as yesterday.",
        says: { about: "in-flight", count: 2 },
      },
      {
        id: "all-refused",
        claim: "Every connection is refused: thirty seconds is past the grace.",
        says: { about: "certainty", value: "dropped" },
      },
    ],
    why:
      "Occupancy is arrival rate times holding time, and only one of those changed: sixty a minute at " +
      "thirty seconds is eighteen hundred connection-seconds a minute, which is thirty standing where " +
      "it was two. Thirty is twenty past the start value, so the ramp puts the odds at forty-five " +
      "percent and roughly two connections in five are refused. Nothing about the login rate moved. A " +
      "latency problem in a dependency became an availability problem in the daemon, without any " +
      "counter in between going red.",
    fix:
      "Watch the occupancy, not the login rate: sshd -T will print the effective MaxStartups and the " +
      "count of established unauthenticated connections is a ss -tn state syn-recv away. And fail the " +
      "directory lookup fast, because a slow dependency behind authentication spends the daemon's " +
      "slots at exactly the rate it is slow.",
    breaks: "Slow authentication makes logins slow, not impossible.",
  },
];
