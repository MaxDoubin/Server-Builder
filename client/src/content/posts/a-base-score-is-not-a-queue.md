## The only number that arrived

An advisory lands. It has a paragraph of prose, a list of affected versions, a
patch or a promise of one, and exactly one number: a CVSS base score, to one
decimal place, out of ten.

Everything downstream sorts by it, because it is the only thing in the
advisory that sorts. The scanner sorts by it. The ticket queue inherits the
scanner's order. The weekly report counts how many Criticals are outstanding.
And whoever works the queue starts at the top, which is where the 9.8 is.

The specification that defines the score says, in the section on the metric
groups, that a base score represents the intrinsic characteristics of a
vulnerability, that it is constant across environments and over time, and that
it is intended to be adjusted by the temporal and environmental metric groups
to reflect the vulnerability as it exists in a particular deployment. Those
groups are optional. Almost nobody fills them in. So the number that sorts the
queue is, by its own definition, the part of the assessment that deliberately
knows nothing about you.

## What it cannot see

Four things decide what you actually do about an advisory. Three of them are
not in a base score at all.

**Whether anybody is exploiting it.** Not a base metric. In v3.1 that lives in
the temporal group as Exploit Code Maturity, and in v4.0 it moved to the
threat group as Exploit Maturity. A vulnerability nobody has ever attempted
and one that shipped in three exploit kits last Tuesday get the same base
score, because the base score is about the flaw and not about the world.

**Whether your instance is reachable.** Attack Vector says the flaw is
network-reachable, adjacent, local or physical. It does not say whether your
copy of the affected component is on the internet, on a management VLAN nobody
can route to, or compiled out of the build entirely. That is Modified Attack
Vector, in the environmental group, which is optional.

**What the machine does.** Confidentiality, Integrity and Availability in the
base group describe impact to the vulnerable component. Whether that component
holds the customer records or renders an internal report is the Security
Requirements sub-group, environmental, optional.

The fourth one is more interesting because it is partly there. Whether the
first four steps of an attack can be driven in a loop correlates hard with
Attack Complexity Low, Privileges Required None and User Interaction None. But
it is not the same question. A vulnerability that needs a domain credential
scores Privileges Required Low, which reads as a barrier, and if every
employee in the company holds a domain credential then it is not one. The
score is right and the inference from it is wrong.

## The precision is fake

Here is the part I did not expect until I counted it.

The v3.1 base score is computed from eight metrics, which between them have
four, two, three, two, two, three, three and three possible values. That is
2,592 distinct vulnerabilities as far as the formula is concerned. I
implemented the formula from the specification, including the Roundup function
the spec defines in its appendix precisely so that everyone gets the same
answer, and enumerated all 2,592.

They produce 84 distinct scores.

```
2,592  metric combinations
   84  distinct base scores reachable (including 0.0)
   25  combinations per score, median
   17  of the 101 one-decimal values that are unreachable
```

The unreachable ones are worth knowing. There is no such thing as a CVSS 1.2,
or a 0.7, or anything between 0.1 and 1.5: the lowest nonzero score the
formula can produce is 1.6, because any nonzero impact plus any exploitability
at all clears that. And, more surprisingly, there is no such thing as a 9.5 or
a 9.7. If you see one, somebody typed it.

So a scale that presents itself as 0.0 to 10.0 with a decimal place has 84
rungs, 25 different vulnerabilities on the average rung, and gaps in it. The
decimal place is not measuring anything. It is a formula whose output happens
to have a fractional part.

## Both frameworks have four buckets

The alternative I have been using is the SSVC deployer decision tree, which
asks four questions and answers with one of four words: defer, scheduled,
out-of-cycle, immediate. Four outcomes sounds crude next to a number with a
decimal place in it, and that is exactly the reaction the number is built to
produce.

The tree has 72 rows, one for each combination of its four decision points.
Sorted by outcome:

```
    7  defer          9.7%
   42  scheduled     58.3%
   20  out-of-cycle  27.8%
    3  immediate      4.2%
```

And the 2,592 CVSS combinations, sorted into the qualitative severity bands
the specification attaches to the score:

```
   96  None           3.7%
  416  Low           16.0%
 1464  Medium        56.5%
  555  High          21.4%
   61  Critical       2.4%
```

Fifty-six and a half percent in the middle bucket, against fifty-eight and a
third. Two point four percent at the top, against four point two. The two
frameworks discriminate to almost exactly the same degree. They put nearly the
same share of their input space in one undifferentiated middle, and both are
conservative about the top.

The difference is not granularity. It is that one of them tells you it has
four buckets and the other prints 6.1 and lets you infer that it has a hundred
and one.

## What actually changes

I built a page for practicing this: ten advisories from one week, each with a
description of the estate they landed in, and the exercise is to say what you
do about each. The two orderings, base score and decision tree, come out
noticeably different on that set. Eleven of the forty-five pairs are the other
way round. The worst single disagreement moves a finding seven places: a 6.5
that is being exploited across the internet against a system you publish on
purpose sits ninth of ten in the scanner's order and second in the tree's.

Three of the ten do not move at all, and that matters more than the seven that
do. Base score is not backwards. It is not evidence, which is a different and
less satisfying claim, and it is why "just invert the scanner" would be as
wrong as trusting it. The two orderings agree wherever the four things the
score cannot see happen to line up with the things it can.

## Why the wrong number wins

None of this is secret. The specification says what the base score is for in
its own words, at the top, before the formula. Every practitioner who has
looked into it knows that a base score is not a risk score. And the queue is
still sorted by base score, everywhere, including in tools written by people
who know all of the above.

I think it is the decimal place. A number that resolves to one decimal reads
as a measurement, and a judgment that resolves to four words reads as an
opinion, and we trust measurements over opinions for good reasons that do not
apply here. The measurement is measuring the vulnerability. The opinion is
about your estate. Only one of those is the thing you have to make a decision
about, and it is not the one with the decimal place.

The fix is not to stop using CVSS. It is to stop letting the only number in
the advisory be the only input to the decision, which mostly means writing
down the other four and finding that they were not hard to answer. Reachable
from where an attacker is: yes or no. Anybody exploiting it: yes, published,
or no. Scriptable in a loop: yes or no. What the machine does. None of those
needed a formula, and all four of them changed the answer.

You can [work through the ten advisories](/patch) with the tree, and watch
where the two queues part company.

## References

- [CVSS v3.1 specification, on the metric groups and the Roundup function](https://www.first.org/cvss/v3.1/specification-document)
- [CVSS v4.0 specification, where exploit maturity becomes a threat metric](https://www.first.org/cvss/v4.0/specification-document)
- [SSVC: the deployer decision tree, and its four decision points](https://certcc.github.io/SSVC/howto/deployer_tree/)
- [EPSS, on estimating the probability that a vulnerability is exploited](https://www.first.org/epss/)
- [NIST SP 800-40r4: enterprise patch management planning](https://csrc.nist.gov/pubs/sp/800/40/r4/final)
