"""MikroTik CRS326-24G-2S+RM, drawn from MikroTik's own product photography.

The copper CRS326, and it shares nothing with the optical CRS326-24S+2Q+
but a model number. Twenty four gigabit jacks in three ganged blocks of
eight, two SFP+ cages at the right, a console jack and three lamps at the
left, and no port lamps anywhere on the copper at all.

What the photographs show, working left to right:

  A grey panel, and this is the surprise of the whole product: the jack
  blocks are near white plastic and the panel around them is a definite
  mid grey. Every other MikroTik in this library sinks its ports into a
  recess darker than the panel. This one stands them proud in a moulding
  lighter than it. Get that the usual way round and the switch reads as
  the wrong product.

  A paler band runs along the bottom of the panel under the ports and
  carries all the port numbering. Each number sits in a thin outlined box,
  and the box for a top row port is closed with a heavy bar along its top
  edge while the box for a bottom row port is closed along its bottom, which
  is how MikroTik say which row a number belongs to without printing twice.
  The numbers go in pairs under each column, odd then even.

  Far left: the MikroTik wordmark set light then heavy, CONSOLE over an
  unshielded white RJ45, POE IN set vertically in teal with an elbow rule
  pointing at port 1, and PWR, RES and USR along the bottom, two pale
  lamp windows either side of a small black button.

  Twenty four jacks, twelve columns two high in three blocks. The openings
  are the full 8P8C keyhole silhouette with the latch notch pointing away
  from the middle of the panel, up on the top row and down on the bottom.

  Two SFP+ cages at the right in bright pressed metal with EMI fingers
  along the top edge and a white card edge low in the mouth, SFP+ 1 and
  SFP+ 2 above them, and beneath each a pair of pale lamp windows, ACT/LINK
  under the cage and 10G off to the right on a hairline elbow leader.

  Then Cloud Router Switch in heavy italic with CRS326-24G-2S+RM under it.

Nothing here is shared with another product. The jacks, the cages, the
lamps and every material are drawn in this file.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class CRS326_24G_2S(Device):
    slug = "CRS326_24G_2S"
    name = "MikroTik CRS326-24G-2S+RM"
    u = 1
    #: MikroTik publish 443 x 144 x 44 mm for this chassis, which makes it
    #: the shallowest box in the MikroTik rack by a wide margin.
    width = 0.443
    depth = 0.144
    source = "https://mikrotik.com/product/CRS326-24G-2SplusRM"
    references = [
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1301_hi_res.png",
                  "front, 2560x1695, mild top down, the only front view MikroTik publish"),
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1339_hi_res.png",
                  "lid off, 4137x1674, confirms three eight port magnetics and two cages"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, which is not `front_y`.

        A 9mm slab centred on the rack front, so the working surface is
        4.5mm proud of it. Every measurement below is from this plane, and
        taking them from `front_y` buries the lot inside the slab.
        """
        return rack.front_y - 0.0045

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes, sampled off photograph 1301.

        This is the darkest lit shot in the MikroTik set: the panel runs
        148 at its top edge to 167 beside the ports because the key light
        is high, so the linear correction that puts the lower figure on 222
        is 1.894, the largest applied to any of these six. The lower figure
        is the one used because it is the value the ports sit against.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Panel and jack block measure 167 and 189 raw, a ratio of 0.76
            # in linear light, which the correction preserves as 216 against
            # 247. At the top of the range that ratio almost disappears, and
            # the first render came out as one flat white slab. What sells
            # it in the photograph is not only tone: the block is glossy ABS
            # and the panel is matte paint, so the roughness figures below
            # carry as much of the difference as the colours do.
            "mt24g_panel": pbr("CRS326-24G Panel", [216, 216, 216, 255], 0.10, 0.72),
            "mt24g_lid": pbr("CRS326-24G Lid", [229, 229, 229, 255], 0.16, 0.50),
            "mt24g_ear": pbr("CRS326-24G Ear", [210, 210, 210, 255], 0.20, 0.48),
            # The pale band along the bottom that carries the numbering. It
            # measures 239 against the panel's 222, so it is genuinely a
            # lighter surface and not a highlight.
            "mt24g_numband": pbr("CRS326-24G Number Band", [238, 240, 243, 255], 0.10, 0.52),
            # The jack moulding, 251. Lighter than the panel, which is the
            # opposite of every other switch here and the single value that
            # decides whether this reads as a CRS326-24G at all.
            "mt24g_block": pbr("CRS326-24G Jack Block", [247, 245, 243, 255], 0.06, 0.34),
            "mt24g_gap": pbr("CRS326-24G Block Gap", [148, 147, 146, 255], 0.18, 0.62),
            # 17 in the mouth against 42 on the cavity floor: the floor is
            # what stops a keyhole opening reading as a flat black sticker.
            "mt24g_mouth": pbr("CRS326-24G Jack Mouth", [17, 17, 17, 255], 0.08, 0.90),
            "mt24g_floor": pbr("CRS326-24G Jack Floor", [44, 44, 44, 255], 0.10, 0.76),
            "mt24g_gold": pbr("CRS326-24G Jack Contacts", [176, 146, 84, 255], 0.80, 0.30),
            # The console jack is the odd one: an unshielded white housing
            # in a black frame, and the only pale connector on the panel.
            "mt24g_console_frame": pbr("CRS326-24G Console Frame", [34, 34, 34, 255], 0.16, 0.64),
            "mt24g_console_body": pbr("CRS326-24G Console Body", [226, 226, 224, 255], 0.06, 0.48),
            # Pressed metal cages, bright, with a green board visible behind
            # the first one because that render has a module seated in it.
            "mt24g_cage": pbr("CRS326-24G Cage", [178, 178, 180, 255], 0.62, 0.36),
            "mt24g_cage_bore": pbr("CRS326-24G Cage Bore", [25, 24, 23, 255], 0.14, 0.88),
            "mt24g_cage_edge": pbr("CRS326-24G Card Edge", [234, 234, 231, 255], 0.0, 0.50),
            # Unlit lamp windows: pale, flat, and slightly warm.
            "mt24g_lamp": pbr("CRS326-24G Lamp Window", [216, 214, 212, 255], 0.06, 0.54),
            "mt24g_lamp_rim": pbr("CRS326-24G Lamp Rim", [162, 161, 160, 255], 0.14, 0.58),
            "mt24g_silk": pbr("CRS326-24G Silkscreen", [76, 76, 76, 255], 0.05, 0.70),
            "mt24g_button": pbr("CRS326-24G Reset", [66, 66, 68, 255], 0.26, 0.48),
            # The POE IN rule and its label are printed in teal, not grey,
            # and it is the only colour on the whole faceplate.
            "mt24g_teal": pbr("CRS326-24G PoE Rule", [86, 196, 190, 255], 0.06, 0.52),
        })

    # ------------------------------------------------------------- measured
    #
    # Photograph 1301 has no rack ears in shot, so the calibration is the
    # body itself: 2068 pixels across the 443mm MikroTik publish at the
    # panel's mid line, which puts a pixel at 0.21422mm. Twelve jack columns
    # were then measured centre to centre across the whole panel and came
    # out at a uniform 65.5 pixel pitch, which is the check that the mild
    # top down angle in this render is not distorting the horizontal.
    #
    # It is distorting the vertical: 176 pixels of panel for 44mm makes the
    # vertical scale 9.4 percent short. Vertical figures below are therefore
    # fractions of the measured panel height, which cancels that out.

    #: Twelve jack columns: first centre, pitch, and the extra a block
    #: boundary adds at every fourth column. The gap here is over half a
    #: port wide, far wider than the hairline gaps on the optical CRS326.
    COL0, PITCH, GAP = 0.04563, 0.014030, 0.007720
    #: Left and right edge of each eight port block.
    BLOCK_X = ((0.03535, 0.09747), (0.09940, 0.16045), (0.16345, 0.22343))
    BLOCK_Z = (0.278, -0.347)
    #: An 8P8C opening is a body with a keyway standing off one edge, and
    #: the two parts have to be measured separately. Read off a four times
    #: enlargement: the body is 60 pixels wide and 33 tall, the keyway 35
    #: wide and 12 tall, which in real units is a 12.85 by 8.25mm mouth with
    #: a 7.5 by 3.0mm notch. Treating the whole thing as one 13.7 by 11.1mm
    #: rectangle, which a bounding box scan hands you, welds every jack to
    #: its neighbour and loses the millimetre of white moulding between.
    TOP_BODY_Z = (0.1932, 0.0057)
    TOP_NOTCH_Z = (0.2614, 0.1932)
    BOT_BODY_Z = (-0.0682, -0.2557)
    BOT_NOTCH_Z = (-0.2557, -0.3239)
    JAW, NOTCH_W = 0.01285, 0.0075
    #: The pale band along the bottom and the numbering printed on it.
    BAND_Z = (-0.352, -0.500)
    NUM_Z = -0.418
    #: A number pair sits this far right of its column centre, and the two
    #: numbers this far apart. Both measured, and neither is symmetric.
    NUM_OFFSET, NUM_SPLIT = 0.0015, 0.00568
    #: The console cluster at the far left.
    WORDMARK_X, WORDMARK_Z = (0.00343, 0.03406), 0.250
    CONSOLE_X, CONSOLE_Z = (0.01842, 0.03513), (-0.0625, -0.3466)
    POE_X, POE_Z = 0.0358, (-0.097, -0.313)
    PWR_X, USR_X = (0.01821, 0.02185), (0.03299, 0.03663)
    LAMP_Z = (-0.386, -0.449)
    RES_X, RES_Z, RES_R = 0.02752, -0.398, 0.0014
    #: The two optics cages and their lamp windows.
    SFP_X = ((0.23157, 0.24549), (0.25320, 0.26713))
    SFP_Z = (-0.142, -0.364)
    ACT_DX, TENG_DX = -0.0003, 0.0107
    SFP_LAMP_Z = (-0.369, -0.415)

    def column_x(self, i: int) -> float:
        """Centre of jack column `i`, metres from the panel's left edge."""
        return self.COL0 + i * self.PITCH + (i // 4) * self.GAP

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        The numbering is the work here. Forty eight digits in forty eight
        outlined boxes, each box closed with a heavy bar on the edge that
        faces its own row, drawn from the same column constants the jacks
        use so the ink cannot drift off the metal.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (76, 76, 76, 255)
        dark = (26, 26, 26, 255)
        teal = (46, 168, 162, 255)

        def px(x_m):
            return x_m * ppm

        def py(frac):
            return (0.5 - frac) * H

        def fitted(text, mm_wide, bold=False):
            want = mm_wide / 1000 * ppm
            f = font(40, bold)
            got = d.textbbox((0, 0), text, font=f)[2]
            return font(max(8, round(40 * want / max(got, 1))), bold)

        def sized(mm_cap, bold=False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- forty eight numbers in forty eight boxes. Box 3.86 by 4.26mm
        #      measured, the outline a hairline and the row bar three times
        #      that: the bar is the whole point of the box and a uniform
        #      outline says nothing about which row the port is in.
        f_num = sized(1.66)
        bw = 3.86 / 1000 * ppm
        bh = 4.26 / 1000 * ppm
        for i in range(12):
            pair = px(self.column_x(i) + self.NUM_OFFSET)
            for k, n in enumerate((i * 2 + 1, i * 2 + 2)):
                cx = pair + (k - 0.5) * px(self.NUM_SPLIT)
                cy = py(self.NUM_Z)
                d.rectangle([cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2],
                            outline=(150, 152, 154, 255), width=2)
                bar = cy - bh / 2 if n % 2 == 0 else cy + bh / 2
                d.line([(cx - bw / 2, bar), (cx + bw / 2, bar)], fill=dark, width=9)
                centred(str(n), cx, cy, f_num)

        # ---- the far left cluster.
        f_lab = sized(1.9)
        centred("CONSOLE", px(sum(self.CONSOLE_X) / 2), py(-0.028), f_lab)
        for label, xr in (("PWR", self.PWR_X), ("USR", self.USR_X)):
            centred(label, px(sum(xr) / 2), py(-0.4745), sized(1.2))
        centred("RES", px(self.RES_X), py(-0.4745), sized(1.2))

        # ---- POE IN, the only colour on the panel, set vertically beside
        #      the console with an elbow rule that runs down and right into
        #      the first port block.
        f_poe = sized(1.5)
        b = d.textbbox((0, 0), "POE IN", font=f_poe)
        tile = Image.new("RGBA", (b[2] - b[0] + 8, b[3] - b[1] + 8), (0, 0, 0, 0))
        ImageDraw.Draw(tile).text((4 - b[0], 4 - b[1]), "POE IN", font=f_poe, fill=teal)
        tile = tile.rotate(90, expand=True)
        img.alpha_composite(tile, (round(px(self.POE_X) - tile.width / 2),
                                   round(py(sum(self.POE_Z) / 2) - tile.height / 2)))
        ex, ey = px(self.POE_X + 0.0022), py(self.POE_Z[1] - 0.030)
        d.line([(ex, py(self.POE_Z[0])), (ex, ey)], fill=teal, width=4)
        d.line([(ex, ey), (px(self.column_x(0) - 0.006), ey)], fill=teal, width=4)

        # ---- the optics labels and their lamp names.
        for i, (sx0, sx1) in enumerate(self.SFP_X):
            cx = px((sx0 + sx1) / 2)
            centred(f"SFP+ {i + 1}", cx, py(-0.068), sized(1.4))
            centred("ACT/LINK", cx + px(self.ACT_DX), py(-0.4630), sized(1.2))
            centred("10G", cx + px(self.TENG_DX), py(-0.4630), sized(1.2))

        # ---- the right hand type. Measured boxes: the product line runs
        #      354.1 to 431.9mm and the model number 399.7 to 436.2, both
        #      fitted to those widths rather than set by cap height.
        centred("Cloud Router Switch", px(0.39298), py(0.242),
                fitted("Cloud Router Switch", 77.8, True))
        centred("CRS326-24G-2S+RM", px(0.41794), py(0.057),
                fitted("CRS326-24G-2S+RM", 36.4))

        # ---- the wordmark, light then heavy, measured 3.4 to 34.1mm.
        f_mark = fitted("MikroTik", 30.6)
        f_bold = font(f_mark.size, True)
        wx = px(self.WORDMARK_X[0])
        wtop = py(self.WORDMARK_Z) - d.textbbox((0, 0), "M", font=f_bold)[3] / 2
        d.text((wx, wtop), "Mikro", font=f_mark, fill=dark)
        wx += d.textbbox((0, 0), "Mikro", font=f_mark)[2]
        d.text((wx, wtop), "Tik", font=f_bold, fill=dark)

        tex = save_texture("crs326_24g_silkscreen.png", img)
        rack.materials["mt24g_silktex"] = PBRMaterial(
            name="CRS326-24G Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "mt24g_silktex",
                            (0, self.face(rack) - 0.0010, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def jack(self, rack, g, x, body_z, notch_z, top_row):
        """One gigabit jack as this switch wears it.

        The full 8P8C keyhole, not a rectangle: a wide body with a narrow
        latch notch standing off one edge. The notch faces away from the
        middle of the panel, up on the top row and down on the bottom, and
        drawing it the other way makes every jack look fitted upside down.

        There are no lamps in these jacks. Every other MikroTik in this
        library lights its copper ports and this one does not, so adding a
        pair of green corner lamps out of habit would be inventing a
        feature the product does not have.
        """
        # `body_z` and `notch_z` arrive as rack coordinates, already scaled
        # out of panel fractions by the caller, so the spans here are metres
        # and must not be scaled again. Multiplying by the panel height a
        # second time, which the first pass did, shrank every mouth by a
        # factor of twenty three and printed twenty four hairlines.
        y = self.face(rack)
        bz = (body_z[0] + body_z[1]) / 2
        bh = abs(body_z[0] - body_z[1])
        nz = (notch_z[0] + notch_z[1]) / 2
        nh = abs(notch_z[0] - notch_z[1])
        # Body and notch, both pushed forward of the panel and then stepped
        # back, because a mouth left level with the panel loses the depth
        # test and prints as an outline with nothing in it.
        rack.box(g, "mt24g_mouth", (x, y - 0.0008, bz), (self.JAW, 0.0020, bh))
        rack.box(g, "mt24g_mouth", (x, y - 0.0008, nz), (self.NOTCH_W, 0.0020, nh))
        rack.box(g, "mt24g_mouth", (x, y + 0.0040, bz), (self.JAW * 0.84, 0.0090, bh * 0.80))
        # The cavity floor and the contact tips on it, a shade off black,
        # set well back from the mouth and only just catching the light.
        out = 1.0 if top_row else -1.0
        rack.box(g, "mt24g_floor", (x, y - 0.0012, bz - out * bh * 0.36),
                 (self.JAW * 0.90, 0.0006, bh * 0.18))
        rack.box(g, "mt24g_gold", (x, y - 0.0013, bz - out * bh * 0.06),
                 (self.JAW * 0.64, 0.0005, bh * 0.08))

    def cage(self, rack, g, x, z, w, h):
        """One SFP+ cage, pressed bright metal rather than a black casting.

        The fingers along the top edge are what identify it: this cage is
        stamped sheet with three EMI tabs standing up out of the panel, not
        the milled block the optical switches use. Behind them the mouth is
        black and a white card edge sits low inside it.
        """
        y = self.face(rack)
        rim = 0.0011
        for dx, dz, bw, bh in ((0, h / 2 - rim / 2, w, rim), (0, -h / 2 + rim / 2, w, rim),
                               (-w / 2 + rim / 2, 0, rim, h), (w / 2 - rim / 2, 0, rim, h)):
            rack.box(g, "mt24g_cage", (x + dx, y - 0.0016, z + dz), (bw, 0.0014, bh))
        rack.box(g, "mt24g_cage_bore", (x, y - 0.0006, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "mt24g_cage_bore", (x, y + 0.0044, z), (w * 0.88, 0.0110, h * 0.84))
        for i in (-1, 0, 1):
            rack.box(g, "mt24g_cage", (x + i * w * 0.28, y - 0.0018, z + h * 0.56),
                     (w * 0.17, 0.0010, h * 0.14))
        rack.box(g, "mt24g_cage_edge", (x, y - 0.0019, z - h * 0.34), (w * 0.44, 0.0008, h * 0.10))

    def lamp(self, rack, g, x, z, w, h):
        """A pale rectangular lamp window in a slightly darker surround."""
        y = self.face(rack)
        rack.box(g, "mt24g_lamp_rim", (x, y - 0.0008, z), (w, 0.0008, h))
        rack.box(g, "mt24g_lamp", (x, y - 0.0011, z), (w * 0.76, 0.0007, h * 0.70))

    # --------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h, w = self.height, self.width

        def X(from_left):
            return -w / 2 + from_left

        def Z(frac):
            return z + frac * h

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "mt24g_panel", (0, rack.front_y, z), (w, 0.0090, h),
                           radius=0.0011, bevel=0.0005, steps=6)
        rack.box(g, "mt24g_lid", (0, y + 0.011 + self.depth * 0.34, z + h * 0.47),
                 (w - 0.012, self.depth * 0.66, 0.0018))

        # The pale band along the bottom that the numbering prints on.
        band_h = (self.BAND_Z[0] - self.BAND_Z[1]) * h
        rack.box(g, "mt24g_numband", (0, y - 0.0004, Z((sum(self.BAND_Z)) / 2)),
                 (w - 0.0020, 0.0008, band_h))

        # Rack ears. MikroTik photograph this SKU without its ears fitted,
        # in every shot they publish, so this is the one part of the model
        # not measured off a picture of the product: the overhang is fixed
        # by arithmetic instead, 19.8mm each side to take a 443mm body out
        # to the 482.6mm a 19 inch rack needs. The slot sizes come from the
        # same arithmetic, a 12 by 6mm capsule on the rack's 1U hole pitch.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0099)
            rack.rounded_prism(g, "mt24g_ear", (ex, y + 0.0013, z), (0.0198, 0.0075, h * 0.99),
                               radius=0.0013, bevel=0.0005, steps=6)
            for dz in (0.355, -0.340):
                rack.rounded_prism(g, "mt24g_gap", (ex, y - 0.0024, Z(dz)),
                                   (0.0120, 0.0026, 0.0060),
                                   radius=0.0028, bevel=0.0006, steps=8)

        # ---- three blocks of eight jacks --------------------------------
        for grp, (bx0, bx1) in enumerate(self.BLOCK_X):
            cx = X((bx0 + bx1) / 2)
            bw = bx1 - bx0
            bz = Z((self.BLOCK_Z[0] + self.BLOCK_Z[1]) / 2)
            bh = (self.BLOCK_Z[0] - self.BLOCK_Z[1]) * h
            # A shadow line around the moulding, then the moulding itself.
            # Without the shadow a near white block on a grey panel has no
            # edge at all and the three blocks merge into one pale slab.
            rack.box(g, "mt24g_gap", (cx, y - 0.0004, bz), (bw + 0.0010, 0.0008, bh + 0.0010))
            rack.box(g, "mt24g_block", (cx, y - 0.0007, bz), (bw, 0.0008, bh))
            for col in range(4):
                jx = X(self.column_x(grp * 4 + col))
                self.jack(rack, g, jx, tuple(Z(v) for v in self.TOP_BODY_Z),
                          tuple(Z(v) for v in self.TOP_NOTCH_Z), True)
                self.jack(rack, g, jx, tuple(Z(v) for v in self.BOT_BODY_Z),
                          tuple(Z(v) for v in self.BOT_NOTCH_Z), False)

        # ---- console jack, lamps and the reset button -------------------
        cx0, cx1 = self.CONSOLE_X
        ccx, ccw = X((cx0 + cx1) / 2), cx1 - cx0
        cz0, cz1 = self.CONSOLE_Z
        ccz, cch = Z((cz0 + cz1) / 2), (cz0 - cz1) * h
        rack.box(g, "mt24g_console_frame", (ccx, y - 0.0007, ccz), (ccw, 0.0009, cch))
        rack.box(g, "mt24g_console_body", (ccx, y - 0.0011, ccz),
                 (ccw - 0.0020, 0.0008, cch - 0.0018))
        # The console is unshielded and the render shows its dark moulded
        # tongue sitting inside a white housing, which is the only place on
        # the panel where a connector is lighter than what surrounds it.
        rack.box(g, "mt24g_mouth", (ccx, y - 0.0014, ccz - cch * 0.06),
                 (ccw * 0.50, 0.0007, cch * 0.46))
        lz = Z((self.LAMP_Z[0] + self.LAMP_Z[1]) / 2)
        lh = (self.LAMP_Z[0] - self.LAMP_Z[1]) * h
        for xr in (self.PWR_X, self.USR_X):
            self.lamp(rack, g, X(sum(xr) / 2), lz, xr[1] - xr[0], lh)
        rack.front_cylinder(g, "mt24g_button", (X(self.RES_X), y - 0.0013, Z(self.RES_Z)),
                            self.RES_R, 0.0015, 20)

        # ---- two optics cages and their four lamp windows ---------------
        sz = Z((self.SFP_Z[0] + self.SFP_Z[1]) / 2)
        sh = (self.SFP_Z[0] - self.SFP_Z[1]) * h
        slz = Z((self.SFP_LAMP_Z[0] + self.SFP_LAMP_Z[1]) / 2)
        slh = (self.SFP_LAMP_Z[0] - self.SFP_LAMP_Z[1]) * h
        for sx0, sx1 in self.SFP_X:
            scx = X((sx0 + sx1) / 2)
            self.cage(rack, g, scx, sz, sx1 - sx0, sh)
            for dx in (self.ACT_DX, self.TENG_DX):
                self.lamp(rack, g, scx + dx, slz, 0.0032, slh)
            # The hairline elbow that ties the 10G window back to its cage.
            # It is drawn because in the photograph the window sits clear of
            # the cage it belongs to and without the leader it reads as a
            # stray mark on the panel.
            rack.box(g, "mt24g_lamp_rim", (scx + self.TENG_DX, y - 0.0009, sz - sh * 0.10),
                     (0.0005, 0.0007, sh * 0.80))
            rack.box(g, "mt24g_lamp_rim", (scx + self.TENG_DX * 0.62, y - 0.0009, sz + sh * 0.28),
                     (self.TENG_DX * 0.80, 0.0007, 0.0005))

        self.silkscreen(rack, z)
