"""Cisco ASR 1001-X, drawn from a dead on photograph of the front panel.

Cisco's own line drawing of this router lives under cisco.com/c/dam and that
path answers 403 to everything here, so the model comes off the NetworkTigers
photograph instead. That photograph turns out to be better than it looks: the
camera is square to the panel, the panel is a flat rectangle 998 pixels wide
in a 1040 pixel frame, and the vertical is foreshortened by a knowable amount,
which makes it measurable rather than merely suggestive.

What the photograph shows, working left to right across 439mm:

  A column of five stamped slots hard against the left edge, then the SPA bay
  filled with its blank: a zinc plate two shades lighter than the panel, six
  pressed louvres over eleven oval holes, a captive screw at each end and a
  yellow CLASS 1 LASER PRODUCT sticker along the bottom. Cisco ASR1001-X is
  silkscreened on the panel below it, not on the plate.

  A block of square vent holes, eight columns by six rows, except that the
  bottom right of the block is eaten away by the control cluster: the mini USB
  console with its cyan CON tab, the EN button, and five round lamps, PWR and
  STAT stacked in one column and CRIT, MAJ and MIN in the next.

  The optics. Four ganged housings two ports high, each one a black cage over
  a pale lamp strip over a second black cage, labelled on coloured bars above
  and below. TE1 and TE0 wear orange because they are the 10G ports; GE1, GE3,
  GE5 above and GE0, GE2, GE4 below wear yellow. Getting those two colours the
  wrong way round is the one mistake on this panel a Cisco engineer would spot
  from across a room.

  AUX over CON in one housing, the AUX name on a black bar and the CON name on
  a cyan one. Then MGMT over USB0 over USB1 in another, under a black USB/MGMT
  bar, with the cisco wordmark beside it.

  Then the NIM bay, which is more than a third of the panel: a near white blank
  filler with a captive screw at each end, and under it two rows of twenty
  eight square holes with a slot number and a lamp at the far right.

Nothing here is shared with another product. This router's jacks are stamped
into a light grey painted panel with printed colour bars over them, which does
not look like the milled pocket a MikroTik uses or the black inset band a
Ubiquiti uses, and the cages are ganged two high in a housing rather than
standing alone.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class ASR1001X(Device):
    slug = "ASR1001X"
    name = "Cisco ASR 1001-X"
    u = 1
    #: Cisco publish 43.43 x 439.42 x 461.5mm, the depth being the chassis
    #: edge to edge and explicitly not including the card and power supply
    #: handles, which is what the 571.5mm in the installation guide counts.
    width = 0.43942
    depth = 0.4615
    source = ("https://www.cisco.com/c/en/us/products/collateral/routers/"
              "asr-1000-series-aggregation-services-routers/datasheet-c78-731632.html")
    references = [
        Reference("https://cdn.shopify.com/s/files/1/0989/9318/files/"
                  "cisco-ASR1001-X-1_2ee941ad-2516-486b-94a1-1800c445d047.jpg",
                  "dead on front, 1040x1040, the whole panel legible"),
    ]

    def face(self, rack) -> float:
        """The visible plane of the panel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------- measured
    #
    # The panel is a flat rectangle in the photograph, x 21 to 1018 and y 617
    # to 707, so 998 pixels span the published 439.42mm and a pixel is
    # 0.4403mm across. The 91 pixel height would make the panel 40.1mm at that
    # scale against a real 43.43, which is the camera sitting a little above
    # the panel: horizontal measurements are true, vertical ones are
    # compressed by 0.923 and were divided back out before being recorded.
    #
    # Horizontal figures are metres from the left edge of the 439.42mm panel.
    # Vertical figures are fractions of panel height with zero at the middle.

    #: Five stamped slots hard against the left edge.
    LEFT_SLOT_X = 0.0072                      # 7.2mm, slots 5.0 to 9.5
    LEFT_SLOT = (0.0045, 0.0052)              # 4.5 x 5.2mm
    LEFT_SLOT_Z = (0.2870, 0.1373, -0.0066, -0.1539, -0.3059)

    #: The SPA bay blank, 10.5 to 98.5mm and 3.5 to 38.5mm down the panel.
    SPA_X = (0.0105, 0.0985)
    SPA_Z = (0.4194, -0.3865)
    SPA_SCREW_X = (0.0145, 0.0955)
    SPA_SCREW_Z = 0.0165                      # 21.0mm, mid plate
    #: Six pressed louvres over eleven oval holes, both in two rows.
    LOUVRE_X0, LOUVRE_PITCH, LOUVRE_N = 0.0265, 0.0113, 6
    LOUVRE_Z = (0.2697, 0.1546)               # 10.0 and 15.0mm
    LOUVRE = (0.0055, 0.0022)
    OVAL_X0, OVAL_PITCH, OVAL_N = 0.0245, 0.00635, 11
    OVAL_Z = (-0.2253, -0.3404)               # 31.5 and 36.5mm
    OVAL = (0.0050, 0.0026)
    #: The yellow laser sticker sits below the plate, on the panel.
    LASER_X = (0.0240, 0.0685)
    LASER_Z = (-0.3865, -0.4855)

    #: Eight columns of square vents, and how many of the six rows survive in
    #: each: the control cluster eats the bottom right corner of the block.
    VENT_X0, VENT_PITCH = 0.10635, 0.00543
    VENT_ROWS = (0.2375, 0.1155, -0.0158, -0.1378, -0.2691, -0.3911)
    VENT_COL_ROWS = (6, 4, 4, 3, 3, 3, 2, 2)
    VENT = (0.0040, 0.0038)

    #: The mini USB console, its cyan tab, the EN button and five lamps.
    USBMINI_X, USBMINI_Z, USBMINI = 0.1167, -0.2598, (0.0074, 0.0060)
    EN_X, EN_Z = 0.1235, -0.2944
    PWR_X, PWR_Z = 0.1305, -0.2023
    STAT_X, STAT_Z = 0.1305, -0.3128
    ALARM_X = 0.1395
    ALARM_Z = (-0.0872, -0.2023, -0.3174)     # CRIT, MAJ, MIN

    #: Four optics housings. First left edge, pitch, and the housing width.
    #: They abut, so the pitch is also the housing pitch.
    OPT_X0, OPT_PITCH, OPT_W = 0.1495, 0.01450, 0.01450
    OPT_LABEL_TOP = (0.3618, 0.2352)          # 6.0 to 11.5mm
    OPT_CAGE_TOP = (0.2352, 0.0280)           # 11.5 to 20.5mm
    OPT_STRIP = (0.0280, -0.1217)             # 20.5 to 27.0mm
    OPT_CAGE_BOT = (-0.1217, -0.3865)         # 27.0 to 38.5mm
    OPT_LABEL_BOT = (-0.3865, -0.4901)        # 38.5 to 43.0mm

    #: A single column of six square vents between the optics and the AUX bay.
    GAP_VENT_X = 0.2133

    #: AUX over CON, then MGMT over two stacked USB.
    AUX_X = (0.2155, 0.2330)
    AUX_BAR_Z = (0.3849, 0.2697)
    AUX_JACK_Z = (0.2582, -0.0066)
    CON_JACK_Z = (-0.0872, -0.3635)
    CON_BAR_Z = (-0.3750, -0.4901)
    MGMT_X = (0.2375, 0.2550)
    MGMT_JACK_Z = (0.2697, -0.0066)
    USB0_Z = (-0.0526, -0.2023)
    USB1_Z = (-0.2368, -0.3865)
    MGMT_BAR_Z = (-0.3980, -0.4901)

    #: The NIM bay: the opening, the blank filler in it and the vents below.
    NIM_BAY_X = (0.2660, 0.4320)
    NIM_PLATE_X = (0.2700, 0.4280)
    NIM_PLATE_Z = (0.3849, -0.0181)           # 5.0 to 22.5mm
    NIM_SCREW_X = (0.2725, 0.4255)
    NIM_VENT_X0, NIM_VENT_PITCH, NIM_VENT_N = 0.2759, 0.00544, 28
    NIM_VENT_Z = (-0.1793, -0.3220)           # 29.5 and 35.7mm
    NIM_LED_X, NIM_LED_Z = 0.4310, -0.3059

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared.

        The panel measures a flat neutral 168 of 255 over every clean patch of
        it, and the lid the same 170, which is not the near black the older
        generic Cisco model used. Both blanks are brighter than the panel and
        by different amounts, 223 for the zinc SPA plate and 239 for the NIM
        filler, and that difference is most of what stops the right hand third
        of the panel reading as one grey slab.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            "asr_panel": pbr("ASR1001-X Panel", [150, 150, 149, 255], 0.10, 0.56),
            "asr_lid": pbr("ASR1001-X Lid", [152, 152, 151, 255], 0.14, 0.50),
            "asr_ear": pbr("ASR1001-X Ear", [140, 140, 139, 255], 0.16, 0.48),
            # The two blanks, and the reason their metallic is low. Zinc plate
            # wants a high metallic on paper, but a metal base colour is a
            # specular tint rather than a diffuse one, and at 0.46 both blanks
            # rendered at exactly the panel's own value: three greys measured
            # 168, 223 and 239 in the photograph came out 211, 212, 212. The
            # number that separates them again is metallic, not colour.
            "asr_spa_blank": pbr("ASR1001-X SPA Blank", [205, 205, 203, 255], 0.20, 0.40),
            "asr_nim_blank": pbr("ASR1001-X NIM Blank", [224, 224, 221, 255], 0.16, 0.38),
            # Every hole in sheet metal. The louvres read 104 and the ovals 79
            # because a louvre is a lip catching light and an oval is a hole,
            # so they are two materials rather than one.
            "asr_louvre": pbr("ASR1001-X Louvre", [92, 92, 91, 255], 0.16, 0.62),
            "asr_hole": pbr("ASR1001-X Vent Hole", [34, 34, 34, 255], 0.06, 0.88),
            "asr_deep": pbr("ASR1001-X Cavity", [12, 12, 13, 255], 0.04, 0.94),
            # A cage on this panel is genuinely black, 13 of 255, and the pale
            # strip between two of them is 190. Painting both a compromise
            # grey is what made the first generic model's optics vanish.
            "asr_cage": pbr("ASR1001-X SFP Cage", [16, 16, 17, 255], 0.22, 0.60),
            "asr_cage_bore": pbr("ASR1001-X Cage Bore", [9, 9, 10, 255], 0.08, 0.92),
            "asr_cage_edge": pbr("ASR1001-X Card Edge", [206, 206, 200, 255], 0.0, 0.58),
            "asr_strip": pbr("ASR1001-X Lamp Strip", [176, 176, 175, 255], 0.14, 0.50),
            "asr_jack_shell": pbr("ASR1001-X Jack Shell", [26, 26, 27, 255], 0.10, 0.72),
            "asr_jack_shield": pbr("ASR1001-X Jack Shield", [122, 123, 122, 255], 0.44, 0.40),
            "asr_jack_gold": pbr("ASR1001-X Jack Contacts", [186, 148, 68, 255], 0.80, 0.28),
            "asr_housing": pbr("ASR1001-X Port Housing", [142, 142, 141, 255], 0.18, 0.50),
            # The printed bars. Sampled at 219,219,152 for the yellow and
            # 206,104,52 for the orange once the black lettering was excluded
            # from the median, and 163,206,220 for the cyan, then taken down
            # a notch each because the studio here blew all three to paper
            # white on the first pass.
            "asr_yellow": pbr("ASR1001-X Yellow Bar", [200, 192, 110, 255], 0.0, 0.68),
            "asr_orange": pbr("ASR1001-X Orange Bar", [192, 92, 44, 255], 0.0, 0.68),
            "asr_cyan": pbr("ASR1001-X Cyan Bar", [146, 192, 208, 255], 0.0, 0.68),
            "asr_black_bar": pbr("ASR1001-X Black Bar", [30, 30, 31, 255], 0.0, 0.70),
            "asr_screw": pbr("ASR1001-X Captive Screw", [172, 173, 172, 255], 0.56, 0.32),
            "asr_button": pbr("ASR1001-X Button", [38, 38, 39, 255], 0.20, 0.56),
            # Lamps unlit. These are moulded lenses over dark cavities and
            # they read as dark circles on the photograph, so the glow stays
            # small: a router with every alarm lit is a router on fire.
            "asr_led_green": pbr("ASR1001-X Green", [64, 172, 100, 255], 0.0, 0.26,
                                 emissive=[0.04, 0.20, 0.08]),
            "asr_led_amber": pbr("ASR1001-X Amber", [196, 152, 62, 255], 0.0, 0.28,
                                 emissive=[0.17, 0.11, 0.02]),
            "asr_led_dark": pbr("ASR1001-X Lamp Dark", [36, 37, 38, 255], 0.10, 0.46),
        })

    # ---------------------------------------------------------------- parts

    def slot_vent(self, rack, g: str, x: float, z: float, w: float, h: float) -> None:
        """One stamped slot, which is a hole with a lit lower lip.

        Drawn as a dark rectangle set back behind the panel plus a hairline of
        panel colour along the bottom edge. Without the lip a slot reads as a
        sticker, because a flat dark rectangle has no depth cue at all.
        """
        y = self.face(rack)
        # Front face 0.6mm proud of the panel. Level with it, the panel wins
        # the depth test and five slots come out as five nothings, which is
        # exactly what the first render of this device showed.
        rack.box(g, "asr_deep", (x, y + 0.0009, z), (w, 0.0030, h))
        rack.box(g, "asr_panel", (x, y - 0.0008, z - h / 2), (w, 0.0006, 0.0005))

    def louvre(self, rack, g: str, x: float, z: float, surf: float) -> None:
        """A pressed louvre in the SPA blank: a slot with a hood over it.

        `surf` is the front face of the plate it is punched in, not the panel.
        The plate stands 1.9mm proud, so a louvre measured from the panel is
        buried inside it and the blank renders as a bare sheet.
        """
        w, h = self.LOUVRE
        rack.box(g, "asr_deep", (x, surf + 0.0014, z), (w, 0.0030, h))
        rack.box(g, "asr_louvre", (x, surf - 0.0003, z + h * 0.62), (w, 0.0008, h * 0.55))

    def square_vent(self, rack, g: str, x: float, z: float, w: float, h: float) -> None:
        """One square punched hole in the panel."""
        rack.box(g, "asr_hole", (x, self.face(rack) + 0.0009, z), (w, 0.0030, h))

    def cage(self, rack, g: str, x: float, z: float, w: float, h: float, top: bool) -> None:
        """One SFP or SFP+ opening in a ganged two high housing.

        The two rows are inverted castings, so the stamped roof ribs and the
        white card edge connector swap ends between them. An empty cage with
        nothing inside it renders as a black rectangle, and this panel has
        eight of them, so the connector matters more here than anywhere.
        """
        y = self.face(rack)
        rack.box(g, "asr_cage", (x, y - 0.0011, z), (w, 0.0012, h))
        rack.box(g, "asr_cage_bore", (x, y + 0.0044, z), (w * 0.88, 0.0110, h * 0.82))
        outer = h * (0.32 if top else -0.32)
        for k in (0.90, 0.66):
            rack.box(g, "asr_cage", (x, y - 0.0017, z + outer * k),
                     (w * 0.70, 0.0008, h * 0.040))
        rack.box(g, "asr_cage_edge", (x, y - 0.0018, z - outer * 0.72),
                 (w * 0.26, 0.0008, h * 0.070))

    def jack(self, rack, g: str, x: float, z: float, w: float, h: float) -> None:
        """An 8P8C jack as this panel presents it: recessed in a stamped shield.

        Cisco sinks the jack behind the sheet metal rather than standing it
        proud, so the bright thing is the shield rim around the mouth and
        everything inside is in shadow. The latch notch points down because on
        this router every RJ45 is the right way up.
        """
        y = self.face(rack)
        rim = 0.0009
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            rack.box(g, "asr_jack_shield", (x + dx, y - 0.0013, z + dz), (bw, 0.0012, bh))
        rack.box(g, "asr_deep", (x, y - 0.0002, z), (w - rim * 2, 0.0026, h - rim * 2))
        rack.box(g, "asr_deep", (x, y + 0.0050, z), (w * 0.82, 0.0090, h * 0.82))
        rack.box(g, "asr_jack_shell", (x, y - 0.0017, z - h * 0.34), (w * 0.30, 0.0010, h * 0.22))
        tongue_z = z + h * 0.14
        rack.box(g, "asr_jack_shell", (x, y - 0.0016, tongue_z), (w * 0.62, 0.0006, h * 0.30))
        for i in range(8):
            cx = x - w * 0.26 + i * (w * 0.52 / 7)
            rack.box(g, "asr_jack_gold", (cx, y - 0.0018, tongue_z),
                     (w * 0.036, 0.0005, h * 0.24))

    def usb_a(self, rack, g: str, x: float, z0: float, z1: float, x0: float, x1: float) -> None:
        """A USB type A receptacle, which is a slot with a white tongue in it."""
        y = self.face(rack)
        cx, w = (x0 + x1) / 2, x1 - x0
        cz, h = (z0 + z1) / 2, z0 - z1
        rack.box(g, "asr_jack_shield", (cx, y - 0.0011, cz), (w, 0.0010, h))
        # The mouth has to sit in front of the shield that frames it, not
        # behind it, or a USB port is a light grey tile with nothing in it.
        rack.box(g, "asr_deep", (cx, y + 0.0006, cz), (w - 0.0016, 0.0044, h - 0.0014))
        rack.box(g, "asr_cage_edge", (cx, y - 0.0018, cz - h * 0.16), (w - 0.0034, 0.0007, h * 0.32))
        del x

    def lamp(self, rack, g: str, x: float, z: float, mat: str, r: float = 0.0018) -> None:
        """A round lamp sunk in a dark bezel, as all six on this panel are."""
        y = self.face(rack)
        rack.front_cylinder(g, "asr_button", (x, y - 0.0008, z), r * 1.5, 0.0010, 20)
        rack.front_cylinder(g, mat, (x, y - 0.0014, z), r, 0.0010, 20)

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Geometry cannot spell, and this panel is unusually wordy: eight port
        names on coloured bars, six lamp names, a product name, a bay number
        and a laser warning. The bars themselves are geometry because they are
        printed blocks of colour with real edges; only the lettering is here.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (58, 58, 58, 255)                # the near black Cisco prints in
        pale = (232, 232, 230, 255)            # lettering on a dark bar

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            """A font whose capitals stand `mm_cap` millimetres tall."""
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- the eight optics names, on their coloured bars.
        f_port = sized(2.4, True)
        top_names = ("TE1", "GE1", "GE3", "GE5")
        bot_names = ("TE0", "GE0", "GE2", "GE4")
        for i in range(4):
            cx = px(self.OPT_X0 + (i + 0.5) * self.OPT_PITCH)
            centred(top_names[i], cx, py(sum(self.OPT_LABEL_TOP) / 2), f_port)
            centred(bot_names[i], cx, py(sum(self.OPT_LABEL_BOT) / 2), f_port)

        # ---- AUX and CON, then USB/MGMT, each on its own bar.
        f_bar = sized(2.1, True)
        centred("AUX", px(sum(self.AUX_X) / 2), py(sum(self.AUX_BAR_Z) / 2), f_bar, pale)
        centred("CON", px(sum(self.AUX_X) / 2), py(sum(self.CON_BAR_Z) / 2), f_bar)
        centred("USB/MGMT", px(sum(self.MGMT_X) / 2), py(sum(self.MGMT_BAR_Z) / 2), sized(1.6, True), pale)
        # The speed and link markings in the corners of both RJ45s that have
        # them, which is how Cisco names a jack's two built in lamps.
        f_tiny = sized(1.5)
        for x0, x1, zt in ((self.AUX_X[0], self.AUX_X[1], self.AUX_JACK_Z[0]),
                           (self.MGMT_X[0], self.MGMT_X[1], self.MGMT_JACK_Z[0])):
            centred("S", px(x0) - 0.0024 * ppm, py(zt) - 0.0012 * ppm, f_tiny)
            centred("L", px(x1) + 0.0024 * ppm, py(zt) - 0.0012 * ppm, f_tiny)
        centred("0", px(self.MGMT_X[1]) + 0.0026 * ppm, py(sum(self.USB0_Z) / 2), f_tiny)
        centred("1", px(self.MGMT_X[1]) + 0.0026 * ppm, py(sum(self.USB1_Z) / 2), f_tiny)

        # ---- the control cluster. PWR sits above its lamp and STAT below the
        #      other, which looks like a mistake until you check the photograph.
        f_lab = sized(1.7)
        centred("CON", px(self.USBMINI_X), py(-0.4325), sized(1.6), (54, 92, 108, 255))
        centred("EN", px(self.EN_X), py(-0.4325), f_lab)
        centred("PWR", px(self.PWR_X), py(-0.1010), f_lab)
        centred("STAT", px(self.STAT_X), py(-0.4325), f_lab)
        for name, lz in zip(("CRIT", "MAJ", "MIN"), self.ALARM_Z):
            b = d.textbbox((0, 0), name, font=f_lab)
            d.text((px(self.ALARM_X) + 0.0038 * ppm, py(lz) - (b[3] - b[1]) / 2 - b[1]),
                   name, font=f_lab, fill=ink)

        # ---- the laser sticker, the product name and the two bay numbers.
        centred("CLASS 1 LASER PRODUCT", px(sum(self.LASER_X) / 2),
                py(sum(self.LASER_Z) / 2), sized(1.5, True))
        name_c = px(0.0930)
        centred("Cisco ASR1001-X", name_c, py(-0.4440), sized(2.2, True))
        centred("2", px(0.1025), py(0.2375), sized(2.0))
        centred("1", px(0.4265), py(-0.3059), sized(2.0))
        # The wordmark, which on this panel is the bars over the letters and
        # sits between the USB block and the NIM bay.
        wm_x, wm_z = px(0.2620), py(-0.3600)
        for i in range(9):
            tall = 0.0028 if i % 3 == 1 else 0.0018
            d.rectangle([wm_x + i * 0.0011 * ppm - 0.0044 * ppm, wm_z - tall * ppm,
                         wm_x + i * 0.0011 * ppm - 0.0044 * ppm + 0.0004 * ppm, wm_z],
                        fill=ink)
        centred("CISCO", wm_x, py(-0.4500), sized(1.9, True))

        tex = save_texture("asr1001x_silkscreen.png", img)
        rack.materials["asr_silktex"] = PBRMaterial(
            name="ASR1001-X Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "asr_silktex",
                            (0, self.face(rack) - 0.0022, z), self.width, self.height)

    # ---------------------------------------------------------------- build

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

        def band(zr, x0, x1, mat, depth=0.0008, dy=0.0006):
            """A printed or stamped bar given as a (top, bottom) fraction."""
            cz = Z((zr[0] + zr[1]) / 2)
            rack.box(g, mat, ((X(x0) + X(x1)) / 2, y - dy, cz),
                     (x1 - x0, depth, (zr[0] - zr[1]) * h))

        # Chassis body behind the panel, then the panel itself.
        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "asr_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0010, bevel=0.0005, steps=6)
        # The lid meets the panel in a thin bright lip, and that is all it is
        # from the front. Drawn as a deep slab instead, its underside projects
        # as a wide dark band above the device from any camera at panel
        # height, which is what the first render of this router looked like.
        rack.box(g, "asr_lid", (0, y + 0.016, z + h * 0.470), (w - 0.006, 0.030, 0.0030))

        # Rack ears. This chassis ships with them fitted flush to the panel,
        # so they are a thin folded plate rather than the separate lighter
        # piece a MikroTik uses.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0195)
            rack.rounded_prism(g, "asr_ear", (ex, y + 0.0012, z), (0.039, 0.0080, h * 0.96),
                               radius=0.0014, bevel=0.0006, steps=6)
            for dz in (h * 0.30, -h * 0.30):
                rack.front_cylinder(g, "asr_deep", (ex, y - 0.0026, z + dz), 0.0026, 0.0028, 16)

        # ---- five slots at the left edge ------------------------------
        for zf in self.LEFT_SLOT_Z:
            self.slot_vent(rack, g, X(self.LEFT_SLOT_X), Z(zf), *self.LEFT_SLOT)

        # ---- the SPA bay and its blank --------------------------------
        sx0, sx1 = self.SPA_X
        sz0, sz1 = self.SPA_Z
        # The opening first, a millimetre bigger than the plate all round, so
        # the plate sits in a shadow line instead of floating on the panel.
        rack.box(g, "asr_deep", ((X(sx0) + X(sx1)) / 2, y - 0.0002, Z((sz0 + sz1) / 2)),
                 (sx1 - sx0 + 0.0011, 0.0010, (sz0 - sz1) * h + 0.0011))
        rack.rounded_prism(g, "asr_spa_blank", ((X(sx0) + X(sx1)) / 2, y - 0.0012,
                                                Z((sz0 + sz1) / 2)),
                           (sx1 - sx0, 0.0014, (sz0 - sz1) * h), radius=0.0008, bevel=0.0004, steps=6)
        plate_face = y - 0.0019                # front of the 1.4mm blank
        for i in range(self.LOUVRE_N):
            lx = X(self.LOUVRE_X0 + i * self.LOUVRE_PITCH)
            for lz in self.LOUVRE_Z:
                self.louvre(rack, g, lx, Z(lz), plate_face)
        ow, oh = self.OVAL
        for i in range(self.OVAL_N):
            ox = X(self.OVAL_X0 + i * self.OVAL_PITCH)
            for oz in self.OVAL_Z:
                rack.rounded_prism(g, "asr_hole", (ox, plate_face + 0.0013, Z(oz)),
                                   (ow, 0.0028, oh), radius=oh * 0.48, bevel=0.0003, steps=8)
        for scx in self.SPA_SCREW_X:
            rack.front_cylinder(g, "asr_screw", (X(scx), y - 0.0020, Z(self.SPA_SCREW_Z)),
                                0.0026, 0.0018, 20)
            rack.front_cylinder(g, "asr_deep", (X(scx), y - 0.0028, Z(self.SPA_SCREW_Z)),
                                0.0010, 0.0006, 12)
        band(self.LASER_Z, *self.LASER_X, "asr_yellow")

        # ---- the square vent block ------------------------------------
        vw, vh = self.VENT
        for col, rows in enumerate(self.VENT_COL_ROWS):
            vx = X(self.VENT_X0 + col * self.VENT_PITCH)
            for r in range(rows):
                self.square_vent(rack, g, vx, Z(self.VENT_ROWS[r]), vw, vh)

        # ---- the control cluster --------------------------------------
        uw, uh = self.USBMINI
        rack.box(g, "asr_jack_shield", (X(self.USBMINI_X), y - 0.0011, Z(self.USBMINI_Z)),
                 (uw, 0.0010, uh))
        rack.box(g, "asr_deep", (X(self.USBMINI_X), y + 0.0006, Z(self.USBMINI_Z)),
                 (uw - 0.0016, 0.0040, uh - 0.0014))
        # The cyan CON tab under it, which is a printed sticker on the panel.
        rack.box(g, "asr_cyan", (X(0.1165), y - 0.0006, Z(-0.4325)), (0.0110, 0.0008, 0.0044))
        rack.front_cylinder(g, "asr_button", (X(self.EN_X), y - 0.0016, Z(self.EN_Z)),
                            0.0018, 0.0016, 20)
        self.lamp(rack, g, X(self.PWR_X), Z(self.PWR_Z), "asr_led_green")
        self.lamp(rack, g, X(self.STAT_X), Z(self.STAT_Z), "asr_led_green")
        for lz, mat in zip(self.ALARM_Z, ("asr_led_dark", "asr_led_dark", "asr_led_amber")):
            self.lamp(rack, g, X(self.ALARM_X), Z(lz), mat, 0.0019)

        # ---- four optics housings -------------------------------------
        cage_w = self.OPT_W * 0.80
        for i in range(4):
            cx = X(self.OPT_X0 + (i + 0.5) * self.OPT_PITCH)
            x0 = self.OPT_X0 + i * self.OPT_PITCH
            x1 = x0 + self.OPT_PITCH
            # The housing body, which is what the cages are punched out of.
            band((self.OPT_CAGE_TOP[0], self.OPT_CAGE_BOT[1]), x0, x1, "asr_cage", 0.0009, 0.0007)
            band(self.OPT_STRIP, x0 + 0.0004, x1 - 0.0004, "asr_strip", 0.0009, 0.0011)
            self.cage(rack, g, cx, Z(sum(self.OPT_CAGE_TOP) / 2), cage_w,
                      (self.OPT_CAGE_TOP[0] - self.OPT_CAGE_TOP[1]) * h * 0.86, True)
            self.cage(rack, g, cx, Z(sum(self.OPT_CAGE_BOT) / 2), cage_w,
                      (self.OPT_CAGE_BOT[0] - self.OPT_CAGE_BOT[1]) * h * 0.78, False)
            # TE1 and TE0 are the 10G pair and wear orange; the rest yellow.
            mat = "asr_orange" if i == 0 else "asr_yellow"
            band(self.OPT_LABEL_TOP, x0 + 0.0003, x1 - 0.0003, mat)
            band(self.OPT_LABEL_BOT, x0 + 0.0003, x1 - 0.0003, mat)
            # Two triangles on the lamp strip, one per port, pointing at the
            # cage they belong to.
            szc = Z(sum(self.OPT_STRIP) / 2)
            for dx, up in ((-0.0022, True), (0.0022, False)):
                for k in range(3):
                    f = (k + 0.5) / 3
                    # Both triangles taper the same way; only which end the
                    # apex sits at flips. Tapering with `f` on one and against
                    # it on the other, which is the obvious way to write this,
                    # makes two identical up arrows.
                    wide = 0.0026 * (1 - f)
                    dz = 0.0026 * (f - 0.5) * (1 if up else -1)
                    rack.box(g, "asr_button", (cx + dx, y - 0.0014, szc + dz),
                             (max(wide, 0.0004), 0.0007, 0.0009))

        # ---- the lone vent column between optics and AUX ---------------
        for r in range(6):
            self.square_vent(rack, g, X(self.GAP_VENT_X), Z(self.VENT_ROWS[r]), vw, vh)

        # ---- AUX over CON ----------------------------------------------
        ax0, ax1 = self.AUX_X
        rack.box(g, "asr_housing", ((X(ax0) + X(ax1)) / 2, y - 0.0005,
                                    Z((self.AUX_BAR_Z[0] + self.CON_BAR_Z[1]) / 2)),
                 (ax1 - ax0 + 0.0016, 0.0008, (self.AUX_BAR_Z[0] - self.CON_BAR_Z[1]) * h + 0.0012))
        band(self.AUX_BAR_Z, ax0, ax1, "asr_black_bar")
        band(self.CON_BAR_Z, ax0, ax1, "asr_cyan")
        self.jack(rack, g, (X(ax0) + X(ax1)) / 2, Z(sum(self.AUX_JACK_Z) / 2),
                  (ax1 - ax0) * 0.86, (self.AUX_JACK_Z[0] - self.AUX_JACK_Z[1]) * h)
        self.jack(rack, g, (X(ax0) + X(ax1)) / 2, Z(sum(self.CON_JACK_Z) / 2),
                  (ax1 - ax0) * 0.86, (self.CON_JACK_Z[0] - self.CON_JACK_Z[1]) * h)

        # ---- MGMT over two USB -----------------------------------------
        mx0, mx1 = self.MGMT_X
        rack.box(g, "asr_housing", ((X(mx0) + X(mx1)) / 2, y - 0.0005,
                                    Z((self.MGMT_JACK_Z[0] + self.MGMT_BAR_Z[1]) / 2)),
                 (mx1 - mx0 + 0.0016, 0.0008,
                  (self.MGMT_JACK_Z[0] - self.MGMT_BAR_Z[1]) * h + 0.0012))
        band(self.MGMT_BAR_Z, mx0, mx1, "asr_black_bar")
        self.jack(rack, g, (X(mx0) + X(mx1)) / 2, Z(sum(self.MGMT_JACK_Z) / 2),
                  (mx1 - mx0) * 0.86, (self.MGMT_JACK_Z[0] - self.MGMT_JACK_Z[1]) * h)
        for zr in (self.USB0_Z, self.USB1_Z):
            self.usb_a(rack, g, 0.0, Z(zr[0]), Z(zr[1]), X(mx0) + 0.0008, X(mx1) - 0.0008)

        # ---- the NIM bay, its blank and the vents under it -------------
        bx0, bx1 = self.NIM_BAY_X
        pz0, pz1 = self.NIM_PLATE_Z
        rack.box(g, "asr_deep", ((X(bx0) + X(bx1)) / 2, y - 0.0002,
                                 Z((pz0 + pz1) / 2 + 0.010)),
                 (bx1 - bx0, 0.0010, (pz0 - pz1) * h + 0.0030))
        px0, px1 = self.NIM_PLATE_X
        rack.rounded_prism(g, "asr_nim_blank", ((X(px0) + X(px1)) / 2, y - 0.0013,
                                                Z((pz0 + pz1) / 2)),
                           (px1 - px0, 0.0014, (pz0 - pz1) * h), radius=0.0006, bevel=0.0004, steps=6)
        for scx in self.NIM_SCREW_X:
            rack.front_cylinder(g, "asr_screw", (X(scx), y - 0.0021, Z((pz0 + pz1) / 2)),
                                0.0028, 0.0018, 20)
            rack.front_cylinder(g, "asr_deep", (X(scx), y - 0.0029, Z((pz0 + pz1) / 2)),
                                0.0011, 0.0006, 12)
        for i in range(self.NIM_VENT_N):
            nx = X(self.NIM_VENT_X0 + i * self.NIM_VENT_PITCH)
            for nz in self.NIM_VENT_Z:
                self.square_vent(rack, g, nx, Z(nz), vw, vh)
        self.lamp(rack, g, X(self.NIM_LED_X), Z(self.NIM_LED_Z), "asr_led_dark", 0.0019)

        self.silkscreen(rack, z)
