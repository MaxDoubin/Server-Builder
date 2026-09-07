
## Two numbers, both just under the line

I was measuring contrast across this site and found the same colour failing
twice, in two different places, by a small margin each time.

The brand blue is one token, `--primary`. In the dark theme it was
`217 91% 55%`, which is `rgb(36, 116, 245)`. It does two jobs. It is the fill
behind a button, with a near-white label on top of it, and it is the colour of
a link sitting on the page itself.

As a button fill, the label on it measured 4.11:1. As link text on the page
background, it measured 4.29:1. On a card, 4.07:1.

WCAG puts the floor for body text at 4.5:1:

> The visual presentation of text and images of text has a contrast ratio of
> at least 4.5:1
>
> Success Criterion 1.4.3, Contrast (Minimum), Level AA

So every primary button and every primary link on the site was under the
floor, in the theme the site opens in. Not by much. Enough.

## The obvious fix does not work

A shortfall of 0.4 looks like a nudge. Make the blue a little darker and white
sits better on it; make it a little lighter and it reads better on a dark
page. One of those has to be right.

They are the same knob turned in opposite directions.

The button wants a dark fill, because the label on it is near-white and
contrast is a ratio between two luminances: the darker the fill, the further
apart they are. The link wants a light colour, because the page behind it is
near-black and the same arithmetic applies in reverse. Every step that helps
one hurts the other by about as much.

Holding hue and saturation at the shipped values and walking the lightness:

| Lightness | White label on the fill | The same blue as link text |
| --- | --- | --- |
| 48 | 5.19 | 3.40 |
| 50 | 4.86 | 3.63 |
| 52 | 4.53 | 3.89 |
| 54 | 4.26 | 4.14 |
| 56 | 3.98 | 4.43 |
| 58 | 3.73 | 4.72 |
| 60 | 3.49 | 5.06 |

The label clears 4.5 at 52 and below. The link clears it at 58 and above.
There is no overlap, and the two curves cross at about 54, where both are
around 4.2 and both are failing.

## Searching the rest of the space

Lightness is not the only thing that moves. Hue and saturation change
luminance too, so it is fair to ask whether some other blue does both jobs.

I searched the space: hue 200 to 230 in steps of one, saturation 50 to 100 in
steps of two, lightness 35 to 75 in steps of one. That is 31 by 26 by 41,
about thirty three thousand colours. For each one, the contrast of near-white
on it, and its contrast on the page background.

Nothing satisfied both. Not one.

The best it can do in each direction is instructive. The best fill, taking the
one that clears 4.5 with the label and then reads highest as text, manages
4.09 as text. The best text colour, by the mirror of that, manages 4.09 under
the label.

Read that against the shipped 4.11 and 4.29 and it is worse than it looks.
Tuning the single token to make either job pass does not leave the other
where it was: it pushes it down to 4.09, below the number it was already
failing at. There is no move that does not cost more than it buys.

The blue is not badly chosen. There is no well-chosen one.

## Why a token gets into this position

The name is the tell. `--primary` names an identity, not a job. It says "the
brand colour" and says nothing about whether it is behind text or is the text,
and those two situations have contrast requirements that point in opposite
directions.

That is easy to miss because it is invisible in the light theme. There,
`--primary` is `217 91% 45%` and measures 5.75:1 both as a fill under white
and as text on the page ground. The page is light and the colour is dark, so
being dark enough for a white label and dark enough to read on white are the
same requirement. The conflict only appears when the page goes dark and the
two requirements separate.

So a palette can be correct for years, gain a dark theme, and acquire a
contradiction in a token nobody edited.

## The fix is two tokens

`--primary` stays the fill and moves to `217 91% 50%`, where the label
measures 4.86:1. A new `--primary-text` sits at `217 91% 62%` and measures
5.46:1 on the page and 5.18:1 on a card.

Both are close to the value they replaced, which is worth saying: the fix is
not a redesign, and neither the buttons nor the links look meaningfully
different. They are five and seven points of lightness from where they were.

Tailwind derives `.text-primary` and `.bg-primary` from a single colour key,
so splitting the token in the config would mean editing every call site. There
were forty one. One rule does it instead, mapping `text-primary` onto the text
value inside the dark theme, and the cinematic pages declare the same token so
the rule is a no-op where their palette already differs.

## What I would check in any palette

**Find every token that is both a fill and a foreground.** That is where this
lives. A colour used only as a fill, or only as text, cannot contradict
itself.

**Check the dark theme separately, and check both jobs.** A single number per
token is not enough, because a token that passes as text can fail as a fill at
the same time.

**When a fix does not converge, stop tuning.** Two constraints that move
together under one variable will meet in the middle and fail there. The
search above took a few minutes to write and settled the question that an
afternoon of nudging would not have.

**Gate the pairing, not the colour.** The gate this site already had checked
brand foregrounds against brand surfaces and never looked at the shadcn
palette, so the whole thing went unchecked. It now checks eight themed
pairings by name: the label on a primary button, a primary link on the page,
the same inside a card, in each theme. Each is the thing a reader would point
at if it were unreadable.

## References

- [WCAG 2.2, Success Criterion 1.4.3: Contrast (Minimum)](https://www.w3.org/TR/WCAG22/#contrast-minimum)
- [WCAG 2.2: relative luminance](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)
- [WCAG 2.2: contrast ratio](https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio)
- [WCAG 2.2, Success Criterion 1.4.11: Non-text Contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)
- [CSS Color Module Level 4: the HSL notation](https://www.w3.org/TR/css-color-4/#the-hsl-notation)
- [WebAIM: Contrast and Color Accessibility](https://webaim.org/articles/contrast/)
