
## They are evidence of different things

I am in tenth grade and I have to make this call constantly, because study time
is finite and there is always another certification I could be working toward
and always another thing in the lab I could be building. Framing it as "which
is better" never helped me. Framing it as "what does each one prove, and to
whom" did.

A certification proves you covered a syllabus and passed a standardized test on
a known date. It is legible to people who cannot evaluate your technical work
directly: HR filters, application forms, scholarship committees, the first
screen of a hiring pipeline. That legibility is the entire product. Nobody
believes a certificate means you can do the job. They believe it means you sat
down, worked through a defined body of material, and finished.

A project proves you can make something work when nobody has given you the
answer key. It is legible to engineers, which is a smaller but much more
decisive audience. It also demonstrates something no exam can: that you kept
going after the first thing broke.

I hold CompTIA Tech+, and I run a home data center. Those two facts do
completely different work when someone is deciding whether to take me
seriously.

## Where each one genuinely fails

Certifications teach you vocabulary and breadth, which is genuinely valuable.
You cannot search for something you have never heard of, and studying for an
exam is an efficient way to encounter a large number of concepts once. The
failure is that exam knowledge is shaped like exam questions. You learn the
seven layers and the port numbers and the definitions, and none of that tells
you what to do when packets are being silently dropped and every layer looks
fine.

Projects teach you debugging, which is most of the actual job. The failure is
gaps. Self directed learning follows your interests, and your interests have
holes in them. I would not have gone looking for spanning tree behavior or
subnet math on my own; a syllabus made me learn things I did not know I needed.

So the honest answer is that each one patches the other's weakness, which is
unsatisfying but true.

## The order I would actually recommend

If someone asked me where to start with no background, I would say: get one
foundational certification, then build for a long time, then get a specialized
certification once you have context to hang it on.

The first cert exists to give you the map. Without vocabulary you cannot read
documentation, you cannot search effectively, and you cannot tell which of the
five answers on a forum is the correct one. That is worth a few months.

Then build. Break things. This phase should be long, and it should include at
least one project that took you longer than you expected and made you want to
quit, because that is where the actual skill accumulates. Reading about VLAN
segmentation is a paragraph. Segmenting a live network without locking yourself
out of your own management interface teaches you something the paragraph
cannot.

Then specialize with a cert, if you want one. The difference is that now the
material lands on top of experience instead of floating free. Studying a
routing protocol after you have watched adjacencies fail to form is a
completely different experience from studying it cold.

## Making a project legible

Here is the part people get wrong. A project only counts as evidence if someone
else can understand it, and "I have a homelab" communicates almost nothing. It
sounds the same coming from someone with a spare laptop and someone running
real infrastructure.

What makes it legible:

- **State the problem, not the equipment.** "I segmented the network so lab
  systems cannot reach household devices" beats a parts list. The parts list is
  a purchase. The segmentation is a decision.
- **Say what broke and what you did.** Anyone can describe a working system.
  Describing a specific failure, how you diagnosed it, and what you changed is
  the part that proves you were actually there.
- **Write it down as you go.** Not for an audience, for yourself. Then when
  someone asks, you have real detail instead of a vague memory.
- **Show a decision with a tradeoff.** Every real engineering choice gives
  something up. Being able to say what you gave up and why is the difference
  between having built something and having followed a tutorial.

The skeleton I use for every project writeup, kept in the repo next to the
thing it describes:

```markdown
# <project>

## Problem
One paragraph. What was wrong or missing before this existed.

## Constraints
Budget, power, physical space, what had to keep running while I worked.

## Design
The approach, and the two alternatives I rejected with the reason.

## What broke
The specific failures, the symptom, how I diagnosed each one.

## Result
What is measurably different now. What I would do differently.
```

The "what broke" section is the one that carries weight, and it is the one
nobody writes. Fill that in while you still remember the details, because a
week later it compresses down to "there were some issues" and the evidence is
gone.

The same principle applies in competition. Placing well in the National Cyber
League is a number, and the number opens the door. What I can say about how the
team worked through a category we were weak in is what makes the conversation
go somewhere.

## How I split it now

Roughly: most of my time on building and competing, a defined block on
certification study when there is a specific exam I have decided is worth it,
and a standing rule that I do not start a new certification while a project is
half finished. Half finished projects are the real tax. They consume the mental
space of a commitment while producing none of the evidence.

Teaching has turned out to be the multiplier on both. Running coding camps for
younger students forced me to actually understand things I thought I understood,
because a twelve year old asking "but why" three times in a row is a more
rigorous examiner than any test I have taken. If you want to find the holes in
your own knowledge, try explaining it to someone who has no reason to pretend it
made sense.

## References

- [CompTIA certifications](https://www.comptia.org/certifications)
- [National Cyber League](https://nationalcyberleague.org/)
- [CyberSeek career pathway](https://www.cyberseek.org/)
- [NICE Framework, NIST](https://www.nist.gov/itl/applied-cybersecurity/nice)
