
## Why it matters

You have two hours, a room of twelve to fifteen year olds with wildly different experience, laptops you do not control, and no idea whether the wifi will hold. The goal is not to teach them a language. It is to get every single person to the end of the session having made something work, because that is what decides whether they come back.

Technical education changes life trajectories. A student who discovers they are good at programming at 13 has years of compounding learning ahead of them before they ever start a career. Someone who finds out at 22 has to move faster with less time. Getting the exposure early makes a real difference.

The Las Vegas Valley has a lot of students who would thrive in technical careers but who have not yet encountered the right context or the right encouragement. The coding camps try to close that gap.

## What I have learned about teaching

**The first hour is everything.** If a student does not have a successful experience in the first hour, they disengage. The first project has to work, has to be interesting, and has to feel achievable. I design every camp to put something working in front of students within the first 30 minutes.

**Projects over lectures.** I have tried pure instruction and I have tried project-based learning. There is no comparison. Students who are building something retain concepts dramatically better than students who are being told about those concepts.

**The right level of difficulty.** Too easy and it is boring. Too hard and it is discouraging. The sweet spot is something that requires real thinking but is achievable in the session. Finding that balance for a room with varied experience levels is the hardest part of teaching.

That last one has a name in education research: the zone of proximal development, the band of tasks a learner cannot do alone but can do with support. Everything below it is busywork and everything above it is a wall. Practically, this means every activity needs a floor and a ceiling written before the session: the minimum that counts as done, and two extensions for whoever finishes in ten minutes.

## Solve the environment before you solve anything else

The single biggest destroyer of a first session is installation. School laptops without administrator rights, a filtered network that blocks the package index, twenty students downloading the same installer over one access point. You can lose ninety minutes and teach nothing.

Pick one of three approaches and commit to it:

- **Browser based.** Nothing to install, works on a Chromebook, survives a locked-down image. This is the default choice for a one-off session.
- **Pre-imaged machines.** Only viable if you control the hardware and can set it up the day before. Test by logging in as a student account, not as yourself, because your account has permissions theirs does not.
- **One shared server.** Everyone connects to a machine you already configured. It works well for older students and it teaches something real about remote systems, but it dies completely if the network does.

Whatever you choose, do a full dry run on the actual equipment in the actual room. "It works on my laptop" is the most expensive sentence in teaching.

## The first thirty minutes, concretely

Here is the shape of an opener that reliably works. Give students a file that already runs, have them run it, then have them change one number.

```python
import turtle

t = turtle.Turtle()
t.shape("turtle")

for _ in range(4):
    t.forward(100)
    t.right(90)

turtle.done()
```

Correct output is a window that opens and a small turtle drawing a square, one side at a time, slowly enough to watch. That visible movement is doing a lot of work: the loop is not an abstraction, it is a thing walking around the screen four times.

Then ask one question: change it to draw a triangle. Most students change the 4 to a 3 and get an open shape with a wrong angle, which is exactly the productive failure you want. The rule they discover is that the turn is 360 divided by the number of sides. Nobody who works that out themselves forgets it, and nobody who is told it remembers it past lunch.

For a group that has seen loops before, I move to something with a security hook, because that is the door most of these students eventually walk through:

```python
def shift(text, key):
    out = ""
    for ch in text:
        if ch.isalpha():
            base = ord("A") if ch.isupper() else ord("a")
            out += chr((ord(ch) - base + key) % 26 + base)
        else:
            out += ch
    return out

print(shift("Meet me at noon", 3))
print(shift("Phhw ph dw qrrq", -3))
```

Correct output:

```
Phhw ph dw qrrq
Meet me at noon
```

Then the real exercise: break it without the key. There are only 25 possibilities, so loop over all of them and read the one that makes sense. Students who have never thought about cryptography arrive at brute force on their own in about four minutes, and the conversation about why that works here and does not work on a modern cipher writes itself.

## Teach reading errors, not avoiding them

The skill that separates students who keep going from students who quit is not syntax. It is what they do in the ten seconds after red text appears. Most beginners read an error as a verdict on themselves rather than as information.

So I teach the shape of a traceback explicitly, early, with a bug I introduce on purpose:

```
Traceback (most recent call last):
  File "cipher.py", line 12, in <module>
    print(shift("Meet me at noon", "3"))
  File "cipher.py", line 6, in shift
    out += chr((ord(ch) - base + key) % 26 + base)
TypeError: unsupported operand type(s) for +: 'int' and 'str'
```

Read it bottom up. The last line says what went wrong: something tried to add a number and a piece of text. The line above it says where the failure happened. The lines above that say how the program got there. In this case the fix is at line 12, not line 6: the key was passed as `"3"` in quotes instead of `3`.

Every student who learns to read that block stops needing me for a whole category of problem. That is the actual goal.

## What students teach me

Teaching forces you to understand things more deeply. When a student asks why we use a for loop instead of copying code three times, you have to explain clearly and completely. If your explanation is confusing, it usually means your own understanding has a gap.

I have refined my understanding of basic programming, logic, and systems concepts by having to explain them simply to people who have no context at all. That kind of clarity is useful far beyond the classroom.

The questions that expose gaps are almost never the advanced ones. They are things like why counting starts at zero, or why the computer cares about the difference between `=` and `==`, or what a variable actually is if it is not a box. Answering those honestly, without hand waving, is harder than it looks and it improves how you write code.

## Common mistakes

**Letting setup consume the session.** Twenty students installing anything at once will not finish together. Pre-install, pre-image, or use a browser, and have a fallback ready for the three machines that will fail anyway.

**No plan for the student who finishes first.** They will get bored in ten minutes and then they will help their neighbour in the least helpful way possible, by taking the keyboard. Write two extension tasks per activity in advance and hand them out without ceremony.

**Making students copy code off a projector.** Every typo becomes a debugging session about the typo instead of the concept, and the slow typists fall a full activity behind. Give them a file that already runs and have them modify it.

**Smart quotes.** Code pasted from a slide deck or a shared document arrives with typographic quotation marks instead of straight ones, and Python rejects it with a syntax error that points at a character that looks correct on screen. Distribute code as plain text files, never through a word processor.

**Assuming a confused student will say so.** Most will not, in front of their peers. Use a visible non-verbal signal, a sticky note on the screen edge or a card flipped to red, and circulate constantly rather than waiting at the front.

**Ending with nothing to take home.** A student who cannot show a parent what they built had a fun afternoon and nothing more. Budget the last five minutes for saving the file somewhere they can reach it and taking a screenshot of what it does.

## Looking forward

I want to expand what we cover in the camps beyond basic coding. Networking fundamentals, cybersecurity basics, and systems thinking are all approachable at a high school level and are genuinely valuable career skills. The foundation we build early shapes what people pursue later.

The bridge is already there in the material. The Caesar cipher exercise is a cryptography lesson wearing a loop exercise as a disguise. A session on how a web page reaches a browser is a networking lesson. Students do not need the vocabulary first; they need something on the screen that behaves in a way they can poke at, and the vocabulary attaches itself afterwards.

## References

- https://docs.python.org/3/tutorial/index.html
- https://docs.python.org/3/library/turtle.html
- https://docs.python.org/3/tutorial/errors.html
- https://en.wikipedia.org/wiki/Scratch_(programming_language)
- https://en.wikipedia.org/wiki/Zone_of_proximal_development
- https://en.wikipedia.org/wiki/Pair_programming
