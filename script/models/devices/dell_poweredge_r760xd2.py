"""Dell PowerEdge R760xd2, drawn from Dell's own straight front render.

Twelve 3.5 inch carriers in three rows of four, and the thing that makes
them read as Dell carriers rather than generic drive trays is all in the
left third of each one: a green activity glyph over a green drive glyph on
a narrow strip, then a raised boss with a big circular latch in it, the
latch a dark disc inside a bright orange ring. Everything to the right of
that is a chrome rail top and bottom with a hexagonal grille between them
and a small capacity plate at the end reading 10 TB SATA 6Gb 7.2k.

Calibration. Dell's straight front render puts the chassis face at x 36 to
1997 and y 300 to 656, 1962 by 357 pixels. Dell publish the width as
481.6mm, which makes a pixel 0.24546mm and the face 87.6mm tall, the right
answer for a 2U front. Every figure below is measured off that, and the
carrier grid was found by locating the orange latch rings rather than by
eye: their column centres come out at 47.74, 156.73, 265.5 and 374.95mm, a
pitch of 109.07mm repeated to a tenth of a millimetre.

What the render shows, left to right:

  A left ear about 15mm wide: an information tab with a tall blue status
  bar under it, and at the bottom a drive glyph over MID BAY ACCESS with an
  orange rule beneath, because this chassis takes twelve more drives out of
  a drawer in its lid.

  A dark filler column, then the four carrier columns, then a second filler
  and the right ear: a green power button, a USB-A socket, an iDRAC Direct
  micro-USB, and the same MID BAY ACCESS block mirrored.

Nothing here is shared with another product. A Dell LFF carrier latch is a
ring, not a lever; the hexagonal grille in the carrier face is Dell's own;
and the twin MID BAY ACCESS callouts belong to this chassis alone.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import Device, Reference


class R760xd2(Device):
    slug = "R760XD2"
    name = "Dell PowerEdge R760xd2"
    u = 2
    #: Dell's technical guide gives 2U x 481.6mm x 837mm.
    width = 0.4816
    depth = 0.8370
    source = ("https://www.delltechnologies.com/asset/en-us/products/servers/"
              "technical-support/poweredge-r760xd2-technical-guide.pdf")
    references = [
        Reference("https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/"
                  "dell-enterprise-products/enterprise-systems/poweredge/r760xd2/media-gallery/"
                  "server-poweredge-per760xd2-black-silver-gallery-2.psd?fmt=png-alpha&wid=2000",
                  "straight front, 2000x851, the chassis face 1962x357 and square"),
        Reference("https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/"
                  "dell-enterprise-products/enterprise-systems/poweredge/r760xd2/media-gallery/"
                  "server-poweredge-per760xd2-black-silver-gallery-5.psd?fmt=png-alpha&wid=2000",
                  "angled front, for the carrier relief and the ear profile"),
    ]

    def face(self, rack) -> float:
        """The plane of the carrier faces, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # -------------------------------------------------------------- measured
    #
    # Horizontal figures are metres from the left edge of the 481.6mm face.
    # Vertical figures are fractions of the 2U panel height, zero at the
    # middle, converted as (478 - y) / 357.

    LEFT_EAR = (0.0000, 0.0150)
    RIGHT_EAR = (0.4676, 0.4816)
    #: Four carrier columns. The left edge and pitch come from the orange
    #: latch rings, which are the only feature on the face sharp enough to
    #: locate to a pixel.
    BAY_X0, BAY_PITCH, BAY_W = 0.0280, 0.109070, 0.10550
    #: Three rows, from the silver rails: each carrier runs 0.2885 of the
    #: panel height and the rows sit a third of the panel apart.
    ROW_Z = (0.3152, 0.0042, -0.3040)
    BAY_H = 0.2885

    #: Offsets inside one carrier, metres from its own left edge.
    ICON_X = 0.0060
    LATCH_X, LATCH_BOSS = 0.01974, (0.0130, 0.0280)
    RAIL_X = (0.0292, 0.1016)
    GRILLE_X = (0.0350, 0.0850)
    PLATE_X = (0.0845, 0.1000)
    #: The chrome rails sit just inside the top and bottom of the carrier.
    #: At 6 percent of the carrier height they came out a hairline in the
    #: render and the brightest feature on a Dell carrier disappeared, so
    #: they are drawn at the 9 percent the render actually measures.
    RAIL_Z, RAIL_H = 0.435, 0.090
    #: The grille is a hexagonal mesh at a 5.4mm pitch in three panels
    #: divided by two ribs.
    GRILLE_PITCH = 0.00540
    GRILLE_PANELS = 3

    #: Left ear. The information tab and its blue bar, then the mid bay
    #: callout at the bottom.
    EAR_TAB = (0.0061, 0.0140, 0.3924, -0.0140)
    EAR_BAR = (0.0083, 0.0118, 0.3053, 0.0135)
    EAR_INFO_Z = 0.3300
    MIDBAY_ICON_Z, MIDBAY_TEXT_Z, MIDBAY_RULE_Z = -0.2120, -0.3100, -0.3900
    #: Right ear.
    POWER_Z, USB_Z, MICRO_Z = 0.3560, 0.1940, 0.0340
    EAR_R_X = (0.4691, 0.4789)

    def bay_x(self, col: int) -> float:
        """Left edge of carrier column `col`, metres from the face's left."""
        return self.BAY_X0 + col * self.BAY_PITCH

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # The chassis bezel is genuinely near black, 14 of 255, and the
            # carrier moulding is 60. Those two are 46 apart and painting
            # them the same grey, which is what a generic server model
            # does, throws away the frame the bays sit in.
            "r76_bezel": pbr("R760xd2 Bezel", [21, 21, 22, 255], 0.16, 0.66),
            "r76_carrier": pbr("R760xd2 Carrier", [60, 63, 68, 255], 0.24, 0.58),
            "r76_carrier_dark": pbr("R760xd2 Carrier Inset", [35, 37, 41, 255], 0.20, 0.66),
            "r76_grille": pbr("R760xd2 Grille Hole", [12, 12, 14, 255], 0.08, 0.86),
            # The chrome rail is the brightest thing on the face at 204 and
            # it is real chrome, so it takes a high metallic and a low
            # roughness. At 0.5 roughness it read as painted silver.
            "r76_rail": pbr("R760xd2 Chrome Rail", [204, 205, 207, 255], 0.86, 0.22),
            "r76_lip": pbr("R760xd2 Chassis Lip", [161, 163, 164, 255], 0.72, 0.30),
            # Dell's carrier latch ring, 196,102,39. It is the one warm
            # colour on the whole chassis and there are twelve of them.
            "r76_orange": pbr("R760xd2 Latch Ring", [196, 102, 39, 255], 0.14, 0.42),
            "r76_latch_well": pbr("R760xd2 Latch Well", [38, 40, 44, 255], 0.18, 0.62),
            "r76_plate": pbr("R760xd2 Capacity Plate", [61, 64, 70, 255], 0.16, 0.60),
            "r76_green": pbr("R760xd2 Drive Glyph", [46, 168, 100, 255], 0.0, 0.34,
                             emissive=[0.04, 0.20, 0.10]),
            "r76_blue": pbr("R760xd2 Status Bar", [72, 150, 226, 255], 0.0, 0.28,
                            emissive=[0.08, 0.24, 0.44]),
            "r76_power": pbr("R760xd2 Power Glyph", [70, 196, 96, 255], 0.0, 0.30,
                             emissive=[0.08, 0.30, 0.12]),
            "r76_button": pbr("R760xd2 Power Button", [72, 74, 76, 255], 0.20, 0.52),
            "r76_usb": pbr("R760xd2 USB Shell", [176, 178, 180, 255], 0.66, 0.32),
            "r76_usb_bore": pbr("R760xd2 USB Bore", [16, 16, 18, 255], 0.08, 0.86),
        })

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """The carrier grilles, the capacity plates and the ear callouts.

        The hexagonal grille goes here rather than into geometry for the
        usual reason: three panels of mesh on each of twelve carriers is
        about nine hundred holes, and a hole this small is a paint problem,
        not a modelling one. The capacity plate lettering is four lines at
        1.3mm and would be illegible as anything but type.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        hole = (11, 11, 13, 255)
        ink = (214, 215, 217, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(7, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]),
                   text, font=f, fill=fill)

        step_x = self.GRILLE_PITCH * ppm
        step_y = step_x * math.sqrt(3) / 2
        hex_r = self.GRILLE_PITCH * 0.42 * ppm
        gx0, gx1 = self.GRILLE_X
        panel = (gx1 - gx0) / self.GRILLE_PANELS

        for col in range(4):
            bx = self.bay_x(col)
            for rz in self.ROW_Z:
                top = py(rz + self.BAY_H * 0.34)
                bottom = py(rz - self.BAY_H * 0.34)
                for p in range(self.GRILLE_PANELS):
                    px0 = px(bx + gx0 + p * panel) + step_x * 0.55
                    px1 = px(bx + gx0 + (p + 1) * panel) - step_x * 0.30
                    row, yy = 0, top + step_y * 0.5
                    while yy < bottom:
                        xx = px0 + (row % 2) * step_x / 2
                        while xx < px1:
                            d.regular_polygon((xx, yy, hex_r), 6, rotation=0, fill=hole)
                            xx += step_x
                        yy += step_y
                        row += 1
                # The capacity plate, four lines of type on a dark tile.
                cx = px(bx + (self.PLATE_X[0] + self.PLATE_X[1]) / 2)
                cy = py(rz)
                f_big, f_med, f_small = sized(3.0, True), sized(2.0), sized(1.5)
                b = d.textbbox((0, 0), "10", font=f_big)
                d.text((cx - (b[2] - b[0]) / 2 - 0.0016 * ppm,
                        cy - 0.0072 * ppm), "10", font=f_big, fill=ink)
                d.text((cx + (b[2] - b[0]) / 2 - 0.0012 * ppm,
                        cy - 0.0064 * ppm), "TB", font=f_small, fill=ink)
                centred("SATA", cx, cy - 0.0004 * ppm, f_med)
                centred("6Gb", cx + 0.0016 * ppm, cy + 0.0040 * ppm, f_small)
                centred("7.2k", cx + 0.0020 * ppm, cy + 0.0078 * ppm, f_small)

        # ---- ear callouts -------------------------------------------------
        f_ear = sized(2.0)
        for cx in (px(0.0075), px(self.EAR_R_X[0] + 0.0049)):
            for k, word in enumerate(("Mid", "Bay", "Access")):
                centred(word, cx, py(self.MIDBAY_TEXT_Z + 0.075 - k * 0.075),
                        f_ear if k < 2 else sized(1.6))

        tex = save_texture("r760xd2_silkscreen.png", img)
        rack.materials["r76_silktex"] = PBRMaterial(
            name="R760xd2 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        # 2.0mm proud. The grille recess sits 1.5mm off the bezel and the
        # capacity plate 1.9mm, so an overlay at the usual 1.0mm ends up
        # behind both and neither the holes nor the lettering appear. The
        # chrome rails at 2.1mm still stand in front of it, which is right:
        # they are the one thing on a carrier that is genuinely raised.
        rack.textured_plane(self.slug, "r76_silktex",
                            (0, self.face(rack) - 0.0020, z), self.width, self.height)

    # ----------------------------------------------------------------- parts

    def carrier(self, rack, g: str, bx: float, z: float) -> None:
        """One 3.5 inch hot plug carrier.

        Drawn as the photograph has it: moulding, icon strip, latch boss
        with its ring, a chrome rail top and bottom of a sunken grille
        panel, and the capacity plate at the far end. The grille itself is
        a recess here and holes in the overlay, so what this has to get
        right is the recess and the two rails that frame it.
        """
        y = self.face(rack)
        h = self.height
        bh = self.BAY_H * h
        cx = -self.width / 2 + bx + self.BAY_W / 2
        rack.box(g, "r76_carrier", (cx, y - 0.0009, z), (self.BAY_W, 0.0014, bh))

        def X(off: float) -> float:
            return -self.width / 2 + bx + off

        # Icon strip: a slightly sunken panel with two green glyphs on it.
        rack.box(g, "r76_carrier_dark", (X(self.ICON_X), y - 0.0013, z), (0.0088, 0.0008, bh * 0.80))
        for dz, glyph in ((0.22, "plus"), (-0.22, "drive")):
            gz = z + bh * dz
            if glyph == "plus":
                rack.box(g, "r76_green", (X(self.ICON_X), y - 0.0018, gz), (0.0044, 0.0006, 0.0009))
                rack.box(g, "r76_green", (X(self.ICON_X), y - 0.0018, gz), (0.0009, 0.0006, 0.0044))
            else:
                rack.front_cylinder(g, "r76_green", (X(self.ICON_X), y - 0.0018, gz + 0.0016),
                                    0.0019, 0.0006, 14)
                rack.box(g, "r76_green", (X(self.ICON_X), y - 0.0018, gz - 0.0004),
                         (0.0038, 0.0006, 0.0032))
        # Latch: a raised boss, a turned well and the orange ring in it.
        b0, b1 = self.LATCH_BOSS
        rack.rounded_prism(g, "r76_carrier", (X((b0 + b1) / 2), y - 0.0018, z),
                           (b1 - b0, 0.0018, bh * 0.78), radius=0.0014, bevel=0.0005, steps=8)
        rack.front_cylinder(g, "r76_latch_well", (X(self.LATCH_X), y - 0.0026, z), 0.0058, 0.0010, 24)
        rack.front_cylinder(g, "r76_orange", (X(self.LATCH_X), y - 0.0030, z), 0.0038, 0.0008, 24)
        rack.front_cylinder(g, "r76_latch_well", (X(self.LATCH_X), y - 0.0034, z), 0.0026, 0.0008, 24)
        # The sunken grille, its two dividing ribs, and the chrome rails.
        gx0, gx1 = self.GRILLE_X
        rack.box(g, "r76_carrier_dark", (X((gx0 + gx1) / 2 + 0.0060), y - 0.0011, z),
                 (gx1 - gx0 + 0.0230, 0.0008, bh * 0.72))
        panel = (gx1 - gx0) / self.GRILLE_PANELS
        for p in range(1, self.GRILLE_PANELS):
            rack.box(g, "r76_carrier", (X(gx0 + p * panel), y - 0.0015, z),
                     (0.0022, 0.0008, bh * 0.70))
        rx0, rx1 = self.RAIL_X
        for dz in (self.RAIL_Z, -self.RAIL_Z):
            rack.box(g, "r76_rail", (X((rx0 + rx1) / 2), y - 0.0016, z + bh * dz),
                     (rx1 - rx0, 0.0010, bh * self.RAIL_H))
        # The capacity plate the overlay prints on.
        p0, p1 = self.PLATE_X
        rack.box(g, "r76_plate", (X((p0 + p1) / 2), y - 0.0015, z),
                 (p1 - p0, 0.0008, bh * 0.66))

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
                    (w - 0.014, self.depth, h * 0.94))
        rack.rounded_prism(g, "r76_bezel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0016, bevel=0.0008, steps=6)
        # The bright lip along the top and bottom of the chassis, 161 in
        # the render and the only thing that outlines a black server.
        for dz in (0.4874, -0.4762):
            rack.box(g, "r76_lip", (0, y - 0.0004, Z(dz)), (w - 0.002, 0.0008, 0.0014))

        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0195)
            rack.rounded_prism(g, "r76_bezel", (ex, y + 0.0014, z), (0.0390, 0.0084, h * 0.96),
                               radius=0.0016, bevel=0.0006, steps=6)
            for dz in (0.30, -0.30):
                rack.rounded_prism(g, "r76_lip", (ex, y - 0.0026, Z(dz)), (0.0200, 0.0028, 0.0092),
                                   radius=0.0040, bevel=0.0008, steps=8)

        for col in range(4):
            for rz in self.ROW_Z:
                self.carrier(rack, g, self.bay_x(col), Z(rz))

        # ---- left ear ------------------------------------------------------
        tx0, tx1, tzt, tzb = self.EAR_TAB
        rack.box(g, "r76_carrier_dark", (X((tx0 + tx1) / 2), y - 0.0008, Z((tzt + tzb) / 2)),
                 (tx1 - tx0, 0.0010, (tzt - tzb) * h))
        bx0, bx1, bzt, bzb = self.EAR_BAR
        rack.rounded_prism(g, "r76_blue", (X((bx0 + bx1) / 2), y - 0.0013, Z((bzt + bzb) / 2)),
                           (bx1 - bx0, 0.0010, (bzt - bzb) * h), radius=0.0012, bevel=0.0003, steps=8)
        # The information glyph, an italic i, drawn as a dot over a stroke.
        rack.front_cylinder(g, "r76_lip", (X(0.0100), y - 0.0013, Z(self.EAR_INFO_Z + 0.030)),
                            0.0008, 0.0008, 10)
        rack.box(g, "r76_lip", (X(0.0100), y - 0.0013, Z(self.EAR_INFO_Z)), (0.0013, 0.0008, 0.0032))
        for cx in (X(0.0075), X(self.EAR_R_X[0] + 0.0049)):
            rack.front_cylinder(g, "r76_lip", (cx, y - 0.0013, Z(self.MIDBAY_ICON_Z + 0.020)),
                                0.0022, 0.0008, 14)
            rack.box(g, "r76_lip", (cx, y - 0.0013, Z(self.MIDBAY_ICON_Z)), (0.0044, 0.0008, 0.0038))
            rack.box(g, "r76_orange", (cx, y - 0.0013, Z(self.MIDBAY_RULE_Z)), (0.0122, 0.0008, 0.0020))

        # ---- right ear ------------------------------------------------------
        ex0, ex1 = self.EAR_R_X
        rack.rounded_prism(g, "r76_button", (X((ex0 + ex1) / 2), y - 0.0011, Z(self.POWER_Z)),
                           (ex1 - ex0, 0.0012, 0.0092), radius=0.0010, bevel=0.0004, steps=6)
        rack.torus_front(g, "r76_power", (X((ex0 + ex1) / 2), y - 0.0019, Z(self.POWER_Z)),
                         0.0026, 0.0005, 24, 8)
        rack.box(g, "r76_power", (X((ex0 + ex1) / 2), y - 0.0019, Z(self.POWER_Z) + 0.0026),
                 (0.0008, 0.0006, 0.0028))
        rack.box(g, "r76_usb", (X((ex0 + ex1) / 2), y - 0.0011, Z(self.USB_Z)),
                 (ex1 - ex0 - 0.0018, 0.0010, 0.0112))
        rack.box(g, "r76_usb_bore", (X((ex0 + ex1) / 2), y - 0.0016, Z(self.USB_Z)),
                 (ex1 - ex0 - 0.0034, 0.0008, 0.0086))
        rack.box(g, "r76_usb", (X((ex0 + ex1) / 2), y - 0.0019, Z(self.USB_Z) - 0.0018),
                 (ex1 - ex0 - 0.0044, 0.0006, 0.0026))
        rack.rounded_prism(g, "r76_usb", (X((ex0 + ex1) / 2), y - 0.0011, Z(self.MICRO_Z)),
                           (ex1 - ex0 - 0.0026, 0.0010, 0.0050), radius=0.0012, bevel=0.0003, steps=8)
        rack.rounded_prism(g, "r76_usb_bore", (X((ex0 + ex1) / 2), y - 0.0015, Z(self.MICRO_Z)),
                           (ex1 - ex0 - 0.0042, 0.0008, 0.0030), radius=0.0009, bevel=0.0002, steps=8)

        self.silkscreen(rack, z)
