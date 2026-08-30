import sys
from PIL import Image
src, dst, x0, y0, x1, y1 = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:7])
im = Image.open(src); W, H = im.size
box = (int(W*x0), int(H*y0), int(W*x1), int(H*y1))
c = im.crop(box)
# Upscale so fine silkscreen stays legible.
s = min(4.0, 1500 / max(1, c.size[0]))
if s > 1: c = c.resize((int(c.size[0]*s), int(c.size[1]*s)), Image.LANCZOS)
c.convert('RGB').save(dst, quality=94)
print(f"{dst}  crop {box} -> {c.size}")
