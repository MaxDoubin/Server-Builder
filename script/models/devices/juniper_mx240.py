"""Juniper MX240, drawn from Juniper's own straight on studio photograph.

A five unit chassis is not a tall switch, and modelling it as one is the
mistake this file exists to avoid. An MX240 is a card cage: a fan tray
across the top, a craft interface below it that is the only place the
router talks to a human, a galvanised air baffle, and then four horizontal
card slots each with its own faceplate, its own pair of ejector levers and
its own set of ports. The slots are the product. Everything else is the
box they slide into.

Calibration. The photograph is 1500 by 751 and the chassis fills it, x 2 to
1497 and y 3 to 747, which is 1496 by 745 pixels. Juniper publish 17.5 by
8.71 inches, 444.5 by 221.2mm, and 444.5 / 1496 is 0.29713mm a pixel while
221.2 / 745 is 0.29691. Two independent axes agreeing to seven parts in ten
thousand means the shot is orthographic, so every figure below is measured
rather than guessed.

What the photograph shows, top to bottom:

  The fan tray, a dark panel perforated edge to edge with a hexagonal mesh,
  with one captive screw at the left.

  The craft interface. A mid grey slab with a bright galvanised trim along
  its top edge and a pale cyan stripe along its bottom. Juniper's wordmark
  and MX240 at the left, then the routing engine lamps in two columns
  labelled RE0 and RE1 with MASTER, ONLINE and OFFLINE between them, the
  fan pair, four power entry module pairs labelled PEM 0 to 3, the yellow
  and red alarm lamps, the ACO/LT button, and two green alarm relay
  terminal blocks with NC, C and NO under each. Under all of it a row of
  four OK and FAIL lamp pairs, each over a rounded tab carrying its slot
  number, the two lower slots' tabs half filled cyan because those slots
  carry two numbering schemes at once.

  A galvanised baffle strip, mottled and much brighter than anything
  around it.

  Four card slots. Slot 2 holds a DPC 40xGE: forty SFP cages in two rows of
  twenty, grouped five columns at a time, with a punched vent block either
  side of the middle pair. Slot 1 holds a DPC-R-4XGE, four XFP cages spread
  right across the card with a TUNNEL and LINK lamp beside each. The bottom
  two slots each hold an SCB-MX with an RE-S-1300 routing engine set into
  it, and the routing engine is where the USB, AUX, CONSOLE and ETHERNET
  sockets live. Every card has a dark grey ejector lever at each end that
  stands proud of the chassis flange, and a numbered teardrop badge in the
  grey column down the left.

Nothing here is shared with another product. Juniper's ejector lever, its
teardrop slot badge and its craft interface are specific to this chassis
family and appear nowhere else in this library.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import Device, Reference


class MX240(Device):
    slug = "MX240"
    name = "Juniper MX240"
    u = 5
    #: Juniper publish 17.5 x 8.71 x 27.75 in for the MX240 chassis.
    width = 0.4445
    depth = 0.705
    source = "https://www.juniper.net/documentation/us/en/hardware/mx240/"
    references = [
        Reference("https://www.juniper.net/content/dam/www/assets/images/us/en/"
                  "image-library/mx-series/mx240/mx240-front-high.jpg",
                  "straight on studio front, 1500x751, orthographic, fully populated"),
        Reference("https://www.juniper.net/content/dam/www/assets/images/us/en/"
                  "image-library/mx-series/mx240/mx240-frontwtop-high.jpg",
                  "same chassis with the top visible, for overall proportions"),
    ]

    def face(self, rack) -> float:
        """The plane of the chassis flange, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # -------------------------------------------------------------- measured
    #
    # Horizontal figures are metres from the left edge of the 444.5mm face.
    # Vertical figures are fractions of the 5U panel height, zero at the
    # middle, converted from pixel rows as (375 - y) / 745.

    #: The dark mounting flanges down each side, and the grey column
    #: between the left flange and the cards that carries the slot badges.
    FLANGE_W = 0.0105
    BADGE_COL = (0.0105, 0.0355)

    #: The four horizontal bands above the card cage.
    FAN_Z = (0.4993, 0.3570)
    CRAFT_Z = (0.3557, 0.1785)
    CRAFT_TRIM = (0.3557, 0.3503)
    CYAN_Z = (0.1772, 0.1651)
    BAFFLE_Z = (0.1597, 0.1195)
    #: Hex perforation on the fan tray: 3.0mm pitch, measured across the
    #: middle of the tray where the mesh is unobstructed.
    VENT_X = (0.0185, 0.4270)
    VENT_PITCH = 0.00300

    #: Craft interface. Every one of these came off the photograph.
    WORDMARK_X, WORDMARK_Z = 0.0187, 0.2990
    MODEL_X = 0.0565
    SCREW_L, SCREW_R = (0.0189, 0.2289), (0.4250, 0.2319)
    RE_LED_X = (0.1090, 0.1408)
    RE_LED_Z = (0.3275, 0.3047, 0.2832)
    RE_LABEL_X, RE_NAME_Z = 0.1247, 0.2591
    FAN_LED_X, FAN_LABEL_Z = 0.1886, 0.2738
    PEM_LED_X0, PEM_PITCH, PEM_LABEL_Z = 0.2432, 0.00763, 0.2805
    LED_PAIR_Z = (0.3275, 0.3047)
    TRI_X, TRI_Z = 0.3067, 0.2967
    CIRC_X, CIRC_Z = 0.3240, 0.2980
    ACO_X, ACO_Z, ACO_W = 0.3430, 0.2960, 0.0125
    TERM_X = (0.3575, 0.3843)
    TERM_W, TERM_Z = 0.0253, (0.3235, 0.2658)
    JUNOS_X, JUNOS_Z = 0.4058, 0.2299
    #: Four OK/FAIL lamp pairs and the slot tabs beneath them.
    OKFAIL_X = (0.1094, 0.1427, 0.1738, 0.2057)
    OKFAIL_Z = 0.2329
    TAB_Z = (0.2215, 0.1852)
    TAB_W = 0.0149

    #: The card cage. Tops measured at pixel rows 287, 394, 498 and 603;
    #: every card is 99 pixels, 29.4mm, from flange to flange.
    CARD_TOP = (0.1181, -0.0255, -0.1651, -0.3060)
    CARD_H = 0.1329
    CARD_X = (0.0369, 0.4348)
    #: The mottled galvanised rails along a card's top and bottom edge.
    CARD_TRIM = (0.0175, 0.0110)
    #: Ejector levers. They are not mirrored: the right hand lever reaches
    #: further out over the flange than the left one does, which is what
    #: the photograph shows and what a lever hinged on its outboard end
    #: has to do.
    LEVER_L, LEVER_R = (0.0279, 0.0582), (0.4143, 0.4414)
    LEVER_H, LEVER_DROP = 0.0543, 0.535
    #: The teardrop slot badge in the grey column, per card.
    BADGE_X, BADGE_W, BADGE_DROP = 0.0224, 0.0111, 0.0061

    #: Slot 2, DPC 40xGE. Four groups of five SFP columns, two rows deep.
    DPC_GROUP_X = (0.0885, 0.1635, 0.2620, 0.3355)
    DPC_CAGE_PITCH, DPC_CAGE_W = 0.01430, 0.01330
    DPC_ROW_Z = (0.0730, 0.0180)
    DPC_ROW_H = 0.0470
    #: The two punched vent blocks, one before the first group and one
    #: between the second and third.
    DPC_VENT_X = ((0.0636, 0.0866), (0.2380, 0.2580))
    DPC_LED_X, DPC_SCREW_X = 0.0613, 0.0520

    #: Slot 1, DPC-R-4XGE. Four XFP cages at a 74.3mm pitch.
    XFP_X0, XFP_PITCH, XFP = 0.1338, 0.07430, (0.0163, 0.0620)
    XFP_LED_DX = 0.0182

    #: Slots 1/0 and 0, SCB-MX with an RE-S-1300 set into it.
    SCB_SEAM = (0.1181, 0.3850)
    SCB_LED_X = (0.0613, 0.0692)
    RE_PORT_X = ((0.2885, 0.2945), (0.2968, 0.3120),
                 (0.3161, 0.3310), (0.3352, 0.3503))
    RE_LAMP_X = (0.1585, 0.1763)
    RE_BUTTON_X, RE_RESET_X = 0.2056, 0.2180
    RE_NAME_X = 0.1284
    RE_SCREW_X = (0.3790, 0.3950)

    def card_z(self, i: int) -> float:
        """Vertical centre of card `i`, counting from the top slot."""
        return self.CARD_TOP[i] - self.CARD_H / 2

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # The chassis flanges and the fan tray are the same near black
            # paint; the craft slab and the badge column are the same mid
            # grey, 122,123,127, which is a touch blue and reads as such.
            "mx_chassis": pbr("MX240 Chassis", [31, 32, 34, 255], 0.24, 0.62),
            "mx_chassis_lip": pbr("MX240 Chassis Lip", [52, 53, 56, 255], 0.26, 0.56),
            "mx_craft": pbr("MX240 Craft Panel", [122, 123, 127, 255], 0.22, 0.54),
            "mx_craft_dark": pbr("MX240 Craft Shadow", [96, 97, 101, 255], 0.22, 0.58),
            # The galvanised strips are the brightest thing on the chassis
            # and they are not white: 153,156,160 with a mottled finish, so
            # a high metallic and a mid roughness rather than a low one.
            "mx_zinc": pbr("MX240 Galvanised", [172, 175, 179, 255], 0.78, 0.44),
            "mx_cyan": pbr("MX240 Cyan Stripe", [152, 206, 232, 255], 0.10, 0.42),
            # Card faceplates measure 223 flat. They are painted sheet, not
            # bare metal, so the metallic stays low or every card in the
            # cage turns into a mirror.
            "mx_card": pbr("MX240 Card Face", [198, 198, 200, 255], 0.12, 0.58),
            "mx_card_edge": pbr("MX240 Card Edge", [186, 187, 188, 255], 0.20, 0.50),
            # The ejector levers, 75,75,78, matte moulded plastic.
            "mx_lever": pbr("MX240 Ejector Lever", [75, 75, 78, 255], 0.06, 0.66),
            "mx_lever_lip": pbr("MX240 Lever Highlight", [104, 104, 108, 255], 0.08, 0.60),
            # An SCB lever carries a yellow catch strip along its top edge.
            "mx_lever_catch": pbr("MX240 Lever Catch", [176, 176, 62, 255], 0.10, 0.52),
            "mx_cage": pbr("MX240 SFP Cage", [38, 37, 39, 255], 0.30, 0.56),
            "mx_cage_bore": pbr("MX240 Cage Bore", [13, 13, 14, 255], 0.12, 0.88),
            "mx_xfp": pbr("MX240 XFP Cage", [206, 207, 209, 255], 0.62, 0.36),
            "mx_jack": pbr("MX240 RJ45 Shell", [214, 215, 216, 255], 0.56, 0.34),
            "mx_jack_bore": pbr("MX240 RJ45 Bore", [22, 22, 23, 255], 0.06, 0.88),
            "mx_vent": pbr("MX240 Card Vent", [58, 58, 60, 255], 0.18, 0.70),
            "mx_screw": pbr("MX240 Captive Screw", [196, 198, 200, 255], 0.76, 0.26),
            "mx_button": pbr("MX240 Button", [214, 215, 216, 255], 0.10, 0.44),
            # The alarm relay blocks. Juniper use a saturated signal green
            # for these and nothing else on the chassis is that colour.
            "mx_term": pbr("MX240 Alarm Block", [46, 138, 62, 255], 0.10, 0.52),
            "mx_term_slot": pbr("MX240 Alarm Slot", [14, 32, 18, 255], 0.10, 0.82),
            "mx_term_screw": pbr("MX240 Alarm Screw", [178, 150, 74, 255], 0.70, 0.32),
            "mx_tab": pbr("MX240 Slot Tab", [236, 237, 238, 255], 0.04, 0.44),
            "mx_tab_cyan": pbr("MX240 Slot Tab Cyan", [136, 196, 226, 255], 0.06, 0.44),
            # Unlit indicator lenses. An alarm chassis photographed cold
            # shows dark lenses, not lit ones, and inventing a lit alarm
            # would state a fault the photograph does not.
            "mx_led_green": pbr("MX240 Green Lens", [104, 148, 96, 255], 0.0, 0.30,
                                emissive=[0.05, 0.14, 0.05]),
            "mx_led_red": pbr("MX240 Red Lens", [150, 84, 82, 255], 0.0, 0.30,
                              emissive=[0.14, 0.03, 0.03]),
            "mx_led_dark": pbr("MX240 Dark Lens", [74, 74, 76, 255], 0.0, 0.42),
            "mx_alarm_yellow": pbr("MX240 Yellow Alarm", [231, 227, 117, 255], 0.0, 0.32,
                                   emissive=[0.20, 0.19, 0.04]),
            "mx_alarm_red": pbr("MX240 Red Alarm", [241, 126, 139, 255], 0.0, 0.32,
                                emissive=[0.26, 0.06, 0.07]),
        })

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every printed marking on the chassis, plus the fan tray mesh.

        A five unit face carries far more lettering than a switch does, and
        almost all of it is on the craft interface, so the sheet is sized
        for that: 4096 pixels across 444.5mm is 9.2 a millimetre, which
        holds a 1.6mm cap height at fifteen pixels.

        The fan tray perforation is painted here for the same reason the
        EX4400's is. There are about four thousand holes in that tray and
        as geometry they would cost more than the whole rack.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        white = (238, 239, 240, 255)
        ink = (46, 46, 48, 255)                    # card faceplate lettering
        hole = (16, 16, 17, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=white):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]),
                   text, font=f, fill=fill)

        def stacked(text, cx, cy, f, fill=ink):
            """A label set on its side, which is how Juniper print the
            per port names on a card faceplate when there is no room for
            them across."""
            b = d.textbbox((0, 0), text, font=f)
            tile = Image.new("RGBA", (b[2] - b[0] + 8, b[3] - b[1] + 8), (0, 0, 0, 0))
            ImageDraw.Draw(tile).text((4 - b[0], 4 - b[1]), text, font=f, fill=fill)
            tile = tile.rotate(90, expand=True)
            img.alpha_composite(tile, (int(cx - tile.width / 2), int(cy - tile.height / 2)))

        # ---- fan tray mesh ----------------------------------------------
        hex_r = 0.00118 * ppm
        step_x = self.VENT_PITCH * ppm
        step_y = step_x * math.sqrt(3) / 2
        top, bottom = py(self.FAN_Z[0] - 0.010), py(self.FAN_Z[1] + 0.006)
        row, yy = 0, top + step_y
        while yy < bottom:
            xx = px(self.VENT_X[0]) + (row % 2) * step_x / 2
            while xx < px(self.VENT_X[1]):
                d.regular_polygon((xx, yy, hex_r), 6, rotation=90, fill=hole)
                xx += step_x
            yy += step_y
            row += 1

        # ---- craft interface lettering ----------------------------------
        f_mark = sized(6.2)
        d.text((px(self.WORDMARK_X), py(self.WORDMARK_Z) - f_mark.size * 0.42),
               "juniper", font=f_mark, fill=white)
        d.text((px(self.WORDMARK_X + 0.0042), py(self.WORDMARK_Z - 0.026)),
               "N E T W O R K S", font=sized(1.6), fill=(206, 207, 209, 255))
        d.text((px(self.MODEL_X), py(self.WORDMARK_Z) - f_mark.size * 0.42),
               "MX240", font=sized(5.6), fill=(228, 229, 230, 255))

        f_lab = sized(2.4)
        for name, zf in zip(("MASTER", "ONLINE", "OFFLINE"), self.RE_LED_Z):
            centred(name, px(self.RE_LABEL_X), py(zf), f_lab)
        centred("RE0", px(self.RE_LED_X[0]), py(self.RE_NAME_Z), f_lab)
        centred("RE1", px(self.RE_LED_X[1]), py(self.RE_NAME_Z), f_lab)
        centred("FAN", px(self.FAN_LED_X), py(self.FAN_LABEL_Z), f_lab)
        pem = "PEM"
        centred(pem, px(self.PEM_LED_X0 - 0.0135), py(self.PEM_LABEL_Z), f_lab)
        for i in range(4):
            centred(str(i), px(self.PEM_LED_X0 + i * self.PEM_PITCH),
                    py(self.PEM_LABEL_Z), f_lab)
        centred("ACO/LT", px(self.ACO_X), py(self.ACO_Z), sized(2.1), (48, 48, 50, 255))
        for x0, name in zip(self.TERM_X, ("YELLOW ALARM", "RED ALARM")):
            centred(name, px(x0 + self.TERM_W / 2), py(self.TERM_Z[0] + 0.011), sized(1.9))
            for k, t in enumerate(("NC", "C", "NO")):
                centred(t, px(x0 + (k + 0.5) * self.TERM_W / 3),
                        py(self.TERM_Z[1] - 0.011), sized(1.7))
        centred("RUNNING", px(self.JUNOS_X + 0.0055), py(self.JUNOS_Z + 0.008), sized(1.3))
        centred("junos", px(self.JUNOS_X + 0.0055), py(self.JUNOS_Z - 0.005), sized(3.0))

        f_ok = sized(2.0)
        for cx in self.OKFAIL_X:
            b = d.textbbox((0, 0), "OK", font=f_ok)
            d.text((px(cx) - 0.0125 * ppm - (b[2] - b[0]), py(self.OKFAIL_Z) - (b[3] - b[1]) / 2 - b[1]),
                   "OK", font=f_ok, fill=white)
            d.text((px(cx) + 0.0068 * ppm, py(self.OKFAIL_Z) - (b[3] - b[1]) / 2 - b[1]),
                   "FAIL", font=f_ok, fill=white)

        # The slot tabs carry their number in white on cyan or dark on
        # white, and the two lower slots carry two numbers because the
        # chassis numbers a slot once as an FPC and once as a PIC.
        f_tab = sized(3.0)
        tab_y = py(sum(self.TAB_Z) / 2)
        for cx, left, right in zip(self.OKFAIL_X, ("0", "1 0", "1", "2"), (None,) * 4):
            if " " in left:
                a, b2 = left.split()
                centred(a, px(cx) - self.TAB_W * 0.24 * ppm, tab_y, f_tab, white)
                centred(b2, px(cx) + self.TAB_W * 0.24 * ppm, tab_y, f_tab, (48, 48, 50, 255))
            else:
                centred(left, px(cx), tab_y,
                        f_tab, white if left == "0" else (48, 48, 50, 255))

        # ---- card faceplate lettering ------------------------------------
        f_card = sized(3.0)
        f_small = sized(1.9)
        d.text((px(0.0422), py(self.CARD_TOP[0] - self.CARD_H + 0.028)),
               "DPC 40xGE", font=f_card, fill=ink)
        d.text((px(0.0422), py(self.CARD_TOP[1] - self.CARD_H + 0.028)),
               "DPC-R-4XGE", font=f_card, fill=ink)
        for i in (2, 3):
            d.text((px(0.0422), py(self.CARD_TOP[i] - self.CARD_H + 0.028)),
                   "SCB-MX", font=f_card, fill=ink)
            centred("RE-S-1300", px(self.RE_NAME_X + 0.014),
                    py(self.card_z(i) + 0.030), f_card, ink)
            for name, cx in zip(("USB", "AUX", "CONSOLE", "ETHERNET"),
                                [(a + b) / 2 for a, b in self.RE_PORT_X]):
                centred(name, px(cx), py(self.card_z(i) + 0.030), f_small, ink)
            for name, cx in (("HDD", self.RE_LAMP_X[0]), ("MASTER", self.RE_LAMP_X[1])):
                centred(name, px(cx + 0.0075), py(self.card_z(i) + 0.014), f_small, ink)
            for name, cx in (("OK/FAIL", self.RE_LAMP_X[0]), ("ONLINE", self.RE_LAMP_X[1])):
                centred(name, px(cx + 0.0085), py(self.card_z(i) - 0.014), f_small, ink)
            centred("ONLINE/", px(self.RE_BUTTON_X), py(self.card_z(i) + 0.020), f_small, ink)
            centred("OFFLINE", px(self.RE_BUTTON_X), py(self.card_z(i) + 0.008), f_small, ink)
            centred("RESET", px(self.RE_RESET_X + 0.008), py(self.card_z(i) - 0.020), f_small, ink)
            stacked("OK/FAIL", px(self.SCB_LED_X[0] - 0.0028), py(self.card_z(i) + 0.004), f_small)
            stacked("FABRIC ONLY", px(self.SCB_LED_X[1] - 0.0028), py(self.card_z(i) + 0.014), f_small)
            stacked("FABRIC ACTIVE", px(self.SCB_LED_X[1] + 0.0034), py(self.card_z(i) - 0.014), f_small)
        stacked("OK/FAIL", px(self.DPC_LED_X - 0.0030), py(self.card_z(0)), f_small)
        for i in range(4):
            cx = self.XFP_X0 + i * self.XFP_PITCH
            stacked(f"PORT {i}/0", px(cx - self.XFP_LED_DX - 0.0075),
                    py(self.card_z(1) + 0.002), f_small)
            stacked("TUNNEL", px(cx - self.XFP_LED_DX - 0.0022),
                    py(self.card_z(1) + 0.002), f_small)
            stacked("LINK", px(cx - self.XFP_LED_DX + 0.0032),
                    py(self.card_z(1) + 0.002), f_small)

        tex = save_texture("mx240_silkscreen.png", img)
        rack.materials["mx_silktex"] = PBRMaterial(
            name="MX240 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.58,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "mx_silktex",
                            (0, self.face(rack) - 0.0011, z), self.width, self.height)

    # ----------------------------------------------------------------- parts

    def lamp(self, rack, g: str, x: float, z: float, material: str) -> None:
        """One 1.6mm craft interface lens, in its dark bezel."""
        y = self.face(rack)
        rack.front_cylinder(g, "mx_craft_dark", (x, y - 0.0013, z), 0.0013, 0.0009, 12)
        rack.front_cylinder(g, material, (x, y - 0.0018, z), 0.0009, 0.0008, 12)

    def lever(self, rack, g: str, x0: float, x1: float, z: float, catch: bool) -> None:
        """One ejector lever.

        It is a moulded lozenge standing 4mm off the faceplate, hinged on
        its outboard end, with a highlight along the top where the mould
        parts. The SCB levers carry a yellow catch strip along that top
        edge and the DPC levers do not, which is the only thing that tells
        a fabric card from a line card at a glance.
        """
        y = self.face(rack)
        h = self.LEVER_H * self.height
        cx, w = (x0 + x1) / 2, x1 - x0
        if catch:
            rack.box(g, "mx_lever_catch", (cx, y - 0.0034, z + h * 0.44), (w * 0.86, 0.0014, h * 0.14))
        rack.rounded_prism(g, "mx_lever", (cx, y - 0.0038, z), (w, 0.0056, h),
                           radius=h * 0.44, bevel=0.0012, steps=10)
        rack.rounded_prism(g, "mx_lever_lip", (cx, y - 0.0064, z + h * 0.22),
                           (w * 0.80, 0.0012, h * 0.16), radius=h * 0.07, bevel=0.0003, steps=6)
        # The pivot boss at the inboard end, and the captive screw in it.
        rack.front_cylinder(g, "mx_lever", (x1 - w * 0.10, y - 0.0068, z), h * 0.30, 0.0012, 16)
        rack.front_cylinder(g, "mx_screw", (x1 - w * 0.10, y - 0.0074, z), h * 0.16, 0.0010, 14)

    def slot_badge(self, rack, g: str, z: float, cyan: float) -> None:
        """The teardrop badge in the grey column beside a card.

        `cyan` is how much of it is filled, left to right: the top two
        slots are plain white, the third is half cyan because it is both
        FPC 1 and PIC 0, and the bottom one is filled.
        """
        y = self.face(rack)
        x = -self.width / 2 + self.BADGE_X
        w = self.BADGE_W
        h = w * 0.78
        rack.rounded_prism(g, "mx_tab", (x, y - 0.0009, z), (w, 0.0010, h),
                           radius=h * 0.46, bevel=0.0003, steps=12)
        if cyan > 0:
            rack.box(g, "mx_tab_cyan", (x - w / 2 + w * cyan / 2, y - 0.0013, z),
                     (w * cyan, 0.0008, h * 0.86))

    def sfp_cage(self, rack, g: str, x: float, z: float, h: float) -> None:
        """One SFP cage on the DPC, which is a black moulding with a raised
        bail latch across it rather than an open hole. Forty of them abut,
        so what separates one from the next is the hairline between the
        mouldings and nothing else."""
        y = self.face(rack)
        w = self.DPC_CAGE_W
        rack.box(g, "mx_cage_bore", (x, y - 0.0008, z), (w + 0.0009, 0.0009, h + 0.0009))
        rack.rounded_prism(g, "mx_cage", (x, y - 0.0016, z), (w, 0.0014, h),
                           radius=0.0008, bevel=0.0004, steps=6)
        rack.box(g, "mx_cage_bore", (x, y - 0.0024, z), (w * 0.72, 0.0006, h * 0.30))

    def rj45(self, rack, g: str, x0: float, x1: float, z: float) -> None:
        """A routing engine RJ45: a bright shield with a black mouth in it,
        which is how the AUX, CONSOLE and ETHERNET sockets read against a
        white faceplate."""
        y = self.face(rack)
        w = x1 - x0
        h = w * 0.94
        rack.box(g, "mx_jack", ((x0 + x1) / 2, y - 0.0012, z), (w, 0.0012, h))
        rack.box(g, "mx_jack_bore", ((x0 + x1) / 2, y - 0.0018, z), (w * 0.80, 0.0008, h * 0.74))
        rack.box(g, "mx_jack", ((x0 + x1) / 2, y - 0.0021, z + h * 0.30), (w * 0.28, 0.0006, h * 0.22))
        for i in range(8):
            cx = x0 + w * 0.24 + i * (w * 0.52 / 7)
            rack.box(g, "mx_jack", (cx, y - 0.0020, z - h * 0.14), (w * 0.035, 0.0005, h * 0.26))

    def terminal_block(self, rack, g: str, x0: float, z: float) -> None:
        """One alarm relay block: three screw terminals in a green body
        with a brass captive screw at each end."""
        y = self.face(rack)
        zt, zb = self.TERM_Z
        h = (zt - zb) * self.height
        w = self.TERM_W
        rack.box(g, "mx_term", (x0 + w / 2, y - 0.0022, z), (w, 0.0024, h))
        for k in range(3):
            cx = x0 + (k + 0.5) * w / 3
            rack.box(g, "mx_term_slot", (cx, y - 0.0036, z - h * 0.06), (w * 0.20, 0.0008, h * 0.44))
        for dx in (w * 0.06, w * 0.94):
            rack.front_cylinder(g, "mx_term_screw", (x0 + dx, y - 0.0036, z), h * 0.13, 0.0008, 12)

    def card(self, rack, g: str, z: float, catch: bool) -> None:
        """The faceplate, galvanised rails and both levers of one card."""
        y = self.face(rack)
        h = self.height
        x0, x1 = self.CARD_X
        cx, w = -self.width / 2 + (x0 + x1) / 2, x1 - x0
        ch = self.CARD_H * h
        # 0.4mm proud, not 1.1mm. The overlay carrying DPC 40xGE, SCB-MX,
        # RE-S-1300 and every port name stands 1.1mm off the chassis, so a
        # faceplate in front of it paints all of them out, which is what
        # the first render did: four blank white cards.
        rack.box(g, "mx_card", (cx, y - 0.0004, z), (w, 0.0012, ch))
        for dz, th in ((ch / 2 - self.CARD_TRIM[0] * h / 2, self.CARD_TRIM[0] * h),
                       (-ch / 2 + self.CARD_TRIM[1] * h / 2, self.CARD_TRIM[1] * h)):
            rack.box(g, "mx_zinc", (cx, y - 0.0014, z + dz), (w, 0.0010, th))
        lz = z + (self.CARD_H / 2 - self.LEVER_DROP * self.CARD_H) * h
        for a, b in (self.LEVER_L, self.LEVER_R):
            self.lever(rack, g, -self.width / 2 + a, -self.width / 2 + b, lz, catch)

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

        def band(material, zt, zb, x0=0.0, x1=None, depth=0.0009, dy=0.0004):
            x1 = w if x1 is None else x1
            rack.box(g, material, (X((x0 + x1) / 2), y - dy, Z((zt + zb) / 2)),
                     (x1 - x0, depth, (zt - zb) * h))

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.96))
        rack.rounded_prism(g, "mx_chassis", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0016, bevel=0.0008, steps=6)

        # ---- side flanges and the badge column ---------------------------
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0190)
            rack.rounded_prism(g, "mx_chassis", (ex, y + 0.0014, z), (0.0380, 0.0084, h * 0.99),
                               radius=0.0016, bevel=0.0006, steps=6)
            # A five unit face bolts through ten holes, not two.
            for k in range(5):
                for frac in (0.32, -0.32):
                    rack.rounded_prism(g, "mx_chassis_lip",
                                       (ex, y - 0.0028, z + (k - 2 + frac) * 0.04445),
                                       (0.0170, 0.0026, 0.0080),
                                       radius=0.0035, bevel=0.0006, steps=8)
        band("mx_chassis_lip", 0.4993, -0.4993, 0.0, self.FLANGE_W)
        band("mx_chassis_lip", 0.4993, -0.4993, w - self.FLANGE_W, w)
        band("mx_craft", self.CARD_TOP[0] + 0.004, self.CARD_TOP[3] - self.CARD_H - 0.004,
             *self.BADGE_COL)

        # ---- fan tray ----------------------------------------------------
        band("mx_chassis_lip", *self.FAN_Z, self.FLANGE_W, w - self.FLANGE_W)
        band("mx_zinc", self.FAN_Z[1], self.FAN_Z[1] - 0.004, self.FLANGE_W, w - self.FLANGE_W)
        rack.front_cylinder(g, "mx_screw", (X(0.0155), y - 0.0014, Z(0.4280)), 0.0030, 0.0012, 18)

        # ---- craft interface ---------------------------------------------
        band("mx_craft", *self.CRAFT_Z, self.FLANGE_W, w - self.FLANGE_W)
        band("mx_zinc", *self.CRAFT_TRIM, self.FLANGE_W, w - self.FLANGE_W, dy=0.0008)
        band("mx_cyan", *self.CYAN_Z, self.FLANGE_W, w - self.FLANGE_W, dy=0.0008)
        band("mx_zinc", *self.BAFFLE_Z, self.FLANGE_W, w - self.FLANGE_W, dy=0.0006)

        for sx, sz in (self.SCREW_L, self.SCREW_R):
            rack.front_cylinder(g, "mx_screw", (X(sx), y - 0.0014, Z(sz)), 0.0034, 0.0012, 20)
        # Routing engine lamps: green, green, red down each of two columns.
        for lx in self.RE_LED_X:
            for lz, mat in zip(self.RE_LED_Z, ("mx_led_green", "mx_led_green", "mx_led_red")):
                self.lamp(rack, g, X(lx), Z(lz), mat)
        for lz, mat in zip(self.LED_PAIR_Z, ("mx_led_green", "mx_led_red")):
            self.lamp(rack, g, X(self.FAN_LED_X), Z(lz), mat)
            for i in range(4):
                self.lamp(rack, g, X(self.PEM_LED_X0 + i * self.PEM_PITCH), Z(lz), mat)
        # The two big alarm lenses. The yellow one is a rounded triangle
        # and the red one a disc, and swapping those shapes would lose the
        # one piece of shape coding on the whole panel.
        for k in range(9):
            f = (k + 0.5) / 9
            rack.box(g, "mx_alarm_yellow", (X(self.TRI_X), y - 0.0016,
                                            Z(self.TRI_Z) + (0.5 - f) * 0.0090),
                     (0.0092 * f + 0.0014, 0.0012, 0.0012))
        rack.front_cylinder(g, "mx_alarm_red", (X(self.CIRC_X), y - 0.0016, Z(self.CIRC_Z)),
                            0.0043, 0.0012, 24)
        # The button has to thread a 0.25mm gap: proud of the craft slab
        # so it is visible at all, behind the overlay so ACO/LT survives.
        rack.rounded_prism(g, "mx_button", (X(self.ACO_X), y - 0.0004, Z(self.ACO_Z)),
                           (self.ACO_W, 0.0012, 0.0078), radius=0.0038, bevel=0.0004, steps=12)
        for tx in self.TERM_X:
            self.terminal_block(rack, g, X(tx), Z(sum(self.TERM_Z) / 2))
        # OK and FAIL pairs over four rounded slot tabs.
        for cx in self.OKFAIL_X:
            self.lamp(rack, g, X(cx) - 0.0044, Z(self.OKFAIL_Z), "mx_led_green")
            self.lamp(rack, g, X(cx) + 0.0044, Z(self.OKFAIL_Z), "mx_led_red")
        for cx, fill in zip(self.OKFAIL_X, (1.0, 0.5, 0.0, 0.0)):
            tz = Z(sum(self.TAB_Z) / 2)
            th = (self.TAB_Z[0] - self.TAB_Z[1]) * h
            rack.rounded_prism(g, "mx_tab", (X(cx), y - 0.0004, tz), (self.TAB_W, 0.0010, th),
                               radius=th * 0.42, bevel=0.0003, steps=12)
            if fill:
                rack.box(g, "mx_tab_cyan",
                         (X(cx) - self.TAB_W / 2 + self.TAB_W * fill / 2, y - 0.0006, tz),
                         (self.TAB_W * fill, 0.0008, th * 0.84))

        # ---- the four cards ----------------------------------------------
        for i in range(4):
            self.card(rack, g, Z(self.card_z(i)), catch=i >= 2)
            self.slot_badge(rack, g, Z(self.card_z(i) - self.BADGE_DROP),
                            (0.0, 0.0, 0.5, 1.0)[i])

        # Slot 2: forty SFP cages, two rows of twenty in four groups.
        cz0 = self.card_z(0)
        for gx in self.DPC_GROUP_X:
            for k in range(5):
                cx = X(gx + (k + 0.5) * self.DPC_CAGE_PITCH)
                for rz in self.DPC_ROW_Z:
                    self.sfp_cage(rack, g, cx, Z(rz), self.DPC_ROW_H * h)
        # Two punched vent blocks and the OK/FAIL pair beside them.
        for vx0, vx1 in self.DPC_VENT_X:
            for col in range(6):
                for rowi in range(4):
                    rack.front_cylinder(g, "mx_vent",
                                        (X(vx0 + (col + 0.5) * (vx1 - vx0) / 6), y - 0.0014,
                                         Z(cz0 + (1.5 - rowi) * 0.0128)), 0.0018, 0.0010, 10)
        for k, mat in enumerate(("mx_led_dark", "mx_led_dark")):
            self.lamp(rack, g, X(self.DPC_LED_X), Z(cz0 + 0.0165 - k * 0.033), mat)
        rack.front_cylinder(g, "mx_screw", (X(self.DPC_SCREW_X), y - 0.0014, Z(cz0 + 0.030)),
                            0.0030, 0.0012, 18)

        # Slot 1: four XFP cages with a lamp pair beside each.
        cz1 = self.card_z(1)
        for i in range(4):
            cx = self.XFP_X0 + i * self.XFP_PITCH
            rack.box(g, "mx_xfp", (X(cx), y - 0.0018, Z(cz1)),
                     (self.XFP[0], 0.0018, self.XFP[1] * h))
            rack.box(g, "mx_cage_bore", (X(cx), y - 0.0028, Z(cz1 - 0.006)),
                     (self.XFP[0] * 0.66, 0.0008, self.XFP[1] * h * 0.34))
            for k, dz in enumerate((0.004, -0.004)):
                self.lamp(rack, g, X(cx - self.XFP_LED_DX + k * 0.0056), Z(cz1 - 0.008),
                          "mx_led_dark")
        rack.front_cylinder(g, "mx_screw", (X(self.DPC_SCREW_X), y - 0.0014, Z(cz1 + 0.030)),
                            0.0030, 0.0012, 18)

        # Slots 1/0 and 0: SCB-MX with an RE-S-1300 set into it.
        for i in (2, 3):
            cz = self.card_z(i)
            for sx in self.SCB_SEAM:
                rack.box(g, "mx_card_edge", (X(sx), y - 0.0014, Z(cz)),
                         (0.0016, 0.0010, self.CARD_H * h * 0.80))
            for lx in self.SCB_LED_X:
                for dz in (0.011, -0.011):
                    self.lamp(rack, g, X(lx), Z(cz + dz), "mx_led_dark")
            for lx in self.RE_LAMP_X:
                for dz in (0.008, -0.008):
                    self.lamp(rack, g, X(lx), Z(cz + dz), "mx_led_dark")
            rack.front_cylinder(g, "mx_led_dark", (X(self.RE_BUTTON_X), y - 0.0016, Z(cz - 0.008)),
                                0.0022, 0.0014, 16)
            rack.front_cylinder(g, "mx_jack_bore", (X(self.RE_RESET_X), y - 0.0014, Z(cz - 0.020)),
                                0.0009, 0.0010, 10)
            ux0, ux1 = self.RE_PORT_X[0]
            rack.box(g, "mx_jack", (X((ux0 + ux1) / 2), y - 0.0012, Z(cz - 0.006)),
                     (ux1 - ux0, 0.0012, 0.0110))
            rack.box(g, "mx_jack_bore", (X((ux0 + ux1) / 2), y - 0.0018, Z(cz - 0.006)),
                     ((ux1 - ux0) * 0.66, 0.0008, 0.0074))
            for px0, px1 in self.RE_PORT_X[1:]:
                self.rj45(rack, g, X(px0), X(px1), Z(cz - 0.006))
            for sx in self.RE_SCREW_X:
                rack.front_cylinder(g, "mx_screw", (X(sx), y - 0.0016, Z(cz - 0.004)),
                                    0.0038, 0.0014, 20)

        # ---- bottom rail, six rivets across it ---------------------------
        band("mx_chassis", -0.4403, -0.4993)
        for k in range(6):
            rack.front_cylinder(g, "mx_screw", (X(0.0640 + k * 0.0632), y - 0.0012, Z(-0.4700)),
                                0.0026, 0.0010, 16)

        self.silkscreen(rack, z)
