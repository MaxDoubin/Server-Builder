"""Juniper QFX5120-48Y, drawn from Juniper's own straight-on studio photograph.

Juniper publish this one as a PNG with an alpha channel and no background,
which is the next best thing to an elevation: the alpha gives the panel's
exact rectangle, so the calibration does not depend on anybody's eye, and
the cage openings can be found by thresholding rather than by measuring
across a screenshot with a ruler.

What the photograph shows, left to right:

  A plain bezel strip at the far left with a shallow inset pocket in it,
  then forty eight SFP28 cages in two rows of twenty four, ganged in three
  blocks of eight columns rather than the four blocks of six most vendors
  use. A block boundary is worth two and a half millimetres of extra
  metal and nothing else, which is the whole reason the bank has a rhythm
  at all.

  Then eight QSFP28 in two rows of four, each cage half again as wide as
  an SFP28 and set behind a much heavier bright rim.

  Above and below the port field, a punched honeycomb runs the full width
  of the panel, two rows of hexagons at each end with the outermost row
  clipped by the panel edge. Between the honeycomb and the ports sits a
  strip carrying the port numbers in white with two round lamps flanking
  each of them, four lamps to a QSFP because a QSFP is four lanes.

  A cyan strip stands on edge at the extreme right. It is two millimetres
  wide, it is the only colour anywhere on the product, and leaving it out
  is the fastest way to make a QFX look like somebody else's switch.

This is the light one. A QFX5120 is a pale platinum grey, several shades
up from the graphite an EX4300 or an SRX1500 wears, and painting all the
Juniper hardware the same grey loses that. Nothing in this file is shared
with another product: the cages, rims, lamps and honeycomb are drawn here,
because a Juniper cage in its cast bezel does not look like a MikroTik
cage in its milled pocket.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class QFX5120_48Y(Device):
    slug = "QFX5120_48Y"
    name = "Juniper QFX5120-48Y"
    u = 1
    #: Juniper publish 1.72 x 17.36 x 20.4 in for this chassis.
    width = 0.441
    depth = 0.518
    source = "https://www.juniper.net/us/en/products/switches/qfx-series/qfx5120-ethernet-switch.html"
    references = [
        Reference("https://www.juniper.net/content/dam/www/assets/images/us/en/image-library"
                  "/qfx-series/qfx5120-48y/qfx5120-48y-front-high.jpg",
                  "studio front on, 2100x541, the whole panel"),
        Reference("https://www.juniper.net/content/dam/www/assets/images/us/en/image-library"
                  "/qfx-series/qfx5120-48y/qfx5120-48y-front-low.png",
                  "same shot with an alpha channel, 1050x270, gives the exact panel rectangle"),
        Reference("https://www.juniper.net/content/dam/www/assets/images/us/en/image-library"
                  "/qfx-series/qfx5120-48y/qfx5120-48y-frontwtop-high.jpg",
                  "front on but slightly elevated, for the lid and chassis depth"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, which is not `front_y`.

        The panel is a 10.5mm slab centred on the rack's front, so its
        visible face is 5.3mm proud of that. Everything measured below is
        hung off this plane, not off `front_y`, or it ends up buried.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Sampled off the photograph: the lit middle of the panel reads
            # 178,180,188 and the shaded bottom 128,127,133, so the paint
            # itself sits between them. Cool, faintly blue, and clearly
            # lighter than the EX4300 graphite modelled next door.
            "qfx48y_panel": pbr("QFX5120 Panel", [148, 150, 158, 255], 0.18, 0.60),
            # The end bezels read a shade darker than the middle even after
            # the lighting gradient is taken out, because they are a folded
            # return rather than the flat face.
            "qfx48y_bezel": pbr("QFX5120 Bezel", [140, 142, 150, 255], 0.20, 0.56),
            "qfx48y_edge": pbr("QFX5120 Edge", [176, 178, 186, 255], 0.22, 0.50),
            # The web left between two punched hexagons catches light along
            # its cut edge, which is what stops a vent band reading as one
            # grey smear.
            "qfx48y_vent": pbr("QFX5120 Vent Hole", [26, 27, 29, 255], 0.10, 0.86),
            # A cage rim is bare stamped steel, not paint, and it is the
            # brightest thing on the panel after the silkscreen.
            "qfx48y_rim": pbr("QFX5120 Cage Rim", [186, 188, 190, 255], 0.72, 0.30),
            "qfx48y_rim_dark": pbr("QFX5120 Cage Rim Shadow", [118, 120, 122, 255], 0.62, 0.38),
            # Sampled at 30,28,27 inside an empty SFP28. Warm, not neutral,
            # because what you are looking at is unpainted zinc in shadow.
            "qfx48y_bore": pbr("QFX5120 Cage Bore", [28, 27, 26, 255], 0.14, 0.90),
            "qfx48y_bore_deep": pbr("QFX5120 Cage Throat", [13, 13, 13, 255], 0.06, 0.94),
            # The pale plastic of the connector inside an empty cage. It is
            # a third of the way across the mouth against the inner edge,
            # and it is the single detail that stops forty eight empty
            # cages reading as forty eight black rectangles.
            "qfx48y_card": pbr("QFX5120 Card Edge", [178, 176, 168, 255], 0.0, 0.62),
            "qfx48y_spring": pbr("QFX5120 EMI Spring", [150, 152, 154, 255], 0.66, 0.34),
            # Lenses, not lamps. Every lamp on the source photograph is
            # dark, because a switch in a studio is a switch with no link,
            # and the first pass painted them a saturated green that turned
            # ninety six ports into a row of fairy lights. What is left is
            # the colour of unlit green plastic with barely any glow.
            "qfx48y_lamp": pbr("QFX5120 Port Lamp", [46, 58, 48, 255], 0.0, 0.42,
                               emissive=[0.012, 0.030, 0.014]),
            # The one colour on the product. Measured 145,208,233.
            "qfx48y_cyan": pbr("QFX5120 Accent", [145, 208, 233, 255], 0.0, 0.40,
                               emissive=[0.05, 0.10, 0.12]),
        })

    # ------------------------------------------------------------- measured
    #
    # The alpha channel of the front-low PNG gives the panel as a clean
    # rectangle, and doubling it onto the 2100 pixel JPEG puts the panel at
    # x 120..2008, y 151..337, so 1889 x 187 pixels for a 441mm face. That
    # is 0.2335mm per pixel, and the calibration checks out twice over: an
    # SFP28 opening measures 60 x 41 px = 14.0 x 9.6mm against a real cage
    # at 13.9 x 9.4, and a QSFP28 measures 80.5 x 38 px = 18.8 x 8.9mm
    # against a real one at 18.4 x 8.5. Two independent MSA outlines
    # agreeing is worth more than any single dimension off a datasheet.
    #
    # Horizontal figures are metres from the left edge of the 441mm panel.
    # Vertical figures are fractions of panel height with zero at the
    # middle, so the four percent vertical stretch in the source image
    # cannot leak into the model.

    #: Twenty four SFP28 columns: first centre, pitch, and the extra metal
    #: a block boundary adds at every eighth column.
    SFP_X0, SFP_PITCH, SFP_BANK_GAP = 0.01448, 0.014287, 0.002451
    #: Openings measured at 60 x 41 px.
    SFP_W, SFP_H = 0.01401, 0.2193
    #: Row centres. The whole field sits a hair low on the panel, which is
    #: why these are not symmetric about zero.
    SFP_Z = (0.1364, -0.1554)

    #: Four QSFP28 columns, 80.5 px wide at an 81.8 px pitch.
    QSFP_X0, QSFP_PITCH = 0.36745, 0.019105
    QSFP_W, QSFP_H = 0.018795, 0.2039
    QSFP_Z = (0.1364, -0.1625)

    #: The strip the port numbers and lamps print on, above and below the
    #: cages. Both were read off the white silkscreen, not guessed midway.
    LAMP_Z = (0.310, -0.340)
    #: Two lamps to an SFP28, at plus and minus 14 px from its centre.
    LAMP_DX = 0.003268
    LAMP_R = 0.00080
    #: Four lamps to a QSFP28, one per lane, at a 17.7 px pitch.
    QSFP_LAMP_PITCH = 0.004126

    #: Punched honeycomb: 14 px pitch, 9.5 x 10 px holes, rows 12.1 px
    #: apart, which is what a hexagonal grid at that pitch has to be.
    HEX_PITCH = 0.003269
    HEX_W, HEX_H = 0.00222, 0.00233
    #: Row centres as fractions of panel height. The outer row of each band
    #: runs off the edge of the panel in the photograph, so it is drawn
    #: pulled in and cut down rather than whole: a full hexagon there sits
    #: a millimetre proud of the top of the unit.
    HEX_Z = (0.4144, -0.4144)
    HEX_EDGE_Z = (0.4720, -0.4720)

    #: The cyan strip at the right hand end: 9 px wide, 87 px tall.
    CYAN_X, CYAN_W, CYAN_H = 0.43822, 0.0021, 0.465

    def column_x(self, i: int) -> float:
        """Centre of SFP28 column `i`, metres from the panel's left edge."""
        return self.SFP_X0 + i * self.SFP_PITCH + (i // 8) * self.SFP_BANK_GAP

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Geometry cannot spell, and on this switch the lettering is white on
        a mid grey, so leaving it out does not read as a missing detail, it
        reads as an unlabelled switch. Positions come from the same
        constants the cages use, so the ink and the metal cannot drift.

        The sheet keeps the panel's own proportion. A square-pixel sheet
        stretched to fit would make every digit a tenth wider than tall,
        which on two and three digit port numbers is instantly visible.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width                        # pixels per metre, both axes
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (238, 239, 240, 255)                  # Juniper print white here

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            """A font whose capitals stand `mm_cap` millimetres tall."""
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # Measured 7 px cap height on the source, so 1.6mm.
        f_num = sized(1.6, True)
        top, bot = py(self.LAMP_Z[0]), py(self.LAMP_Z[1])

        # SFP28 numbers run 0 to 47 down the columns, even above and odd
        # below, so column i carries 2i and 2i+1.
        for i in range(24):
            cx = px(self.column_x(i))
            centred(str(i * 2), cx, top, f_num)
            centred(str(i * 2 + 1), cx, bot, f_num)

        # QSFP28 numbers carry on at 48 and are set hard against the left
        # edge of their cage rather than centred on it, with the four lane
        # lamps filling the rest of the strip. Centring them, as the first
        # pass did, puts the number where the second lamp belongs.
        for i in range(4):
            cx = px(self.QSFP_X0 + i * self.QSFP_PITCH - self.QSFP_W / 2)
            b = d.textbbox((0, 0), "48", font=f_num)
            w = (b[2] - b[0]) / 2
            centred(str(48 + i * 2), cx + w, top, f_num)
            centred(str(49 + i * 2), cx + w, bot, f_num)

        tex = save_texture("qfx5120_48y_silkscreen.png", img)
        rack.materials["qfx48y_silktex"] = PBRMaterial(
            name="QFX5120 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "qfx48y_silktex",
                            (0, self.face(rack) - 0.0009, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def sfp_cage(self, rack, g: str, x: float, z: float, h: float, top_row: bool) -> None:
        """One SFP28 opening as this panel presents it.

        A Juniper cage is a bright stamped rim standing proud of the paint
        with darkness behind it, not a dark tile laid on top. The first
        pass drew the rim as a filled plate and forty eight ports came out
        as forty eight grey stamps, so the rim is four thin bars and what
        fills the middle is the bore.

        The two rows are inverted castings. Everything inside mirrors: the
        EMI spring runs along the outer edge and the pale card edge sits
        against the inner one. Draw them the same way up and the bank reads
        as a printed pattern rather than as fitted hardware.
        """
        y = self.face(rack)
        w = self.SFP_W
        # 0.6mm, so that two cages sharing a wall read as the 1.2mm the
        # photograph shows. At 0.85 the shared wall came out at 1.7mm and
        # the bank looked like separate ports rather than one ganged block.
        rim = 0.00060
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            mat = "qfx48y_rim" if dz >= 0 else "qfx48y_rim_dark"
            rack.box(g, mat, (x + dx, y - 0.0016, z + dz), (bw, 0.0013, bh))
        # The bore has to be drawn in front of the panel and then stepped
        # back behind the rim: level with the paint, the paint wins the
        # depth test and the cage comes out as an empty outline.
        rack.box(g, "qfx48y_bore", (x, y - 0.0007, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "qfx48y_bore_deep", (x, y + 0.0060, z), (w * 0.86, 0.0110, h * 0.84))
        outer = h * (0.5 if top_row else -0.5)
        # The EMI spring fingers along the outer lip, drawn as one bar
        # because at 1.9mm nothing finer survives.
        rack.box(g, "qfx48y_spring", (x, y - 0.0019, z + outer * 0.74),
                 (w * 0.80, 0.0008, h * 0.10))
        # The card edge connector, against the inner lip.
        rack.box(g, "qfx48y_card", (x, y - 0.0018, z - outer * 0.58),
                 (w * 0.32, 0.0008, h * 0.09))
        # The latch slot cut into the inner lip, which is what tells you
        # which way up the cage is from three metres away.
        rack.box(g, "qfx48y_rim_dark", (x, y - 0.0019, z - outer * 0.86),
                 (w * 0.26, 0.0009, h * 0.14))

    def qsfp_cage(self, rack, g: str, x: float, z: float, h: float, top_row: bool) -> None:
        """One QSFP28 opening, which is not just a wide SFP28.

        The rim is visibly heavier, the bore is shallower relative to its
        width, and instead of one card edge there are four lane contacts
        strung across the inner lip. Reusing the SFP28 routine with a
        bigger width argument was the first attempt and it made the right
        hand end of the panel look like the rest of it stretched, which is
        exactly what a QSFP does not look like.
        """
        y = self.face(rack)
        w = self.QSFP_W
        rim = 0.00115
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            mat = "qfx48y_rim" if dz >= 0 else "qfx48y_rim_dark"
            rack.box(g, mat, (x + dx, y - 0.0018, z + dz), (bw, 0.0015, bh))
        rack.box(g, "qfx48y_bore", (x, y - 0.0007, z), (w - rim * 2, 0.0024, h - rim * 2))
        rack.box(g, "qfx48y_bore_deep", (x, y + 0.0060, z), (w * 0.90, 0.0110, h * 0.82))
        outer = h * (0.5 if top_row else -0.5)
        rack.box(g, "qfx48y_spring", (x, y - 0.0021, z + outer * 0.72),
                 (w * 0.86, 0.0008, h * 0.09))
        for i in range(4):
            lx = x + (i - 1.5) * (w * 0.21)
            rack.box(g, "qfx48y_card", (lx, y - 0.0020, z - outer * 0.62),
                     (w * 0.15, 0.0008, h * 0.10))

    def lamp(self, rack, g: str, x: float, z: float) -> None:
        """One round port lamp. Eight sided, because at 1.9mm it reads."""
        rack.front_cylinder(g, "qfx48y_lamp", (x, self.face(rack) - 0.0010, z),
                            self.LAMP_R, 0.0009, 8)

    def vent_band(self, rack, g: str, z: float, frac: float, part: float = 1.0,
                  stagger: bool = False) -> None:
        """One row of the punched honeycomb.

        Real hexagons at 2.2mm across cost eight times what a box costs and
        read identically at any distance a rack is ever seen from, so these
        are boxes. What matters is the pitch and the row offset: rows in
        line instead of staggered stop being a honeycomb and become a
        grille.

        Depth is the part that had to be got right twice. A hole cannot be
        drawn as a hole, because the panel behind it is solid, so it has to
        be a dark tile drawn in front. The first pass gave it the 5mm depth
        a real perforation has and every hexagon came out as a raised stud
        catching a highlight on its own front face. Three tenths of a
        millimetre proud is enough to win the depth test and little enough
        to read as an opening.
        """
        y = self.face(rack)
        n = int(self.width / self.HEX_PITCH) + 1
        offset = self.HEX_PITCH / 2 if stagger else 0.0
        for i in range(n):
            x = -self.width / 2 + 0.0022 + offset + i * self.HEX_PITCH
            if x > self.width / 2 - 0.0022:
                break
            rack.box(g, "qfx48y_vent", (x, y - 0.00010, z + frac * self.height),
                     (self.HEX_W, 0.0006, self.HEX_H * part))

    # --------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h = self.height
        w = self.width

        def X(from_left: float) -> float:
            """Panel coordinate from a measurement off the photograph."""
            return -w / 2 + from_left

        def Z(frac: float) -> float:
            """Rack coordinate from a fraction of the panel's height."""
            return z + frac * h

        # Chassis body behind the panel, then the panel itself. A QFX5120
        # is half a metre deep, which is most of what makes it read as a
        # data centre switch rather than a wiring closet one.
        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.012, self.depth, h * 0.92))
        rack.rounded_prism(g, "qfx48y_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0010, bevel=0.0005, steps=6)

        # The folded returns at each end, and the shallow inset pocket the
        # photograph shows punched into the left one.
        for sx in (-1, 1):
            rack.box(g, "qfx48y_bezel", (sx * (w / 2 - 0.0035), y - 0.0003, z),
                     (0.0070, 0.0006, h * 0.94))
        rack.box(g, "qfx48y_bezel", (X(0.0068), y - 0.0006, Z(0.24)), (0.0092, 0.0007, 0.0125))

        # A hairline highlight along the top edge and a shadow along the
        # bottom, which is how a 1U face reads in any real light.
        rack.box(g, "qfx48y_edge", (0, y - 0.0004, z + h * 0.485), (w - 0.004, 0.0006, 0.0009))
        rack.box(g, "qfx48y_bezel", (0, y - 0.0004, z - h * 0.485), (w - 0.004, 0.0006, 0.0009))

        # ---- punched honeycomb, two rows at each end -------------------
        for frac in self.HEX_Z:
            self.vent_band(rack, g, z, frac)
        for frac in self.HEX_EDGE_Z:
            self.vent_band(rack, g, z, frac, part=0.55, stagger=True)

        # ---- forty eight SFP28 -----------------------------------------
        sfp_h = self.SFP_H * h
        for i in range(24):
            cx = X(self.column_x(i))
            self.sfp_cage(rack, g, cx, Z(self.SFP_Z[0]), sfp_h, True)
            self.sfp_cage(rack, g, cx, Z(self.SFP_Z[1]), sfp_h, False)
            for lz in self.LAMP_Z:
                for dx in (-self.LAMP_DX, self.LAMP_DX):
                    self.lamp(rack, g, cx + dx, Z(lz))

        # ---- eight QSFP28, four lanes and so four lamps apiece ---------
        qsfp_h = self.QSFP_H * h
        for i in range(4):
            cx = X(self.QSFP_X0 + i * self.QSFP_PITCH)
            self.qsfp_cage(rack, g, cx, Z(self.QSFP_Z[0]), qsfp_h, True)
            self.qsfp_cage(rack, g, cx, Z(self.QSFP_Z[1]), qsfp_h, False)
            for lz in self.LAMP_Z:
                for k in range(4):
                    self.lamp(rack, g, cx + (k - 1.5) * self.QSFP_LAMP_PITCH, Z(lz))

        # ---- the cyan strip --------------------------------------------
        rack.rounded_prism(g, "qfx48y_cyan", (X(self.CYAN_X), y - 0.0008, z),
                           (self.CYAN_W, 0.0010, self.CYAN_H * h),
                           radius=0.0010, bevel=0.0003, steps=6)

        self.silkscreen(rack, z)
