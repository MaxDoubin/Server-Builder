#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import random
import struct
import sys
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import trimesh
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
from build_vega_edge_rack_extreme import Builder

OUT = Path(__file__).resolve().parents[1]
TEXTURE_DIR = OUT / 'textures'
TEXTURE_DIR.mkdir(parents=True, exist_ok=True)


def clamp_u8(a: np.ndarray) -> np.ndarray:
    return np.clip(a, 0, 255).astype(np.uint8)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf',
    ]
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def save_texture(name: str, image: Image.Image) -> Image.Image:
    path = TEXTURE_DIR / name
    image.save(path)
    return image


def make_brushed_aluminum(size: int = 1024) -> tuple[Image.Image, Image.Image, Image.Image]:
    rng = np.random.default_rng(413)
    h = w = size
    row = rng.normal(0.0, 5.5, (h, 1))
    broad = rng.normal(0.0, 1.8, (h, 1)) + rng.normal(0.0, 0.45, (1, w))
    fine = rng.normal(0.0, 1.6, (h, w))
    vertical = np.linspace(7.0, -4.0, h).reshape(h, 1)
    base = 225.0 + row * 0.72 + broad * 0.42 + fine * 0.62 + vertical * 0.35
    rgb = np.stack([base + 2.0, base + 3.0, base + 3.0], axis=-1)
    # Fine machining streaks and a few almost invisible scratches.
    for y in range(4, h, 11):
        rgb[y:y + 1, :, :] -= rng.uniform(2.0, 5.0)
    for _ in range(35):
        y = int(rng.integers(0, h))
        x0 = int(rng.integers(0, w - 80))
        length = int(rng.integers(20, 180))
        rgb[y:y + 1, x0:x0 + length, :] += rng.uniform(2.0, 4.0)
    color = Image.fromarray(clamp_u8(rgb), 'RGB')

    rough = 92.0 + rng.normal(0.0, 7.0, (h, w)) + row * 0.46
    metal = np.full((h, w), 178.0)
    mr = np.zeros((h, w, 3), dtype=np.uint8)
    mr[..., 0] = 255
    mr[..., 1] = clamp_u8(rough)
    mr[..., 2] = clamp_u8(metal)
    metallic_roughness = Image.fromarray(mr, 'RGB')

    # Tangent-space normal with subtle horizontal brushing.
    grad = np.gradient(row[:, 0])
    normal = np.zeros((h, w, 3), dtype=np.uint8)
    normal[..., 0] = 128
    normal[..., 1] = clamp_u8(128 + grad.reshape(h, 1) * 4.0)
    normal[..., 2] = 252
    normal_map = Image.fromarray(normal, 'RGB')
    return (
        save_texture('brushed_aluminum_basecolor.png', color),
        save_texture('brushed_aluminum_metalrough.png', metallic_roughness),
        save_texture('brushed_aluminum_normal.png', normal_map),
    )


def make_dark_steel(size: int = 512) -> tuple[Image.Image, Image.Image, Image.Image]:
    rng = np.random.default_rng(821)
    h = w = size
    noise = rng.normal(0.0, 2.8, (h, w))
    speckle = (rng.random((h, w)) > 0.996) * rng.uniform(4, 12, (h, w))
    base = 37.0 + noise + speckle
    rgb = np.stack([base * 0.92, base * 0.98, base * 1.04], axis=-1)
    color = Image.fromarray(clamp_u8(rgb), 'RGB')
    mr = np.zeros((h, w, 3), dtype=np.uint8)
    mr[..., 0] = 255
    mr[..., 1] = clamp_u8(128 + noise * 2.0)
    mr[..., 2] = 185
    normal = np.zeros((h, w, 3), dtype=np.uint8)
    normal[..., 0] = clamp_u8(128 + noise * 0.7)
    normal[..., 1] = clamp_u8(128 + np.roll(noise, 1, axis=0) * 0.7)
    normal[..., 2] = 252
    return (
        save_texture('dark_steel_basecolor.png', color),
        save_texture('dark_steel_metalrough.png', Image.fromarray(mr, 'RGB')),
        save_texture('dark_steel_normal.png', Image.fromarray(normal, 'RGB')),
    )


def make_screen_texture(title: str, accent: tuple[int, int, int], mode: str) -> Image.Image:
    """Create a detailed screen UI with no letters, words, or numbers."""
    img = Image.new('RGB', (512, 384), (3, 8, 13))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((8, 8, 503, 375), radius=26, fill=(5, 12, 18), outline=(62, 76, 84), width=5)
    # Header/status glyphs only.
    for i, fill in enumerate(((83, 226, 153), accent, (94, 112, 122))):
        d.ellipse((28 + i * 25, 28, 40 + i * 25, 40), fill=fill)
    d.rounded_rectangle((408, 26, 476, 42), radius=8, fill=(16, 31, 39))
    d.rounded_rectangle((408, 26, 453, 42), radius=8, fill=accent)
    ar, ag, ab = accent
    if mode == 'network':
        # Throughput graph, port map, and status dots without text.
        values = [0.20, 0.42, 0.31, 0.59, 0.48, 0.78, 0.69, 0.89, 0.63, 0.75, 0.55, 0.84]
        pts = [(34 + i * 38, 272 - int(v * 145)) for i, v in enumerate(values)]
        d.line(pts, fill=accent, width=8, joint='curve')
        d.line([(34, 292), (476, 292)], fill=(41, 58, 66), width=3)
        for i in range(12):
            x = 34 + i * 37
            d.rounded_rectangle((x, 316, x + 24, 342), radius=5,
                                fill=accent if i in (1, 2, 5, 8, 10) else (18, 34, 43),
                                outline=(57, 78, 88), width=2)
    elif mode == 'power':
        # Gauge, load bars, and battery cells without text.
        d.arc((56, 80, 286, 310), start=205, end=518, fill=(31, 48, 58), width=24)
        d.arc((56, 80, 286, 310), start=205, end=472, fill=accent, width=24)
        d.ellipse((151, 176, 191, 216), fill=(12, 24, 31), outline=accent, width=6)
        d.line((171, 196, 230, 132), fill=accent, width=9)
        for i, frac in enumerate((0.86, 0.62, 0.74)):
            y = 112 + i * 64
            d.rounded_rectangle((315, y, 468, y + 25), radius=12, fill=(17, 31, 39))
            d.rounded_rectangle((315, y, 315 + int(153 * frac), y + 25), radius=12, fill=accent)
        for i in range(5):
            x = 315 + i * 31
            d.rounded_rectangle((x, 310, x + 22, 338), radius=4,
                                fill=accent if i < 4 else (18, 34, 43), outline=(57, 78, 88), width=2)
    elif mode == 'storage':
        # Seven drive-health bars and a usage ring without text.
        for i in range(7):
            x = 28 + i * 65
            d.rounded_rectangle((x, 88, x + 48, 258), radius=10, outline=(66, 84, 92), width=4, fill=(13, 24, 31))
            fill_h = [0.35, 0.58, 0.72, 0.49, 0.81, 0.63, 0.42][i]
            d.rounded_rectangle((x + 7, 248 - int(fill_h * 135), x + 41, 248), radius=6, fill=accent)
            d.ellipse((x + 17, 272, x + 31, 286), fill=(83, 226, 153))
        d.arc((365, 276, 475, 366), start=205, end=500, fill=accent, width=14)
    else:
        for i, frac in enumerate((0.44, 0.61, 0.37, 0.72)):
            y = 82 + i * 63
            d.ellipse((30, y + 3, 52, y + 25), fill=accent)
            d.rounded_rectangle((76, y, 458, y + 30), radius=15, fill=(17, 31, 39))
            d.rounded_rectangle((76, y, 76 + int(382 * frac), y + 30), radius=15, fill=accent)
    safe = ''.join(ch.lower() if ch.isalnum() else '_' for ch in title).strip('_')
    return save_texture(f'screen_wordless_{mode}_{safe}.png', img)


