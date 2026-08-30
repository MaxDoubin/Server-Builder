"""MikroTik CRS317-1G-16S+RM, drawn from MikroTik's own product photography.

Sixteen SFP+ cages in a single row, four groups of four, and above every
group a punched slot vent that is as much of the panel's character as the
cages are. Nothing else on the front except two RJ45s, a button and four
lamps in a boxed cluster at the right.

What the photographs show, working left to right:

  A near white panel, and a folded rack ear at each end pierced by two
  rounded capsule slots. The ear is a shade darker than the panel and the
  fold between them is the only line that separates the two.

  Four vent bands, one over each cage group, punched with tall narrow
  slots at a 4.7mm pitch. The leftmost band is the odd one: its outline
  swoops down at the left and clips the first five slots into a staircase
  of short stubs, which is a detail nobody would invent and the first thing
  that says CRS317 rather than any other white MikroTik box.

  Under each band, two small square lamps per port with ACT and 10G set in
  type above them, then the cage row itself. The cages are one long dark
  casting per group of four with hairline dividers, a lighter lip along the
  top, and a white card edge low in each mouth. SFP+ 1 to SFP+ 16 run in
  type underneath.

  At the right a short vent of five stubs, CONSOLE over an RJ45, ETH/BOOT
  over a second RJ45 that carries a green and an amber lamp on its lower
  lip, a small round button with RESET under it, and four round lamps in a
  rounded outline box: USR yellow, FAULT red, PWR 2 and PWR 1 blue. These
  four are printed at full saturation in the render, unlike the muted domes
  on the other Cloud Router Switches, so they are painted that way here.

  The right sixth carries Cloud Router Switch in heavy italic, CRS 317-1G-
  16S+ beneath it and the MikroTik wordmark low down.

Nothing in this file is shared with another product. The cages, the vent
punch, the lamps and every material are drawn here, because the CRS317
wears its optics in one row over a slot vent and no other switch in this
library does.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class CRS317_16S(Device):
    slug = "CRS317_16S"
    name = "MikroTik CRS317-1G-16S+RM"
    u = 1
    #: MikroTik publish 443 x 224 x 44 mm for this chassis.
    width = 0.443
    depth = 0.224
    source = "https://mikrotik.com/product/crs317_1g_16s_rm"
    references = [
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1324_hi_res.png",
                  "front on, 3840x2430, whole panel with both rack ears"),
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/2055_hi_res.png",
                  "7680x5279 studio shot, confirms lid contour and ear fold"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, which is not `front_y`.

        The panel is a 9.5mm slab centred on the rack's front, so its
        visible face stands 4.75mm proud of it. Measure surface detail from
        `front_y` and every millimetre of it ends up inside the slab.
        """
        return rack.front_y - 0.00475

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes, sampled off photograph 1324.

        This shot is lit brighter than the rest of the MikroTik set: its
        panel measures 219 raw against 196 on the CRS326-24S and 157 on the
        copper CRS326, so the linear correction that puts it on 222 is only
        1.031. Every figure below is therefore very nearly the raw sample.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            "mt317_panel": pbr("CRS317 Panel", [222, 222, 222, 255], 0.13, 0.55),
            "mt317_lid": pbr("CRS317 Lid", [228, 228, 228, 255], 0.15, 0.50),
            # 217 raw against the panel's 219. Ear and panel are the same
            # paint; only the fold shadow tells them apart, so that shadow
            # is drawn as geometry rather than faked with a darker ear.
            "mt317_ear": pbr("CRS317 Ear", [218, 218, 218, 255], 0.18, 0.48),
            "mt317_fold": pbr("CRS317 Fold Shadow", [163, 163, 164, 255], 0.20, 0.60),
            # Slot vents read black in the photograph, not grey. There is a
            # heatsink two centimetres behind them and no light reaches it.
            "mt317_vent": pbr("CRS317 Vent Slot", [16, 16, 17, 255], 0.10, 0.92),
            # The cage casting, 35 raw along its lit top lip and 23 in the
            # mouth. Two different values, and painting both the lip figure
            # flattens a row of holes into a row of tiles.
            "mt317_cage": pbr("CRS317 Cage", [46, 46, 47, 255], 0.46, 0.50),
            "mt317_bore": pbr("CRS317 Cage Bore", [21, 21, 20, 255], 0.14, 0.88),
            "mt317_divider": pbr("CRS317 Cage Divider", [155, 156, 155, 255], 0.40, 0.44),
            "mt317_edge": pbr("CRS317 Card Edge", [232, 232, 229, 255], 0.0, 0.50),
            "mt317_pad": pbr("CRS317 Contact Pad", [58, 96, 72, 255], 0.30, 0.56),
            # Unlit lamp squares: 141 raw, a flat grey window, not a lens.
            "mt317_lamp": pbr("CRS317 Port Lamp", [143, 140, 138, 255], 0.10, 0.56),
            "mt317_lamp_rim": pbr("CRS317 Lamp Rim", [104, 104, 105, 255], 0.16, 0.60),
            "mt317_jack": pbr("CRS317 Jack Shell", [34, 34, 34, 255], 0.10, 0.74),
            "mt317_throat": pbr("CRS317 Jack Throat", [27, 27, 27, 255], 0.06, 0.90),
            "mt317_shield": pbr("CRS317 Jack Shield", [176, 176, 176, 255], 0.58, 0.38),
            "mt317_gold": pbr("CRS317 Jack Contacts", [186, 152, 82, 255], 0.82, 0.28),
            "mt317_silk": pbr("CRS317 Silkscreen", [88, 88, 88, 255], 0.05, 0.70),
            # The reset button is a warm olive brown in this render, which
            # is not a grey button in shadow: sampled it is 79, 54, 0.
            "mt317_reset": pbr("CRS317 Reset", [80, 55, 4, 255], 0.24, 0.52),
            # Four saturated lamps behind a rounded outline. Sampled at
            # 172,193,0 / 211,0,0 / 0,0,216, so these are painted lit.
            "mt317_usr": pbr("CRS317 USR", [174, 196, 20, 255], 0.0, 0.24,
                             emissive=[0.24, 0.30, 0.0]),
            "mt317_fault": pbr("CRS317 Fault", [214, 24, 24, 255], 0.0, 0.24,
                               emissive=[0.34, 0.02, 0.02]),
            "mt317_pwr": pbr("CRS317 Power", [24, 32, 218, 255], 0.0, 0.24,
                             emissive=[0.02, 0.04, 0.32]),
            "mt317_jack_green": pbr("CRS317 Jack Green", [80, 176, 96, 255], 0.0, 0.22,
                                    emissive=[0.04, 0.22, 0.07]),
            "mt317_jack_amber": pbr("CRS317 Jack Amber", [206, 178, 56, 255], 0.0, 0.24,
                                    emissive=[0.22, 0.16, 0.01]),
        })

    # ------------------------------------------------------------- measured
    #
    # Photograph 1324 calibrated on the ear span: 3373 pixels across the
    # 482.6mm of a 19 inch face plate at the panel's mid line, which puts a
    # pixel at 0.14308mm. Cross checked against the body itself, 3106 pixels
    # or 444.4mm against the 443mm MikroTik publish, so a figure below is
    # good to a few tenths of a millimetre.
    #
    # The ear stands 297 pixels tall for 44.45mm, so vertical scale runs 4.7
    # percent short of horizontal. Vertical figures are therefore fractions
    # of the measured panel height, which cancels that exactly; horizontal
    # figures are metres from the body's left edge.

    #: Sixteen cages: first centre, pitch, and the extra a group boundary
    #: adds at every fourth cage.
    CAGE0, PITCH, GAP = 0.01846, 0.014309, 0.007154
    #: Cage mouth: top and bottom as fractions of panel height, and the
    #: lighter lip along its top edge.
    CAGE_Z = (-0.1014, -0.3649)
    LIP_Z = (-0.1014, -0.1419)
    #: The lamp squares and their labels, above the cages.
    LAMP_Z = (0.0101, -0.0608)
    LABEL_Z = 0.0625
    #: Each lamp sits this far either side of its cage centre.
    LAMP_DX = (-0.00487, 0.00515)
    LAMP_W = 0.0030
    #: Vent bands, left and right edge of each, then the slot geometry.
    VENT_X = ((0.00959, 0.06611), (0.07813, 0.13078),
              (0.14252, 0.19560), (0.20691, 0.26500))
    VENT_Z = (0.3953, 0.1622)
    SLOT_PITCH, SLOT_W = 0.004722, 0.00386
    #: The short vent over the console, and the console cluster itself.
    STUB_X = (0.26614, 0.29276)
    STUB_Z = (0.3953, 0.3378)
    CONSOLE_X = (0.26886, 0.28246)
    CONSOLE_Z = (0.2264, 0.0000)
    BOOT_Z = (-0.1115, -0.3345)
    RESET_X, RESET_Z, RESET_R = 0.28868, -0.2433, 0.00193
    #: The rounded box the four lamps sit inside, and the lamps.
    BOX_X, BOX_Z = (0.29304, 0.30793), (0.1554, -0.3243)
    DOT_X, DOT_R = 0.29640, 0.00179
    DOT_Z = (0.0845, -0.0287, -0.1419, -0.2534)

    def cage_x(self, i: int) -> float:
        """Centre of cage `i`, metres from the panel's left edge."""
        return self.CAGE0 + i * self.PITCH + (i // 4) * self.GAP

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """All the lettering, as one transparent overlay over the panel.

        Geometry cannot spell. Sixteen SFP+ labels, thirty two ACT and 10G
        labels and four lamp names are set here at the sizes the photograph
        measures, from the same constants the geometry uses, so ink and
        metal cannot drift apart.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (88, 88, 88, 255)
        dark = (30, 30, 30, 255)

        def px(x_m):
            return x_m * ppm

        def py(frac):
            return (0.5 - frac) * H

        def sized(mm_cap, bold=False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def fitted(text, mm_wide, bold=False):
            want = mm_wide / 1000 * ppm
            f = font(40, bold)
            got = d.textbbox((0, 0), text, font=f)[2]
            return font(max(8, round(40 * want / max(got, 1))), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- ACT and 10G over every port, and SFP+ n under every cage.
        #      All three are fitted to measured widths: ACT spans 3.58mm on
        #      the photograph and SFP+ 1 spans 8.4mm. Set by cap height they
        #      came out a fifth too wide, and at a 14.3mm port pitch that is
        #      enough to run one port's 10G into the next port's ACT.
        f_tiny = fitted("ACT", 3.58)
        f_lab = fitted("10G", 3.70)
        f_port = fitted("SFP+ 16", 8.40)
        for i in range(16):
            cx = px(self.cage_x(i))
            centred("ACT", cx + px(self.LAMP_DX[0]), py(self.LABEL_Z), f_tiny)
            centred("10G", cx + px(self.LAMP_DX[1]), py(self.LABEL_Z), f_lab)
            centred(f"SFP+ {i + 1}", cx, py(-0.4088), f_port)

        # ---- the console cluster.
        cc = px(sum(self.CONSOLE_X) / 2)
        centred("CONSOLE", cc, py(0.2775), f_tiny)
        centred("ETH/BOOT", cc, py(-0.3919), f_tiny)
        centred("RESET", px(self.RESET_X), py(-0.3919), f_tiny)

        # ---- lamp names inside the outline box, left aligned off the dots.
        for label, zf in zip(("USR", "FAULT", "PWR 2", "PWR 1"), self.DOT_Z):
            b = d.textbbox((0, 0), label, font=f_tiny)
            d.text((px(0.29920), py(zf) - (b[3] + b[1]) / 2), label, font=f_tiny, fill=dark)

        # ---- the right sixth. Measured boxes: the product line runs 359.2
        #      to 441.3mm, the model number 400.5 to 440.4 and the wordmark
        #      408.8 to 437.3, all fitted to those widths rather than set by
        #      cap height, because cap height guesses the width and this is
        #      the only large type on the panel.
        centred("Cloud Router Switch", px(0.40021), py(0.3345),
                fitted("Cloud Router Switch", 82.1, True))
        centred("CRS 317-1G-16S+", px(0.42046), py(0.1554),
                fitted("CRS 317-1G-16S+", 39.9))
        f_mark = fitted("MikroTik", 28.5)
        f_bold = font(f_mark.size, True)
        wx = px(0.40880)
        wtop = py(-0.3530) - d.textbbox((0, 0), "M", font=f_bold)[3] / 2
        d.text((wx, wtop), "Mikro", font=f_mark, fill=dark)
        wx += d.textbbox((0, 0), "Mikro", font=f_mark)[2]
        d.text((wx, wtop), "Tik", font=f_bold, fill=dark)

        tex = save_texture("crs317_silkscreen.png", img)
        rack.materials["mt317_silktex"] = PBRMaterial(
            name="CRS317 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "mt317_silktex",
                            (0, self.face(rack) - 0.0010, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def vent_band(self, rack, g, z, x0, x1, staircase=False):
        """One punched slot vent, drawn slot by slot.

        `staircase` is the left hand band, where the band outline swoops
        down and the first five slots are clipped to stubs of rising
        height. Drawing all four bands the same, which the first pass did,
        loses the one asymmetry on the whole panel.
        """
        y = self.face(rack)
        h = self.height
        top, bot = self.VENT_Z
        n = int(round((x1 - x0) / self.SLOT_PITCH))
        full = (top - bot) * h
        for i in range(n):
            cx = x0 + self.SLOT_W / 2 + i * self.SLOT_PITCH
            frac = 1.0
            if staircase and i < 5:
                # Measured stub heights: the first four sit at 15 pixels of
                # a 69 pixel slot and the fifth at 28, so the ramp is short
                # and abrupt rather than a smooth diagonal.
                frac = (0.22, 0.22, 0.24, 0.28, 0.41)[i]
            hz = full * frac
            cz = z + bot * h + hz / 2
            rack.box(g, "mt317_vent", (cx, y - 0.0006, cz), (self.SLOT_W, 0.0026, hz))

    def cage(self, rack, g, x, z, w, h, first, last):
        """One SFP+ mouth in a ganged group of four.

        The group is a single casting, so a cage that is not at the end of
        it has no side wall of its own, only a hairline divider shared with
        its neighbour. Ringing every cage in metal, which is what a generic
        cage helper would do, prints four separate cages where the
        photograph shows one four wide casting.
        """
        y = self.face(rack)
        rim = 0.0008
        rack.box(g, "mt317_cage", (x, y - 0.0013, z + h / 2 - rim / 2), (w, 0.0012, rim))
        rack.box(g, "mt317_cage", (x, y - 0.0013, z - h / 2 + rim / 2), (w, 0.0012, rim))
        # Only the left wall is drawn unless this cage ends the group, so
        # neighbours share one hairline instead of butting two together.
        # Drawing both, which the first pass did, doubled every divider and
        # printed four separate cages where the casting is one piece.
        rack.box(g, "mt317_cage" if first else "mt317_divider",
                 (x - w / 2 + rim / 2, y - 0.0013, z), (rim, 0.0012, h))
        if last:
            rack.box(g, "mt317_cage", (x + w / 2 - rim / 2, y - 0.0013, z), (rim, 0.0012, h))
        # The mouth itself has to be pushed in front of the panel and then
        # stepped back behind the rim, or the white panel wins the depth
        # test and sixteen cages come out as sixteen empty outlines.
        rack.box(g, "mt317_bore", (x, y - 0.0005, z), (w - rim * 2, 0.0018, h - rim * 2))
        rack.box(g, "mt317_bore", (x, y + 0.0044, z), (w * 0.90, 0.0110, h * 0.84))
        # White card edge low in the mouth and three green pads under it.
        # Leave the card edge out and every cage is just a hole.
        rack.box(g, "mt317_edge", (x, y - 0.0018, z - h * 0.30), (w * 0.42, 0.0008, h * 0.08))
        for i in (-1, 0, 1):
            rack.box(g, "mt317_pad", (x + i * w * 0.24, y - 0.0017, z - h * 0.42),
                     (w * 0.13, 0.0007, h * 0.07))

    def lamp(self, rack, g, x, z, s):
        """One square port lamp: a dark rim with a pale window inside it.

        Flat pale squares on their own read as printing. The rim is what
        makes them read as recessed windows, and it is visible in the
        photograph as a definite step round each one.
        """
        y = self.face(rack)
        rack.box(g, "mt317_lamp_rim", (x, y - 0.0007, z), (s, 0.0008, s))
        rack.box(g, "mt317_lamp", (x, y - 0.0010, z), (s * 0.68, 0.0007, s * 0.68))

    def rj45(self, rack, g, x, z, w, h, lamps):
        """One management jack, in the bright shield this panel gives them.

        A jack reads as a hole, so the shield is four thin rails round the
        mouth and darkness fills the middle. The plug notch faces up on
        both jacks here, because both are the same part fitted the same way
        up: this switch does not mirror its two RJ45s the way the two row
        copper switches mirror theirs.
        """
        y = self.face(rack)
        rim = 0.0011
        for dx, dz, bw, bh in ((0, h / 2 - rim / 2, w, rim), (0, -h / 2 + rim / 2, w, rim),
                               (-w / 2 + rim / 2, 0, rim, h), (w / 2 - rim / 2, 0, rim, h)):
            rack.box(g, "mt317_shield", (x + dx, y - 0.0016, z + dz), (bw, 0.0013, bh))
        rack.box(g, "mt317_throat", (x, y - 0.0007, z), (w - rim * 2, 0.0020, h - rim * 2))
        rack.box(g, "mt317_throat", (x, y + 0.0046, z), (w * 0.80, 0.0086, h * 0.80))
        rack.box(g, "mt317_jack", (x, y - 0.0020, z + h * 0.36), (w * 0.30, 0.0011, h * 0.20))
        tongue = z - h * 0.12
        rack.box(g, "mt317_jack", (x, y - 0.0019, tongue), (w * 0.70, 0.0006, h * 0.34))
        for i in range(8):
            cx = x - w * 0.29 + i * (w * 0.58 / 7)
            rack.box(g, "mt317_gold", (cx, y - 0.0021, tongue), (w * 0.040, 0.0005, h * 0.28))
        if lamps:
            for dx, mat in ((-w * 0.32, "mt317_jack_green"), (w * 0.32, "mt317_jack_amber")):
                rack.box(g, mat, (x + dx, y - 0.0021, z - h * 0.38), (w * 0.20, 0.0010, h * 0.12))

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
        rack.rounded_prism(g, "mt317_panel", (0, rack.front_y, z), (w, 0.0095, h),
                           radius=0.0011, bevel=0.0005, steps=6)
        rack.box(g, "mt317_lid", (0, y + 0.012 + self.depth * 0.32, z + h * 0.47),
                 (w - 0.012, self.depth * 0.64, 0.0018))

        # Rack ears: 19.8mm of overhang each side of the 443mm body to reach
        # 482.6mm across, each with two capsule slots measured 12.3 by 5.7mm.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0099)
            rack.rounded_prism(g, "mt317_ear", (ex, y + 0.0013, z), (0.0198, 0.0080, h * 0.99),
                               radius=0.0013, bevel=0.0005, steps=6)
            for dz in (0.351, -0.336):
                rack.rounded_prism(g, "mt317_vent", (ex, y - 0.0026, Z(dz)),
                                   (0.0123, 0.0028, 0.0057),
                                   radius=0.0027, bevel=0.0006, steps=8)
            rack.box(g, "mt317_fold", (sx * w / 2, y + 0.0006, z), (0.0010, 0.0058, h * 0.98))

        # ---- four vent bands, the left one with its staircase -----------
        for i, (vx0, vx1) in enumerate(self.VENT_X):
            self.vent_band(rack, g, z, X(vx0), X(vx1), staircase=(i == 0))
        # The short stub vent over the console, five slots at the same pitch.
        sx0, sx1 = self.STUB_X
        stz = z + self.STUB_Z[1] * h
        sth = (self.STUB_Z[0] - self.STUB_Z[1]) * h
        for i in range(6):
            rack.box(g, "mt317_vent",
                     (X(sx0 + self.SLOT_W / 2 + i * self.SLOT_PITCH), y - 0.0006, stz + sth / 2),
                     (self.SLOT_W * 0.78, 0.0026, sth))

        # ---- sixteen cages and their lamps ------------------------------
        cz = z + (self.CAGE_Z[0] + self.CAGE_Z[1]) / 2 * h
        ch = (self.CAGE_Z[0] - self.CAGE_Z[1]) * h
        lz = z + (self.LAMP_Z[0] + self.LAMP_Z[1]) / 2 * h
        # A cage is drawn one pitch wide because in the photograph the four
        # in a group butt together with only a hairline between them.
        for i in range(16):
            cx = X(self.cage_x(i))
            self.cage(rack, g, cx, cz, self.PITCH, ch, first=(i % 4 == 0), last=(i % 4 == 3))
            for dx in self.LAMP_DX:
                self.lamp(rack, g, cx + dx, lz, self.LAMP_W)
        # The lighter lip that runs the full length of each group's casting.
        for grp in range(4):
            gx0 = self.cage_x(grp * 4) - self.PITCH / 2
            gx1 = self.cage_x(grp * 4 + 3) + self.PITCH / 2
            # A narrow catch light along the casting's top edge, not a bar
            # across the mouth. At six tenths of the measured lip it ate
            # nearly half the opening and sixteen cages looked half shut.
            lip_h = (self.LIP_Z[0] - self.LIP_Z[1]) * h * 0.34
            lip_z = z + self.LIP_Z[0] * h - lip_h / 2
            rack.box(g, "mt317_divider", (X((gx0 + gx1) / 2), y - 0.0016, lip_z),
                     (gx1 - gx0, 0.0008, lip_h))

        # ---- console, boot jack, reset and the boxed lamp cluster -------
        cx0, cx1 = self.CONSOLE_X
        jx, jw = X((cx0 + cx1) / 2), cx1 - cx0
        for (zt, zb), lit in ((self.CONSOLE_Z, False), (self.BOOT_Z, True)):
            self.rj45(rack, g, jx, z + (zt + zb) / 2 * h, jw, (zt - zb) * h, lit)
        rack.front_cylinder(g, "mt317_reset", (X(self.RESET_X), y - 0.0014, Z(self.RESET_Z)),
                            self.RESET_R, 0.0016, 20)

        # The four lamps sit inside a rounded outline, which is drawn as
        # four hairlines rather than a filled panel: filled, it covers the
        # lamps it is meant to enclose.
        bx0, bx1 = self.BOX_X
        bz0, bz1 = self.BOX_Z
        bcx, bcz = X((bx0 + bx1) / 2), z + (bz0 + bz1) / 2 * h
        bw, bh = bx1 - bx0, (bz0 - bz1) * h
        for dx, dz, sw, sh in ((0, bh / 2, bw, 0.0006), (0, -bh / 2, bw, 0.0006),
                               (-bw / 2, 0, 0.0006, bh), (bw / 2, 0, 0.0006, bh)):
            rack.box(g, "mt317_lamp_rim", (bcx + dx, y - 0.0008, bcz + dz), (sw, 0.0007, sh))
        for zf, mat in zip(self.DOT_Z, ("mt317_usr", "mt317_fault", "mt317_pwr", "mt317_pwr")):
            rack.front_cylinder(g, mat, (X(self.DOT_X), y - 0.0013, Z(zf)),
                                self.DOT_R, 0.0014, 20)

        self.silkscreen(rack, z)
