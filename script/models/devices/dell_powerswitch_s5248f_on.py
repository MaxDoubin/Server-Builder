"""Dell PowerSwitch S5248F-ON, from Dell's labelled front diagram.

Fifty four cages and almost nothing else. Forty eight SFP28 in two rows of
twenty four, split into three ganged blocks of sixteen; then a single
QSFP28-DD stack of two; then four QSFP28 in a two by two. At the far left,
in the only 40mm of panel that is not a port, a seven segment Stack-ID
window over a black tile carrying five status icons.

Two things about this panel are worth stating before any geometry, because
both were wrong in the first pass and neither is in the datasheet:

  It is black. Dell's own line drawing renders the faceplate in a mid grey
  around 96 of 255, and that is drawing convention, not paint. On the bench
  photograph the same plate sits between 14 and 50 while the lid above it
  reads 200, so the plate is a dark graphite and the drawing is a diagram.
  Painting it 96 gives a switch that looks like a photocopy of one.

  The bail latches are the only bright thing on it. Every cage carries a
  pale plastic tab across its mouth, at the inner edge on the SFP28 rows
  and the outer edge on the QSFP rows, and those fifty four little pale
  bars are what stop a wall of black rectangles reading as a grille.

Numbering runs odd along the top row and even along the bottom, 1 to 48,
which is why the numerals above and below a single column differ by one
rather than by twenty four.

Nothing here is shared with another product. A Dell cage sits in a raised
ganged housing with a stamped flange and a round LED above it; a MikroTik
cage is milled into a pocket with a triangle pointing at it. Drawing one
generic cage is exactly what made every switch in this library look alike.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import Device, Reference


class PowerSwitchS5248F(Device):
    slug = "S5248F_ON"
    name = "Dell PowerSwitch S5248F-ON"
    u = 1
    #: The diagram's faceplate is 434mm across and 43.5mm tall, which is the
    #: chassis body; the mounting flanges take it out to a 19 inch face.
    width = 0.434
    depth = 0.460
    source = "https://www.dell.com/en-us/shop/ipovw/networking-s-series-25-100gbe"
    references = [
        Reference("https://expresscomputersystems.com/cdn/shop/products/"
                  "S5248F-ON-front_1600x.jpg?v=1676679485",
                  "Dell's labelled front diagram, perfectly orthographic, the "
                  "faceplate in 1058 by 106 pixels; every figure below came off it"),
        Reference("https://expresscomputersystems.com/cdn/shop/products/"
                  "S5248F-ON-diagram_1600x.jpg?v=1676679485",
                  "the same diagram enlarged, for the bail latches, the per port "
                  "LEDs and the five icon status tile"),
        Reference("https://www.servethehome.com/wp-content/uploads/2022/01/"
                  "Dell-S5248F-ON-Front-2.jpg",
                  "a real unit on a bench, straight on, which is where the "
                  "faceplate's actual colour came from"),
    ]

    # -------------------------------------------------------------- measured
    #
    # The diagram's faceplate measures 1058 by 106 pixels. Dell publish a
    # 434mm body, which puts a pixel at 0.4102mm, and 106 of them is 43.5mm
    # against a rack unit of 44.45. Consistent both ways, so the drawing is
    # orthographic and everything below is a measurement.
    #
    # Horizontal figures are metres from the left edge of the 482.6mm face,
    # so a diagram pixel maps as 0.0243 + (px - 9) / 2438. Vertical figures
    # are fractions of panel height with zero at the middle, (544 - y) / 106.

    FACE_W = 0.4826
    #: (482.6 - 434) / 2 of mounting flange each side. The diagram stops at
    #: the body, so the flanges are the one part of this panel that had to
    #: come from the bench photograph rather than the drawing.
    EAR = 0.0243

    #: Twenty four SFP28 columns, ganged in three blocks of eight columns.
    #: Cage centres sit 34.3 pixels apart inside a block and the join adds
    #: another 5.05, so 14.07mm and 2.07mm.
    SFP_N = 24
    SFP_X0 = 0.04911
    SFP_PITCH = 0.014069
    SFP_GAP = 0.002072
    SFP_PER_BLOCK = 8
    #: Cage mouth, 30.5 by 21 pixels.
    SFP_CAGE = (0.01251, 0.00861)

    #: The QSFP28-DD stack and the four QSFP28, 43 and 43.5 pixels wide.
    QDD_X, QDD_W = 0.39859, 0.01764
    QSFP_X0, QSFP_PITCH, QSFP_W = 0.42220, 0.01948, 0.01784
    QSFP_N = 2

    #: Cage row centres, pixels 527 and 561.5.
    ROW_Z = (0.1604, -0.1651)
    #: Per port LEDs, one to a port, pixels 509.5 above and 580 below. They
    #: are round, about 6 pixels across, and offset to the right of the
    #: numeral rather than centred over the cage.
    LED_Z = (0.3255, -0.3396)
    LED_R = 0.00115
    LED_DX = 0.0026
    #: Lane lamps, four to a QSFP port. A QSFP28 gets one course on the
    #: same line as the SFP28 lamps; the QSFP28-DD carries eight lanes and
    #: gets a second course outboard of it, at pixels 501.5 and 584 plus.
    #: The first pass put both courses just off the cage, which drops the
    #: inner one inside the mouth where nothing can be seen of it.
    QLED_DX = 0.00385
    QLED_Z = ((0.3255, 0.4010), (-0.3396, -0.4151))

    #: Seven segment Stack-ID window and the five icon tile below it.
    STACK_X, STACK_Z, STACK = 0.03363, 0.2100, (0.00759, 0.01210)
    ICONS_X, ICONS_Z, ICONS = 0.03353, -0.2028, (0.01025, 0.01518)
    #: Where the two pieces of lettering go, off the bench photograph.
    WORDMARK_Z = 0.399
    MODEL_Z = -0.406

    def face(self, rack) -> float:
        """The visible plane of the faceplate, 5.3mm proud of `front_y`.

        `front_y` is the middle of the panel slab, so measuring cage depth
        from it puts every mouth inside the sheet metal. That mistake cost
        the first device in this library its entire front panel.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This switch's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Dark graphite, from the bench photograph rather than from the
            # line drawing. Powder coat, so the roughness is high: at 0.4
            # the studio lays a band of specular across the plate and it
            # reads as painted steel with a clear coat, which it is not.
            "s52_plate": pbr("S5248F Faceplate", [39, 40, 43, 255], 0.16, 0.72),
            "s52_plate_lit": pbr("S5248F Plate Edge", [68, 70, 74, 255], 0.18, 0.62),
            "s52_shadow": pbr("S5248F Shadow", [17, 17, 19, 255], 0.10, 0.78),
            # The ganged housing the cages are pressed into, a shade lighter
            # than the plate so the port bank has an outline at all.
            "s52_housing": pbr("S5248F Cage Housing", [58, 59, 62, 255], 0.30, 0.56),
            # The cage rim is bare nickel plated steel and it catches the
            # light, which is why Dell's line drawing outlines every mouth
            # in white. Painted the same graphite as the housing, 54 cages
            # came out as 54 soft dark smudges with no edge at all.
            "s52_cage": pbr("S5248F Cage", [104, 106, 108, 255], 0.54, 0.42),
            # The throat behind the mouth. It has to be darker than the cage
            # around it or a 54 port panel reads as 54 grey tiles.
            "s52_bore": pbr("S5248F Cage Bore", [8, 8, 9, 255], 0.0, 0.92),
            # The pale bail latch. Fifty four of these are the only bright
            # marks on the panel and they are what make it legible.
            "s52_bail": pbr("S5248F Bail Latch", [182, 183, 181, 255], 0.08, 0.50),
            # White plastic card edge inside an empty cage, the one thing
            # that stops an unpopulated cage looking like a punched hole.
            "s52_edge": pbr("S5248F Card Edge", [222, 223, 219, 255], 0.0, 0.54),
            # Port lamps. Dell's diagram draws them a yellow green; on the
            # bench they are a plain green, and unlit most of the time.
            "s52_led": pbr("S5248F Port LED", [104, 152, 66, 255], 0.0, 0.34,
                           emissive=[0.05, 0.11, 0.02]),
            "s52_led_dark": pbr("S5248F Lane Lamp", [92, 132, 62, 255], 0.0, 0.34,
                                emissive=[0.05, 0.11, 0.02]),
            # The Stack-ID window: a pale panel with a dark seven segment
            # figure printed across it, not a lit display.
            "s52_stack": pbr("S5248F Stack Window", [206, 207, 205, 255], 0.0, 0.42),
            "s52_stack_ink": pbr("S5248F Stack Digit", [40, 41, 42, 255], 0.0, 0.66),
            "s52_tile": pbr("S5248F Status Tile", [20, 20, 22, 255], 0.08, 0.74),
            "s52_locator": pbr("S5248F Locator", [46, 156, 214, 255], 0.0, 0.28,
                               emissive=[0.05, 0.22, 0.34]),
            "s52_flange": pbr("S5248F Flange", [52, 53, 56, 255], 0.24, 0.60),
            "s52_lid": pbr("S5248F Lid", [178, 180, 182, 255], 0.56, 0.36),
        })

    # ------------------------------------------------------------- geometry

    def column_x(self, i: int) -> float:
        """Centre of SFP28 column `i`, metres from the face's left edge."""
        return self.SFP_X0 + i * self.SFP_PITCH + (i // self.SFP_PER_BLOCK) * self.SFP_GAP

    def housing(self, rack, g: str, z: float, x0: float, x1: float) -> None:
        """The raised block a run of cages is ganged into.

        Dell presses these as one part per block of sixteen ports, and the
        seam between blocks is visible on the panel as a hairline with a
        little extra pitch across it. Drawing one continuous bank of forty
        eight loses the rhythm that makes the port field look manufactured.
        """
        y = self.face(rack)
        h = self.height
        top = self.ROW_Z[0] + self.SFP_CAGE[1] / h / 2
        bot = self.ROW_Z[1] - self.SFP_CAGE[1] / h / 2
        cz = z + (top + bot) / 2 * h
        hz = (top - bot) * h
        rack.box(g, "s52_plate_lit", ((x0 + x1) / 2, y - 0.0004, cz),
                 (x1 - x0 + 0.0009, 0.0008, hz + 0.0011))
        rack.box(g, "s52_housing", ((x0 + x1) / 2, y - 0.0009, cz), (x1 - x0, 0.0010, hz))

    def cage(self, rack, g: str, x: float, z: float, w: float, hgt: float,
             bail_up: bool, lanes: int = 1) -> None:
        """One empty optics cage as this faceplate presents it.

        Three things make it read as a hole rather than a tile: the throat
        has to be drawn in front of the housing and then stepped back behind
        the cage rim, or the housing wins the depth test; the pale bail
        latch has to cross the mouth on the correct edge, which is the inner
        edge on an SFP28 row and the outer edge on a QSFP row; and the white
        card edge connector has to sit at the back, because it is the
        brightest thing inside an unpopulated cage and without it four QSFP
        mouths are four black squares.
        """
        y = self.face(rack)
        rim = 0.0009
        for dx, dz, bw, bh in (
            (0, hgt / 2 - rim / 2, w, rim),
            (0, -hgt / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, hgt),
            (w / 2 - rim / 2, 0, rim, hgt),
        ):
            rack.box(g, "s52_cage", (x + dx, y - 0.0016, z + dz), (bw, 0.0012, bh))
        rack.box(g, "s52_bore", (x, y - 0.0009, z), (w - rim * 1.6, 0.0016, hgt - rim * 1.6))
        rack.box(g, "s52_bore", (x, y + 0.0050, z), (w * 0.86, 0.0100, hgt * 0.84))
        # The bail latch, a pale bar across one edge of the mouth.
        bz = z + (hgt * 0.36 if bail_up else -hgt * 0.36)
        rack.box(g, "s52_bail", (x, y - 0.0019, bz), (w * 0.44, 0.0008, hgt * 0.085))
        # Card edge connectors at the back, one per lane group.
        for i in range(lanes):
            ex = x + (i - (lanes - 1) / 2) * (w * 0.80 / max(lanes, 1))
            rack.box(g, "s52_edge", (ex, y - 0.0012, z - (hgt * 0.30 if bail_up else -hgt * 0.30)),
                     (w * (0.44 if lanes == 1 else 0.16), 0.0008, hgt * 0.10))

    def stack_window(self, rack, g: str, x: float, z: float) -> None:
        """The seven segment Stack-ID window.

        Seven bars in the figure eight arrangement, printed dark on a pale
        window. Drawing the digit as geometry rather than as type is the one
        place on this panel where that is the right answer, because a seven
        segment figure is bars and nothing else.
        """
        y = self.face(rack)
        w, hgt = self.STACK
        rack.rounded_prism(g, "s52_stack", (x, y - 0.0010, z), (w, 0.0010, hgt),
                           radius=0.0009, bevel=0.0003, steps=6)
        bar = 0.00075
        sw, sh = w * 0.46, hgt * 0.34
        for dx, dz, bw, bh in (
            (0, sh, sw, bar),                    # top
            (0, 0, sw, bar),                     # middle
            (0, -sh, sw, bar),                   # bottom
            (-sw / 2, sh / 2, bar, sh),          # upper left
            (sw / 2, sh / 2, bar, sh),           # upper right
            (-sw / 2, -sh / 2, bar, sh),         # lower left
            (sw / 2, -sh / 2, bar, sh),          # lower right
        ):
            rack.box(g, "s52_stack_ink", (x + dx, y - 0.0016, z + dz), (bw, 0.0006, bh))

    def status_tile(self, rack, g: str, x: float, z: float) -> None:
        """The five status icons, on their own black tile under the window.

        Power and system on the top course, fan and master on the second,
        and the blue circled locator on its own at the bottom right. The
        icons themselves are silkscreen; what is drawn here is the tile and
        the five lamps behind them.
        """
        y = self.face(rack)
        w, hgt = self.ICONS
        rack.rounded_prism(g, "s52_tile", (x, y - 0.0009, z), (w, 0.0010, hgt),
                           radius=0.0007, bevel=0.0003, steps=5)
        for dx, dz, mat in ((-0.25, 0.30, "s52_led"), (0.25, 0.30, "s52_led"),
                            (-0.25, 0.00, "s52_led"), (0.25, 0.00, "s52_led")):
            rack.box(g, mat, (x + dx * w, y - 0.0014, z + dz * hgt),
                     (w * 0.22, 0.0006, hgt * 0.11))
        rack.front_cylinder(g, "s52_locator", (x + 0.20 * w, y - 0.0014, z - 0.30 * hgt),
                            0.0016, 0.0006, 16)

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the faceplate, as one transparent overlay.

        Forty eight port numbers, three group labels, the wordmark and the
        model. Geometry cannot spell, and on a switch whose whole left hand
        end is lettering that is the difference between a product and a box
        with holes in it.

        The sheet spans the full 482.6mm face rather than the 434mm body so
        that the flanges are covered by the same overlay, and it keeps the
        panel's own aspect so nothing is stretched.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.FACE_W)
        ppm = W / self.FACE_W
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (168, 169, 168, 255)
        bright = (226, 227, 226, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- port numbers. Odd along the top, even along the bottom, so a
        #      single column reads 1 over 2 and not 1 over 25. They tuck in
        #      beside the lamp rather than over it, which is where Dell put
        #      them and the only place they fit on a 43.5mm panel.
        f_num = sized(1.7)
        for i in range(self.SFP_N):
            cx = px(self.column_x(i))
            centred(str(i * 2 + 1), cx - 0.0030 * ppm, py(self.LED_Z[0]), f_num)
            centred(str(i * 2 + 2), cx - 0.0030 * ppm, py(self.LED_Z[1]), f_num)

        # ---- group labels, printed in the channel between the two rows.
        f_lab = sized(1.5)
        mid = py((self.ROW_Z[0] + self.ROW_Z[1]) / 2)
        centred("SFP28", px((self.column_x(11) + self.column_x(12)) / 2), mid, f_lab)
        centred("QSFP28-DD", px(self.QDD_X), mid, f_lab)
        centred("QSFP28", px(self.QSFP_X0 + self.QSFP_PITCH / 2), mid, f_lab)

        # ---- the two pieces of lettering at the left hand end, both set
        #      the way the bench photograph has them: the wordmark heavy and
        #      pale above the window, the model light and grey below the
        #      status tile.
        centred("DELL EMC", px(0.0368), py(self.WORDMARK_Z), sized(2.4, True), bright)
        centred("Stack ID", px(self.STACK_X), py(0.0560), sized(1.3))
        centred("S5248F-ON", px(0.0368), py(self.MODEL_Z), sized(1.7))

        # ---- the five status icons on the tile: a plug in a box, a stack,
        #      a fan, a heartbeat and the circled i of the locator.
        w, hgt = self.ICONS
        r = 1.1 / 1000 * ppm
        for k, (dx, dz) in enumerate(((-0.25, 0.30), (0.25, 0.30), (-0.25, 0.0), (0.25, 0.0))):
            # dz is a fraction of the tile's own height, so it converts to a
            # panel fraction through hgt / self.height before py sees it.
            cx = px(self.ICONS_X + dx * w)
            cy = py(self.ICONS_Z + dz * hgt / self.height)
            if k == 0:                                    # power, a plug in a box
                d.rectangle([cx - r, cy - r, cx + r, cy + r], outline=ink, width=2)
                d.line([(cx, cy - r * 0.5), (cx, cy + r * 0.5)], fill=ink, width=2)
            elif k == 1:                                  # system, stacked plates
                for j in (-1, 0, 1):
                    d.line([(cx - r, cy + j * r * 0.6), (cx + r, cy + j * r * 0.6)],
                           fill=ink, width=2)
            elif k == 2:                                  # fan, four blades
                for a in (0, 90, 180, 270):
                    d.pieslice([cx - r, cy - r, cx + r, cy + r], a + 8, a + 62, outline=ink, width=2)
            else:                                         # master, a heartbeat
                d.line([(cx - r, cy), (cx - r * 0.3, cy), (cx - r * 0.1, cy - r * 0.7),
                        (cx + r * 0.2, cy + r * 0.7), (cx + r * 0.4, cy), (cx + r, cy)],
                       fill=ink, width=2)

        tex = save_texture("s5248f_silkscreen.png", img)
        rack.materials["s52_silktex"] = PBRMaterial(
            name="S5248F Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.62,
            alphaMode="BLEND", doubleSided=True,
        )
        # 1.8mm proud: in front of the ganged housings and the status tile,
        # so the group labels and the five icons print on them, and behind
        # the cage rims so no numeral ends up lying across a mouth.
        rack.textured_plane(self.slug, "s52_silktex",
                            (0, self.face(rack) - 0.0018, z), self.FACE_W, self.height)

    # ----------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h = self.height
        w = self.width

        def X(from_left: float) -> float:
            """Panel coordinate from a measurement off the diagram.

            Metres from the left edge of the 482.6mm face. A diagram pixel
            converts as 0.0243 + (px - 9) / 2438.
            """
            return -self.FACE_W / 2 + from_left

        def Z(frac: float) -> float:
            return z + frac * h

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.008, self.depth, h * 0.92))
        rack.rounded_prism(g, "s52_plate", (0, rack.front_y, z), (w, 0.0104, h),
                           radius=0.0010, bevel=0.0006, steps=6)
        # The lid overhangs the plate. On the bench photograph it is bare
        # rolled steel at 200 against a faceplate in the forties, and that
        # contrast is most of what says the plate is black rather than grey.
        rack.box(g, "s52_lid", (0, y + 0.0090, z + h * 0.478), (w + 0.0014, 0.020, 0.0022))
        rack.box(g, "s52_shadow", (0, y - 0.0004, z - h * 0.470), (w - 0.004, 0.0008, 0.0018))

        # Mounting flanges. The diagram stops at the body, so these are the
        # one part of the panel taken off the bench photograph: a plain
        # folded bracket with two slots, no latch and no handle.
        for x0 in (0.0, self.FACE_W - self.EAR):
            cx = X(x0 + self.EAR / 2)
            rack.rounded_prism(g, "s52_flange", (cx, y + 0.0042, z), (self.EAR, 0.0096, h * 0.98),
                               radius=0.0008, bevel=0.0005, steps=5)
            for dz in (h * 0.27, -h * 0.27):
                rack.rounded_prism(g, "s52_shadow", (cx, y - 0.0011, z + dz),
                                   (0.0125, 0.0014, 0.0060), radius=0.0028, bevel=0.0005, steps=8)

        # ---- forty eight SFP28, three ganged blocks of sixteen ----------
        cw, chh = self.SFP_CAGE
        for blk in range(self.SFP_N // self.SFP_PER_BLOCK):
            first = blk * self.SFP_PER_BLOCK
            last = first + self.SFP_PER_BLOCK - 1
            self.housing(rack, g, z,
                         X(self.column_x(first) - self.SFP_PITCH / 2 - 0.0004),
                         X(self.column_x(last) + self.SFP_PITCH / 2 + 0.0004))
        for i in range(self.SFP_N):
            cx = X(self.column_x(i))
            # Bail latches face the middle of the panel on an SFP28 row, so
            # the top row's tabs point down and the bottom row's point up.
            self.cage(rack, g, cx, Z(self.ROW_Z[0]), cw, chh, bail_up=False)
            self.cage(rack, g, cx, Z(self.ROW_Z[1]), cw, chh, bail_up=True)
            for frac in self.LED_Z:
                # Round, and small. Square lamps at 2.5mm read as 48 green
                # tiles and pull the eye off the ports entirely.
                rack.front_cylinder(g, "s52_led", (cx + self.LED_DX, y - 0.0013, Z(frac)),
                                    self.LED_R, 0.0007, 14)

        # ---- the QSFP28-DD stack, two ports, eight lanes each ------------
        self.housing(rack, g, z, X(self.QDD_X - self.QDD_W / 2 - 0.0009),
                     X(self.QDD_X + self.QDD_W / 2 + 0.0009))
        for row, frac in enumerate(self.ROW_Z):
            # A QSFP bail lies along the outer edge, the opposite way round
            # from an SFP28. Both rows are in the photograph and getting it
            # backwards makes the optics block look printed on.
            self.cage(rack, g, X(self.QDD_X), Z(frac), self.QDD_W, chh,
                      bail_up=(row == 0), lanes=4)
            for lz in self.QLED_Z[row]:
                for k in range(4):
                    rack.box(g, "s52_led_dark",
                             (X(self.QDD_X) + (k - 1.5) * self.QLED_DX, y - 0.0013, Z(lz)),
                             (0.0021, 0.0007, 0.0016))

        # ---- four QSFP28, two by two -------------------------------------
        self.housing(rack, g, z, X(self.QSFP_X0 - self.QSFP_W / 2 - 0.0009),
                     X(self.QSFP_X0 + self.QSFP_PITCH + self.QSFP_W / 2 + 0.0009))
        for col in range(self.QSFP_N):
            cx = X(self.QSFP_X0 + col * self.QSFP_PITCH)
            for row, frac in enumerate(self.ROW_Z):
                self.cage(rack, g, cx, Z(frac), self.QSFP_W, chh,
                          bail_up=(row == 0), lanes=4)
                for k in range(4):
                    rack.box(g, "s52_led_dark",
                             (cx + (k - 1.5) * self.QLED_DX, y - 0.0013, Z(self.QLED_Z[row][0])),
                             (0.0021, 0.0007, 0.0016))

        # ---- the left hand end: Stack-ID over the status tile -------------
        self.stack_window(rack, g, X(self.STACK_X), Z(self.STACK_Z))
        self.status_tile(rack, g, X(self.ICONS_X), Z(self.ICONS_Z))

        self.silkscreen(rack, z)
