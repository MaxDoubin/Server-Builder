"""Draw a post's cover as a figure of its own subject.

WHY NOT A PHOTOGRAPH. The covers on the older posts are stock photographs
sourced from Commons: a picture of some fibre for an article about fibre. They
are fine and they are also interchangeable, because none of them says anything
the article does not. For a post whose whole point is a number, a chart of
that number is a better cover, it is unambiguously ours to publish, and it
cannot be wrong in the way a photograph of the wrong generation of hardware
can be wrong.

WHAT IT DRAWS. A titled panel in the site's own palette containing one of a
few figure types, each driven by real values passed in on the command line.
Nothing here invents a number: the caller supplies them and the article cites
where they came from.

Usage:
    python3 script/makeCoverFigure.py <slug> --kind bars --title "..." \\
        --subtitle "..." --series "label=value,unit" [--series ...]

Writes client/public/images/blog/<slug>.jpg at 1600x900.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path("client/public/images/blog")
W, H = 1600, 900

# The site's palette, converted from the HSL in client/src/index.css.
OBSIDIAN = (9, 10, 11)
GRAPHITE = (20, 22, 25)
IRON = (54, 57, 60)
ASH = (137, 140, 145)
BONE = (238, 235, 228)
SIGNAL = (196, 255, 0)

#: Left and right inset for plate covers. The article hero crops this
#: image's sides to fill its own aspect, so anything nearer the edge than
#: this is not guaranteed to survive.
PLATE_PAD = 240

#: Font hunt, because a container may have any of these and none is certain.
FONT_DIRS = [
    "/usr/share/fonts/truetype/dejavu",
    "/usr/share/fonts/truetype/liberation",
    "/usr/share/fonts",
]


def font(size: int, bold: bool = False, mono: bool = False) -> ImageFont.FreeTypeFont:
    names = (
        ["DejaVuSansMono-Bold.ttf", "DejaVuSansMono.ttf", "LiberationMono-Regular.ttf"]
        if mono
        else (
            ["DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"]
            if bold
            else ["DejaVuSans.ttf", "LiberationSans-Regular.ttf"]
        )
    )
    for d in FONT_DIRS:
        for n in names:
            p = Path(d) / n
            if p.exists():
                return ImageFont.truetype(str(p), size)
    for p in Path("/usr/share/fonts").rglob("*.ttf"):
        return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def tracked(d: ImageDraw.ImageDraw, xy, text, f, fill, spacing=0):
    """Letter-spaced text, which the site uses for every label."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=f, fill=fill)
        x += d.textlength(ch, font=f) + spacing
    return x


def grid(d: ImageDraw.ImageDraw) -> None:
    """A faint measuring grid, the same one the rack elevations sit on."""
    for x in range(0, W, 50):
        d.line([(x, 0), (x, H)], fill=(15, 17, 19), width=1)
    for y in range(0, H, 50):
        d.line([(0, y), (W, y)], fill=(15, 17, 19), width=1)