def make_particle_screen(size: int = 512) -> Image.Image:
    """The idle display: a deep blue field of scattered glowing points.

    The front panel display on this hardware is not a logo. It is a drift
    of bright blue particles on a lit blue ground, and a flat glyph in its
    place is the one thing on the whole chassis that looks printed rather
    than lit.

    The glow and the cover-glass sheen are composited additively. Blending
    them was the obvious thing and it was wrong: a glow layer is mostly
    black, so blending pulled the whole panel down to navy instead of
    lifting the points out of it.
    """
    base = Image.new('RGB', (size, size))
    bd = ImageDraw.Draw(base)
    for i in range(size):
        t = i / (size - 1)
        # Lit from the upper left, the way the real panel sits under a room.
        bd.line([(0, i), (size, i)], fill=(int(16 - t * 6), int(64 - t * 22), int(146 - t * 44)))
    base = base.filter(ImageFilter.GaussianBlur(radius=2))

    glow = Image.new('RGB', (size, size), (0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    rng = random.Random(20260830)
    points = []
    for _ in range(210):
        x = rng.uniform(0, size)
        y = rng.uniform(0, size)
        r = rng.choice((1.4, 2.0, 2.6, 3.4, 4.6, 6.2, 8.0))
        # Bright points go cyan, dim ones stay in the blue of the ground.
        lift = min(1.0, r / 8.0) * rng.uniform(0.5, 1.0)
        col = (int(30 + 120 * lift), int(150 + 100 * lift), 255)
        points.append((x, y, r, col))
        gdraw.ellipse((x - r * 3.0, y - r * 3.0, x + r * 3.0, y + r * 3.0),
                      fill=(int(col[0] * 0.5 * lift), int(col[1] * 0.5 * lift), int(255 * 0.5 * lift)))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=8))
    img = ImageChops.add(base, glow)

    d = ImageDraw.Draw(img)
    for x, y, r, col in points:
        d.ellipse((x - r, y - r, x + r, y + r), fill=col)

    # The reflection streak across the cover glass.
    sheen = Image.new('RGB', (size, size), (0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.polygon([(size * 0.50, size), (size * 0.72, size), (size * 1.00, 0), (size * 0.78, 0)],
               fill=(26, 42, 74))
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=26))
    img = ImageChops.add(img, sheen)

    return save_texture('screen_particles.png', img)


