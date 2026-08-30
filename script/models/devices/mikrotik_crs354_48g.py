"""MikroTik CRS354-48G-4S+2Q+RM, drawn from MikroTik's own product photography.

The first product in this library modelled by looking at it rather than by
reading its port count off a datasheet, and the difference starts before
any port is drawn: the old model painted this switch near black, and a
CRS354 is a warm off white box with a pale grey front panel. Everything
below is in the photographs and none of it is in the datasheet.

What the photographs show, working left to right:

  The lid overhangs the panel and is pressed into four shallow steps, with
  CLOUD SWITCH embossed across it and two rounded slots punched near the
  front edge. The rack ears are a separate folded piece, a shade lighter
  than the panel, each with two rounded rectangular slots rather than the
  round holes most vendors use.

  MikroTik's wordmark sits at the far left, and it is two weights: Mikro in
  a thin outline and Tik in heavy black. The model number runs beside it in
  a light grey technical face.

  The 48 gigabit ports are sunk into a milled pocket with a pale frame
  around it, twenty four columns two high, split into four groups of six
  columns by a gap the width of about half a port. Even numbers are
  silkscreened above the top row and odd below the bottom, and GIGABIT
  ETHERNET is centred above the whole field. Each jack carries a green lamp
  in one top corner and an amber in the other, and the two rows are
  mirrored, so the bottom row wears its lamps along its bottom edge.

  Then four SFP+ cages two by two, then two QSFP+ cages stacked. Both
  groups are labelled under a thin bracket line, and between the rows sits
  the detail that makes a MikroTik panel recognisable at a glance: the port
  lamps are small solid triangles pointing at the cage they belong to,
  alternating up and down, with a row of little squares between the QSFP
  lanes.

  The console and management jacks share their own recessed pocket at the
  right, console above and management below, and only the management jack
  has lamps. Above them four labels are joined to their lamps by hairline
  leaders, PWR 1 and FAULT on the left, RESET and PWR 2 on the right,
  around a single round reset button, with a long thin light pipe beneath.

Every dimension here is read off the photograph as a fraction of the panel
and then scaled by the real rack unit, so the proportions are the product's
own rather than a guess. Nothing in this file is shared with another
product: the jacks, cages, lamps and buttons are all drawn here, because a
MikroTik jack in its milled pocket does not look like a Cisco jack in its
stamped shield, and one generic jack on every rack is exactly what made
these look fake.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class CRS354_48G(Device):
    slug = "CRS354_48G"
    name = "MikroTik CRS354-48G-4S+2Q+RM"
    u = 1
    #: MikroTik publish 443 x 210 x 44 mm for this chassis.
    width = 0.443
    depth = 0.210
    source = "https://mikrotik.com/product/crs354_48g_4splus2qplus_rm"
    references = [
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1901_hi_res.png",
                  "front on, 4382x1652, the whole panel"),
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1899_hi_res.png",
                  "front three quarter, gives the lid steps and ear profile"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, which is not `front_y`.

        The panel is a 10.5mm slab centred on the rack's front, so its
        visible face is 5.3mm proud of that. Measuring surface detail from
        `front_y` buries all of it inside the panel, which is exactly what
        the first render of this device did: a blank white slab with two
        faint smudges where the deepest recesses poked through.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Read off the photograph: a warm off white, the lid a shade
            # lighter than the panel, and the ears lighter again.
            "mt354_panel": pbr("CRS354 Panel", [222, 222, 217, 255], 0.16, 0.52),
            "mt354_lid": pbr("CRS354 Lid", [231, 231, 227, 255], 0.18, 0.46),
            "mt354_ear": pbr("CRS354 Ear", [214, 214, 209, 255], 0.22, 0.44),
            # The milled pocket the ports sit in, and its pale lip.
            # The recessed face a ganged housing presents around its
            # openings. Measured at 117 of 255 off the photograph, against
            # the 176 this was painted, which is the difference between a
            # dark port bank with lighter jacks in it and the pale slab
            # with dark squares on it that the first pass rendered.
            "mt354_pocket": pbr("CRS354 Port Pocket", [119, 120, 117, 255], 0.24, 0.58),
            "mt354_lip": pbr("CRS354 Pocket Lip", [236, 236, 232, 255], 0.20, 0.44),
            # A MikroTik RJ45 is a black moulding deep in the pocket with a
            # dull nickel shield and gold contacts well back from the mouth.
            "mt354_jack_shell": pbr("CRS354 Jack Shell", [26, 26, 27, 255], 0.10, 0.72),
            # The cavity behind the mouth, which has to be darker than the
            # moulding around it or the whole opening reads as a grey tile.
            "mt354_jack_throat": pbr("CRS354 Jack Throat", [11, 11, 12, 255], 0.06, 0.92),
            "mt354_jack_tongue": pbr("CRS354 Jack Tongue", [44, 44, 46, 255], 0.08, 0.78),
            "mt354_jack_shield": pbr("CRS354 Jack Shield", [74, 76, 77, 255], 0.62, 0.38),
            "mt354_jack_gold": pbr("CRS354 Jack Contacts", [198, 158, 74, 255], 0.86, 0.24),
            "mt354_cage": pbr("CRS354 Cage", [58, 59, 60, 255], 0.52, 0.44),
            "mt354_cage_bore": pbr("CRS354 Cage Bore", [12, 12, 13, 255], 0.20, 0.86),
            # The card edge connector inside an empty cage, which is white
            # plastic and the brightest thing anywhere near the optics.
            "mt354_cage_edge": pbr("CRS354 Card Edge", [238, 238, 234, 255], 0.0, 0.52),
            # The shield frames are not all one grey. The gigabit and optics
            # housings are a mid grey; the console housing is near white.
            "mt354_frame": pbr("CRS354 Shield Frame", [150, 151, 148, 255], 0.34, 0.46),
            # The strip between two rows of cages, which the lamps print on.
            "mt354_lampbar": pbr("CRS354 Lamp Strip", [176, 177, 173, 255], 0.22, 0.50),
            "mt354_silk": pbr("CRS354 Silkscreen", [92, 93, 92, 255], 0.05, 0.72),
            "mt354_wordmark": pbr("CRS354 Wordmark", [24, 24, 25, 255], 0.05, 0.66),
            "mt354_button": pbr("CRS354 Reset", [26, 26, 28, 255], 0.30, 0.44),
            "mt354_pipe": pbr("CRS354 Light Pipe", [150, 151, 149, 255], 0.24, 0.34),
            # Lenses, not lamps. These are moulded plastic that happens to
            # be green and amber; a link light is the exception on a panel,
            # not the rule, so the glow stays low.
            "mt354_led_green": pbr("CRS354 Green", [78, 196, 116, 255], 0.0, 0.22,
                                   emissive=[0.05, 0.26, 0.11]),
            "mt354_led_amber": pbr("CRS354 Amber", [214, 172, 74, 255], 0.0, 0.24,
                                   emissive=[0.24, 0.16, 0.02]),
        })

    # ------------------------------------------------------------- measured
    #
    # Read off the front elevation photograph rather than guessed, with the
    # picture calibrated against the one dimension the product publishes:
    # 1157 pixels spanned the 482.6mm of a 19 inch face plate, which puts a
    # pixel at 0.417mm and makes every figure below a measurement.
    #
    # Horizontal figures are metres from the left edge of the 443mm panel.
    # Vertical figures are fractions of the panel height with zero at the
    # middle, because almost nothing on this panel is centred: the whole
    # port bank sits low and the lettering fills the strip above it.

    #: The hairline rule that runs the panel's width above the ports, and
    #: turns down at each end to bracket a group label.
    RULE_Z = 0.325
    #: Wordmark and model number, in the strip above that rule.
    NAME_Z = 0.397
    #: Group labels and the even port numbers, between rule and ports.
    UPPER_Z = 0.247
    #: The odd port numbers, in the narrow strip below the ports.
    LOWER_Z = -0.428
    #: Top and bottom edge of every port housing on the panel.
    BLOCK_Z = (0.222, -0.392)
    #: The two rows of openings inside them, top and bottom edges.
    ROW_TOP = (0.211, -0.036)
    ROW_BOT = (-0.139, -0.387)

    #: Twenty four gigabit columns: first centre, pitch, and the extra a
    #: group boundary adds at every sixth column.
    COL0, PITCH, GAP = 0.01689, 0.01393, 0.00442
    #: Left and right edge of each block to the right of the gigabit bank.
    SFP_X = (0.3626, 0.3919)
    QSFP_X = (0.3944, 0.4169)
    MGMT_X = (0.4177, 0.4344)
    #: The reset button, up among the labels rather than beside the ports.
    RESET_X, RESET_Z = 0.4296, 0.392

    def column_x(self, i: int) -> float:
        """Centre of gigabit column `i`, metres from the panel's left edge."""
        return self.COL0 + i * self.PITCH + (i // 6) * self.GAP

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Geometry cannot spell. The first pass stood little grey boxes where
        the words go, and at any distance a row of grey boxes reads as a row
        of grey boxes. This paints the lettering the photograph actually
        shows, at the sizes it shows it, from the same measurements the
        geometry uses, so the ink and the metal cannot drift apart.

        The sheet is 4096 wide and whatever height keeps the panel's own
        proportion, and it is laid over exactly that panel. Both halves of
        that matter. Square pixels stretched to fit make every letter a
        tenth wider than it is tall; an overlay a millimetre taller than
        the panel walks every number off the edge of the port it labels.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width                      # pixels per metre, both axes
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (104, 105, 104, 255)                # the grey MikroTik prints in
        dark = (26, 26, 27, 255)                  # the wordmark, near black

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            """A font whose capitals stand `mm_cap` millimetres tall."""
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def fitted(text: str, mm_wide: float, bold: bool = False):
            """A font at which `text` measures `mm_wide` millimetres across.

            Setting type by cap height guesses at the width and was wrong
            by enough that the wordmark ran through the model number. The
            photograph gives both strings a measured box, so fit them.
            """
            want = mm_wide / 1000 * ppm
            f = font(40, bold)
            got = d.textbbox((0, 0), text, font=f)[2]
            return font(max(8, round(40 * want / max(got, 1))), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- wordmark: MikroTik set it light, then heavy, and so do they.
        #      It measures 3.5mm to 24.4mm on the photograph, and the model
        #      number 26.1mm to 54.0mm, so both are fitted to those boxes.
        f_light = fitted("MikroTik", 20.9)
        f_heavy = font(f_light.size, True)
        x = px(0.0035)
        top = py(self.NAME_Z) - d.textbbox((0, 0), "M", font=f_heavy)[3] / 2
        d.text((x, top), "Mikro", font=f_light, fill=dark)
        x += d.textbbox((0, 0), "Mikro", font=f_light)[2]
        d.text((x, top), "Tik", font=f_heavy, fill=dark)
        model = "CRS354-48G-4S+2Q+"
        centred(model, px(0.0401), py(self.NAME_Z), fitted(model, 27.9))

        # ---- the rule above the ports, and the labels it brackets.
        rule = py(self.RULE_Z)
        drop = 1.9 / 1000 * ppm                   # how far the ends turn down
        f_label, f_num = sized(1.7), sized(1.8)

        def bracket(x0_m: float, x1_m: float, label: str) -> None:
            x0, x1 = px(x0_m), px(x1_m)
            gap = 0.0
            if label:
                b = d.textbbox((0, 0), label, font=f_label)
                gap = (b[2] - b[0]) / 2 + 6 / 1000 * ppm
                centred(label, (x0 + x1) / 2, rule, f_label)
            mid = (x0 + x1) / 2
            d.line([(x0, rule), (mid - gap, rule)], fill=ink, width=2)
            d.line([(mid + gap, rule), (x1, rule)], fill=ink, width=2)
            for e in (x0, x1):
                d.line([(e, rule), (e, rule + drop)], fill=ink, width=2)

        left = self.column_x(0) - self.PITCH / 2
        right = self.column_x(23) + self.PITCH / 2
        bracket(left, right, "GIGABIT ETHERNET")
        bracket(*self.SFP_X, "SFP+")
        bracket(*self.QSFP_X, "40G QSFP+")

        # ---- port numbers: even above the top row, odd below the bottom.
        upper, lower = py(self.UPPER_Z), py(self.LOWER_Z)
        for i in range(24):
            cx = px(self.column_x(i))
            centred(str(i * 2 + 2), cx, upper, f_num)
            centred(str(i * 2 + 1), cx, lower, f_num)

        # ---- the optics, numbered the same way inside their own brackets.
        sfp_l, sfp_r = self.SFP_X
        for i, cx_m in enumerate((sfp_l + (sfp_r - sfp_l) * 0.25, sfp_l + (sfp_r - sfp_l) * 0.75)):
            centred(str(i * 2 + 2), px(cx_m), upper, f_num)
            centred(str(i * 2 + 1), px(cx_m), lower, f_num)
        qsfp_c = sum(self.QSFP_X) / 2
        centred("2", px(qsfp_c), upper, f_num)
        centred("1", px(qsfp_c), lower, f_num)

        mgmt_c = sum(self.MGMT_X) / 2
        centred("CONSOLE", px(mgmt_c), upper, f_label)
        centred("MGMT", px(mgmt_c), lower, f_label)

        # ---- the four callouts around the reset button, each on a leader
        #      that runs in to the lamp it names.
        f_tiny = sized(1.4)
        bx, bz = px(self.RESET_X), py(self.RESET_Z)
        run = 3.8 / 1000 * ppm
        rise = 1.7 / 1000 * ppm
        for label, side, dz in (("PWR 1", -1, -rise), ("FAULT", -1, rise),
                                ("RESET", 1, -rise), ("PWR 2", 1, rise)):
            b = d.textbbox((0, 0), label, font=f_tiny)
            edge = bx + side * (run + 1.1 / 1000 * ppm)
            centred(label, edge + side * (b[2] - b[0]) / 2, bz + dz, f_tiny)
            d.line([(edge, bz + dz), (edge - side * run * 0.55, bz + dz)], fill=ink, width=2)

        tex = save_texture("crs354_silkscreen.png", img)
        rack.materials["mt354_silktex"] = PBRMaterial(
            name="CRS354 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.62,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "mt354_silktex",
                            (0, self.face(rack) - 0.0010, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def housing(self, rack, g: str, z: float, x0: float, x1: float,
                bright: bool = False) -> tuple[float, float]:
        """The shield frame a group of ports is ganged into.

        Returns the frame's centre and width so a caller can hang ports off
        it without recomputing the same two numbers.

        `bright` picks the console housing's near white frame over the mid
        grey the gigabit and optics housings wear. They are visibly two
        different greys in the photograph and painting them the same loses
        the one thing that separates the right hand end of the panel from
        the rest of it.
        """
        y = self.face(rack)
        cx, w = (x0 + x1) / 2, x1 - x0
        top, bottom = self.BLOCK_Z
        cz = z + (top + bottom) / 2 * self.height
        hz = (top - bottom) * self.height
        # A hairline, not a border. At 0.8mm it covered the port numbers
        # printed a millimetre clear of the housing, and CONSOLE with them.
        rack.box(g, "mt354_lip" if bright else "mt354_frame",
                 (cx, y - 0.0008, cz), (w + 0.0007, 0.0008, hz + 0.0006))
        rack.box(g, "mt354_pocket", (cx, y - 0.0004, cz), (w, 0.0009, hz))
        # The frame catches the light along its top edge on every housing.
        rack.box(g, "mt354_lip", (cx, y - 0.0009, cz + hz / 2), (w + 0.0007, 0.0006, 0.0004))
        return cx, w

    def lamp_strip(self, rack, g: str, z: float, x0: float, x1: float) -> float:
        """The pale strip between two rows of cages that the lamps print on.

        Without it the triangles float on the dark housing and read as
        smudges. In the photograph they sit on a raised grey band that runs
        the full width of the housing, and that band is what makes them
        legible from any distance at all.
        """
        y = self.face(rack)
        cz = z + (self.ROW_TOP[1] + self.ROW_BOT[0]) / 2 * self.height
        hz = (self.ROW_TOP[1] - self.ROW_BOT[0]) * self.height
        rack.box(g, "mt354_lampbar", ((x0 + x1) / 2, y - 0.0011, cz), (x1 - x0, 0.0009, hz))
        return cz

    def jack(self, rack, g: str, x: float, z: float, w: float, h: float, top_row: bool) -> None:
        """One gigabit jack as this switch wears it.

        Deep black moulding, a dull nickel shield around the mouth, gold
        contacts set well back, and the two corner lamps on whichever edge
        faces out of the housing. The rows are mirrored, which is why the
        lamp edge is an argument rather than a constant.
        """
        y = self.face(rack)
        # A jack reads as a hole, not a tile. The first pass laid the nickel
        # shield across the whole opening, so 48 of them came out as flat
        # grey rectangles and the throat behind never showed at all. The
        # shield is a thin rim; what fills the middle is darkness.
        rim = 0.0011
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            rack.box(g, "mt354_jack_shield", (x + dx, y - 0.0017, z + dz), (bw, 0.0014, bh))
        # There is no hole in the panel, so the darkness has to be drawn in
        # front of it and then stepped back behind the rim. Putting the
        # throat level with the panel let the white panel win the depth
        # test and 48 jacks came out as empty outlines.
        rack.box(g, "mt354_jack_throat", (x, y - 0.0008, z), (w - rim * 2, 0.0024, h - rim * 2))
        rack.box(g, "mt354_jack_throat", (x, y + 0.0048, z), (w * 0.84, 0.0090, h * 0.84))
        # The plug goes in latch down on the top row and latch up on the
        # bottom, so the notch faces the middle of the panel on both. Draw
        # it the other way round and every jack looks upside down.
        notch = -0.30 if top_row else 0.30
        rack.box(g, "mt354_jack_shield", (x, y - 0.0021, z + h * notch), (w * 0.28, 0.0012, h * 0.20))
        # The tongue the contacts are laid on, and the contacts. Both have
        # to stand proud of the cavity floor and stay behind the rim: level
        # with the cavity they vanish, level with the rim they look printed
        # on. Three tenths of a millimetre of relief is all it takes.
        tongue_z = z - h * notch * 0.42
        rack.box(g, "mt354_jack_tongue", (x, y - 0.0020, tongue_z), (w * 0.66, 0.0006, h * 0.34))
        for i in range(8):
            cx = x - w * 0.28 + i * (w * 0.56 / 7)
            rack.box(g, "mt354_jack_gold", (cx, y - 0.0022, tongue_z),
                     (w * 0.038, 0.0005, h * 0.28))
        # Corner lamps, green one side and amber the other.
        lamp_z = z + h * (0.36 if top_row else -0.36)
        for dx, mat in ((-w * 0.30, "mt354_led_green"), (w * 0.30, "mt354_led_amber")):
            rack.box(g, mat, (x + dx, y - 0.0021, lamp_z), (w * 0.19, 0.0010, h * 0.12))

    def cage(self, rack, g: str, x: float, z: float, w: float, h: float, top_row: bool,
             lanes: int = 1) -> None:
        """An empty SFP+ or QSFP+ opening, drawn as this panel presents it.

        The two rows are inverted castings, so everything inside is
        mirrored: the stamped ridges run along the outer edge of each cage
        and the card edge connector sits against the inner one. Getting
        that backwards makes a stack of cages look printed rather than
        fitted.

        The one thing that stops an empty cage reading as a black rectangle
        is the connector inside it. It is white plastic, it is the
        brightest thing anywhere near the optics, and it is a third of the
        way across the mouth near the inner edge. Leave it out, as the
        first pass did, and four cages come out as four holes.
        """
        y = self.face(rack)
        rack.box(g, "mt354_cage", (x, y - 0.0014, z), (w, 0.0014, h))
        rack.box(g, "mt354_cage_bore", (x, y + 0.0040, z), (w * 0.90, 0.0110, h * 0.84))
        outer = h * (0.34 if top_row else -0.34)
        # Two stamped ridges across the roof of the mouth.
        for k in (0.86, 0.62):
            rack.box(g, "mt354_cage", (x, y - 0.0020, z + outer * k), (w * 0.74, 0.0009, h * 0.045))
        # The card edge connector, one per lane on a QSFP.
        for i in range(lanes):
            ex = x + (i - (lanes - 1) / 2) * (w / max(lanes, 1))
            rack.box(g, "mt354_cage_edge", (ex, y - 0.0021, z - outer * 0.74),
                     (w * (0.34 if lanes == 1 else 0.20), 0.0008, h * 0.075))

    def triangle_lamp(self, rack, g: str, x: float, z: float, s: float, up: bool) -> None:
        """The solid triangle MikroTik uses for a port lamp.

        Three stacked slivers rather than a real triangle: at this size the
        silhouette is what reads, and it costs a fraction of the geometry.
        """
        for i in range(3):
            f = (i + 0.5) / 3
            wide = s * (1 - f) if up else s * f
            dz = s * (f - 0.5) * (1 if up else -1)
            rack.box(g, "mt354_silk", (x, self.face(rack) - 0.0012, z + dz),
                     (max(wide, s * 0.12), 0.0008, s * 0.34))

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

        # Chassis body behind the panel, then the panel itself.
        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "mt354_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0012, bevel=0.0006, steps=6)

        # The lid overhangs the panel and steps four times toward the back.
        for i in range(4):
            step = self.depth * (0.10 + i * 0.22)
            rack.box(g, "mt354_lid", (0, y + 0.012 + step, z + h * 0.47 - i * 0.0004),
                     (w - 0.012 - i * 0.004, self.depth * 0.20, 0.0016))
        # Two rounded slots punched in the lid near the front edge.
        for sx in (-0.070, 0.070):
            rack.box(g, "mt354_pocket", (sx, y + 0.026, z + h * 0.48), (0.020, 0.016, 0.0010))

        # Rack ears: a separate folded piece, lighter, with slotted cutouts.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0195)
            rack.rounded_prism(g, "mt354_ear", (ex, y + 0.0010, z), (0.039, 0.0085, h * 0.98),
                               radius=0.0016, bevel=0.0006, steps=6)
            for dz in (h * 0.27, -h * 0.27):
                rack.rounded_prism(g, "mt354_pocket", (ex, y - 0.0030, z + dz), (0.020, 0.0030, 0.0090),
                                   radius=0.0040, bevel=0.0008, steps=8)

        # ---- the 48 gigabit ports --------------------------------------
        # Four ganged housings of twelve, not one bank of forty eight. The
        # photograph shows a pale shield frame closing off every sixth
        # column, which is the join between one twelve port connector and
        # the next, and it is most of what gives the bank its rhythm.
        jaw = self.PITCH * 0.86
        top_z = (self.ROW_TOP[0] + self.ROW_TOP[1]) / 2
        bot_z = (self.ROW_BOT[0] + self.ROW_BOT[1]) / 2
        jah_t = self.ROW_TOP[0] - self.ROW_TOP[1]
        jah_b = self.ROW_BOT[0] - self.ROW_BOT[1]
        for grp in range(4):
            first, last = grp * 6, grp * 6 + 5
            self.housing(rack, g, z,
                         X(self.column_x(first) - self.PITCH / 2 - 0.0007),
                         X(self.column_x(last) + self.PITCH / 2 + 0.0007))
        for i in range(24):
            cx = X(self.column_x(i))
            self.jack(rack, g, cx, Z(top_z), jaw, jah_t * h, True)
            self.jack(rack, g, cx, Z(bot_z), jaw, jah_b * h, False)

        # ---- SFP+, four cages two by two in one housing ----------------
        sfp_l, sfp_r = self.SFP_X
        self.housing(rack, g, z, X(sfp_l), X(sfp_r))
        lamp_z = self.lamp_strip(rack, g, z, X(sfp_l), X(sfp_r))
        cage_w = (sfp_r - sfp_l) * 0.46
        cage_h = jah_t * h
        for col in range(2):
            cx = X(sfp_l + (sfp_r - sfp_l) * (0.26 + col * 0.48))
            self.cage(rack, g, cx, Z(top_z), cage_w, cage_h, True)
            self.cage(rack, g, cx, Z(bot_z), cage_w, jah_b * h, False)
            # Two lamps a port, so four to a column, alternating which cage
            # they point at. This row of little triangles between the cages
            # is the single most MikroTik thing on the panel.
            for k in range(4):
                lx = cx + (k - 1.5) * (cage_w * 0.25)
                self.triangle_lamp(rack, g, lx, lamp_z, 0.0032, up=(k % 2 == (0 if col else 1)))

        # ---- QSFP+, two cages stacked ----------------------------------
        qs_l, qs_r = self.QSFP_X
        self.housing(rack, g, z, X(qs_l), X(qs_r))
        qlz = self.lamp_strip(rack, g, z, X(qs_l), X(qs_r))
        qcx = X((qs_l + qs_r) / 2)
        qcw = (qs_r - qs_l) * 0.90
        self.cage(rack, g, qcx, Z(top_z), qcw, cage_h, True, lanes=4)
        self.cage(rack, g, qcx, Z(bot_z), qcw, jah_b * h, False, lanes=4)
        # A triangle at each end, and between them two rows of four lane
        # squares, one row for each of the two ports rather than the single
        # row the first pass drew.
        self.triangle_lamp(rack, g, qcx - qcw * 0.40, qlz, 0.0032, up=True)
        self.triangle_lamp(rack, g, qcx + qcw * 0.40, qlz, 0.0032, up=False)
        for row in (1, -1):
            for k in range(4):
                rack.box(g, "mt354_silk", (qcx + (k - 1.5) * 0.0032, y - 0.0013, qlz + row * 0.0009),
                         (0.0021, 0.0008, 0.0007))

        # ---- console above, management below, in their own housing -----
        mg_l, mg_r = self.MGMT_X
        mcx, mcw = self.housing(rack, g, z, X(mg_l), X(mg_r), bright=True)
        self.jack(rack, g, mcx, Z(top_z), mcw * 0.80, jah_t * h, True)
        # Console is the one jack on the panel with no lamps in it.
        rack.box(g, "mt354_jack_shell", (mcx, y - 0.0022, Z(top_z + jah_t * 0.36)),
                 (mcw * 0.62, 0.0008, jah_t * h * 0.16))
        self.jack(rack, g, mcx, Z(bot_z), mcw * 0.80, jah_b * h, False)

        # ---- reset button and the light pipe under the callouts --------
        rack.front_cylinder(g, "mt354_button", (X(self.RESET_X), y - 0.0016, Z(self.RESET_Z)),
                            0.0021, 0.0016, 20)
        rack.rounded_prism(g, "mt354_pipe", (X((mg_l + mg_r) / 2), y - 0.0013, Z(self.RULE_Z)),
                           (mg_r - mg_l + 0.0030, 0.0010, 0.0022), radius=0.0010, bevel=0.0004, steps=8)

        self.silkscreen(rack, z)
