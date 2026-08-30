"""Cisco Nexus 9336C-FX2, drawn from a near front on photograph of the unit.

This is the hardest of the four to measure and the easiest to describe. It
is thirty six QSFP28 cages in two rows of eighteen and almost nothing else:
a narrow cluster of round status lenses at the far left, a column of round
vent holes at the far right, a row of slots underneath, and that is the
whole panel. No copper, no console, no badge.

The photograph is 1040 pixels for a 442mm panel, which is a quarter of the
resolution the two Catalysts were modelled at, so it had to be worked
harder. The camera sits slightly to the right of centre, and the cage pitch
grows from 44.5 pixels at the left of the frame to 50.0 at the right
because of it. Reading the pitch off any one place would have been wrong
everywhere else, so the eighteen measured centres were fitted with a one
dimensional projective transform, which lands them all to within half a
pixel, and every horizontal figure below comes out of the inverse of that
fit rather than off a ruler.

The fit also gives the scale a second, independent check, which is the part
worth trusting. In fitted units the panel is 19.0 cage pitches wide and a
cage aperture is 0.78 of a pitch. Divide the published 442mm by 19.0 and
the pitch is 23.3mm; multiply by 0.78 and the aperture is 18.2mm. A QSFP28
module is 18.35mm across its shell. The photograph and the MSA agree to
within a tenth of a millimetre, which means the projective fit is right and
so is everything derived from it.

What the photograph shows in each of the eighteen cage columns: a pale
housing standing proud of the panel, a cage top and bottom with two stamped
ridges across the roof of each mouth, and between them a white band
carrying a triangle pointing up at the top port, a triangle pointing down
at the bottom one, and eight small dark lane lenses in two rows of four
between the triangles. The port numbers run above, odd for the top row with
an up arrow, even for the bottom row with a down arrow.

Nothing here is shared with another product. A Nexus cage in its raised
white housing, with its own LED band between the rows, does not look like a
Catalyst cage stamped straight into the sheet metal.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class N9336C_FX2(Device):
    slug = "NEXUS_9336C"
    name = "Cisco Nexus 9336C-FX2"
    u = 1
    #: 1RU, 17.4 inches across the body. The projective fit of the port
    #: field agrees with this to a tenth of a millimetre, see below.
    width = 0.442
    #: A 9300-FX2 is a deep box. This one is not measurable off a front
    #: elevation, so it is the datasheet figure and nothing on the visible
    #: face depends on it.
    depth = 0.559
    source = "https://www.cisco.com/c/en/us/support/switches/nexus-9336c-fx2-switch/model.html"
    references = [
        Reference("https://cdn.shopify.com/s/files/1/0989/9318/files/"
                  "cisco-N9K-C9336C-FX2_b5653a4c-b325-458c-a3ad-077662034ae0.jpg",
                  "1040x1040, near front on port side, 36 QSFP28 in two rows of 18"),
        Reference("https://cdn.shopify.com/s/files/1/0252/2280/7632/products/"
                  "Cisco_Nexus_N9K-C9336C-FX2.jpg",
                  "650x650 unwatermarked three quarter, cross check on the right hand end"),
    ]

    def face(self, rack) -> float:
        """The visible plane of the panel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared.

        The photograph is neutral, R equals G equals B everywhere, so these
        need no white balance and can be read straight off. The panel
        samples 177, the cage housings 176 and the lid 191. That the panel
        and the housings measure the same is the useful part: the housings
        look brighter in the picture only because they stand proud and
        catch the light, so the difference here is a couple of points of
        albedo and a lot of geometry, not a different grey.

        A Nexus is a visibly darker, cooler grey than a Catalyst. That
        difference is real and is the thing that would be lost if these two
        panels were painted from one shared table.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            "nx_panel": pbr("Nexus Panel", [184, 185, 184, 255], 0.24, 0.52),
            "nx_lid": pbr("Nexus Lid", [196, 197, 196, 255], 0.30, 0.46),
            "nx_ear": pbr("Nexus Rack Bracket", [214, 222, 226, 255], 0.30, 0.30),
            # The raised cage housing, and the white band between the two
            # cages of a pair that the lane lenses print on.
            "nx_housing": pbr("Nexus Cage Housing", [198, 199, 197, 255], 0.22, 0.46),
            "nx_ledband": pbr("Nexus LED Band", [228, 229, 226, 255], 0.10, 0.44),
            "nx_cage": pbr("Nexus Cage Rim", [206, 207, 204, 255], 0.48, 0.32),
            "nx_bore": pbr("Nexus Cage Bore", [16, 16, 17, 255], 0.12, 0.90),
            # Lane lenses, dark and unlit. Thirty six ports times four lanes
            # is a hundred and forty four of these and they are the texture
            # of the whole panel, so they get a material rather than ink.
            "nx_lens": pbr("Nexus Lane Lens", [48, 49, 51, 255], 0.10, 0.44),
            "nx_status": pbr("Nexus Status Lens", [58, 60, 62, 255], 0.08, 0.36),
            "nx_vent": pbr("Nexus Vent", [34, 35, 36, 255], 0.08, 0.88),
            "nx_stud": pbr("Nexus Ground Stud", [178, 180, 182, 255], 0.72, 0.26),
        })

    # ------------------------------------------------------------- measured
    #
    # Every horizontal figure is the inverse of the projective fit described
    # in the module docstring, expressed in metres from the left edge of the
    # 442mm body. The fit puts the panel's left edge 1.186 pitches left of
    # column zero and its right edge 17.81 pitches right of it, so the panel
    # is 19.0 pitches wide and the pitch is 23.26mm.
    #
    # Vertical figures are fractions of panel height with zero at the
    # middle, measured at the left of the frame where the panel is 74 pixels
    # tall for 44.45mm. The camera is a little above the switch, so the
    # panel foreshortens to about 0.87 of true vertically; that affects the
    # ratio between horizontal and vertical sizes, not the fractions, which
    # is why they are recorded as fractions.

    QSFP_X0, QSFP_PITCH = 0.02760, 0.02326
    #: Housing and aperture. The housings very nearly abut, at 0.92 of the
    #: pitch, and the aperture is the 18.2mm a QSFP28 shell needs.
    HOUSING_W = 0.02140
    CAGE_W, CAGE_H = 0.01820, 0.01020

    #: Rows and bands, top to bottom.
    NUM_Z = 0.432
    HOUSING_Z = (0.405, -0.324)
    CAGE_TOP_Z = (0.378, 0.149)
    LED_Z = (0.095, -0.027)
    CAGE_BOT_Z = (-0.054, -0.284)
    SLOT_Z = (-0.378, -0.459)

    #: The left cluster is one pitch wide and holds everything that is not
    #: an optic: the cisco mark, seven round status lenses in two columns,
    #: a grounding stud and two lines of type.
    LOGO_X = 0.0055
    LED_A_X, LED_B_X = 0.0042, 0.0125
    LED_A_Z = (0.162, 0.054, -0.068)
    LED_B_Z = (0.338, 0.230, 0.135, 0.027)
    STUD_X, STUD_Z = 0.0130, -0.142
    #: A column of round holes closes the panel off past the last optic.
    HOLES_X = 0.4360

    def column_x(self, i: int) -> float:
        """Centre of QSFP column `i`, metres from the body's left edge."""
        return self.QSFP_X0 + i * self.QSFP_PITCH

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Thirty six port numbers, each paired with an arrow saying which of
        the two rows it belongs to, plus the cisco mark and two lines of
        product type at the far left. The arrows matter more than they look:
        the numbering alternates odd over even down each column rather than
        running along a row, so without them the panel does not say which
        cage is port 23 and which is 24.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (72, 73, 73, 255)
        dark = (32, 33, 34, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- cisco mark and the two lines of product type.
        mark_cx, mark_cy = px(self.LOGO_X + 0.0045), py(0.446)
        bar_w, bar_gap = 0.00028 * ppm, 0.00090 * ppm
        for i in range(9):
            hb = (0.0017 if i in (0, 4, 8) else 0.0010) * ppm
            x = mark_cx + (i - 4) * bar_gap
            d.rectangle([x - bar_w / 2, mark_cy - hb, x + bar_w / 2, mark_cy], fill=dark)
        centred("CISCO", mark_cx, py(0.365), sized(1.5, True), dark)
        centred("Cisco Nexus", px(0.0082), py(-0.284), sized(1.1))
        centred("N9K-C9336C-FX2", px(0.0082), py(-0.398), sized(1.1))

        # ---- port numbers. Odd on the left of each column with an up
        #      arrow, even on the right with a down arrow, which is exactly
        #      how the panel prints them.
        f_num, f_arrow = sized(1.5, True), sized(1.4)
        nz = py(self.NUM_Z)
        for i in range(18):
            cx = px(self.column_x(i))
            centred(str(i * 2 + 1), cx - 0.0070 * ppm, nz, f_num)
            centred("▲", cx - 0.0028 * ppm, nz, f_arrow)
            centred("▼", cx + 0.0028 * ppm, nz, f_arrow)
            centred(str(i * 2 + 2), cx + 0.0072 * ppm, nz, f_num)

        # ---- the two big triangles inside each LED band, which point at
        #      the cage they belong to rather than labelling it.
        lz = py(sum(self.LED_Z) / 2)
        t = 0.00105 * ppm
        for i in range(18):
            cx = px(self.column_x(i))
            for side, up in ((-1, True), (1, False)):
                ax = cx + side * self.HOUSING_W * 0.36 * ppm
                pts = ([(ax - t, lz + t), (ax + t, lz + t), (ax, lz - t)] if up
                       else [(ax - t, lz - t), (ax + t, lz - t), (ax, lz + t)])
                d.polygon(pts, fill=dark)

        tex = save_texture("nexus_9336c_fx2_silkscreen.png", img)
        rack.materials["nx_silktex"] = PBRMaterial(
            name="Nexus Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.56,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "nx_silktex",
                            (0, self.face(rack) - 0.0034, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def cage(self, rack, g: str, x: float, z: float, top_row: bool) -> None:
        """One QSFP28 mouth.

        The bore goes in front of the housing and steps back behind a thin
        bright rim, so the opening reads as a hole. Two stamped ridges run
        across the roof of the mouth, and because the two rows are inverted
        castings the roof is the outer edge on both: up on the top cage and
        down on the bottom.
        """
        y = self.face(rack)
        w, hh = self.CAGE_W, self.CAGE_H
        rack.box(g, "nx_bore", (x, y - 0.0022, z), (w, 0.0016, hh))
        rack.box(g, "nx_bore", (x, y + 0.0040, z), (w * 0.92, 0.0104, hh * 0.86))
        rim = 0.0007
        for dx, dz, bw, bh in ((0, hh / 2 + rim / 2, w + rim * 2, rim),
                               (0, -hh / 2 - rim / 2, w + rim * 2, rim),
                               (-w / 2 - rim / 2, 0, rim, hh + rim * 2),
                               (w / 2 + rim / 2, 0, rim, hh + rim * 2)):
            rack.box(g, "nx_cage", (x + dx, y - 0.0028, z + dz), (bw, 0.0014, bh))
        outer = hh * (0.32 if top_row else -0.32)
        for k in (0.92, 0.56):
            rack.box(g, "nx_cage", (x, y - 0.0030, z + outer * k), (w * 0.86, 0.0007, hh * 0.045))

    def led_band(self, rack, g: str, x: float, z: float) -> None:
        """The white strip between the two cages of a column.

        Eight lane lenses in two rows of four, the upper four belonging to
        the cage above and the lower four to the cage below. The triangles
        either side of them are ink; the lenses are not, because at four
        per port there are a hundred and forty four of them and they are
        what gives this panel its texture from any distance.
        """
        y = self.face(rack)
        h = self.height
        z0, z1 = self.LED_Z
        cz = z + (z0 + z1) / 2 * h
        hz = (z0 - z1) * h
        rack.rounded_prism(g, "nx_ledband", (x, y - 0.0020, cz), (self.HOUSING_W * 0.94, 0.0012, hz),
                           radius=0.0006, bevel=0.0003, steps=5)
        for row, dz in ((0, hz * 0.20), (1, -hz * 0.20)):
            for k in range(4):
                lx = x + (k - 1.5) * (self.CAGE_W * 0.20)
                rack.box(g, "nx_lens", (lx, y - 0.0027, cz + dz), (0.0018, 0.0007, 0.0011))

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
        rack.rounded_prism(g, "nx_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0010, bevel=0.0005, steps=6)
        rack.box(g, "nx_lid", (0, y + 0.014 + self.depth * 0.45, z + h * 0.47),
                 (w - 0.006, self.depth * 0.90, 0.0022))
        # A band of fine diagonal louvres runs along the front of the lid,
        # right on the top edge of the panel. Face on it is a hairline, and
        # from three quarters it is the only thing on the top of the box.
        for i in range(56):
            lx = -w / 2 + 0.010 + i * ((w - 0.020) / 55)
            rack.box(g, "nx_vent", (lx, y + 0.0080, z + h * 0.478), (0.0022, 0.0090, 0.0016))

        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0103)
            rack.rounded_prism(g, "nx_ear", (ex, y + 0.0014, z), (0.0206, 0.0075, h * 0.96),
                               radius=0.0020, bevel=0.0006, steps=6)
            for dz in (h * 0.27, -h * 0.27):
                rack.rounded_prism(g, "nx_vent", (ex, y - 0.0026, z + dz),
                                   (0.0120, 0.0026, 0.0062), radius=0.0030, bevel=0.0005, steps=8)
            rack.front_cylinder(g, "nx_ear", (ex, y - 0.0030, z), 0.0024, 0.0024, 16)

        # ---- left cluster ----------------------------------------------
        # Seven round status lenses in two staggered columns. Cisco set
        # them as lenses with hairline legends beside them, and at 1.5mm
        # across a lens is geometry while the legend is not worth printing.
        for lx, zs in ((self.LED_A_X, self.LED_A_Z), (self.LED_B_X, self.LED_B_Z)):
            for lz in zs:
                rack.front_cylinder(g, "nx_vent", (X(lx), y - 0.0012, Z(lz)), 0.0013, 0.0010, 14)
                rack.front_cylinder(g, "nx_status", (X(lx), y - 0.0019, Z(lz)), 0.0009, 0.0008, 14)
        # The grounding stud, which is the one bright piece of hardware on
        # an otherwise flat panel.
        rack.front_cylinder(g, "nx_housing", (X(self.STUD_X), y - 0.0016, Z(self.STUD_Z)),
                            0.0024, 0.0014, 18)
        rack.front_cylinder(g, "nx_stud", (X(self.STUD_X), y - 0.0026, Z(self.STUD_Z)),
                            0.0015, 0.0016, 16)

        # ---- eighteen cage columns --------------------------------------
        hz0, hz1 = self.HOUSING_Z
        for i in range(18):
            cx = X(self.column_x(i))
            rack.rounded_prism(g, "nx_housing", (cx, y - 0.0011, Z((hz0 + hz1) / 2)),
                               (self.HOUSING_W, 0.0016, (hz0 - hz1) * h),
                               radius=0.0009, bevel=0.0004, steps=6)
            self.cage(rack, g, cx, Z(sum(self.CAGE_TOP_Z) / 2), True)
            self.cage(rack, g, cx, Z(sum(self.CAGE_BOT_Z) / 2), False)
            self.led_band(rack, g, cx, z)

        # ---- the column of round vent holes past the last optic ---------
        for k in range(9):
            rack.front_cylinder(g, "nx_vent", (X(self.HOLES_X), y - 0.0006,
                                               Z(0.360 - k * 0.090)), 0.0013, 0.0010, 12)

        # ---- the slot row under the whole port field --------------------
        # Two staggered rows of small rectangular perforations, which is
        # the only ventilation on the port face itself.
        sz0, sz1 = self.SLOT_Z
        pitch = 0.0058
        for row, frac in enumerate((sz0 - 0.010, sz1 + 0.010)):
            start = X(0.030) + (pitch / 2 if row else 0.0)
            n = int((0.400 - (pitch / 2 if row else 0.0)) / pitch)
            for k in range(n):
                rack.box(g, "nx_vent", (start + k * pitch, y - 0.0006, Z(frac)),
                         (0.0032, 0.0009, 0.0018))

        self.silkscreen(rack, z)
