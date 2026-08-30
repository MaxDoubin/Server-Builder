"""MikroTik CRS312-4C+8XG-RM, drawn from MikroTik's own product photography.

Eight 10GBASE-T jacks, then four combo ports that appear twice on the
panel, once as copper and once as optics, and MikroTik mark the pairing by
running a pale blue field behind everything that belongs to the combo. That
blue is the only colour on the faceplate and it is the whole reason this
switch does not look like any other white MikroTik box.

What the photographs show, working left to right:

  A near white panel with a folded rack ear at each end, two capsule slots
  in each.

  A chevron vent band running above the copper, a continuous zigzag of
  thick slanted bars with a small solid triangle tucked into every notch.
  It repeats every 26.7mm and stops dead where the optics start.

  Twelve RJ45s in one row, three ganged blocks of four, with 10G ETHERNET
  set vertically in each gap. These are shielded jacks, not the bare black
  mouths the gigabit MikroTiks use: a pale metal shell, eight gold contact
  fingers hanging down inside, and two moulded lenses standing proud of the
  top edge, green on the left and olive on the right.

  The last block of four is the copper half of the combo ports, labelled
  1T to 4T on a pale blue strip and titled 10G COMBO above.

  Then the optical half, four SFP+ cages two by two on a pale blue field,
  numbered 2F and 4F above and 1F and 3F below, with SFP+ set vertically
  down its right side.

  Then CONSOLE over an RJ45, MGMT/BOOT over a second one carrying green and
  olive lamps on its lower lip, a small round reset, a vertical USB A, and
  four domed lamps named USER, FAULT, POWER 2 and POWER 1.

  The right sixth carries Cloud Router Switch, the model number and the
  MikroTik wordmark, all three much smaller here than on the CRS317.

Nothing in this file is shared with another product. The chevron punch,
the shielded jack, the cages and every material are drawn here.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class CRS312_4C_8XG(Device):
    slug = "CRS312_4C_8XG"
    name = "MikroTik CRS312-4C+8XG-RM"
    u = 1
    #: MikroTik publish 443 x 183 x 44 mm for this chassis.
    width = 0.443
    depth = 0.183
    source = "https://mikrotik.com/product/crs312_4c_8xg_rm"
    references = [
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1825_hi_res.png",
                  "front on, 3000x1200, whole panel with both rack ears"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, 5mm proud of `front_y`.

        The panel is a 10mm slab centred on the rack front. Measuring
        surface detail from `front_y` puts all of it inside the slab, which
        is the single easiest way to render a blank white box.
        """
        return rack.front_y - 0.0050

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes, sampled off photograph 1825.

        Panel measured 197 raw and is corrected to 222 by a linear factor
        of 1.274, the same treatment given to every photograph in this set
        so that six switches lit six different ways still agree on what
        MikroTik white is.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            "mt312_panel": pbr("CRS312 Panel", [219, 220, 226, 255], 0.13, 0.56),
            "mt312_lid": pbr("CRS312 Lid", [226, 226, 231, 255], 0.15, 0.50),
            "mt312_ear": pbr("CRS312 Ear", [220, 220, 227, 255], 0.19, 0.48),
            "mt312_fold": pbr("CRS312 Fold Shadow", [158, 158, 163, 255], 0.20, 0.60),
            # Chevron slots read 8 of 255. There is nothing behind them for
            # 30mm, so they are as near black as anything on the panel.
            "mt312_vent": pbr("CRS312 Chevron Slot", [10, 10, 11, 255], 0.10, 0.92),
            # The combo field. 172, 203, 230 sampled off the label strip:
            # a pale cool blue and the only colour on the whole faceplate.
            "mt312_combo": pbr("CRS312 Combo Field", [176, 206, 232, 255], 0.06, 0.52),
            # A shielded jack: pale shell at 164, dark cavity at 5, and a
            # lower lip at 53 that catches the light. Three values, and
            # collapsing them to one turns a deep port into a grey tile.
            "mt312_shell": pbr("CRS312 Jack Shell", [164, 164, 166, 255], 0.54, 0.40),
            "mt312_cavity": pbr("CRS312 Jack Cavity", [10, 10, 9, 255], 0.06, 0.92),
            "mt312_lip": pbr("CRS312 Jack Lip", [55, 53, 51, 255], 0.20, 0.66),
            "mt312_gold": pbr("CRS312 Jack Contacts", [188, 158, 96, 255], 0.80, 0.28),
            "mt312_housing": pbr("CRS312 Jack Housing", [189, 190, 197, 255], 0.24, 0.50),
            "mt312_housing_edge": pbr("CRS312 Housing Edge", [70, 70, 74, 255], 0.24, 0.58),
            "mt312_cage": pbr("CRS312 Cage", [85, 84, 85, 255], 0.46, 0.48),
            "mt312_bore": pbr("CRS312 Cage Bore", [32, 31, 30, 255], 0.14, 0.88),
            "mt312_edge": pbr("CRS312 Card Edge", [232, 232, 229, 255], 0.0, 0.50),
            "mt312_pad": pbr("CRS312 Contact Pad", [60, 100, 74, 255], 0.30, 0.56),
            "mt312_silk": pbr("CRS312 Silkscreen", [92, 92, 96, 255], 0.05, 0.70),
            "mt312_reset": pbr("CRS312 Reset", [55, 55, 57, 255], 0.28, 0.46),
            "mt312_usb": pbr("CRS312 USB Shell", [44, 44, 46, 255], 0.42, 0.48),
            "mt312_usb_tongue": pbr("CRS312 USB Tongue", [224, 224, 222, 255], 0.0, 0.44),
            # Jack corner lenses, sampled unlit at 84,99,75 and 120,114,64.
            "mt312_led_green": pbr("CRS312 Jack Green", [92, 156, 96, 255], 0.0, 0.22,
                                   emissive=[0.04, 0.18, 0.05]),
            "mt312_led_olive": pbr("CRS312 Jack Olive", [172, 164, 78, 255], 0.0, 0.24,
                                   emissive=[0.16, 0.14, 0.01]),
            "mt312_dome_green": pbr("CRS312 User Dome", [117, 136, 105, 255], 0.0, 0.20,
                                    emissive=[0.05, 0.15, 0.05]),
            "mt312_dome_red": pbr("CRS312 Fault Dome", [147, 70, 72, 255], 0.0, 0.20,
                                  emissive=[0.15, 0.02, 0.02]),
            "mt312_dome_blue": pbr("CRS312 Power Dome", [81, 110, 149, 255], 0.0, 0.20,
                                   emissive=[0.03, 0.07, 0.18]),
        })

    # ------------------------------------------------------------- measured
    #
    # Photograph 1825 calibrated on the ear span: 2606 pixels across the
    # 482.6mm of a 19 inch face plate at the panel mid line, so a pixel is
    # 0.18519mm. Cross checked on the body, 2397 pixels or 443.9mm against
    # the 443mm published, which is within half a millimetre.
    #
    # The ear stands 232 pixels for 44.45mm, making the vertical scale 3.8
    # percent short of horizontal. Vertical figures are therefore fractions
    # of the measured panel height; horizontal figures are metres from the
    # body's left edge.

    #: Twelve jacks in one row: first centre, pitch, and the extra a block
    #: boundary adds at every fourth jack. Cross checked against the printed
    #: port numbers, which land within 0.4mm of these centres all the way
    #: across, and that agreement is what says the pitch is right.
    JACK0, PITCH, GAP = 0.02138, 0.015790, 0.006200
    BLOCK_X = ((0.01259, 0.07794), (0.08201, 0.14699), (0.15143, 0.21622))
    BLOCK_Z = (-0.0022, -0.3095)
    JACK_Z = (-0.0152, -0.2619)
    JACK_W = 0.01462
    #: The chevron vent over the copper, and its repeat.
    VENT_X, VENT_Z = (0.01814, 0.21049), (0.3485, 0.1147)
    BAR_PITCH, BAR_W, BAR_TILT = 0.006680, 0.00240, 43.0
    #: The pale blue combo field: a label strip under the copper half and a
    #: full block behind the optics.
    COMBO_STRIP_X, COMBO_STRIP_Z = (0.15140, 0.21920), (-0.288, -0.439)
    COMBO_FIELD_X, COMBO_FIELD_Z = (0.22180, 0.25450), (0.340, -0.383)
    #: Four SFP+ cages two by two.
    SFP_COL = ((0.22252, 0.23659), (0.23677, 0.25103))
    SFP_TOP_Z, SFP_BOT_Z = (0.2576, 0.0628), (-0.0628, -0.2922)
    #: Console over management, then reset, USB and the four domes.
    MGMT_X = (0.25677, 0.27454)
    MGMT_TOP_Z, MGMT_BOT_Z = (0.2706, 0.0140), (-0.0300, -0.3225)
    RESET_X, RESET_Z, RESET_R = 0.27907, -0.2208, 0.00195
    USB_X, USB_Z = (0.28416, 0.29175), (0.0152, -0.3182)
    DOME_X, DOME_R = 0.29713, 0.00175
    DOME_Z = (0.106, -0.006, -0.119, -0.232)

    def jack_x(self, i: int) -> float:
        """Centre of jack `i`, metres from the panel's left edge."""
        return self.JACK0 + i * self.PITCH + (i // 4) * self.GAP

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """All the lettering, as one transparent overlay over the panel."""
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (92, 92, 96, 255)
        dark = (30, 30, 32, 255)

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

        def vertical(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            tile = Image.new("RGBA", (b[2] - b[0] + 8, b[3] - b[1] + 8), (0, 0, 0, 0))
            ImageDraw.Draw(tile).text((4 - b[0], 4 - b[1]), text, font=f, fill=fill)
            tile = tile.rotate(90, expand=True)
            img.alpha_composite(tile, (round(cx - tile.width / 2), round(cy - tile.height / 2)))

        # ---- port numbers. The eight copper ports are numbered plainly and
        #      the four combo ports carry a T for the twisted pair half,
        #      which is the only place on any MikroTik panel where a port
        #      number is not just a number.
        f_num = sized(1.55)
        for i in range(12):
            label = str(i + 1) if i < 8 else f"{i - 7}T"
            centred(label, px(self.jack_x(i)), py(-0.3485), f_num)

        # ---- 10G ETHERNET vertical in each gap between blocks, measured at
        #      79.5, 148.6 and 217.7mm.
        f_lab = sized(1.45)
        for gx in (0.07950, 0.14865, 0.21770):
            vertical("10G ETHERNET", px(gx), py(-0.150), f_lab)
        vertical("SFP+", px(0.25390), py(-0.020), f_lab)
        centred("10G COMBO", px(0.18400), py(0.0410), f_lab)

        # ---- optics numbering: the fibre half of each combo port.
        for i, (sx0, sx1) in enumerate(self.SFP_COL):
            cx = px((sx0 + sx1) / 2)
            centred(("2F", "4F")[i], cx, py(0.3100), f_lab)
            centred(("1F", "3F")[i], cx, py(-0.3400), f_lab)

        # ---- console cluster and dome names.
        mc = px(sum(self.MGMT_X) / 2)
        centred("CONSOLE", mc, py(0.3100), f_lab)
        centred("MGMT/BOOT", mc, py(-0.3800), f_lab)
        centred("RESET", px(self.RESET_X), py(-0.3800), f_lab)
        for label, zf in zip(("USER", "FAULT", "POWER 2", "POWER 1"), self.DOME_Z):
            b = d.textbbox((0, 0), label, font=f_lab)
            d.text((px(0.30000), py(zf) - (b[3] + b[1]) / 2), label, font=f_lab, fill=dark)

        # ---- the right sixth. Measured boxes: the product line runs 401.9
        #      to 440.8mm, the model number 416.9 to 440.6 and the wordmark
        #      415.2 to 438.9. All three are noticeably smaller than the
        #      same three strings on the CRS317, so they are fitted to their
        #      own measurements rather than reused.
        centred("Cloud Router Switch", px(0.42135), py(0.3550),
                fitted("Cloud Router Switch", 38.9, True))
        centred("CRS312-4C+8XG", px(0.42875), py(0.2530),
                fitted("CRS312-4C+8XG", 23.7))
        f_mark = fitted("MikroTik", 23.7)
        f_bold = font(f_mark.size, True)
        wx = px(0.41520)
        wtop = py(-0.3640) - d.textbbox((0, 0), "M", font=f_bold)[3] / 2
        d.text((wx, wtop), "Mikro", font=f_mark, fill=dark)
        wx += d.textbbox((0, 0), "Mikro", font=f_mark)[2]
        d.text((wx, wtop), "Tik", font=f_bold, fill=dark)

        tex = save_texture("crs312_silkscreen.png", img)
        rack.materials["mt312_silktex"] = PBRMaterial(
            name="CRS312 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "mt312_silktex",
                            (0, self.face(rack) - 0.0010, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def chevron(self, rack, g, z, x0, x1):
        """The zigzag vent band over the copper.

        A continuous run of thick slanted bars whose slope flips every bar,
        which is what makes the eye read one long zigzag rather than a
        row of stripes, with a small solid triangle in each notch. The
        repeat measures 26.7mm across four bars, so the bar pitch is 6.68mm
        and the tilt about 47 degrees off horizontal.
        """
        y = self.face(rack)
        top, bot = self.VENT_Z
        h = (top - bot) * self.height
        cz = z + (top + bot) / 2 * self.height
        tilt = math.radians(self.BAR_TILT)
        # A box that spans the band once tilted has to be longer than the
        # band is tall, by exactly one over the cosine of the tilt.
        length = h / math.cos(tilt)
        n = int((x1 - x0) / self.BAR_PITCH)
        for i in range(n):
            cx = x0 + self.BAR_PITCH * (i + 0.5)
            rack.rotated_box(g, "mt312_vent", (cx, y - 0.0004, cz),
                             (self.BAR_W, 0.0026, length),
                             tilt if i % 2 else -tilt)
            # The notch triangle, alternating with the slope so it always
            # sits in the wedge the two neighbouring bars leave open.
            if i < n - 1:
                up = (i % 2 == 0)
                tz = cz + (h * 0.30 if up else -h * 0.30)
                s = self.BAR_PITCH * 0.52
                for k in range(3):
                    t = (k + 0.5) / 3
                    wide = s * t if up else s * (1 - t)
                    rack.box(g, "mt312_vent",
                             (cx + self.BAR_PITCH / 2, y - 0.0004, tz + s * (0.5 - t)),
                             (max(wide, s * 0.16), 0.0026, s * 0.36))

    def jack(self, rack, g, x, z, w, h):
        """One shielded 10GBASE-T jack.

        This is not the bare black keyhole the gigabit MikroTiks punch. The
        photograph shows a pale metal shell around the mouth, a row of gold
        contact fingers hanging from the roof of the cavity, a lighter lower
        lip, and two moulded lenses standing proud of the top edge. The gold
        is what carries it: without those eight fingers the mouth is a black
        rectangle and could be any connector at all.
        """
        y = self.face(rack)
        rim = 0.0013
        for dx, dz, bw, bh in ((0, h / 2 - rim / 2, w, rim), (0, -h / 2 + rim / 2, w, rim),
                               (-w / 2 + rim / 2, 0, rim, h), (w / 2 - rim / 2, 0, rim, h)):
            rack.box(g, "mt312_shell", (x + dx, y - 0.0016, z + dz), (bw, 0.0014, bh))
        rack.box(g, "mt312_cavity", (x, y - 0.0007, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "mt312_cavity", (x, y + 0.0046, z), (w * 0.82, 0.0092, h * 0.80))
        # The keyway notch in the shell's top rail, then the contacts.
        rack.box(g, "mt312_cavity", (x, y - 0.0019, z + h * 0.42), (w * 0.30, 0.0012, h * 0.18))
        for i in range(8):
            cx = x - w * 0.27 + i * (w * 0.54 / 7)
            rack.box(g, "mt312_gold", (cx, y - 0.0021, z + h * 0.04),
                     (w * 0.035, 0.0006, h * 0.40))
        rack.box(g, "mt312_lip", (x, y - 0.0020, z - h * 0.36), (w * 0.78, 0.0007, h * 0.16))
        # Two lenses on the top edge, green left and olive right, standing
        # out of the shell rather than sunk into the mouth.
        for dx, mat in ((-w * 0.33, "mt312_led_green"), (w * 0.33, "mt312_led_olive")):
            rack.box(g, mat, (x + dx, y - 0.0022, z + h * 0.44), (w * 0.22, 0.0012, h * 0.18))

    def cage(self, rack, g, x, z, w, h, top_row):
        """One SFP+ cage in the combo block.

        The card edge faces the middle of the block on both rows, so the
        two rows mirror. The bottom row also shows three green contact pads
        on its outer lip, which the top row does not, and that asymmetry is
        in the photograph rather than being a simplification.
        """
        y = self.face(rack)
        rim = 0.0009
        for dx, dz, bw, bh in ((0, h / 2 - rim / 2, w, rim), (0, -h / 2 + rim / 2, w, rim),
                               (-w / 2 + rim / 2, 0, rim, h), (w / 2 - rim / 2, 0, rim, h)):
            rack.box(g, "mt312_cage", (x + dx, y - 0.0015, z + dz), (bw, 0.0013, bh))
        rack.box(g, "mt312_bore", (x, y - 0.0006, z), (w - rim * 2, 0.0020, h - rim * 2))
        rack.box(g, "mt312_bore", (x, y + 0.0042, z), (w * 0.90, 0.0110, h * 0.86))
        toward = -1.0 if top_row else 1.0
        rack.box(g, "mt312_edge", (x, y - 0.0019, z + toward * h * 0.32),
                 (w * 0.34, 0.0008, h * 0.09))
        for k in (0.86, 0.62):
            rack.box(g, "mt312_cage", (x, y - 0.0018, z - toward * h * 0.34 * k),
                     (w * 0.74, 0.0007, h * 0.05))
        if not top_row:
            for i in (-1, 0, 1):
                rack.box(g, "mt312_pad", (x + i * w * 0.24, y - 0.0018, z - h * 0.40),
                         (w * 0.12, 0.0007, h * 0.08))

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

        def band(x0, x1, z0, z1, mat, dy=0.0004, depth=0.0008):
            rack.box(g, mat, (X((x0 + x1) / 2), y - dy, Z((z0 + z1) / 2)),
                     (x1 - x0, depth, (z0 - z1) * h))

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "mt312_panel", (0, rack.front_y, z), (w, 0.0100, h),
                           radius=0.0011, bevel=0.0005, steps=6)
        rack.box(g, "mt312_lid", (0, y + 0.012 + self.depth * 0.32, z + h * 0.47),
                 (w - 0.012, self.depth * 0.64, 0.0018))

        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0099)
            rack.rounded_prism(g, "mt312_ear", (ex, y + 0.0013, z), (0.0198, 0.0080, h * 0.99),
                               radius=0.0013, bevel=0.0005, steps=6)
            for dz in (0.355, -0.345):
                rack.rounded_prism(g, "mt312_vent", (ex, y - 0.0026, Z(dz)),
                                   (0.0130, 0.0028, 0.0058),
                                   radius=0.0028, bevel=0.0006, steps=8)
            rack.box(g, "mt312_fold", (sx * w / 2, y + 0.0006, z), (0.0010, 0.0060, h * 0.98))

        # ---- the two blue fields, laid down before anything sits on them
        band(*self.COMBO_STRIP_X, *self.COMBO_STRIP_Z, "mt312_combo")
        band(*self.COMBO_FIELD_X, *self.COMBO_FIELD_Z, "mt312_combo")

        # ---- chevron vent over the copper -------------------------------
        self.chevron(rack, g, z, X(self.VENT_X[0]), X(self.VENT_X[1]))

        # ---- twelve jacks in three ganged blocks ------------------------
        jz = Z((self.JACK_Z[0] + self.JACK_Z[1]) / 2)
        jh = (self.JACK_Z[0] - self.JACK_Z[1]) * h
        for grp, (bx0, bx1) in enumerate(self.BLOCK_X):
            band(bx0, bx1, *self.BLOCK_Z, "mt312_housing_edge", dy=0.0004, depth=0.0008)
            band(bx0 + 0.0006, bx1 - 0.0006, self.BLOCK_Z[0] - 0.010, self.BLOCK_Z[1] + 0.010,
                 "mt312_housing", dy=0.0007, depth=0.0008)
            for col in range(4):
                self.jack(rack, g, X(self.jack_x(grp * 4 + col)), jz, self.JACK_W, jh)

        # ---- four cages two by two on the blue field --------------------
        for col, (sx0, sx1) in enumerate(self.SFP_COL):
            cx = X((sx0 + sx1) / 2)
            cw = sx1 - sx0
            for (zt, zb), top in ((self.SFP_TOP_Z, True), (self.SFP_BOT_Z, False)):
                self.cage(rack, g, cx, Z((zt + zb) / 2), cw, (zt - zb) * h, top)

        # ---- console over management ------------------------------------
        mx0, mx1 = self.MGMT_X
        mcx, mcw = X((mx0 + mx1) / 2), mx1 - mx0
        band(mx0, mx1, self.MGMT_TOP_Z[0] + 0.008, self.MGMT_BOT_Z[1] - 0.008,
             "mt312_housing_edge")
        for (zt, zb), lit in ((self.MGMT_TOP_Z, False), (self.MGMT_BOT_Z, True)):
            jz2 = Z((zt + zb) / 2)
            jh2 = (zt - zb) * h
            self.jack(rack, g, mcx, jz2, mcw * 0.86, jh2)
            if not lit:
                # Console has no lamps. The jack helper always draws the
                # pair, so the console's are painted out in shell grey
                # rather than given a flag: two boxes is cheaper than a
                # branch through every one of the twelve copper ports.
                for dx in (-mcw * 0.86 * 0.33, mcw * 0.86 * 0.33):
                    rack.box(g, "mt312_shell", (mcx + dx, y - 0.0023, jz2 + jh2 * 0.44),
                             (mcw * 0.86 * 0.24, 0.0010, jh2 * 0.20))

        # ---- reset, USB and the four domes ------------------------------
        rack.front_cylinder(g, "mt312_reset", (X(self.RESET_X), y - 0.0014, Z(self.RESET_Z)),
                            self.RESET_R, 0.0016, 20)
        ux0, ux1 = self.USB_X
        uz0, uz1 = self.USB_Z
        ucx, ucz = X((ux0 + ux1) / 2), Z((uz0 + uz1) / 2)
        uw, uh = ux1 - ux0, (uz0 - uz1) * h
        rack.box(g, "mt312_usb", (ucx, y - 0.0010, ucz), (uw, 0.0010, uh))
        rack.box(g, "mt312_shell", (ucx, y - 0.0014, ucz), (uw - 0.0008, 0.0010, uh - 0.0008))
        rack.box(g, "mt312_cavity", (ucx, y - 0.0016, ucz), (uw * 0.56, 0.0010, uh * 0.74))
        rack.box(g, "mt312_usb_tongue", (ucx - uw * 0.09, y - 0.0018, ucz - uh * 0.05),
                 (uw * 0.24, 0.0009, uh * 0.56))
        for zf, mat in zip(self.DOME_Z, ("mt312_dome_green", "mt312_dome_red",
                                         "mt312_dome_blue", "mt312_dome_blue")):
            rack.front_cylinder(g, mat, (X(self.DOME_X), y - 0.0013, Z(zf)),
                                self.DOME_R, 0.0014, 20)

        self.silkscreen(rack, z)
