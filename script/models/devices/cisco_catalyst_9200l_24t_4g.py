"""Cisco Catalyst 9200L-24T-4G, drawn from a 2000x2000 studio elevation.

Two references, and they do different jobs. The networkdevices studio image
is 2000 pixels square and very nearly orthographic, which is what every
position below comes off. The networkoutlet photograph of a real unit is
what settles finish and legends, and it settles one of them decisively:
the studio image is captioned 10G under each optic and the actual 24T-4G
prints a bare G, because the L in 9200L means the four uplinks are fixed
gigabit rather than a module. Modelling the caption in the render would
have put the wrong speed on the panel.

This is a Catalyst and it shares its RJ45 gangs with the 9300 two rack
units up, which the measurements confirm to a tenth of a millimetre: the
same 14.1mm column pitch, the same 12.7mm opening, the same 2mm latch
keyway. Everything else about the panel is different, and the differences
are the reason this is a separate module rather than a parameter:

  The strip above the ports is hexagonal honeycomb, not the 9300's shallow
  stamped recesses. One row of it runs from the USB ports across both
  port blocks, and a second, doubled band sits above the optics at the
  right hand end.

  The product badge is a white label with dark type, where the 9300 wears
  a dark plate with the type knocked out of it. Two switches from the same
  family, opposite way round.

  The left cluster is bigger: an LED window, the cisco mark, a rounded
  square MODE button rather than a round one, then eight little LED
  legends in a four by two grid, a mini USB console and two USB A hosts.

  Twenty four ports as two blocks of twelve rather than four, and then
  four SFP cages in a single row with dust plugs still in them.

  Under the ports, a row of small triangles alternating up and down, one
  per port, pointing at the row each belongs to. Cisco print the group
  numbers 1X, 12X, 13X, 24X in the same strip.

Nothing here is shared with another product, including with the 9300. Two
pieces of code that happen to agree about a 14.1mm pitch is honest; one
piece of code asserting that two panels are the same is not.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class C9200L_24T_4G(Device):
    slug = "C9200L_24T_4G"
    name = "Cisco Catalyst 9200L-24T-4G"
    u = 1
    #: Cisco publish 44.5 x 33.0 x 4.45 cm for the fixed uplink 9200L.
    width = 0.445
    depth = 0.330
    source = ("https://www.cisco.com/c/en/us/products/collateral/switches/"
              "catalyst-9200-series-switches/nb-06-cat9200-ser-data-sheet-cte-en.html")
    references = [
        Reference("https://cdn.shopify.com/s/files/1/2388/1557/files/"
                  "c9200l-24t-4g_1_9bc60167-6d12-4955-94f8-0adbaf551db3.png",
                  "2000x2000 studio elevation, near orthographic, every position off this"),
        Reference("https://cdn.shopify.com/s/files/1/0252/2280/7632/files/C9200L-24T-4G-E.jpg",
                  "2580x1600 real unit, three quarter, gives finish and the G optic legends"),
    ]

    def face(self, rack) -> float:
        """The visible plane of the panel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared.

        The 9200L is a lighter, whiter grey than the 9300, and both are
        lighter than the Nexus. That is not an impression: the studio
        elevation reads a flat 218 to 222 across the blank panel with no
        colour cast at all, where the 9300 photograph white balances to
        about 205 and the Nexus to about 185. The albedo here allows for
        the studio adding a little, and the roughness is high because this
        is matte painted sheet: at anything glossier the environment lays
        a band of specular across the middle of the panel and the whole
        switch reads as chrome.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            "c92_panel": pbr("C9200L Panel", [206, 207, 205, 255], 0.22, 0.54),
            "c92_lid": pbr("C9200L Lid", [212, 213, 211, 255], 0.28, 0.48),
            "c92_ear": pbr("C9200L Rack Bracket", [220, 228, 232, 255], 0.30, 0.30),
            # The ganged shield is a near white plate with the holes punched
            # in it, brighter than the panel it sits in.
            "c92_shield": pbr("C9200L Port Shield", [219, 219, 216, 255], 0.20, 0.46),
            # The dark rim the shield is let into, which is what separates
            # a block of twelve from the sheet metal around it.
            "c92_shield_rim": pbr("C9200L Shield Rim", [66, 67, 66, 255], 0.16, 0.66),
            "c92_throat": pbr("C9200L Jack Throat", [12, 12, 13, 255], 0.04, 0.94),
            "c92_lip": pbr("C9200L Jack Lip", [166, 166, 163, 255], 0.24, 0.52),
            "c92_contact": pbr("C9200L Jack Contacts", [148, 122, 68, 255], 0.72, 0.38),
            # Honeycomb: the holes are not black because the perforated
            # sheet is thin and there is a chassis floor a few millimetres
            # behind it, but they are much darker than anything else here.
            "c92_hex": pbr("C9200L Vent Hole", [42, 43, 44, 255], 0.08, 0.88),
            "c92_hex_web": pbr("C9200L Vent Web", [196, 197, 194, 255], 0.24, 0.50),
            # A white adhesive label with dark type, the opposite way round
            # to the 9300's badge.
            "c92_badge": pbr("C9200L Badge", [238, 238, 235, 255], 0.0, 0.44),
            "c92_button": pbr("C9200L Mode Button", [176, 177, 174, 255], 0.26, 0.44),
            "c92_ledwin": pbr("C9200L LED Window", [44, 45, 47, 255], 0.10, 0.44),
            "c92_usb": pbr("C9200L USB Shell", [198, 199, 196, 255], 0.44, 0.36),
            "c92_usb_tongue": pbr("C9200L USB Tongue", [212, 213, 210, 255], 0.0, 0.62),
            # SFP: a bright chromed cage in a light housing, with a black
            # dust plug still fitted, which is how every one of these ships
            # and how the photograph shows all four.
            "c92_cage": pbr("C9200L SFP Cage", [224, 225, 222, 255], 0.62, 0.24),
            "c92_cage_bore": pbr("C9200L SFP Bore", [14, 14, 15, 255], 0.12, 0.90),
            "c92_plug": pbr("C9200L Dust Plug", [30, 30, 32, 255], 0.0, 0.86),
        })

    # ------------------------------------------------------------- measured
    #
    # Off the studio elevation. Its front face measures 1822 pixels for the
    # published 445mm body, which puts a pixel at 0.2431mm, and the RJ45
    # gang confirms it: 58 pixel column pitch is 14.10mm and a 52 pixel
    # opening is 12.64mm, the same parts the 9300 carries. Vertically the
    # face is about 222 pixels for 44.45mm. The image is yawed a few
    # degrees, so the panel is 227 pixels tall at the left end and 218 at
    # the right; features were therefore measured against the panel edge
    # local to them rather than against one global top and bottom.
    #
    # Horizontal figures are metres from the left edge of the 445mm body.
    # Vertical figures are fractions of panel height with zero at the
    # middle.

    #: Twelve columns in two ganged blocks of six.
    COL0, PITCH, GAP = 0.1838, 0.01410, 0.00583
    JACK_W, KEY_W = 0.01264, 0.00705

    #: Left cluster, all of it in the strip above the ports.
    POCKET_X = (0.0015, 0.0725)
    LEDWIN_X, LEDWIN_W = 0.0076, 0.0039
    MODE_X, MODE_W = 0.0265, 0.0049
    #: Eight LED legends in a four by two grid, so four columns.
    GLYPH_X = (0.0348, 0.0423, 0.0496, 0.0569)
    MINIUSB_X, MINIUSB_W = 0.0673, 0.0068
    USBA_X = (0.0823, 0.1021)
    USBA_W = 0.0125

    #: Honeycomb. One row across the middle of the panel, then a doubled
    #: band above the optics.
    VENT_A = (0.1108, 0.3140)
    VENT_B = (0.3649, 0.4378)
    HEX_PITCH = 0.00390
    VENT_Z = (0.464, 0.344)
    VENT_B_Z = (0.470, 0.190)
    #: The white product label, which takes the place of a vent segment.
    BADGE_X = (0.3160, 0.3557)

    #: Ganged shield outline, the two rows of openings, and where each
    #: latch keyway stops.
    BLOCK_Z = (0.262, -0.296)
    ROW_TOP = (0.192, 0.041)
    ROW_BOT = (-0.055, -0.206)
    KEY_TOP, KEY_BOT = 0.237, -0.251

    #: Four fixed gigabit optics, one row, well spread.
    SFP_X0, SFP_PITCH = 0.3745, 0.01670
    SFP_W, SFP_H = 0.01460, 0.00960
    SFP_Z = -0.150
    #: The strip under everything that carries the triangles and numbers.
    STRIP_Z = -0.400

    def column_x(self, i: int) -> float:
        """Centre of port column `i`, metres from the body's left edge."""
        return self.COL0 + i * self.PITCH + (i // 6) * self.GAP

    def group_span(self, g: int) -> tuple[float, float]:
        return (self.column_x(g * 6) - self.PITCH / 2,
                self.column_x(g * 6 + 5) + self.PITCH / 2)

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        The triangles are the interesting part. There is one per port,
        alternating point down and point up along the strip under the port
        field, and they are the only thing on the panel that tells you
        which of the two rows a number belongs to. They are ink, not
        geometry: at 1.6mm across, a triangle drawn out of boxes reads as a
        smudge, and this panel has twenty four of them.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (78, 79, 78, 255)
        dark = (34, 35, 36, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- cisco bridge mark and wordmark.
        mark_cx = px(0.0165)
        mark_cy = py(0.372)
        bar_w, bar_gap = 0.00034 * ppm, 0.00104 * ppm
        for i in range(9):
            h = (0.0021 if i in (0, 4, 8) else 0.0013) * ppm
            x = mark_cx + (i - 4) * bar_gap
            d.rectangle([x - bar_w / 2, mark_cy - h, x + bar_w / 2, mark_cy], fill=dark)
        centred("CISCO", mark_cx, py(0.283), sized(1.8, True), dark)
        centred(">|<", px(self.MODE_X), py(0.268), sized(1.3), dark)

        # ---- the eight LED legends. Cisco set these as pictograms rather
        #      than words, and at this size a pictogram is the only thing
        #      that survives, so they are drawn as the glyphs the panel
        #      actually carries rather than as SYST, SPEED and the rest.
        f_gl = sized(1.9, True)
        for i, gx in enumerate(self.GLYPH_X):
            centred("S≶◑⋔"[i], px(gx), py(0.372), f_gl, dark)
            centred("•✓≡⊡"[i], px(gx), py(0.268), f_gl, dark)

        # ---- USB tridents, one beside each host port.
        for ux in self.USBA_X:
            centred("⑂", px(ux - self.USBA_W * 0.82), py(0.352), sized(1.8), ink)

        # ---- the badge, dark type on the white label.
        bx0, bx1 = self.BADGE_X
        centred("Catalyst 9200L 24T 4G", px((bx0 + bx1) / 2),
                py(sum(self.VENT_Z) / 2), sized(1.9, True), dark)

        # ---- the triangle strip. Two per column, the left one pointing
        #      down at the strip and the right one up at the ports, which
        #      is the alternation the elevation shows.
        sz = py(self.STRIP_Z)
        t = 0.00082 * ppm
        for i in range(12):
            for k, up in ((-1, False), (1, True)):
                if (i, k) in ((5, 1), (6, -1)):
                    continue
                cx = px(self.column_x(i) + k * self.PITCH * 0.24)
                pts = ([(cx - t, sz - t), (cx + t, sz - t), (cx, sz + t)] if not up
                       else [(cx - t, sz + t), (cx + t, sz + t), (cx, sz - t)])
                d.polygon(pts, fill=ink)
        # Group numbers. The pair at the seam straddles the gap between the
        # two blocks rather than sitting clear of it, which is 5.8mm wide
        # and would not hold both labels: 12X hangs off the end of the
        # first block and 13X off the start of the second.
        f_num = sized(2.0, True)
        seam = (self.group_span(0)[1] + self.group_span(1)[0]) / 2
        centred("1X", px(self.group_span(0)[0] - 0.0030), sz, f_num)
        centred("12X", px(seam - 0.0044), sz, f_num)
        centred("13X", px(seam + 0.0044), sz, f_num)
        centred("24X", px(self.group_span(1)[1] + 0.0034), sz, f_num)

        # ---- optic legends. A real 24T-4G prints G, not 10G, whatever the
        #      studio render's caption says.
        for i in range(4):
            cx = px(self.SFP_X0 + i * self.SFP_PITCH)
            centred("G", cx - 0.0052 * ppm, sz, sized(1.8, True))
            centred(str(i + 1), cx + 0.0052 * ppm, sz, sized(1.8, True))

        tex = save_texture("c9200l_24t_4g_silkscreen.png", img)
        rack.materials["c92_silktex"] = PBRMaterial(
            name="C9200L Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.56,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "c92_silktex",
                            (0, self.face(rack) - 0.0021, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def hex_hole(self, rack, g: str, x: float, z: float, w: float, hh: float) -> None:
        """One cell of the honeycomb.

        Cisco's hexagons here lie on their sides: flat top and bottom,
        points out to left and right. The first pass drew them the other
        way up and small, and a band of ninety of them came out looking
        like a dotted line. Two crossed boxes give the right silhouette
        for a sixth of what a hexagonal prism would cost, and at this size
        the silhouette is the whole of it.
        """
        y = self.face(rack)
        for fw, fh in ((1.00, 0.46), (0.80, 0.76), (0.52, 1.00)):
            rack.box(g, "c92_hex", (x, y - 0.0007, z), (w * fw, 0.0010, hh * fh))

    def honeycomb(self, rack, g: str, z: float, x0: float, x1: float,
                  z0: float, z1: float, rows: int) -> None:
        """A band of honeycomb, with the ribs that break it into segments.

        The elevation shows the band interrupted every 100mm or so by a
        rib of solid panel, which is the sheet metal that keeps a long
        perforated strip stiff. Draw the band unbroken and it reads as a
        printed texture.
        """
        y = self.face(rack)
        h = self.height
        cz = z + (z0 + z1) / 2 * h
        hz = (z0 - z1) * h
        cx, w = (x0 + x1) / 2, x1 - x0
        rack.box(g, "c92_hex_web", (cx, y - 0.0003, cz), (w, 0.0008, hz))
        p = self.HEX_PITCH
        n = max(1, int(w / p))
        cell_h = hz / rows
        for r in range(rows):
            rz = cz + (r - (rows - 1) / 2) * cell_h
            offset = (p / 2) if r % 2 else 0.0
            for i in range(n):
                hx = x0 + p * 0.5 + i * p + offset
                if hx + p * 0.5 > x1:
                    continue
                self.hex_hole(rack, g, hx, rz, p * 0.88, cell_h * 0.86)
        for k in range(1, max(1, round(w / 0.100))):
            rack.box(g, "c92_hex_web", (x0 + w * k / max(1, round(w / 0.100)), y - 0.0009, cz),
                     (0.0018, 0.0008, hz))

    def jack(self, rack, g: str, x: float, z: float, top_row: bool) -> None:
        """One gigabit port as the 9200L wears it.

        The shield here is a continuous near white plate with the holes
        punched through it, so unlike the 9300 there is no rim to draw per
        jack: the plate behind is the rim, and what has to be drawn is the
        darkness in front of it. Only the bright lip along the inner edge
        of the mouth is added back, because that catch of light is what
        stops a punched hole looking like a sticker.
        """
        y = self.face(rack)
        h = self.height
        w = self.JACK_W
        top, bot = (self.ROW_TOP if top_row else self.ROW_BOT)
        oh = (top - bot) * h
        cz = z + (top + bot) / 2 * h
        sign = 1 if top_row else -1
        key_h = abs((self.KEY_TOP if top_row else self.KEY_BOT) - (top if top_row else bot)) * h

        rack.box(g, "c92_throat", (x, y - 0.0018, cz), (w, 0.0016, oh))
        rack.box(g, "c92_throat", (x, y + 0.0040, cz), (w * 0.88, 0.0100, oh * 0.86))
        key_cz = cz + sign * (oh / 2 + key_h / 2)
        rack.box(g, "c92_throat", (x, y - 0.0018, key_cz), (self.KEY_W, 0.0016, key_h))
        rack.box(g, "c92_throat", (x, y + 0.0034, key_cz), (self.KEY_W * 0.82, 0.0080, key_h))

        # Lip along the inner edge, and the contacts on the wall opposite
        # the keyway, standing a fraction proud of the cavity floor.
        rack.box(g, "c92_lip", (x, y - 0.0029, cz - sign * (oh / 2 - 0.0003)),
                 (w * 0.88, 0.0006, 0.0005))
        tongue_z = cz - sign * oh * 0.25
        for i in range(8):
            cx = x - w * 0.25 + i * (w * 0.50 / 7)
            rack.box(g, "c92_contact", (cx, y - 0.0029, tongue_z),
                     (w * 0.027, 0.0006, oh * 0.15))

    def port_block(self, rack, g: str, z: float, x0: float, x1: float) -> None:
        """Twelve ports in one shield, let into a dark rimmed opening."""
        y = self.face(rack)
        h = self.height
        cx, w = (x0 + x1) / 2, x1 - x0
        top, bot = self.BLOCK_Z
        cz = z + (top + bot) / 2 * h
        hz = (top - bot) * h
        rack.rounded_prism(g, "c92_shield_rim", (cx, y - 0.0006, cz),
                           (w + 0.0022, 0.0012, hz + 0.0020), radius=0.0012, bevel=0.0004, steps=6)
        rack.rounded_prism(g, "c92_shield", (cx, y - 0.0014, cz), (w, 0.0014, hz),
                           radius=0.0008, bevel=0.0004, steps=6)

    def sfp(self, rack, g: str, x: float, z: float) -> None:
        """One fixed gigabit cage with its dust plug still in it.

        All four are plugged in the photograph, which is how these ship
        and how most of them stay, so the black moulding with its little
        pull tab under the mouth is part of the product's face and not an
        accessory. An empty bright cage here would be wrong twice over.
        """
        y = self.face(rack)
        w, hh = self.SFP_W, self.SFP_H
        rack.box(g, "c92_cage_bore", (x, y - 0.0018, z), (w, 0.0016, hh))
        rack.box(g, "c92_cage_bore", (x, y + 0.0040, z), (w * 0.88, 0.0100, hh * 0.82))
        rim = 0.0007
        for dx, dz, bw, bh in ((0, hh / 2 + rim / 2, w + rim * 2, rim),
                               (0, -hh / 2 - rim / 2, w + rim * 2, rim),
                               (-w / 2 - rim / 2, 0, rim, hh + rim * 2),
                               (w / 2 + rim / 2, 0, rim, hh + rim * 2)):
            rack.box(g, "c92_cage", (x + dx, y - 0.0024, z + dz), (bw, 0.0014, bh))
        # Dust plug: a flat face set a little back, with a moulded chevron
        # and the pull tab that hangs below the cage mouth.
        rack.box(g, "c92_plug", (x, y - 0.0021, z), (w - 0.0016, 0.0008, hh - 0.0016))
        for k, dz in ((0.30, -hh * 0.10), (0.18, -hh * 0.20)):
            rack.box(g, "c92_cage", (x, y - 0.0024, z + dz), (w * k, 0.0005, 0.0005))
        rack.box(g, "c92_plug", (x, y - 0.0026, z - hh * 0.60), (w * 0.42, 0.0012, 0.0022))

    # --------------------------------------------------------------- build

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
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "c92_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0010, bevel=0.0005, steps=6)
        rack.box(g, "c92_lid", (0, y + 0.014 + self.depth * 0.45, z + h * 0.47),
                 (w - 0.006, self.depth * 0.90, 0.0022))
        rack.box(g, "c92_lid", (0, y + 0.0060, z + h * 0.485), (w - 0.004, 0.0110, 0.0014))

        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0094)
            rack.rounded_prism(g, "c92_ear", (ex, y + 0.0014, z), (0.0188, 0.0075, h * 0.96),
                               radius=0.0020, bevel=0.0006, steps=6)
            for dz in (h * 0.27, -h * 0.27):
                rack.rounded_prism(g, "c92_hex", (ex, y - 0.0026, z + dz),
                                   (0.0112, 0.0026, 0.0062), radius=0.0030, bevel=0.0005, steps=8)
            rack.front_cylinder(g, "c92_ear", (ex, y - 0.0030, z), 0.0024, 0.0024, 16)

        # ---- left cluster ----------------------------------------------
        pk0, pk1 = self.POCKET_X
        rack.rounded_prism(g, "c92_shield", (X((pk0 + pk1) / 2), y - 0.0008, Z(0.340)),
                           (pk1 - pk0, 0.0010, h * 0.205), radius=0.0012, bevel=0.0004, steps=6)
        rack.box(g, "c92_ledwin", (X(self.LEDWIN_X), y - 0.0015, Z(0.343)),
                 (self.LEDWIN_W, 0.0008, 0.0037))
        # The MODE button on a 9200L is a rounded square pad, not the round
        # button the 9300 uses. It is the quickest way to tell the two left
        # clusters apart in a photograph.
        rack.rounded_prism(g, "c92_button", (X(self.MODE_X), y - 0.0017, Z(0.343)),
                           (self.MODE_W, 0.0016, 0.0044), radius=0.0009, bevel=0.0004, steps=6)
        for gx in self.GLYPH_X:
            for dz in (0.372, 0.268):
                rack.box(g, "c92_ledwin", (X(gx), y - 0.0013, Z(dz) - 0.0016),
                         (0.0022, 0.0006, 0.0009))

        rack.box(g, "c92_usb", (X(self.MINIUSB_X), y - 0.0012, Z(0.352)),
                 (self.MINIUSB_W, 0.0010, 0.0040))
        rack.box(g, "c92_throat", (X(self.MINIUSB_X), y - 0.0017, Z(0.352)),
                 (self.MINIUSB_W - 0.0016, 0.0008, 0.0024))
        for ux in self.USBA_X:
            rack.box(g, "c92_usb", (X(ux), y - 0.0012, Z(0.352)), (self.USBA_W, 0.0010, 0.0058))
            rack.box(g, "c92_throat", (X(ux), y - 0.0017, Z(0.352)),
                     (self.USBA_W - 0.0018, 0.0008, 0.0042))
            rack.box(g, "c92_usb_tongue", (X(ux), y - 0.0020, Z(0.358)),
                     (self.USBA_W - 0.0052, 0.0006, 0.0011))

        # ---- honeycomb, then the badge that interrupts it ---------------
        self.honeycomb(rack, g, z, X(self.VENT_A[0]), X(self.VENT_A[1]),
                       self.VENT_Z[0], self.VENT_Z[1], rows=1)
        self.honeycomb(rack, g, z, X(self.VENT_B[0]), X(self.VENT_B[1]),
                       self.VENT_B_Z[0], self.VENT_B_Z[1], rows=2)
        bx0, bx1 = self.BADGE_X
        rack.rounded_prism(g, "c92_badge", (X((bx0 + bx1) / 2), y - 0.0008,
                                            Z(sum(self.VENT_Z) / 2)),
                           (bx1 - bx0, 0.0010, (self.VENT_Z[0] - self.VENT_Z[1]) * h * 0.94),
                           radius=0.0009, bevel=0.0004, steps=6)

        # ---- twenty four ports -----------------------------------------
        for grp in range(2):
            lo, hi = self.group_span(grp)
            self.port_block(rack, g, z, X(lo - 0.0008), X(hi + 0.0008))
        for i in range(12):
            cx = X(self.column_x(i))
            self.jack(rack, g, cx, z, True)
            self.jack(rack, g, cx, z, False)

        # ---- four fixed optics in one housing ---------------------------
        hz0, hz1 = self.SFP_Z + 0.150, self.SFP_Z - 0.150
        left = X(self.SFP_X0 - self.SFP_PITCH * 0.60)
        right = X(self.SFP_X0 + self.SFP_PITCH * 3.60)
        rack.rounded_prism(g, "c92_shield", ((left + right) / 2, y - 0.0010, Z(self.SFP_Z)),
                           (right - left, 0.0012, (hz0 - hz1) * h * 0.86),
                           radius=0.0010, bevel=0.0004, steps=6)
        for i in range(4):
            self.sfp(rack, g, X(self.SFP_X0 + i * self.SFP_PITCH), Z(self.SFP_Z))

        self.silkscreen(rack, z)
