"""Dell PowerVault ME4084, drawn from Dell's own front hero photograph.

Eighty four drives and not one drive carrier on the front. That is the
whole point of a 5U84 and the thing a grid of bays would get wrong: the
drives load from the top, into two enormous drawers that fill the entire
face, and what the front of this enclosure actually presents is two
perforated slabs, a pull handle sunk into each end of each slab, and a
narrow operations column down the left ear. Forty two bays are behind each
slab and none of them are visible.

Calibration. Dell's ME4 family hero is near enough dead on for horizontal
work: the 5U enclosure spans x 327 to 1071, 745 pixels, for the 483.0mm
Dell publish as its width, which puts a pixel at 0.6483mm. It is shot from
slightly above, so its vertical scale is about ten percent short, and the
vertical proportions here come instead from the three quarter shot where
the front left corner is square to the camera: the face runs y 294 to 740,
the drawer seam sits at y 511 to 518, and the two drawers come out equal to
within two pixels in 212, which is what you would expect of two of the same
part.

What the photographs show:

  A left ear about 22mm wide carrying the operations panel: the model name
  at the top, a two digit seven segment enclosure ID lit green, a small
  button, then five status lamps with their icons, and an information
  symbol at the bottom.

  Two drawer faces, each 105mm tall, perforated edge to edge with an 11mm
  pitch hexagonal mesh, with large hexagon outlines pressed into the sheet
  and half a dozen round fastener dimples. DELL EMC is set across the upper
  drawer and the PowerVault hexagon badge sits low on the lower one.

  At each end of each drawer, a recess holding two things: a light strip
  carrying four icon lenses and six green segment bars, and beside it the
  pull handle, a deep slot with a comb of grip ribs across it. The strip is
  outboard and the slot inboard on both ends, so the pair is mirrored
  rather than repeated.

Nothing here is shared with another product. A top load drawer face is not
a bay grid, this enclosure's hexagonal perforation is nothing like the
round punchings on Dell's 2U members, and its segment bars appear on no
other product in this library.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import Device, Reference


class ME4084(Device):
    slug = "ME4084"
    name = "Dell PowerVault ME4084"
    u = 5
    #: Dell publish 22.23 x 48.30 x 97.47 cm for the 5U84 enclosure. The
    #: face is the full 19 inches, ears included, so there is no separate
    #: bracket to bolt on: the ops ear is part of the same plate.
    width = 0.4830
    depth = 0.9200
    source = "https://www.dell.com/support/manuals/en-us/powervault-me4084/me4_series_om_pub/"
    references = [
        Reference("https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/"
                  "dell-enterprise-products/storage-systems/powervault/me4-family/global-spi/"
                  "enterprise-powervault-me4-series-ff-hero-504x350-ng.psd?fmt=jpg&wid=1400",
                  "ME4 family hero, the 5U84 at the back is near dead on, 745px wide"),
        Reference("https://expresscomputersystems.com/cdn/shop/products/"
                  "ME4084-Main_cf612967-1736-4b1d-b5f1-c5f0e8c16758_1600x.jpg?v=1678229791",
                  "three quarter front left, square at the near corner, gives the vertical bands"),
        Reference("https://expresscomputersystems.com/cdn/shop/products/"
                  "ME4084-drive-tray_3101b1f0-7d59-42cc-9699-fe53fdabeda8_1600x.jpg?v=1678229791",
                  "rack photo with the upper drawer pulled, confirms the top load layout"),
    ]

    def face(self, rack) -> float:
        """The plane of the drawer faces, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # -------------------------------------------------------------- measured
    #
    # Horizontal figures are metres from the left edge of the 483mm face.
    # Vertical figures are fractions of the 5U panel height, zero at the
    # middle, converted from the three quarter shot as (517 - y) / 446.

    OPS_EAR = (0.0000, 0.0220)
    DRAWER_X = (0.0220, 0.4600)
    RIGHT_EAR = (0.4600, 0.4830)

    TOP_LIP = (0.5000, 0.4865)
    DRAWER1_Z = (0.4865, 0.0135)
    SEAM_Z = (0.0135, -0.0022)
    DRAWER2_Z = (-0.0022, -0.4776)
    BOTTOM_LIP = (-0.4776, -0.5000)

    #: The handle recess at each end, and the two things inside it.
    RECESS_L, RECESS_R = (0.0246, 0.0584), (0.4242, 0.4580)
    STRIP_L, SLOT_L = (0.0305, 0.0395), (0.0410, 0.0575)
    STRIP_R, SLOT_R = (0.4431, 0.4521), (0.4251, 0.4416)
    #: The recess starts 8 percent below the top of a drawer and ends 86
    #: percent down, measured off the hero shot against the drawer band.
    RECESS_TOP, RECESS_BOTTOM = 0.08, 0.86
    #: Six segment bars in the lower half of the strip, four icon lenses
    #: above them.
    SEGMENTS, ICONS = 6, 4

    #: 11.0mm hexagonal perforation, measured across twenty five holes on
    #: three separate rows of the hero shot and identical on all three.
    VENT_PITCH = 0.01100
    #: The pressed hexagon outlines, which are far bigger than the holes.
    BIG_HEX_PITCH = 0.0740

    #: Round fastener dimples, as fractions across the drawer face.
    DIMPLE_X = (0.115, 0.285, 0.500, 0.715, 0.885)
    DIMPLE_Z = (0.24, 0.76)

    #: Operations panel, on the left ear.
    OPS_X = 0.0110
    OPS_NAME_Z = 0.4753
    OPS_SEG_Z, OPS_BUTTON_Z, OPS_INFO_Z = 0.1660, 0.1200, -0.0325
    OPS_STATUS_Z = (0.0964, 0.0695, 0.0426, 0.0157, -0.0112)

    DELL_X, DELL_Z = 0.2413, 0.2400
    BADGE_X, BADGE_Z = 0.3010, -0.3900

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # The drawer sheet reads 72 in the photograph, but 72 is the
            # average of the mesh, not the metal: the lands between the
            # holes are near 95 and the holes are near black. Painting the
            # sheet at 72 and then darkening it again with the perforation
            # overlay is how the first pass produced a black slab.
            "me_sheet": pbr("ME4084 Drawer Sheet", [76, 76, 81, 255], 0.28, 0.64),
            "me_rail": pbr("ME4084 Drawer Rail", [66, 66, 70, 255], 0.34, 0.56),
            "me_seam": pbr("ME4084 Drawer Seam", [27, 26, 31, 255], 0.20, 0.72),
            "me_ear": pbr("ME4084 Ops Ear", [66, 66, 70, 255], 0.30, 0.60),
            "me_ear_dark": pbr("ME4084 Ops Recess", [44, 44, 48, 255], 0.24, 0.68),
            # The handle recess and the slot in it are two different darks:
            # the recess is a lit surface at 48 and the slot is a hole.
            "me_recess": pbr("ME4084 Handle Recess", [47, 51, 50, 255], 0.24, 0.62),
            "me_slot": pbr("ME4084 Handle Slot", [15, 15, 18, 255], 0.10, 0.86),
            "me_rib": pbr("ME4084 Grip Rib", [86, 87, 90, 255], 0.36, 0.50),
            "me_strip": pbr("ME4084 Indicator Strip", [172, 173, 176, 255], 0.24, 0.44),
            # Lit segment bars. These are genuinely lit in every photograph
            # of a running enclosure, so unlike an alarm lamp they get a
            # real emissive.
            "me_seg": pbr("ME4084 Segment Bar", [94, 196, 88, 255], 0.0, 0.26,
                          emissive=[0.10, 0.42, 0.10]),
            "me_icon": pbr("ME4084 Icon Lens", [58, 60, 60, 255], 0.06, 0.52),
            "me_icon_lit": pbr("ME4084 Power Lens", [96, 198, 96, 255], 0.0, 0.28,
                               emissive=[0.10, 0.40, 0.10]),
            "me_amber": pbr("ME4084 Fault Lens", [150, 84, 62, 255], 0.0, 0.34),
            # The seven segment enclosure ID, which is the only lit display.
            "me_seg_glass": pbr("ME4084 ID Window", [20, 24, 21, 255], 0.0, 0.30),
            "me_seg_ink": pbr("ME4084 ID Digits", [110, 226, 118, 255], 0.0, 0.24,
                              emissive=[0.16, 0.52, 0.18]),
            "me_button": pbr("ME4084 Ops Button", [156, 157, 158, 255], 0.20, 0.48),
            "me_dimple": pbr("ME4084 Fastener", [64, 64, 68, 255], 0.40, 0.52),
        })

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """The perforation, the pressed hexagons and the two wordmarks.

        Almost the whole face of this enclosure is holes: two drawer sheets
        of 438 by 105mm on an 11mm hexagonal pitch is close to eight hundred
        of them, and as geometry that is eight hundred prisms for something
        that is flat. Painted, it costs one texture and reads correctly,
        which is the same trade the perforated Juniper panels make.

        The pressed hexagon outlines are a separate, much coarser pattern,
        and they are the thing that makes a Dell drawer face recognisable
        from across a room, so they are drawn over the mesh rather than
        instead of it.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        hole = (14, 14, 17, 255)
        press = (58, 58, 63, 150)
        white = (232, 233, 235, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=white):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]),
                   text, font=f, fill=fill)

        step_x = self.VENT_PITCH * ppm
        step_y = step_x * math.sqrt(3) / 2
        hex_r = self.VENT_PITCH * 0.42 * ppm
        big = self.BIG_HEX_PITCH * ppm

        for zt, zb in (self.DRAWER1_Z, self.DRAWER2_Z):
            top, bottom = py(zt) + step_y * 0.7, py(zb) - step_y * 0.4
            row, yy = 0, top
            while yy < bottom:
                xx = px(self.DRAWER_X[0]) + step_x * 0.6 + (row % 2) * step_x / 2
                while xx < px(self.DRAWER_X[1]) - step_x * 0.4:
                    d.regular_polygon((xx, yy, hex_r), 6, rotation=0, fill=hole)
                    xx += step_x
                yy += step_y
                row += 1
            # The pressed outlines: one row of large hexagons across the
            # middle of each drawer, which is what the photograph shows,
            # not a full honeycomb.
            cy = (py(zt) + py(zb)) / 2
            n = int((px(self.DRAWER_X[1]) - px(self.DRAWER_X[0])) / big) + 1
            for i in range(n):
                cx = px(self.DRAWER_X[0]) + (i + 0.5) * big
                ry = (py(zb) - py(zt)) * 0.46
                pts = [(cx + big * 0.52 * math.cos(math.radians(a + 30)),
                        cy + ry * math.sin(math.radians(a + 30)))
                       for a in range(0, 360, 60)]
                d.line(pts + [pts[0]], fill=press, width=max(2, int(0.0016 * ppm)), joint="curve")

        # DELL EMC across the upper drawer, PowerVault low on the lower one.
        f_dell = sized(9.0, True)
        centred("DELL", px(self.DELL_X) - 0.0130 * ppm, py(self.DELL_Z), f_dell)
        centred("EMC", px(self.DELL_X) + 0.0185 * ppm, py(self.DELL_Z), sized(8.0))
        centred("PowerVault", px(self.BADGE_X), py(self.BADGE_Z), sized(4.4),
                (196, 158, 108, 255))
        centred("ME4084", px(self.OPS_X), py(self.OPS_NAME_Z), sized(2.4))

        tex = save_texture("me4084_silkscreen.png", img)
        rack.materials["me_silktex"] = PBRMaterial(
            name="ME4084 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.62,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "me_silktex",
                            (0, self.face(rack) - 0.0010, z), self.width, self.height)

    # ----------------------------------------------------------------- parts

    def handle(self, rack, g: str, z: float, dz: float, recess, strip, slot) -> None:
        """One end of one drawer: the recess, the indicator strip and the
        pull slot.

        The slot is a comb, not a bar. What tells a viewer this is a handle
        rather than a vent is the row of grip ribs across the back of it,
        and leaving them out gives a black rectangle indistinguishable from
        the perforation around it.
        """
        y = self.face(rack)
        h = self.height
        rx0, rx1 = (-self.width / 2 + v for v in recess)
        rack.box(g, "me_recess", ((rx0 + rx1) / 2, y - 0.0006, z),
                 (rx1 - rx0, 0.0010, dz))
        sx0, sx1 = (-self.width / 2 + v for v in strip)
        rack.rounded_prism(g, "me_strip", ((sx0 + sx1) / 2, y - 0.0013, z),
                           (sx1 - sx0, 0.0012, dz * 0.94), radius=0.0018, bevel=0.0004, steps=8)
        # Four icon lenses in the top half, six segment bars in the bottom.
        cx = (sx0 + sx1) / 2
        for i in range(self.ICONS):
            mat = "me_icon_lit" if i == 0 else "me_icon"
            rack.front_cylinder(g, mat, (cx, y - 0.0021, z + dz * (0.36 - i * 0.075)),
                                0.0019, 0.0008, 14)
        for i in range(self.SEGMENTS):
            rack.box(g, "me_seg", (cx, y - 0.0021, z - dz * (0.05 + i * 0.062)),
                     ((sx1 - sx0) * 0.62, 0.0008, dz * 0.030))
        lx0, lx1 = (-self.width / 2 + v for v in slot)
        rack.box(g, "me_slot", ((lx0 + lx1) / 2, y - 0.0010, z), (lx1 - lx0, 0.0010, dz * 0.94))
        # The grip comb. Sixteen ribs across the slot, set back so the slot
        # still reads as a hole with something in it.
        for i in range(16):
            rack.box(g, "me_rib", ((lx0 + lx1) / 2, y - 0.0014,
                                   z + dz * (0.44 - i * 0.058)),
                     ((lx1 - lx0) * 0.86, 0.0008, dz * 0.020))

    def drawer(self, rack, g: str, zt: float, zb: float, z: float) -> None:
        """One drawer face: the sheet, its rails, and a handle at each end."""
        y = self.face(rack)
        h = self.height
        x0, x1 = self.DRAWER_X
        cx = -self.width / 2 + (x0 + x1) / 2
        cz = z + (zt + zb) / 2 * h
        dh = (zt - zb) * h
        rack.box(g, "me_sheet", (cx, y - 0.0004, cz), (x1 - x0, 0.0010, dh))
        for dz in (dh / 2 - 0.0016, -dh / 2 + 0.0016):
            rack.box(g, "me_rail", (cx, y - 0.0008, cz + dz), (x1 - x0, 0.0009, 0.0032))
        rec = dh * (self.RECESS_BOTTOM - self.RECESS_TOP)
        rz = cz + dh / 2 - dh * (self.RECESS_TOP + self.RECESS_BOTTOM) / 2
        self.handle(rack, g, rz, rec, self.RECESS_L, self.STRIP_L, self.SLOT_L)
        self.handle(rack, g, rz, rec, self.RECESS_R, self.STRIP_R, self.SLOT_R)
        # Fastener dimples, pressed into the sheet between the hexagons.
        for fx in self.DIMPLE_X:
            for fz in self.DIMPLE_Z:
                rack.front_cylinder(g, "me_dimple",
                                    (-self.width / 2 + x0 + fx * (x1 - x0), y - 0.0007,
                                     cz + dh / 2 - fz * dh), 0.0034, 0.0008, 16)

    # ----------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h = self.height
        w = self.width

        def X(from_left: float) -> float:
            return -w / 2 + from_left

        def Z(frac: float) -> float:
            return z + frac * h

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.014, self.depth, h * 0.96))
        rack.rounded_prism(g, "me_ear", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0018, bevel=0.0008, steps=6)

        # Top and bottom lips, and the seam between the drawers.
        for zt, zb, mat in ((self.TOP_LIP[0], self.TOP_LIP[1], "me_rail"),
                            (self.SEAM_Z[0], self.SEAM_Z[1], "me_seam"),
                            (self.BOTTOM_LIP[0], self.BOTTOM_LIP[1], "me_rail")):
            rack.box(g, mat, (0, y - 0.0004, Z((zt + zb) / 2)), (w, 0.0009, (zt - zb) * h))

        self.drawer(rack, g, *self.DRAWER1_Z, z)
        self.drawer(rack, g, *self.DRAWER2_Z, z)

        # ---- operations panel on the left ear ---------------------------
        ex0, ex1 = self.OPS_EAR
        rack.box(g, "me_ear", (X((ex0 + ex1) / 2), y - 0.0005, z), (ex1 - ex0, 0.0010, h * 0.99))
        # The two digit enclosure ID, in a recessed window.
        rack.box(g, "me_ear_dark", (X(self.OPS_X), y - 0.0009, Z(self.OPS_SEG_Z)),
                 (0.0150, 0.0010, 0.0104))
        rack.box(g, "me_seg_glass", (X(self.OPS_X), y - 0.0012, Z(self.OPS_SEG_Z)),
                 (0.0130, 0.0008, 0.0086))
        # Two digits, each seven bars. Drawn as bars rather than lettered
        # in the overlay because a seven segment glyph is a shape, not a
        # typeface, and setting it in DejaVu reads as a printed number.
        for k, digit in enumerate((0, 1)):
            dx = X(self.OPS_X) + (k - 0.5) * 0.0058
            on = ((1, 1, 1, 0, 1, 1, 1), (0, 0, 1, 0, 0, 1, 0))[digit]
            geom = ((0.0, 0.0034, 1), (-0.0022, 0.0017, 0), (0.0022, 0.0017, 0),
                    (0.0, 0.0000, 1), (-0.0022, -0.0017, 0), (0.0022, -0.0017, 0),
                    (0.0, -0.0034, 1))
            for lit, (ox, oz, horiz) in zip(on, geom):
                if not lit:
                    continue
                ext = (0.0038, 0.0006, 0.0008) if horiz else (0.0008, 0.0006, 0.0030)
                rack.box(g, "me_seg_ink", (dx + ox, y - 0.0016, Z(self.OPS_SEG_Z) + oz), ext)
        rack.rounded_prism(g, "me_button", (X(self.OPS_X), y - 0.0011, Z(self.OPS_BUTTON_Z)),
                           (0.0130, 0.0010, 0.0044), radius=0.0010, bevel=0.0003, steps=6)
        for i, sz in enumerate(self.OPS_STATUS_Z):
            mat = "me_icon_lit" if i == 0 else "me_amber"
            rack.front_cylinder(g, mat, (X(self.OPS_X) - 0.0038, y - 0.0011, Z(sz)),
                                0.0020, 0.0008, 14)
            rack.front_cylinder(g, "me_icon", (X(self.OPS_X) + 0.0038, y - 0.0011, Z(sz)),
                                0.0020, 0.0008, 14)
        rack.front_cylinder(g, "me_icon", (X(self.OPS_X) + 0.0038, y - 0.0011, Z(self.OPS_INFO_Z)),
                            0.0020, 0.0008, 14)

        # ---- right ear and its side latch --------------------------------
        rx0, rx1 = self.RIGHT_EAR
        rack.box(g, "me_ear", (X((rx0 + rx1) / 2), y - 0.0005, z), (rx1 - rx0, 0.0010, h * 0.99))
        for lz in (0.3600, -0.3600):
            rack.rounded_prism(g, "me_ear_dark", (X((rx0 + rx1) / 2), y - 0.0012, Z(lz)),
                               (0.0130, 0.0014, 0.0110), radius=0.0016, bevel=0.0004, steps=8)

        self.silkscreen(rack, z)
