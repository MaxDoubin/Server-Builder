"""Juniper EX4400-48P, drawn from Juniper's own front elevation render.

Juniper's hardware guide carries a photoreal front view of every EX4400
variant, and they are orthographic: the -48P render measures 1298 by 128
pixels for a chassis Juniper publish as 440.9 by 43.7mm, which is 10.14
against 10.09. Two decimal places of agreement means nothing in the image
is foreshortened and every feature on it is a real measurement.

What the render shows, working left to right:

  The whole faceplate is a mid grey plate perforated with a hexagonal mesh
  above and below the port field, and that perforation is most of what the
  switch looks like. Only the top left corner is left solid, to carry the
  juniper wordmark with "driven by Mist AI" set under it.

  48 RJ45 in two rows of 24, ganged into four blocks of twelve. Each block
  is one pale zinc casting, near white against the grey plate, with the
  twelve mouths punched through it and a broad rail between the rows. The
  mouths are the full 8P8C silhouette rather than plain rectangles: a
  12.2mm body, a 8.5mm shoulder above it and a 4.8mm latch slot above that,
  and the bottom row is the same casting inverted, so its slot points down.

  Under the ports, the numbers in Juniper's amber, two to a column, the
  even one carrying an up triangle for the top row and the odd one a down
  triangle for the bottom.

  A dark blue grey badge strip at the top right with EX4400 in white and
  PoE++ in amber, a USB-C console mouth, eight status lamps in two columns
  of four labelled SYS ALM MST CLD down the left and SPD DX EN POE down the
  right, and a round LED mode button with a pale blue list glyph.

  Under that, the extension module bay: a recessed panel held by two large
  captive thumbscrews, with a four cage SFP+ block between them, the cages
  numbered 0 to 3 and a row of small lamps along the top of the block.

Nothing here is shared with another product. A Juniper zinc jack casting
with the mouths punched straight through it does not look like a MikroTik
jack sunk in a milled pocket, and the hexagonal perforation is not a
detail any other vendor in this library has.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import Device, Reference


class EX4400_48P(Device):
    slug = "EX4400_48P"
    name = "Juniper EX4400-48P"
    u = 1
    #: Juniper publish 17.36 x 1.72 x 15.51 in for the EX4400 chassis.
    width = 0.4409
    depth = 0.394
    source = "https://www.juniper.net/documentation/us/en/hardware/ex4400/"
    references = [
        Reference("https://www.juniper.net/documentation/us/en/hardware/ex4400/images/g022647.png",
                  "front view of an EX4400-48P, orthographic, 1500x199"),
        Reference("https://www.juniper.net/documentation/us/en/hardware/ex4400/images/g022556.png",
                  "labelled front panel line drawing with the full port numbering"),
        Reference("https://www.juniper.net/documentation/us/en/hardware/ex4400/images/g022646.png",
                  "rear view, for the chassis proportions and the fan module colour"),
    ]

    def face(self, rack) -> float:
        """The visible plane of the faceplate, 5.3mm proud of the rack front.

        Same 10.5mm slab the other panels in this library are built from,
        so surface detail measured from `front_y` would sit inside it.
        """
        return rack.front_y - 0.0053

    # -------------------------------------------------------------- measured
    #
    # Calibration: the chassis spans x 82..1379 and y 20..147 in g022647.
    # 1298 pixels for Juniper's published 440.9mm puts a pixel at 0.33975mm,
    # and the 128 pixel height then reads 43.49mm against the published
    # 43.7, so the render is square and both axes can be measured directly.
    #
    # Horizontal figures are metres from the left edge of the faceplate.
    # Vertical figures are fractions of panel height with zero at the middle.

    #: Four ganged jack blocks. Left edge of the first, and the pitch from
    #: one block to the next, both measured off the pale casting itself.
    BLOCK_X0, BLOCK_PITCH, BLOCK_W = 0.00578, 0.08913, 0.08664
    #: Top and bottom of a casting: y 49 and y 121.
    BLOCK_Z = (0.2695, -0.2930)
    #: First jack centre and the pitch inside a block, from the mouths.
    JACK_X0, JACK_PITCH = 0.01410, 0.013964

    #: The three widths that make up one 8P8C mouth: body, shoulder, slot.
    MOUTH_W = (0.01223, 0.00850, 0.00476)
    #: and the three heights, as fractions of the panel.
    MOUTH_H = (0.1719, 0.0391, 0.0234)
    #: Centre of the body on each row. The bottom row is the same casting
    #: turned over, so both rows sit symmetrically about z = -0.0078 and
    #: the slot points away from the rail on each.
    ROW_Z = (0.1211, -0.1367)

    #: Hexagonal perforation: bands above and below the ports, and the
    #: 3.16mm hole pitch measured across fourteen holes on row 33.
    VENT_TOP = (0.02718, 0.35674, 0.4727, 0.3086)
    VENT_BOTTOM = (0.00442, 0.35606, -0.3789, -0.4805)
    VENT_PITCH = 0.00316
    #: The solid corner the wordmark is printed on, left of the top band.
    LOGO_X, LOGO_Z = 0.0035, 0.4180

    #: Port numbers, in the strip between the castings and the lower vent.
    NUMBER_Z = -0.3400

    #: The dark badge strip: x 1145..1373, y 24..64.
    BADGE = (0.38912, 0.43862, 0.4648, 0.1523)
    BADGE_X0 = 0.36116
    #: USB-C console mouth, centre and size.
    USBC_X, USBC_Z, USBC = 0.39350, 0.3125, (0.00985, 0.00374)
    #: Status lamps: two columns of four, 2.4mm across.
    LAMP_X = (0.40561, 0.409355)
    LAMP_Z = (0.4102, 0.3406, 0.2742, 0.2055)
    LAMP_D = 0.00238
    #: The LED mode button.
    MODE_X, MODE_Z, MODE_D = 0.42297, 0.3008, 0.00544

    #: The extension module bay, and the two captive thumbscrews holding it.
    BAY = (0.36320, 0.44090, 0.1289, -0.4727)
    SCREW_X = (0.36795, 0.43285)
    SCREW_Z, SCREW_D = -0.0352, 0.00544
    #: Four SFP+ cages: first centre, pitch, and the mouth size.
    CAGE_X0, CAGE_PITCH = 0.37899, 0.014270
    CAGE_Z, CAGE = -0.2070, (0.01359, 0.1875)

    def block_x(self, i: int) -> float:
        """Left edge of jack block `i`, metres from the faceplate's left."""
        return self.BLOCK_X0 + i * self.BLOCK_PITCH

    def jack_x(self, i: int) -> float:
        """Centre of jack column `i` of 24, metres from the left edge."""
        return (self.JACK_X0 + (i % 6) * self.JACK_PITCH
                + (i // 6) * self.BLOCK_PITCH)

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Sampled off the render: the plate is 114 at the lit left end
            # and 108 across the middle, so 111. It is powder coat, not
            # anodised, and it took roughness 0.62 before the render stopped
            # putting a sheen down the middle of a matte switch.
            "ex44_plate": pbr("EX4400 Faceplate", [111, 111, 112, 255], 0.18, 0.62),
            "ex44_plate_dark": pbr("EX4400 Plate Shadow", [88, 88, 89, 255], 0.16, 0.66),
            # The jack castings measure 204,205,208. That is 80 percent of
            # white, and painting them the mid grey a shielded jack usually
            # wears loses the one thing that reads across a room: this
            # switch has four bright slabs on a dark plate.
            "ex44_cast": pbr("EX4400 Jack Casting", [204, 205, 208, 255], 0.46, 0.42),
            "ex44_cast_edge": pbr("EX4400 Casting Edge", [166, 167, 170, 255], 0.44, 0.46),
            # The mouth, and the cavity behind it, which has to be darker
            # than the mouth wall or the opening reads as a flat tile.
            "ex44_mouth": pbr("EX4400 Jack Mouth", [26, 26, 27, 255], 0.08, 0.78),
            "ex44_throat": pbr("EX4400 Jack Throat", [10, 10, 11, 255], 0.04, 0.92),
            "ex44_contact": pbr("EX4400 Jack Contacts", [92, 86, 64, 255], 0.62, 0.44),
            # The badge strip is not black. It is a blue grey, 80,87,95,
            # and it is the only cool colour anywhere on the chassis.
            "ex44_badge": pbr("EX4400 Badge Strip", [80, 87, 95, 255], 0.20, 0.54),
            "ex44_bay": pbr("EX4400 Module Bay", [87, 87, 87, 255], 0.20, 0.60),
            "ex44_bay_lip": pbr("EX4400 Bay Lip", [63, 63, 64, 255], 0.18, 0.64),
            "ex44_cage": pbr("EX4400 SFP Cage", [150, 151, 153, 255], 0.52, 0.40),
            "ex44_cage_bore": pbr("EX4400 Cage Bore", [9, 9, 10, 255], 0.14, 0.90),
            "ex44_screw": pbr("EX4400 Thumbscrew", [201, 202, 204, 255], 0.74, 0.28),
            "ex44_usbc": pbr("EX4400 USB-C", [22, 22, 23, 255], 0.16, 0.72),
            # Unlit status lamps on a stock render are white lenses, not
            # coloured ones. Giving them a green tint here would state a
            # link state the photograph does not show.
            "ex44_lamp": pbr("EX4400 Status Lamp", [244, 245, 246, 255], 0.0, 0.34),
            "ex44_mode": pbr("EX4400 Mode Button", [113, 116, 122, 255], 0.12, 0.50),
            "ex44_mode_ink": pbr("EX4400 Mode Glyph", [118, 150, 167, 255], 0.0, 0.42),
        })

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every printed marking, plus the hexagonal perforation.

        The perforation belongs here rather than in geometry for the same
        reason the lettering does. There are close to two thousand holes on
        this faceplate at a 3.16mm pitch; as boxes they would cost more
        triangles than the rest of the rack put together and still not look
        like holes, because what makes a perforated panel read is the mesh
        of thin lands between the holes, and a mesh is exactly what a paint
        layer is good at. The holes are painted at the tone the render
        averages to, 60 of 255, over the 111 plate.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        amber = (189, 148, 54, 255)               # sampled off the numbers
        white = (238, 239, 240, 255)
        hole = (58, 58, 60, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            """A font whose capitals stand `mm_cap` millimetres tall."""
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=white):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]),
                   text, font=f, fill=fill)

        # ---- the two perforated bands ----------------------------------
        # Hexagons on a staggered grid, flat side up, which is how Juniper
        # punch them: the rows interlock rather than sitting in columns.
        # 2.2mm holes on a 3.16mm pitch, rows interlocked. The first pass
        # took the radius as half the pitch and then halved it again, which
        # drew 1.5mm dots on a square grid: a polka dot switch, not a
        # perforated one.
        hex_r = 0.00125 * ppm
        step_x = self.VENT_PITCH * ppm
        step_y = step_x * math.sqrt(3) / 2
        for x0, x1, zt, zb in (self.VENT_TOP, self.VENT_BOTTOM):
            top, bottom = py(zt), py(zb)
            row = 0
            y = top + step_y / 2
            while y < bottom:
                off = (row % 2) * step_x / 2
                x = px(x0) + off + step_x / 2
                while x < px(x1):
                    d.regular_polygon((x, y, hex_r), 6, rotation=90, fill=hole)
                    x += step_x
                y += step_y
                row += 1

        # ---- the wordmark, on the solid corner the perforation leaves ---
        # Juniper set the mark in lower case with the four square glyph
        # beside it and the Mist line under it at about a third the size.
        f_mark = sized(3.4)
        d.text((px(self.LOGO_X), py(self.LOGO_Z + 0.055)), "juniper", font=f_mark, fill=white)
        mark_w = d.textbbox((0, 0), "juniper", font=f_mark)[2]
        sq = 1.5 / 1000 * ppm
        for cx, cy in ((0.0, 0.0), (1.15, -1.15), (1.15, 1.15), (2.3, 0.0)):
            d.rectangle([px(self.LOGO_X) + mark_w + 0.9 * sq + cx * sq,
                         py(self.LOGO_Z) + cy * sq - sq * 0.2,
                         px(self.LOGO_X) + mark_w + 0.9 * sq + (cx + 1) * sq,
                         py(self.LOGO_Z) + (cy + 1) * sq - sq * 0.2], fill=white)
        d.text((px(self.LOGO_X + 0.0008), py(self.LOGO_Z - 0.115)), "driven by Mist AI",
               font=sized(1.5), fill=(206, 207, 209, 255))

        # ---- port numbers, two to a column, with their direction marks --
        f_num = sized(1.7, True)
        f_tri = sized(1.4, True)
        num_y = py(self.NUMBER_Z)
        for i in range(24):
            cx = px(self.jack_x(i))
            even, odd = str(i * 2), str(i * 2 + 1)
            we = d.textbbox((0, 0), even, font=f_num)[2]
            wo = d.textbbox((0, 0), odd, font=f_num)[2]
            wt = d.textbbox((0, 0), "▲", font=f_tri)[2]
            span = we + wt + wo + wt + 2.0 / 1000 * ppm
            x = cx - span / 2
            for text, f in ((even, f_num), ("▲", f_tri),
                            (odd, f_num), ("▼", f_tri)):
                b = d.textbbox((0, 0), text, font=f)
                d.text((x, num_y - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=amber)
                x += (b[2] - b[0]) + 0.5 / 1000 * ppm

        # ---- the badge strip's lettering and lamp labels ----------------
        f_badge = sized(3.0)
        x = px(self.BADGE_X0 + 0.0012)
        top = py(0.4102) - d.textbbox((0, 0), "E", font=f_badge)[3] / 2
        d.text((x, top), "EX4400", font=f_badge, fill=white)
        x += d.textbbox((0, 0), "EX4400 ", font=f_badge)[2]
        d.text((x, top), "PoE++", font=f_badge, fill=amber)

        f_lab = sized(1.9)
        gap = 1.3 / 1000 * ppm
        for i, (left, right) in enumerate((("SYS", "SPD"), ("ALM", "DX"),
                                           ("MST", "EN"), ("CLD", "POE"))):
            cy = py(self.LAMP_Z[i])
            b = d.textbbox((0, 0), left, font=f_lab)
            d.text((px(self.LAMP_X[0]) - self.LAMP_D / 2 * ppm - gap - (b[2] - b[0]),
                    cy - (b[3] - b[1]) / 2 - b[1]), left, font=f_lab, fill=(214, 215, 217, 255))
            b = d.textbbox((0, 0), right, font=f_lab)
            d.text((px(self.LAMP_X[1]) + self.LAMP_D / 2 * ppm + gap,
                    cy - (b[3] - b[1]) / 2 - b[1]), right, font=f_lab, fill=(214, 215, 217, 255))

        # The USB icon under the console mouth, drawn rather than set: the
        # trident is not in any font this build can rely on.
        ux, uy = px(self.USBC_X), py(self.USBC_Z - 0.115)
        arm = 1.5 / 1000 * ppm
        d.line([(ux - arm, uy), (ux + arm, uy)], fill=(198, 199, 201, 255), width=3)
        d.ellipse([ux - arm - 3, uy - 3, ux - arm + 3, uy + 3], fill=(198, 199, 201, 255))
        d.line([(ux, uy), (ux + arm * 0.45, uy - arm * 0.55)], fill=(198, 199, 201, 255), width=3)
        d.line([(ux, uy), (ux + arm * 0.45, uy + arm * 0.55)], fill=(198, 199, 201, 255), width=3)

        # ---- cage numbers under the extension module --------------------
        f_cage = sized(2.0)
        for i in range(4):
            centred(str(i), px(self.CAGE_X0 + i * self.CAGE_PITCH),
                    py(self.CAGE_Z - self.CAGE[1] / 2 - 0.062), f_cage)

        tex = save_texture("ex4400_48p_silkscreen.png", img)
        rack.materials["ex44_silktex"] = PBRMaterial(
            name="EX4400 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "ex44_silktex",
                            (0, self.face(rack) - 0.0009, z), self.width, self.height)

    # ----------------------------------------------------------------- parts

    def band(self, rack, g: str, x0: float, cz: float, zh: float, hole_w: float) -> None:
        """The casting metal that survives one horizontal band of holes.

        A hole cannot be drawn by putting a dark box behind a solid plate:
        the plate wins the depth test and the first pass produced four
        blank white slabs where four blocks of twelve jacks should be. So
        the casting is built as the complement of its own holes. For each
        band the six mouths of that width are subtracted from the block and
        the seven pieces left over are drawn, which is what a punched plate
        actually is.
        """
        y = self.face(rack)
        edges = [x0]
        for i in range(6):
            c = x0 + (self.JACK_X0 - self.BLOCK_X0) + i * self.JACK_PITCH
            edges += [c - hole_w / 2, c + hole_w / 2]
        edges.append(x0 + self.BLOCK_W)
        for a, b in zip(edges[0::2], edges[1::2]):
            if b - a < 0.0002:
                continue
            rack.box(g, "ex44_cast", ((a + b) / 2, y - 0.0010, cz), (b - a, 0.0012, zh))

    def casting(self, rack, g: str, z: float, x0: float) -> None:
        """One twelve port zinc casting, punched with its twelve mouths.

        Six bands: for each row the body, the shoulder above it and the
        latch slot above that, all mirrored on the lower row because the
        casting is the same part turned over. Between them the broad centre
        rail, and under the lower slot the thin rail that closes the
        casting off at the bottom.
        """
        y = self.face(rack)
        h = self.height
        top, bottom = self.BLOCK_Z
        cx = x0 + self.BLOCK_W / 2
        bh, sh, th = self.MOUTH_H
        bw, sw, tw = self.MOUTH_W
        # The dark backing every hole looks into. It sits 0.6mm off the
        # plate and the casting stands 1.0mm in front of it, so the mouths
        # read as holes with a wall rather than as painted rectangles.
        rack.box(g, "ex44_mouth", (cx, y - 0.0002, z + (top + bottom) / 2 * h),
                 (self.BLOCK_W, 0.0008, (top - bottom) * h))
        for row, side in zip(self.ROW_Z, (1, -1)):
            for w, zh, dz in ((bw, bh, 0.0),
                              (sw, sh, side * (bh + sh) / 2),
                              (tw, th, side * (bh / 2 + sh + th / 2))):
                self.band(rack, g, x0, z + (row + dz) * h, zh * h, w)
        # The centre rail, and the strip that closes the bottom edge. The
        # stack of mouths lands 0.34mm short of the measured casting
        # bottom, which is rounding in the band heights rather than a real
        # feature, so the closing rail takes up whatever is left.
        rail_t = self.ROW_Z[0] - bh / 2
        rail_b = self.ROW_Z[1] + bh / 2
        rack.box(g, "ex44_cast", (cx, y - 0.0010, z + (rail_t + rail_b) / 2 * h),
                 (self.BLOCK_W, 0.0012, (rail_t - rail_b) * h))
        foot = self.ROW_Z[1] - bh / 2 - sh - th
        if foot - bottom > 0.0005:
            rack.box(g, "ex44_cast", (cx, y - 0.0010, z + (foot + bottom) / 2 * h),
                     (self.BLOCK_W, 0.0012, (foot - bottom) * h))

    def mouth(self, rack, g: str, x: float, z: float, top_row: bool) -> None:
        """What is inside one 8P8C hole: the deeper throat and the contacts.

        The hole itself is the gap the casting bands leave. What has to go
        in it is the darker cavity behind the body opening, so the wide
        part of the mouth reads deeper than the latch slot above it, and
        the comb of eight contacts on the wall the latch faces.
        """
        y = self.face(rack)
        h = self.height
        side = 1 if top_row else -1
        bw = self.MOUTH_W[0]
        bh = self.MOUTH_H[0] * h
        rack.box(g, "ex44_throat", (x, y - 0.0003, z), (bw * 0.94, 0.0008, bh * 0.94))
        comb_z = z + side * bh * 0.16
        for i in range(8):
            cx = x - bw * 0.28 + i * (bw * 0.56 / 7)
            rack.box(g, "ex44_contact", (cx, y - 0.0009, comb_z),
                     (bw * 0.042, 0.0006, bh * 0.30))

    def cage_block(self, rack, g: str, z: float) -> None:
        """The four cage SFP+ block, punched the same way the castings are.

        The block is one stamped pale frame with four black bores in it,
        and a solid frame with the bores behind it renders as one pale
        rectangle, which is what the first pass gave. So the frame is drawn
        as the metal that survives: a rail above and below the row and five
        webs standing between and either side of the bores.
        """
        y = self.face(rack)
        w, hf = self.CAGE
        hh = hf * self.height
        pitch = self.CAGE_PITCH
        x0 = self.CAGE_X0 - pitch / 2 - 0.0011
        x1 = self.CAGE_X0 + 3 * pitch + pitch / 2 + 0.0011
        cx = -self.width / 2 + (x0 + x1) / 2

        def X(v):
            return -self.width / 2 + v

        # The bore backing has to stand clear of the bay panel it is set
        # into. Level with it, the bay wins the depth test and four black
        # cages come out the colour of the module they are fitted to.
        rack.box(g, "ex44_cage_bore", (cx, y - 0.0009, z), (x1 - x0, 0.0008, hh + 0.0024))
        for dz in (hh / 2 + 0.0007, -hh / 2 - 0.0007):
            rack.box(g, "ex44_cage", (cx, y - 0.0015, z + dz), (x1 - x0, 0.0012, 0.0013))
        edges = [x0]
        for i in range(4):
            c = self.CAGE_X0 + i * pitch
            edges += [c - w / 2, c + w / 2]
        edges.append(x1)
        for a, b in zip(edges[0::2], edges[1::2]):
            rack.box(g, "ex44_cage", (X((a + b) / 2), y - 0.0015, z), (b - a, 0.0012, hh))
        # The EMI gasket tab along the bottom lip of each bore, which is
        # the brightest thing in the module bay.
        for i in range(4):
            rack.box(g, "ex44_screw", (X(self.CAGE_X0 + i * pitch), y - 0.0011,
                                       z - hh * 0.36), (w * 0.46, 0.0006, hh * 0.09))

    def thumbscrew(self, rack, g: str, x: float, z: float) -> None:
        """A captive thumbscrew, which on this module is a plain slotted
        disc. The slot is a hairline on the render, not the deep cross the
        first pass cut, which turned two screws into two black crosses."""
        y = self.face(rack)
        r = self.SCREW_D / 2
        rack.front_cylinder(g, "ex44_screw", (x, y - 0.0016, z), r, 0.0016, 24)
        for w, hh in ((r * 1.24, r * 0.13), (r * 0.13, r * 1.24)):
            rack.box(g, "ex44_bay_lip", (x, y - 0.0023, z), (w, 0.0005, hh))

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
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "ex44_plate", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0014, bevel=0.0006, steps=6)
        # The plate is a single folded sheet, so the only relief on it is
        # the return along the top and bottom edges.
        for dz in (h * 0.475, -h * 0.475):
            rack.box(g, "ex44_plate_dark", (0, y - 0.0003, z + dz), (w - 0.006, 0.0006, 0.0014))

        # Rack ears. On an EX4400 they are separate brackets bolted to the
        # side of the chassis, and they sit forward of the faceplate.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0195)
            rack.rounded_prism(g, "ex44_plate_dark", (ex, y + 0.0014, z),
                               (0.0390, 0.0082, h * 0.94), radius=0.0014, bevel=0.0006, steps=6)
            for dz in (h * 0.29, -h * 0.29):
                rack.rounded_prism(g, "ex44_plate", (ex, y - 0.0026, z + dz),
                                   (0.0200, 0.0028, 0.0092), radius=0.0040, bevel=0.0008, steps=8)

        # ---- the four jack castings and their 48 mouths -----------------
        for b in range(4):
            self.casting(rack, g, z, X(self.block_x(b)))
        for i in range(24):
            cx = X(self.jack_x(i))
            self.mouth(rack, g, cx, Z(self.ROW_Z[0]), True)
            self.mouth(rack, g, cx, Z(self.ROW_Z[1]), False)

        # ---- badge strip -------------------------------------------------
        bx0, bx1, bzt, bzb = self.BADGE
        bx0 = self.BADGE_X0
        # 0.3mm proud, not 0.6mm. The overlay that carries EX4400 PoE++ and
        # the lamp labels sits 0.9mm off the plate, so a badge any further
        # forward than that paints out its own lettering, which is exactly
        # what the first render did: a blank blue slab with eight dots.
        rack.box(g, "ex44_badge", (X((bx0 + bx1) / 2), y - 0.0003, Z((bzt + bzb) / 2)),
                 (bx1 - bx0, 0.0008, (bzt - bzb) * h))
        # USB-C: a rounded slot, and the only opening on the strip.
        rack.rounded_prism(g, "ex44_bay", (X(self.USBC_X), y - 0.0010, Z(self.USBC_Z)),
                           (self.USBC[0] + 0.0006, 0.0008, self.USBC[1] + 0.0006),
                           radius=0.0019, bevel=0.0003, steps=10)
        rack.rounded_prism(g, "ex44_usbc", (X(self.USBC_X), y - 0.0013, Z(self.USBC_Z)),
                           (self.USBC[0], 0.0008, self.USBC[1]), radius=0.0016, bevel=0.0003, steps=10)
        for lx in self.LAMP_X:
            for lz in self.LAMP_Z:
                rack.front_cylinder(g, "ex44_lamp", (X(lx), y - 0.0010, Z(lz)),
                                    self.LAMP_D / 2, 0.0008, 16)
        rack.front_cylinder(g, "ex44_mode", (X(self.MODE_X), y - 0.0010, Z(self.MODE_Z)),
                            self.MODE_D / 2, 0.0008, 24)
        # The list glyph on the button: three bars, each with a dot.
        for k in (-1, 0, 1):
            gz = Z(self.MODE_Z) - k * 0.0014
            rack.box(g, "ex44_mode_ink", (X(self.MODE_X) + 0.0005, y - 0.0014, gz),
                     (0.0022, 0.0006, 0.0005))
            rack.box(g, "ex44_mode_ink", (X(self.MODE_X) - 0.0013, y - 0.0014, gz),
                     (0.0006, 0.0006, 0.0005))

        # ---- extension module bay ---------------------------------------
        ax0, ax1, azt, azb = self.BAY
        # Both bay plates sit behind the silkscreen overlay, because the
        # cage numbers 0 to 3 are printed on the bay and a plate in front
        # of the overlay paints them out.
        rack.box(g, "ex44_bay_lip", (X((ax0 + ax1) / 2), y - 0.0001, Z((azt + azb) / 2)),
                 (ax1 - ax0, 0.0006, (azt - azb) * h))
        rack.box(g, "ex44_bay", (X((ax0 + ax1) / 2), y + 0.0001, Z((azt + azb) / 2 + 0.008)),
                 (ax1 - ax0 - 0.0026, 0.0006, (azt - azb) * h - 0.0034))
        for sx in self.SCREW_X:
            self.thumbscrew(rack, g, X(sx), Z(self.SCREW_Z))
        # The cage block, and two lamps a port in a row across the top of
        # it. On the render they are 1mm dots, not the 1.4mm squares the
        # first pass drew, and they sit right on the block's top rail.
        self.cage_block(rack, g, Z(self.CAGE_Z))
        for i in range(4):
            for side in (-1, 1):
                rack.front_cylinder(g, "ex44_lamp",
                                    (X(self.CAGE_X0 + i * self.CAGE_PITCH + side * 0.0034),
                                     y - 0.0013, Z(self.CAGE_Z + self.CAGE[1] / 2 + 0.036)),
                                    0.00050, 0.0006, 12)

        self.silkscreen(rack, z)
