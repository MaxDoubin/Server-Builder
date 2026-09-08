
## Break it on purpose

Here is the only reliable way to know whether a test works: break the thing
it exists to catch, and watch it fail.

That sounds too obvious to write down. It is not what most of us do. We
write the assertion, the suite goes green, and green feels like the answer.
But a check that has never been red has told you nothing at all. It has the
same output on working code and on a subtly broken variant, and you have no
evidence which of those you are looking at.

I have started calling this blinding the check, after the medical usage:
you deliberately withhold the answer and see whether the instrument still
finds it. It has caught something in almost every check I have written this
year, and twice this week it caught the check itself.

## The first one: the answer was always B

I built an exercise where you read a log and say what happened. Eight logs,
four options each, one right.

The data checks were the usual: every option is supported by real lines in
the log, the answer is one of the listed options, the deciding line exists,
the explanation is long enough to be an explanation. All green.

Then I added one more, mostly out of superstition:

```ts
const positions = CASES.map((item) =>
  item.options.findIndex((option) => option.id === item.answer),
);
const counts = new Map<number, number>();
for (const position of positions) {
  counts.set(position, (counts.get(position) ?? 0) + 1);
}

for (const [position, count] of counts) {
  if (count > Math.ceil(CASES.length / 2)) {
    problems.push(
      count + " of " + CASES.length + " answers are option " + (position + 1) +
        "; a reader who always picks that one passes",
    );
  }
}
```

```
7 of 8 answers are option 2; a reader who always picks that one passes
```

I had written the plausible wrong answer first and the correct one directly
underneath it. Eight times. Without noticing once.

Every content check I had written was passing, because every one of them
looked at a case in isolation. The defect only exists across the set: any
individual case is fine, and the collection is broken. Somebody could have
scored eight out of eight without reading a single log.

That is the shape worth remembering. **Per-item validation cannot see a
distribution.** If your fixtures have an answer key, something has to look
at the shape of the key.

## The second one: a rule that was almost the rule

The second was worse, because the check existed, ran, passed, and tested
nothing.

The exercise walks a packet down a network path. Somewhere a link is too
small, a router drops the packet and sends back an ICMP saying what size it
could have taken, and if a firewall in between drops that ICMP, the sender
never learns anything and the connection hangs instead of failing.

So the model has to name which hop swallowed the message. It walks back
from the drop point towards the sender and blames the first blocker it
meets, because that is the one the message actually hits first:

```ts
for (let back = index; back >= 0; back -= 1) {
  if (path.hops[back].blocksIcmp) {
    return { kind: "blackholed", at: index, needs: hop.mtu, swallowedAt: back };
  }
}
```

And I wrote a check for it:

```ts
// The hop blamed for the silence must sit between the drop point and the
// sender. A firewall beyond the drop point never sees the message.
if (fate.swallowedAt > fate.at) {
  problems.push("blames a hop behind the message on the return path");
}
if (!path.hops[fate.swallowedAt].blocksIcmp) {
  problems.push("blames a hop that does not block ICMP");
}
```

Reasonable. Two real properties, both true of the correct answer.

Then I blinded it. I changed the loop to walk forwards, from the sender
towards the drop point, which is the natural typo and gives the wrong hop
whenever two hops block:

```ts
for (let back = 0; back < path.hops.length; back += 1) {
```

The check passed.

Both assertions were still satisfied. The hop it blamed did block ICMP.
The hop it blamed was before the drop point. Both true, and both true of
the wrong answer.

## The tell

Look at what those two assertions actually say:

- the blamed hop blocks ICMP
- the blamed hop is at or before the drop point

Now look at the rule:

- the blamed hop is the **last** blocker at or before the drop point

The assertions are consequences of the rule. Necessary conditions, not
sufficient ones. On a path with one blocker there is only one candidate, so
they pin it exactly. On a path with two, they admit both, and the check
cannot tell a correct model from a broken one.

