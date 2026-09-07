
## A check that names the wrong thing is worse than no check

This site draws sixteen server racks. Each one exists twice: as a rack
definition, a list of devices and the units they occupy, and as a 3D model
built by a generator that keeps its own copy of the layout. Two sources for
one truth is a drift waiting to happen, so there is a check in CI that reads
the shipped model, pulls out the vertical position of every device, and fits
it against the order the definition declares. If a device is not where the
list says, the build fails.

It has caught real faults. It also, one afternoon, told me that sixteen of
twenty one devices in a Cisco rack had moved, that a rack unit in the model
measured 37mm instead of 44.45mm, and that this was what two devices being
swapped looks like.

Nothing was swapped. One thing had moved, and the check was describing its
own arithmetic.

## What it was doing

The fit is a straight line. Device centres go down the rack at one rack unit
per unit, so the height of the nth device is a linear function of n, and
recovering that line gives you both a check on the unit size and a residual
per device. The rack's origin has to be recovered rather than assumed,
because a 12U studio frame on casters and a 42U cabinet bolted to the floor
do not start their first unit in the same place.

The line was fitted with least squares, which is the thing anybody reaches
for and is wrong here for a specific reason.

## Why least squares was the wrong tool

Least squares minimises the sum of squared residuals, which means every
point pulls the line and a distant point pulls hardest:

> least squares estimates for regression models are highly sensitive to
> outliers: an outlier with twice the error magnitude of a typical
> observation contributes four (two squared) times as much to the squared
> error loss

The consequence has a name, and it is exactly what I was looking at:

> Because the least squares predictions are dragged towards the outliers,
> and because the variance of the estimates is artificially inflated, the
> result is that outliers can be masked.

Masked. The two devices that had actually moved were sitting in a list of
sixteen, indistinguishable from fourteen that had not, and the fourteen were
only there because the two had dragged the line out from under them.

This is the same property that makes an average useless on a dataset with
one absurd value in it. The formal version of the idea is the breakdown
point: the fraction of the data you can corrupt arbitrarily before the
estimate can be made to say anything at all.

> the mean has a breakdown point of 0, as a single large observation can
> throw it off

Zero is not a small number here. Zero means one bad point out of any number
of good ones is enough, which is precisely the situation a drift check
exists to be in: it is looking for one or two devices out of place among
twenty that are fine.

## The fit that survives it

The replacement is Theil-Sen, proposed by Henri Theil in 1950 and extended
by Pranab K. Sen in 1968. It is almost embarrassingly simple to state:

> the median m of the slopes (yj - yi)/(xj - xi) determined by all pairs of
> sample points

and then the intercept is the median of what is left over:

> the median of the values yi - m*xi

Every pair of points votes on the gradient and the middle vote wins. A point
that has moved is in some of those pairs and not in most of them, and it
cannot move a median it is not near the centre of. The published breakdown
point is:

> 1 - 1/sqrt(2), approximately 29.3%

so it tolerates roughly a third of the data being arbitrarily wrong. For a
check reading twenty one devices, that is six of them out of place before
the fit itself becomes untrustworthy, which is far past the point where the
rack has bigger problems than a fit.

## The measurement

I did not want to take this on the theory, so the check now carries the test
that made the argument. Twenty one rungs of a perfect ladder, two of them
exchanged, which is an ordinary fault: two devices swapped between the
generator and the device list.

| | rack unit measured | devices flagged | of which had moved |
| --- | --- | --- | --- |
| Least squares | 37.47mm | 16 | 2 |
| Theil-Sen | 44.45mm | 2 | 2 |

The cover figure on this article is that table drawn out: every device's
residual under both fits, against the 0.45U band a device has to leave
before the check calls it misplaced. The Theil-Sen residuals are a flat line
on zero with two carets at the clipped edges. The least squares residuals
are a diagonal sweep, because dragging one end of a line down lifts
everything at the other end, and fourteen devices that never moved end up
outside the band in an orderly fan.