def bars(d: ImageDraw.ImageDraw, series: list[tuple[str, float, str]], top: int,
         pad: int = 96) -> None:
    """Horizontal bars, longest scaled to the width. The value is the point,
    so it is printed at full size and the bar is the supporting evidence."""
    if not series:
        return
    peak = max(v for _, v, _ in series) or 1
    left, right = pad, W - pad
    room = right - left
    gap = 30
    space = H - top - 120
    bar_h = min(96, (space - gap * (len(series) - 1)) // max(1, len(series)))
    # Centre the block in what is left rather than hanging it off the top.
    # With two bars and a cap on the height, aligning to the top leaves half
    # the picture empty below them and the composition falls over.
    block = bar_h * len(series) + gap * (len(series) - 1)
    y = top + max(0, (space - block) // 2)
    for label, value, unit in series:
        width = max(6, int(room * (value / peak)))
        d.rectangle([left, y, left + width, y + bar_h], fill=GRAPHITE)
        d.rectangle([left, y, left + 5, y + bar_h], fill=SIGNAL)
        d.line([(left, y + bar_h), (left + width, y + bar_h)], fill=IRON, width=1)

        tracked(d, (left + 22, y + bar_h // 2 - 17), label.upper(), font(21), BONE, 1.6)
        text = f"{value:,.0f} {unit}".strip()
        f = font(38, bold=True)
        d.text((right - d.textlength(text, font=f), y + bar_h // 2 - 26), text, font=f, fill=SIGNAL)
        y += bar_h + gap


def residuals(d: ImageDraw.ImageDraw, points: list[tuple[float, float]], top: int,
              tolerance: float, labels: tuple[str, str], clip: float = 0.0,
              pad: int = 96) -> None:
    """Two residual series against a shared tolerance band.

    For a figure whose point is which of two methods blames the wrong thing,
    the residual per item is the whole story and the fitted lines are not:
    what a reader needs to see is how many dots fall outside the band, not
    what gradient put them there.

    Values arrive already computed by the caller. Nothing is fitted here.
    """
    if not points:
        return
    left, right = pad, W - pad
    space = H - top - 130
    mid = top + space // 2
    # Scale to `clip` rather than to the largest value when one is given. The
    # figure exists to show the small residuals, and a single item eleven
    # units out flattens every other dot onto the axis if it sets the scale.
    peak = clip or (max(max(abs(a), abs(b)) for a, b in points) or 1)
    scale = (space / 2 - 30) / peak

    def place(v):
        """Screen y for a residual, and whether it had to be clipped."""
        return mid - max(-peak, min(peak, v)) * scale, abs(v) > peak

    def marker(x, v):
        """A caret at the edge, so a clipped point is never mistaken for one
        that merely sits high."""
        y = mid - (peak if v > 0 else -peak) * scale
        dy = -14 if v > 0 else 14
        d.polygon([(x - 8, y + dy), (x + 8, y + dy), (x, y + dy + dy // 2)], fill=SIGNAL)

    # The band a value has to leave before the check calls it misplaced.
    band = tolerance * scale
    d.rectangle([left, mid - band, right, mid + band], fill=(17, 20, 17))
    d.line([(left, mid - band), (right, mid - band)], fill=IRON, width=1)
    d.line([(left, mid + band), (right, mid + band)], fill=IRON, width=1)
    d.line([(left, mid), (right, mid)], fill=(38, 41, 44), width=1)

    step = (right - left) / max(1, len(points) - 1)
    for i, (a, b) in enumerate(points):
        x = left + i * step
        # First series as a hollow ring, second as a filled dot, so the two
        # read apart in a greyscale print and for a colourblind reader.
        ya, ca = place(a)
        d.line([(x, mid), (x, ya)], fill=(46, 49, 52), width=1)
        d.ellipse([x - 7, ya - 7, x + 7, ya + 7], outline=BONE, width=2)
        yb, cb = place(b)
        d.ellipse([x - 5, yb - 5, x + 5, yb + 5], fill=SIGNAL)
        if ca or cb:
            marker(x, a if ca else b)

    fa = font(21)
    d.ellipse([left, H - 118, left + 14, H - 104], outline=BONE, width=2)
    x = tracked(d, (left + 26, H - 120), labels[0].upper(), fa, BONE, 1.6)
    d.ellipse([x + 30, H - 116, x + 40, H - 106], fill=SIGNAL)
    tracked(d, (x + 52, H - 120), labels[1].upper(), fa, SIGNAL, 1.6)
    f = font(19)
    text = f"BAND: {tolerance:g}U TOLERANCE"
    if clip:
        text += f"   AXIS CLIPPED AT {clip:g}U"
    tracked(d, (right - d.textlength(text, font=f) - 24, H - 120), text, f, ASH, 1.6)


def curves(d: ImageDraw.ImageDraw, series: list[tuple[str, list[tuple[float, float]]]],
           top: int, floor: float, x_label: str, pad: int = 96) -> None:
    """Two measurements against a shared floor, over a common x axis.

    For a figure whose point is that no value of x satisfies both, the two
    lines and the floor are the whole argument: a reader needs to see one
    curve crossing the floor going up exactly where the other crosses it
    going down, and no x where both are above it.

    Values arrive already computed. Nothing is fitted here.
    """
    if not series:
        return
    left, right = pad, W - pad
    # Deeper than the other kinds leave, because this one needs three
    # separate rows under the plot: the x ticks, the axis caption beside
    # them, and the legend below both. At 130 all three landed on the same
    # line and the tick labels sat inside the legend text.
    space = H - top - 190
    bottom = top + space
    xs = [x for _, pts in series for x, _ in pts]
    ys = [y for _, pts in series for _, y in pts] + [floor]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys) * 0.92, max(ys) * 1.06
    sx = (right - left) / max(1e-9, x1 - x0)
    sy = space / max(1e-9, y1 - y0)
    px = lambda x: left + (x - x0) * sx
    py = lambda y: bottom - (y - y0) * sy

    # The floor, and the band below it that a value must not be in.
    fy = py(floor)
    d.rectangle([left, fy, right, bottom], fill=(24, 17, 17))
    d.line([(left, fy), (right, fy)], fill=SIGNAL, width=2)
    f = font(19)
    tracked(d, (left + 10, fy - 30), f"AA FLOOR {floor:g}:1", f, SIGNAL, 1.6)

    # Gridlines on whole ratios, so the reader can read a value off the plot.
    import math
    for v in range(math.ceil(y0), int(y1) + 1):
        if abs(v - floor) < 0.4:
            continue
        y = py(v)
        d.line([(left, y), (right, y)], fill=(30, 33, 36), width=1)
        tracked(d, (left - 34, y - 11), f"{v}", font(17), ASH, 0)

    # First series solid with hollow rings, second dashed with filled dots, so
    # the pair reads apart in greyscale and for a colourblind reader.
    for i, (label, pts) in enumerate(series[:2]):
        pl = [(px(x), py(y)) for x, y in pts]
        colour = BONE if i == 0 else SIGNAL
        if i == 0:
            d.line(pl, fill=colour, width=3, joint="curve")
        else:
            for a, b in zip(pl, pl[1:]):
                steps = max(2, int(abs(b[0] - a[0]) / 9))
                for k in range(0, steps, 2):
                    t0, t1 = k / steps, min(1.0, (k + 1) / steps)
                    d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0),
                            (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)],
                           fill=colour, width=3)
        for (x, y) in pl[::max(1, len(pl) // 9)]:
            if i == 0:
                d.ellipse([x - 6, y - 6, x + 6, y + 6], outline=colour, width=2, fill=OBSIDIAN)
            else:
                d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=colour)

    # x axis ticks at the ends and the middle, which is all this needs, with
    # the caption for the axis right-aligned on the same row.
    d.line([(left, bottom), (right, bottom)], fill=IRON, width=1)
    fx = font(19)
    # The caption is right-aligned on the tick row, so a tick whose label
    # would run into it is dropped rather than drawn on top of it. The last
    # one collided at first and read as "PER 7CENT".
    caption_left = right
    if x_label:
        caption_left = right - d.textlength(x_label.upper(), font=fx) - 4
        tracked(d, (caption_left, bottom + 14), x_label.upper(), fx, ASH, 1.6)
    ft = font(18)
    for v in (x0, (x0 + x1) / 2, x1):
        tx = px(v) - 14
        if tx + d.textlength(f"{v:g}", font=ft) > caption_left - 20:
            continue
        tracked(d, (tx, bottom + 14), f"{v:g}", ft, ASH, 0)

    fa = font(21)
    d.ellipse([left, H - 118, left + 14, H - 104], outline=BONE, width=2)
    x = tracked(d, (left + 26, H - 120), series[0][0].upper(), fa, BONE, 1.6)
    if len(series) > 1:
        d.ellipse([x + 30, H - 116, x + 40, H - 106], fill=SIGNAL)
        tracked(d, (x + 52, H - 120), series[1][0].upper(), fa, SIGNAL, 1.6)


def build(slug: str, kind: str, title: str, subtitle: str, series: list[tuple[str, float, str]],
          footer: str, plate: bool = False, points: list[tuple[float, float]] | None = None,
          tolerance: float = 0.0, labels: tuple[str, str] = ("", ""),
          clip: float = 0.0,
          lines: list[tuple[str, list[tuple[float, float]]]] | None = None,
          floor: float = 0.0, x_label: str = "") -> Path:
    im = Image.new("RGB", (W, H), OBSIDIAN)
    d = ImageDraw.Draw(im)
    grid(d)

    if not plate:
        # Signal rule and eyebrow, matching the page headers.
        d.rectangle([96, 96, 96 + 64, 99], fill=SIGNAL)
        tracked(d, (96, 124), "MAXDOUBIN.COM", font(19), ASH, 5.0)

    if plate:
        # No headline. The article page lays its own title over this image,
        # and a cover that carries a second one gives you two titles in the
        # same rectangle, which is what the first version of these did.
        #
        # Everything is inset well past the 96px margin the standalone
        # figure uses, because the article hero crops the sides of this
        # image to fill its own aspect: at 96 the legend and the eyebrow
        # both lose their first few characters and the cover reads as
        # broken rather than as cropped.
        d.rectangle([PLATE_PAD, 96, PLATE_PAD + 64, 99], fill=SIGNAL)
        tracked(d, (PLATE_PAD, 124), "MAXDOUBIN.COM", font(19), ASH, 5.0)
        tracked(d, (PLATE_PAD, 176), subtitle.upper(), font(24), ASH, 3.0)
        if kind == "residuals":
            residuals(d, points or [], 250, tolerance, labels, clip, PLATE_PAD)
        elif kind == "curves":
            curves(d, lines or [], 250, floor, x_label, PLATE_PAD)
        else:
            bars(d, series, 250, PLATE_PAD)
        d.line([(PLATE_PAD, H - 92), (W - PLATE_PAD, H - 92)], fill=IRON, width=1)
        tracked(d, (PLATE_PAD, H - 70), footer.upper(), font(18), ASH, 2.4)
        # Pull the whole thing back so white text laid over it stays legible.
        im = Image.blend(im, Image.new("RGB", (W, H), OBSIDIAN), 0.55)
        OUT.mkdir(parents=True, exist_ok=True)
        dst = OUT / f"{slug}.jpg"
        im.save(dst, "JPEG", quality=88, optimize=True, progressive=True)
        return dst

    f = font(66, bold=True)
    # Wrap the title to the panel width rather than letting it run off.
    words, line, lines = title.split(), "", []
    for w in words:
        trial = f"{line} {w}".strip()
        if d.textlength(trial, font=f) > W - 200 and line:
            lines.append(line)
            line = w
        else:
            line = trial
    lines.append(line)
    y = 176
    for ln in lines[:2]:
        d.text((96, y), ln, font=f, fill=BONE)
        y += 78

    if subtitle:
        d.text((96, y + 8), subtitle, font=font(27), fill=ASH)
        y += 56

    if kind == "residuals":
        residuals(d, points or [], y + 44, tolerance, labels, clip)
    elif kind == "curves":
        curves(d, lines or [], y + 44, floor, x_label)
    else:
        bars(d, series, y + 44)

    d.line([(96, H - 92), (W - 96, H - 92)], fill=IRON, width=1)
    tracked(d, (96, H - 70), footer.upper(), font(18), ASH, 2.4)

    OUT.mkdir(parents=True, exist_ok=True)
    dst = OUT / f"{slug}.jpg"
    im.save(dst, "JPEG", quality=88, optimize=True, progressive=True)
    return dst


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--kind", default="bars", choices=["bars", "residuals", "curves"])
    ap.add_argument("--title", required=True)
    ap.add_argument("--subtitle", default="")
    ap.add_argument("--footer", default="Figures from the cited sources")
    ap.add_argument(
        "--plate",
        action="store_true",
        help="Backdrop mode: no headline, and the whole figure pulled back so "
             "the page's own title reads over it. Use for blog covers.",
    )
    ap.add_argument("--series", action="append", default=[],
                    help='"label=value,unit", repeatable')
    ap.add_argument("--points", default="",
                    help='residuals kind: "a:b,a:b,..." one pair per item, already computed')
    ap.add_argument("--tolerance", type=float, default=0.0)
    ap.add_argument("--clip", type=float, default=0.0,
                    help="residuals kind: cap the axis here and caret anything beyond")
    ap.add_argument("--labels", default="first,second")
    ap.add_argument("--line", action="append", default=[],
                    help="curves: LABEL:x,y;x,y;... one per series, at most two")
    ap.add_argument("--floor", type=float, default=0.0,
                    help="curves: the threshold both series are measured against")
    ap.add_argument("--x-label", default="", help="curves: what the x axis is")
    a = ap.parse_args()

    series = []
    for raw in a.series:
        label, rest = raw.split("=", 1)
        value, _, unit = rest.partition(",")
        series.append((label, float(value), unit))

    points = []
    for raw in filter(None, a.points.split(",")):
        first, _, second = raw.partition(":")
        points.append((float(first), float(second)))
    first, _, second = a.labels.partition(",")

    lines = []
    for raw in a.line:
        label, _, body = raw.partition(":")
        pts = []
        for pair in filter(None, body.split(";")):
            x, _, y = pair.partition(",")
            pts.append((float(x), float(y)))
        lines.append((label, pts))

    dst = build(a.slug, a.kind, a.title, a.subtitle, series, a.footer, a.plate,
                points, a.tolerance, (first, second), a.clip,
                lines, a.floor, a.x_label)
    print(dst)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
