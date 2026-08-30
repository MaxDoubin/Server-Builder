"""Juniper SRX1500, drawn from the labelled elevation in its hardware guide.

Figure 1 of the SRX1500 hardware guide is an orthographic front panel with
twelve numbered callouts, and it is the source for every position in this
file. The studio photograph is here for the things a line drawing cannot
carry: the paint, the fact that the two expansion bays are blanked with a
plate a shade lighter than the panel, and that the power button is a black
dome in a bright ring rather than the plain circle the drawing shows.

Worth saying plainly, because the datasheet phrasing misleads: this firewall
has sixteen gigabit ports and twelve of them are RJ45. The drawing counts
0/0 to 0/11 across six columns of two, then 0/12 to 0/15 as four SFP in a
two by two, then 0/16 to 0/19 as four SFP+ in another. Anyone modelling
sixteen RJ45 from the port count alone builds the wrong firewall.

What the elevation shows, left to right:

  A hexagonal perforation covering the whole left fifth of the face, with
  one smooth plaque let into it carrying juniper NETWORKS and SRX1500.

  The twelve RJ45 in one ganged shield, the two rows inverted against each
  other so the latches face out. Then the four SFP under a 100/1000
  bracket and the four SFP+ under a 1G/10G one, each block two by two with
  Juniper's triangle lamps between the rows.

  Then the right hand third, which is a different kind of surface: two
  blanked expansion bays across the top with a captive screw at each end,
  and below them a recessed cluster holding the earthing point, the HA
  CONTROL SFP, a USB-A, the console RJ45 and its mini-USB, the management
  RJ45, six status lamps in two rows of three, the RESET CONFIG pinhole
  and the power button. The far right is perforated again.

Nothing here is shared with another product. Every jack, cage, lamp and
hexagon in this file is drawn for this firewall at this firewall's
proportions.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class SRX1500(Device):
    slug = "SRX1500"
    name = "Juniper SRX1500"
    u = 1
    #: Juniper publish 1.72 x 17.4 x 16.8 in for this chassis.
    width = 0.442
    depth = 0.427
    source = "https://www.juniper.net/documentation/us/en/hardware/srx1500/"
    references = [
        Reference("https://www.juniper.net/documentation/us/en/hardware/srx1500/images/g000860.png",
                  "hardware guide Figure 1, orthographic front panel with callouts 1 to 12, "
                  "1501x436, the source of every position below"),
        Reference("https://www.juniper.net/content/dam/www/assets/images/us/en/image-library"
                  "/srx-series/srx1500/srx1500-front-high.jpg",
                  "studio front on, 1500x175, for colour, the blanked bays and the power button"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Sampled off the studio photograph away from the perforation:
            # 146,149,156 above the port bank and 132,134,141 at the right
            # hand end. The left fifth measures 79,84,89, but that is the
            # holes averaging in rather than a second colour, and painting
            # it dark was the first pass's mistake.
            "srx_panel": pbr("SRX1500 Panel", [138, 141, 148, 255], 0.16, 0.62),
            # The blanking plate over an empty expansion bay is a separate
            # pressing and sits a shade lighter than the paint round it.
            "srx_blank": pbr("SRX1500 Bay Blank", [152, 155, 162, 255], 0.22, 0.54),
            "srx_edge": pbr("SRX1500 Edge", [168, 171, 178, 255], 0.20, 0.50),
            "srx_shadow": pbr("SRX1500 Recess", [96, 99, 104, 255], 0.18, 0.66),
            # Behind every hexagon is the inside of the box, which is not
            # black but a very dark grey with the light falling off into it.
            "srx_vent": pbr("SRX1500 Vent Hole", [30, 31, 33, 255], 0.10, 0.88),
            # The ganged RJ45 shield: bare stamped steel, the brightest
            # metal on the panel.
            "srx_shield": pbr("SRX1500 Jack Shield", [180, 183, 185, 255], 0.70, 0.30),
            "srx_shield_dark": pbr("SRX1500 Shield Shadow", [110, 112, 114, 255], 0.62, 0.38),
            # Sampled at 16,14,14 inside an RJ45. Effectively black.
            "srx_bore": pbr("SRX1500 Jack Bore", [14, 13, 13, 255], 0.06, 0.94),
            "srx_tongue": pbr("SRX1500 Jack Tongue", [48, 48, 50, 255], 0.10, 0.78),
            # The clear lens over an unlit LED, which is pale rather than
            # coloured. Painting these green put twenty four green chips on
            # a panel whose lamps are all off.
            "srx_window": pbr("SRX1500 Lamp Window", [184, 186, 188, 255], 0.30, 0.34),
            "srx_gold": pbr("SRX1500 Jack Contacts", [192, 156, 78, 255], 0.84, 0.26),
            "srx_cage": pbr("SRX1500 Cage Rim", [172, 175, 177, 255], 0.68, 0.32),
            "srx_cage_bore": pbr("SRX1500 Cage Bore", [26, 24, 22, 255], 0.14, 0.90),
            "srx_card": pbr("SRX1500 Card Edge", [182, 179, 170, 255], 0.0, 0.60),
            "srx_screw": pbr("SRX1500 Captive Screw", [158, 161, 163, 255], 0.66, 0.32),
            "srx_stud": pbr("SRX1500 Earth Stud", [126, 129, 131, 255], 0.60, 0.36),
            # The power button is a black dome standing in a polished ring,
            # and the ring is what catches the eye on the photograph.
            "srx_button": pbr("SRX1500 Power Button", [30, 30, 32, 255], 0.24, 0.44),
            "srx_button_ring": pbr("SRX1500 Button Ring", [176, 179, 181, 255], 0.68, 0.28),
            # Unlit lenses again. A firewall on a bench has no alarms.
            "srx_lamp": pbr("SRX1500 Status Lamp", [50, 58, 50, 255], 0.0, 0.40,
                            emissive=[0.014, 0.028, 0.014]),
            "srx_lamp_amber": pbr("SRX1500 Alarm Lamp", [72, 58, 36, 255], 0.0, 0.40,
                                  emissive=[0.030, 0.018, 0.004]),
        })

    # ------------------------------------------------------------- measured
    #
    # Off Figure 1. The panel outline measures x 45..1415, y 144..284, so
    # 1370 by 140 pixels for the 442mm Juniper publish, which puts a pixel
    # at 0.3226mm across. The check that it is right: an RJ45 opening comes
    # off the drawing at 36 px, which is 11.6mm, against a real 8P8C
    # opening at 11.7. The drawing runs about four percent tall for its
    # width, so vertical figures are fractions of panel height and the
    # stretch stays out of the model. Horizontal figures are metres from
    # the panel's left edge.

    #: The smooth plaque let into the left perforation, carrying the logo.
    PLAQUE = (0.0035, 0.0629, 0.4464, 0.1750)

    #: Twelve RJ45, six columns of two, in one ganged shield.
    RJ45_X0, RJ45_PITCH, RJ45_W = 0.08810, 0.014320, 0.01161
    RJ45_Z = (0.1107, -0.1893)
    RJ45_H = 0.200
    RJ45_GANG = (0.0810, 0.1671)

    #: Four SFP at 1G and four SFP+ at 10G, each block two columns of two.
    SFP_GANG = (0.1713, 0.2010)
    SFPP_GANG = (0.2046, 0.2333)
    SFP_X = (0.17900, 0.19320)
    SFPP_X = (0.21220, 0.22640)
    OPTIC_W = 0.01226
    OPTIC_Z = (0.1393, -0.2036)
    OPTIC_H = 0.1714
    #: The triangle lamps between the two rows of each block.
    OPTIC_LAMP_Z, OPTIC_LAMP_PITCH = -0.0393, 0.00300

    #: Two blanked expansion bays across the top right, and the captive
    #: screw at each end of each.
    BAY = ((0.2417, 0.3352), (0.3378, 0.4314))
    BAY_Z = (0.4393, 0.0036)
    BAY_SCREW_X = (0.2465, 0.3307, 0.3425, 0.4269)
    BAY_SCREW_Z = 0.2536

    #: The recessed cluster under the bays, and everything in it.
    CLUSTER = (0.2523, 0.3959, -0.0250, -0.4536)
    STUD_X, STUD_Z, STUD_R = 0.24810, -0.2140, 0.00340
    HA_X, HA_Z = 0.26410, -0.1964
    USB_X, USB_Z, USB = 0.28410, -0.2393, (0.01060, 0.100)
    CON_X, CON_Z, CON_W, CON_H = 0.30330, -0.2000, 0.01484, 0.264
    MINIUSB_X, MINIUSB_Z, MINIUSB = 0.31960, -0.2929, (0.00807, 0.107)
    MGMT_X, MGMT_Z, MGMT_W, MGMT_H = 0.33660, -0.2000, 0.01678, 0.264
    #: STAT, ALARM, SSD over PWR, HA, RPS.
    LED_X = (0.35120, 0.35940, 0.36780)
    LED_Z = (-0.1643, -0.2786)
    LED_R = 0.00145
    RESETCFG_X, RESETCFG_Z = 0.37700, -0.2430
    POWER_X, POWER_Z, POWER_R = 0.38800, -0.2393, 0.00500

    #: The hexagonal perforation, measured by counting rather than by
    #: autocorrelation, which was the first attempt and was wrong by a
    #: factor of two: reading the strongest peak off a single scan line
    #: gave a 6.2mm pitch, because a honeycomb repeats along a row at twice
    #: the spacing of its nearest neighbours. Labelling the holes instead
    #: found 148 of them in 180 by 120 pixels, and at 0.866 d squared of
    #: panel per hole that puts nearest neighbours 13 pixels apart, so
    #: 3.83mm, with rows 0.866 of that. The holes themselves measure
    #: 9 by 8 pixels, 2.65 by 2.36mm, which leaves the 1.2mm web the
    #: photograph shows.
    HEX_PITCH = 0.00383
    HEX_ROW = 0.00332
    HEX_W, HEX_H = 0.00265, 0.00245
    #: Where the perforation runs: x0, x1, z top, z bottom.
    PERF = (
        (0.0015, 0.0785, 0.470, -0.470),      # the whole left fifth
        (0.0810, 0.2390, 0.470, 0.250),       # the band over the port bank
        (0.2340, 0.2400, 0.240, -0.300),      # the column between block and bays
        (0.3990, 0.4400, 0.470, -0.470),      # the far right end
    )

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Geometry cannot spell, and this panel is unusually wordy: every one
        of the twenty data ports is numbered, the numbers are set in pairs
        with the odd one dropped below the even one, and two of the groups
        sit under a bracketed speed label. Drawn as little boxes that
        whole strip reads as dirt.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (232, 233, 235, 255)
        dark = (58, 60, 62, 255)                   # the logo, printed dark on the plaque

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

        # ---- the plaque, which is the one place the ink is dark ---------
        # The drawing gives the plaque as x 3.5 to 62.9mm, and the wordmark
        # fills a little over a third of it with the model number beside.
        f_mark = fitted("juniper", 22.0)
        top = py(0.372) - d.textbbox((0, 0), "j", font=f_mark)[3] / 2
        d.text((px(0.0075), top), "juniper", font=f_mark, fill=dark)
        f_sub = sized(1.2, True)
        sub = "N E T W O R K S"
        b = d.textbbox((0, 0), sub, font=f_sub)
        d.text((px(0.0295) - (b[2] - b[0]), py(0.268) - (b[3] - b[1]) / 2 - b[1]),
               sub, font=f_sub, fill=dark)
        centred("SRX1500", px(0.0470), py(0.345), fitted("SRX1500", 19.0, True), dark)

        # ---- port numbering, even over odd, the way Juniper set it ------
        f_num = sized(1.5, True)
        f_lab = sized(1.4, True)
        hi, lo = py(-0.352), py(-0.404)
        centred("LINK", px(0.0740), hi, f_lab)
        for i in range(6):
            cx = px(self.RJ45_X0 + i * self.RJ45_PITCH)
            centred(f"0/{i * 2}", cx - px(0.0026), hi, f_num)
            centred(f"0/{i * 2 + 1}", cx + px(0.0030), lo, f_num)
        for i, cx_m in enumerate(self.SFP_X):
            centred(f"0/{12 + i * 2}", px(cx_m) - px(0.0026), hi, f_num)
            centred(f"0/{13 + i * 2}", px(cx_m) + px(0.0030), lo, f_num)
        for i, cx_m in enumerate(self.SFPP_X):
            centred(f"0/{16 + i * 2}", px(cx_m) - px(0.0026), hi, f_num)
            centred(f"0/{17 + i * 2}", px(cx_m) + px(0.0030), lo, f_num)

        # ---- the three speed brackets under the port groups -------------
        def bracket(x0_m: float, x1_m: float, label: str, zf: float) -> None:
            """A label with a rule running out to a tick at each end."""
            yy = py(zf)
            x0, x1 = px(x0_m), px(x1_m)
            bb = d.textbbox((0, 0), label, font=f_lab)
            half = (bb[2] - bb[0]) / 2 + 4 / 1000 * ppm
            mid = (x0 + x1) / 2
            centred(label, mid, yy, f_lab)
            d.line([(x0, yy), (mid - half, yy)], fill=ink, width=2)
            d.line([(mid + half, yy), (x1, yy)], fill=ink, width=2)
            for e in (x0, x1):
                d.line([(e, yy), (e, yy - 2.0 / 1000 * ppm)], fill=ink, width=2)

        bracket(0.0850, 0.1630, "10/100/1000", -0.452)
        bracket(0.1740, 0.1985, "100/1000", -0.452)
        bracket(0.2075, 0.2310, "1G/10G", -0.452)
        centred("ACT", px(0.2380), hi, f_lab)

        # ---- the right hand cluster -------------------------------------
        centred("HA CONTROL", px(self.HA_X), py(-0.392), f_lab)
        centred("CONSOLE", px((self.CON_X + self.MINIUSB_X) / 2), py(-0.392), f_lab)
        centred("MGMT", px(self.MGMT_X), py(-0.392), f_lab)
        f_led = sized(1.25, True)
        for label, x in zip(("STAT", "ALARM", "SSD"), self.LED_X):
            centred(label, px(x), py(-0.098), f_led)
        for label, x in zip(("PWR", "HA", "RPS"), self.LED_X):
            centred(label, px(x), py(-0.352), f_led)
        centred("RESET", px(self.RESETCFG_X), py(-0.128), f_led)
        centred("CONFIG", px(self.RESETCFG_X), py(-0.186), f_led)

        tex = save_texture("srx1500_silkscreen.png", img)
        rack.materials["srx_silktex"] = PBRMaterial(
            name="SRX1500 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.64,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "srx_silktex",
                            (0, self.face(rack) - 0.0007, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def hexagon(self, rack, g: str, x: float, z: float) -> None:
        """One punched hexagon, as a crossed pair of boxes.

        Two boxes, not one and not six. One box reads as a square, and on
        this firewall the perforation is a third of the visible face, so a
        field of squares is the first thing the eye finds. A real hexagonal
        prism is eight times the geometry for a 2.6mm hole. Crossing a
        full width bar with a full height one clips the four corners, which
        is the whole of what separates a hexagon from a square at this
        size.

        Depth matters too. The panel behind is solid, so a hole has to be a
        dark tile drawn in front of it, and only just: at the 5mm a real
        perforation is deep, every hexagon comes out as a raised stud with
        a highlight on its face.
        """
        y = self.face(rack) - 0.00010
        w, h = self.HEX_W, self.HEX_H
        rack.box(g, "srx_vent", (x, y, z), (w, 0.0006, h * 0.62))
        rack.box(g, "srx_vent", (x, y, z), (w * 0.66, 0.0006, h))

    def perforate(self, rack, g: str, z: float) -> None:
        """Punch every region in PERF, skipping the logo plaque.

        The plaque is a smooth island in the middle of the left field, and
        the first pass punched straight through it, which put hexagons
        through the wordmark.
        """
        px0, px1, pzt, pzb = self.PLAQUE
        rows = int(self.height / self.HEX_ROW) + 2
        for x0, x1, zt, zb in self.PERF:
            cols = int((x1 - x0) / self.HEX_PITCH) + 1
            for j in range(rows):
                frac = 0.5 - (j + 0.5) * self.HEX_ROW / self.height
                if frac > zt or frac < zb:
                    continue
                offset = 0.0 if j % 2 == 0 else self.HEX_PITCH / 2
                for i in range(cols):
                    xm = x0 + self.HEX_W / 2 + offset + i * self.HEX_PITCH
                    if xm > x1 - self.HEX_W / 2:
                        break
                    if px0 <= xm <= px1 and pzb <= frac <= pzt:
                        continue
                    self.hexagon(rack, g, -self.width / 2 + xm, z + frac * self.height)

    def jack(self, rack, g: str, x: float, z: float, top_row: bool) -> None:
        """One RJ45 as this firewall wears it.

        Juniper gangs twelve of these behind one stamped shield and lets
        the shield show, so what reads at a distance is a bright frame with
        a black hole in it and a lamp window in each outer corner. The two
        rows are inverted against each other: the latch slot and the lamps
        face out on both, so the top row wears them up and the bottom row
        down. Drawing both the same way up is the single fastest way to
        make a stacked bank look invented.
        """
        y = self.face(rack)
        w, h = self.RJ45_W, self.RJ45_H * self.height
        rim = 0.00075
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            mat = "srx_shield" if dz >= 0 else "srx_shield_dark"
            rack.box(g, mat, (x + dx, y - 0.0016, z + dz), (bw, 0.0014, bh))
        # The bore is drawn in front of the panel, because the panel behind
        # it is solid, but behind the rim, because it is a hole in the rim.
        # Getting that order the wrong way round hides everything that
        # lives inside the mouth: the first pass showed the contacts and
        # nothing else, no latch and no lamps.
        rack.box(g, "srx_bore", (x, y - 0.0008, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "srx_bore", (x, y + 0.0050, z), (w * 0.78, 0.0100, h * 0.76))
        out = 1.0 if top_row else -1.0
        # The latch slot, notched into the edge that faces out of the bank.
        rack.box(g, "srx_shield", (x, y - 0.0021, z + out * h * 0.40),
                 (w * 0.26, 0.0010, h * 0.20))
        # Two lamp windows in the outer corners, which is where Juniper put
        # them on this product rather than beside the port.
        for dx in (-w * 0.32, w * 0.32):
            rack.box(g, "srx_window", (x + dx, y - 0.0021, z + out * h * 0.38),
                     (w * 0.20, 0.0009, h * 0.16))
        # Tongue and contacts, hanging from the edge opposite the latch.
        tz = z - out * h * 0.18
        rack.box(g, "srx_tongue", (x, y - 0.0020, tz), (w * 0.52, 0.0006, h * 0.28))
        for i in range(8):
            cx = x - w * 0.21 + i * (w * 0.42 / 7)
            rack.box(g, "srx_gold", (cx, y - 0.0022, tz), (w * 0.027, 0.0005, h * 0.22))

    def cage(self, rack, g: str, x: float, z: float, w: float, h: float,
             top_row: bool) -> None:
        """One SFP or SFP+ opening.

        Both blocks use the same casting at the same size on this panel,
        which the drawing is explicit about: the only thing separating the
        1G block from the 10G one is the bracket printed under it. The rows
        mirror, so the latch tab on each faces the gap between them.
        """
        y = self.face(rack)
        rim = 0.00070
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            rack.box(g, "srx_cage" if dz >= 0 else "srx_shield_dark",
                     (x + dx, y - 0.0016, z + dz), (bw, 0.0013, bh))
        rack.box(g, "srx_cage_bore", (x, y - 0.0007, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "srx_cage_bore", (x, y + 0.0060, z), (w * 0.86, 0.0110, h * 0.82))
        inner = -h * 0.5 if top_row else h * 0.5
        rack.box(g, "srx_card", (x, y - 0.0019, z + inner * 0.62), (w * 0.34, 0.0008, h * 0.11))
        rack.box(g, "srx_cage", (x, y - 0.0020, z - inner * 0.74), (w * 0.72, 0.0008, h * 0.08))

    def triangle_lamp(self, rack, g: str, x: float, z: float, s: float, up: bool) -> None:
        """The solid triangle printed between two rows of optical cages."""
        for i in range(3):
            f = (i + 0.5) / 3
            wide = s * (1 - f) if up else s * f
            dz = s * (f - 0.5) * (1 if up else -1)
            rack.box(g, "srx_lamp", (x, self.face(rack) - 0.0011, z + dz),
                     (max(wide, s * 0.14), 0.0008, s * 0.34))

    def captive_screw(self, rack, g: str, x: float, z: float) -> None:
        """A captive Phillips screw, as the bay blanks are held on."""
        y = self.face(rack)
        rack.front_cylinder(g, "srx_screw", (x, y - 0.0016, z), 0.0026, 0.0014, 20)
        rack.front_cylinder(g, "srx_shadow", (x, y - 0.0022, z), 0.0019, 0.0006, 16)
        for w_, h_ in ((0.0030, 0.0007), (0.0007, 0.0030)):
            rack.box(g, "srx_shadow", (x, y - 0.0025, z), (w_, 0.0006, h_))

    # --------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h = self.height
        w = self.width

        def X(from_left: float) -> float:
            """Panel coordinate from a measurement off the drawing."""
            return -w / 2 + from_left

        def Z(frac: float) -> float:
            """Rack coordinate from a fraction of the panel's height."""
            return z + frac * h

        def plate(mat: str, x0: float, x1: float, zt: float, zb: float,
                  depth: float, y_off: float) -> None:
            rack.box(g, mat, ((X(x0) + X(x1)) / 2, y - y_off, Z((zt + zb) / 2)),
                     (x1 - x0, depth, (zt - zb) * h))

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.012, self.depth, h * 0.92))
        rack.rounded_prism(g, "srx_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0014, bevel=0.0006, steps=6)
        rack.box(g, "srx_edge", (0, y - 0.0004, z + h * 0.480), (w - 0.006, 0.0006, 0.0010))
        rack.box(g, "srx_shadow", (0, y - 0.0004, z - h * 0.480), (w - 0.006, 0.0006, 0.0010))

        # The smooth plaque the wordmark prints on, standing a hair proud of
        # the perforated field around it.
        px0, px1, pzt, pzb = self.PLAQUE
        # A tenth of a millimetre proud, and no more. The first pass stood
        # this plaque 0.8mm off the panel, which put its face in front of
        # the silkscreen sheet, and the wordmark printed on it disappeared
        # behind the very plate it belongs to.
        rack.rounded_prism(g, "srx_panel", ((X(px0) + X(px1)) / 2, y - 0.0001,
                                            Z((pzt + pzb) / 2)),
                           (px1 - px0, 0.0005, (pzt - pzb) * h),
                           radius=0.0012, bevel=0.0002, steps=6)

        self.perforate(rack, g, z)

        # ---- twelve RJ45 in one ganged shield ---------------------------
        plate("srx_shadow", self.RJ45_GANG[0] - 0.0008, self.RJ45_GANG[1] + 0.0008,
              self.RJ45_Z[0] + self.RJ45_H / 2 + 0.024,
              self.RJ45_Z[1] - self.RJ45_H / 2 - 0.024, 0.0005, 0.0002)
        for i in range(6):
            cx = X(self.RJ45_X0 + i * self.RJ45_PITCH)
            self.jack(rack, g, cx, Z(self.RJ45_Z[0]), True)
            self.jack(rack, g, cx, Z(self.RJ45_Z[1]), False)

        # ---- four SFP then four SFP+, each two by two -------------------
        for gang, xs in ((self.SFP_GANG, self.SFP_X), (self.SFPP_GANG, self.SFPP_X)):
            plate("srx_shadow", gang[0] - 0.0008, gang[1] + 0.0008,
                  self.OPTIC_Z[0] + self.OPTIC_H / 2 + 0.036,
                  self.OPTIC_Z[1] - self.OPTIC_H / 2 - 0.036, 0.0005, 0.0002)
            for cx_m in xs:
                cx = X(cx_m)
                self.cage(rack, g, cx, Z(self.OPTIC_Z[0]), self.OPTIC_W,
                          self.OPTIC_H * h, True)
                self.cage(rack, g, cx, Z(self.OPTIC_Z[1]), self.OPTIC_W,
                          self.OPTIC_H * h, False)
                for k in range(4):
                    self.triangle_lamp(rack, g, cx + (k - 1.5) * self.OPTIC_LAMP_PITCH,
                                       Z(self.OPTIC_LAMP_Z), 0.0022, up=(k % 2 == 1))

        # ---- two blanked expansion bays across the top right ------------
        for x0, x1 in self.BAY:
            rack.rounded_prism(g, "srx_edge", ((X(x0) + X(x1)) / 2, y - 0.0004,
                                               Z(sum(self.BAY_Z) / 2)),
                               (x1 - x0 + 0.0010, 0.0007,
                                (self.BAY_Z[0] - self.BAY_Z[1]) * h + 0.0010),
                               radius=0.0012, bevel=0.0003, steps=6)
            rack.rounded_prism(g, "srx_blank", ((X(x0) + X(x1)) / 2, y - 0.0008,
                                                Z(sum(self.BAY_Z) / 2)),
                               (x1 - x0, 0.0009, (self.BAY_Z[0] - self.BAY_Z[1]) * h),
                               radius=0.0010, bevel=0.0003, steps=6)
        for sx in self.BAY_SCREW_X:
            self.captive_screw(rack, g, X(sx), Z(self.BAY_SCREW_Z))

        # ---- the recessed cluster under them ----------------------------
        cx0, cx1, czt, czb = self.CLUSTER
        plate("srx_shadow", cx0, cx1, czt, czb, 0.0005, 0.0001)

        rack.front_cylinder(g, "srx_stud", (X(self.STUD_X), y - 0.0012, Z(self.STUD_Z)),
                            self.STUD_R, 0.0012, 6)
        rack.front_cylinder(g, "srx_shadow", (X(self.STUD_X), y - 0.0019, Z(self.STUD_Z)),
                            self.STUD_R * 0.44, 0.0009, 14)

        # HA CONTROL is one more SFP, upright and on its own.
        self.cage(rack, g, X(self.HA_X), Z(self.HA_Z), 0.01290, self.OPTIC_H * h, True)

        uw, uh = self.USB
        rack.box(g, "srx_shield", (X(self.USB_X), y - 0.0012, Z(self.USB_Z)),
                 (uw, 0.0009, uh * h))
        rack.box(g, "srx_bore", (X(self.USB_X), y - 0.0020, Z(self.USB_Z)),
                 (uw * 0.86, 0.0018, uh * h * 0.62))
        rack.box(g, "srx_card", (X(self.USB_X), y - 0.0026, Z(self.USB_Z) - uh * h * 0.13),
                 (uw * 0.66, 0.0008, uh * h * 0.22))

        for jx, jw, jh, jz in ((self.CON_X, self.CON_W, self.CON_H, self.CON_Z),
                               (self.MGMT_X, self.MGMT_W, self.MGMT_H, self.MGMT_Z)):
            saved = self.RJ45_W, self.RJ45_H
            self.RJ45_W, self.RJ45_H = jw, jh
            self.jack(rack, g, X(jx), Z(jz), False)
            self.RJ45_W, self.RJ45_H = saved

        mw, mh = self.MINIUSB
        rack.box(g, "srx_shield", (X(self.MINIUSB_X), y - 0.0012, Z(self.MINIUSB_Z)),
                 (mw, 0.0009, mh * h))
        rack.box(g, "srx_bore", (X(self.MINIUSB_X), y - 0.0020, Z(self.MINIUSB_Z)),
                 (mw * 0.72, 0.0018, mh * h * 0.54))

        # Six status lamps, two rows of three.
        for i, lx in enumerate(self.LED_X):
            for row, lz in enumerate(self.LED_Z):
                mat = "srx_lamp_amber" if (i == 1 and row == 0) else "srx_lamp"
                rack.front_cylinder(g, mat, (X(lx), y - 0.0010, Z(lz)),
                                    self.LED_R, 0.0009, 12)

        rack.front_cylinder(g, "srx_bore", (X(self.RESETCFG_X), y - 0.0010,
                                            Z(self.RESETCFG_Z)), 0.00085, 0.0009, 10)

        # The power button: a black dome in a polished ring.
        rack.front_cylinder(g, "srx_button_ring", (X(self.POWER_X), y - 0.0012,
                                                   Z(self.POWER_Z)), self.POWER_R, 0.0010, 28)
        rack.front_cylinder(g, "srx_shadow", (X(self.POWER_X), y - 0.0016,
                                              Z(self.POWER_Z)), self.POWER_R * 0.78, 0.0008, 24)
        rack.front_cylinder(g, "srx_button", (X(self.POWER_X), y - 0.0022,
                                              Z(self.POWER_Z)), self.POWER_R * 0.56, 0.0014, 24)

        self.silkscreen(rack, z)
