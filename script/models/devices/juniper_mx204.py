"""Juniper MX204, drawn from the labelled line drawing in its hardware guide.

Juniper put an orthographic elevation of this router in the MX204 Hardware
Guide as Figure 1, every port called out by name, and that is a far better
thing to model from than the studio photograph next to it: a drawing has no
projection to undo, so a feature's position comes straight off it. The
studio shot is still here, because a drawing does not carry colour, does
not show that the rack ears are zinc plated rather than painted, and draws
the panel perforation as hexagons when the real thing is round holes.

What the elevation shows, left to right:

  An integral rack ear at each end with a slot at the top, a round hole in
  the middle and a slot at the bottom. The photograph fills the two slots
  with captive thumbscrews the colour of passivated zinc, which is the one
  thing on this router that is not grey.

  The juniper wordmark at the far left over an earthing stud and its ESD
  symbol. Then the GM/PTP timing SFP on its own, then four QSFP28 in a
  single ganged row with four lane lamps over each, then the eight SFP+
  in a four by two block, and between the two rows of that block the
  triangle lamps that Juniper prints pointing at the port they belong to.

  Then the housekeeping: MGMT, BITS, CON and ToD as four RJ45s in a row,
  a USB-A stood on its end, four SMB coaxes in a two by two for PPS and
  100MHz in and out, five status lamps, the recessed OFFLINE button and
  the RESET pinhole.

  Everywhere else there are holes. An MX204 is 400 watts in one rack unit
  and the whole faceplate is perforated at a 2.9mm pitch, which works out
  at about two and a half thousand holes. Those are painted into the
  overlay rather than modelled, because two and a half thousand boxes buys
  nothing at any distance a rack is ever seen from and costs more geometry
  than the rest of the router put together.

Nothing here is shared with another product. The cages, the jacks, the
lamps and the ears are drawn in this file, at this router's proportions,
from this router's drawing.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class MX204(Device):
    slug = "MX204"
    name = "Juniper MX204"
    u = 1
    #: Juniper publish 1.72 x 17.42 x 22.0 in for this chassis.
    width = 0.4425
    depth = 0.559
    source = "https://www.juniper.net/documentation/us/en/hardware/mx204/"
    references = [
        Reference("https://www.juniper.net/documentation/us/en/hardware/mx204/images/g009860.png",
                  "hardware guide Figure 1, orthographic front elevation, 1501x299, "
                  "every port labelled, and the source of every position below"),
        Reference("https://www.juniper.net/content/dam/www/assets/images/us/en/image-library"
                  "/mx-series/mx204/mx204-front-high.jpg",
                  "studio front on, 1500x200, for colour, the zinc ears and the round perforation"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, 5.3mm proud of the rack front.

        The panel is a 10.5mm slab centred on `front_y`, so measuring
        surface detail from `front_y` buries half of it inside the metal.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Sampled off the studio photograph across the perforated field:
            # 177,181,189 where the key light lands and 129,134,144 in the
            # shade at the right hand end, so the paint is between them. A
            # graphite with a blue cast, and a shade darker than the
            # QFX5120 platinum modelled next door.
            "mx204_panel": pbr("MX204 Panel", [143, 147, 156, 255], 0.16, 0.62),
            # The ears are not painted. They are a plated bracket, lighter
            # and faintly green next to the panel, measured at 121,128,133.
            "mx204_ear": pbr("MX204 Rack Ear", [136, 143, 147, 255], 0.58, 0.34),
            # Captive thumbscrews, passivated zinc, the one colour on the
            # router. Measured off the heads in the photograph.
            "mx204_screw": pbr("MX204 Thumbscrew", [150, 176, 178, 255], 0.68, 0.30),
            "mx204_edge": pbr("MX204 Edge", [166, 170, 178, 255], 0.20, 0.52),
            # A ganged cage assembly is a casting sunk a millimetre into the
            # panel, and its face is a shade darker than the paint.
            "mx204_gang": pbr("MX204 Cage Housing", [112, 116, 122, 255], 0.34, 0.50),
            # Bare stamped steel around every optical opening.
            "mx204_rim": pbr("MX204 Cage Rim", [176, 179, 181, 255], 0.70, 0.32),
            "mx204_rim_dark": pbr("MX204 Cage Rim Shadow", [104, 106, 108, 255], 0.60, 0.40),
            # Sampled at 48,42,37 inside an empty QSFP28: warm, because it
            # is unpainted zinc in shadow rather than black plastic.
            "mx204_bore": pbr("MX204 Cage Bore", [34, 31, 29, 255], 0.14, 0.88),
            "mx204_throat": pbr("MX204 Cage Throat", [14, 13, 13, 255], 0.06, 0.94),
            "mx204_card": pbr("MX204 Card Edge", [186, 183, 174, 255], 0.0, 0.60),
            # An RJ45 here is a black moulding in a nickel shield, and the
            # shield is what you see: Juniper gangs these four behind one
            # stamped plate rather than sinking them in a pocket.
            "mx204_jack_shield": pbr("MX204 Jack Shield", [150, 153, 155, 255], 0.66, 0.34),
            "mx204_jack_bore": pbr("MX204 Jack Bore", [13, 13, 14, 255], 0.06, 0.94),
            "mx204_jack_tongue": pbr("MX204 Jack Tongue", [52, 52, 54, 255], 0.10, 0.76),
            "mx204_gold": pbr("MX204 Jack Contacts", [196, 158, 78, 255], 0.84, 0.26),
            # SMB coax bodies are gold plated and read almost orange next to
            # all this grey. They are the second brightest thing on the face.
            "mx204_smb": pbr("MX204 SMB Coax", [206, 158, 62, 255], 0.86, 0.24),
            "mx204_smb_bore": pbr("MX204 SMB Bore", [30, 26, 20, 255], 0.20, 0.80),
            "mx204_button": pbr("MX204 Offline Button", [40, 41, 43, 255], 0.24, 0.48),
            "mx204_stud": pbr("MX204 Earth Stud", [128, 131, 133, 255], 0.62, 0.36),
            # Unlit lenses. Nothing on a studio bench has link, and painting
            # these bright turns a router into a Christmas tree.
            "mx204_lamp": pbr("MX204 Status Lamp", [52, 60, 52, 255], 0.0, 0.40,
                              emissive=[0.014, 0.030, 0.014]),
            "mx204_lamp_amber": pbr("MX204 Amber Lamp", [70, 58, 38, 255], 0.0, 0.40,
                                    emissive=[0.032, 0.020, 0.004]),
        })

    # ------------------------------------------------------------- measured
    #
    # Off Figure 1 of the hardware guide. The outline of the faceplate
    # between the two ears measures x 79..1394, y 87..212, so 1315 by 125
    # pixels for the 442.5mm Juniper publish, which puts a pixel at
    # 0.3365mm across. The drawing is about four percent tall for its
    # width, which is why every vertical figure below is a fraction of
    # panel height rather than a millimetre: the stretch cannot then leak
    # into the model. Horizontal figures are metres from the left edge of
    # the faceplate.
    #
    # The drawing's own port sizes are a little conservative against the
    # MSA outlines (a QSFP28 opening comes off it at 16.8mm where the real
    # part is 18.4) but they are internally consistent, and consistency is
    # what makes a panel read right.

    #: The GM/PTP timing SFP, on its own ahead of everything else.
    GMPTP_X, GMPTP_W = 0.03215, 0.01245
    GMPTP_Z, GMPTP_H = -0.236, 0.216
    #: Its two lamps, stacked rather than side by side.
    GMPTP_LAMP_X, GMPTP_LAMP_Z = 0.0425, (-0.120, -0.288)

    #: Four QSFP28 in one ganged housing, single row, low on the panel.
    QSFP_X0, QSFP_PITCH, QSFP_W = 0.05590, 0.019165, 0.01682
    QSFP_Z, QSFP_H = -0.236, 0.200
    QSFP_GANG = (0.0464, 0.1232)
    #: Four lane lamps over each cage, at a 4.0mm pitch.
    QSFP_LAMP_Z, QSFP_LAMP_PITCH = -0.008, 0.00403

    #: Eight SFP+ as four columns of two in one housing.
    SFPP_X0, SFPP_PITCH, SFPP_W = 0.13800, 0.014500, 0.01245
    SFPP_Z = (0.160, -0.226)
    SFPP_H = 0.178
    SFPP_GANG = (0.1302, 0.1891)
    #: The triangle lamps between the two rows, four to a column, pointing
    #: alternately at the port above and the port below.
    SFPP_LAMP_Z, SFPP_LAMP_PITCH = -0.036, 0.00305

    #: MGMT, BITS, CON, ToD. The drawing gives each a 51 px stamped frame.
    RJ45_X = (0.2488, 0.2710, 0.2946, 0.3189)
    RJ45_Z, RJ45_W, RJ45_H = -0.188, 0.01716, 0.328

    #: USB-A stood on its end, which is how this panel has it.
    USB_X, USB_Z, USB = 0.33450, -0.180, (0.00471, 0.312)

    #: Four SMB coax in a two by two: PPS on the left, 100MHz on the right,
    #: IN over OUT. The drawing labels them the other way round from the
    #: shipping silkscreen, and the photograph is the one that is right.
    SMB_X = (0.34880, 0.35890)
    SMB_Z = (-0.076, -0.268)
    SMB_R = 0.00220

    #: OK/FAIL, ONLINE, ALM, SSD0, SSD1 in a row near the bottom edge.
    LED_X = (0.36960, 0.38120, 0.39180, 0.40010, 0.40860)
    LED_Z, LED_R = -0.334, 0.00135

    OFFLINE_X, OFFLINE_Z, OFFLINE_R = 0.41840, -0.272, 0.00220
    RESET_X, RESET_Z = 0.42700, -0.290
    #: Earthing stud and its ESD triangle, at the far left.
    STUD_X, STUD_Z, STUD_R = 0.01010, -0.176, 0.00435

    #: The perforation: 8.75 px pitch on a 1439 px wide photograph of a
    #: 482.6mm face, so 2.93mm, with rows a further 0.866 of that apart
    #: because that is what a hexagonal packing of round holes has to be.
    PERF_PITCH = 0.00293
    PERF_R = 0.00090

    # ----------------------------------------------------------- silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """Every marking on the panel, plus the perforation, as one overlay.

        Geometry cannot spell, which is the usual reason for this sheet.
        The unusual one is the holes: an MX204 face is perforated corner to
        corner at a 2.9mm pitch, which is about 2500 openings, and drawing
        them as boxes costs more triangles than the whole rest of the
        router. Painted here they are round, they antialias, and they cost
        two triangles.

        Everything the holes must not cross is listed as a keep-out
        rectangle in panel coordinates, taken from the same constants the
        geometry uses. The first pass punched holes straight through the
        cage housings and the label strip, which reads as a fault rather
        than as ventilation.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 4096
        H = round(W * self.height / self.width)
        ppm = W / self.width
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (232, 233, 235, 255)                 # Juniper silkscreen white
        hole = (24, 24, 26, 235)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        def sized(mm_cap: float, bold: bool = False):
            return font(max(8, round(mm_cap / 1000 * ppm / 0.729)), bold)

        def fitted(text: str, mm_wide: float, bold: bool = False):
            """A font at which `text` measures `mm_wide` millimetres across."""
            want = mm_wide / 1000 * ppm
            f = font(40, bold)
            got = d.textbbox((0, 0), text, font=f)[2]
            return font(max(8, round(40 * want / max(got, 1))), bold)

        def centred(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]), text, font=f, fill=fill)

        # ---- the perforation ------------------------------------------
        # Keep-outs in metres and z fractions: x0, x1, z_top, z_bottom.
        keep = [
            (0.0015, 0.0430, 0.50, 0.20),           # the wordmark
            (0.0030, 0.0175, -0.05, -0.32),         # earthing stud and ESD symbol
            (0.0205, 0.0475, -0.06, -0.50),         # GM/PTP and its two lamps
            (0.0425, 0.1275, 0.045, -0.50),         # the QSFP28 row and its lane lamps
            (0.1275, 0.1920, 0.31, -0.50),          # the SFP+ block
            (0.2385, 0.3295, 0.00, -0.50),          # MGMT, BITS, CON, ToD
            (0.3300, 0.3395, 0.00, -0.50),          # the USB
            (0.3420, 0.3670, -0.02, -0.50),         # the timing coaxes
            (0.3640, 0.4340, -0.28, -0.50),         # lamps, OFFLINE, RESET
            (0.3960, 0.4400, 0.46, 0.20),           # the MX204 badge
            (0.0000, 0.4425, -0.375, -0.50),        # the label strip along the foot
            (0.0000, 0.4425, 0.50, 0.452),          # the plain lip along the top
        ]

        def blocked(xm: float, frac: float) -> bool:
            for x0, x1, zt, zb in keep:
                if x0 <= xm <= x1 and zb <= frac <= zt:
                    return True
            return False

        rows = int(self.height / (self.PERF_PITCH * 0.866)) + 1
        cols = int(self.width / self.PERF_PITCH) + 1
        r = px(self.PERF_R)
        for j in range(rows):
            frac = 0.5 - (j + 0.5) * self.PERF_PITCH * 0.866 / self.height
            offset = 0.0 if j % 2 == 0 else self.PERF_PITCH / 2
            for i in range(cols):
                xm = 0.0022 + offset + i * self.PERF_PITCH
                if xm > self.width - 0.0022 or blocked(xm, frac):
                    continue
                cx, cy = px(xm), py(frac)
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hole)

        # ---- the wordmark, set the way Juniper set it: the name in a
        #      light face over NETWORKS in small caps, letterspaced.
        f_mark = fitted("juniper", 24.3)
        top = py(0.348) - d.textbbox((0, 0), "j", font=f_mark)[3] / 2
        d.text((px(0.0030), top), "juniper", font=f_mark, fill=ink)
        f_sub = sized(1.3, True)
        sub = "N E T W O R K S"
        b = d.textbbox((0, 0), sub, font=f_sub)
        d.text((px(0.0270) - (b[2] - b[0]), py(0.252) - (b[3] - b[1]) / 2 - b[1]),
               sub, font=f_sub, fill=ink)
        # The photograph puts the model number at the far right, where the
        # drawing has a RUNNING JUNOS mark instead. The shipping unit wins.
        centred("MX204", px(0.4180), py(0.330), fitted("MX204", 19.0, True))

        # ---- port labels along the foot --------------------------------
        f_lab, f_small = sized(1.9, True), sized(1.6, True)
        foot, foot2 = py(-0.418), py(-0.470)

        centred("GM/PTP", px(self.GMPTP_X), foot, f_lab)
        for i in range(4):
            centred(f"0/{i}", px(self.QSFP_X0 + i * self.QSFP_PITCH), foot, f_lab)
        # The SFP+ columns carry two numbers each, the top port over the
        # bottom one, because one column is two ports.
        for i in range(4):
            cx = px(self.SFPP_X0 + i * self.SFPP_PITCH)
            centred(f"1/{i * 2}", cx, foot, f_small)
            centred(f"1/{i * 2 + 1}", cx, foot2, f_small)
        for label, x in zip(("MGMT", "BITS", "CON", "ToD"), self.RJ45_X):
            centred(label, px(x), foot, f_lab)

        # ---- the timing block, which is labelled in two directions ------
        centred("PPS", px(self.SMB_X[0]) - px(0.0020), foot, sized(1.25, True))
        centred("100MHz", px(self.SMB_X[1]) + px(0.0018), foot, sized(1.10, True))
        mid = (self.SMB_X[0] + self.SMB_X[1]) / 2
        centred("IN", px(mid), py(-0.150), sized(1.4, True))
        centred("OUT", px(mid), py(-0.348), sized(1.4, True))

        # The right hand end of the label strip carries nine words in
        # 90mm. Set at the 1.6mm the port labels use, OK/FAIL runs straight
        # through 100MHz, so this cluster is set smaller, which is exactly
        # what the real silkscreen does.
        f_tiny = sized(1.15, True)
        centred("USB", px(self.USB_X), foot, f_tiny)
        for label, x in zip(("OK/FAIL", "ONLINE", "ALM", "SSD0", "SSD1"), self.LED_X):
            centred(label, px(x), foot, f_tiny)
        centred("OFFLINE", px(self.OFFLINE_X), foot, f_tiny)
        centred("RESET", px(self.RESET_X) + px(0.0055), foot, f_tiny)

        tex = save_texture("mx204_silkscreen.png", img)
        rack.materials["mx204_silktex"] = PBRMaterial(
            name="MX204 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.66,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(self.slug, "mx204_silktex",
                            (0, self.face(rack) - 0.0007, z), self.width, self.height)

    # --------------------------------------------------------------- parts

    def gang(self, rack, g: str, z: float, x0: float, x1: float,
             top: float, bottom: float) -> None:
        """The sunken casting a group of optical cages is ganged behind.

        On this router the cages are not punched straight through the paint.
        They sit in a shallow machined pocket with a lip round it, and that
        lip is what separates the QSFP row from the SFP+ block visually.
        Without it the two groups float on the perforation.
        """
        y = self.face(rack)
        cx, w = (x0 + x1) / 2, x1 - x0
        cz = (top + bottom) / 2 * self.height + z
        hz = (top - bottom) * self.height
        rack.box(g, "mx204_edge", (cx, y - 0.0009, cz), (w + 0.0010, 0.0008, hz + 0.0010))
        rack.box(g, "mx204_gang", (cx, y - 0.0005, cz), (w, 0.0009, hz))

    def optic(self, rack, g: str, x: float, z: float, w: float, h: float,
              top_row: bool, lanes: int = 1) -> None:
        """One optical opening, SFP or SFP+ or QSFP28.

        Same routine for all three on this panel because on this panel they
        genuinely are the same casting at three widths: the drawing shows
        one stamped rim, one pair of ridges across the roof and the card
        edge against the floor, at every size. The one thing that changes
        with the port is how many card edges there are, which is how many
        lanes it has.

        `top_row` mirrors the inside. The bottom row of the SFP+ block is
        an inverted casting and drawing it the same way up makes eight
        ports look printed on.
        """
        y = self.face(rack)
        rim = 0.00070
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            mat = "mx204_rim" if dz >= 0 else "mx204_rim_dark"
            rack.box(g, mat, (x + dx, y - 0.0016, z + dz), (bw, 0.0013, bh))
        rack.box(g, "mx204_bore", (x, y - 0.0007, z), (w - rim * 2, 0.0022, h - rim * 2))
        rack.box(g, "mx204_throat", (x, y + 0.0060, z), (w * 0.88, 0.0110, h * 0.82))
        outer = h * (0.5 if top_row else -0.5)
        rack.box(g, "mx204_rim_dark", (x, y - 0.0019, z + outer * 0.72),
                 (w * 0.82, 0.0008, h * 0.09))
        for i in range(lanes):
            lx = x + (i - (lanes - 1) / 2) * (w * 0.86 / max(lanes, 1))
            rack.box(g, "mx204_card", (lx, y - 0.0018, z - outer * 0.60),
                     (w * (0.36 if lanes == 1 else 0.15), 0.0008, h * 0.10))

    def jack(self, rack, g: str, x: float, z: float) -> None:
        """One RJ45, as this router gangs them: shield first, hole second.

        MGMT and BITS carry a lamp in each top corner and CON and ToD do
        not, but at 17mm across the difference is a pixel, so all four are
        drawn the same and the distinction is left to the silkscreen.
        """
        y = self.face(rack)
        w, h = self.RJ45_W, self.RJ45_H * self.height
        # The stamped plate the four jacks are ganged behind, and its rim.
        rack.box(g, "mx204_edge", (x, y - 0.0008, z), (w + 0.0008, 0.0007, h + 0.0008))
        rack.box(g, "mx204_jack_shield", (x, y - 0.0012, z), (w, 0.0009, h))
        # A jack reads as a hole, not a tile. The first pass laid the shield
        # across the full opening at the same depth as the bore, so all four
        # came out as pale grey squares with a gold smudge in them and the
        # cavity never showed at all. The bore has to win the depth test, so
        # it is drawn further forward than the plate and only then stepped
        # back into the chassis.
        rack.box(g, "mx204_jack_bore", (x, y - 0.0018, z), (w * 0.80, 0.0020, h * 0.78))
        rack.box(g, "mx204_jack_bore", (x, y + 0.0050, z), (w * 0.70, 0.0100, h * 0.68))
        # The latch slot notches the bottom of the mouth on all four. It has
        # to be drawn in front of the bore rather than inside it, or the
        # bore swallows it along with the tongue.
        rack.box(g, "mx204_jack_shield", (x, y - 0.0031, z - h * 0.40),
                 (w * 0.24, 0.0010, h * 0.18))
        # The tongue and its eight contacts, standing three tenths of a
        # millimetre off the cavity floor: level with it they vanish, level
        # with the rim they look printed on.
        rack.box(g, "mx204_jack_tongue", (x, y - 0.0031, z + h * 0.14),
                 (w * 0.50, 0.0006, h * 0.26))
        for i in range(8):
            cx = x - w * 0.20 + i * (w * 0.40 / 7)
            rack.box(g, "mx204_gold", (cx, y - 0.0033, z + h * 0.14),
                     (w * 0.026, 0.0005, h * 0.20))

    def triangle_lamp(self, rack, g: str, x: float, z: float, s: float, up: bool) -> None:
        """The solid triangle Juniper prints for an optical port lamp.

        Three stacked slivers rather than a real triangle. At 1.5mm the
        silhouette is all that reads and it costs a fifth of the geometry.
        """
        for i in range(3):
            f = (i + 0.5) / 3
            wide = s * (1 - f) if up else s * f
            dz = s * (f - 0.5) * (1 if up else -1)
            rack.box(g, "mx204_lamp", (x, self.face(rack) - 0.0011, z + dz),
                     (max(wide, s * 0.14), 0.0008, s * 0.34))

    def ear(self, rack, g: str, z: float, side: int) -> None:
        """One integral rack ear.

        A folded plated bracket rather than painted sheet, with a mounting
        slot top and bottom, a plain hole between them, and a captive
        thumbscrew standing in each slot. The drawing gives the slots; the
        photograph gives the screws and the fact that none of it is the
        colour of the panel.
        """
        y = self.face(rack)
        h = self.height
        ex = side * (self.width / 2 + 0.0107)
        rack.rounded_prism(g, "mx204_ear", (ex, y + 0.0012, z), (0.0215, 0.0082, h * 0.99),
                           radius=0.0012, bevel=0.0006, steps=6)
        for dz in (0.364, -0.396):
            rack.rounded_prism(g, "mx204_gang", (ex - side * 0.0002, y - 0.0028, z + dz * h),
                               (0.0094, 0.0026, 0.0066), radius=0.0030, bevel=0.0006, steps=8)
            rack.front_cylinder(g, "mx204_screw", (ex - side * 0.0002, y - 0.0044,
                                                   z + dz * h), 0.0031, 0.0028, 20)
            rack.box(g, "mx204_gang", (ex - side * 0.0002, y - 0.0058, z + dz * h),
                     (0.0036, 0.0007, 0.0008))
            rack.box(g, "mx204_gang", (ex - side * 0.0002, y - 0.0058, z + dz * h),
                     (0.0008, 0.0007, 0.0036))
        rack.front_cylinder(g, "mx204_gang", (ex, y - 0.0026, z), 0.0016, 0.0024, 16)

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

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.012, self.depth, h * 0.92))
        rack.rounded_prism(g, "mx204_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0010, bevel=0.0005, steps=6)
        rack.box(g, "mx204_edge", (0, y - 0.0004, z + h * 0.482), (w - 0.004, 0.0006, 0.0010))
        rack.box(g, "mx204_gang", (0, y - 0.0004, z - h * 0.482), (w - 0.004, 0.0006, 0.0010))

        for side in (-1, 1):
            self.ear(rack, g, z, side)

        # ---- earthing stud at the far left, a hex nut on a boss --------
        rack.front_cylinder(g, "mx204_stud", (X(self.STUD_X), y - 0.0012, Z(self.STUD_Z)),
                            self.STUD_R, 0.0012, 6)
        rack.front_cylinder(g, "mx204_gang", (X(self.STUD_X), y - 0.0020, Z(self.STUD_Z)),
                            self.STUD_R * 0.46, 0.0010, 16)

        # ---- GM/PTP, one SFP on its own with two stacked lamps ---------
        self.gang(rack, g, z, X(self.GMPTP_X) - 0.0090, X(self.GMPTP_X) + 0.0090,
                  self.GMPTP_Z + self.GMPTP_H / 2 + 0.040,
                  self.GMPTP_Z - self.GMPTP_H / 2 - 0.040)
        # An upright cage keeps its card edge at the floor and its ridge at
        # the roof, which is what `top_row` selects. Passing False here, as
        # the first pass did, turned every QSFP on the panel upside down.
        self.optic(rack, g, X(self.GMPTP_X), Z(self.GMPTP_Z), self.GMPTP_W,
                   self.GMPTP_H * h, top_row=True)
        for lz in self.GMPTP_LAMP_Z:
            rack.front_cylinder(g, "mx204_lamp", (X(self.GMPTP_LAMP_X), y - 0.0010, Z(lz)),
                                0.00085, 0.0009, 8)

        # ---- four QSFP28 in one row ------------------------------------
        self.gang(rack, g, z, X(self.QSFP_GANG[0]), X(self.QSFP_GANG[1]),
                  self.QSFP_Z + self.QSFP_H / 2 + 0.036,
                  self.QSFP_Z - self.QSFP_H / 2 - 0.036)
        for i in range(4):
            cx = X(self.QSFP_X0 + i * self.QSFP_PITCH)
            self.optic(rack, g, cx, Z(self.QSFP_Z), self.QSFP_W, self.QSFP_H * h,
                       top_row=True, lanes=4)
            for k in range(4):
                rack.front_cylinder(g, "mx204_lamp",
                                    (cx + (k - 1.5) * self.QSFP_LAMP_PITCH, y - 0.0010,
                                     Z(self.QSFP_LAMP_Z)), 0.00085, 0.0009, 8)

        # ---- eight SFP+, four columns of two ---------------------------
        self.gang(rack, g, z, X(self.SFPP_GANG[0]), X(self.SFPP_GANG[1]),
                  self.SFPP_Z[0] + self.SFPP_H / 2 + 0.030,
                  self.SFPP_Z[1] - self.SFPP_H / 2 - 0.030)
        for i in range(4):
            cx = X(self.SFPP_X0 + i * self.SFPP_PITCH)
            self.optic(rack, g, cx, Z(self.SFPP_Z[0]), self.SFPP_W, self.SFPP_H * h, True)
            self.optic(rack, g, cx, Z(self.SFPP_Z[1]), self.SFPP_W, self.SFPP_H * h, False)
            # Four triangles between the rows: down, up, down, up, so each
            # port gets two and each pair points at the cage it serves.
            for k in range(4):
                self.triangle_lamp(rack, g, cx + (k - 1.5) * self.SFPP_LAMP_PITCH,
                                   Z(self.SFPP_LAMP_Z), 0.0022, up=(k % 2 == 1))

        # ---- MGMT, BITS, CON, ToD --------------------------------------
        for jx in self.RJ45_X:
            self.jack(rack, g, X(jx), Z(self.RJ45_Z))

        # ---- USB-A, stood on its end -----------------------------------
        uw, uh = self.USB
        rack.box(g, "mx204_jack_shield", (X(self.USB_X), y - 0.0012, Z(self.USB_Z)),
                 (uw, 0.0009, uh * h))
        # Same depth trap as the RJ45s: the bore is drawn in front of the
        # shell, not level with it, or the port is a plain grey tab.
        rack.box(g, "mx204_jack_bore", (X(self.USB_X), y - 0.0020, Z(self.USB_Z)),
                 (uw * 0.62, 0.0018, uh * h * 0.86))
        rack.box(g, "mx204_card", (X(self.USB_X) + uw * 0.13, y - 0.0026, Z(self.USB_Z)),
                 (uw * 0.24, 0.0008, uh * h * 0.64))

        # ---- the timing block, four gold SMB in a two by two -----------
        for sx in self.SMB_X:
            for sz in self.SMB_Z:
                rack.front_cylinder(g, "mx204_smb", (X(sx), y - 0.0018, Z(sz)),
                                    self.SMB_R, 0.0018, 20)
                rack.front_cylinder(g, "mx204_smb_bore", (X(sx), y - 0.0028, Z(sz)),
                                    self.SMB_R * 0.34, 0.0008, 12)

        # ---- status lamps, the offline button and the reset pinhole ----
        for i, lx in enumerate(self.LED_X):
            mat = "mx204_lamp_amber" if i == 2 else "mx204_lamp"
            rack.front_cylinder(g, mat, (X(lx), y - 0.0010, Z(self.LED_Z)),
                                self.LED_R, 0.0009, 10)
        rack.front_cylinder(g, "mx204_gang", (X(self.OFFLINE_X), y - 0.0010,
                                              Z(self.OFFLINE_Z)), self.OFFLINE_R, 0.0009, 18)
        rack.front_cylinder(g, "mx204_button", (X(self.OFFLINE_X), y - 0.0014,
                                                Z(self.OFFLINE_Z)), self.OFFLINE_R * 0.68,
                            0.0010, 18)
        rack.front_cylinder(g, "mx204_throat", (X(self.RESET_X), y - 0.0010,
                                                Z(self.RESET_Z)), 0.00075, 0.0009, 10)

        self.silkscreen(rack, z)
