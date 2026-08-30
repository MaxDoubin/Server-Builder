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
# i.dell.com wants more than a user agent: Akamai there 403s anything that
# does not also send an Accept for images and a dell.com referer, so send
# the whole set a browser would.
code=$(curl -sSL --max-time 60 \
  -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" \
  -H "Accept: image/avif,image/webp,image/png,image/*,*/*;q=0.8" \
  -H "Accept-Language: en-US,en;q=0.9" \
  -H "Referer: https://www.dell.com/" \
  -o "$out/$slug.raw" -w "%{http_code}" "$url")
if [ "$code" != "200" ]; then echo "FAIL $code $slug"; rm -f "$out/$slug.raw"; exit 1; fi
python3 - "$out/$slug.raw" "$out/$slug.jpg" "${MAXPX:-1500}" <<'PY'
import sys
from PIL import Image
# MAXPX raises the working copy's size when fine detail, a drive carrier
# latch say, does not survive the default 1500.
src, dst, cap = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(src)
w, h = im.size
im.thumbnail((cap, cap))
im.convert('RGB').save(dst, quality=90)
print(f"{dst}  {w}x{h} -> {im.size[0]}x{im.size[1]}")
PY
rm -f "$out/$slug.raw"
