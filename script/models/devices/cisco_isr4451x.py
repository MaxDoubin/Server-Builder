"""Cisco ISR 4451-X, the I/O face, off Cisco's own orthographic line drawing.

Cisco call this the back panel and the power supply face the bezel side, but
it is the face with the ports on it, so it is the one worth modelling and it
is the one that faces the aisle in every deployment photograph there is.

The source is Figure 1-8 of the Hardware Installation Guide for the Cisco 4000
Series ISRs, an orthographic elevation with twenty three numbered callouts.
cisco.com answers 403 to every image under /c/dam from this network, but a
print to PDF of that whole chapter is mirrored on imimg.com, and the figures
come out of it as the original rasters. Figure 1-41 in the same chapter is a
zoom of just the port cluster, four times the scale, and the two were tied
together on two shared landmarks so the cluster could be measured at the finer
scale and then placed at the coarser one.

What the drawing shows across 438mm and 89mm, in two bands:

  The upper band is a shelf. At its left, in order: the GE 0 management jack
  over two stacked USB with a yellow MGMT tab beside them; the mini USB
  console under a cyan CONSOLE bar; AUX over CON in one housing with a black
  AUX bar above and the cyan bar below. Then the four Gigabit ports, in two
  groups of two under yellow bars, and the two groups are mirror images:
  GE 0/0/0 and 0/0/1 put their RJ45s on the left and their SFP cages on the
  right, and GE 0/0/2 and 0/0/3 do the opposite, with the lamp column and its
  SFP legend between them both times. Then NIM slots 1, 2 and 3, drawn with
  their dividers pulled out.

  The lower band is two Enhanced Service Module bays, SM-X 1 on the left and
  SM-X 2 on the right, each a plate with an ejector strip down its left edge
  and twenty four columns by five rows of oval vents. The ground lug is at the
  far right, outside them both.

Nothing here is shared with another product, including with the 4331 next to
it in the same chassis family: this router has three NIM bays where that one
has two, its ports sit on a shelf rather than in a single plate, and the two
Gigabit groups mirror each other, which the 4331's do not.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class ISR4451X(Device):
    slug = "ISR4451X"
    name = "Cisco ISR 4451-X"
    u = 2
    #: Cisco's 4000 Series data sheet, table 5: 88.9 x 438.15 x 469.9mm.
    width = 0.43815
    depth = 0.4699
    source = ("https://www.cisco.com/c/en/us/products/collateral/routers/"
              "4000-series-integrated-services-routers-isr/data_sheet-c78-732542.html")
    references = [
        Reference("https://www.cisco.com/c/en/us/td/docs/routers/access/4400/hardware/"
                  "installation/guide4400-4300/C4400_isr/Overview.html",
                  "Figure 1-8, orthographic of the I/O face, and Figure 1-41, "
                  "the same port cluster at four times the scale"),
        Reference("https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-ISR4451-X-K9.jpg",
                  "three quarter of the bezel face, 1040x1040, for the chassis finish"),
    ]

    def face(self, rack) -> float:
        """The visible plane of the panel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------- measured
    #
    # The drawing's chassis outline is 545 by 111 pixels for the published
    # 438.15 by 88.9mm, so a pixel is 0.804mm one way and 0.801 the other,
    # which is the check that it really is orthographic. Features were found
    # by thresholding and taking bounding boxes rather than by eye, and the
    # port cluster came off the four times zoom through a two point fit,
    # 0.358mm per zoom pixel across and 0.363 down.
    #
    # Horizontal figures are metres from the left edge of the 438.15mm panel.
    # Vertical figures are fractions of panel height with zero at the middle.

    #: The shelf the ports sit on, and the rail under it.
    TOP_RAIL = (0.5000, 0.4494)               # 0 to 4.5mm
    SHELF_RAIL = (0.0523, 0.0141)             # 39.8 to 43.2mm
    #: Small rounded vents in both, on a 6.3mm pitch across the whole width.
    SHELF_VENT_X0, SHELF_VENT_PITCH = 0.0060, 0.00630
    SHELF_VENT = (0.0042, 0.0022)
    SHELF_VENT_Z = (0.4663, 0.0332)

    #: GE 0 management over USB 0 and USB 1, with a yellow MGMT tab.
    MGMT_TAB_X = (0.0040, 0.0080)
    MGMT_TAB_Z = (0.4494, 0.3144)
    MGMT_HOUSE_X = (0.0085, 0.0255)
    MGMT_HOUSE_Z = (0.4550, 0.0951)
    MGMT_JACK_X = (0.0100, 0.0240)
    MGMT_JACK_Z = (0.4438, 0.3088)
    USB0_Z = (0.2863, 0.2300)
    USB1_Z = (0.1907, 0.1288)

    #: The mini USB console and the cyan bar that names it and the CON jack.
    USBMINI_X = (0.0285, 0.0355)
    USBMINI_Z = (0.1625, 0.1119)
    CONSOLE_BAR_X = (0.0195, 0.0485)
    CONSOLE_BAR_Z = (0.1007, 0.0557)

    #: AUX over CON in one housing under a black bar.
    AUX_HOUSE_X = (0.0395, 0.0570)
    AUX_HOUSE_Z = (0.4550, 0.0838)
    AUX_BAR_X = (0.0400, 0.0560)
    AUX_BAR_Z = (0.4494, 0.3931)
    AUX_JACK_X = (0.0410, 0.0560)
    AUX_JACK_Z = (0.3875, 0.2469)
    CON_JACK_Z = (0.2300, 0.0838)

    #: The two Gigabit groups. Each is 46mm of yellow bar over three columns,
    #: and the second group runs its columns in the opposite order.
    GRP_X = ((0.0600, 0.1060), (0.1080, 0.1540))
    GRP_BAR_TOP = (0.4550, 0.4100)
    GRP_BAR_BOT = (0.1063, 0.0591)
    #: Column widths within a group: jack column, lamp column, cage column.
    COL_JACK, COL_LAMP, COL_CAGE = 0.0180, 0.0090, 0.0180
    RJ_TOP_Z = (0.3988, 0.2525)
    RJ_BOT_Z = (0.2357, 0.1063)
    CAGE_TOP_Z = (0.3988, 0.2582)
    CAGE_BOT_Z = (0.2413, 0.1119)
    LAMP_Z = (0.3031, 0.2525, 0.1907, 0.1400)

    #: Three NIM bays, drawn empty on the elevation and filled with blanks
    #: here because that is how a racked router ships.
    NIM_X = ((0.1580, 0.2450), (0.2480, 0.3320), (0.3400, 0.4200))
    NIM_Z = (0.4438, 0.0501)                  # 5.0 to 40.0mm
    NIM_LOUVRE_PITCH, NIM_LOUVRE = 0.00880, (0.0058, 0.0032)
    NIM_LOUVRE_Z = (0.3600, 0.2700)
    NIM_OVAL_PITCH, NIM_OVAL = 0.00590, (0.0042, 0.0030)
    NIM_OVAL_Z = (0.1500, 0.0800)

    #: The two service module bays and the ground lug beside them.
    SM_X = ((0.0020, 0.1960), (0.2000, 0.4000))
    SM_Z = (0.0141, -0.4561)                  # 43.2 to 85.0mm
    SM_HANDLE_W = 0.0170
    SM_FIELD_DX = 0.0193                      # first vent centre inside a bay
    SM_VENT_PITCH, SM_VENT_N, SM_VENT = 0.00727, 24, (0.0050, 0.0030)
    SM_VENT_Z = (-0.0343, -0.1209, -0.2075, -0.2942, -0.3808)
    GROUND_X = (0.4040, 0.4340)

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared.

        The line drawing carries no colour at all, so the palette comes off
        the three quarter photograph of the same chassis from the other side:
        a graphite body measuring 92 of 255 in the shade and 162 where the lid
        catches the light, which is a shade lighter than the 4331 beside it in
        the same family and is a real difference between the two castings.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            "i4451_chassis": pbr("ISR4451 Chassis", [76, 77, 77, 255], 0.18, 0.56),
            "i4451_rail": pbr("ISR4451 Shelf Rail", [58, 58, 59, 255], 0.20, 0.54),
            "i4451_lid": pbr("ISR4451 Lid", [68, 69, 69, 255], 0.24, 0.46),
            "i4451_ear": pbr("ISR4451 Ear", [82, 83, 83, 255], 0.24, 0.48),
            # Module blanks and the SM plates, zinc but at a low metallic so
            # the base colour stays diffuse and the plates stay brighter than
            # the chassis instead of collapsing onto its value.
            "i4451_nim": pbr("ISR4451 NIM Blank", [208, 208, 205, 255], 0.22, 0.38),
            "i4451_sm": pbr("ISR4451 SM Plate", [192, 192, 189, 255], 0.24, 0.42),
            "i4451_handle": pbr("ISR4451 Ejector", [172, 172, 169, 255], 0.34, 0.36),
            "i4451_housing": pbr("ISR4451 Port Housing", [150, 151, 149, 255], 0.26, 0.44),
            "i4451_louvre": pbr("ISR4451 Louvre", [100, 100, 98, 255], 0.16, 0.62),
            "i4451_slot": pbr("ISR4451 Slot", [28, 28, 29, 255], 0.06, 0.88),
            "i4451_deep": pbr("ISR4451 Cavity", [10, 10, 11, 255], 0.04, 0.94),
            "i4451_jack_shield": pbr("ISR4451 Jack Shield", [126, 127, 125, 255], 0.44, 0.40),
            "i4451_jack_shell": pbr("ISR4451 Jack Body", [32, 32, 33, 255], 0.10, 0.72),
            "i4451_jack_gold": pbr("ISR4451 Jack Contacts", [186, 148, 68, 255], 0.80, 0.28),
            "i4451_cage": pbr("ISR4451 SFP Cage", [22, 22, 23, 255], 0.24, 0.58),
            "i4451_cage_edge": pbr("ISR4451 Card Edge", [202, 202, 196, 255], 0.0, 0.58),
            # The three printed tabs. Cisco's port yellow, the black AUX bar
            # and the cyan console bar, all taken a notch below the scanned
            # values because this studio blows a printed colour to paper white
            # above about 210.
            "i4451_yellow": pbr("ISR4451 Yellow Bar", [204, 200, 104, 255], 0.0, 0.66),
            "i4451_cyan": pbr("ISR4451 Cyan Bar", [140, 190, 210, 255], 0.0, 0.66),
            "i4451_black_bar": pbr("ISR4451 Black Bar", [30, 30, 31, 255], 0.0, 0.70),
            "i4451_screw": pbr("ISR4451 Captive Screw", [166, 167, 165, 255], 0.52, 0.36),
            # Port lamps unlit, which is how a drawing shows them and how most
            # of them sit on a running router.
            "i4451_lamp": pbr("ISR4451 Lamp", [44, 45, 46, 255], 0.10, 0.46),
            "i4451_lamp_on": pbr("ISR4451 Lamp Lit", [66, 176, 102, 255], 0.0, 0.26,
                                 emissive=[0.04, 0.20, 0.08]),
        })

    # ---------------------------------------------------------------- parts

    def slot(self, rack, g: str, x: float, z: float, w: float, h: float, surf: float) -> None:
        """One oval vent punched in a plate, `surf` being that plate's face."""
        rack.rounded_prism(g, "i4451_slot", (x, surf + 0.0013, z), (w, 0.0028, h),
                           radius=h * 0.48, bevel=0.0003, steps=8)

    def louvre(self, rack, g: str, x: float, z: float, surf: float) -> None:
        """A pressed louvre in a NIM blank: a slot with a hood over it."""
        w, h = self.NIM_LOUVRE
        rack.rounded_prism(g, "i4451_slot", (x, surf + 0.0013, z), (w, 0.0028, h),
                           radius=h * 0.45, bevel=0.0003, steps=8)
        rack.box(g, "i4451_louvre", (x, surf - 0.0003, z + h * 0.40), (w, 0.0008, h * 0.44))

    def jack(self, rack, g: str, x: float, z: float, w: float, h: float) -> None:
        """An 8P8C jack on the shelf, latch down.

        A bright rim around a black mouth. This chassis is dark, so unlike the
        ASR next door the jack has to be lighter than what surrounds it rather
        than darker, and the rim is doing all of that work.
        """
        y = self.face(rack)
        rim = 0.0010
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            rack.box(g, "i4451_jack_shield", (x + dx, y - 0.0022, z + dz), (bw, 0.0014, bh))
        rack.box(g, "i4451_deep", (x, y - 0.0009, z), (w - rim * 2, 0.0026, h - rim * 2))
        rack.box(g, "i4451_deep", (x, y + 0.0046, z), (w * 0.80, 0.0090, h * 0.80))
        rack.box(g, "i4451_jack_shield", (x, y - 0.0025, z - h * 0.35), (w * 0.30, 0.0010, h * 0.20))
        tongue_z = z + h * 0.19
        rack.box(g, "i4451_jack_shell", (x, y - 0.0022, tongue_z), (w * 0.54, 0.0006, h * 0.20))
        for i in range(8):
            cx = x - w * 0.22 + i * (w * 0.44 / 7)
            rack.box(g, "i4451_jack_gold", (cx, y - 0.0024, tongue_z),
                     (w * 0.030, 0.0005, h * 0.15))

    def cage(self, rack, g: str, x: float, z: float, w: float, h: float, top: bool) -> None:
        """One SFP opening. The stacked pair are inverted castings."""
        y = self.face(rack)
        rack.box(g, "i4451_cage", (x, y - 0.0020, z), (w, 0.0012, h))
        rack.box(g, "i4451_deep", (x, y + 0.0042, z), (w * 0.88, 0.0110, h * 0.82))
        outer = h * (0.32 if top else -0.32)
        for k in (0.88, 0.62):
            rack.box(g, "i4451_cage", (x, y - 0.0026, z + outer * k), (w * 0.68, 0.0008, h * 0.05))
        rack.box(g, "i4451_cage_edge", (x, y - 0.0027, z - outer * 0.70),
                 (w * 0.30, 0.0008, h * 0.08))

    def usb_a(self, rack, g: str, x: float, w: float, z: float, h: float) -> None:
        """A USB type A receptacle: a slot with a tongue along its top edge."""
        y = self.face(rack)
        rack.box(g, "i4451_jack_shield", (x, y - 0.0018, z), (w, 0.0010, h))
        rack.box(g, "i4451_deep", (x, y - 0.0004, z), (w - 0.0016, 0.0044, h - 0.0014))
        rack.box(g, "i4451_cage_edge", (x, y - 0.0027, z + h * 0.17), (w - 0.0040, 0.0007, h * 0.24))

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Four port names on yellow, MGMT turned on its side, AUX, CONSOLE, the
        SFP legend and its EN and S lamp names twice over, three slot names
        and two module names. Geometry cannot spell any of it, and at this
        scale a grey box where a word goes reads as a smudge.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (44, 44, 45, 255)
        pale = (226, 226, 224, 255)
        faint = (146, 146, 144, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        def turned(text, cx, cy, f, fill=ink):
            """Set `text` reading upward, which is how MGMT is printed."""
            b = d.textbbox((0, 0), text, font=f)
            tile = Image.new("RGBA", (b[2] + 6, b[3] + 6), (0, 0, 0, 0))
            ImageDraw.Draw(tile).text((0, 0), text, font=f, fill=fill)
            tile = tile.rotate(90, expand=True)
            img.alpha_composite(tile, (int(cx - tile.width / 2), int(cy - tile.height / 2)))

        # ---- the four Gigabit names, and the mirrored group order.
        f_port = sized(2.0, True)
        for gi, (x0, x1) in enumerate(self.GRP_X):
            centred(f"GE 0/0/{gi * 2}", px((x0 + x1) / 2) + 0.0060 * ppm,
                    py(sum(self.GRP_BAR_TOP) / 2), f_port)
            centred(f"GE 0/0/{gi * 2 + 1}", px((x0 + x1) / 2) + 0.0060 * ppm,
                    py(sum(self.GRP_BAR_BOT) / 2), f_port)
            # SFP over four lamp names, in the column between jack and cage.
            lamp_cx = px(x0 + self.COL_JACK + self.COL_LAMP / 2) if gi == 0 else \
                px(x0 + self.COL_CAGE + self.COL_LAMP / 2)
            centred("SFP", lamp_cx, py(0.3481), sized(1.7, True))
            for k, nm in enumerate(("EN", "S", "EN", "S")):
                centred(nm, lamp_cx - 0.0042 * ppm, py(self.LAMP_Z[k]), sized(1.2))
            centred(str(gi * 2), lamp_cx + 0.0040 * ppm,
                    py((self.LAMP_Z[0] + self.LAMP_Z[1]) / 2), sized(1.5))
            centred(str(gi * 2 + 1), lamp_cx + 0.0040 * ppm,
                    py((self.LAMP_Z[2] + self.LAMP_Z[3]) / 2), sized(1.5))

        # ---- the left hand cluster.
        turned("MGMT", px(sum(self.MGMT_TAB_X) / 2), py(sum(self.MGMT_TAB_Z) / 2), sized(1.6, True))
        centred("AUX", px(sum(self.AUX_BAR_X) / 2), py(sum(self.AUX_BAR_Z) / 2), sized(1.8, True), pale)
        centred("CONSOLE", px(sum(self.CONSOLE_BAR_X) / 2), py(sum(self.CONSOLE_BAR_Z) / 2),
                sized(1.8, True))
        for ex in (self.CONSOLE_BAR_X[0] + 0.0035, self.CONSOLE_BAR_X[1] - 0.0035):
            centred("EN", px(ex), py(sum(self.CONSOLE_BAR_Z) / 2), sized(1.3, True))
        f_sl = sized(1.2)
        centred("GE 0", px(sum(self.MGMT_JACK_X) / 2), py(0.4700), f_sl, pale)
        centred("0", px(self.MGMT_HOUSE_X[0]) - 0.0015 * ppm, py(sum(self.USB0_Z) / 2), f_sl, pale)
        centred("1", px(self.MGMT_HOUSE_X[0]) - 0.0015 * ppm, py(sum(self.USB1_Z) / 2), f_sl, pale)

        # ---- slot and module names, printed on the shelf rail and the plates.
        f_mod = sized(2.0, True)
        for i, (x0, x1) in enumerate(self.NIM_X):
            centred(f"NIM {i + 1}", px((x0 + x1) / 2), py(0.0332), sized(1.7, True), pale)
        for i, (x0, x1) in enumerate(self.SM_X):
            centred(f"SM-X {i + 1}", px((x0 + x1) / 2), py(-0.4300), f_mod, faint)

        tex = save_texture("isr4451x_silkscreen.png", img)
        rack.materials["i4451_silktex"] = PBRMaterial(
            name="ISR4451-X Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.58,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "i4451_silktex",
                            (0, self.face(rack) - 0.0030, z), self.width, self.height)

    # ---------------------------------------------------------------- build

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

        def band(zr, x0, x1, mat, depth=0.0008, dy=0.0018):
            cz = Z((zr[0] + zr[1]) / 2)
            rack.box(g, mat, ((X(x0) + X(x1)) / 2, y - dy, cz),
                     (x1 - x0, depth, (zr[0] - zr[1]) * h))

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.94))
        rack.rounded_prism(g, "i4451_chassis", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0012, bevel=0.0006, steps=6)
        rack.box(g, "i4451_lid", (0, y + 0.016, z + h * 0.485), (w - 0.006, 0.030, 0.0030))

        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0200)
            rack.rounded_prism(g, "i4451_ear", (ex, y + 0.0012, z), (0.040, 0.0080, h * 0.96),
                               radius=0.0014, bevel=0.0006, steps=6)
            for dz in (h * 0.36, h * 0.12, -h * 0.12, -h * 0.36):
                rack.front_cylinder(g, "i4451_deep", (ex, y - 0.0026, z + dz), 0.0026, 0.0028, 16)

        # ---- the two vented rails that bracket the port shelf -------------
        vw, vh = self.SHELF_VENT
        for rail, vz in ((self.TOP_RAIL, self.SHELF_VENT_Z[0]),
                         (self.SHELF_RAIL, self.SHELF_VENT_Z[1])):
            band(rail, 0.0, w, "i4451_rail", 0.0010, 0.0006)
            n = int((w - 0.014) / self.SHELF_VENT_PITCH)
            for i in range(n):
                rack.rounded_prism(g, "i4451_deep",
                                   (X(self.SHELF_VENT_X0 + i * self.SHELF_VENT_PITCH),
                                    y + 0.0009, Z(vz)), (vw, 0.0030, vh),
                                   radius=vh * 0.45, bevel=0.0003, steps=6)

        # ---- GE 0 management, two USB, and the yellow MGMT tab -------------
        band(self.MGMT_TAB_Z, *self.MGMT_TAB_X, "i4451_yellow")
        mh0, mh1 = self.MGMT_HOUSE_X
        rack.box(g, "i4451_housing", ((X(mh0) + X(mh1)) / 2, y - 0.0011,
                                      Z(sum(self.MGMT_HOUSE_Z) / 2)),
                 (mh1 - mh0, 0.0009, (self.MGMT_HOUSE_Z[0] - self.MGMT_HOUSE_Z[1]) * h))
        self.jack(rack, g, (X(self.MGMT_JACK_X[0]) + X(self.MGMT_JACK_X[1])) / 2,
                  Z(sum(self.MGMT_JACK_Z) / 2),
                  self.MGMT_JACK_X[1] - self.MGMT_JACK_X[0],
                  (self.MGMT_JACK_Z[0] - self.MGMT_JACK_Z[1]) * h)
        for zr in (self.USB0_Z, self.USB1_Z):
            self.usb_a(rack, g, (X(mh0) + X(mh1)) / 2, (mh1 - mh0) - 0.0022,
                       Z(sum(zr) / 2), (zr[0] - zr[1]) * h)

        # ---- the mini USB console and the cyan bar under everything --------
        um0, um1 = self.USBMINI_X
        rack.box(g, "i4451_jack_shield", ((X(um0) + X(um1)) / 2, y - 0.0016,
                                          Z(sum(self.USBMINI_Z) / 2)),
                 (um1 - um0, 0.0010, (self.USBMINI_Z[0] - self.USBMINI_Z[1]) * h))
        rack.box(g, "i4451_deep", ((X(um0) + X(um1)) / 2, y - 0.0002,
                                   Z(sum(self.USBMINI_Z) / 2)),
                 (um1 - um0 - 0.0016, 0.0044, (self.USBMINI_Z[0] - self.USBMINI_Z[1]) * h - 0.0012))
        band(self.CONSOLE_BAR_Z, *self.CONSOLE_BAR_X, "i4451_cyan")

        # ---- AUX over CON --------------------------------------------------
        ah0, ah1 = self.AUX_HOUSE_X
        rack.box(g, "i4451_housing", ((X(ah0) + X(ah1)) / 2, y - 0.0011,
                                      Z(sum(self.AUX_HOUSE_Z) / 2)),
                 (ah1 - ah0, 0.0009, (self.AUX_HOUSE_Z[0] - self.AUX_HOUSE_Z[1]) * h))
        band(self.AUX_BAR_Z, *self.AUX_BAR_X, "i4451_black_bar")
        ajx = (X(self.AUX_JACK_X[0]) + X(self.AUX_JACK_X[1])) / 2
        ajw = self.AUX_JACK_X[1] - self.AUX_JACK_X[0]
        self.jack(rack, g, ajx, Z(sum(self.AUX_JACK_Z) / 2), ajw,
                  (self.AUX_JACK_Z[0] - self.AUX_JACK_Z[1]) * h)
        self.jack(rack, g, ajx, Z(sum(self.CON_JACK_Z) / 2), ajw,
                  (self.CON_JACK_Z[0] - self.CON_JACK_Z[1]) * h)

        # ---- the two Gigabit groups, the second one mirrored ---------------
        for gi, (x0, x1) in enumerate(self.GRP_X):
            band(self.GRP_BAR_TOP, x0, x1, "i4451_yellow")
            band(self.GRP_BAR_BOT, x0, x1, "i4451_yellow")
            # Group 0 reads jack, lamps, cages; group 1 reads cages, lamps,
            # jack. Drawing both the same way is the single thing that would
            # make this panel obviously not a 4451.
            if gi == 0:
                jack_x0, cage_x0 = x0, x0 + self.COL_JACK + self.COL_LAMP
            else:
                cage_x0, jack_x0 = x0, x0 + self.COL_CAGE + self.COL_LAMP
            lamp_x0 = x0 + (self.COL_JACK if gi == 0 else self.COL_CAGE)
            jcx = X(jack_x0 + self.COL_JACK / 2)
            jw = self.COL_JACK - 0.0018
            self.jack(rack, g, jcx, Z(sum(self.RJ_TOP_Z) / 2), jw,
                      (self.RJ_TOP_Z[0] - self.RJ_TOP_Z[1]) * h)
            self.jack(rack, g, jcx, Z(sum(self.RJ_BOT_Z) / 2), jw,
                      (self.RJ_BOT_Z[0] - self.RJ_BOT_Z[1]) * h)
            ccx = X(cage_x0 + self.COL_CAGE / 2)
            cw = self.COL_CAGE - 0.0020
            self.cage(rack, g, ccx, Z(sum(self.CAGE_TOP_Z) / 2), cw,
                      (self.CAGE_TOP_Z[0] - self.CAGE_TOP_Z[1]) * h, True)
            self.cage(rack, g, ccx, Z(sum(self.CAGE_BOT_Z) / 2), cw,
                      (self.CAGE_BOT_Z[0] - self.CAGE_BOT_Z[1]) * h, False)
            lcx = X(lamp_x0 + self.COL_LAMP / 2)
            for k, lz in enumerate(self.LAMP_Z):
                # Only the enable lamp of the first port is lit. A drawing
                # shows all four as outlines and a live router shows one or
                # two, so a column of four green dots is the wrong answer.
                mat = "i4451_lamp_on" if (gi == 0 and k == 0) else "i4451_lamp"
                rack.front_cylinder(g, mat, (lcx, y - 0.0016, Z(lz)), 0.0016, 0.0012, 18)

        # ---- three NIM bays, each with a blank fitted ----------------------
        lw, lh = self.NIM_LOUVRE
        ow, oh = self.NIM_OVAL
        nz0, nz1 = self.NIM_Z
        for x0, x1 in self.NIM_X:
            cx = (X(x0) + X(x1)) / 2
            cz = Z((nz0 + nz1) / 2)
            hz = (nz0 - nz1) * h
            rack.box(g, "i4451_deep", (cx, y - 0.0004, cz), (x1 - x0 + 0.0014, 0.0010, hz + 0.0014))
            rack.rounded_prism(g, "i4451_nim", (cx, y - 0.0016, cz), (x1 - x0, 0.0016, hz),
                               radius=0.0008, bevel=0.0004, steps=6)
            surf = y - 0.0024
            n_l = int((x1 - x0 - 0.016) / self.NIM_LOUVRE_PITCH) + 1
            for i in range(n_l):
                lx = X(x0 + 0.0090 + i * self.NIM_LOUVRE_PITCH)
                for lz in self.NIM_LOUVRE_Z:
                    self.louvre(rack, g, lx, Z(lz), surf)
            n_o = int((x1 - x0 - 0.014) / self.NIM_OVAL_PITCH) + 1
            gap = (x0 + x1) / 2 - 0.0100, (x0 + x1) / 2 + 0.0100
            for i in range(n_o):
                ox_m = x0 + 0.0070 + i * self.NIM_OVAL_PITCH
                for j, oz in enumerate(self.NIM_OVAL_Z):
                    if j == 1 and gap[0] < ox_m < gap[1]:
                        continue
                    self.slot(rack, g, X(ox_m), Z(oz), ow, oh, surf)
            # The captive screw at the right hand end of every blank.
            scx = X(x1 - 0.0055)
            rack.front_cylinder(g, "i4451_screw", (scx, y - 0.0032, Z((nz0 + nz1) / 2)),
                                0.0028, 0.0022, 20)
            rack.front_cylinder(g, "i4451_deep", (scx, y - 0.0042, Z((nz0 + nz1) / 2)),
                                0.0010, 0.0006, 12)

        # ---- two service module bays ---------------------------------------
        sw, sh = self.SM_VENT
        sz0, sz1 = self.SM_Z
        for x0, x1 in self.SM_X:
            cx = (X(x0) + X(x1)) / 2
            cz = Z((sz0 + sz1) / 2)
            hz = (sz0 - sz1) * h
            rack.box(g, "i4451_deep", (cx, y - 0.0004, cz), (x1 - x0 + 0.0014, 0.0010, hz + 0.0014))
            rack.rounded_prism(g, "i4451_sm", (cx, y - 0.0016, cz), (x1 - x0, 0.0016, hz),
                               radius=0.0008, bevel=0.0004, steps=6)
            surf = y - 0.0024
            # The ejector strip down the left edge, with its two screws.
            hx = X(x0 + self.SM_HANDLE_W / 2)
            rack.rounded_prism(g, "i4451_handle", (hx, y - 0.0026, cz),
                               (self.SM_HANDLE_W - 0.0020, 0.0020, hz - 0.0040),
                               radius=0.0010, bevel=0.0005, steps=6)
            for dz in (hz * 0.30, -hz * 0.30):
                rack.front_cylinder(g, "i4451_screw", (hx, y - 0.0040, cz + dz), 0.0024, 0.0018, 18)
            for i in range(self.SM_VENT_N):
                vx = X(x0 + self.SM_FIELD_DX + i * self.SM_VENT_PITCH)
                for vz in self.SM_VENT_Z:
                    self.slot(rack, g, vx, Z(vz), sw, sh, surf)

        # ---- the ground lug at the far right --------------------------------
        gx0, gx1 = self.GROUND_X
        for dz in (0.0070, -0.0070):
            rack.front_cylinder(g, "i4451_screw", (X((gx0 + gx1) / 2), y - 0.0022,
                                                   Z(-0.2210) + dz), 0.0030, 0.0020, 18)
        rack.box(g, "i4451_handle", (X((gx0 + gx1) / 2), y - 0.0014, Z(-0.2210)),
                 (0.0180, 0.0010, 0.0180))

        self.silkscreen(rack, z)
