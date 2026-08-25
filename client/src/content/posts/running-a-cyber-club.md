
## A Club Is An Operations Problem

I am president of the Cyber Club at my school, and the thing that surprised me
most is how little of the job is about security. It is about scheduling,
infrastructure, and making sure that a person who shows up for the first time in
November is not immediately lost.

The failure mode for a technical club is well known even if nobody names it. The
first three meetings are packed. By the sixth, attendance has collapsed to the
four people who already knew the material, and the club quietly becomes a study
group for the competition team. That is not a recruiting problem. It is a
curriculum problem, and it is solvable with structure.

## The Curve Problem

On any given afternoon a club room contains people who have never opened a
terminal and people who are comfortable reading a packet capture. A single
lesson cannot serve both. Aim at the beginners and the experienced members are
bored. Aim at the experienced members and everyone else concludes they are not
smart enough, which is both false and the single most common reason people quit.

Two structures handle this without splitting the club in half.

The first is a shared start and a forked finish. Everyone gets the same fifteen
minute concept, then the hands on portion has two or three difficulty tracks
against the same scenario. Beginners find the open port; intermediate members
identify the service and its version; advanced members write the detection rule
that would have caught it. Everyone worked on the same thing, so the debrief at
the end is a real conversation rather than two disconnected ones.

The second is that experienced members teach. Not as a favour to me, as the
actual mechanism of their own learning. Explaining subnetting to someone who
does not get it will find the holes in your understanding faster than any
practice problem. I try to make sure every returning member runs at least one
session a semester.

## Build A Ladder, Not A Lecture Series

I plan a semester as a ladder where each rung is a thing you can do at the end
of one meeting, and each rung obviously supports the next.

An early rung is navigating a filesystem and reading a log file. The next is
searching that log with grep for something specific. The next is noticing a
pattern across many lines. By the fourth or fifth meeting a beginner is doing
real log analysis, and they got there without a lecture on log analysis.

Capture the flag style challenges fit this well because they are self pacing and
self verifying. A flag is either right or it is not, so nobody has to wait for me
to grade anything, and someone who solves a challenge in five minutes moves to
the next one without being held up. Deliberately vulnerable applications
maintained by security communities give you a supply of realistic targets
without needing to invent them.

The rule I hold to is that nothing gets taught as trivia. If we cover a protocol,
we look at it on the wire in the same meeting. If we cover a tool, everyone runs
it before they leave. A concept that was never executed does not survive the
week.

## Infrastructure That Does Not Depend On Me

The practical constraint is that club machines get broken, because breaking
things is most of the point. If restoring the environment requires me
personally, then the club runs at the speed of my availability, and a member who
wants to practise on a Saturday cannot.

So the environment resets itself. Every member gets an identical container or
virtual machine from a template, and there is a script that destroys and
recreates all of them from scratch. Anyone with access can run it.

```bash
#!/usr/bin/env bash
# Rebuild every member lab from the template. Safe to run at any time.
set -euo pipefail

TEMPLATE="lab-base:current"
NETWORK="clublab"
ROSTER="/srv/club/roster.txt"     # one member handle per line

docker network inspect "$NETWORK" >/dev/null 2>&1 \
  || docker network create --internal "$NETWORK"

while read -r member; do
  [[ -z "${member:-}" || "$member" == \#* ]] && continue
  name="lab-${member}"

  docker rm -f "$name" >/dev/null 2>&1 || true
  docker run -d \
    --name "$name" \
    --hostname "$member" \
    --network "$NETWORK" \
    --memory 1g --cpus 1 \
    --restart unless-stopped \
    "$TEMPLATE"

  echo "rebuilt ${name}"
done < "$ROSTER"
```

Two details in there are deliberate. The network is internal, so a lab that gets
compromised during an exercise cannot reach anything else, which is the whole
reason a teacher will let you run this at all. And the resource limits mean one
member's fork bomb does not end the meeting for everyone else.

Everything else lives in a repository: the meeting plans, the challenge sources,
the template definition. If I graduate and the repository is the club, the club
continues. If I graduate and the knowledge is in my head, it does not.

## Competition Prep, And Handing The Club Off

Competing in the National Cyber League taught me that the difference between
people who place well and people who do not is almost entirely about practice
distribution. Consistent short sessions beat a frantic week beforehand, because
the skills involved are recall and pattern recognition, and both decay without
repetition.

So I treat prep as a training schedule rather than an event. Regular short
practice on rotating categories, so nobody neglects the one they dislike, which
is invariably the one they most need. A written record of every technique that
worked, because the same puzzle shapes recur and a personal notes file is worth
more than any tool. And timed practice, because working under a clock is a
separate skill from working correctly, and the first time you experience it
should not be during the competition.

The measure of a club president is not what happens while you are there. Growing
a club to fifty members who all depend on you is a worse outcome than growing it
to twenty who can run a meeting without you.

Practically that means: someone other than me runs a meeting every month; the
documentation is good enough for a member to prepare a session from it; and at
least one person junior to me knows how the infrastructure works well enough to
fix it. None of that is glamorous, and it is the only part that survives.

## References

- [National Cyber League](https://www.nationalcyberleague.org/)
- [CyberPatriot: the National Youth Cyber Education Program](https://www.cyberpatriot.org/)
- [OWASP Juice Shop](https://owasp.org/www-project-juice-shop/)
- [NICE Workforce Framework for Cybersecurity](https://www.nist.gov/itl/applied-cybersecurity/nice)
- [Capture the flag (cybersecurity)](https://en.wikipedia.org/wiki/Capture_the_flag_%28cybersecurity%29)
