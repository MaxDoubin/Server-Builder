"""Chatsworth eConnect EA-3020, drawn from CPI's own dimensioned elevation.

CPI print the numbers on the drawing, which makes this the easiest product
in the library to get right and the least excusable one to guess at. The
EA-3020 specification sheet carries a front elevation of the whole 1825.7mm
bar with the overall length, the width and the depth called out on it, and
every position below was read off that elevation by finding the connected
dark regions and taking their bounding boxes, the same way the USP-PDU-Pro
was measured. Nothing here is an estimate.

Note on sources, because it matters for this vendor: CPI also publish Revit
families and AutoCAD blocks, and their terms of use forbid reproducing or
publicly displaying those. None of them was fetched and none of them was
used. A dimension printed on a specification sheet is a fact about a
physical object; the geometry below is drawn from those facts.

What the elevation shows, running from the cord end:

  A cord gland at the very end, then three two-pole breakers under CB1 to
  CB3 label plates and a blank rating plate. Then the outlet field starts:
  five C13 mouldings, each holding two outlets side by side across the
  55mm face, then a cluster of three C19 outlets that take the full width
  one at a time, then four more C13 mouldings.

  The controller module sits past the middle rather than at the centre,
  because the cord end eats 390mm before the first outlet and the far end
  needs only 44mm. It is the part of this product anybody would recognise:
  a colour LCD with three round cyan buttons under it, two Aux jacks above,
  Ethernet, two Console ports, a Secure Array in and out pair, and two USB
  sockets down the outboard edge.

  Then three more breakers, and the whole outlet pattern repeats: five C13
  mouldings, three C19, four C13. Thirty six C13 and six C19 in total,
  which is what the ordering table says an EA-3020 carries.

The one thing that makes an eConnect read as an eConnect rather than as a
black stick is the colour coding. Every outlet sits in a moulded retention
cradle that is white, blue or green by phase, and carries a numbered label
plate in the same colour. In CPI's own photograph those cradles are the
only saturated thing on the product.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class EConnectPDU(Device):
    slug = "CPI_EA3020"
    name = "Chatsworth eConnect EA-3020 Monitored Vertical PDU"
    #: A 0U vertical PDU occupies no rack units at the mounting rails: it
    #: clips into the cabinet's rear channel. `u` is carried only so the
    #: bookkeeping in the rack definitions has a number, and `height` is
    #: overridden below with the real 1825.7mm the drawing prints.
    u = 41
    #: 2.165 [55.00] across the outlet face, 2.757 [70.02] deep, both from
    #: the EA-3020-X specification sheet.
    width = 0.0550
    depth = 0.07002
    source = ("https://www.chatsworth.com/en-us/products/power-monitoring-security"
              "/econnect-power-distribution-units/monitored/monitored-econnect-pdu/ea-3020-c/")
    references = [
        Reference("https://www.chatsworth.com/assets-proxy/public/asset/raw/"
                  "663b2857ae13c25e14022b2b/c6b5e998/67411eec607be8001865fc4e/EA-3020_SPEC",
                  "EA-3020-X specification sheet, dimensioned front elevation plus a "
                  "DISPLAY DETAIL of the controller module, orthographic"),
        Reference("https://www.chatsworth.com/assets-proxy/public/asset/raw/"
                  "663b2857ae13c25e14022b2b/593a9bb2/67f7e554fda9fc3228000028/"
                  "ECONNECT_EA-3XXX-C_DIAGONAL_1520x1020.jpg",
                  "product photograph, 1520x1020, for the finish and the outlet colour coding"),
        Reference("https://www.chatsworth.com/assets-proxy/public/asset/raw/"
                  "663b2857ae13c25e14022b2b/d9d9f257/66e71b5f0d8e5e00179de823/1/"
                  "eCONNECT_PDU_MONITORED_DATASHEET.pdf",
                  "Monitored eConnect data sheet, for the outlet mix per part number"),
    ]

    # -------------------------------------------------------------- measured
    #
    # The elevation was rendered at 12x and calibrated against the one
    # dimension printed across it: 11287 pixels spanned the 71.88 [1825.7]
    # overall length, which puts a pixel at 0.1618mm and makes every figure
    # below a measurement rather than a reading by eye. The 55.00mm width
    # came out of the same raster at 340 pixels, which is the check that the
    # calibration is right.
    #
    # LENGTHWISE figures are millimetres from the cord end. ACROSS figures
    # are millimetres from one long edge of the 55.00mm face.

    #: Overall length, 71.88 [1825.7] on the drawing.
    LENGTH = 1825.7

    #: Cord gland at the very end: a 15.3mm boss centred 37.5mm in.
    GLAND_Z, GLAND_D = 37.5, 15.3
    #: Six two-pole 20A breakers, three each side of the controller. Body
    #: 33.3 x 20.5mm, sitting between 22.8 and 43.3 across rather than
    #: centred, with the CB label plate above it.
    BREAKER_Z = (121.8, 199.8, 277.9, 1059.8, 1137.8, 1215.9)
    BREAKER = (33.3, 20.5)
    BREAKER_ACROSS = (22.8, 43.3)
    #: The blank rating plate between the first breaker bank and the outlets.
    PLATE_Z, PLATE = 329.0, (38.0, 26.0)

    #: Eighteen C13 mouldings, each holding two outlets across the face.
    #: Measured moulding centres, in four runs broken by the C19 clusters
    #: and the controller.
    C13_Z = (405.5, 445.6, 485.6, 525.6, 565.6,
             709.6, 749.7, 789.7, 829.7,
             1343.5, 1383.6, 1423.6, 1463.6, 1503.6,
             1647.7, 1687.7, 1727.7, 1767.7)
    #: The moulding, then the recess inside it, then the aperture in that.
    C13_BLOCK = (29.0, 52.7)
    C13_RECESS = (25.2, 20.1)
    C13_FACE = (21.4, 14.2)
    #: The two rows, 15.55 and 39.65 across a 55.00 face, so 24.1 apart and
    #: symmetric about the middle.
    C13_ROWS = (15.55, 39.65)

    #: Six C19, one per position and each taking the full width. Two of
    #: every three share a moulding, which is why the pitch alternates
    #: 30.9 then 36.6 rather than being uniform.
    C19_Z = (603.0, 633.9, 670.5, 1541.0, 1572.0, 1608.5)
    C19_RECESS = (25.1, 31.1)
    C19_FACE = (19.2, 26.5)
    #: Centred at 29.45 rather than 27.5: the C19 face sits a shade off the
    #: middle of the bar.
    C19_ACROSS = 29.45

    #: Controller module, 856.2 to 1033.6 on the elevation.
    HEAD_Z = (856.2, 1033.6)
    #: Everything on the head is measured from the head's own top edge, from
    #: the DISPLAY DETAIL view, which is calibrated by its outer frame:
    #: 1092 pixels across the 55.00mm width, 19.855 pixels per millimetre.
    HEAD_LCD = (36.9, 49.2)          # printed on the sheet as 1.45 and 1.94
    HEAD_LCD_TOP = 48.7
    HEAD_AUX = ((19.45, 35.65), 24.0)     # Aux2, Aux1, centre at y 24.0
    HEAD_RESET = (30.5, 35.1)
    HEAD_LEDS = (41.0, 36.0)              # OK, Warning, Critical, stacked
    HEAD_USBC = (8.0, 33.5)               # Console 2
    HEAD_BUTTONS = ((14.5, 27.5, 40.5), 112.1, 9.0)
    HEAD_ROW_B = 128.4                    # Ethernet, Console 1
    HEAD_ROW_C = 147.4                    # Secure Array in, out
    HEAD_JACK_X = (14.5, 31.25)
    HEAD_ARRAY_X = (15.05, 31.25)
    HEAD_USB_X = 48.7
    HEAD_BOSS = (27.6, 169.0, 7.4)

    #: The two tool-less mounting buttons, on the back. .500 [12.70] from
    #: the end, and the drawing gives two alternative spacings, 61.250
    #: [1555.75] and 64.750 [1644.65]. Position A is the one modelled.
    BUTTON_INSET = 12.70
    BUTTON_SPAN = 1555.75
    BUTTON = (14.48, 2.05)           # .570 [14.48] head, .081 [2.05] proud

    @property
    def height(self) -> float:
        """The real length, not `u` rack units.

        A 0U PDU is not a panel and does not round to a unit boundary. The
        base class would hand back 41 units less a hair, which is 1820mm and
        wrong by six millimetres, and six millimetres is the difference
        between the last outlet clearing the end cap and going through it.
        """
        return self.LENGTH / 1000.0

    def face(self, rack) -> float:
        """The outlet face.

        A vertical PDU sits behind the mounting rails in the cabinet's rear
        channel, not proud of them, so this is measured from the front of
        the bar itself rather than from the rack's rail plane.
        """
        return rack.front_y - self.depth / 2

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This product's own finishes, sampled off CPI's photograph.

        The body is black powder coat, and the whole trap with powder coat
        is that it photographs far lighter than the word black suggests.
        The neutral pixels on the bar cluster at 56 and at 80 of 255
        depending on which way the facet turns, so the base sits between
        them at 66. Painted at the 25 or 30 that the word black invites,
        the bar comes out as a silhouette and the outlets vanish into it.
        """
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Textured black powder coat. Rough, because it is: there is no
            # broad specular anywhere on this product in the photograph.
            "cpi_pdu_body": pbr("eConnect Body", [66, 66, 67, 255], 0.0, 0.86),
            "cpi_pdu_edge": pbr("eConnect Edge", [84, 84, 85, 255], 0.0, 0.82),
            "cpi_pdu_endcap": pbr("eConnect End Cap", [52, 52, 53, 255], 0.0, 0.88),
            # The outlet mouldings are a shade darker than the extrusion and
            # a good deal glossier, being moulded thermoplastic next to
            # powder coat.
            "cpi_pdu_outlet": pbr("eConnect Outlet Body", [44, 44, 45, 255], 0.0, 0.62),
            # The aperture. Measured at 18 of 255 in shadow on the
            # photograph, which is as dark as anything on the product gets.
            "cpi_pdu_slot": pbr("eConnect Outlet Slot", [17, 17, 18, 255], 0.0, 0.94),
            # The floor of the socket, which has to sit between the
            # moulding and the pin slots or the three slots vanish into it.
            "cpi_pdu_pocket": pbr("eConnect Socket Pocket", [38, 38, 39, 255], 0.0, 0.76),
            # The three phase colour coding, straight off the photograph.
            # These are the only saturated colours on the product and they
            # are what makes it recognisable at rack distance.
            "cpi_pdu_cradle_w": pbr("eConnect Cradle White", [196, 198, 198, 255], 0.0, 0.66),
            "cpi_pdu_cradle_b": pbr("eConnect Cradle Blue", [40, 121, 169, 255], 0.0, 0.60),
            "cpi_pdu_cradle_g": pbr("eConnect Cradle Green", [154, 186, 135, 255], 0.0, 0.62),
            "cpi_pdu_label": pbr("eConnect Label Plate", [150, 151, 152, 255], 0.0, 0.70),
            # Breaker rockers and their label plates.
            "cpi_pdu_breaker": pbr("eConnect Breaker", [58, 58, 59, 255], 0.0, 0.66),
            "cpi_pdu_rocker": pbr("eConnect Breaker Rocker", [104, 105, 105, 255], 0.0, 0.58),
            # The controller module, a separate field replaceable casting a
            # touch lighter than the extrusion it drops into.
            "cpi_pdu_head": pbr("eConnect Controller", [72, 72, 73, 255], 0.0, 0.78),
            # The LCD reads as a pale blue white with a teal bezel, and it
            # is backlit, so it carries a little emission of its own.
            "cpi_pdu_lcd": pbr("eConnect LCD", [209, 228, 237, 255], 0.0, 0.24,
                               emissive=[0.04, 0.05, 0.06]),
            "cpi_pdu_lcd_bezel": pbr("eConnect LCD Bezel", [36, 118, 142, 255], 0.0, 0.44),
            # The three selector buttons, a deeper cyan than the screen.
            "cpi_pdu_button": pbr("eConnect Selector", [16, 122, 170, 255], 0.0, 0.42),
            "cpi_pdu_jack": pbr("eConnect Jack Shell", [96, 98, 99, 255], 0.54, 0.42),
            "cpi_pdu_usb": pbr("eConnect USB", [206, 207, 205, 255], 0.0, 0.56),
            "cpi_pdu_led": pbr("eConnect Status LED", [96, 190, 120, 255], 0.0, 0.30,
                               emissive=[0.10, 0.30, 0.14]),
            "cpi_pdu_button_ring": pbr("eConnect Boss", [120, 121, 121, 255], 0.42, 0.46),
        })

    # ------------------------------------------------------------ geometry

    def outlet_c13(self, rack, g: str, y: float, z: float, across: float,
                   cradle: str) -> None:
        """One C13 socket as this PDU wears it.

        The socket is a recess in a black moulding with three slots in it,
        and around the recess is the coloured retention cradle. The cradle
        is drawn as a U rather than a full frame because that is what the
        photograph shows: it wraps three sides and leaves the fourth open
        for the plug's latch.
        """
        w, h = self.C13_RECESS
        fw, fh = self.C13_FACE
        x = self.across(across)
        # The cradle first, so the moulding sits inside it.
        rack.box(g, cradle, (x, y - 0.0004, z), (w / 1000 + 0.0013, 0.0008, h / 1000 + 0.0013))
        rack.box(g, "cpi_pdu_outlet", (x, y - 0.0009, z), (w / 1000, 0.0010, h / 1000))
        # The aperture is a shallow pocket, not a hole. Drawing it in the
        # slot colour filled the whole face with black and the three pin
        # slots inside it disappeared, because they were the same colour as
        # what they were cut into. The pocket has to be the moulding colour
        # a shade back, and only the pin slots go near black.
        rack.box(g, "cpi_pdu_pocket", (x, y + 0.0010, z), (fw / 1000, 0.0044, fh / 1000))
        # Three pins: two live and neutral out at the sides, earth centred
        # and set lower, which is the C13 signature.
        for dx in (-fw * 0.30, fw * 0.30):
            rack.box(g, "cpi_pdu_slot", (x + dx / 1000, y - 0.0011, z + fh * 0.16 / 1000),
                     (fw * 0.16 / 1000, 0.0010, fh * 0.34 / 1000))
        rack.box(g, "cpi_pdu_slot", (x, y - 0.0011, z - fh * 0.20 / 1000),
                 (fw * 0.14 / 1000, 0.0010, fh * 0.30 / 1000))

    def outlet_c19(self, rack, g: str, y: float, z: float, cradle: str) -> None:
        """One C19 socket, which takes the whole 55mm width on its own.

        The slots are arranged the other way round from a C13: earth to one
        side on its own and the two current carrying slots stacked on the
        other, which is why this cannot borrow the C13 routine.
        """
        w, h = self.C19_RECESS
        fw, fh = self.C19_FACE
        x = self.across(self.C19_ACROSS)
        rack.box(g, cradle, (x, y - 0.0004, z), (h / 1000 + 0.0013, 0.0008, w / 1000 + 0.0013))
        rack.box(g, "cpi_pdu_outlet", (x, y - 0.0009, z), (h / 1000, 0.0010, w / 1000))
        rack.box(g, "cpi_pdu_pocket", (x, y + 0.0012, z), (fh / 1000, 0.0048, fw / 1000))
        rack.box(g, "cpi_pdu_slot", (x - fh * 0.26 / 1000, y - 0.0011, z),
                 (fh * 0.16 / 1000, 0.0010, fw * 0.40 / 1000))
        for dz in (-fw * 0.24, fw * 0.24):
            rack.box(g, "cpi_pdu_slot", (x + fh * 0.24 / 1000, y - 0.0011, z + dz / 1000),
                     (fh * 0.16 / 1000, 0.0010, fw * 0.26 / 1000))

    def jack(self, rack, g: str, y: float, z: float, across: float) -> None:
        """An RJ45 on the controller module.

        Eleven and a half by twelve and a half millimetres on the DISPLAY
        DETAIL, which is a real 8P8C outline rather than a square, and the
        latch notch faces the cord end on every one of the six.
        """
        x = self.across(across)
        rack.box(g, "cpi_pdu_jack", (x, y - 0.0008, z), (0.0115, 0.0010, 0.0125))
        rack.box(g, "cpi_pdu_slot", (x, y - 0.0013, z), (0.0093, 0.0010, 0.0103))
        rack.box(g, "cpi_pdu_jack", (x, y - 0.0016, z - 0.0042), (0.0034, 0.0008, 0.0030))

    def across(self, mm: float) -> float:
        """Turn a figure measured across the 55mm face into a model x."""
        return -self.width / 2 + mm / 1000.0

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z0: float) -> None:
        """The printing on the controller module.

        Only the head is textured, and that is a decision rather than a
        shortcut. The lettering on this product is all on the head: the CPI
        wordmark, the port names, the network icon. The outlet numbers are
        three millimetres tall on a bar 1.8 metres long, so a sheet that
        covered the whole bar at a resolution that could spell them would
        be twenty thousand pixels down its long axis and would still put
        each digit under two pixels on screen. The head is 177 by 55, which
        is an aspect ratio a texture can actually carry.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        z_lo, z_hi = self.HEAD_Z
        head_len = z_hi - z_lo
        W = 900
        H = round(W * head_len / 55.0)
        ppm = W / 55.0
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (176, 177, 176, 255)

        def px(a: float) -> float:
            return a * ppm

        def sized(mm_cap: float, bold: bool = False):
            return font(max(7, round(mm_cap / 0.729 * ppm)), bold)

        def label(text, cx, cy, f, fill=ink):
            b = d.textbbox((0, 0), text, font=f)
            d.text((cx - (b[2] - b[0]) / 2, cy - (b[3] - b[1]) / 2 - b[1]),
                   text, font=f, fill=fill)

        f_name, f_tiny = sized(2.4, True), sized(1.5)
        label("CHATSWORTH PRODUCTS", px(30.0), px(7.5), f_name)
        label("eConnect Controller 4", px(27.5), px(15.1), f_tiny)
        for name, ax in zip(("Aux2", "Aux1"), self.HEAD_AUX[0]):
            label(name, px(ax), px(self.HEAD_AUX[1] + 8.4), f_tiny)
        label("Reset", px(self.HEAD_RESET[0]), px(self.HEAD_RESET[1] + 4.0), f_tiny)
        for i, name in enumerate(("OK", "Warning", "Critical")):
            label(name, px(self.HEAD_LEDS[0] + 5.0), px(self.HEAD_LEDS[1] + i * 3.2), f_tiny)
        label("Console 2", px(self.HEAD_USBC[0] + 1.0), px(self.HEAD_USBC[1] + 3.6), f_tiny)
        label("10/100/1000", px(6.6), px(120.0), f_tiny)
        label("Console 1", px(self.HEAD_JACK_X[1]), px(self.HEAD_ROW_B + 8.6), f_tiny)
        label("Secure Array", px(23.0), px(self.HEAD_ROW_C + 8.6), f_tiny)
        for name, ax in zip(("In", "Out"), self.HEAD_ARRAY_X):
            label(name, px(ax - 6.4), px(self.HEAD_ROW_C), f_tiny)

        tex = save_texture("cpi_econnect_silkscreen.png", img)
        rack.materials["cpi_pdu_silktex"] = PBRMaterial(
            name="eConnect Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.70,
            alphaMode="BLEND", doubleSided=True,
        )
        rack.textured_plane(
            self.slug, "cpi_pdu_silktex",
            (0, self.face(rack) - 0.0012, z0 + (self.LENGTH / 2 - (z_lo + z_hi) / 2) / 1000),
            self.width, head_len / 1000.0)

    # ----------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        w = self.width
        top = z + self.height / 2

        def Z(from_cord_end: float) -> float:
            """Model z from a figure measured along the drawing.

            The elevation is drawn lying down with the cord at the left. In
            a cabinet the cord end is at the top, so the drawing's left to
            right runs top to bottom here.
            """
            return top - from_cord_end / 1000.0

        # ---- the extrusion --------------------------------------------
        rack.rounded_prism(g, "cpi_pdu_body", (0, rack.front_y + self.depth / 2 - 0.0002, z),
                           (w, self.depth, self.height),
                           radius=0.0030, bevel=0.0012, steps=8)
        # The two long edges of the face catch a highlight the flat does
        # not, and without them a 1.8m bar reads as a printed stripe.
        for sx in (-1, 1):
            rack.box(g, "cpi_pdu_edge", (sx * (w / 2 - 0.0016), y - 0.0002, z),
                     (0.0026, 0.0008, self.height - 0.006))
        for sz in (1, -1):
            rack.box(g, "cpi_pdu_endcap", (0, y + 0.010, z + sz * (self.height / 2 - 0.004)),
                     (w - 0.003, 0.030, 0.0070))

        # ---- cord gland and the rating plate ---------------------------
        rack.front_cylinder(g, "cpi_pdu_endcap", (0, y - 0.0016, Z(self.GLAND_Z)),
                            self.GLAND_D / 2000.0, 0.0018, 24)
        rack.front_cylinder(g, "cpi_pdu_slot", (0, y - 0.0022, Z(self.GLAND_Z)),
                            self.GLAND_D / 2800.0, 0.0010, 20)
        pw, ph = self.PLATE
        rack.box(g, "cpi_pdu_label", (0, y - 0.0005, Z(self.PLATE_Z)),
                 (ph / 1000, 0.0008, pw / 1000))

        # ---- six two pole breakers -------------------------------------
        bw, bh = self.BREAKER
        lo, hi = self.BREAKER_ACROSS
        bx = self.across((lo + hi) / 2)
        for i, bz in enumerate(self.BREAKER_Z):
            rack.box(g, "cpi_pdu_breaker", (bx, y - 0.0008, Z(bz)),
                     ((hi - lo) / 1000, 0.0010, bw / 1000))
            # The rocker itself, half the body, and the little label plate
            # that carries CB1 to CB6 above it on the drawing.
            rack.box(g, "cpi_pdu_rocker", (bx + 0.0035, y - 0.0014, Z(bz)),
                     (0.0075, 0.0010, bw * 0.62 / 1000))
            rack.box(g, "cpi_pdu_label", (bx, y - 0.0005, Z(bz - bw * 0.86)),
                     (0.0125, 0.0007, 0.0060))

        # ---- the outlet field ------------------------------------------
        # Colour runs white, blue, green by phase, and the cycle carries
        # straight through the C19 group rather than restarting, which is
        # what the photograph shows.
        cradles = ("cpi_pdu_cradle_w", "cpi_pdu_cradle_b", "cpi_pdu_cradle_g")
        n = 0
        events = sorted([(cz, "c13") for cz in self.C13_Z]
                        + [(cz, "c19") for cz in self.C19_Z])
        bw13, bh13 = self.C13_BLOCK
        for pos, kind in events:
            if kind == "c13":
                # The moulding both outlets share, then the two faces.
                rack.box(g, "cpi_pdu_outlet", (0, y + 0.0004, Z(pos)),
                         (bh13 / 1000, 0.0016, bw13 / 1000))
                for row in self.C13_ROWS:
                    self.outlet_c13(rack, g, y, Z(pos), row, cradles[n % 3])
                    # The numbered label plate above each outlet, in the
                    # same colour as its cradle.
                    rack.box(g, cradles[n % 3],
                             (self.across(row), y - 0.0004, Z(pos - bw13 * 0.42)),
                             (0.0090, 0.0007, 0.0026))
                    n += 1
            else:
                self.outlet_c19(rack, g, y, Z(pos), cradles[n % 3])
                rack.box(g, cradles[n % 3], (self.across(self.C19_ACROSS), y - 0.0004,
                                             Z(pos - self.C19_RECESS[0] * 0.62)),
                         (0.0090, 0.0007, 0.0026))
                n += 1

        # ---- the controller module -------------------------------------
        z_lo, z_hi = self.HEAD_Z
        head_len = (z_hi - z_lo) / 1000.0
        head_c = Z((z_lo + z_hi) / 2)
        rack.rounded_prism(g, "cpi_pdu_head", (0, y + 0.0010, head_c),
                           (w - 0.0016, 0.0034, head_len),
                           radius=0.0020, bevel=0.0006, steps=6)

        def HZ(mm_from_head_top: float) -> float:
            return Z(z_lo + mm_from_head_top)

        lw, lh = self.HEAD_LCD
        lcd_c = HZ(self.HEAD_LCD_TOP + lh / 2)
        rack.box(g, "cpi_pdu_lcd_bezel", (0, y - 0.0008, lcd_c),
                 (lw / 1000 + 0.0026, 0.0010, lh / 1000 + 0.0026))
        rack.box(g, "cpi_pdu_lcd", (0, y - 0.0012, lcd_c), (lw / 1000, 0.0009, lh / 1000))

        for ax in self.HEAD_AUX[0]:
            self.jack(rack, g, y, HZ(self.HEAD_AUX[1]), ax)
        rack.front_cylinder(g, "cpi_pdu_slot",
                            (self.across(self.HEAD_RESET[0]), y - 0.0010,
                             HZ(self.HEAD_RESET[1])), 0.0008, 0.0012, 12)
        for i in range(3):
            rack.front_cylinder(g, "cpi_pdu_led",
                                (self.across(self.HEAD_LEDS[0]), y - 0.0012,
                                 HZ(self.HEAD_LEDS[1] + i * 3.2)), 0.0009, 0.0008, 12)
        rack.rounded_prism(g, "cpi_pdu_jack",
                           (self.across(self.HEAD_USBC[0]), y - 0.0010, HZ(self.HEAD_USBC[1])),
                           (0.0030, 0.0010, 0.0086), radius=0.0014, bevel=0.0003, steps=8)

        bxs, bz_mm, bd = self.HEAD_BUTTONS
        for bx_mm in bxs:
            rack.front_cylinder(g, "cpi_pdu_button",
                                (self.across(bx_mm), y - 0.0016, HZ(bz_mm)),
                                bd / 2000.0, 0.0018, 20)
        for ax in self.HEAD_JACK_X:
            self.jack(rack, g, y, HZ(self.HEAD_ROW_B), ax)
        for ax in self.HEAD_ARRAY_X:
            self.jack(rack, g, y, HZ(self.HEAD_ROW_C), ax)
        for row in (self.HEAD_ROW_B, self.HEAD_ROW_C):
            rack.box(g, "cpi_pdu_jack", (self.across(self.HEAD_USB_X), y - 0.0008, HZ(row)),
                     (0.0055, 0.0010, 0.0130))
            rack.box(g, "cpi_pdu_usb", (self.across(self.HEAD_USB_X), y - 0.0013, HZ(row)),
                     (0.0032, 0.0009, 0.0088))
        bx_mm, bz_mm, bdia = self.HEAD_BOSS
        rack.front_cylinder(g, "cpi_pdu_button_ring",
                            (self.across(bx_mm), y - 0.0012, HZ(bz_mm)),
                            bdia / 2000.0, 0.0014, 22)

        # ---- the two tool-less mounting buttons on the back ------------
        bh_w, bh_p = self.BUTTON
        back = rack.front_y + self.depth
        for end, sign in ((self.BUTTON_INSET, 1), (self.BUTTON_INSET + self.BUTTON_SPAN, 1)):
            rack.front_cylinder(g, "cpi_pdu_endcap", (0, back + bh_p / 2000.0, Z(end)),
                                bh_w / 2000.0, bh_p / 1000.0, 18)

        self.silkscreen(rack, z)
