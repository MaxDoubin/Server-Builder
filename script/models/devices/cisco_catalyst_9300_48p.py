"""Cisco Catalyst 9300-48P, drawn from a 2580x1600 photograph of the switch.

The reference is networkoutlet's unwatermarked front shot of a C9300-48P-E,
taken from slightly above so the lid fills the top half of the frame and the
panel runs across the bottom. That angle is a nuisance for vertical
measurement and a gift for everything else: the picture is sharp enough that
a single 8P8C opening is 70 pixels across and its latch keyway can be
measured rather than assumed.

What the photograph shows, left to right:

  A bright zinc plated rack bracket, visibly bluer and shinier than the
  painted chassis, with two long oval slots and a screw through the middle
  into the chassis side. It is a separate piece bolted on, not a fold of
  the front panel, and it is a different metal.

  The whole strip above the ports belongs to the left cluster and to
  ventilation, not to more ports. A shallow raised pocket at the far left
  carries the status LED window, the cisco bridge mark over the CISCO
  wordmark, and the round MODE button with its own little glyph. Then a
  thin stamped groove, the mini USB console, the USB trident, and the USB A
  host port. Only then, above groups two, three and four, does the long
  shallow rounded recess start, split into thirds by two hairline ribs. The
  Catalyst 9300 48 PoE+ badge is a dark plate sitting in the right hand end
  of the fourth recess, which is why it looks let into the panel rather
  than stuck on it.

  Forty eight PoE+ ports as four ganged blocks of twelve, six columns two
  high, in a plated shield that is brighter and warmer than the panel
  around it. The two rows are mirrored and the mirroring runs the opposite
  way to a MikroTik: the latch keyways point away from each other, up on
  the top row and down on the bottom, so the plug latches face out. Each
  keyway is over half the width of the opening, which is wider than it
  looks in any drawing and is the detail that makes a Cisco jack read as a
  Cisco jack.

  A single long groove under the whole port field carries the numbering,
  and Cisco only numbers the ends of each group: 01X, 12X, 13X, 24X, 25X,
  36X, 37X, 48X.

  The uplink bay at the right, 78mm of it, running to the very edge of the
  chassis.

The bay in this particular photograph has a C3850-NM-BLANK in it, which is
what a switch ships with and not what one looks like in a rack. Cisco do
not publish a photograph of a 48P with an eight port module fitted, so the
module face here is measured off the dead on shot of a bare C9300-NM-8X
listed alongside it in PHOTO_SOURCES.md, and composited into the bay whose
opening was measured off the switch. That is the one piece of this model
that comes from two pictures instead of one.

Nothing here is shared with another product. A Cisco jack in a stamped
plated shield does not look like a MikroTik jack in a milled pocket, and
the whole point of this library is that the difference shows.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class C9300_48P(Device):
    slug = "C9300_48P"
    name = "Cisco Catalyst 9300-48P"
    u = 1
    #: Cisco publish 17.5 x 17.5 x 1.75 inches for this chassis.
    width = 0.445
    depth = 0.445
    source = ("https://www.cisco.com/c/en/us/products/collateral/switches/"
              "catalyst-9300-series-switches/nb-06-cat9300-ser-data-sheet-cte-en.html")
    references = [
        Reference("https://cdn.shopify.com/s/files/1/0252/2280/7632/files/C9300-48P-E.jpg",
                  "2580x1600, unwatermarked, near front on, NM-BLANK in the uplink bay"),
        Reference("https://cdn.shopify.com/s/files/1/0989/9318/files/"
                  "cisco-C9300-NM-8X_1b52aeac-bea4-4dc5-9395-9a74b2f4851c.jpg",
                  "the C9300-NM-8X module alone, faceplate dead on, for the uplink bay"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, which is not `front_y`.

        Same 10.5mm slab as every other device here, so its visible face is
        5.3mm proud of the rack front. Measure surface detail from
        `front_y` and all of it ends up inside the panel.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared.

        Every colour below was sampled off the photograph and then white
        balanced, because that picture has a strong blue cast: the lid
        reads 186,207,226 straight off the file and a bare plated lid is
        neutral, so R and G are scaled by 1.215 and 1.092 to bring it to
        grey. The interesting part is what survives the correction. The
        rack bracket stays distinctly blue at 192,219,226, because zinc
        chromate really is blue, and that is the one piece of this chassis
        that is a different metal from the rest.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # The chassis itself: light neutral grey plated steel. Sampled
            # at 218 in the brightest lit region and 200 on the strip above
            # the ports, which is the same paint at two angles, so the
            # albedo sits between them.
            "c93_panel": pbr("C9300 Panel", [193, 194, 192, 255], 0.26, 0.52),
            "c93_lid": pbr("C9300 Lid", [204, 205, 203, 255], 0.34, 0.44),
            # Zinc chromate reads brighter than the paint in the photograph and
            # darker than it at metallic 0.54, because a mirror in this studio
            # mostly reflects the grey backdrop. Pulling the metal down and the
            # value up is what puts the bracket back where the eye expects it.
            "c93_ear": pbr("C9300 Rack Bracket", [222, 230, 234, 255], 0.30, 0.30),
            # The plated shield the twelve jacks are ganged into. It reads
            # slightly warm against the panel, which is what separates the
            # port field from the sheet metal at any distance.
            "c93_shield": pbr("C9300 Port Shield", [192, 190, 185, 255], 0.22, 0.50),
            # Floor of the long recess above each group, and of the number
            # groove below the ports. Both are the panel in shadow.
            "c93_recess": pbr("C9300 Recess", [180, 181, 178, 255], 0.18, 0.60),
            "c93_recess_lip": pbr("C9300 Recess Lip", [214, 215, 213, 255], 0.28, 0.42),
            # The cavity behind a jack mouth. It has to be darker than the
            # shield or 48 openings read as grey tiles rather than holes.
            "c93_throat": pbr("C9300 Jack Throat", [10, 10, 11, 255], 0.04, 0.94),
            "c93_tongue": pbr("C9300 Jack Tongue", [44, 45, 47, 255], 0.08, 0.80),
            "c93_contact": pbr("C9300 Jack Contacts", [146, 120, 66, 255], 0.72, 0.38),
            # The product badge is a dark plate let into the recess, not
            # ink on the panel, so it gets a material rather than a colour
            # in the silkscreen sheet.
            "c93_badge": pbr("C9300 Badge", [54, 55, 57, 255], 0.20, 0.52),
            "c93_button": pbr("C9300 Mode Button", [30, 30, 32, 255], 0.16, 0.48),
            "c93_ledwin": pbr("C9300 LED Window", [38, 40, 43, 255], 0.10, 0.42),
            "c93_usb": pbr("C9300 USB Shell", [188, 189, 186, 255], 0.62, 0.32),
            "c93_usb_tongue": pbr("C9300 USB Tongue", [206, 207, 204, 255], 0.0, 0.62),
            # Uplink module: a separate casting, a shade darker than the
            # chassis and with a duller finish where the thumbscrews chew
            # at it.
            "c93_nm_face": pbr("NM-8X Faceplate", [193, 194, 192, 255], 0.44, 0.42),
            "c93_nm_screw": pbr("NM-8X Thumbscrew", [46, 47, 48, 255], 0.30, 0.44),
            "c93_cage": pbr("NM-8X Cage", [204, 205, 201, 255], 0.60, 0.30),
            "c93_cage_bore": pbr("NM-8X Cage Bore", [11, 11, 12, 255], 0.14, 0.88),
            "c93_cage_edge": pbr("NM-8X Card Edge", [232, 232, 228, 255], 0.0, 0.54),
            "c93_vent": pbr("C9300 Vent", [36, 37, 38, 255], 0.10, 0.86),
        })

    # ------------------------------------------------------------- measured
    #
    # Read off the photograph, calibrated twice over. Horizontally the
    # chassis body measures 2348 pixels between its own edges at the port
    # rows for the published 445mm, which puts a pixel at 0.1895mm; the
    # bracket to bracket span checks out at 482.6mm on the same scale.
    # Vertically the panel is 207 pixels for 44.45mm, but the camera is
    # above the switch so the scale drifts down the panel: the top row of
    # jacks measures 33 pixels tall and the bottom row 30 for openings that
    # are the same size in life. The vertical figures below therefore come
    # from a one dimensional projective fit pinned at the panel edges and
    # forced to make the two rows equal, which lands both at 6.78mm.
    #
    # Horizontal figures are metres from the left edge of the 445mm body.
    # Vertical figures are fractions of panel height with zero at the
    # middle, because nothing on a Cisco panel is centred on it.

    #: First column centre, pitch, and the extra a group boundary adds.
    #: Four ganged blocks of twelve, so a boundary every sixth column.
    COL0, PITCH, GAP = 0.0162, 0.01400, 0.00580
    #: One 8P8C opening and its latch keyway. The keyway is 0.555 of the
    #: opening width, measured, which is far wider than it looks in a
    #: drawing and is most of what makes the silhouette Cisco's.
    JACK_W, KEY_W = 0.01270, 0.00705

    #: The shallow rounded recess above each group of twelve.
    RECESS_Z = (0.407, 0.279)
    #: The raised pocket at the far left holding the LED window, the cisco
    #: mark and the MODE button.
    POCKET_X = (0.0017, 0.0308)
    POCKET_Z = (0.419, 0.271)
    #: Console and host USB, both in the strip above group one.
    SLOT_X = (0.0565, 0.0676)
    MINIUSB_X, MINIUSB_W = 0.0710, 0.0067
    USBA_X, USBA_W = 0.0862, 0.0133

    #: Outer edges of the ganged shield, and the two rows of openings in
    #: it. The keyway lines are where the notch stops, not the opening.
    BLOCK_Z = (0.278, -0.288)
    ROW_TOP = (0.213, 0.061)
    ROW_BOT = (-0.032, -0.184)
    KEY_TOP, KEY_BOT = 0.257, -0.242
    #: The single long groove under the whole port field that carries the
    #: numbering.
    GROOVE_Z = (-0.340, -0.459)

    #: Uplink bay, running to the chassis edge.
    BAY_X = (0.3660, 0.4440)
    #: The product badge, let into the right hand end of the fourth recess.
    BADGE_X = (0.3302, 0.3622)

    def column_x(self, i: int) -> float:
        """Centre of port column `i`, metres from the body's left edge."""
        return self.COL0 + i * self.PITCH + (i // 6) * self.GAP

    def group_span(self, g: int) -> tuple[float, float]:
        """Left and right edge of the ports in group `g`, as metres.

        The recess above a group runs exactly this far, which is how the
        photograph reads: recess and port block are the same width and the
        gap between two groups shows as sheet metal top to bottom.
        """
        return (self.column_x(g * 6) - self.PITCH / 2,
                self.column_x(g * 6 + 5) + self.PITCH / 2)

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Geometry cannot spell, and on this panel that matters more than
        usual: eight port numbers, a wordmark, a bridge logo, a USB trident
        and a badge legend are the whole of the printing, and every one of
        them is smaller than 3mm tall. The sheet keeps the panel's own
        proportion so nothing is stretched, and the positions come from the
        same measured constants the geometry uses.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width                     # pixels per metre, both axes
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (96, 97, 96, 255)                  # etched grey, the panel legend
        dark = (38, 39, 40, 255)                 # the cisco wordmark
        pale = (228, 229, 227, 255)              # reversed out of the badge

        def px(x_m: float) -> float:
            return (x_m - self.width / 2) * ppm + W / 2

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            """A font whose capitals stand `mm_cap` millimetres tall."""
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- the cisco bridge mark and wordmark in the left pocket.
        #      The mark is nine bars of two heights, tall at the ends and
        #      around the middle, which is the shape people recognise from
        #      across a room even when the word under it is unreadable.
        px0, px1 = self.POCKET_X
        mark_cx = px((px0 + px1) / 2 + 0.0035)
        mark_cy = py(self.POCKET_Z[0] - 0.045)
        bar_w = 0.00035 * ppm
        bar_gap = 0.00108 * ppm
        for i in range(9):
            tall = i in (0, 4, 8)
            h = (0.0021 if tall else 0.0013) / 1000 * 1000 * ppm
            x = mark_cx + (i - 4) * bar_gap
            d.rectangle([x - bar_w / 2, mark_cy - h, x + bar_w / 2, mark_cy], fill=dark)
        centred("CISCO", mark_cx, py(self.POCKET_Z[0] - 0.118), sized(1.9, True), dark)

        # ---- MODE button glyph. Cisco print a small arrows in mark under
        #      the button rather than the word, so that is what goes here.
        centred(">•<", px(px1 - 0.0038), py(self.POCKET_Z[1] + 0.020), sized(1.3), dark)

        # ---- USB trident beside the host port. It is drawn rather than
        #      set, because DejaVu has no glyph at U+2442 and PIL happily
        #      renders a missing character as a hollow rectangle, which is
        #      what the first pass put on the panel.
        tx, ty = px(self.USBA_X - self.USBA_W * 0.92), py(0.300)
        r = 0.0009 * ppm
        d.line([(tx, ty + r * 2.2), (tx, ty - r * 2.2)], fill=ink, width=2)
        d.ellipse([tx - r * 0.6, ty + r * 1.6, tx + r * 0.6, ty + r * 2.8], fill=ink)
        d.line([(tx, ty + r * 0.4), (tx - r * 1.6, ty - r * 0.9)], fill=ink, width=2)
        d.line([(tx, ty - r * 0.2), (tx + r * 1.6, ty - r * 1.5)], fill=ink, width=2)
        d.rectangle([tx - r * 2.1, ty - r * 1.5, tx - r * 1.1, ty - r * 0.5], fill=ink)
        d.polygon([(tx + r * 1.1, ty - r * 2.1), (tx + r * 2.1, ty - r * 1.6),
                   (tx + r * 1.2, ty - r * 1.0)], fill=ink)

        # ---- port numbering in the groove. Cisco only mark the ends of
        #      each ganged block, so this is eight labels for forty eight
        #      ports and the numbers sit just inside the group edges.
        f_num = sized(2.3, True)
        gz = py(sum(self.GROOVE_Z) / 2)
        for g in range(4):
            lo, hi = self.group_span(g)
            centred(f"{g * 12 + 1:02d}X", px(lo + 0.0058), gz, f_num)
            centred(f"{g * 12 + 12:02d}X", px(hi - 0.0058), gz, f_num)

        # ---- the badge legend, reversed out of the dark plate.
        bx0, bx1 = self.BADGE_X
        centred("Catalyst 9300 48 PoE+", px((bx0 + bx1) / 2),
                py(sum(self.RECESS_Z) / 2), sized(1.7), pale)

        # ---- uplink module legend, set the way the module photograph has
        #      it: cisco mark, then two lines of type, then the numbers.
        bay0, bay1 = self.BAY_X
        text_cx = px(bay1 - 0.0125)
        centred("NETWORK", text_cx, py(-0.055), sized(1.5), ink)
        centred("MODULE", text_cx, py(-0.148), sized(1.5), ink)
        centred("C9300-NM-8X", px((bay0 + bay1) / 2 - 0.0055), py(-0.400), sized(1.4), ink)
        for i in range(4):
            cx = px(bay0 + 0.0139 + i * 0.0141)
            centred(str(i * 2 + 1), cx - 0.0032 * ppm, py(-0.295), sized(1.5), ink)
            centred(str(i * 2 + 2), cx + 0.0032 * ppm, py(-0.295), sized(1.5), ink)
        centred("TE/G", px(bay1 - 0.0125), py(-0.295), sized(1.4), ink)

        tex = save_texture("c9300_48p_silkscreen.png", img)
        rack.materials["c93_silktex"] = PBRMaterial(
            name="C9300 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.56,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "c93_silktex",
                            (0, self.face(rack) - 0.0021, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def jack(self, rack, g: str, x: float, z: float, top_row: bool) -> None:
        """One PoE+ port as this switch wears it.

        The opening is a plain rectangle with a wide latch keyway on the
        outward facing edge, and the keyway direction is the argument
        because the two rows are mirrored. Cisco mirror them the opposite
        way to MikroTik: the notches point away from the middle of the
        panel here, so plug latches face out and a hand can get at them.

        The rim is drawn as four thin bars rather than one plate, because a
        jack has to read as a hole. Lay the plated shield across the whole
        opening, as the first pass of the reference model did, and forty
        eight jacks come out as forty eight grey tiles.
        """
        y = self.face(rack)
        h = self.height
        w = self.JACK_W
        top, bot = (self.ROW_TOP if top_row else self.ROW_BOT)
        oh = (top - bot) * h
        cz = z + (top + bot) / 2 * h
        sign = 1 if top_row else -1
        key_h = abs((self.KEY_TOP if top_row else self.KEY_BOT) - (top if top_row else bot)) * h

        # The cavity, drawn in front of the panel and then stepped back
        # behind the rim. Level with the panel the panel wins the depth
        # test and every jack comes out as an empty outline.
        rack.box(g, "c93_throat", (x, y - 0.0007, cz), (w, 0.0022, oh))
        rack.box(g, "c93_throat", (x, y + 0.0050, cz), (w * 0.86, 0.0100, oh * 0.86))
        # The keyway, a second cavity stepping out of the outward edge.
        key_cz = cz + sign * (oh / 2 + key_h / 2)
        rack.box(g, "c93_throat", (x, y - 0.0007, key_cz), (self.KEY_W, 0.0022, key_h))
        rack.box(g, "c93_throat", (x, y + 0.0040, key_cz), (self.KEY_W * 0.80, 0.0080, key_h))

        # Shield rim: three bars round the plain edges plus two stubs that
        # close the corners either side of the keyway.
        rim = 0.0009
        rack.box(g, "c93_shield", (x, y - 0.0017, cz - sign * (oh / 2 - rim / 2)),
                 (w + rim, 0.0016, rim))
        for sx in (-1, 1):
            rack.box(g, "c93_shield", (x + sx * (w / 2 - rim / 2), y - 0.0017, cz),
                     (rim, 0.0016, oh))
            stub = (w - self.KEY_W) / 2
            rack.box(g, "c93_shield",
                     (x + sx * (w - stub) / 2, y - 0.0017, cz + sign * (oh / 2 - rim / 2)),
                     (stub, 0.0016, rim))

        # Contacts on the wall opposite the keyway, on a tongue that has to
        # stand proud of the cavity floor and stay behind the rim. Level
        # with the floor they vanish; level with the rim they look printed.
        tongue_z = cz - sign * oh * 0.30
        rack.box(g, "c93_tongue", (x, y - 0.0019, tongue_z), (w * 0.62, 0.0006, oh * 0.20))
        for i in range(8):
            cx = x - w * 0.26 + i * (w * 0.52 / 7)
            rack.box(g, "c93_contact", (cx, y - 0.0021, tongue_z),
                     (w * 0.028, 0.0005, oh * 0.15))

    def port_block(self, rack, g: str, z: float, x0: float, x1: float) -> None:
        """The ganged plated shield twelve ports are pressed into.

        Four of these across the panel, not one bank of forty eight. The
        seams between them are visible in the photograph and they are most
        of what gives the field its rhythm.
        """
        y = self.face(rack)
        h = self.height
        cx, w = (x0 + x1) / 2, x1 - x0
        top, bot = self.BLOCK_Z
        cz = z + (top + bot) / 2 * h
        hz = (top - bot) * h
        # A hairline surround, not a border. Anything heavier here covers
        # the group numbers printed a millimetre clear of the block.
        rack.box(g, "c93_recess", (cx, y - 0.0004, cz), (w + 0.0010, 0.0008, hz + 0.0008))
        rack.rounded_prism(g, "c93_shield", (cx, y - 0.0011, cz), (w, 0.0014, hz),
                           radius=0.0010, bevel=0.0004, steps=6)
        # The web between the two rows catches the light on every block.
        mid = z + (self.ROW_TOP[1] + self.ROW_BOT[0]) / 2 * h
        rack.box(g, "c93_shield", (cx, y - 0.0016, mid),
                 (w - 0.0016, 0.0008, (self.ROW_TOP[1] - self.ROW_BOT[0]) * h * 0.5))

    def recess(self, rack, g: str, z: float, x0: float, x1: float) -> None:
        """The long shallow rounded groove above a group of twelve.

        Two hairline ribs split it into thirds. Those ribs are in the
        photograph on every group and leaving them out turns a stamped
        feature into a painted stripe.
        """
        y = self.face(rack)
        h = self.height
        top, bot = self.RECESS_Z
        cz = z + (top + bot) / 2 * h
        hz = (top - bot) * h
        cx, w = (x0 + x1) / 2, x1 - x0
        rack.rounded_prism(g, "c93_recess", (cx, y - 0.0002, cz), (w, 0.0010, hz),
                           radius=hz * 0.48, bevel=0.0004, steps=8)
        # The shadow the upper lip throws is what makes it read as depth
        # rather than as a stripe. The first pass laid a wide soft band
        # here and the recess came out looking like a painted pill; it is
        # a hard dark line under the lip and a bright one off the floor.
        rack.box(g, "c93_vent", (cx, y - 0.0006, cz + hz * 0.41), (w - 0.0026, 0.0006, hz * 0.13))
        for k in (1, 2):
            rack.box(g, "c93_recess_lip", (x0 + w * k / 3, y - 0.0007, cz), (0.0009, 0.0007, hz))

    def sfp_cage(self, rack, g: str, x: float, z: float, w: float, h: float,
                 top_row: bool) -> None:
        """One empty SFP+ opening on the uplink module.

        The two rows are inverted castings, so the stamped roof ridges run
        along the outer edge of each cage and the white card edge connector
        sits against the inner one. That connector is the brightest thing
        anywhere near the optics and it is the only reason an empty cage
        does not read as a black rectangle.
        """
        y = self.face(rack)
        # The bore is drawn in front of the faceplate and stepped back
        # behind the rim, the same way the copper jacks are. Drawing the
        # plate first and the bore behind it, which is what the first pass
        # did, buried all eight cages and left four rows of white dashes.
        rack.box(g, "c93_cage_bore", (x, y - 0.0016, z), (w, 0.0016, h))
        rack.box(g, "c93_cage_bore", (x, y + 0.0034, z), (w * 0.90, 0.0100, h * 0.84))
        rim = 0.0006
        for dx, dz, bw, bh in ((0, h / 2 - rim / 2, w + rim, rim),
                               (0, -h / 2 + rim / 2, w + rim, rim),
                               (-w / 2 - rim / 2, 0, rim, h + rim * 2),
                               (w / 2 + rim / 2, 0, rim, h + rim * 2)):
            rack.box(g, "c93_cage", (x + dx, y - 0.0022, z + dz), (bw, 0.0014, bh))
        outer = h * (0.34 if top_row else -0.34)
        rack.box(g, "c93_cage", (x, y - 0.0024, z + outer * 0.84), (w * 0.66, 0.0008, h * 0.030))
        rack.box(g, "c93_cage_edge", (x, y - 0.0024, z - outer * 0.66), (w * 0.30, 0.0008, h * 0.055))

    def uplink_module(self, rack, g: str, z: float) -> None:
        """A C9300-NM-8X sitting in the bay.

        The bay opening is measured off the switch photograph at 366mm to
        444mm from the left edge; the module face is measured off the dead
        on shot of a bare NM-8X, where the plate is 720 pixels wide for
        those 78mm and the cages come out at 13.6mm across on a 14.1mm
        pitch, the same pitch as the copper ports two feet to the left.

        The module photograph is taken slightly from above, so its plate
        measures 2.38 wide to tall against the 1.90 the bay actually is.
        Vertical features are therefore scaled back by that ratio rather
        than read straight off, which is the same correction the panel
        itself needed.
        """
        y = self.face(rack)
        h = self.height
        bay0, bay1 = self.BAY_X

        def X(from_left: float) -> float:
            return -self.width / 2 + from_left

        cx = X((bay0 + bay1) / 2)
        bw = bay1 - bay0
        # The bay is a hole in the chassis and the module a plate in it, so
        # there is a seam all the way round and the plate stands proud.
        rack.box(g, "c93_vent", (cx, y - 0.0002, z), (bw + 0.0012, 0.0008, h * 0.95))
        rack.rounded_prism(g, "c93_nm_face", (cx, y - 0.0012, z), (bw - 0.0010, 0.0018, h * 0.92),
                           radius=0.0010, bevel=0.0005, steps=6)

        # A row of small square vent holes across the top of the plate.
        for i in range(17):
            vx = X(bay0 + 0.0075 + i * 0.0037)
            rack.box(g, "c93_vent", (vx, y - 0.0017, z + h * 0.330), (0.0021, 0.0008, 0.0032))

        # Eight cages, two rows of four, on the same 14.1mm pitch as the
        # copper. The bottom row is the inverted casting.
        cage_w, cage_h = 0.01360, 0.00900
        for i in range(4):
            sx = X(bay0 + 0.0139 + i * 0.0141)
            rack.sfp = None  # nothing to carry between cages
            self.sfp_cage(rack, g, sx, z + h * 0.126, cage_w, cage_h, True)
            self.sfp_cage(rack, g, sx, z - h * 0.126, cage_w, cage_h, False)

        # One captive thumbscrew at the right of the plate, knurled head.
        sx = X(bay1 - 0.0125)
        rack.front_cylinder(g, "c93_nm_screw", (sx, y - 0.0022, z + h * 0.300), 0.0032, 0.0022, 20)
        rack.front_cylinder(g, "c93_vent", (sx, y - 0.0034, z + h * 0.300), 0.0011, 0.0006, 12)

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
        rack.rounded_prism(g, "c93_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0010, bevel=0.0005, steps=6)
        # The lid overhangs the panel and turns down at the front into a
        # rolled edge, which is the bright line along the top of the
        # photograph and the only relief on the upper half of the chassis.
        rack.box(g, "c93_lid", (0, y + 0.014 + self.depth * 0.45, z + h * 0.47),
                 (w - 0.006, self.depth * 0.90, 0.0022))
        rack.box(g, "c93_lid", (0, y + 0.0060, z + h * 0.485), (w - 0.004, 0.0110, 0.0014))

        # Rack brackets: a separate zinc piece bolted to the chassis side,
        # with two long oval slots and a screw through the middle.
        for sx in (-1, 1):
            # 482.6mm across the brackets against a 445mm body puts each
            # one 18.8mm proud, which is also what the photograph measures
            # between the chassis edge and the outside of the plate.
            ex = sx * (w / 2 + 0.0094)
            rack.rounded_prism(g, "c93_ear", (ex, y + 0.0014, z), (0.0188, 0.0075, h * 0.96),
                               radius=0.0020, bevel=0.0006, steps=6)
            for dz in (h * 0.27, -h * 0.27):
                rack.rounded_prism(g, "c93_recess", (ex, y - 0.0026, z + dz),
                                   (0.0112, 0.0026, 0.0062), radius=0.0030, bevel=0.0005, steps=8)
            rack.front_cylinder(g, "c93_ear", (ex, y - 0.0030, z), 0.0024, 0.0024, 16)

        # ---- the strip above the ports ---------------------------------
        # Left cluster first, in its own raised pocket.
        pk0, pk1 = self.POCKET_X
        pz0, pz1 = self.POCKET_Z
        rack.rounded_prism(g, "c93_recess_lip",
                           (X((pk0 + pk1) / 2), y - 0.0009, Z((pz0 + pz1) / 2)),
                           (pk1 - pk0, 0.0010, (pz0 - pz1) * h), radius=0.0012, bevel=0.0004, steps=6)
        # Status LED window at the left of the pocket, then the MODE button
        # at its right. The wordmark between them is ink, not geometry.
        rack.box(g, "c93_ledwin", (X(pk0 + 0.0028), y - 0.0016, Z((pz0 + pz1) / 2 + 0.030)),
                 (0.0034, 0.0008, 0.0032))
        rack.front_cylinder(g, "c93_button", (X(pk1 - 0.0038), y - 0.0017,
                                              Z((pz0 + pz1) / 2 + 0.040)), 0.0026, 0.0016, 20)

        # The thin stamped groove, then the two USB ports.
        sl0, sl1 = self.SLOT_X
        rack.rounded_prism(g, "c93_recess", (X((sl0 + sl1) / 2), y - 0.0003, Z(0.288)),
                           (sl1 - sl0, 0.0008, 0.0018), radius=0.0008, bevel=0.0003, steps=6)
        # Mini USB console: a small trapezoid shell with a dark slot.
        rack.box(g, "c93_usb", (X(self.MINIUSB_X), y - 0.0012, Z(0.300)),
                 (self.MINIUSB_W, 0.0010, 0.0038))
        rack.box(g, "c93_throat", (X(self.MINIUSB_X), y - 0.0016, Z(0.300)),
                 (self.MINIUSB_W - 0.0016, 0.0008, 0.0022))
        # USB A host port, tongue high in the mouth as Cisco fit them.
        rack.box(g, "c93_usb", (X(self.USBA_X), y - 0.0012, Z(0.300)),
                 (self.USBA_W, 0.0010, 0.0058))
        rack.box(g, "c93_throat", (X(self.USBA_X), y - 0.0016, Z(0.300)),
                 (self.USBA_W - 0.0018, 0.0008, 0.0042))
        rack.box(g, "c93_usb_tongue", (X(self.USBA_X), y - 0.0019, Z(0.306)),
                 (self.USBA_W - 0.0053, 0.0006, 0.0011))

        # Recesses above groups two, three and four. Group one has the
        # cluster instead, which is why the strip does not repeat.
        for grp in (1, 2, 3):
            self.recess(rack, g, z, *(X(v) for v in self.group_span(grp)))

        # The badge sits in the right hand end of the fourth recess.
        bx0, bx1 = self.BADGE_X
        rack.rounded_prism(g, "c93_badge", (X((bx0 + bx1) / 2), y - 0.0008,
                                            Z(sum(self.RECESS_Z) / 2)),
                           (bx1 - bx0, 0.0010, (self.RECESS_Z[0] - self.RECESS_Z[1]) * h * 0.86),
                           radius=0.0012, bevel=0.0004, steps=6)

        # ---- forty eight ports -----------------------------------------
        for grp in range(4):
            lo, hi = self.group_span(grp)
            self.port_block(rack, g, z, X(lo - 0.0007), X(hi + 0.0007))
        for i in range(24):
            cx = X(self.column_x(i))
            self.jack(rack, g, cx, z, True)
            self.jack(rack, g, cx, z, False)

        # ---- the numbering groove under the whole field ----------------
        gl = X(self.group_span(0)[0] - 0.0010)
        gr = X(self.group_span(3)[1] + 0.0010)
        gz0, gz1 = self.GROOVE_Z
        gh = (gz0 - gz1) * h
        rack.rounded_prism(g, "c93_recess", ((gl + gr) / 2, y - 0.0002, Z((gz0 + gz1) / 2)),
                           (gr - gl, 0.0009, gh), radius=gh * 0.48, bevel=0.0004, steps=8)
        rack.box(g, "c93_vent", ((gl + gr) / 2, y - 0.0006, Z(gz0 - 0.009)),
                 (gr - gl - 0.0030, 0.0005, gh * 0.10))

        self.uplink_module(rack, g, z)
        self.silkscreen(rack, z)