Every path I had built happened to have its blockers arranged so that both
directions gave the same answer. That is not a coincidence I engineered; it
is what happens when you write the fixtures and the checks in the same
sitting with the same mental model. The fixtures could not distinguish the
cases because it had not occurred to me that there were two cases.

The fix was two things, and both were needed.

State the actual rule, computed independently in the check rather than
inferred from the model's output:

```ts
let expected = -1;
for (let index = fate.at; index >= 0; index -= 1) {
  if (path.hops[index].blocksIcmp) {
    expected = index;
    break;
  }
}
if (fate.swallowedAt !== expected) {
  problems.push(
    "blames hop " + fate.swallowedAt + " for a message generated at hop " +
      fate.at + ", and the first blocker it meets travelling back is hop " +
      expected,
  );
}
```

And add a fixture where the two answers differ: two firewalls, with the
second one between the first and the link that drops the packet. Now
walking the wrong way blames a device that never saw the message and would
not have helped if somebody had changed it, which is exactly the failure
mode worth catching, because it sends a real person to reconfigure the
wrong box.

Both blindings fire now.

## Necessary is not sufficient

The two failures look different and are the same mistake. I asserted
something that is true when the code is right, rather than something that
is false when the code is wrong.

It is an easy mistake because the weak version is easier to write. "The
result is one of the valid options" is a one-liner. "The result is
*this specific* valid option, computed a second way" means implementing the
rule again, which feels like duplication and is the entire point: two
independent derivations that have to agree.

A few forms this takes, in rough order of how often I have caught myself:

**Asserting membership instead of identity.** The answer is in the list;
the parse produced a number; the status is one of the allowed ones. All
satisfied by the wrong element of the set.

**Asserting a bound instead of a value.** Throughput is under the line
rate. Almost anything is under the line rate.

**Asserting shape instead of content.** Ten rows came back, each with the
right keys. Ten wrong rows have the right keys too.

**Checking each item and never the set.** Which is the first failure, and
also why "no duplicate slugs" is worth having even when it looks paranoid.

The counter-question I now ask, for every assertion: *what is the most
plausible bug that would leave this passing?* If I can answer quickly, the
assertion is too weak and I already know what to write instead.

## Making it a habit rather than a virtue

Blinding sounds expensive. It is about ninety seconds:

```bash
cp src/thing.ts /tmp/thing.bak
sed -i 's/<= mtu/< mtu/' src/thing.ts   # the off-by-one
npx tsx scripts-ci/check-thing.ts       # does it notice?
cp /tmp/thing.bak src/thing.ts
```

Do it for each defect the check claims to catch. If the check has one
assertion, that is one blinding. If it has six, that is six, and the six
things you break should be the six most plausible bugs rather than six
random mutations, because the point is not coverage. The point is evidence
that this instrument detects the failures it was built for.

Mutation testing automates a version of this, and it is worth running if
your language has a decent tool. What it will not do is tell you that your
*fixtures* cannot distinguish two behaviours, which was the harder half of
the second failure. A mutation tool would have flipped the loop direction
and reported the mutant as killed or survived, but only against the data I
already had; the missing piece was a topology I had not thought to build.

## The part I keep relearning

Both of these were checks I wrote deliberately, thought about, and was
pleased with. Neither was sloppy. The first was defeated by a bias I could
not see because it was mine, and the second by a rule I stated one degree
too weakly and never tested against a case that could tell the difference.

Green means the check did not fire. That is all it means. Whether the check
*could* have fired is a separate question, and the only way to answer it is
to make it fire on purpose, at least once, before you start trusting it.

## References

- [Mutation testing: Stryker's introduction](https://stryker-mutator.io/docs/)
- [RFC 1191: Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc1191.html)
- [RFC 4821: Packetization Layer Path MTU Discovery](https://www.rfc-editor.org/rfc/rfc4821.html)
- [Hillel Wayne on property-based testing and what assertions buy you](https://www.hillelwayne.com/post/contracts/)
