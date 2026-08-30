"""APC Smart-UPS SMT1500RM2U, from Schneider's dimensioned front elevation.

A UPS is the one thing in a rack that is mostly bezel. Two thirds of this
face is a moulded plastic louvre grille with the APC wordmark screened on
it, and the remaining third is a control panel: a wide flat power key, a
row of four status lamps with their icons, a monochrome LCD, and four soft
keys in a two by two. There is not a port on the front of it.

What the elevation and the in rack photograph show:

  The bezel is a single black ABS moulding with a raised frame all round a
  deeply set grille. The grille is not a punched sheet: it is eight cast
  louvre blades, each one lit along its top edge and shadowed underneath,
  which is why the front of a Smart-UPS reads as stripes from across a room
  and as a slatted vent up close. The APC wordmark sits on the blades near
  the left hand end, screened in white.

  The control panel is a shallower recess at the right. The power key is a
  wide low bar rather than a round button, with the IEC power mark centred
  on it. Under it four lamps: on line, on battery, overload and replace
  battery, the first green and the other three dark until something is
  wrong. Then the LCD, a negative monochrome panel that on a healthy unit
  reads a load figure over a battery figure. Then Esc and Enter on the left
  and up and down on the right.

  The rack ears are folded steel painted the same black as the bezel but a
  visibly different finish, semi gloss against the bezel's matte, with two
  slots each.

Nothing here is shared with another product, and on this one the reason is
easy to state: no other device in the library has a louvre, an LCD or a
soft key, and its bezel is plastic where every switch and server around it
is painted steel.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import Device, Reference


class SmartUPS1500RM2U(Device):
    slug = "SMT1500RM2U"
    name = "APC Smart-UPS SMT1500RM2U"
    u = 2
    #: The dimensioned drawing calls the body 17.0in / 432mm wide, 3.5in /
    #: 89mm high and 18.0in / 457mm deep.
    width = 0.432
    depth = 0.457
    source = "https://www.apc.com/us/en/product/SMT1500RM2U/"
    references = [
        Reference("https://www.refurbups.com/refurbups-item-images-2021/"
                  "UPS-APC-SMT1500RM2U_02.jpg",
                  "the dimensioned drawing, with a true front elevation and the "
                  "432 by 89mm figures that calibrate it; 1500x1500"),
        Reference("https://www.refurbups.com/refurbups-item-images-2021/"
                  "UPS-APC-SMT1500RM2U_09.jpg",
                  "close up of the bezel and the LCD in a rack, which is where "
                  "the louvre profile and the panel's real black came from"),
        Reference("https://www.refurbups.com/refurbups-item-images-2021/"
                  "UPS-APC-SMT1500RM2U_00.JPG",
                  "three quarter front, for the lid and the ear profile"),
    ]

    # -------------------------------------------------------------- measured
    #
    # The elevation puts the chassis in 820 pixels across the ears and 150
    # down. The drawing's own dimensions are 432mm across the body and 89mm
    # high, so a pixel is 0.5886mm horizontally and 0.5933mm vertically:
    # under a percent apart, so the view is orthographic enough to measure.
    #
    # Horizontal figures are metres from the left edge of the 482.6mm face.
    # Vertical figures are fractions of panel height with zero at the middle,
    # taken as (799 - y_pixel) / 150.

    FACE_W = 0.4826
    #: (482.6 - 432) / 2. Folded steel, and on this product the ears are
    #: plain: two slots, no latch, no ports.
    EAR = 0.0253
    SLOT_Z = 0.300
    SLOT = (0.0135, 0.0068)

    #: The grille recess, pixels 387.5 to 935.4 across and 747 to 854 down.
    GRILLE_X = (0.0327, 0.3552)
    GRILLE_Z = (0.3470, -0.3670)
    #: Eight cast louvre blades. The row profile repeats every 13.5 pixels,
    #: which is 8.0mm, and 8 of those fill the 63.5mm opening.
    LOUVRES = 8
    #: The wordmark, screened on the blades rather than on the frame.
    LOGO_X, LOGO_Z = 0.0756, -0.0170

    #: The control panel recess, pixels 966.7 to 1075 and 745 to 860.8.
    PANEL_X = (0.3736, 0.4374)
    PANEL_Z = (0.3600, -0.4120)

    #: The power key: a wide low bar, not a round button.
    POWER_X, POWER_Z, POWER = 0.4055, 0.2690, (0.0590, 0.0084)
    #: Four status lamps in a row, pixels 769 to 774, with their icons
    #: printed in the 8mm of panel between them and the top of the LCD.
    LAMP_Z = 0.1820
    ICON_Z = 0.1280
    LAMP_X = (0.3835, 0.3982, 0.4129, 0.4276)
    LAMP = (0.0052, 0.0020)
    #: The LCD, pixels 968.8 to 1072.9 and 786.7 to 819.2.
    LCD_X, LCD_Z, LCD = 0.4054, -0.0265, (0.0603, 0.0193)
    #: Four soft keys, two by two: Esc over Enter, up over down.
    KEY_X = (0.3902, 0.4222)
    KEY_Z = (-0.2250, -0.3360)
    KEY = (0.0283, 0.0087)

    def face(self, rack) -> float:
        """The plane of the bezel's raised frame, 5.3mm proud of `front_y`.

        `front_y` is the middle of the panel slab. The grille on this
        product is a 4mm deep recess and the control panel a 2mm one, so
        measuring either from `front_y` puts both inside the moulding and
        the UPS renders as a plain black brick.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Moulded ABS, matte. The elevation reads 52 on the frame under
            # even studio light and the in rack photograph reads 33 in
            # shade, so the paint is a warm near black rather than a grey.
            # Roughness is the number that matters here: at 0.4 the studio
            # puts a highlight down the frame and the bezel looks like a
            # piano lid instead of a moulding.
            "apc_bezel": pbr("Smart-UPS Bezel", [46, 47, 47, 255], 0.06, 0.76),
            "apc_bezel_lit": pbr("Smart-UPS Bezel Edge", [72, 73, 73, 255], 0.06, 0.66),
            # The louvre blades. The lit face of a blade sampled 86 and the
            # slot under it 16, and the whole read of the product is that
            # pair repeated eight times.
            "apc_blade": pbr("Smart-UPS Louvre", [76, 77, 77, 255], 0.05, 0.70),
            "apc_slot": pbr("Smart-UPS Louvre Slot", [14, 14, 15, 255], 0.0, 0.88),
            "apc_recess": pbr("Smart-UPS Recess", [22, 22, 23, 255], 0.02, 0.82),
            # Folded steel, painted the same black but a different finish:
            # visibly glossier than the bezel beside it, which is the only
            # thing separating the ear from the moulding at a distance.
            "apc_ear": pbr("Smart-UPS Ear", [62, 63, 64, 255], 0.30, 0.46),
            "apc_lid": pbr("Smart-UPS Lid", [198, 200, 201, 255], 0.58, 0.34),
            "apc_panel": pbr("Smart-UPS Control Panel", [52, 53, 54, 255], 0.08, 0.70),
            "apc_key": pbr("Smart-UPS Key", [40, 41, 42, 255], 0.06, 0.64),
            "apc_key_edge": pbr("Smart-UPS Key Edge", [88, 89, 90, 255], 0.10, 0.58),
            # Negative monochrome LCD: a dark blue grey glass with pale
            # characters, lit dimly rather than backlit hard.
            "apc_lcd": pbr("Smart-UPS LCD", [26, 32, 40, 255], 0.0, 0.24,
                           emissive=[0.02, 0.03, 0.05]),
            "apc_lcd_frame": pbr("Smart-UPS LCD Bezel", [16, 16, 17, 255], 0.04, 0.60),
            # On line is the only lamp lit on a healthy unit. The other
            # three are moulded in the same clear plastic and read grey.
            "apc_lamp_on": pbr("Smart-UPS On Line", [88, 200, 112, 255], 0.0, 0.26,
                               emissive=[0.10, 0.36, 0.14]),
            "apc_lamp_off": pbr("Smart-UPS Lamp", [104, 105, 104, 255], 0.0, 0.42),
            "apc_logo": pbr("Smart-UPS Wordmark", [228, 229, 230, 255], 0.0, 0.52),
        })

    # ----------------------------------------------------------------- parts

    def louvre(self, rack, g: str, x: float, z: float, w: float, blade_h: float) -> None:
        """One cast louvre blade and the slot under it.

        The blade is drawn as two bars: a wider one for the face and a
        narrow dark one along its bottom edge for the shadow the overhang
        casts. That pair is the whole visual identity of a Smart-UPS front,
        and a flat grey rectangle with lines scored across it, which is what
        the first attempt drew, is not it.
        """
        y = self.face(rack)
        rack.box(g, "apc_blade", (x, y - 0.0013, z), (w, 0.0014, blade_h * 0.82))
        rack.box(g, "apc_slot", (x, y - 0.0008, z - blade_h * 0.45), (w, 0.0010, blade_h * 0.18))
        # The catchlight along the top of each blade, which is what makes
        # the grille read as eight solid objects rather than eight stripes.
        rack.box(g, "apc_bezel_lit", (x, y - 0.0016, z + blade_h * 0.37),
                 (w, 0.0008, blade_h * 0.07))

    def soft_key(self, rack, g: str, x: float, z: float) -> None:
        """One of the four keys under the LCD.

        They are wide, low and barely domed, with a bright moulded rim, and
        they sit in a shared recess rather than in four separate holes.
        """
        y = self.face(rack)
        w, hgt = self.KEY
        rack.rounded_prism(g, "apc_key_edge", (x, y - 0.0018, z), (w, 0.0012, hgt),
                           radius=0.0011, bevel=0.0004, steps=6)
        rack.rounded_prism(g, "apc_key", (x, y - 0.0021, z), (w - 0.0011, 0.0010, hgt - 0.0011),
                           radius=0.0009, bevel=0.0003, steps=6)

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """The wordmark, the lamp icons, the key legends and the LCD text.

        More lettering than anything else in this library, because a UPS
        talks to whoever is standing in front of it. All of it goes in one
        transparent sheet: geometry cannot spell, and four keys marked with
        little grey extruded boxes read as four little grey extruded boxes.

        The LCD characters go in here too rather than in the glass, which
        is a compromise: they end up unlit rather than glowing. Printing
        them pale on a dark panel is what the photograph looks like at any
        distance a rack is seen from, and it costs one texture rather than
        an emissive map.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.FACE_W)
        ppm = W / self.FACE_W
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (176, 177, 176, 255)
        lcd_ink = (196, 214, 236, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- APC, heavy, in white, on the blades near the left hand end.
        #      It measures 57 to 94mm across the face on the elevation, so
        #      it is fitted to that box rather than set by cap height.
        want = (0.0942 - 0.0571) * ppm
        f = font(60, True)
        got = d.textbbox((0, 0), "APC", font=f)[2]
        f_logo = font(max(10, round(60 * want / max(got, 1))), True)
        centred("APC", px(self.LOGO_X), py(self.LOGO_Z), f_logo, (232, 233, 234, 255))

        # ---- the IEC power mark on the key: a broken ring with a bar.
        pkx, pky = px(self.POWER_X), py(self.POWER_Z)
        r = 1.5 / 1000 * ppm
        d.arc([pkx - r, pky - r, pkx + r, pky + r], -62, 242, fill=ink, width=3)
        d.line([(pkx, pky - r * 1.25), (pkx, pky + r * 0.12)], fill=ink, width=3)

        # ---- the four lamp icons, printed under their lamps: a sine wave
        #      for on line, a battery for on battery, a warning triangle for
        #      overload and a crossed battery for replace battery.
        # The icons go on their own line rather than under the lamp band.
        # Set at LAMP_Z minus a tenth, as the first pass had them, they
        # landed inside the LCD glass and the display grew four symbols.
        ir = 1.15 / 1000 * ppm
        for k, lx in enumerate(self.LAMP_X):
            cx, cy = px(lx), py(self.ICON_Z)
            if k == 0:
                d.arc([cx - ir, cy - ir * 0.7, cx, cy + ir * 0.7], 180, 360, fill=ink, width=3)
                d.arc([cx, cy - ir * 0.7, cx + ir, cy + ir * 0.7], 0, 180, fill=ink, width=3)
            elif k == 1 or k == 3:
                d.rectangle([cx - ir, cy - ir * 0.55, cx + ir * 0.75, cy + ir * 0.55],
                            outline=ink, width=3)
                d.rectangle([cx + ir * 0.75, cy - ir * 0.2, cx + ir, cy + ir * 0.2], fill=ink)
                if k == 3:
                    d.line([(cx - ir, cy - ir * 0.55), (cx + ir * 0.75, cy + ir * 0.55)],
                           fill=ink, width=3)
            else:
                d.line([(cx, cy - ir * 0.8), (cx + ir, cy + ir * 0.7),
                        (cx - ir, cy + ir * 0.7), (cx, cy - ir * 0.8)], fill=ink, width=3)

        # ---- key legends. Esc and the enter arrow on the left column, the
        #      two chevrons on the right, which is the order the photograph
        #      shows and the reverse of what a keypad usually does.
        f_key = sized(1.9)
        centred("Esc", px(self.KEY_X[0]), py(self.KEY_Z[0]), f_key)
        ex, ey = px(self.KEY_X[0]), py(self.KEY_Z[1])
        d.line([(ex - r * 0.9, ey), (ex + r * 0.8, ey)], fill=ink, width=3)
        d.line([(ex + r * 0.8, ey), (ex + r * 0.8, ey - r * 0.8)], fill=ink, width=3)
        d.line([(ex - r * 0.9, ey), (ex - r * 0.3, ey - r * 0.5)], fill=ink, width=3)
        d.line([(ex - r * 0.9, ey), (ex - r * 0.3, ey + r * 0.5)], fill=ink, width=3)
        for row, up in ((0, True), (1, False)):
            cx, cy = px(self.KEY_X[1]), py(self.KEY_Z[row])
            # A chevron pointing up has its apex ABOVE its ends, and on a
            # texture y grows downward, so up is a negative apex offset and
            # the sign here is the opposite of the one that reads naturally.
            s = 1 if up else -1
            d.line([(cx - r * 0.9, cy + s * r * 0.35), (cx, cy - s * r * 0.35),
                    (cx + r * 0.9, cy + s * r * 0.35)], fill=ink, width=3)

        # ---- the LCD's default screen, two lines of a fixed pitch face.
        f_lcd = sized(2.4)
        lx = px(self.LCD_X - self.LCD[0] / 2) + 2.2 / 1000 * ppm
        for i, line in enumerate(("Load:   0%", "Batt: 100%")):
            top = py(self.LCD_Z + (0.052 if i == 0 else -0.052))
            b = d.textbbox((0, 0), line, font=f_lcd)
            d.text((lx, top - (b[3] - b[1]) / 2 - b[1]), line, font=f_lcd, fill=lcd_ink)
        # The bar graph APC prints beside each figure.
        for i, filled in enumerate((2, 12)):
            top = py(self.LCD_Z + (0.052 if i == 0 else -0.052))
            for k in range(14):
                gx = px(self.LCD_X + 0.0072) + k * 1.32 / 1000 * ppm
                d.rectangle([gx, top - 1.8 / 1000 * ppm, gx + 0.85 / 1000 * ppm,
                             top + 1.8 / 1000 * ppm],
                            fill=lcd_ink if k < filled else (60, 72, 88, 255))

        tex = save_texture("smt1500rm2u_silkscreen.png", img)
        rack.materials["apc_silktex"] = PBRMaterial(
            name="Smart-UPS Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.58,
            alphaMode="BLEND", doubleSided=True,
        )
        # 3.2mm proud of the frame, which puts it in front of every piece of
        # the control panel. The first pass sat it at 3.0 and the keys, all
        # drawn with 3.1mm fronts, hid their own legends: four blank grey
        # tabs, an unmarked power bar and an LCD with nothing on it.
        rack.textured_plane(self.slug, "apc_silktex",
                            (0, self.face(rack) - 0.0032, z), self.FACE_W, self.height)

    # ----------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h = self.height
        w = self.width

        def X(from_left: float) -> float:
            """Panel coordinate from a measurement off the elevation.

            Metres from the left edge of the 482.6mm face.
            """
            return -self.FACE_W / 2 + from_left

        def Z(frac: float) -> float:
            return z + frac * h

        # A UPS is mostly battery, so the body behind the bezel is the full
        # depth and the full height rather than the shrunken box a switch
        # gets away with.
        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.006, self.depth, h * 0.96))
        rack.rounded_prism(g, "apc_bezel", (0, rack.front_y, z), (w, 0.0110, h),
                           radius=0.0022, bevel=0.0010, steps=8)
        rack.box(g, "apc_lid", (0, y + 0.0100, z + h * 0.492), (w - 0.010, 0.022, 0.0018))

        # ---- the grille: a deep recess with eight blades in it ----------
        gx0, gx1 = self.GRILLE_X
        gz0, gz1 = self.GRILLE_Z
        gcx, gw = X((gx0 + gx1) / 2), gx1 - gx0
        gcz, gh = Z((gz0 + gz1) / 2), (gz0 - gz1) * h
        # The frame's inner lip first, then the black behind the blades.
        rack.rounded_prism(g, "apc_bezel_lit", (gcx, y - 0.0002, gcz), (gw + 0.0026, 0.0008, gh + 0.0026),
                           radius=0.0016, bevel=0.0004, steps=6)
        rack.box(g, "apc_recess", (gcx, y - 0.0005, gcz), (gw, 0.0010, gh))
        blade_h = gh / self.LOUVRES
        for i in range(self.LOUVRES):
            self.louvre(rack, g, gcx, gcz + gh * ((i + 0.5) / self.LOUVRES - 0.5) * -1,
                        gw - 0.0018, blade_h)

        # ---- the control panel recess and everything in it ---------------
        px0, px1 = self.PANEL_X
        pz0, pz1 = self.PANEL_Z
        pcx, pw = X((px0 + px1) / 2), px1 - px0
        pcz, ph = Z((pz0 + pz1) / 2), (pz0 - pz1) * h
        rack.rounded_prism(g, "apc_bezel_lit", (pcx, y - 0.0002, pcz), (pw + 0.0022, 0.0008, ph + 0.0022),
                           radius=0.0014, bevel=0.0004, steps=6)
        rack.rounded_prism(g, "apc_panel", (pcx, y - 0.0010, pcz), (pw, 0.0012, ph),
                           radius=0.0011, bevel=0.0004, steps=6)

        kw, kh = self.POWER
        rack.rounded_prism(g, "apc_key_edge", (X(self.POWER_X), y - 0.0018, Z(self.POWER_Z)),
                           (kw, 0.0012, kh), radius=0.0012, bevel=0.0004, steps=6)
        rack.rounded_prism(g, "apc_key", (X(self.POWER_X), y - 0.0021, Z(self.POWER_Z)),
                           (kw - 0.0012, 0.0010, kh - 0.0012), radius=0.0010, bevel=0.0003, steps=6)

        lw, lh = self.LAMP
        for k, lx in enumerate(self.LAMP_X):
            rack.box(g, "apc_lamp_on" if k == 0 else "apc_lamp_off",
                     (X(lx), y - 0.0018, Z(self.LAMP_Z)), (lw, 0.0008, lh))

        cw, ch = self.LCD
        rack.rounded_prism(g, "apc_lcd_frame", (X(self.LCD_X), y - 0.0015, Z(self.LCD_Z)),
                           (cw + 0.0022, 0.0012, ch + 0.0022), radius=0.0009, bevel=0.0003, steps=6)
        rack.rounded_prism(g, "apc_lcd", (X(self.LCD_X), y - 0.0019, Z(self.LCD_Z)),
                           (cw, 0.0014, ch), radius=0.0006, bevel=0.0002, steps=6)

        for kx in self.KEY_X:
            for kz in self.KEY_Z:
                self.soft_key(rack, g, X(kx), Z(kz))

        # ---- rack ears ---------------------------------------------------
        for x0 in (0.0, self.FACE_W - self.EAR):
            cx = X(x0 + self.EAR / 2)
            rack.rounded_prism(g, "apc_ear", (cx, y + 0.0042, z), (self.EAR, 0.0098, h),
                               radius=0.0012, bevel=0.0006, steps=6)
            sw, sh = self.SLOT
            for dz in (self.SLOT_Z, -self.SLOT_Z):
                rack.rounded_prism(g, "apc_recess", (cx, y - 0.0011, Z(dz)), (sw, 0.0014, sh),
                                   radius=0.0032, bevel=0.0005, steps=8)

        self.silkscreen(rack, z)
