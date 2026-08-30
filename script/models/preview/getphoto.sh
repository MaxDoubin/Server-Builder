#!/bin/bash
# Download a product photo and make a viewable copy at a sane size.
#
# The sandbox browser cannot reach these hosts but curl can, and the agent
# can look at a local image. That is the whole reason photo accurate
# modelling is possible here at all.
#
# usage: getphoto.sh <slug> <url> [outdir]
set -u
slug="$1"; url="$2"; out="${3:-photos}"
mkdir -p "$out"
# Some vendor CDNs (dl.dell.com in particular) answer 403 without one.
code=$(curl -sSL --max-time 60 -A "Mozilla/5.0" -o "$out/$slug.raw" -w "%{http_code}" "$url")
if [ "$code" != "200" ]; then echo "FAIL $code $slug"; rm -f "$out/$slug.raw"; exit 1; fi
python3 - "$out/$slug.raw" "$out/$slug.jpg" <<'PY'
import sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src)
w, h = im.size
im.thumbnail((1500, 1500))
im.convert('RGB').save(dst, quality=90)
print(f"{dst}  {w}x{h} -> {im.size[0]}x{im.size[1]}")
PY
rm -f "$out/$slug.raw"
