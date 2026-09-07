"""Catalogue thumbnails for the vendor models, cut out rather than shot on a ground.

WHY THIS EXISTS AS A FILE. The first pass at these was run by hand and never
committed, which is how thirty eight of them ended up missing with no way to
regenerate the rest. This is the whole job: render, trim, encode, and write
the paths back into the catalogue, from a clean checkout.

WHY TRANSPARENT. The preview studio has a near white ground, which is the
right thing for judging a model against the pages it ships on and the wrong
thing for a product shot, because most of Ubiquiti's hardware is white. On
the first pass thirty eight models rendered as a white object on a white
field and trimmed to an empty rectangle, so the catalogue honestly dropped
their thumb key rather than promising a blank card. Any fixed colour just
moves that problem onto whichever products happen to match it. Cutting the
background out instead means the card behind the image supplies the ground,
which on this site is dark, and every product reads: the white ones by their
shadowed edges, the black ones by their highlights.

TRIMMING is to the alpha channel with a small margin, so a wall mounted
access point and a 48 port switch each fill their own card instead of both
sitting in the middle of a 16:9 letterbox with the switch two hundred pixels
wide. Cards are laid out from the stored aspect, not from a fixed box.

Usage:
    python3 script/models/preview/serve.py 4310 &
    python3 script/models/build_catalogue_thumbs.py [slug ...]

With no slugs it does the whole catalogue.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
CATALOGUE = REPO / "client" / "public" / "data" / "ubiquiti-catalogue.json"
OUT = REPO / "client" / "public" / "models" / "vendor" / "ubiquiti" / "thumbs"

#: Longest edge of a stored thumbnail. Cards are at most a third of a
#: twelve hundred pixel column, so anything past this is bytes nobody sees.
MAX_EDGE = 560
#: Breathing room around the trimmed object, as a share of its longest edge.
MARGIN = 0.04
#: Below this the render is empty and something went wrong, so say so rather
#: than writing a transparent square and calling it a thumbnail.
MIN_OPAQUE_PX = 400

#: How many to render per browser run. The renderer holds one page open and
#: navigates it, so a batch amortises the browser start over many models,
#: and a crash costs one batch rather than the whole catalogue.
BATCH = 24


def render(slugs: list[str], into: Path) -> None:
    """Render each slug to a transparent PNG in `into`."""
    subprocess.run(
        ["node", str(REPO / "script" / "models" / "preview" / "thumbs.mjs"), str(into), *slugs],
        cwd=REPO,
        check=True,
        env={**__import__("os").environ, "THUMBALPHA": "1"},
    )


def trim(src: Path, dst: Path) -> tuple[int, int] | None:
    """Trim to the drawn pixels and encode. Returns the stored size."""
    im = Image.open(src).convert("RGBA")
    box = im.getchannel("A").getbbox()
    if box is None:
        return None
    opaque = sum(1 for v in im.getchannel("A").crop(box).get_flattened_data() if v > 8)
    if opaque < MIN_OPAQUE_PX:
        return None

    im = im.crop(box)
    pad = int(max(im.size) * MARGIN)
    if pad:
        padded = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
        padded.paste(im, (pad, pad))
        im = padded

    if max(im.size) > MAX_EDGE:
        s = MAX_EDGE / max(im.size)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)

    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=88, method=6)
    return im.size


#: Characters the vendor uses that this site's copy does not, and what to
#: put instead. There is a CI gate for em dashes, and one product description
#: arrived from the store with one in it, which failed the build on a page
#: nobody had written a word of. Normalising here means a regeneration cannot
#: bring it back.
#: Written as escapes rather than as the characters themselves, because the
#: gate that forbids them scans this file too and would flag the table that
#: exists to remove them.
EM_DASH = "\u2014"
EN_DASH = "\u2013"
PUNCTUATION = {
    f" {EM_DASH} ": ", ",
    f" {EN_DASH} ": ", ",
    EM_DASH: ", ",
    EN_DASH: ", ",
}


def house_style(text: str) -> str:
    for bad, good in PUNCTUATION.items():
        text = text.replace(bad, good)
    return text


def main() -> int:
    data = json.loads(CATALOGUE.read_text())
    for device in data["devices"]:
        for key, value in list(device.items()):
            if isinstance(value, str):
                device[key] = house_style(value)
    devices = data["devices"]
    wanted = set(sys.argv[1:])
    todo = [d for d in devices if not wanted or d["slug"] in wanted]

    work = Path(tempfile.mkdtemp(prefix="thumbs-"))
    made, empty = 0, []
    try:
        for i in range(0, len(todo), BATCH):
            batch = todo[i : i + BATCH]
            render([d["slug"] for d in batch], work)
            for d in batch:
                png = work / f"{d['slug']}.png"
                if not png.exists():
                    empty.append(d["slug"])
                    continue
                size = trim(png, OUT / f"{d['slug']}.webp")
                png.unlink()
                if size is None:
                    empty.append(d["slug"])
                    continue
                d["thumb"] = f"/models/vendor/ubiquiti/thumbs/{d['slug']}.webp"
                d["thumbSize"] = list(size)
                made += 1
            print(f"  {min(i + BATCH, len(todo))}/{len(todo)} rendered", flush=True)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    for d in devices:
        path = OUT / f"{d['slug']}.webp"
        if not path.exists():
            d.pop("thumb", None)
            d.pop("thumbSize", None)

    with_thumb = sum(1 for d in devices if d.get("thumb"))
    data["thumbnailNote"] = (
        "Thumbnails are rendered from the model itself with the background cut "
        "out, so the card behind supplies the ground and a white product reads "
        "as clearly as a black one. Each is trimmed to what was drawn, which is "
        f"why they are not all the same shape. {with_thumb} of {len(devices)} "
        "models have one."
    )
    CATALOGUE.write_text(json.dumps(data, indent=1) + "\n")

    print(f"\n{made} thumbnails written, {with_thumb}/{len(devices)} in the catalogue")
    if empty:
        print(f"{len(empty)} rendered empty: {' '.join(empty[:12])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
