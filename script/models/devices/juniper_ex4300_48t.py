"""Juniper EX4300-48T, drawn from Juniper's own straight-on studio shot.

The photograph is of the 48P, the PoE version of the same 1U chassis, which
is the only clean unwatermarked front-on Juniper publish for this family.
Everything modelled here is shared between the two SKUs: same box, same
four banks of twelve, same LCD and buttons, same uplink bay. The reseller
photograph of a real 48T is the cross check, and it agrees on all of it.

Two deliberate departures from that photograph, both stated so nobody has
to guess later. Its uplink bay is fitted with an EX-UM-4X4SFP and four
optics are plugged into it; this model fits the same module with the cages
empty, because transceivers are consumables and a switch model should be
the switch. And the real 48T ships with a blank plate over the bay, which
would be the most literal reading of the photograph and the least useful
thing to put on a rack.

What the photograph shows, left to right:

  A punched honeycomb along the top edge and a shallower one along the
  bottom, with the juniper wordmark printed over the top left corner of
  the upper band.

  Forty eight RJ45 as four banks of twelve, six columns of two, each bank
  behind its own bright stamped shield with a dark gasket line round it.
  The two rows are inverted against each other, so the latch slot and the
  pair of lamp windows face out of the bank on both. Under each column the
  two port numbers, even set high and odd dropped below and to the right,
  which is Juniper's own way of numbering a stacked pair.

  Then the mini-USB console marked CON1, the EX4300 badge, a monochrome
  LCD with a menu button and an enter button beside it, and three status
  lamps stacked at the far right.

  Below all that, the uplink module: four SFP+ in a row with a sky blue
  pull tab at each end and a captive screw over each tab.

This is the darkest of the Juniper set. An EX4300 is a graphite several
shades below the QFX5120's platinum, and painting the whole vendor one
grey is the difference between a rack that looks photographed and a rack
that looks generated. Nothing in this file is shared with another product.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class EX4300_48T(Device):
    slug = "EX4300_48T"
    name = "Juniper EX4300-48T"
    u = 1
    #: Juniper publish 1.72 x 17.4 x 20.5 in for this chassis.
    width = 0.442
    depth = 0.521
    source = "https://www.juniper.net/documentation/us/en/hardware/ex4300/"
    references = [
        Reference("https://www.juniper.net/content/dam/www/assets/images/us/en/image-library"
                  "/ex-series/ex4300/ex4300-48p-front-high.jpg",
                  "studio front on, 1500x211, the 48P of the same chassis, unwatermarked, "
                  "the source of every measurement below"),
        Reference("https://www.networktigers.com/cdn/shop/files/juniper-EX4300-48T-2.jpg",
                  "a real 48T dead on, 1040x1040, watermarked across the lower third, "
                  "the cross check on the LCD and the blanked uplink bay"),
        Reference("https://www.networktigers.com/cdn/shop/files/juniper-EX4300-48T.jpg",
                  "the same unit three quarters from the left, for lid and bezel depth"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Sampled off the photograph at 135,139,148 under the port bank
            # and 119,123,130 beside the badge. A cool graphite, and the
            # darkest of the four Juniper products in this library.
            "ex43_panel": pbr("EX4300 Panel", [124, 128, 136, 255], 0.16, 0.62),
            "ex43_edge": pbr("EX4300 Edge", [152, 156, 163, 255], 0.20, 0.52),
            "ex43_recess": pbr("EX4300 Recess", [78, 80, 85, 255], 0.16, 0.70),
            # What is behind a punched hexagon is the inside of the box.
            "ex43_vent": pbr("EX4300 Vent Hole", [24, 25, 27, 255], 0.10, 0.88),
            # The stamped shield each bank of twelve sits behind, measured
            # at 155,156,159 on the strip between the two rows. It is bare
            # steel and it is the lightest thing on the panel.
            "ex43_shield": pbr("EX4300 Port Shield", [162, 164, 167, 255], 0.68, 0.32),
            "ex43_shield_dark": pbr("EX4300 Shield Shadow", [104, 106, 108, 255], 0.60, 0.40),
            # The gasket line round each bank, which is what separates one
            # twelve port shield from the next.
            "ex43_gasket": pbr("EX4300 Gasket", [40, 41, 43, 255], 0.10, 0.80),
            # Sampled at 16,16,21 inside an RJ45. Near black and slightly
            # blue, unlike the warm bore of an optical cage. Authored a few
            # points under the sample because the preview studio lays a lot
            # of ambient into a cavity that in life has none.
            "ex43_bore": pbr("EX4300 Jack Bore", [13, 13, 16, 255], 0.06, 0.94),
            # The little clear windows in the outer corners of every jack.
            # These are lenses over an unlit LED, and unlit they are pale,
            # not green: painting them the lamp colour put ninety six green
            # chips on a panel that has none.
            "ex43_window": pbr("EX4300 Lamp Window", [186, 188, 190, 255], 0.30, 0.34),
            "ex43_tongue": pbr("EX4300 Jack Tongue", [46, 46, 50, 255], 0.10, 0.78),
            "ex43_gold": pbr("EX4300 Jack Contacts", [190, 154, 76, 255], 0.84, 0.26),
            "ex43_cage": pbr("EX4300 Cage Rim", [176, 178, 180, 255], 0.70, 0.30),
            "ex43_cage_bore": pbr("EX4300 Cage Bore", [26, 25, 24, 255], 0.14, 0.90),
            "ex43_card": pbr("EX4300 Card Edge", [180, 177, 168, 255], 0.0, 0.60),
            # The uplink module's pull tabs, measured at 132,205,242. The
            # only colour on the switch, and the one thing that identifies
            # the bay as populated rather than blanked.
            "ex43_blue": pbr("EX4300 Uplink Tab", [112, 186, 226, 255], 0.0, 0.50),
            "ex43_screw": pbr("EX4300 Captive Screw", [156, 159, 161, 255], 0.66, 0.32),
            "ex43_button": pbr("EX4300 Button", [96, 99, 104, 255], 0.42, 0.42),
            # The LCD is a reflective monochrome panel, not a backlit one:
            # measured 66,82,69, a dark olive that only reads as a screen
            # because it is smoother than everything round it.
            "ex43_lcd": pbr("EX4300 LCD", [78, 94, 80, 255], 0.0, 0.20,
                            emissive=[0.03, 0.05, 0.03]),
            "ex43_lcd_bezel": pbr("EX4300 LCD Bezel", [60, 62, 66, 255], 0.20, 0.54),
            "ex43_lamp": pbr("EX4300 Status Lamp", [50, 58, 50, 255], 0.0, 0.40,
                             emissive=[0.014, 0.028, 0.014]),
            "ex43_lamp_amber": pbr("EX4300 Alarm Lamp", [72, 58, 36, 255], 0.0, 0.40,
                                   emissive=[0.030, 0.018, 0.004]),
        })

    # ------------------------------------------------------------- measured
    #
    # The photograph's panel measures x 24..1475, y 24..184, so 1452 by 161
    # pixels for a 442mm face, which puts a pixel at 0.3044mm across. The
    # check that the horizontal calibration is right is the port pitch: 46
    # pixels comes out at 14.00mm, which is what a ganged RJ45 pitch is.
    # The vertical is not trustworthy on this image, since 161 pixels would
    # make the panel 49mm tall and a rack unit is 44.45, so every vertical
    # figure here is a fraction of panel height and the stretch stays out
    # of the model. Horizontal figures are metres from the left edge.

    #: Twenty four columns of two: first centre, pitch, and the extra a
    #: bank boundary adds at every sixth column.
    COL0, PITCH, GAP = 0.01430, 0.01400, 0.00487
    #: Openings measured at 40 px across.
    JACK_W = 0.01218
    #: Row centres and heights. The bank sits high on the panel, because
    #: the bottom vent band is shallower than the top one.
    ROW_Z = (0.1739, -0.1335)
    ROW_H = (0.2112, 0.2050)
    #: The four stamped shields, one per bank of twelve.
    BANKS = ((0.0058, 0.0938), (0.0944, 0.1824), (0.1830, 0.2716), (0.2721, 0.3614))
    BANK_Z = (0.3230, -0.2547)
    #: Port numbers, even high and odd dropped below and to the right.
    NUM_Z = (-0.2790, -0.3120)

    #: Punched honeycomb along the top edge, two interlocking rows at an
    #: 8.5mm pitch within a row, so 4.3mm between neighbours. Each entry is
    #: the row's z fraction, hexagon width and hexagon height.
    HEX_PITCH = 0.00852
    HEX_TOP = ((0.4441, 0.00430, 0.00390), (0.4006, 0.00430, 0.00390))
    #: The bottom band is the same honeycomb cut off by the panel edge, so
    #: the lower of its two rows is only a sliver.
    HEX_BOT = ((-0.3620, 0.00430, 0.00280), (-0.3900, 0.00430, 0.00190))
    #: Where each band runs. The top one starts clear of the wordmark and
    #: stops before the console port; the bottom one runs under the whole
    #: port bank and stops at the uplink module.
    HEX_TOP_X = (0.0310, 0.3480)
    HEX_BOT_X = (0.0040, 0.3620)

    #: The console mini-USB, marked CON1 rather than CON on this switch.
    CON_X, CON_Z, CON = 0.36050, 0.382, (0.00790, 0.068)
    BADGE_X, BADGE_Z = 0.39660, 0.410
    #: The LCD and the two buttons beside it.
    LCD_X, LCD_Z, LCD = 0.39575, 0.2578, (0.03590, 0.2049)
    BTN_X, BTN_Z, BTN_R = 0.42270, (0.3075, 0.1460), 0.00320
    #: ALM, SYS and MST, stacked at the far right.
    LED_X, LED_Z, LED_R = 0.42930, (0.372, 0.297, 0.224), 0.00100
    #: The two captive screws that hold the chassis lid down.
    LID_SCREW_X, LID_SCREW_Z = (0.36800, 0.43600), 0.234

    #: The uplink module and everything on it.
    UPLINK = (0.36300, 0.44100, 0.030, -0.400)
    SFPP_X = (0.38100, 0.39530, 0.40940, 0.42310)
    SFPP_W, SFPP_Z, SFPP_H = 0.01430, -0.149, 0.215
    TAB_X = ((0.36925, 0.00730), (0.43545, 0.00820))
    TAB_Z, TAB_H = -0.264, 0.230
    UP_SCREW_X, UP_SCREW_Z = (0.36930, 0.43450), -0.093
    UP_NUM_Z = -0.301

    def column_x(self, i: int) -> float:
        """Centre of RJ45 column `i`, metres from the panel's left edge."""
        return self.COL0 + i * self.PITCH + (i // 6) * self.GAP

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Geometry cannot spell, and this switch has ninety six numbers on
        its foot. What is worth getting right beyond the words themselves
        is how Juniper set a stacked pair: the even number sits up and to
        the left, the odd one drops below and to the right, so one glance
        tells you which row a number belongs to. Set them in a straight
        line, as the first pass did, and a bank of twelve reads as twelve
        ports rather than as six columns of two.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (228, 230, 232, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def fitted(text: str, mm_wide: float, bold: bool = False):
            want = mm_wide / 1000 * ppm
            f = font(40, bold)
            got = d.textbbox((0, 0), text, font=f)[2]
            return font(max(8, round(40 * want / max(got, 1))), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- wordmark, printed over the top left of the vent band -------
        f_mark = fitted("juniper", 22.2)
        top = py(0.404) - d.textbbox((0, 0), "j", font=f_mark)[3] / 2
        d.text((px(0.0070), top), "juniper", font=f_mark, fill=ink)
        f_sub = sized(1.15, True)
        sub = "N E T W O R K S"
        b = d.textbbox((0, 0), sub, font=f_sub)
        d.text((px(0.0292) - (b[2] - b[0]), py(0.318) - (b[3] - b[1]) / 2 - b[1]),
               sub, font=f_sub, fill=ink)

        centred("EX4300", px(self.BADGE_X), py(self.BADGE_Z), fitted("EX4300", 14.6, True))
        centred("CON1", px(self.CON_X) - px(0.0088), py(self.CON_Z), sized(1.3, True))

        # ---- forty eight port numbers, stepped in pairs ------------------
        f_num = sized(1.25, True)
        hi, lo = py(self.NUM_Z[0]), py(self.NUM_Z[1])
        for i in range(24):
            cx = px(self.column_x(i))
            centred(str(i * 2), cx - px(0.0026), hi, f_num)
            centred(str(i * 2 + 1), cx + px(0.0030), lo, f_num)

        # ---- the three lamps at the right, named down the column --------
        f_led = sized(1.15, True)
        for label, zf in zip(("ALM", "SYS", "MST"), self.LED_Z):
            centred(label, px(self.LED_X) - px(0.0072), py(zf), f_led)

        # ---- the uplink module's own numbering ---------------------------
        for i, cx_m in enumerate(self.SFPP_X):
            centred(str(i), px(cx_m), py(self.UP_NUM_Z), sized(1.4, True))

        tex = save_texture("ex4300_48t_silkscreen.png", img)
        rack.materials["ex43_silktex"] = PBRMaterial(
            name="EX4300 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.64,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "ex43_silktex",
                            (0, self.face(rack) - 0.0007, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def vent_row(self, rack, g: str, z: float, frac: float, w: float, hgt: float,
                 stagger: bool, span: tuple) -> None:
        """One row of the punched honeycomb.

        The two rows of a band interlock rather than stack, which is what a
        honeycomb is: 8.5mm between holes along a row and the next row
        offset by half of that. Get the offset wrong and the band becomes a
        grille, which is what every other vendor uses.

        The hexagons have to be hexagons here, unlike the 2mm holes on a
        QFX5120. These are 4.3mm across, and the first pass drew each as
        one box: two interlocking rows of squares came out as a chequer
        board, which is the one pattern a honeycomb never looks like. Three
        stacked bars, widest across the middle, give the sloped shoulders
        that let one row nest into the next.

        A hole cannot be modelled as a hole, because the panel behind it is
        solid, so it is a dark tile drawn just proud of the paint. At the
        depth a real 4mm perforation has, every hexagon renders as a raised
        stud with a highlight down its own face.
        """
        y = self.face(rack) - 0.00010
        x0, x1 = span
        offset = self.HEX_PITCH / 2 if stagger else 0.0
        n = int((x1 - x0) / self.HEX_PITCH) + 1
        for i in range(n):
            xm = x0 + w / 2 + offset + i * self.HEX_PITCH
            if xm > x1 - w / 2:
                break
            x = -self.width / 2 + xm
            zz = z + frac * self.height
            rack.box(g, "ex43_vent", (x, y, zz), (w, 0.0006, hgt * 0.44))
            for dz in (hgt * 0.33, -hgt * 0.33):
                rack.box(g, "ex43_vent", (x, y, zz + dz), (w * 0.74, 0.0006, hgt * 0.30))

    def jack(self, rack, g: str, x: float, z: float, h: float, top_row: bool) -> None:
        """One RJ45 as an EX4300 wears it.

        A bright stamped shield with two lamp windows let into the edge
        that faces out of the bank, a black mouth, and the contacts hanging
        from the wall opposite the latch. The rows are inverted against
        each other, so `top_row` mirrors all of it: on the upper row the
        latch and the lamps are up and the contacts hang down, and on the
        lower row every one of those is the other way round.
        """
        y = self.face(rack)
        w = self.JACK_W
        rim = 0.00075
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            mat = "ex43_shield" if dz >= 0 else "ex43_shield_dark"
            rack.box(g, mat, (x + dx, y - 0.0016, z + dz), (bw, 0.0014, bh))
        # Depth order, and it took a render to see this was backwards. The
        # bore has to be drawn in front of the solid panel or it never shows
        # at all, but it must sit BEHIND the rim, not in front of it. The
        # first pass had the bore 0.9mm proud of its own frame, which put
        # the latch slot, the lamp windows and the tongue inside the bore
        # and therefore behind it: forty eight jacks came out as plain
        # black rectangles with a gold comb and nothing else.
        rack.box(g, "ex43_bore", (x, y - 0.0008, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "ex43_bore", (x, y + 0.0050, z), (w * 0.80, 0.0100, h * 0.78))
        out = 1.0 if top_row else -1.0
        rack.box(g, "ex43_shield", (x, y - 0.0021, z + out * h * 0.41),
                 (w * 0.26, 0.0010, h * 0.18))
        for dx in (-w * 0.31, w * 0.31):
            rack.box(g, "ex43_window", (x + dx, y - 0.0021, z + out * h * 0.36),
                     (w * 0.22, 0.0009, h * 0.15))
        # The contacts hang from the wall opposite the latch, so they are
        # low in the upper row and high in the lower one. At a tenth of the
        # opening off centre that difference does not read; at 0.22 it does,
        # and it is the thing that shows the two rows are inverted.
        tz = z - out * h * 0.22
        rack.box(g, "ex43_tongue", (x, y - 0.0020, tz), (w * 0.54, 0.0006, h * 0.28))
        for i in range(8):
            cx = x - w * 0.22 + i * (w * 0.44 / 7)
            rack.box(g, "ex43_gold", (cx, y - 0.0022, tz), (w * 0.028, 0.0005, h * 0.22))

    def cage(self, rack, g: str, x: float, z: float, h: float) -> None:
        """One empty SFP+ opening on the uplink module.

        All four are upright, so unlike the RJ45 bank there is no mirroring
        here: the card edge is at the floor of every one of them and the
        EMI ridge across the roof.
        """
        y = self.face(rack)
        w = self.SFPP_W
        rim = 0.00070
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            rack.box(g, "ex43_cage" if dz >= 0 else "ex43_shield_dark",
                     (x + dx, y - 0.0018, z + dz), (bw, 0.0013, bh))
        rack.box(g, "ex43_cage_bore", (x, y - 0.0009, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "ex43_cage_bore", (x, y + 0.0060, z), (w * 0.86, 0.0110, h * 0.82))
        rack.box(g, "ex43_cage", (x, y - 0.0021, z + h * 0.36), (w * 0.74, 0.0008, h * 0.08))
        rack.box(g, "ex43_card", (x, y - 0.0021, z - h * 0.30), (w * 0.34, 0.0008, h * 0.10))

    def captive_screw(self, rack, g: str, x: float, z: float) -> None:
        """A captive Phillips screw, as the lid and the module are held."""
        y = self.face(rack)
        rack.front_cylinder(g, "ex43_screw", (x, y - 0.0015, z), 0.0024, 0.0013, 18)
        rack.front_cylinder(g, "ex43_recess", (x, y - 0.0020, z), 0.0017, 0.0006, 14)
        for w_, h_ in ((0.0028, 0.0006), (0.0006, 0.0028)):
            rack.box(g, "ex43_recess", (x, y - 0.0023, z), (w_, 0.0006, h_))

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

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.012, self.depth, h * 0.92))
        rack.rounded_prism(g, "ex43_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0012, bevel=0.0005, steps=6)
        rack.box(g, "ex43_edge", (0, y - 0.0004, z + h * 0.484), (w - 0.005, 0.0006, 0.0010))
        rack.box(g, "ex43_recess", (0, y - 0.0004, z - h * 0.484), (w - 0.005, 0.0006, 0.0010))

        # ---- the two vent bands -----------------------------------------
        for i, (frac, vw, vh) in enumerate(self.HEX_TOP):
            self.vent_row(rack, g, z, frac, vw, vh, bool(i), self.HEX_TOP_X)
        for i, (frac, vw, vh) in enumerate(self.HEX_BOT):
            self.vent_row(rack, g, z, frac, vw, vh, bool(i), self.HEX_BOT_X)

        # ---- four banks of twelve ---------------------------------------
        # The gasket line is drawn first and the shield inside it, so the
        # boundary between one bank and the next is a dark seam rather than
        # a change of grey. Without it the forty eight run together as one
        # undifferentiated strip, which is the single thing that stops an
        # EX4300 reading as an EX4300.
        top, bot = self.BANK_Z
        for x0, x1 in self.BANKS:
            cx, bw = (X(x0) + X(x1)) / 2, x1 - x0
            cz, bh = Z((top + bot) / 2), (top - bot) * h
            rack.box(g, "ex43_gasket", (cx, y - 0.0004, cz), (bw + 0.0014, 0.0006, bh + 0.0014))
            rack.box(g, "ex43_shield", (cx, y - 0.0009, cz), (bw, 0.0009, bh))
            rack.box(g, "ex43_shield_dark", (cx, y - 0.0012, cz - bh / 2 + 0.0004),
                     (bw, 0.0005, 0.0008))
        for i in range(24):
            cx = X(self.column_x(i))
            self.jack(rack, g, cx, Z(self.ROW_Z[0]), self.ROW_H[0] * h, True)
            self.jack(rack, g, cx, Z(self.ROW_Z[1]), self.ROW_H[1] * h, False)

        # ---- console, LCD, buttons and lamps ----------------------------
        cw, ch = self.CON
        rack.box(g, "ex43_shield", (X(self.CON_X), y - 0.0011, Z(self.CON_Z)),
                 (cw, 0.0009, ch * h))
        rack.box(g, "ex43_bore", (X(self.CON_X), y - 0.0019, Z(self.CON_Z)),
                 (cw * 0.74, 0.0018, ch * h * 0.58))

        lw, lh = self.LCD
        rack.rounded_prism(g, "ex43_lcd_bezel", (X(self.LCD_X), y - 0.0010, Z(self.LCD_Z)),
                           (lw + 0.0016, 0.0010, lh * h + 0.0016),
                           radius=0.0008, bevel=0.0003, steps=6)
        rack.box(g, "ex43_lcd", (X(self.LCD_X), y - 0.0016, Z(self.LCD_Z)), (lw, 0.0008, lh * h))
        for bz in self.BTN_Z:
            rack.front_cylinder(g, "ex43_edge", (X(self.BTN_X), y - 0.0012, Z(bz)),
                                self.BTN_R, 0.0010, 22)
            rack.front_cylinder(g, "ex43_button", (X(self.BTN_X), y - 0.0018, Z(bz)),
                                self.BTN_R * 0.74, 0.0012, 22)
        for i, lz in enumerate(self.LED_Z):
            mat = "ex43_lamp_amber" if i == 0 else "ex43_lamp"
            rack.front_cylinder(g, mat, (X(self.LED_X), y - 0.0010, Z(lz)),
                                self.LED_R, 0.0009, 10)
        for sx in self.LID_SCREW_X:
            self.captive_screw(rack, g, X(sx), Z(self.LID_SCREW_Z))

        # ---- the uplink module ------------------------------------------
        ux0, ux1, uzt, uzb = self.UPLINK
        rack.box(g, "ex43_gasket", ((X(ux0) + X(ux1)) / 2, y - 0.0004, Z((uzt + uzb) / 2)),
                 (ux1 - ux0 + 0.0012, 0.0006, (uzt - uzb) * h + 0.0012))
        rack.rounded_prism(g, "ex43_panel", ((X(ux0) + X(ux1)) / 2, y - 0.0008,
                                             Z((uzt + uzb) / 2)),
                           (ux1 - ux0, 0.0010, (uzt - uzb) * h),
                           radius=0.0008, bevel=0.0003, steps=6)
        for cx_m in self.SFPP_X:
            self.cage(rack, g, X(cx_m), Z(self.SFPP_Z), self.SFPP_H * h)
        # Two lamp windows under each cage, flanking its number.
        for cx_m in self.SFPP_X:
            for dx in (-0.0044, 0.0044):
                rack.box(g, "ex43_window", (X(cx_m) + dx, y - 0.0014, Z(self.UP_NUM_Z)),
                         (0.0022, 0.0009, 0.0016))
        for tx, tw in self.TAB_X:
            rack.rounded_prism(g, "ex43_blue", (X(tx), y - 0.0014, Z(self.TAB_Z)),
                               (tw, 0.0012, self.TAB_H * h),
                               radius=0.0008, bevel=0.0003, steps=6)
        for sx in self.UP_SCREW_X:
            self.captive_screw(rack, g, X(sx), Z(self.UP_SCREW_Z))

        self.silkscreen(rack, z)
