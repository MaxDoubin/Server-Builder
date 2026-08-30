"""Cisco Firepower 2140, drawn from a dead on photograph of the appliance.

The only one of these four Cisco boxes that is not a switch, and it does
not look like one. A Firepower 2100 is a black lidded chassis with a
brushed grey bezel, and almost the whole of that bezel is hexagonal
honeycomb: the solid parts are islands where something has to be mounted,
not the other way round. Get that relationship backwards, put a few vents
on a solid panel, and the model reads as a switch with holes in it.

The reference is unusually kind. It is genuinely front on, so nothing is
foreshortened in either axis, and it is neutral, R equals G equals B on
every sample, so the colours come off it without a white balance step. The
body measures 990 pixels for the 437mm chassis, a pixel is 0.441mm across
and 0.436mm down, and the copper port pitch comes out at 14.2mm, which is
the same RJ45 gang the two Catalysts in this library carry. Three
independent photographs agreeing on 14.1 to 14.2mm is the strongest check
any of these models has.

What the photograph shows, left to right:

  The cisco mark over FPR-2100 SERIES, then the first honeycomb field with
  a yellow ESD warning label stuck on its top right corner. Under the
  honeycomb, two rows of LED windows: PWR, the power glyph, SYS, ACT, SSD1
  and SSD2 above, PSU-1, PSU-2 and FAN below. Then a USB A host port.

  Everything that carries traffic is ringed in yellow silkscreen, which is
  the Firepower's signature and the quickest way to tell one from a
  Catalyst across a room. A yellow box around the stacked GE MGMT and
  CONSOLE jacks. A thick yellow frame around the twelve data ports, six
  columns two high, with the odd numbers on the band above and the even
  numbers on the band below and a small WAN tag over port one. A third
  yellow box around the four SFP+ cages, numbered 13 to 16.

  Two slim horizontal drawers across the top of the right hand half, each
  held by captive thumbscrews at both ends: SSD1 with an FPR2K-SSD200
  fitted, and SSD2. Below them, the network module bay with a blank in it,
  which is a brighter plate than the bezel with two rows of hexagonal
  holes and a thumbscrew of its own.

Nothing here is shared with another product. The RJ45s carry corner LEDs
inside the shield, which neither Catalyst does, and they sit in a yellow
ringed island in a field of hexagons, which nothing else in this library
does at all.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class FPR2140(Device):
    slug = "FIREPOWER_2140"
    name = "Cisco Firepower 2140"
    u = 1
    #: 1RU, 17.2 inches across the body. The photograph's 990 pixel span
    #: and the 14.2mm RJ45 pitch it implies both agree with this.
    width = 0.437
    depth = 0.508
    source = ("https://www.cisco.com/c/en/us/products/collateral/security/"
              "firepower-2100-series/datasheet-c78-742473.html")
    references = [
        Reference("https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-FPR2140-ASA-K9.jpg",
                  "1040x1040, dead on front, every position and colour off this"),
    ]

    def face(self, rack) -> float:
        """The visible plane of the bezel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared.

        This photograph is neutral so every value below is the number the
        file holds, with only the studio's own lift taken off. The bezel
        samples 150, which is a good sixty points darker than either
        Catalyst and about the largest colour difference in this library.
        The lid samples 43, near black. Painting a Firepower in Catalyst
        grey, or a Catalyst in this one, is exactly the mistake that costs
        most, so both numbers are recorded here rather than inferred.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Brushed grey aluminium bezel, matte. High roughness on
            # purpose: at anything glossier the studio lays a band of
            # highlight across the honeycomb and the holes disappear.
            "fp_bezel": pbr("FPR2140 Bezel", [156, 157, 156, 255], 0.30, 0.48),
            "fp_bezel_edge": pbr("FPR2140 Bezel Edge", [176, 177, 176, 255], 0.36, 0.40),
            # The lid is the thing you see first on a Firepower and it is
            # very nearly black.
            "fp_lid": pbr("FPR2140 Lid", [46, 46, 47, 255], 0.12, 0.62),
            "fp_ear": pbr("FPR2140 Rack Bracket", [186, 190, 194, 255], 0.34, 0.32),
            "fp_hex": pbr("FPR2140 Vent Hole", [28, 28, 29, 255], 0.06, 0.90),
            # Cisco's warning yellow, sampled at 239,222,75 off the port
            # frames, and the ESD label's darker adhesive yellow at
            # 219,189,18. They are two different yellows and printing them
            # as one loses the label.
            "fp_yellow": pbr("FPR2140 Port Frame", [238, 220, 76, 255], 0.0, 0.56),
            "fp_esd": pbr("FPR2140 ESD Label", [218, 188, 26, 255], 0.0, 0.50),
            # RJ45 shields are plated and read light against the bezel.
            "fp_shield": pbr("FPR2140 Jack Shield", [188, 189, 187, 255], 0.40, 0.36),
            "fp_throat": pbr("FPR2140 Jack Throat", [10, 10, 11, 255], 0.04, 0.94),
            "fp_contact": pbr("FPR2140 Jack Contacts", [150, 124, 70, 255], 0.72, 0.38),
            # The per port LEDs sit inside the shield at the corners, which
            # neither Catalyst here does. Unlit they are dark olive lenses.
            "fp_portled": pbr("FPR2140 Port LED", [64, 72, 58, 255], 0.0, 0.40),
            "fp_ledwin": pbr("FPR2140 Status LED", [40, 41, 42, 255], 0.08, 0.44),
            "fp_cage": pbr("FPR2140 SFP Cage", [202, 203, 200, 255], 0.58, 0.28),
            "fp_cage_bore": pbr("FPR2140 SFP Bore", [12, 12, 13, 255], 0.12, 0.90),
            # The drawers and the module blank are brighter plated steel
            # than the anodised bezel around them, which is what makes the
            # right hand half of this panel read as three separate parts.
            "fp_drawer": pbr("FPR2140 SSD Carrier", [180, 181, 179, 255], 0.44, 0.34),
            "fp_module": pbr("FPR2140 Module Blank", [206, 207, 204, 255], 0.44, 0.32),
            "fp_screw": pbr("FPR2140 Thumbscrew", [214, 215, 216, 255], 0.44, 0.26),
            "fp_usb": pbr("FPR2140 USB Shell", [176, 177, 175, 255], 0.44, 0.36),
            "fp_usb_tongue": pbr("FPR2140 USB Tongue", [198, 199, 196, 255], 0.0, 0.62),
        })

    # ------------------------------------------------------------- measured
    #
    # Off the one photograph, which is dead on in both axes: the bezel spans
    # 990 pixels for the 437mm body and 102 pixels for the 44.45mm height,
    # putting a pixel at 0.4414mm across and 0.4358mm down. Those two being
    # within one percent of each other is what says the camera was square
    # to the panel, and it is why this is the only one of the four Cisco
    # models that needed no perspective correction at all.
    #
    # Horizontal figures are metres from the left edge of the 437mm body.
    # Vertical figures are fractions of panel height with zero at the
    # middle.

    #: Six data columns on the same 14.2mm gang pitch the Catalysts use.
    COL0, PITCH = 0.1468, 0.01420
    JACK_W, KEY_W = 0.01280, 0.00700
    #: Management and console, stacked in their own two port gang.
    MGMT_X = 0.1218

    #: The two rows, and where each latch keyway stops. The block sits
    #: below the middle of the panel because the LED legends and the SSD
    #: drawers take the top of it.
    ROW_TOP = (0.1505, -0.016)
    ROW_BOT = (-0.114, -0.2805)
    KEY_TOP, KEY_BOT = 0.2045, -0.3345

    #: Yellow silkscreen frames, which is what a Firepower wears instead of
    #: a port block.
    FRAME_PORTS = (0.1364, 0.2278)
    FRAME_MGMT = (0.1117, 0.1320)
    FRAME_SFP = (0.2520, 0.3151)
    FRAME_Z = (0.294, -0.392)
    FRAME_SFP_Z = (-0.020, -0.412)

    #: Four SFP+ cages, spread a little wider than the copper.
    SFP_X0, SFP_PITCH = 0.2618, 0.01465
    SFP_W, SFP_H = 0.01390, 0.00900
    SFP_Z = -0.245

    #: Honeycomb. A row across the top of the bezel, a field under the
    #: branding, and a field filling the whole right hand half.
    HEX_W, HEX_PITCH, HEX_ROW = 0.00500, 0.00620, 0.00435
    VENT_TOP = (0.1059, 0.2428, 0.441, 0.343)
    VENT_LEFT = (0.0309, 0.1112, 0.147, -0.245)
    VENT_RIGHT = (0.2300, 0.3340, 0.157, -0.460)

    #: The branding block and the status LEDs under the left honeycomb.
    LOGO_X = 0.0104
    ESD_X, ESD_Z = (0.0954, 0.1055), (0.382, 0.167)
    LED_ROW1_Z, LED_ROW2_Z = -0.357, -0.416
    LED1_X = (0.0530, 0.0640, 0.0750, 0.0860, 0.0970, 0.1075)
    LED2_X = (0.0585, 0.0805, 0.1020)
    USBA_X, USBA_W = 0.1000, 0.0146
    USBA_Z = -0.260

    #: The two SSD drawers and the network module bay.
    SSD1_X = (0.2472, 0.3196)
    SSD2_X = (0.3514, 0.4221)
    DRAWER_Z = (0.382, 0.176)
    NM_X = (0.3359, 0.4321)
    NM_Z = (0.127, -0.470)
    SCREW_X = (0.2410, 0.3271, 0.3465, 0.4280)
    SCREW_Z = 0.157

    def column_x(self, i: int) -> float:
        """Centre of data column `i`, metres from the body's left edge."""
        return self.COL0 + i * self.PITCH

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the bezel, as one transparent overlay.

        Two inks, and keeping them apart matters. The panel legends are a
        pale grey printed on brushed aluminium; the port numbers are near
        black printed on the yellow frames. Set both in one colour and
        either the numbers vanish into the yellow or the legends glare off
        the metal.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        pale = (216, 217, 215, 255)               # legends on the grey bezel
        onyel = (36, 34, 22, 255)                 # numbers on the yellow bands
        dark = (58, 59, 58, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=pale):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- branding block: mark, wordmark, then two lines of series.
        mark_cx, mark_cy = px(self.LOGO_X), py(0.324)
        bar_w, bar_gap = 0.00032 * ppm, 0.00100 * ppm
        for i in range(9):
            hb = (0.0019 if i in (0, 4, 8) else 0.0011) * ppm
            x = mark_cx + (i - 4) * bar_gap
            d.rectangle([x - bar_w / 2, mark_cy - hb, x + bar_w / 2, mark_cy], fill=pale)
        centred("CISCO", mark_cx, py(0.264), sized(1.7, True))
        centred("FPR-2100", mark_cx, py(0.176), sized(1.5))
        centred("SERIES", mark_cx - 0.0016 * ppm, py(0.107), sized(1.5))

        # ---- status LED legends. The upper row is labelled above its
        #      windows and the lower row below its own, which is how the
        #      bezel prints them and why they are two separate loops.
        f_leg = sized(1.2)
        for lx, lab in zip(self.LED1_X, ("PWR", "", "SYS", "ACT", "SSD1", "SSD2")):
            if lab:
                centred(lab, px(lx), py(self.LED_ROW1_Z + 0.098), f_leg)
        for lx, lab in zip(self.LED2_X, ("PSU-1", "PSU-2", "FAN")):
            centred(lab, px(lx), py(self.LED_ROW2_Z - 0.078), f_leg)

        # The second legend on the upper row is the IEC standby mark and
        # the one beside the host port is the USB trident. Both are drawn
        # here rather than set in type, because DejaVu carries neither
        # U+23FB nor U+2442 and PIL renders a missing character as a
        # hollow rectangle, which on a panel reads as a manufacturing fault.
        gx, gy = px(self.LED1_X[1]), py(self.LED_ROW1_Z + 0.098)
        r = 0.0009 * ppm
        d.arc([gx - r, gy - r, gx + r, gy + r], start=300, end=240, fill=pale, width=2)
        d.line([(gx, gy - r * 1.3), (gx, gy - r * 0.1)], fill=pale, width=2)

        tx, ty = px(self.USBA_X), py(self.USBA_Z - 0.150)
        r = 0.0008 * ppm
        d.line([(tx, ty + r * 2.2), (tx, ty - r * 2.2)], fill=pale, width=2)
        d.ellipse([tx - r * 0.6, ty + r * 1.6, tx + r * 0.6, ty + r * 2.8], fill=pale)
        d.line([(tx, ty + r * 0.4), (tx - r * 1.6, ty - r * 0.9)], fill=pale, width=2)
        d.line([(tx, ty - r * 0.2), (tx + r * 1.6, ty - r * 1.5)], fill=pale, width=2)
        d.rectangle([tx - r * 2.1, ty - r * 1.5, tx - r * 1.1, ty - r * 0.5], fill=pale)
        d.polygon([(tx + r * 1.1, ty - r * 2.1), (tx + r * 2.1, ty - r * 1.6),
                   (tx + r * 1.2, ty - r * 1.0)], fill=pale)

        # ---- yellow framed groups. GE MGMT over the pair, CONSOLE under,
        #      then the data numbering, odd above and even below.
        f_yel = sized(1.5, True)
        band_hi, band_lo = self.FRAME_Z[0] - 0.029, self.FRAME_Z[1] + 0.029
        centred("GE MGMT", px(self.MGMT_X), py(band_hi), f_yel, onyel)
        centred("CONSOLE", px(self.MGMT_X), py(band_lo), f_yel, onyel)
        for i in range(6):
            cx = px(self.column_x(i))
            centred(str(i * 2 + 1), cx, py(band_hi), f_yel, onyel)
            centred(str(i * 2 + 2), cx, py(band_lo), f_yel, onyel)
        centred("WAN", px(self.FRAME_PORTS[0] + 0.0100), py(0.360), sized(1.3), dark)
        sfp_hi = self.FRAME_SFP_Z[0] - 0.029
        sfp_lo = self.FRAME_SFP_Z[1] + 0.029
        for i in range(4):
            centred(str(i + 13), px(self.SFP_X0 + i * self.SFP_PITCH), py(sfp_hi), f_yel, onyel)
        centred("SFP+", px(self.SFP_X0 + self.SFP_PITCH * 0.6), py(sfp_lo), sized(1.3), onyel)

        # ---- the drawers and the module bay.
        centred("FPR2K-SSD200", px(sum(self.SSD1_X) / 2), py(sum(self.DRAWER_Z) / 2),
                sized(1.4), dark)
        centred("SSD1", px(self.SSD1_X[1] + 0.0080), py(0.402), sized(1.1))
        centred("SSD2", px(self.SSD2_X[0] - 0.0080), py(0.402), sized(1.1))
        centred("NM1", px(self.FRAME_SFP[0] - 0.0125), py(-0.245), sized(1.1))

        tex = save_texture("firepower_2140_silkscreen.png", img)
        rack.materials["fp_silktex"] = PBRMaterial(
            name="FPR2140 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.58,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "fp_silktex",
                            (0, self.face(rack) - 0.0034, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def hex_field(self, rack, g: str, z: float, x0: float, x1: float,
                  z0: float, z1: float) -> None:
        """A field of hexagonal perforations.

        The Firepower's hexes lie on their sides and are big, 5.6mm across
        on a 6.2mm pitch, so unlike the 9200L's fine mesh these are
        individually legible and the webs between them are thin. Every
        other row is offset half a pitch, which is what makes a honeycomb
        rather than a grid of holes.
        """
        y = self.face(rack)
        h = self.height
        cz = z + (z0 + z1) / 2 * h
        hz = (z0 - z1) * h
        rows = max(1, int(round(hz / self.HEX_ROW)))
        cell = hz / rows
        for r in range(rows):
            rz = cz + (rows - 1) / 2 * cell - r * cell
            offset = (self.HEX_PITCH / 2) if r % 2 else 0.0
            n = int((x1 - x0 - offset) / self.HEX_PITCH)
            for i in range(n):
                hx = x0 + offset + self.HEX_PITCH * 0.5 + i * self.HEX_PITCH
                if hx + self.HEX_W / 2 > x1:
                    continue
                for fw, fh in ((1.00, 0.36), (0.74, 0.70), (0.42, 0.98)):
                    rack.box(g, "fp_hex", (hx, y - 0.0007, rz),
                             (self.HEX_W * fw, 0.0010, cell * 0.88 * fh))

    def jack(self, rack, g: str, x: float, z: float, top_row: bool) -> None:
        """One RJ45 as the Firepower wears it.

        The distinguishing feature is not the opening, which is the same
        gang the Catalysts use, but the pair of LED lenses set into the
        shield at the outward corners of every port. Unlit they are a dark
        olive, and in a rack render they are the only green on the panel.
        """
        y = self.face(rack)
        h = self.height
        w = self.JACK_W
        top, bot = (self.ROW_TOP if top_row else self.ROW_BOT)
        oh = (top - bot) * h
        cz = z + (top + bot) / 2 * h
        sign = 1 if top_row else -1
        key_h = abs((self.KEY_TOP if top_row else self.KEY_BOT) - (top if top_row else bot)) * h

        # Shield plate first, then the darkness punched through it.
        rack.box(g, "fp_shield", (x, y - 0.0014, cz),
                 (w + 0.0016, 0.0012, oh + key_h + 0.0020))
        rack.box(g, "fp_throat", (x, y - 0.0022, cz), (w, 0.0014, oh))
        rack.box(g, "fp_throat", (x, y + 0.0040, cz), (w * 0.88, 0.0100, oh * 0.86))
        key_cz = cz + sign * (oh / 2 + key_h / 2)
        rack.box(g, "fp_throat", (x, y - 0.0022, key_cz), (self.KEY_W, 0.0014, key_h))
        rack.box(g, "fp_throat", (x, y + 0.0034, key_cz), (self.KEY_W * 0.82, 0.0080, key_h))

        # Corner lenses, on the same edge the keyway is on.
        for dx in (-w * 0.36, w * 0.36):
            rack.box(g, "fp_portled", (x + dx, y - 0.0029, cz + sign * (oh / 2 + key_h * 0.42)),
                     (w * 0.20, 0.0008, key_h * 0.66))
        tongue_z = cz - sign * oh * 0.26
        for i in range(8):
            cx = x - w * 0.25 + i * (w * 0.50 / 7)
            rack.box(g, "fp_contact", (cx, y - 0.0029, tongue_z),
                     (w * 0.027, 0.0006, oh * 0.15))

    def sfp(self, rack, g: str, x: float, z: float) -> None:
        """One SFP+ cage, empty, with its bail latch folded up."""
        y = self.face(rack)
        w, hh = self.SFP_W, self.SFP_H
        rack.box(g, "fp_cage_bore", (x, y - 0.0020, z), (w, 0.0016, hh))
        rack.box(g, "fp_cage_bore", (x, y + 0.0040, z), (w * 0.88, 0.0100, hh * 0.84))
        rim = 0.0009
        for dx, dz, bw, bh in ((0, hh / 2 + rim / 2, w + rim * 2, rim),
                               (0, -hh / 2 - rim / 2, w + rim * 2, rim),
                               (-w / 2 - rim / 2, 0, rim, hh + rim * 2),
                               (w / 2 + rim / 2, 0, rim, hh + rim * 2)):
            rack.box(g, "fp_cage", (x + dx, y - 0.0028, z + dz), (bw, 0.0016, bh))
        # Stamped roof ridge, and the card edge low in the mouth.
        rack.box(g, "fp_cage", (x, y - 0.0028, z + hh * 0.30), (w * 0.70, 0.0007, hh * 0.05))
        rack.box(g, "fp_cage", (x, y - 0.0028, z - hh * 0.30), (w * 0.34, 0.0007, hh * 0.07))

    def thumbscrew(self, rack, g: str, x: float, z: float) -> None:
        """A captive knurled thumbscrew. There are four across this bezel."""
        y = self.face(rack)
        rack.front_cylinder(g, "fp_screw", (x, y - 0.0026, z), 0.0038, 0.0030, 20)
        rack.front_cylinder(g, "fp_hex", (x, y - 0.0042, z), 0.0013, 0.0008, 12)

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
        rack.rounded_prism(g, "fp_bezel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0010, bevel=0.0005, steps=6)
        # The black lid, which is the first thing anyone recognises about a
        # Firepower and the reason it never reads as a Catalyst.
        rack.box(g, "fp_lid", (0, y + 0.014 + self.depth * 0.45, z + h * 0.470),
                 (w - 0.004, self.depth * 0.90, 0.0030))
        rack.box(g, "fp_lid", (0, y - 0.0004, z + h * 0.466), (w - 0.003, 0.0012, h * 0.068))
        rack.box(g, "fp_bezel_edge", (0, y - 0.0004, z - h * 0.487), (w - 0.006, 0.0006, 0.0012))

        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0114)
            rack.rounded_prism(g, "fp_ear", (ex, y + 0.0014, z), (0.0228, 0.0075, h * 0.96),
                               radius=0.0022, bevel=0.0006, steps=6)
            for dz in (h * 0.27, -h * 0.27):
                rack.rounded_prism(g, "fp_hex", (ex, y - 0.0026, z + dz),
                                   (0.0130, 0.0026, 0.0062), radius=0.0030, bevel=0.0005, steps=8)

        # ---- honeycomb, laid down before anything that sits on it -------
        for x0, x1, z0, z1 in (self.VENT_TOP, self.VENT_LEFT, self.VENT_RIGHT):
            self.hex_field(rack, g, z, X(x0), X(x1), z0, z1)

        # ---- branding, ESD label and the status LEDs --------------------
        ex0, ex1 = self.ESD_X
        ez0, ez1 = self.ESD_Z
        rack.rounded_prism(g, "fp_esd", (X((ex0 + ex1) / 2), y - 0.0010, Z((ez0 + ez1) / 2)),
                           (ex1 - ex0, 0.0008, (ez0 - ez1) * h), radius=0.0008, bevel=0.0003, steps=5)
        for lx in self.LED1_X:
            rack.box(g, "fp_ledwin", (X(lx), y - 0.0012, Z(self.LED_ROW1_Z)), (0.0032, 0.0008, 0.0016))
        for lx in self.LED2_X:
            rack.box(g, "fp_ledwin", (X(lx), y - 0.0012, Z(self.LED_ROW2_Z)), (0.0038, 0.0008, 0.0016))
        rack.box(g, "fp_usb", (X(self.USBA_X), y - 0.0012, Z(self.USBA_Z)),
                 (self.USBA_W, 0.0010, 0.0062))
        rack.box(g, "fp_throat", (X(self.USBA_X), y - 0.0017, Z(self.USBA_Z)),
                 (self.USBA_W - 0.0020, 0.0008, 0.0046))
        rack.box(g, "fp_usb_tongue", (X(self.USBA_X), y - 0.0020, Z(self.USBA_Z + 0.030)),
                 (self.USBA_W - 0.0056, 0.0006, 0.0012))

        # ---- the three yellow framed islands ----------------------------
        for (x0, x1), (fz0, fz1) in ((self.FRAME_MGMT, self.FRAME_Z),
                                     (self.FRAME_PORTS, self.FRAME_Z),
                                     (self.FRAME_SFP, self.FRAME_SFP_Z)):
            cx, fw = X((x0 + x1) / 2), x1 - x0
            fh = (fz0 - fz1) * h
            # A frame, not a plate: the yellow is a printed ring with the
            # bezel showing through the middle, and the connectors sit in
            # the middle. Fill it and every port loses its background.
            band = 0.0026
            rack.box(g, "fp_yellow", (cx, y - 0.0009, Z(fz0) - band / 2), (fw, 0.0008, band))
            rack.box(g, "fp_yellow", (cx, y - 0.0009, Z(fz1) + band / 2), (fw, 0.0008, band))
            for sx in (-1, 1):
                rack.box(g, "fp_yellow", (cx + sx * (fw / 2 - band / 4), y - 0.0009, Z((fz0 + fz1) / 2)),
                         (band / 2, 0.0008, fh))

        # ---- management pair, then the twelve data ports ----------------
        self.jack(rack, g, X(self.MGMT_X), z, True)
        self.jack(rack, g, X(self.MGMT_X), z, False)
        for i in range(6):
            cx = X(self.column_x(i))
            self.jack(rack, g, cx, z, True)
            self.jack(rack, g, cx, z, False)

        # ---- four SFP+ ---------------------------------------------------
        for i in range(4):
            self.sfp(rack, g, X(self.SFP_X0 + i * self.SFP_PITCH), Z(self.SFP_Z))

        # ---- the two drawers and the module blank -----------------------
        dz0, dz1 = self.DRAWER_Z
        for x0, x1 in (self.SSD1_X, self.SSD2_X):
            cx, dw = X((x0 + x1) / 2), x1 - x0
            rack.rounded_prism(g, "fp_drawer", (cx, y - 0.0012, Z((dz0 + dz1) / 2)),
                               (dw, 0.0014, (dz0 - dz1) * h), radius=0.0008, bevel=0.0004, steps=5)
            # Hexagonal cutouts at each end of every carrier, which is how
            # both drawers are vented and how they are told apart from the
            # solid module blank below.
            for sx in (-1, 1):
                for k in range(3):
                    hx = cx + sx * (dw / 2 - 0.0060 - k * 0.0062)
                    rack.box(g, "fp_hex", (hx, y - 0.0019, Z((dz0 + dz1) / 2)),
                             (0.0038, 0.0008, (dz0 - dz1) * h * 0.52))

        nx0, nx1 = self.NM_X
        nz0, nz1 = self.NM_Z
        rack.rounded_prism(g, "fp_module", (X((nx0 + nx1) / 2), y - 0.0012, Z((nz0 + nz1) / 2)),
                           (nx1 - nx0, 0.0014, (nz0 - nz1) * h),
                           radius=0.0008, bevel=0.0004, steps=5)
        # Two rows of hexagonal holes across the blank, which is all the
        # face of an empty network module bay carries.
        for r, frac in enumerate((-0.010, -0.150)):
            for k in range(11):
                hx = X(0.3510 + k * 0.0062) + (0.0031 if r else 0.0)
                for fw, fh in ((1.00, 0.36), (0.74, 0.70), (0.42, 0.98)):
                    rack.box(g, "fp_hex", (hx, y - 0.0019, Z(frac)),
                             (self.HEX_W * fw, 0.0008, 0.0038 * fh))
        self.thumbscrew(rack, g, X(0.3415), Z(-0.294))

        for sx in self.SCREW_X:
            self.thumbscrew(rack, g, X(sx), Z(self.SCREW_Z))

        self.silkscreen(rack, z)
