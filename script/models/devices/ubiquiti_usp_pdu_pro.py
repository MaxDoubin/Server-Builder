"""Ubiquiti USP-PDU-Pro, drawn from Ubiquiti's own labelled front elevation.

Ubiquiti publish a dimensioned front and rear elevation for this product
rather than only a marketing render, and an elevation is a far better thing
to model from: it is orthographic, so every feature can be measured off it
directly instead of being guessed back through a perspective projection.
The whole layout below came off that one drawing.

It is also one of the three devices in the UniFi rack that Ubiquiti do not
publish a 3D model for, along with the two keystone patch panels, so this
has to be built by hand whatever happens to the rest.

What the elevation shows, in two rows across a 2U face:

  Upper row. Four USB-C ports stacked two by two at the far left, each one
  portrait rather than landscape. Then twelve NEMA 5-15 outlets abutting in
  a continuous bank, and these are turned on their side: the two blades sit
  one above the other at the left of each face and the D shaped earth is
  out to the right, which is how a PDU fits twelve of them across 330mm.
  A small round circuit breaker at the right hand end.

  Lower row. The 1.3 inch touchscreen at the far left with the product name
  under it. Then four more outlets, these ones upright and spaced well
  apart, being the 5-20 sockets. Then the management RJ45, then a stacked
  pair of outlets at the right, and the reset pinhole.

Numbering runs across the whole face rather than per row: the four USB-C
ports are 1 to 4, the twelve side-on outlets are 5 to 16, the four upright
ones are 17 to 20, the RJ45 is 21 and the stacked pair is 22 and 23. That
is why the drawing says sixteen resettable outlets and only twelve are
visible in the top row.

Nothing here is shared with another product. A Ubiquiti outlet moulding in
a brushed aluminium face does not look like anything else in this library.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class USP_PDU_Pro(Device):
    slug = "USP_PDU_PRO"
    name = "UniFi Power Distribution Pro"
    u = 2
    width = 0.443
    depth = 0.286
    source = "https://store.ui.com/us/en/products/usp-pdu-pro"
    references = [
        Reference("https://cdn.ecomm.ui.com/products/b178b896-3499-4fa3-8c56-ce2822be933f"
                  "/9ef9e4a1-4564-4499-8cb5-3cef0aa84344.png",
                  "labelled front and rear elevation, orthographic, 1400x960"),
        Reference("https://cdn.ecomm.ui.com/products/b178b896-3499-4fa3-8c56-ce2822be933f"
                  "/deb6718c-8791-46a3-ab20-7e126f743f60.png",
                  "front three quarter render, 3000x3000, for the finish"),
    ]

    # -------------------------------------------------------------- measured
    #
    # The elevation's panel measures 1086 by 211 pixels for a 443mm wide 2U
    # face, which puts a pixel at 0.408mm. Every figure below was read off it
    # by finding the connected dark regions and taking their bounding boxes,
    # so they are measurements rather than estimates. Horizontal figures are
    # metres from the left edge; vertical ones are fractions of panel height
    # with zero at the middle.

    #: The two rows the whole face is organised into.
    ROW_TOP = 0.246
    ROW_BOTTOM = -0.261

    #: Four USB-C ports, two by two, portrait.
    USBC_X = (0.0124, 0.0265)
    USBC_Z = (0.344, 0.149)
    USBC = (0.0043, 0.0102)

    #: Twelve side-on outlets abutting in one bank.
    BANK_X0, BANK_PITCH, BANK_N = 0.0518, 0.0275, 12
    #: Four upright outlets, well spaced.
    UPRIGHT_X = (0.0791, 0.1707, 0.2625, 0.3541)
    #: Both kinds of outlet face are the same size.
    OUTLET = (0.0277, 0.0277)
    #: In the bank the mouldings abut, so they are exactly a pitch wide.
    BANK_OUTLET = (0.0275, 0.0277)

    BREAKER_X = 0.4130
    SCREEN_X, SCREEN = 0.0167, (0.0233, 0.0237)
    RJ45_X, RJ45_Z, RJ45 = 0.3900, -0.333, (0.0167, 0.0139)
    PAIR_X, PAIR_Z, PAIR = 0.4130, -0.270, (0.0171, 0.0261)
    NAME_X, NAME_Z = 0.0192, -0.443
    RESET_X, RESET_Z = 0.4330, -0.443

    def face(self, rack) -> float:
        """The visible plane of the panel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Brushed aluminium, warmer and lighter than a switch's paint,
            # with a faint vertical gradient the render picks up on its own.
            "pdu_panel": pbr("PDU Panel", [196, 197, 196, 255], 0.52, 0.36),
            "pdu_edge": pbr("PDU Edge", [166, 167, 166, 255], 0.58, 0.32),
            # The outlet mouldings, which are a soft dark grey rather than
            # black, and the slots inside them, which are close to black.
            # Sampled off the elevation at 56,58,57, which is what these
            # were already painted. What made them read mid grey in the
            # first render was finish, not colour: at roughness 0.66 the
            # studio environment sits a broad specular right across a face
            # that is matte plastic in life. The number to change was the
            # roughness.
            "pdu_outlet": pbr("PDU Outlet Body", [58, 59, 59, 255], 0.0, 0.90),
            "pdu_outlet_edge": pbr("PDU Outlet Edge", [72, 73, 73, 255], 0.0, 0.86),
            "pdu_slot": pbr("PDU Slot", [12, 12, 13, 255], 0.0, 0.95),
            "pdu_usbc": pbr("PDU USB-C", [46, 47, 48, 255], 0.10, 0.80),
            "pdu_rj45": pbr("PDU RJ45 Shell", [88, 90, 91, 255], 0.62, 0.36),
            "pdu_breaker": pbr("PDU Breaker", [64, 65, 66, 255], 0.44, 0.42),
            "pdu_silk": pbr("PDU Silkscreen", [108, 109, 108, 255], 0.05, 0.72),
            # The 1.3 inch screen, dark blue and faintly lit.
            "pdu_screen": pbr("PDU Screen", [34, 46, 72, 255], 0.0, 0.26,
                              emissive=[0.03, 0.05, 0.11]),
            "pdu_screen_ink": pbr("PDU Screen Ink", [180, 206, 244, 255], 0.0, 0.30,
                                  emissive=[0.28, 0.38, 0.56]),
        })

    # ----------------------------------------------------------------- parts

    def outlet(self, rack, g: str, x: float, z: float, sideways: bool) -> None:
        """One NEMA 5-15 face.

        The bank across the top is turned a quarter turn so twelve of them
        fit in 330mm: blades stacked at the left, earth out to the right.
        The four below are upright. Same moulding, same size, and drawing
        them the same way round is the single thing that would make this
        panel look invented.
        """
        y = self.face(rack)
        w, h = self.BANK_OUTLET if sideways else self.OUTLET
        rack.rounded_prism(g, "pdu_outlet_edge", (x, y - 0.0009, z), (w, 0.0010, h),
                           radius=0.0018 if not sideways else 0.0008, bevel=0.0005, steps=6)
        rack.box(g, "pdu_outlet", (x, y - 0.0013, z), (w - 0.0022, 0.0008, h - 0.0022))
        blade_l, blade_w = 0.0080, 0.0018
        if sideways:
            # Blades one above the other on the left, earth to the right.
            for dz in (h * 0.20, -h * 0.20):
                rack.box(g, "pdu_slot", (x - w * 0.16, y - 0.0016, z + dz),
                         (blade_l, 0.0009, blade_w))
            rack.front_cylinder(g, "pdu_slot", (x + w * 0.22, y - 0.0016, z), 0.0030, 0.0009, 18)
            rack.box(g, "pdu_slot", (x + w * 0.28, y - 0.0016, z), (0.0028, 0.0009, 0.0060))
        else:
            for dx in (-w * 0.19, w * 0.19):
                rack.box(g, "pdu_slot", (x + dx, y - 0.0016, z + h * 0.13),
                         (blade_w, 0.0009, blade_l))
            rack.front_cylinder(g, "pdu_slot", (x, y - 0.0016, z - h * 0.24), 0.0030, 0.0009, 18)
            rack.box(g, "pdu_slot", (x, y - 0.0016, z - h * 0.18), (0.0060, 0.0009, 0.0028))

    def usbc(self, rack, g: str, x: float, z: float) -> None:
        """A USB-C port stood on its end, which is how this panel has them."""
        y = self.face(rack)
        w, h = self.USBC
        rack.rounded_prism(g, "pdu_usbc", (x, y - 0.0010, z), (w, 0.0010, h),
                           radius=0.0018, bevel=0.0004, steps=8)
        rack.rounded_prism(g, "pdu_slot", (x, y - 0.0013, z), (w * 0.62, 0.0008, h * 0.80),
                           radius=0.0012, bevel=0.0003, steps=8)

    def jack(self, rack, g: str, x: float, z: float) -> None:
        """The management RJ45, the only one on the panel."""
        y = self.face(rack)
        w, h = self.RJ45
        rack.box(g, "pdu_rj45", (x, y - 0.0012, z), (w, 0.0010, h))
        rack.box(g, "pdu_slot", (x, y - 0.0016, z), (w - 0.0020, 0.0009, h - 0.0020))
        rack.box(g, "pdu_rj45", (x, y - 0.0018, z - h * 0.34), (w * 0.30, 0.0008, h * 0.24))
        for i in range(8):
            cx = x - w * 0.26 + i * (w * 0.52 / 7)
            rack.box(g, "pdu_silk", (cx, y - 0.0017, z + h * 0.14), (w * 0.035, 0.0006, h * 0.30))

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Same approach as the CRS354 and for the same reason: geometry cannot
        spell, and a row of little grey boxes where the outlet numbers go
        reads as a row of little grey boxes. Positions come from the same
        measured constants the geometry uses, and the sheet keeps the
        panel's own proportion so letters are not stretched.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (112, 113, 112, 255)
        dark = (54, 55, 55, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        f_num = sized(1.9)
        # Outlet numbers sit just under the moulding they belong to, on both
        # rows, and the numbering runs across the whole face rather than per
        # row: the four USB-C ports take 1 to 4 before the outlets start.
        below_top = self.ROW_TOP - self.OUTLET[1] / self.height / 2 - 0.055
        below_bottom = self.ROW_BOTTOM - self.OUTLET[1] / self.height / 2 - 0.055
        for i in range(self.BANK_N):
            cx = self.BANK_X0 + (i + 0.5) * self.BANK_PITCH
            centred(str(i + 5), px(cx), py(below_top), f_num)
        for i, ux in enumerate(self.UPRIGHT_X):
            centred(str(i + 17), px(ux), py(below_bottom), f_num)
        centred("21", px(self.RJ45_X), py(below_bottom), f_num)
        for i, dz in enumerate((self.PAIR[1] / self.height * 0.25, -self.PAIR[1] / self.height * 0.25)):
            centred(str(22 + i), px(self.PAIR_X) + 0.0075 * ppm, py(self.PAIR_Z + dz), sized(1.6))

        # The product name under the screen, set the way Ubiquiti set it:
        # the name in medium, the tier in a lighter weight beside it.
        f_name, f_tier = sized(2.1, True), sized(2.1)
        name, tier = "Power Distribution ", "Pro"
        wn = d.textbbox((0, 0), name, font=f_name)[2]
        wt = d.textbbox((0, 0), tier, font=f_tier)[2]
        x0 = px(self.NAME_X) - (wn + wt) / 2
        top = py(self.NAME_Z) - d.textbbox((0, 0), "P", font=f_name)[3] / 2
        d.text((x0, top), name, font=f_name, fill=dark)
        d.text((x0 + wn, top), tier, font=f_tier, fill=ink)

        centred("RESET", px(self.RESET_X) - 0.0060 * ppm, py(self.RESET_Z), sized(1.4))

        tex = save_texture("usp_pdu_pro_silkscreen.png", img)
        rack.materials["pdu_silktex"] = PBRMaterial(
            name="PDU Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.58,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "pdu_silktex",
                            (0, self.face(rack) - 0.0006, z), self.width, self.height)

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
        rack.rounded_prism(g, "pdu_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0016, bevel=0.0008, steps=6)
        # The face is a single folded plate, so the only relief on it is the
        # lip along the top and bottom edges.
        for dz in (h * 0.49, -h * 0.49):
            rack.box(g, "pdu_edge", (0, y - 0.0004, z + dz), (w - 0.004, 0.0006, 0.0012))

        # Rack ears, part of the same plate rather than a separate piece.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0195)
            rack.rounded_prism(g, "pdu_panel", (ex, y + 0.0012, z), (0.039, 0.0080, h * 0.96),
                               radius=0.0016, bevel=0.0006, steps=6)
            for dz in (h * 0.30, -h * 0.30):
                rack.rounded_prism(g, "pdu_edge", (ex, y - 0.0026, z + dz), (0.020, 0.0028, 0.0090),
                                   radius=0.0040, bevel=0.0008, steps=8)

        # ---- upper row -------------------------------------------------
        for ux in self.USBC_X:
            for uz in self.USBC_Z:
                self.usbc(rack, g, X(ux), Z(uz))
        for i in range(self.BANK_N):
            cx = self.BANK_X0 + (i + 0.5) * self.BANK_PITCH
            self.outlet(rack, g, X(cx), Z(self.ROW_TOP), sideways=True)
        rack.front_cylinder(g, "pdu_breaker", (X(self.BREAKER_X), y - 0.0014, Z(self.ROW_TOP)),
                            0.0021, 0.0014, 20)

        # ---- lower row -------------------------------------------------
        sw, sh = self.SCREEN
        rack.rounded_prism(g, "pdu_edge", (X(self.SCREEN_X), y - 0.0008, Z(self.ROW_BOTTOM)),
                           (sw, 0.0008, sh), radius=0.0016, bevel=0.0004, steps=6)
        rack.rounded_prism(g, "pdu_screen", (X(self.SCREEN_X), y - 0.0012, Z(self.ROW_BOTTOM)),
                           (sw - 0.0018, 0.0008, sh - 0.0018), radius=0.0012, bevel=0.0003, steps=6)
        # The dial and the two icons above it that the elevation shows.
        rack.front_cylinder(g, "pdu_screen_ink", (X(self.SCREEN_X), y - 0.0016,
                                                  Z(self.ROW_BOTTOM) - sh * 0.06), 0.0028, 0.0006, 22)
        for dx in (-0.0042, 0.0042):
            rack.box(g, "pdu_screen_ink", (X(self.SCREEN_X) + dx, y - 0.0016,
                                           Z(self.ROW_BOTTOM) + sh * 0.30), (0.0030, 0.0006, 0.0030))

        for ux in self.UPRIGHT_X:
            self.outlet(rack, g, X(ux), Z(self.ROW_BOTTOM), sideways=False)

        self.jack(rack, g, X(self.RJ45_X), Z(self.RJ45_Z))

        # The stacked pair at the right hand end, in one surround.
        pw, ph = self.PAIR
        rack.rounded_prism(g, "pdu_edge", (X(self.PAIR_X), y - 0.0008, Z(self.PAIR_Z)),
                           (pw, 0.0008, ph), radius=0.0014, bevel=0.0004, steps=6)
        for dz in (ph * 0.25, -ph * 0.25):
            rack.rounded_prism(g, "pdu_outlet", (X(self.PAIR_X), y - 0.0012, Z(self.PAIR_Z) + dz),
                               (pw - 0.0026, 0.0008, ph * 0.44), radius=0.0012, bevel=0.0003, steps=6)
            rack.front_cylinder(g, "pdu_slot", (X(self.PAIR_X), y - 0.0016,
                                                Z(self.PAIR_Z) + dz), 0.0026, 0.0008, 18)

        # The reset pinhole, which is all it is.
        rack.front_cylinder(g, "pdu_slot", (X(self.RESET_X), y - 0.0012, Z(self.RESET_Z)),
                            0.0008, 0.0010, 12)

        self.silkscreen(rack, z)