def make_decal_texture(text: str, subtext: str = '', color=(58, 62, 64), align='left') -> Image.Image:
    img = Image.new('RGBA', (1024, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    main_font = font(54, True)
    sub_font = font(28)
    bbox = d.textbbox((0, 0), text, font=main_font)
    w = bbox[2] - bbox[0]
    x = 20 if align == 'left' else 1004 - w
    d.text((x, 24), text, font=main_font, fill=(*color, 238))
    if subtext:
        sb = d.textbbox((0, 0), subtext, font=sub_font)
        sw = sb[2] - sb[0]
        sx = 22 if align == 'left' else 1002 - sw
        d.text((sx, 94), subtext, font=sub_font, fill=(94, 99, 102, 220))
    safe = ''.join(ch.lower() if ch.isalnum() else '_' for ch in text).strip('_')
    return save_texture(f'decal_{safe}.png', img)


ALU_COLOR, ALU_MR, ALU_NORMAL = make_brushed_aluminum()
STEEL_COLOR, STEEL_MR, STEEL_NORMAL = make_dark_steel()


def pbr(name: str, rgba, metallic=0.0, roughness=0.5, emissive=None, **kwargs) -> PBRMaterial:
    """A material from an sRGB colour, the way a colour is actually picked.

    Every colour in this library is written as the 0 to 255 triple you would
    read off a photograph or type into a hex field, because that is the only
    way to author them by eye. glTF wants `baseColorFactor` in linear light,
    so `export_glb` converts on the way out. Do not pre-convert here.
    """
    args = dict(name=name, baseColorFactor=list(rgba), metallicFactor=metallic, roughnessFactor=roughness)
    if emissive is not None:
        args['emissiveFactor'] = list(emissive)
    args.update(kwargs)
    return PBRMaterial(**args)


def srgb_to_linear(c: float) -> float:
    """One channel, 0 to 1, from sRGB to linear light."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def export_glb(scene, path: Path) -> Path:
    """Export a scene, correcting every base colour from sRGB to linear.

    This is not a nicety. glTF defines `baseColorFactor` as linear, trimesh
    writes whatever number it was handed, and the colours here are authored
    in sRGB. Writing an sRGB value into a linear field brightens everything
    by roughly a 2.2 gamma, which does almost nothing at the white end and
    is catastrophic at the black end: a charcoal panel at 38 lands at 107,
    a mid grey at 166 lands at 211. That is why the dark racks all came out
    the colour of brushed aluminium no matter how far the numbers were
    pulled down, and why the white UniFi rack looked right the whole time.

    Colours that carry a texture are written as a white factor and are left
    alone, because 1.0 is 1.0 in either space. Emissive factors are left
    alone too: they are authored as linear floats already.
    """
    data = scene.export(file_type='glb')

    header, rest = data[:12], data[12:]
    json_len, json_type = struct.unpack('<II', rest[:8])
    doc = json.loads(rest[8:8 + json_len])
    tail = rest[8 + json_len:]

    for material in doc.get('materials', []):
        pbr_block = material.get('pbrMetallicRoughness')
        if not pbr_block:
            continue
        factor = pbr_block.get('baseColorFactor')
        if not factor:
            continue
        pbr_block['baseColorFactor'] = [srgb_to_linear(float(c)) for c in factor[:3]] + list(factor[3:])

    payload = json.dumps(doc, separators=(',', ':')).encode('utf-8')
    payload += b' ' * (-len(payload) % 4)
    total = 12 + 8 + len(payload) + len(tail)
    out = bytearray()
    out += header[:8] + struct.pack('<I', total)
    out += struct.pack('<II', len(payload), json_type) + payload
    out += tail
    path.write_bytes(bytes(out))
    return path


class UniFiHeroRack(Builder):
    #: Scene metadata, which every subclass inherits unless it says
    #: otherwise. It was hardcoded here, so five vendor racks shipped
    #: claiming to be this one, by an author who did not build them.
    #: Anyone who opens one of these files in Blender reads this.
    scene_title = 'UniFi Hero Rack - Clean Aligned Wordless Edition'
    scene_author = 'OpenAI for Max Doubin'
    scene_note = (
        'Original procedural geometry built to match the user-approved rack concept. '
        'No TurboSquid mesh or textures were copied. Ubiquiti and UniFi are third-party trademarks.'
    )

    def __init__(self) -> None:
        super().__init__('extreme')
        self.front_y = -0.335
        self.cable_steps = 96
        self.cable_sections = 28
        self.cyl_sections = 48
        self.materials = {
            'silver_brushed': PBRMaterial(
                name='Anodized Brushed Aluminum',
                baseColorFactor=[255, 255, 255, 255],
                baseColorTexture=ALU_COLOR,
                metallicFactor=0.72,
                roughnessFactor=1.0,
                metallicRoughnessTexture=ALU_MR,
                normalTexture=ALU_NORMAL,
                doubleSided=False,
            ),
            'silver_plain': pbr('Machined Aluminum', [226, 229, 230, 255], 0.68, 0.28),
            'silver_highlight': pbr('Polished Edge', [244, 246, 246, 255], 0.72, 0.18),
            'silver_shadow': pbr('Aluminum Shadow', [168, 174, 176, 255], 0.62, 0.38),
            'steel_textured': PBRMaterial(
                name='Dark SGCC Steel', baseColorFactor=[255, 255, 255, 255], baseColorTexture=STEEL_COLOR,
                metallicFactor=1.0, roughnessFactor=1.0, metallicRoughnessTexture=STEEL_MR,
                normalTexture=STEEL_NORMAL,
            ),
            'steel_plain': pbr('Dark Steel', [48, 52, 55, 255], 0.76, 0.41),
            'black_plastic': pbr('Black Polymer', [8, 10, 12, 255], 0.02, 0.48),
            'black_matte': pbr('Matte Black', [18, 20, 22, 255], 0.12, 0.72),
            'rubber': pbr('Rubber', [18, 19, 20, 255], 0.0, 0.91),
            'glass': pbr('Smoked Glass', [5, 10, 14, 210], 0.05, 0.055, alphaMode='BLEND', doubleSided=True),
            'clear_plug': pbr('Clear RJ45 Polymer', [188, 213, 215, 112], 0.02, 0.16, alphaMode='BLEND', doubleSided=True),
            'copper': pbr('Gold Contacts', [210, 142, 49, 255], 0.92, 0.17),
            'nickel': pbr('Nickel Connector', [173, 179, 181, 255], 0.96, 0.18),
            'white_cable': pbr('White Flex Cable', [234, 236, 235, 255], 0.0, 0.52),
            'blue_cable': pbr('UniFi Blue Cable', [73, 143, 212, 255], 0.0, 0.44),
            'black_cable': pbr('Power Cable Rubber', [15, 16, 17, 255], 0.0, 0.79),
            'green_led': pbr('Green LED', [45, 255, 128, 255], 0.0, 0.14, emissive=[0.18, 1.0, 0.42]),
            'amber_led': pbr('Amber LED', [255, 180, 62, 255], 0.0, 0.14, emissive=[1.0, 0.45, 0.08]),
            'red_led': pbr('Red LED', [255, 82, 70, 255], 0.0, 0.14, emissive=[1.0, 0.12, 0.06]),
            'blue_led': pbr('Blue LED', [74, 178, 255, 255], 0.0, 0.12, emissive=[0.12, 0.55, 1.0]),
            'white_led': pbr('White LED', [235, 248, 255, 255], 0.0, 0.10, emissive=[0.8, 0.95, 1.0]),
            'dark_label': pbr('Printed Gray', [58, 62, 64, 255], 0.08, 0.52),
            'pcb_green': pbr('PCB Green', [28, 94, 62, 255], 0.08, 0.52),
        }
        self._register_screen('udm', make_screen_texture('Gateway', (68, 186, 255), 'network'))
        self._register_screen('switch', make_screen_texture('Switch', (66, 225, 147), 'network'))
        self._register_screen('rps', make_screen_texture('SmartPower', (80, 220, 145), 'power'))
        self._register_screen('nvr', make_screen_texture('Protect', (73, 154, 255), 'storage'))
        self._register_screen('pdu', make_screen_texture('PDU Pro', (64, 199, 255), 'power'))
        self._register_screen('ups', make_screen_texture('Power', (77, 226, 145), 'power'))
        # The front panel idle display, shared by every power button.
        self._register_screen('particles', make_particle_screen())
        self.decal_counter = 0

    def _register_screen(self, key: str, image: Image.Image) -> None:
        self.materials[f'screen_{key}'] = PBRMaterial(
            name=f'Emissive Screen {key}', baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=image, emissiveTexture=image, emissiveFactor=[1.0, 1.0, 1.0],
            metallicFactor=0.0, roughnessFactor=0.08, doubleSided=True,
        )

    def add_decal_material(self, text: str, subtext: str = '', align='left', color=(58, 62, 64)) -> str:
        key = f'decal_{self.decal_counter:03d}'
        self.decal_counter += 1
        image = make_decal_texture(text, subtext, color=color, align=align)
        self.materials[key] = PBRMaterial(
            name=f'Decal {text}', baseColorFactor=[255, 255, 255, 255], baseColorTexture=image,
            metallicFactor=0.0, roughnessFactor=0.54, alphaMode='BLEND', doubleSided=True,
        )
        return key

    def add(self, mesh: trimesh.Trimesh, group: str, material: str) -> None:
        if mesh is None or len(mesh.vertices) == 0:
            return
        self.parts[group][material].append(mesh)

    @staticmethod
    def _apply_uv_xz(mesh: trimesh.Trimesh, material: PBRMaterial, center: Sequence[float], extents: Sequence[float]) -> None:
        center = np.asarray(center, float)
        ext = np.asarray(extents, float)
        x = (mesh.vertices[:, 0] - center[0]) / max(ext[0], 1e-8) + 0.5
        z = (mesh.vertices[:, 2] - center[2]) / max(ext[2], 1e-8) + 0.5
        uv = np.column_stack((x, z))
        mesh.visual = TextureVisuals(uv=uv, material=material)

    def uv_box(self, group: str, material: str, center: Sequence[float], extents: Sequence[float]) -> trimesh.Trimesh:
        mesh = trimesh.creation.box(extents=np.asarray(extents, float))
        mesh.apply_translation(np.asarray(center, float))
        self._apply_uv_xz(mesh, self.materials[material], center, extents)
        self.add(mesh, group, material)
        return mesh

    @staticmethod
    def rounded_ring(width: float, height: float, radius: float, steps: int = 10) -> np.ndarray:
        r = max(0.0001, min(radius, width * 0.49, height * 0.49))
        cx = width * 0.5 - r
        cz = height * 0.5 - r
        pts: list[tuple[float, float]] = []
        for center, a0, a1 in [
            ((cx, cz), 0, 90),
            ((-cx, cz), 90, 180),
            ((-cx, -cz), 180, 270),
            ((cx, -cz), 270, 360),
        ]:
            for a in np.linspace(math.radians(a0), math.radians(a1), steps, endpoint=False):
                pts.append((center[0] + r * math.cos(a), center[1] + r * math.sin(a)))
        return np.asarray(pts, float)

    def rounded_prism(self, group: str, material: str, center: Sequence[float], extents: Sequence[float],
                      radius: float = 0.005, bevel: float = 0.0015, steps: int = 10) -> trimesh.Trimesh:
        cx, cy, cz = map(float, center)
        width, depth, height = map(float, extents)
        b = min(bevel, depth * 0.22, width * 0.08, height * 0.08)
        specs = [
            (width - 2 * b, height - 2 * b, max(radius - b, 0.0002), -depth * 0.5),
            (width, height, radius, -depth * 0.5 + b),
            (width, height, radius, depth * 0.5 - b),
            (width - 2 * b, height - 2 * b, max(radius - b, 0.0002), depth * 0.5),
        ]
        rings = [self.rounded_ring(w, h, r, steps) for w, h, r, _ in specs]
        n = len(rings[0])
        vertices: list[list[float]] = []
        uvs: list[list[float]] = []
        for ring, spec in zip(rings, specs):
            y = cy + spec[3]
            for x, z in ring:
                vertices.append([cx + x, y, cz + z])
                uvs.append([x / width + 0.5, z / height + 0.5])
        front_center = len(vertices)
        vertices.append([cx, cy - depth * 0.5, cz]); uvs.append([0.5, 0.5])
        back_center = len(vertices)
        vertices.append([cx, cy + depth * 0.5, cz]); uvs.append([0.5, 0.5])
        faces: list[list[int]] = []
        for layer in range(3):
            a0 = layer * n
            b0 = (layer + 1) * n
            for i in range(n):
                j = (i + 1) % n
                faces.append([a0 + i, b0 + i, b0 + j])
                faces.append([a0 + i, b0 + j, a0 + j])
        # Front points toward -Y, back points toward +Y.
        for i in range(n):
            j = (i + 1) % n
            faces.append([front_center, j, i])
            faces.append([back_center, 3 * n + i, 3 * n + j])
        mesh = trimesh.Trimesh(vertices=np.asarray(vertices), faces=np.asarray(faces), process=False)
        mesh.visual = TextureVisuals(uv=np.asarray(uvs), material=self.materials[material])
        mesh.fix_normals()
        self.add(mesh, group, material)
        return mesh

    def textured_plane(self, group: str, material: str, center: Sequence[float], width: float, height: float) -> trimesh.Trimesh:
        x, y, z = map(float, center)
        verts = np.array([
            [x - width / 2, y, z - height / 2],
            [x + width / 2, y, z - height / 2],
            [x + width / 2, y, z + height / 2],
            [x - width / 2, y, z + height / 2],
        ], float)
        faces = np.array([[0, 1, 2], [0, 2, 3]], int)
        uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], float)
        mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)
        mesh.visual = TextureVisuals(uv=uv, material=self.materials[material])
        self.add(mesh, group, material)
        return mesh

    def rotated_box(self, group: str, material: str, center: Sequence[float], extents: Sequence[float], angle_y: float) -> None:
        mesh = trimesh.creation.box(extents=np.asarray(extents, float))
        mesh.apply_translation(np.asarray(center, float))
        rot = trimesh.transformations.rotation_matrix(angle_y, [0, 1, 0], point=np.asarray(center, float))
        mesh.apply_transform(rot)
        self.add(mesh, group, material)

    def torus_front(self, group: str, material: str, center: Sequence[float], major: float, minor: float,
                    major_sections=64, minor_sections=12) -> None:
        mesh = trimesh.creation.torus(major_radius=major, minor_radius=minor,
                                      major_sections=major_sections, minor_sections=minor_sections)
        rot = trimesh.geometry.align_vectors([0, 0, 1], [0, 1, 0])
        mesh.apply_transform(rot)
        mesh.apply_translation(np.asarray(center, float))
        self.add(mesh, group, material)

    def curve_tube(self, group: str, material: str, points: Sequence[Sequence[float]], radius: float,
                   sides: int = 28, cap: bool = True) -> trimesh.Trimesh:
        pts = np.asarray(points, float)
        if len(pts) < 2:
            raise ValueError('curve needs at least two points')
        tangents = np.zeros_like(pts)
        tangents[0] = pts[1] - pts[0]
        tangents[-1] = pts[-1] - pts[-2]
        tangents[1:-1] = pts[2:] - pts[:-2]
        tangents /= np.maximum(np.linalg.norm(tangents, axis=1, keepdims=True), 1e-9)
        normals = np.zeros_like(pts)
        bins = np.zeros_like(pts)
        up = np.array([0.0, 0.0, 1.0])
        if abs(np.dot(tangents[0], up)) > 0.92:
            up = np.array([1.0, 0.0, 0.0])
        normals[0] = np.cross(tangents[0], up)
        normals[0] /= max(np.linalg.norm(normals[0]), 1e-9)
        bins[0] = np.cross(tangents[0], normals[0])
        for i in range(1, len(pts)):
            n = normals[i - 1] - tangents[i] * np.dot(normals[i - 1], tangents[i])
            if np.linalg.norm(n) < 1e-7:
                n = np.cross(tangents[i], up)
            n /= max(np.linalg.norm(n), 1e-9)
            normals[i] = n
            bins[i] = np.cross(tangents[i], n)
            bins[i] /= max(np.linalg.norm(bins[i]), 1e-9)
        angles = np.linspace(0, 2 * math.pi, sides, endpoint=False)
        verts = []
        uvs = []
        cumulative = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
        total = max(cumulative[-1], 1e-8)
        for i, p in enumerate(pts):
            for j, a in enumerate(angles):
                offset = radius * (math.cos(a) * normals[i] + math.sin(a) * bins[i])
                verts.append(p + offset)
                uvs.append([cumulative[i] / total * 8.0, j / sides])
        faces = []
        for i in range(len(pts) - 1):
            for j in range(sides):
                k = (j + 1) % sides
                a = i * sides + j
                b = i * sides + k
                c = (i + 1) * sides + k
                d = (i + 1) * sides + j
                faces.append([a, b, c]); faces.append([a, c, d])
        if cap:
            start = len(verts); verts.append(pts[0]); uvs.append([0, 0.5])
            end = len(verts); verts.append(pts[-1]); uvs.append([1, 0.5])
            for j in range(sides):
                k = (j + 1) % sides
                faces.append([start, k, j])
                a = (len(pts) - 1) * sides + j
                b = (len(pts) - 1) * sides + k
                faces.append([end, a, b])
        mesh = trimesh.Trimesh(vertices=np.asarray(verts), faces=np.asarray(faces), process=False)
        mesh.visual = TextureVisuals(uv=np.asarray(uvs), material=self.materials[material])
        mesh.fix_normals()
        self.add(mesh, group, material)
        return mesh

    @staticmethod
    def cubic_bezier(p0, p1, p2, p3, count=96) -> np.ndarray:
        p0, p1, p2, p3 = map(lambda p: np.asarray(p, float), (p0, p1, p2, p3))
        result = []
        for t in np.linspace(0.0, 1.0, count):
            a = (1 - t) ** 3
            b = 3 * (1 - t) ** 2 * t
            c = 3 * (1 - t) * t ** 2
            d = t ** 3
            result.append(a * p0 + b * p1 + c * p2 + d * p3)
        return np.asarray(result)

    def front_cylinder(self, group: str, material: str, center: Sequence[float], radius: float, depth: float,
                       sections: int = 48) -> trimesh.Trimesh:
        x, y, z = map(float, center)
        mesh = trimesh.creation.cylinder(radius=radius, height=depth, sections=sections)
        rot = trimesh.geometry.align_vectors([0, 0, 1], [0, 1, 0])
        mesh.apply_transform(rot)
        mesh.apply_translation([x, y, z])
        self.add(mesh, group, material)
        return mesh

    def screw(self, group: str, x: float, z: float, y: float | None = None, radius: float = 0.0033) -> None:
        y = self.front_y - 0.009 if y is None else y
        self.front_cylinder(group, 'nickel', (x, y, z), radius, 0.0040, 32)
        self.box(group, 'black_matte', (x, y - 0.0022, z), (radius * 1.18, 0.0007, radius * 0.30))
        self.box(group, 'black_matte', (x, y - 0.0022, z), (radius * 0.30, 0.0007, radius * 1.18))

    def lens(self, group: str, x: float, z: float, material='green_led', radius=0.00145, y: float | None = None) -> None:
        y = self.front_y - 0.0105 if y is None else y
        self.front_cylinder(group, 'black_plastic', (x, y + 0.0006, z), radius * 1.55, 0.0018, 24)
        self.front_cylinder(group, material, (x, y - 0.0005, z), radius, 0.0014, 24)

    def power_button(self, group: str, x: float, z: float, radius=0.014) -> None:
        y = self.front_y - 0.010
        side = radius * 2.05
        self.rounded_prism(group, 'black_plastic', (x, y, z), (side, 0.0060, side),
                           radius=radius * 0.24, bevel=0.0009, steps=8)
        self.rounded_prism(group, 'glass', (x, y - 0.0033, z), (side * 0.78, 0.0010, side * 0.78),
                           radius=radius * 0.18, bevel=0.0001, steps=8)
        # The idle particle display, not a glyph. A flat mark here was the
        # one thing on the chassis that looked printed rather than lit.
        self.textured_plane(group, 'screen_particles', (x, y - 0.0045, z), side * 0.74, side * 0.74)
        self.lens(group, x + radius * 0.72, z + radius * 0.72, 'green_led', radius * 0.065, y - 0.0044)

    def screen(self, group: str, key: str, x: float, z: float, width=0.045, height=0.034) -> None:
        self.rounded_prism(group, 'black_plastic', (x, self.front_y - 0.0078, z), (width + 0.006, 0.0048, height + 0.006),
                           radius=0.004, bevel=0.0008, steps=8)
        self.textured_plane(group, f'screen_{key}', (x, self.front_y - 0.0104, z), width, height)
        self.rounded_prism(group, 'glass', (x, self.front_y - 0.0108, z), (width + 0.0008, 0.0010, height + 0.0008),
                           radius=0.0024, bevel=0.0001, steps=8)

    def decal(self, group: str, text: str, subtext: str, x: float, z: float, width: float, height: float,
              align='left', color=(58, 62, 64)) -> None:
        mat = self.add_decal_material(text, subtext, align=align, color=color)
        self.textured_plane(group, mat, (x, self.front_y - 0.0120, z), width, height)

    def rj45_socket(self, group: str, x: float, z: float, plugged=False, led=True, plug_color='clear_plug') -> None:
        y = self.front_y - 0.0090
        # Nickel cage and recessed polymer body.
        self.rounded_prism(group, 'nickel', (x, y, z), (0.0166, 0.0032, 0.0132), radius=0.0014, bevel=0.0005, steps=5)
        self.rounded_prism(group, 'black_plastic', (x, y - 0.0026, z), (0.0134, 0.0032, 0.0100), radius=0.0009, bevel=0.0003, steps=5)
        # Eight real-looking spring contacts.
        for k in range(8):
            xx = x - 0.00525 + k * 0.00150
            self.box(group, 'copper', (xx, y - 0.00435, z + 0.00365), (0.00045, 0.0011, 0.0042))
        # Retaining ledge and latch notch.
        self.box(group, 'black_matte', (x, y - 0.0041, z - 0.0039), (0.0065, 0.0011, 0.0011))
        if led:
            self.lens(group, x - 0.0061, z + 0.0044, 'green_led', 0.00072, y - 0.0046)
            self.lens(group, x + 0.0061, z + 0.0044, 'amber_led', 0.00072, y - 0.0046)
        if plugged:
            # Clear modular plug with a color-matched molded boot and strain relief.
            boot_material = 'blue_cable' if plug_color == 'blue_cable' else 'white_cable'
            self.rounded_prism(group, 'clear_plug', (x, y - 0.0070, z), (0.0126, 0.0083, 0.0092), radius=0.0012, bevel=0.0005, steps=5)
            for k in range(8):
                xx = x - 0.00475 + k * 0.00136
                self.box(group, 'copper', (xx, y - 0.0114, z + 0.0034), (0.00042, 0.0008, 0.0034))
            self.box(group, 'clear_plug', (x, y - 0.0123, z + 0.0055), (0.0048, 0.0060, 0.0010))
            self.rounded_prism(group, boot_material,
                               (x, y - 0.0142, z), (0.0080, 0.0065, 0.0065), radius=0.0018, bevel=0.0006, steps=6)
            for n in range(3):
                self.front_cylinder(group, boot_material, (x, y - 0.0160 - n * 0.0011, z), 0.00355 - n * 0.00025, 0.0005, 24)

    def sfp_cage(self, group: str, x: float, z: float, transceiver=False, blue=False) -> None:
        y = self.front_y - 0.009
        self.rounded_prism(group, 'nickel', (x, y, z), (0.018, 0.0032, 0.0107), radius=0.0011, bevel=0.0004, steps=5)
        self.rounded_prism(group, 'black_plastic', (x, y - 0.0028, z), (0.0145, 0.0032, 0.0075), radius=0.0007, bevel=0.0002, steps=5)
        if transceiver:
            mat = 'blue_cable' if blue else 'steel_plain'
            self.rounded_prism(group, mat, (x, y - 0.0061, z), (0.0138, 0.0062, 0.0070), radius=0.0007, bevel=0.0003, steps=5)
            self.box(group, mat, (x, y - 0.0100, z - 0.0052), (0.0105, 0.0040, 0.0012))
            self.lens(group, x + 0.0062, z + 0.0042, 'green_led', 0.0007, y - 0.0055)

    def fan(self, group: str, x: float, z: float, radius: float, y: float | None = None, blades=7) -> None:
        y = self.front_y - 0.010 if y is None else y
        self.front_cylinder(group, 'black_plastic', (x, y + 0.003, z), radius * 1.04, 0.0060, 64)
        self.front_cylinder(group, 'steel_plain', (x, y - 0.0002, z), radius * 0.93, 0.0022, 64)
        self.front_cylinder(group, 'black_matte', (x, y - 0.0015, z), radius * 0.82, 0.0020, 64)
        # Curved-looking blades built from rotated tapered slabs.
        for i in range(blades):
            a = 2 * math.pi * i / blades + 0.18
            rr = radius * 0.43
            cx = x + math.cos(a) * rr
            cz = z + math.sin(a) * rr
            self.rotated_box(group, 'steel_plain', (cx, y - 0.0028, cz),
                             (radius * 0.50, 0.0018, radius * 0.13), -a + 0.55)
        self.front_cylinder(group, 'black_plastic', (x, y - 0.0041, z), radius * 0.22, 0.0030, 48)
        self.torus_front(group, 'nickel', (x, y - 0.0057, z), radius * 0.82, radius * 0.024, 72, 10)
        self.torus_front(group, 'nickel', (x, y - 0.0058, z), radius * 0.56, radius * 0.018, 72, 8)
        for a in np.linspace(0, 2 * math.pi, 10, endpoint=False):
            self.cylinder_between(group, 'nickel',
                                  (x + radius * 0.10 * math.cos(a), y - 0.0062, z + radius * 0.10 * math.sin(a)),
                                  (x + radius * 0.88 * math.cos(a), y - 0.0062, z + radius * 0.88 * math.sin(a)),
                                  radius * 0.015, sections=10)

    def perforations(self, group: str, center_x: float, center_z: float, width: float, height: float,
                     cols: int, rows: int, y: float | None = None, radius=0.00115) -> None:
        y = self.front_y - 0.0090 if y is None else y
        for ix in range(cols):
            for iz in range(rows):
                x = center_x - width / 2 + (ix + 0.5) * width / cols
                z = center_z - height / 2 + (iz + 0.5) * height / rows
                self.front_cylinder(group, 'black_matte', (x, y, z), radius, 0.0018, 14)

    def nema_outlet(self, group: str, x: float, z: float, width=0.030, height=0.028, plugged=False) -> None:
        y = self.front_y - 0.0090
        self.rounded_prism(group, 'black_plastic', (x, y, z), (width, 0.0034, height), radius=0.0023, bevel=0.0005, steps=6)
        self.rounded_prism(group, 'black_matte', (x - width * 0.17, y - 0.0025, z + height * 0.08),
                           (width * 0.11, 0.0026, height * 0.43), radius=0.0004, bevel=0.0001, steps=4)
        self.rounded_prism(group, 'black_matte', (x + width * 0.17, y - 0.0025, z + height * 0.08),
                           (width * 0.11, 0.0026, height * 0.43), radius=0.0004, bevel=0.0001, steps=4)
        self.front_cylinder(group, 'black_matte', (x, y - 0.0026, z - height * 0.28), width * 0.085, 0.0025, 20)
        if plugged:
            self.rounded_prism(group, 'black_cable', (x, y - 0.0071, z), (width * 0.76, 0.0080, height * 0.82),
                               radius=0.0025, bevel=0.0008, steps=6)
            self.rounded_prism(group, 'black_cable', (x, y - 0.0135, z), (width * 0.46, 0.0060, height * 0.46),
                               radius=0.0020, bevel=0.0006, steps=6)

    def device_shell(self, group: str, z: float, height: float, depth: float, label: str, subtext: str,
                     screen_key: str | None = None, screen_x=-0.205, power=True, panel_width=0.442) -> None:
        # Deep three-dimensional chassis, top/bottom covers, and front panel.
        body_y = self.front_y + 0.010 + depth / 2
        self.uv_box(group, 'steel_textured', (0, body_y, z), (panel_width - 0.006, depth, height * 0.88))
        self.uv_box(group, 'silver_shadow', (0, body_y, z + height * 0.44), (panel_width - 0.002, depth, 0.0040))
        self.uv_box(group, 'silver_shadow', (0, body_y, z - height * 0.44), (panel_width - 0.002, depth, 0.0040))
        self.rounded_prism(group, 'silver_brushed', (0, self.front_y, z), (panel_width, 0.0120, height),
                           radius=0.0042, bevel=0.0014, steps=10)
        # Rack ears, recessed rails and four detailed screws.
        for x in (-0.236, 0.236):
            self.rounded_prism(group, 'silver_brushed', (x, self.front_y + 0.0007, z), (0.030, 0.0110, height * 0.98),
                               radius=0.0022, bevel=0.0010, steps=7)
            for zz in (z - height * 0.31, z + height * 0.31):
                self.screw(group, x, zz)
        # Hairline seams, top vents and rear plate.
        self.box(group, 'silver_highlight', (0, self.front_y - 0.0064, z + height * 0.455), (panel_width - 0.012, 0.0008, 0.0010))
        self.box(group, 'silver_shadow', (0, self.front_y - 0.0064, z - height * 0.455), (panel_width - 0.012, 0.0008, 0.0010))
        for x in np.linspace(-0.145, 0.145, 7):
            self.rounded_prism(group, 'black_matte', (float(x), self.front_y - 0.0067, z + height * 0.40),
                               (0.025, 0.0014, 0.0015), radius=0.0004, bevel=0.0001, steps=4)
        # Rear face and side vents.
        rear_y = self.front_y + 0.010 + depth
        self.uv_box(group, 'silver_brushed', (0, rear_y, z), (panel_width - 0.008, 0.0080, height * 0.84))
        for side_x in (-panel_width * 0.48, panel_width * 0.48):
            for iz in np.linspace(z - height * 0.27, z + height * 0.27, 4):
                self.box(group, 'black_matte', (side_x, body_y, float(iz)), (0.0012, depth * 0.44, 0.0021))
        # Intentionally blank front panel: no visible words, labels, or model names.
        if power:
            self.power_button(group, -0.203, z)
        if screen_key:
            self.screen(group, screen_key, screen_x, z)

    def build_frame(self) -> None:
        g = 'RACK_FRAME'
        W, D = 0.620, 0.640
        z0, z1 = 0.115, 1.420
        post = 0.032
        xp, yp = W / 2 - post / 2, D / 2 - post / 2
        for x in (-xp, xp):
            for y in (-yp, yp):
                self.uv_box(g, 'silver_brushed', (x, y, (z0 + z1) / 2), (post, post, z1 - z0))
                self.box('FRAME_EDGE_HIGHLIGHTS', 'silver_highlight',
                         (x + (-0.010 if x > 0 else 0.010), y - (0.010 if y > 0 else -0.010), (z0 + z1) / 2),
                         (0.0020, 0.0020, z1 - z0 - 0.02))
        for z in (z0, z1):
            for y in (-yp, yp):
                self.uv_box(g, 'silver_brushed', (0, y, z), (W, post, post))
            for x in (-xp, xp):
                self.uv_box(g, 'silver_brushed', (x, 0, z), (post, D, post))
        # Mid-frame separator reproducing the reference's two visual zones.
        for z in (0.928,):
            for y in (-yp, yp):
                self.uv_box(g, 'silver_brushed', (0, y, z), (W, post * 0.86, post * 0.86))
            for x in (-xp, xp):
                self.uv_box(g, 'silver_brushed', (x, 0, z), (post * 0.86, D, post * 0.86))
        # Front/rear rack rails and real square hole spacing.
        for x in (-0.266, 0.266):
            for y in (self.front_y + 0.027, 0.266):
                self.uv_box('MOUNTING_RAILS', 'silver_brushed', (x, y, 0.770), (0.020, 0.020, 1.180))
                for z in np.linspace(0.166, 1.375, 44):
                    self.rounded_prism('RACK_HOLES', 'black_matte',
                                       (x, y - 0.010 if y < 0 else y + 0.010, float(z)),
                                       (0.0060, 0.0022, 0.0058), radius=0.0008, bevel=0.0002, steps=4)
        # Side braces and corner hardware.
        for x in (-xp, xp):
            for z in (0.280, 0.520, 0.760, 1.030, 1.250):
                self.uv_box('SIDE_BRACES', 'silver_brushed', (x, 0, z), (0.018, D - 0.052, 0.018))
                self.screw('SIDE_BRACES', x, z, y=-yp - 0.014, radius=0.0028)
        # External rack-ear brackets and their fasteners, clearly visible from the front.
        for z in np.linspace(0.230, 1.330, 9):
            for x in (-W * 0.5 - 0.011, W * 0.5 + 0.011):
                self.rounded_prism('SIDE_EAR_BRACKETS', 'silver_brushed', (x, -yp + 0.005, float(z)),
                                   (0.020, 0.030, 0.032), radius=0.0025, bevel=0.0008, steps=6)
                self.screw('SIDE_EAR_BRACKETS', x, float(z), y=-yp - 0.012, radius=0.0027)

        # Top carry handle.
        self.cylinder_between('TOP_HANDLE', 'silver_plain', (-0.080, 0, z1 + 0.018), (-0.080, 0, z1 + 0.090), 0.0070, 48)
        self.cylinder_between('TOP_HANDLE', 'silver_plain', (0.080, 0, z1 + 0.018), (0.080, 0, z1 + 0.090), 0.0070, 48)
        self.cylinder_between('TOP_HANDLE', 'silver_plain', (-0.080, 0, z1 + 0.090), (0.080, 0, z1 + 0.090), 0.0070, 48)
        self.cylinder_between('TOP_HANDLE', 'black_matte', (-0.048, -0.0005, z1 + 0.090), (0.048, -0.0005, z1 + 0.090), 0.0085, 48)

    def build_casters(self) -> None:
        for x in (-0.252, 0.252):
            for y in (-0.278, 0.278):
                front = y < 0
                # Turn front casters outward so the round wheel reads in a straight-on render.
                angle = math.radians(23 if x > 0 else -23) if front else 0.0
                axis = np.array([math.cos(angle), math.sin(angle), 0.0])
                center = np.array([x, y, 0.062])
                wheel = trimesh.creation.cylinder(radius=0.048 if front else 0.043, height=0.030, sections=80)
                T = trimesh.geometry.align_vectors([0, 0, 1], axis)
                T[:3, 3] = center
                wheel.apply_transform(T)
                self.add(wheel, 'CASTERS', 'rubber')
                hub = trimesh.creation.cylinder(radius=0.0175, height=0.034, sections=56)
                hub.apply_transform(T)
                self.add(hub, 'CASTERS', 'nickel')
                # Subtle molded tire tread blocks.
                for i in range(18):
                    a = 2 * math.pi * i / 18
                    px = x + 0.045 * math.sin(a) * (-math.sin(angle))
                    py = y + 0.045 * math.sin(a) * math.cos(angle)
                    pz = 0.062 + 0.045 * math.cos(a)
                    self.rounded_prism('CASTER_TREAD', 'rubber', (px, py, pz), (0.010, 0.006, 0.004),
                                       radius=0.0012, bevel=0.0004, steps=5)
                self.rounded_prism('CASTERS', 'silver_brushed', (x, y, 0.116), (0.064, 0.054, 0.015), radius=0.004, bevel=0.001, steps=8)
                self.box('CASTERS', 'silver_plain', (x - 0.025, y, 0.088), (0.0065, 0.050, 0.062))
                self.box('CASTERS', 'silver_plain', (x + 0.025, y, 0.088), (0.0065, 0.050, 0.062))
                if front:
                    self.rounded_prism('CASTER_BRAKES', 'black_matte', (x + (0.030 if x > 0 else -0.030), y - 0.030, 0.042),
                                       (0.033, 0.012, 0.012), radius=0.0025, bevel=0.0008, steps=6)

    def build_udm(self, z=1.315) -> None:
        g = 'UDM_PRO_MAX'
        self.device_shell(g, z, 0.050, 0.286, 'Dream Machine Pro', '10G cloud gateway', screen_key=None)
        # Large inset HDD door exactly like the hero reference.
        self.rounded_prism(g, 'silver_brushed', (-0.020, self.front_y - 0.0070, z), (0.120, 0.0028, 0.030),
                           radius=0.0030, bevel=0.0008, steps=8)
        self.box(g, 'silver_shadow', (-0.020, self.front_y - 0.0090, z - 0.0142), (0.112, 0.0009, 0.0011))
        self.screw(g, 0.036, z + 0.011, radius=0.0015)
        # LAN grid, WAN, SFP and console, laid out at real scale.
        for row in range(2):
            for col in range(4):
                self.rj45_socket(g, 0.105 + col * 0.019, z + (0.0070 if row == 0 else -0.0070), plugged=False, led=True)
        self.rj45_socket(g, 0.190, z - 0.0070, plugged=True, led=True, plug_color='clear_plug')
        self.sfp_cage(g, 0.210, z + 0.0070, transceiver=True, blue=True)
        self.sfp_cage(g, 0.230, z - 0.0070, transceiver=True, blue=True)
        self.lens(g, 0.222, z + 0.0190, 'white_led', 0.0009)
        # Rear I/O and power inlet.
        rear = self.front_y + 0.010 + 0.286 + 0.004
        self.perforations(g, 0.000, z, 0.145, 0.024, 20, 3, y=rear + 0.005, radius=0.0010)
        self.rounded_prism(g, 'black_plastic', (0.188, rear + 0.005, z), (0.028, 0.005, 0.021), radius=0.002, bevel=0.0004, steps=6)
        self.rounded_prism(g, 'black_plastic', (-0.190, rear + 0.005, z), (0.062, 0.005, 0.020), radius=0.002, bevel=0.0004, steps=6)

    def build_patch_panel(self, z=1.245) -> list[float]:
        g = 'PATCH_PANEL_24'
        self.device_shell(g, z, 0.047, 0.070, '24-Port Patch Panel', 'Cat6A shielded', screen_key=None, power=False)
        xs = list(np.linspace(-0.185, 0.160, 24))
        for i, x in enumerate(xs):
            self.rj45_socket(g, float(x), z, plugged=True, led=False, plug_color=('blue_cable' if i >= 20 else 'clear_plug'))
            # Port-number silk screen.
            if i % 2 == 0:
                self.box(g, 'dark_label', (float(x), self.front_y - 0.0115, z + 0.0168), (0.0012, 0.0006, 0.0012))
        return xs

    def build_switch(self, z=1.165) -> list[float]:
        g = 'USW_PRO_24_POE'
        self.device_shell(g, z, 0.052, 0.285, 'Switch Pro 24 PoE', 'Layer 3 / 10G uplinks', screen_key=None)
        xs = list(np.linspace(-0.185, 0.160, 24))
        for i, x in enumerate(xs):
            blue = i >= 20
            self.rj45_socket(g, float(x), z, plugged=True, led=True, plug_color=('blue_cable' if blue else 'clear_plug'))
            self.lens(g, float(x), z + 0.0175, 'green_led' if i % 6 else 'amber_led', 0.00075)
        self.sfp_cage(g, 0.181, z + 0.0070, transceiver=True, blue=True)
        self.sfp_cage(g, 0.181, z - 0.0070, transceiver=True, blue=True)
        self.sfp_cage(g, 0.211, z + 0.0070, transceiver=False)
        self.sfp_cage(g, 0.211, z - 0.0070, transceiver=False)
        return xs

    def build_cable_manager(self, z=1.095) -> None:
        g = 'CABLE_MANAGER'
        self.device_shell(g, z, 0.060, 0.085, 'Cable Manager', '24-channel low-bend routing', screen_key=None, power=False)
        # Continuous brushed bar and 24 individual retaining fingers.
        self.rounded_prism(g, 'silver_brushed', (0, self.front_y - 0.0100, z), (0.398, 0.0040, 0.016),
                           radius=0.004, bevel=0.0007, steps=8)
        for x in np.linspace(-0.183, 0.183, 24):
            self.front_cylinder(g, 'silver_plain', (float(x), self.front_y - 0.014, z), 0.0041, 0.0040, 28)
            self.torus_front(g, 'silver_plain', (float(x), self.front_y - 0.0165, z - 0.010), 0.0105, 0.0016, 40, 8)
            self.box(g, 'silver_plain', (float(x), self.front_y - 0.0164, z - 0.004), (0.0030, 0.0028, 0.015))

    def build_rps(self, z=0.995) -> None:
        g = 'USP_RPS_PRO'
        self.device_shell(g, z, 0.070, 0.326, 'SmartPower RPS Pro', 'Redundant DC power', screen_key=None)
        # Sparse front, as in the AI reference, with network ports at right.
        self.rj45_socket(g, 0.193, z + 0.0065, plugged=False, led=True)
        self.rj45_socket(g, 0.214, z + 0.0065, plugged=False, led=True)
        self.lens(g, 0.224, z - 0.017, 'white_led', 0.0009)
        rear = self.front_y + 0.010 + 0.326 + 0.004
        for i, x in enumerate(np.linspace(-0.150, 0.100, 6)):
            self.rounded_prism(g, 'black_plastic', (float(x), rear + 0.005, z), (0.035, 0.006, 0.025), radius=0.002, bevel=0.0005, steps=6)
            self.lens(g, float(x) + 0.011, z + 0.008, 'green_led', 0.0008, y=rear + 0.008)
        self.fan(g, 0.160, z, 0.020, y=rear + 0.007, blades=7)
        self.fan(g, 0.205, z, 0.020, y=rear + 0.007, blades=7)

    def build_nvr(self, z=0.825) -> None:
        g = 'UNVR_PRO_7'
        self.device_shell(g, z, 0.112, 0.325, 'Network Video Recorder Pro', '7-bay Protect storage', screen_key=None)
        # 7 precision drive trays: four top, three bottom.
        positions = [(-0.110, 0.023), (-0.035, 0.023), (0.040, 0.023), (0.115, 0.023),
                     (-0.073, -0.025), (0.002, -0.025), (0.077, -0.025)]
        for i, (x, dz) in enumerate(positions):
            self.rounded_prism(g, 'silver_brushed', (x, self.front_y - 0.0082, z + dz), (0.067, 0.0032, 0.041),
                               radius=0.0023, bevel=0.0008, steps=7)
            self.box(g, 'silver_shadow', (x + 0.030, self.front_y - 0.0105, z + dz), (0.0030, 0.0014, 0.034))
            self.rounded_prism(g, 'black_plastic', (x - 0.025, self.front_y - 0.0106, z + dz - 0.014),
                               (0.010, 0.0016, 0.0040), radius=0.0008, bevel=0.0002, steps=4)
            self.front_cylinder(g, 'nickel', (x + 0.026, self.front_y - 0.0113, z + dz + 0.014), 0.0018, 0.0014, 20)
            self.lens(g, x - 0.029, z + dz + 0.015, 'blue_led' if i in (1, 4) else 'green_led', 0.00085)
        self.rj45_socket(g, 0.190, z + 0.027, plugged=True, led=True, plug_color='clear_plug')
        self.sfp_cage(g, 0.218, z + 0.027, transceiver=False)
        # Rear twin fans and power inputs.
        rear = self.front_y + 0.010 + 0.325 + 0.004
        self.fan(g, 0.010, z, 0.027, y=rear + 0.007, blades=7)
        self.fan(g, 0.078, z, 0.027, y=rear + 0.007, blades=7)
        self.rounded_prism(g, 'black_plastic', (-0.185, rear + 0.006, z), (0.064, 0.006, 0.024), radius=0.002, bevel=0.0005, steps=6)
        self.rounded_prism(g, 'black_plastic', (0.198, rear + 0.006, z), (0.028, 0.006, 0.024), radius=0.002, bevel=0.0005, steps=6)

    def build_power_matrix(self, z=0.690) -> None:
        g = 'SMARTPOWER_MATRIX'
        self.device_shell(g, z, 0.098, 0.185, 'SmartPower Matrix', 'Managed DC distribution', screen_key=None)
        # 20 modular power blocks and four plugged leads.
        xs = np.linspace(-0.090, 0.150, 5)
        for row, dz in enumerate((0.024, -0.024)):
            for x in xs:
                self.rounded_prism(g, 'black_plastic', (float(x), self.front_y - 0.0088, z + dz),
                                   (0.042, 0.0036, 0.034), radius=0.0022, bevel=0.0007, steps=6)
                self.box(g, 'steel_plain', (float(x), self.front_y - 0.0111, z + dz), (0.020, 0.0012, 0.0020))
                self.lens(g, float(x) + 0.015, z + dz + 0.011, 'green_led', 0.00075)
        starts = (-0.100, -0.061, -0.021, 0.018)
        targets = starts
        for i, (x, tx) in enumerate(zip(starts, targets)):
            self.rounded_prism(g, 'black_cable', (x, self.front_y - 0.0110, z + 0.005), (0.022, 0.007, 0.046),
                               radius=0.0030, bevel=0.0010, steps=7)
            # Parallel, low-crossing cable paths like the approved product image.
            pts = self.cubic_bezier((x, self.front_y - 0.017, z - 0.012),
                                    (x, self.front_y - 0.068, z - 0.030),
                                    (tx, self.front_y - 0.068, 0.610),
                                    (tx, self.front_y - 0.020, 0.581), 96)
            self.curve_tube('POWER_MATRIX_CORDS', 'black_cable', pts, 0.0045, 30)
            for n in range(4):
                self.front_cylinder('POWER_MATRIX_BOOT_RINGS', 'black_cable',
                                    (x, self.front_y - 0.019 - n * 0.0012, z - 0.012),
                                    0.0052 - n * 0.0003, 0.0006, 26)

    def build_pdu(self, z=0.560) -> None:
        g = 'USP_PDU_PRO'
        self.device_shell(g, z, 0.095, 0.106, 'Power Distribution Pro', '16 monitored outlets', screen_key=None)
        top_xs = list(np.linspace(-0.100, 0.175, 8))
        for i, x in enumerate(top_xs):
            self.nema_outlet(g, float(x), z + 0.021, 0.031, 0.028, plugged=(i < 4))
        for i, x in enumerate((-0.090, -0.010, 0.070, 0.150)):
            self.nema_outlet(g, x, z - 0.024, 0.052, 0.034, plugged=(i == 3))
        self.screen(g, 'pdu', -0.160, z + 0.021, 0.037, 0.029)
        self.rj45_socket(g, 0.212, z - 0.025, plugged=False, led=True)
        # A single heavy outgoing cable hugs the right rail instead of crossing the rack.
        pts = self.cubic_bezier((0.150, self.front_y - 0.018, z - 0.024),
                                (0.210, self.front_y - 0.090, z - 0.035),
                                (0.252, self.front_y - 0.090, 0.500),
                                (0.245, self.front_y - 0.030, 0.470), 104)
        self.curve_tube('PDU_RIGHT_POWER_CORD', 'black_cable', pts, 0.0050, 32)

    def build_cooling_ups(self, z=0.435) -> None:
        g = 'UPS_COOLING_MODULE'
        self.device_shell(g, z, 0.090, 0.260, 'Smart UPS Module', 'Battery and thermal control', screen_key=None)
        self.fan(g, -0.020, z, 0.032, blades=7)
        self.fan(g, 0.064, z, 0.032, blades=7)
        self.screen(g, 'ups', -0.158, z, 0.040, 0.031)
        self.rounded_prism(g, 'black_plastic', (0.190, self.front_y - 0.009, z), (0.036, 0.004, 0.034),
                           radius=0.003, bevel=0.0007, steps=6)
        self.lens(g, 0.217, z + 0.024, 'green_led', 0.0010)
        pts = self.cubic_bezier((0.190, self.front_y - 0.018, z),
                                (0.240, self.front_y - 0.090, z - 0.010),
                                (0.255, self.front_y - 0.100, 0.320),
                                (0.242, self.front_y - 0.030, 0.285), 96)
        self.curve_tube('UPS_POWER_CORD', 'black_cable', pts, 0.0053, 32)

    def build_bottom_fan_unit(self, z=0.305) -> None:
        g = 'TRANSFER_FAN_SWITCH'
        self.device_shell(g, z, 0.090, 0.210, 'Transfer Switch', 'Automatic failover and cooling', screen_key=None)
        # Three honeycomb-like vents.
        for cx in (-0.145, -0.075, -0.005):
            self.rounded_prism(g, 'black_plastic', (cx, self.front_y - 0.0088, z), (0.058, 0.0034, 0.036),
                               radius=0.0024, bevel=0.0005, steps=6)
            self.perforations(g, cx, z, 0.050, 0.029, 8, 5, radius=0.0010)
        for cx in (0.070, 0.125, 0.180):
            self.fan(g, cx, z, 0.021, blades=7)
        self.rounded_prism(g, 'black_plastic', (0.222, self.front_y - 0.009, z), (0.028, 0.004, 0.031),
                           radius=0.0024, bevel=0.0006, steps=6)
        pts = self.cubic_bezier((0.222, self.front_y - 0.018, z),
                                (0.256, self.front_y - 0.090, z - 0.006),
                                (0.255, self.front_y - 0.100, 0.230),
                                (0.244, self.front_y - 0.030, 0.205), 96)
        self.curve_tube('TRANSFER_POWER_CORD', 'black_cable', pts, 0.0050, 30)

    def build_patch_cables(self, patch_xs: Sequence[float], switch_xs: Sequence[float], patch_z=1.245, switch_z=1.165) -> None:
        # Twenty-four exact one-to-one jumpers. Each cord stays on its own X centerline.
        for i, (px, sx) in enumerate(zip(patch_xs, switch_xs)):
            y_face = self.front_y - 0.019
            # Same X at both ends means port N connects only to port N, with zero crossing.
            x = 0.5 * (px + sx)
            outer = abs((i - 11.5) / 11.5)
            depth = 0.031 + 0.0045 * outer + 0.0007 * (i % 3)
            p0 = (px, y_face, patch_z - 0.0004)
            p1 = (x, y_face - depth, patch_z - 0.018)
            p2 = (x, y_face - depth, switch_z + 0.018)
            p3 = (sx, y_face, switch_z + 0.0004)
            pts = self.cubic_bezier(p0, p1, p2, p3, 116)
            material = 'blue_cable' if i >= 20 else 'white_cable'
            radius = 0.00156 if i >= 20 else 0.00144
            self.curve_tube('PATCH_CABLES_BLUE' if i >= 20 else 'PATCH_CABLES_WHITE', material, pts, radius, 28)

        # Two tidy, parallel SFP uplinks. Both end at modeled transceivers.
        uplinks = [
            ((0.181, switch_z + 0.0070), (0.210, 1.315 + 0.0070), 0.000),
            ((0.181, switch_z - 0.0070), (0.230, 1.315 - 0.0070), 0.006),
        ]
        for (x0, z0), (x3, z3), offset in uplinks:
            p0 = (x0, self.front_y - 0.019, z0)
            p3 = (x3, self.front_y - 0.019, z3)
            pts = self.cubic_bezier(
                p0,
                (0.235 + offset, self.front_y - 0.054, z0 + 0.018),
                (0.246 + offset, self.front_y - 0.054, z3 - 0.018),
                p3,
                118,
            )
            self.curve_tube('BLUE_UPLINKS', 'blue_cable', pts, 0.00172, 30)

        # A connected service lead runs cleanly down the right edge from gateway to recorder.
        service_start = (0.190, self.front_y - 0.019, 1.315 - 0.0070)
        service_end = (0.190, self.front_y - 0.019, 0.825 + 0.0270)
        pts = self.cubic_bezier(
            service_start,
            (0.245, self.front_y - 0.045, 1.270),
            (0.245, self.front_y - 0.045, 0.900),
            service_end,
            150,
        )
        self.curve_tube('LONG_WHITE_SERVICE_CABLE', 'white_cable', pts, 0.00152, 28)

    def build_rear_cabling(self) -> None:
        # Real rear wiring bundles with lacing bars and plugs on each appliance.
        rear_y = 0.292
        for x in (-0.222, 0.222):
            self.uv_box('REAR_LACING_BARS', 'silver_brushed', (x, rear_y - 0.006, 0.760), (0.014, 0.014, 1.080))
            for z in np.linspace(0.245, 1.310, 12):
                self.torus_front('REAR_LACING_RINGS', 'black_matte', (x, rear_y - 0.016, float(z)), 0.010, 0.0015, 36, 8)
        starts = [(-0.188, 1.315), (-0.176, 1.165), (-0.130, 0.995), (0.198, 0.825), (0.198, 0.560)]
        for i, (x, z) in enumerate(starts):
            pts = self.cubic_bezier((x, rear_y + 0.010, z),
                                    (x - 0.030, rear_y + 0.050, z - 0.040),
                                    (-0.220 + i * 0.020, rear_y + 0.055, 0.280 + i * 0.025),
                                    (-0.220 + i * 0.020, rear_y + 0.005, 0.215), 96)
            self.curve_tube('REAR_POWER_BUNDLE', 'black_cable', pts, 0.0038 + 0.00025 * (i % 2), 26)
        # Blue rear data trunk.
        pts = self.cubic_bezier((0.165, rear_y + 0.010, 1.165),
                                (0.235, rear_y + 0.050, 1.100),
                                (0.215, rear_y + 0.055, 0.640),
                                (0.190, rear_y + 0.010, 0.560), 120)
        self.curve_tube('REAR_DATA_TRUNK', 'blue_cable', pts, 0.0023, 26)

    def build(self) -> trimesh.Scene:
        steps = [
            ('frame', self.build_frame), ('casters', self.build_casters), ('udm', self.build_udm),
            ('cable_manager', self.build_cable_manager), ('rps', self.build_rps), ('nvr', self.build_nvr),
            ('power_matrix', self.build_power_matrix), ('pdu', self.build_pdu),
            ('cooling', self.build_cooling_ups), ('transfer', self.build_bottom_fan_unit),
            ('rear', self.build_rear_cabling),
        ]
        for name, fn in steps[:3]:
            print('BUILD', name, flush=True); fn()
        print('BUILD patch', flush=True); patch = self.build_patch_panel()
        print('BUILD switch', flush=True); switch = self.build_switch()
        for name, fn in steps[3:10]:
            print('BUILD', name, flush=True); fn()
        print('BUILD patch cables', flush=True); self.build_patch_cables(patch, switch)
        print('BUILD rear', flush=True); self.build_rear_cabling()
        self.uv_box('BOTTOM_SHELF', 'silver_brushed', (0, 0.010, 0.155), (0.500, 0.520, 0.018))
        for x in (-0.205, 0.205):
            self.front_cylinder('SHELF_FEET', 'rubber', (x, -0.245, 0.145), 0.012, 0.006, 36)
        print('BUILD to_scene', flush=True)
        return self.to_scene()

    def to_scene(self) -> trimesh.Scene:
        scene = trimesh.Scene()
        for group in sorted(self.parts):
            for material_name in sorted(self.parts[group]):
                meshes = self.parts[group][material_name]
                if not meshes:
                    continue
                merged = trimesh.util.concatenate(meshes)
                try:
                    merged.remove_unreferenced_vertices()
                    merged.fix_normals()
                except Exception:
                    pass
                material = self.materials[material_name]
                if isinstance(merged.visual, TextureVisuals) and getattr(merged.visual, 'uv', None) is not None:
                    merged.visual = TextureVisuals(uv=merged.visual.uv, material=material)
                else:
                    merged.visual = TextureVisuals(material=material)
                name = f'{group}__{material_name}'
                scene.add_geometry(merged, geom_name=name, node_name=name)
        scene.metadata['title'] = self.scene_title
        scene.metadata['author'] = self.scene_author
        scene.metadata['units'] = 'meters'
        scene.metadata['note'] = self.scene_note
        return scene


if __name__ == '__main__':
    rack = UniFiHeroRack()
    scene = rack.build()
    out = OUT / 'UniFi_Hero_Rack_CLEAN_ALIGNED.glb'
    export_glb(scene, out)
    faces = sum(len(g.faces) for g in scene.geometry.values())
    verts = sum(len(g.vertices) for g in scene.geometry.values())
    print(out)
    print(f'{faces:,} triangles, {verts:,} vertices, {len(scene.geometry)} geometry groups')