Notice the rack unit figure as well. Least squares does not merely
mis-attribute the fault, it also reports the rack unit as 37.47mm against a
3 percent tolerance, so a single swap raises a second failure claiming the
rack is dimensionally wrong. It is not. That is two false statements from
one true fault.

## The part that is not about statistics

The thing that cost the afternoon was not the arithmetic. It was that I
believed the output.

The message the check prints is specific and confident. It names a device,
gives a drift in rack units to two decimal places, and adds a parenthetical
explaining that a whole unit of drift is what two devices being swapped
looks like. That sentence is true in general and it was false about every
device it was attached to. I spent an hour reading a generator that was
correct, because a tool I had written told me precisely which lines to
suspect.

A check that says nothing is a gap you know about. A check that says the
wrong thing with a decimal point in it is a gap you do not, and it spends
somebody's afternoon on your behalf.

So the fit is not just replaced, it is pinned. The check builds that
twenty one rung ladder on every invocation, swaps two rungs, and fails the
build if the fit flags anything other than exactly those two:

```
the position fit is not robust: two swapped rungs out of 21 should flag
exactly those two, but it flagged 16 (R0, R1, R2, R3, R4, R5, R6, R7, R13,
R14, R15, R16, R17, R18, R19, R20). A fit that spreads one fault across the
innocent devices makes this check's output misleading.
```

That is the message you get if you put least squares back, and I generated
it by putting least squares back. A comment explaining why the fit is a
median would have been ignored by a future me in a hurry. A failing build
is not.

## The second lying measurement, for completeness

There is a footnote to this, and it is the same lesson wearing different
clothes.

The models ship compressed. Every POSITION accessor in the file declares
`componentType` 5122 and `normalized: true`, which is a signed 16 bit
integer scaled across its full range, and its `min` and `max` are in those
raw units rather than in metres: one reads `[-32767, -1384, -1472]`. The
check reads node extents straight out of those bounds and divides by 32767,
which is fast and correct against a compressed file and meaningless against
an uncompressed one, where the same fields are already in metres. Point it
at raw generator output and it reports a rack unit of 25mm and half the
devices metres out of place.

I did that, concluded the build was not reproducible, and wrote it down as a
finding. It was not a finding. Regenerating the rack and compressing it with
the documented command reproduces the committed artifact to the same
SHA-256, which I only established after going back and doubting the
measurement instead of the model.

Both mistakes have the same shape. A number arrived, it was precise, and
being precise is not the same as being about the thing you think it is
about.

## What to take from it

**Ask what your fit's breakdown point is** before you use one on data whose
whole purpose is to contain outliers. If the answer is zero, and for least
squares and for the mean it is, then a single bad value can make the output
say anything.

**A residual is a statement about a fit, not about a data point.** Every
number in that sixteen device list was arithmetically correct. They were all
correct residuals against a line that had no business being where it was.

**Encode the property, not the reasoning.** The argument for a robust fit
lives in a comment and the comment is worth having, but what actually keeps
it there is a test that fails when the property stops holding.

**And doubt your instrument before your subject**, particularly when the
instrument is one you wrote and the subject is one you did not.

## References

- [Robust regression, on least squares sensitivity and outlier masking](https://en.wikipedia.org/wiki/Robust_regression)
- [Robust statistics, on the breakdown point](https://en.wikipedia.org/wiki/Robust_statistics)
- [The Theil-Sen estimator, its construction and its 29.3% breakdown point](https://en.wikipedia.org/wiki/Theil%E2%80%93Sen_estimator)
- [Pranab K. Sen, Estimates of the Regression Coefficient Based on Kendall's Tau, JASA 63(324), 1968](https://www.jstor.org/stable/2285891)
- [KHR_mesh_quantization, which permits the normalized short positions this model ships with](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md)
- [EXT_meshopt_compression, which compresses the already quantised data](https://raw.githubusercontent.com/KhronosGroup/glTF/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md)
