"""Cisco ISR 4331, the connector face, rectified out of a three quarter photo.

Cisco call this face the back panel and the vent and power supply face the
bezel side, which is backwards from how anyone racks one, so this models the
connector face as the front.

Only one usable photograph of that face exists on a host this network can
reach, and it is a hard three quarter: the router is turned about twenty
degrees and the top cover fills most of the frame. A front panel is a plane
though, and a perspective view of a plane is an exact homography of its
elevation, so the four panel corners were read out of the photograph at
(28,519), (1012,629), (1012,733), (28,616) and warped back to a rectangle at
six pixels per millimetre. Everything below was then measured off that
rectified elevation exactly as if Cisco had published a drawing of it, which
they have not.

The one thing the photograph cannot supply is the port block's internal
proportions at any real resolution, and for that there is a genuine
orthographic: the inset on Figure 1-23 of the 4000 Series hardware
installation guide, which draws the GE 0/0/0 to GE 0/0/2 cluster on its own.

What the elevation shows across 438mm:

  A black rail top and bottom, both punched with round vents where the port
  block is and plain where the modules are, because a module fills the height.

  The port block at the far left, a bright zinc plate 33mm wide holding four
  openings in a two by two grid. GE 0/0/0 is a combination port and takes the
  whole top of the block under one yellow bar, RJ45 on the left and SFP on the
  right. Under them GE 0/0/1 is the RJ45 alone and GE 0/0/2 the SFP alone,
  each with its own yellow bar. Between the two SFP cages runs a strip of four
  small triangles, which is where the optics lamps live on this router.

  Then NIM 1 and NIM 2, each a zinc blank 78mm wide: two rows of pressed
  louvres over two rows of oval slots, the slot name printed along the bottom
  and a knurled captive screw at the right hand end.

  Then the SM-X bay, which is half the panel, filled by an SM-BLANK: the same
  zinc but a different perforation, five rows of oval slots on a coarser
  pitch, with its own screw and the CISCO 4331 nameplate turned on its side
  against the right hand edge.

Nothing here is shared with another product. This chassis is near black where
the ASR beside it is light grey, its modules are bright zinc plate rather than
paint, and its ports sit in a raised plate rather than being stamped straight
into the panel.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class ISR4331(Device):
    slug = "ISR4331"
    name = "Cisco ISR 4331"
    u = 1
    #: Cisco's 4000 Series data sheet, table 5: 44.45 x 438.15 x 438.15mm.
    width = 0.43815
    depth = 0.43815
    source = ("https://www.cisco.com/c/en/us/products/collateral/routers/"
              "4000-series-integrated-services-routers-isr/data_sheet-c78-732542.html")
    references = [
        Reference("https://cdn.shopify.com/s/files/1/0989/9318/files/"
                  "cisco-ISR4331-K9-1_9cd0a2ae-f636-45c3-b2df-e5e820c2adeb.jpg",
                  "three quarter of the connector face, 1040x1040, rectified to measure"),
        Reference("https://www.cisco.com/c/en/us/td/docs/routers/access/4400/hardware/"
                  "installation/guide4400-4300/C4400_isr/Overview.html",
                  "Figure 1-23, whose inset is an orthographic of the GE port cluster"),
    ]

    def face(self, rack) -> float:
        """The visible plane of the panel, 5.3mm proud of the rack front."""
        return rack.front_y - 0.0053

    # ------------------------------------------------------------- measured
    #
    # The rectified elevation is 2628 by 266 pixels for the published 438.15
    # by 44.45mm face, so a pixel is 0.1667mm and every figure below is a
    # measurement rather than a proportion. Rectifying first matters: read
    # straight off the three quarter, the right hand end of this panel is
    # foreshortened to two thirds of its true width and the SM bay comes out
    # 70mm short.
    #
    # Horizontal figures are metres from the left edge of the 438.15mm panel.
    # Vertical figures are fractions of panel height with zero at the middle.

    #: The black rails, and the round vents punched in them at the left.
    TOP_RAIL = (0.5000, 0.3763)               # 0 to 5.5mm
    BOT_RAIL = (-0.4224, -0.5000)             # 41.0 to 44.45mm
    RAIL_VENT_X0, RAIL_VENT_PITCH, RAIL_VENT_N = 0.0010, 0.00550, 7
    RAIL_VENT_Z = (0.4190, -0.4449)
    RAIL_VENT_R = 0.0022

    #: The port block: one zinc plate holding all four openings.
    BLOCK_X = (0.0003, 0.0330)
    BLOCK_Z = (0.3650, -0.4224)               # 6.0 to 41.0mm
    BAR_000 = (0.3245, 0.2390)                # GE 0/0/0, over both columns
    BAR_LOWER = (-0.3301, -0.4044)            # GE 0/0/1 and GE 0/0/2
    RJ_X = (0.0007, 0.0148)
    RJ_TOP_Z = (0.2300, -0.0084)
    RJ_BOT_Z = (-0.0894, -0.3234)
    SFP_X = (0.0172, 0.0318)
    SFP_TOP_Z = (0.2120, 0.0006)
    SFP_STRIP_Z = (0.0006, -0.0984)
    SFP_BOT_Z = (-0.1029, -0.3234)

    #: The two NIM blanks and the SM-BLANK, as (left, right) in metres.
    NIM1_X = (0.0340, 0.1120)
    NIM2_X = (0.1140, 0.1920)
    SM_X = (0.1960, 0.4080)
    MOD_Z = (0.3763, -0.4224)                 # 5.5 to 41.0mm, all three
    #: A NIM blank: two rows of louvres over two rows of oval slots.
    NIM_LOUVRE_PITCH, NIM_LOUVRE = 0.00840, (0.0055, 0.0030)
    NIM_LOUVRE_Z = (0.2525, 0.1288)
    NIM_OVAL_PITCH, NIM_OVAL = 0.00560, (0.0040, 0.0030)
    NIM_OVAL_Z = (-0.1783, -0.3796)
    #: The SM-BLANK's own coarser field: five rows on the NIM louvre pitch.
    SM_FIELD_X = (0.2100, 0.4050)
    SM_SLOT_PITCH, SM_SLOT = 0.00840, (0.0055, 0.0026)
    SM_SLOT_Z = (0.2818, 0.1243, -0.0332, -0.1907, -0.3481)

    #: Captive screws: one at the right hand end of each module.
    SCREW_Z = -0.0062
    SCREW_X = (0.1075, 0.1875, 0.4030)
    #: The right hand bracket, which carries the nameplate.
    BRACKET_X = (0.4085, 0.4240)
    BRACKET_SCREW_Z = (0.2200, -0.2600)
    NAME_X = 0.4180

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared.

        The rectified elevation measures the chassis rails at 76 of 255 and
        the top cover at 105 with its specular included, so this is a very
        dark graphite and not the mid grey the studio light suggests. The
        modules measure 241 for a NIM blank and 216 for the SM-BLANK, and
        those two are genuinely different plates: the NIM is bright passivated
        zinc and the SM-BLANK is a duller finish.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            "i4331_chassis": pbr("ISR4331 Chassis", [64, 64, 65, 255], 0.18, 0.56),
            "i4331_rail": pbr("ISR4331 Front Rail", [72, 72, 73, 255], 0.20, 0.52),
            "i4331_lid": pbr("ISR4331 Lid", [58, 58, 59, 255], 0.22, 0.48),
            "i4331_ear": pbr("ISR4331 Ear", [74, 74, 75, 255], 0.24, 0.48),
            # Rack ears on an ISR are painted the chassis colour, not zinc,
            # so they read as part of the black box rather than as two bright
            # slabs bracketing it.
            # The three module blanks and the port plate, all zinc but not the
            # same zinc. Metallic stays low: a high metallic turns a base
            # colour into a specular tint and all three collapse onto the
            # panel's own value under this environment.
            "i4331_nim": pbr("ISR4331 NIM Blank", [214, 214, 211, 255], 0.22, 0.38),
            "i4331_sm": pbr("ISR4331 SM Blank", [193, 193, 190, 255], 0.24, 0.42),
            "i4331_plate": pbr("ISR4331 Port Plate", [198, 198, 195, 255], 0.26, 0.40),
            "i4331_bracket": pbr("ISR4331 End Bracket", [186, 187, 185, 255], 0.30, 0.38),
            # Holes. A louvre is a lip that catches light, an oval slot is a
            # hole, and a jack mouth is a cavity, so they are three values.
            "i4331_louvre": pbr("ISR4331 Louvre", [104, 104, 102, 255], 0.16, 0.62),
            "i4331_slot": pbr("ISR4331 Slot", [30, 30, 31, 255], 0.06, 0.88),
            "i4331_deep": pbr("ISR4331 Cavity", [11, 11, 12, 255], 0.04, 0.94),
            # The jack mouths measure 15 and the cages 17, which is to say
            # both are black, and the plate they are punched in is 198. That
            # contrast is the whole character of this port block.
            "i4331_jack_shield": pbr("ISR4331 Jack Shield", [126, 127, 125, 255], 0.44, 0.40),
            "i4331_jack_shell": pbr("ISR4331 Jack Body", [34, 34, 35, 255], 0.10, 0.72),
            "i4331_jack_gold": pbr("ISR4331 Jack Contacts", [186, 148, 68, 255], 0.80, 0.28),
            "i4331_cage": pbr("ISR4331 SFP Cage", [20, 20, 21, 255], 0.24, 0.58),
            "i4331_cage_edge": pbr("ISR4331 Card Edge", [204, 204, 198, 255], 0.0, 0.58),
            "i4331_strip": pbr("ISR4331 Lamp Strip", [186, 186, 184, 255], 0.18, 0.46),
            # Sampled at 228,227,114 with the black lettering excluded, then
            # brought down because this studio blows a printed yellow to paper
            # white the moment it goes above about 210.
            "i4331_yellow": pbr("ISR4331 Yellow Bar", [204, 200, 104, 255], 0.0, 0.66),
            "i4331_screw": pbr("ISR4331 Captive Screw", [166, 167, 165, 255], 0.52, 0.36),
        })

    # ---------------------------------------------------------------- parts

    def oval(self, rack, g: str, x: float, z: float, w: float, h: float, surf: float) -> None:
        """One oval slot punched in a module blank.

        `surf` is the front face of the plate rather than the panel. Measured
        from the panel these all end up inside the 1.6mm plate and every
        module renders as a blank sheet of metal, which is exactly what the
        first pass of this router looked like.
        """
        rack.rounded_prism(g, "i4331_slot", (x, surf + 0.0013, z), (w, 0.0028, h),
                           radius=h * 0.48, bevel=0.0003, steps=8)

    def louvre(self, rack, g: str, x: float, z: float, surf: float) -> None:
        """A pressed louvre: an oval slot with a hood over its upper edge."""
        w, h = self.NIM_LOUVRE
        rack.rounded_prism(g, "i4331_slot", (x, surf + 0.0013, z), (w, 0.0028, h),
                           radius=h * 0.45, bevel=0.0003, steps=8)
        rack.box(g, "i4331_louvre", (x, surf - 0.0003, z + h * 0.40), (w, 0.0008, h * 0.44))

    def round_vent(self, rack, g: str, x: float, z: float) -> None:
        """One round hole punched in the black rail."""
        rack.front_cylinder(g, "i4331_deep", (x, self.face(rack) + 0.0009, z),
                            self.RAIL_VENT_R, 0.0030, 18)

    def jack(self, rack, g: str, x: float, z: float, w: float, h: float) -> None:
        """An 8P8C jack in the port plate, latch down.

        The plate is bright and the mouth is black, so what makes this read is
        the shield rim: a thin bright frame standing proud of a dark hole. A
        solid dark rectangle at the same place reads as a printed square.
        """
        y = self.face(rack)
        rim = 0.0010
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            rack.box(g, "i4331_jack_shield", (x + dx, y - 0.0026, z + dz), (bw, 0.0014, bh))
        rack.box(g, "i4331_deep", (x, y - 0.0013, z), (w - rim * 2, 0.0026, h - rim * 2))
        rack.box(g, "i4331_deep", (x, y + 0.0044, z), (w * 0.80, 0.0090, h * 0.80))
        rack.box(g, "i4331_jack_shield", (x, y - 0.0029, z - h * 0.35), (w * 0.30, 0.0010, h * 0.20))
        # The tongue sits well back in the mouth and the contacts are shorter
        # than they look in a catalogue drawing. Drawn full height they turn a
        # black hole into a gold grille, which is not what the photograph has.
        tongue_z = z + h * 0.19
        rack.box(g, "i4331_jack_shell", (x, y - 0.0026, tongue_z), (w * 0.54, 0.0006, h * 0.20))
        for i in range(8):
            cx = x - w * 0.22 + i * (w * 0.44 / 7)
            rack.box(g, "i4331_jack_gold", (cx, y - 0.0028, tongue_z),
                     (w * 0.030, 0.0005, h * 0.15))

    def cage(self, rack, g: str, x: float, z: float, w: float, h: float, top: bool) -> None:
        """One SFP opening. The two are inverted castings, so they mirror."""
        y = self.face(rack)
        rack.box(g, "i4331_cage", (x, y - 0.0024, z), (w, 0.0012, h))
        rack.box(g, "i4331_deep", (x, y + 0.0040, z), (w * 0.88, 0.0110, h * 0.82))
        outer = h * (0.32 if top else -0.32)
        for k in (0.88, 0.62):
            rack.box(g, "i4331_cage", (x, y - 0.0030, z + outer * k), (w * 0.68, 0.0008, h * 0.05))
        rack.box(g, "i4331_cage_edge", (x, y - 0.0031, z - outer * 0.70),
                 (w * 0.30, 0.0008, h * 0.08))

    def triangle(self, rack, g: str, x: float, z: float, s: float, up: bool) -> None:
        """One of the four small optics lamps between the SFP cages."""
        for i in range(3):
            f = (i + 0.5) / 3
            wide = s * (1 - f)
            dz = s * (f - 0.5) * (1 if up else -1)
            rack.box(g, "i4331_cage", (x, self.face(rack) - 0.0030, z + dz),
                     (max(wide, 0.0004), 0.0007, s * 0.36))

    def module(self, rack, g: str, x0: float, x1: float, z: float, mat: str) -> float:
        """The bay opening and the blank plate that fills it.

        Returns the plate's front face so the caller can punch its holes at
        the right depth. Every hole on this panel is in a plate rather than in
        the panel, which is why that number gets handed around.
        """
        y = self.face(rack)
        w = self.width
        cx = -w / 2 + (x0 + x1) / 2
        top, bot = self.MOD_Z
        cz = z + (top + bot) / 2 * self.height
        hz = (top - bot) * self.height
        rack.box(g, "i4331_deep", (cx, y - 0.0004, cz), (x1 - x0 + 0.0014, 0.0010, hz + 0.0014))
        rack.rounded_prism(g, mat, (cx, y - 0.0016, cz), (x1 - x0, 0.0016, hz),
                           radius=0.0008, bevel=0.0004, steps=6)
        return y - 0.0024

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, as one transparent overlay.

        Three yellow port names, two slot names, SM-BLANK, the warning line
        Cisco prints across each module, and the nameplate turned on its side
        at the right hand edge. Geometry cannot spell any of it.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (48, 48, 48, 255)
        faint = (150, 150, 148, 255)           # the etched warning text

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- the three port names on their yellow bars.
        f_port = sized(1.8, True)
        centred("GE 0/0/0", px(sum(self.BLOCK_X) / 2), py(sum(self.BAR_000) / 2), f_port)
        centred("GE 0/0/1", px(sum(self.RJ_X) / 2), py(sum(self.BAR_LOWER) / 2), f_port)
        centred("GE 0/0/2", px(sum(self.SFP_X) / 2), py(sum(self.BAR_LOWER) / 2), f_port)
        # The speed and link corner marks on both RJ45s, which Cisco sets in
        # 1mm capitals right against the plate edge.
        f_sl = sized(1.2)
        for zt in (self.RJ_TOP_Z[0], self.RJ_BOT_Z[0]):
            # Inside the jack's own width, not outside it: placed outside, the
            # S falls off the left edge of a panel whose first port starts
            # 0.7mm in.
            centred("S", px(self.RJ_X[0]) + 0.0010 * ppm, py(zt) + 0.0009 * ppm, f_sl)
            centred("L", px(self.RJ_X[1]) - 0.0010 * ppm, py(zt) + 0.0009 * ppm, f_sl)

        # ---- module names, along the bottom of each plate.
        f_mod = sized(2.0, True)
        centred("NIM 1", px(sum(self.NIM1_X) / 2), py(-0.3774), f_mod)
        centred("NIM 2", px(sum(self.NIM2_X) / 2), py(-0.3774), f_mod)
        centred("SM 1", px(0.1935), py(-0.3774), sized(1.6, True))
        centred("SM-BLANK", px(0.2225), py(0.1738), f_mod)

        # ---- the warning Cisco etches across every module, which is grey on
        #      grey and reads as texture rather than as words at any distance.
        f_warn = sized(1.4)
        for cx in (sum(self.NIM1_X) / 2, sum(self.NIM2_X) / 2):
            centred("SEE MANUAL BEFORE REMOVING", px(cx), py(0.0100), f_warn, faint)

        # ---- the nameplate, turned on its side against the right edge.
        f_name = sized(2.2, True)
        plate = Image.new("RGBA", (900, 200), (0, 0, 0, 0))
        pd = ImageDraw.Draw(plate)
        pd.text((0, 0), "CISCO 4331", font=f_name, fill=ink)
        b = pd.textbbox((0, 0), "CISCO 4331", font=f_name)
        plate = plate.crop((0, 0, b[2] + 4, b[3] + 4)).rotate(-90, expand=True)
        img.alpha_composite(plate, (int(px(self.NAME_X) - plate.width / 2),
                                    int(py(0.10) - plate.height / 2)))

        tex = save_texture("isr4331_silkscreen.png", img)
        rack.materials["i4331_silktex"] = PBRMaterial(
            name="ISR4331 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.58,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "i4331_silktex",
                            (0, self.face(rack) - 0.0034, z), self.width, self.height)

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

        def band(zr, x0, x1, mat, depth=0.0008, dy=0.0022):
            cz = Z((zr[0] + zr[1]) / 2)
            rack.box(g, mat, ((X(x0) + X(x1)) / 2, y - dy, cz),
                     (x1 - x0, depth, (zr[0] - zr[1]) * h))

        # Chassis body, panel, and the two black rails that frame the modules.
        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "i4331_chassis", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0010, bevel=0.0005, steps=6)
        # The lid is a short lip at the front, not a slab running the depth of
        # the chassis: drawn deep it projects its own underside as a dark band
        # above the device from any camera at panel height.
        rack.box(g, "i4331_lid", (0, y + 0.016, z + h * 0.470), (w - 0.006, 0.030, 0.0030))
        for rail in (self.TOP_RAIL, self.BOT_RAIL):
            band(rail, 0.0, w, "i4331_rail", 0.0010, 0.0006)
        for i in range(self.RAIL_VENT_N):
            vx = X(self.RAIL_VENT_X0 + i * self.RAIL_VENT_PITCH + self.RAIL_VENT_R)
            for vz in self.RAIL_VENT_Z:
                self.round_vent(rack, g, vx, Z(vz))

        # Rack ears. On a 4331 these are the one bright thing on an otherwise
        # black chassis, which is why they get their own near white finish.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0200)
            rack.rounded_prism(g, "i4331_ear", (ex, y + 0.0012, z), (0.040, 0.0080, h * 0.94),
                               radius=0.0014, bevel=0.0006, steps=6)
            for dz in (h * 0.30, -h * 0.30):
                rack.front_cylinder(g, "i4331_deep", (ex, y - 0.0026, z + dz), 0.0026, 0.0028, 16)

        # ---- the port block ---------------------------------------------
        bx0, bx1 = self.BLOCK_X
        bz0, bz1 = self.BLOCK_Z
        rack.rounded_prism(g, "i4331_plate", ((X(bx0) + X(bx1)) / 2, y - 0.0016,
                                              Z((bz0 + bz1) / 2)),
                           (bx1 - bx0, 0.0016, (bz0 - bz1) * h),
                           radius=0.0008, bevel=0.0004, steps=6)
        band(self.BAR_000, bx0 + 0.0004, bx1 - 0.0004, "i4331_yellow", 0.0008, 0.0026)
        band(self.BAR_LOWER, self.RJ_X[0] + 0.0002, self.RJ_X[1] + 0.0004,
             "i4331_yellow", 0.0008, 0.0026)
        band(self.BAR_LOWER, self.SFP_X[0] - 0.0004, self.SFP_X[1] + 0.0007,
             "i4331_yellow", 0.0008, 0.0026)
        rjx = (X(self.RJ_X[0]) + X(self.RJ_X[1])) / 2
        rjw = (self.RJ_X[1] - self.RJ_X[0]) * 0.94
        self.jack(rack, g, rjx, Z(sum(self.RJ_TOP_Z) / 2), rjw,
                  (self.RJ_TOP_Z[0] - self.RJ_TOP_Z[1]) * h)
        self.jack(rack, g, rjx, Z(sum(self.RJ_BOT_Z) / 2), rjw,
                  (self.RJ_BOT_Z[0] - self.RJ_BOT_Z[1]) * h)
        sfx = (X(self.SFP_X[0]) + X(self.SFP_X[1])) / 2
        sfw = (self.SFP_X[1] - self.SFP_X[0]) * 0.92
        self.cage(rack, g, sfx, Z(sum(self.SFP_TOP_Z) / 2), sfw,
                  (self.SFP_TOP_Z[0] - self.SFP_TOP_Z[1]) * h, True)
        self.cage(rack, g, sfx, Z(sum(self.SFP_BOT_Z) / 2), sfw,
                  (self.SFP_BOT_Z[0] - self.SFP_BOT_Z[1]) * h, False)
        band(self.SFP_STRIP_Z, self.SFP_X[0], self.SFP_X[1], "i4331_strip", 0.0009, 0.0026)
        strip_z = Z(sum(self.SFP_STRIP_Z) / 2)
        for k in range(4):
            self.triangle(rack, g, sfx + (k - 1.5) * 0.0034, strip_z, 0.0026, up=(k % 2 == 0))

        # ---- NIM 1, NIM 2 -----------------------------------------------
        lw, lh = self.NIM_LOUVRE
        ow, oh = self.NIM_OVAL
        for x0, x1 in (self.NIM1_X, self.NIM2_X):
            surf = self.module(rack, g, x0, x1, z, "i4331_nim")
            n_l = int((x1 - x0 - 0.014) / self.NIM_LOUVRE_PITCH) + 1
            for i in range(n_l):
                lx = X(x0 + 0.0080 + i * self.NIM_LOUVRE_PITCH)
                for lz in self.NIM_LOUVRE_Z:
                    self.louvre(rack, g, lx, Z(lz), surf)
            n_o = int((x1 - x0 - 0.012) / self.NIM_OVAL_PITCH) + 1
            # The bottom row breaks around the slot name. Punching straight
            # through it puts NIM 1 behind a row of holes and the name
            # disappears, which is what the photograph does not show.
            gap = (x0 + x1) / 2 - 0.0090, (x0 + x1) / 2 + 0.0090
            for i in range(n_o):
                ox_m = x0 + 0.0060 + i * self.NIM_OVAL_PITCH
                for j, oz in enumerate(self.NIM_OVAL_Z):
                    if j == 1 and gap[0] < ox_m < gap[1]:
                        continue
                    self.oval(rack, g, X(ox_m), Z(oz), ow, oh, surf)

        # ---- the SM-X bay and its blank ----------------------------------
        surf = self.module(rack, g, *self.SM_X, z, "i4331_sm")
        sw, sh = self.SM_SLOT
        fx0, fx1 = self.SM_FIELD_X
        n_s = int((fx1 - fx0) / self.SM_SLOT_PITCH) + 1
        # Row two breaks around the SM-BLANK name, the same way the NIM rows
        # break around theirs.
        sm_gap = (0.2085, 0.2370)
        for i in range(n_s):
            sx_m = fx0 + i * self.SM_SLOT_PITCH
            for j, sz in enumerate(self.SM_SLOT_Z):
                if j == 1 and sm_gap[0] < sx_m < sm_gap[1]:
                    continue
                self.oval(rack, g, X(sx_m), Z(sz), sw, sh, surf)

        # ---- the captive screws, one per module --------------------------
        for scx in self.SCREW_X:
            # A knurled captive screw, which is a thick disc with a cross slot
            # in it. The knurling is a ring of small teeth rather than a
            # texture: at this size a smooth disc reads as a rivet.
            rack.front_cylinder(g, "i4331_screw", (X(scx), y - 0.0032, Z(self.SCREW_Z)),
                                0.0030, 0.0022, 22)
            for k in range(14):
                import math
                a = k * math.pi / 7
                rack.box(g, "i4331_slot",
                         (X(scx) + math.cos(a) * 0.0029, y - 0.0042,
                          Z(self.SCREW_Z) + math.sin(a) * 0.0029), (0.0006, 0.0006, 0.0006))
            for ew, eh in ((0.0026, 0.0005), (0.0005, 0.0026)):
                rack.box(g, "i4331_slot", (X(scx), y - 0.0044, Z(self.SCREW_Z)),
                         (ew, 0.0006, eh))

        # ---- the right hand bracket and its two screws -------------------
        px0, px1 = self.BRACKET_X
        rack.rounded_prism(g, "i4331_bracket", ((X(px0) + X(px1)) / 2, y - 0.0016,
                                                Z(sum(self.MOD_Z) / 2)),
                           (px1 - px0, 0.0016, (self.MOD_Z[0] - self.MOD_Z[1]) * h),
                           radius=0.0006, bevel=0.0004, steps=6)
        for bz in self.BRACKET_SCREW_Z:
            rack.front_cylinder(g, "i4331_screw", (X(sum(self.BRACKET_X) / 2 - 0.0030),
                                                   y - 0.0028, Z(bz)), 0.0016, 0.0014, 16)

        self.silkscreen(rack, z)
