"""Dell PowerEdge R660, 10 x 2.5 inch SFF, from Dell's own service manual.

A 1U opening is about 34mm of usable height and a 2.5 inch drive is 69.85mm
across its short face, so the drive cannot stand on edge the way it does in
the 2U R760. It lies flat instead, and the ten bays come out as two rows of
five landscape carriers rather than one row of ten portrait ones. That one
consequence of the rack unit is the whole difference between the front of
this machine and the front of a 2U, and it is why none of the geometry here
is shared with the R760 file: the carrier is a different moulding, 82.9 by
16.2mm on the pitch against 17.8 by 69.4, with the latch out at one end
instead of up at one edge.

Working across a single carrier, left to right, from the manual's figure:

  Two small green lenses stacked at the far left, activity above and status
  below, then a shadow groove, then the release button plate with a copper
  ring in it. Then the long body of the carrier: a honeycomb vent field
  taking up most of the length, and a plain plate at the right hand end
  where the drive label goes. A bright edge runs along the carrier's top
  and bottom, which on the 2U runs up its sides, because it is the same
  detail on a moulding turned through ninety degrees.

Across the machine: the left ear carries the pull latch, the five service
icons and the blue system ID pipe; a punched vent strip runs above the top
row of bays; the VGA sits on the casting just right of the last bay; and
the right ear carries the power button, a USB-A and the iDRAC Direct micro
USB above its own pull latch.

Everything below was measured off the Installation and Service Manual's
"front view of 10 x 2.5 inch drive system", which is orthographic and
labelled, and cross checked against Dell's marketing render for finish.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import Device, Reference


class PowerEdgeR660(Device):
    slug = "R660"
    name = "Dell PowerEdge R660"
    u = 1
    #: 42.8mm tall, 434.0mm across the body without the rack latches. The
    #: depth is Dell's ear to rear wall figure for this chassis family; the
    #: R660 is the 1U member of the same platform as the R760.
    width = 0.434
    depth = 0.7007
    source = "https://www.dell.com/support/manuals/en-us/poweredge-r660/r660_ism_pub/front-view-of-the-system"
    references = [
        Reference("https://www.skywardtel.com/wp-content/uploads/2023/06/06291.png",
                  "the service manual's labelled front view of the 10 x 2.5 inch "
                  "system, orthographic, 1097x274; every figure below came off this"),
        Reference("https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/"
                  "dell-enterprise-products/enterprise-systems/poweredge/r660/media-gallery/"
                  "server-poweredge-r660-black-gallery-2.psd?fmt=png-alpha&wid=2400",
                  "Dell's front elevation at 2400x288, bezel fitted, for finish "
                  "and for the copper of the release ring"),
        Reference("https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/"
                  "dell-enterprise-products/enterprise-systems/poweredge/r660/media-gallery/"
                  "server-poweredge-r660-black-gallery-1.psd?fmt=png-alpha&wid=2400",
                  "front three quarter, for the lid overhang and ear profile"),
    ]

    # -------------------------------------------------------------- measured
    #
    # The manual figure puts the chassis in 1057 pixels across the ears and
    # 94 pixels tall. A 19 inch face is 482.6mm, so a pixel is 0.4566mm, and
    # 94 of them is 42.9mm against Dell's published 42.8mm chassis height.
    # A tenth of a millimetre out over a rack unit, so the figure really is
    # orthographic and everything below is a measurement.
    #
    # Horizontal figures are metres from the left edge of the 482.6mm face,
    # which is where the ears start and therefore where the status strip and
    # the KVM cluster have to be measured from. Vertical figures are
    # fractions of panel height with zero at the middle, (128 - y) / 94.

    FACE_W = 0.4826
    #: (482.6 - 434) / 2, and on this machine the ears carry real hardware.
    EAR = 0.0243

    #: Five columns, two rows. Release rings sit 181.6 pixels apart, which
    #: is 82.92mm, and five of those is 414.6mm inside a 434mm body.
    BAY_COLS, BAY_ROWS = 5, 2
    COL_PITCH = 0.08292
    #: Centre of the first carrier, pixels 91.4 to 264.
    COL_X0 = 0.07290
    CARRIER_W = 0.07880
    #: Row centres, pixels 114 and 149.5, and the carrier is 32 pixels or
    #: 14.6mm deep, which is a 15mm drive plus its shell.
    ROW_Z = (0.1489, -0.2287)
    CARRIER_H = 0.3404

    #: Everything inside a carrier, as metres from the carrier's own centre.
    #: The two lenses are stacked rather than side by side, because this is
    #: the 2U carrier's face turned through a right angle.
    LED_DX = -0.03660
    LED_DZ = 0.25                              # fraction of the carrier depth
    LED = (0.0018, 0.0018)
    PLATE_DX = -0.02820
    PLATE_W = 0.00840
    PLATE_H = 0.78                             # fraction of the carrier depth
    RING_DX = -0.02790
    RING_R = 0.00297
    #: Vent field, pixels 143 to 214 of a carrier centred on 177.7.
    VENT_X = (-0.01580, 0.01660)
    #: The drive label plate at the far end, pixels 219 to 262.
    LABEL_X = (0.01890, 0.03850)
    #: The bright edge along the top and bottom of the moulding, 3 pixels.
    EDGE_H = 0.0014

    #: The punched vent strip above the top row, pixels 85 to 97.
    TOPVENT_Z = (0.4574, 0.3298)

    #: Left ear: pull latch, then the five service icons, then the ID pipe.
    STRIP_X = (0.0142, 0.0260)
    ICON_X = 0.0172
    PIPE_X = 0.0232
    PIPE_Z = (0.3400, -0.1300)
    PIPE_BLUE_Z = (0.3400, 0.1000)

    #: Right hand end. The VGA is on the casting, everything else is on the
    #: ear: pixels 985 to 1006 for the VGA, 1017 to 1038 for the power cap.
    VGA_X, VGA_Z, VGA = 0.4463, 0.0000, (0.0096, 0.0183)
    PWR_X, PWR_Z, PWR = 0.4614, 0.3404, (0.0096, 0.0073)
    USB_X, USB_Z, USB = 0.4612, 0.0426, (0.0073, 0.0146)
    IDRAC_X, IDRAC_Z, IDRAC = 0.4616, -0.2872, (0.0055, 0.0073)

    #: The pull latches, one per ear, and the express service tag that
    #: slides out under the bottom row of bays.
    LATCH_W = 0.0125
    TAG_X, TAG_Z, TAG_W = 0.4140, -0.4400, 0.0590

    def face(self, rack) -> float:
        """The plane the carriers stand in, 5.3mm proud of `front_y`.

        `front_y` is the middle of the panel slab. Measure surface detail
        from it and a 1mm recess ends up inside the sheet metal, which is
        how the first device modelled in this library came out as a blank
        slab with two smudges on it.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This machine's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # The front casting. Dell's graphite is not neutral: there is a
            # few points more blue in it than green, and the difference is
            # what stops a rack of these reading as photographic grey card.
            "r660_cast": pbr("R660 Casting", [56, 58, 62, 255], 0.20, 0.64),
            "r660_cast_lit": pbr("R660 Casting Edge", [82, 85, 90, 255], 0.20, 0.58),
            "r660_shadow": pbr("R660 Shadow", [24, 25, 27, 255], 0.14, 0.70),
            # The ear is a coarser paint than the casting and comes out a
            # touch lighter under the same light, sampled at 82 on the
            # manual figure and 74 on a real machine.
            "r660_ear": pbr("R660 Ear", [78, 78, 80, 255], 0.18, 0.72),
            "r660_lid": pbr("R660 Lid", [201, 202, 203, 255], 0.60, 0.34),
            # Carrier face at 70 of 255, read across the flat between the
            # button plate and the vent where nothing else interferes.
            "r660_carrier": pbr("R660 Carrier", [70, 70, 71, 255], 0.16, 0.68),
            "r660_plate": pbr("R660 Button Plate", [66, 66, 67, 255], 0.16, 0.66),
            "r660_vent": pbr("R660 Vent", [9, 9, 10, 255], 0.0, 0.92),
            "r660_web": pbr("R660 Vent Web", [38, 38, 39, 255], 0.10, 0.78),
            "r660_label": pbr("R660 Drive Label", [76, 76, 77, 255], 0.06, 0.80),
            "r660_gap": pbr("R660 Bay Gap", [6, 6, 9, 255], 0.0, 0.90),
            # The bright edge along the moulding. Chromed plastic: bright,
            # but not the mirror a high metallic would make of it.
            "r660_edge": pbr("R660 Carrier Edge", [176, 177, 178, 255], 0.24, 0.46),
            # Release ring. Sampled at 200,125,73 off Dell's render, which is
            # a warm copper rather than the safety orange it looks like at
            # thumbnail size.
            "r660_ring": pbr("R660 Release Ring", [196, 116, 62, 255], 0.22, 0.44),
            "r660_bore": pbr("R660 Ring Bore", [32, 32, 33, 255], 0.0, 0.86),
            # Drive lenses. Sampled at 24,132,75, and left barely emissive:
            # most of the drives in a rack are idle most of the time.
            "r660_led": pbr("R660 Drive LED", [30, 122, 72, 255], 0.0, 0.34,
                            emissive=[0.015, 0.08, 0.035]),
            "r660_strip": pbr("R660 Status Strip", [30, 30, 31, 255], 0.10, 0.72),
            "r660_pipe_blue": pbr("R660 ID Pipe", [34, 116, 214, 255], 0.0, 0.24,
                                  emissive=[0.06, 0.27, 0.62]),
            "r660_pipe_pale": pbr("R660 Health Pipe", [208, 210, 214, 255], 0.0, 0.36),
            "r660_pwr": pbr("R660 Power Ring", [70, 158, 100, 255], 0.0, 0.30,
                            emissive=[0.08, 0.26, 0.13]),
            "r660_pwr_cap": pbr("R660 Power Cap", [46, 47, 49, 255], 0.14, 0.60),
            "r660_shell": pbr("R660 Connector Shell", [186, 187, 188, 255], 0.52, 0.36),
            "r660_bore_dark": pbr("R660 Connector Bore", [11, 11, 12, 255], 0.0, 0.90),
            "r660_tag": pbr("R660 Service Tag", [34, 35, 37, 255], 0.10, 0.72),
            "r660_tag_blue": pbr("R660 Tag Stripe", [46, 132, 208, 255], 0.0, 0.40),
        })

    # ----------------------------------------------------------------- parts
    #
    # There is no hole in the casting, so every recess has to be drawn a
    # fraction of a millimetre proud of the surface it is sunk into or the
    # surface wins the depth test and the detail disappears. `over` below is
    # therefore a stacking order and not a depth model. It only has to rise
    # monotonically from the casting out toward the camera.

    #: How far a fitted carrier stands out of the cage.
    CARRIER_PROUD = 0.0021

    def sled(self, rack, g: str, x: float, z: float, populated: bool) -> None:
        """One landscape 2.5 inch carrier, the 1U moulding.

        `populated` drops the ring and the two lenses for the blank filler
        Dell ships in an unused bay. A machine with all ten bays lit is a
        stock photograph; a real one usually has two.
        """
        y = self.face(rack)
        h = self.height
        p = self.CARRIER_PROUD
        ch = self.CARRIER_H * h

        def slab(mat, cx, cz, w, hh, over, thick=0.0010):
            rack.box(g, mat, (cx, y - p - over + thick / 2, cz), (w, thick, hh))

        # The bay gap behind, so the two rows read as slots in a casting.
        rack.box(g, "r660_gap", (x, y - 0.0005, z), (self.COL_PITCH, 0.0008, ch + 0.0016))
        rack.rounded_prism(g, "r660_carrier", (x, y - p + 0.0011, z),
                           (self.CARRIER_W, 0.0022, ch), radius=0.0005, bevel=0.0003, steps=4)

        # The bright edge along the top and bottom of the moulding. On the
        # 2U this same detail runs up the sides; here it runs along, and
        # getting that wrong is the quickest way to make a 1U look like a
        # squashed 2U.
        for dz in (ch / 2 - self.EDGE_H / 2, -ch / 2 + self.EDGE_H / 2):
            slab("r660_edge", x, z + dz, self.CARRIER_W * 0.995, self.EDGE_H, 0.0005, 0.0008)

        # ---- the two lenses, stacked, at the outboard end
        if populated:
            for dz in (self.LED_DZ * ch, -self.LED_DZ * ch):
                slab("r660_led", x + self.LED_DX, z + dz, self.LED[0], self.LED[1], 0.0005, 0.0006)

        # ---- release button plate, in its own shadow groove
        pw = self.PLATE_W
        ph = self.PLATE_H * ch
        slab("r660_gap", x + self.PLATE_DX, z, pw + 0.0026, ph + 0.0010, 0.0001)
        rack.rounded_prism(g, "r660_plate", (x + self.PLATE_DX, y - p - 0.0002 + 0.0006, z),
                           (pw, 0.0012, ph), radius=0.0007, bevel=0.0003, steps=4)
        if populated:
            # A ring with a dark bore, not a disc. Two coplanar cylinders
            # fight over the depth buffer and the orange one wins, which
            # turns every bay into a warning lamp.
            rack.front_cylinder(g, "r660_bore", (x + self.RING_DX, y - p - 0.0004, z),
                                self.RING_R * 0.72, 0.0008, 16)
            rack.torus_front(g, "r660_ring", (x + self.RING_DX, y - p - 0.0006, z),
                             self.RING_R * 0.78, self.RING_R * 0.24, 20, 6)

        # ---- honeycomb vent, running the length of the carrier
        vx0, vx1 = self.VENT_X
        vcx, vw = x + (vx0 + vx1) / 2, vx1 - vx0
        vh = ch * 0.72
        slab("r660_vent", vcx, z, vw, vh, 0.0002, 0.0013)
        # A landscape field wants columns of cells, not courses of them, so
        # the web is walked along the length with the crossbars staggered.
        cols = 16
        for i in range(cols + 1):
            slab("r660_web", vcx + vw * (i / cols - 0.5), z, 0.00040, vh, 0.0004, 0.0006)
        for i in range(cols):
            cx = vcx + vw * ((i + 0.5) / cols - 0.5)
            for dz in ((0.0,) if i % 2 == 0 else (-vh * 0.25, vh * 0.25)):
                slab("r660_web", cx, z + dz, vw / cols, 0.00040, 0.0004, 0.0006)

        # ---- the label plate at the inboard end
        lx0, lx1 = self.LABEL_X
        slab("r660_label", x + (lx0 + lx1) / 2, z, lx1 - lx0, ch * 0.66, 0.0002)

    def ear(self, rack, g: str, z: float, x0: float, x1: float, latch_at: float) -> None:
        """One rack ear with its pull latch.

        `latch_at` is the latch's centre in the same coordinates as `x0` and
        `x1`, because the latch is not centred on the ear: on the left it
        sits outboard of the status strip and on the right outboard of the
        power and USB stack, and centring it buried both of them.
        """
        y = self.face(rack)
        h = self.height
        rack.rounded_prism(g, "r660_ear", ((x0 + x1) / 2, y + 0.0044, z), (x1 - x0, 0.0100, h),
                           radius=0.0009, bevel=0.0005, steps=5)
        rack.rounded_prism(g, "r660_shadow", (latch_at, y - 0.0013, z),
                           (self.LATCH_W, 0.0012, h * 0.74), radius=0.0016, bevel=0.0004, steps=6)

    def dsub(self, rack, g: str, x: float, z: float, w: float, hgt: float) -> None:
        """The VGA, which on a 1U has to stand on its end to fit."""
        y = self.face(rack)
        rack.rounded_prism(g, "r660_shell", (x, y - 0.0018, z), (w, 0.0012, hgt),
                           radius=0.0022, bevel=0.0004, steps=8)
        rack.rounded_prism(g, "r660_bore_dark", (x, y - 0.0023, z), (w - 0.0024, 0.0012, hgt - 0.0024),
                           radius=0.0017, bevel=0.0003, steps=8)
        # Fifteen pins, three columns of five, which is what makes the hole
        # read as a connector rather than as a slot.
        for col in range(3):
            for row in range(5):
                rack.box(g, "r660_shell",
                         (x + (col - 1) * w * 0.20, y - 0.0027, z + (row - 2) * hgt * 0.155),
                         (0.0007, 0.0006, 0.0007))

    def usb(self, rack, g: str, x: float, z: float, w: float, hgt: float) -> None:
        """The one USB-A on the right ear, portrait."""
        y = self.face(rack)
        rack.box(g, "r660_shell", (x, y - 0.0018, z), (w, 0.0010, hgt))
        rack.box(g, "r660_bore_dark", (x, y - 0.0022, z), (w - 0.0013, 0.0010, hgt - 0.0013))
        rack.box(g, "r660_shell", (x + w * 0.15, y - 0.0025, z), (w * 0.34, 0.0006, hgt - 0.0028))

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """The ear markings and the bay numbers, as one transparent overlay.

        A PowerEdge front is almost unlettered, which is the whole look of
        it, but the left ear carries five service icons, the right ear the
        port symbols, and the casting between the two rows of bays carries
        the bay numbers. None of those can be extruded: geometry cannot
        spell and it cannot draw a thermometer either.

        The sheet spans the full 482.6mm face rather than the 434mm body,
        because on this machine every mark worth printing is on an ear.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 3072
        H = round(W * self.height / self.FACE_W)
        ppm = W / self.FACE_W
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (194, 195, 196, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        r = 1.4 / 1000 * ppm                       # service icons, 2.8mm

        def box(cx, cy, w, hh, width=2):
            d.rectangle([cx - w, cy - hh, cx + w, cy + hh], outline=ink, width=width)

        # ---- left ear: drive, temperature, electrical, memory, network,
        #      in the order Dell prints them and iDRAC reports them.
        ix = px(self.ICON_X)
        for k, name in enumerate(("drive", "temp", "power", "memory", "network")):
            cy = py(0.310 - k * 0.148)
            if name == "drive":
                d.ellipse([ix - r, cy - r * 0.8, ix + r, cy - r * 0.2], outline=ink, width=2)
                d.line([(ix - r, cy - r * 0.5), (ix - r, cy + r * 0.3)], fill=ink, width=2)
                d.line([(ix + r, cy - r * 0.5), (ix + r, cy + r * 0.3)], fill=ink, width=2)
                d.arc([ix - r, cy - r * 0.1, ix + r, cy + r * 0.7], 0, 180, fill=ink, width=2)
            elif name == "temp":
                d.line([(ix, cy - r), (ix, cy + r * 0.25)], fill=ink, width=3)
                d.ellipse([ix - r * 0.55, cy + r * 0.15, ix + r * 0.55, cy + r], outline=ink, width=2)
            elif name == "power":
                box(ix, cy, r * 0.8, r * 0.9)
                d.line([(ix + r * 0.25, cy - r * 0.55), (ix - r * 0.15, cy + r * 0.05),
                        (ix + r * 0.15, cy + r * 0.05), (ix - r * 0.25, cy + r * 0.6)],
                      fill=ink, width=2)
            elif name == "memory":
                for j in range(3):
                    dy = (j - 1) * r * 0.5
                    d.line([(ix - r, cy + dy + r * 0.22), (ix, cy + dy - r * 0.22),
                            (ix + r, cy + dy + r * 0.22)], fill=ink, width=2)
            else:
                box(ix, cy - r * 0.25, r * 0.9, r * 0.5)
                d.line([(ix, cy + r * 0.25), (ix, cy + r * 0.7)], fill=ink, width=2)
                d.line([(ix - r * 0.7, cy + r * 0.75), (ix + r * 0.7, cy + r * 0.75)], fill=ink, width=3)

        f_i = font(max(10, round(3.2 / 1000 * ppm / 0.729)), True)
        b = d.textbbox((0, 0), "i", font=f_i)
        d.text((px(self.PIPE_X) - (b[2] - b[0]) / 2, py(0.418) - (b[3] - b[1]) / 2 - b[1]),
               "i", font=f_i, fill=ink)

        # ---- bay numbers on the casting between the two columns. Dell
        #      numbers a two row cage down the column, so the left column is
        #      0 and 1, the next 2 and 3, and so on to 9.
        f_bay = font(max(8, round(2.1 / 1000 * ppm / 0.729)))
        for col in range(self.BAY_COLS):
            cx = px(self.COL_X0 + col * self.COL_PITCH - self.CARRIER_W / 2 - 0.0028)
            for row, frac in enumerate(self.ROW_Z):
                s = str(col * 2 + row)
                bb = d.textbbox((0, 0), s, font=f_bay)
                d.text((cx - (bb[2] - bb[0]) / 2, py(frac) - (bb[3] - bb[1]) / 2 - bb[1]),
                       s, font=f_bay, fill=(146, 147, 148, 255))

        # ---- right ear: USB trident and the iDRAC wrench, printed beside
        #      their sockets rather than above them, which is all the room a
        #      1U ear leaves.
        ux, uy = px(self.USB_X + 0.0072), py(self.USB_Z)
        d.line([(ux - r * 1.0, uy), (ux + r * 0.9, uy)], fill=ink, width=2)
        d.ellipse([ux - r * 1.3, uy - r * 0.26, ux - r * 0.8, uy + r * 0.26], fill=ink)
        d.line([(ux + r * 0.9, uy), (ux + r * 0.35, uy - r * 0.45)], fill=ink, width=2)
        d.line([(ux + r * 0.3, uy), (ux - r * 0.2, uy + r * 0.45)], fill=ink, width=2)

        wx, wy = px(self.IDRAC_X + 0.0068), py(self.IDRAC_Z)
        d.line([(wx - r * 0.7, wy + r * 0.55), (wx + r * 0.45, wy - r * 0.45)], fill=ink, width=3)
        d.ellipse([wx + r * 0.15, wy - r * 0.9, wx + r * 0.95, wy - r * 0.1], outline=ink, width=3)

        vx, vy = px(self.VGA_X), py(0.430)
        d.line([(vx - r * 0.9, vy - r * 0.45), (vx - r * 0.9, vy + r * 0.45)], fill=ink, width=3)
        d.line([(vx + r * 0.9, vy - r * 0.45), (vx + r * 0.9, vy + r * 0.45)], fill=ink, width=3)
        box(vx, vy, r * 0.42, r * 0.45)

        # The model, printed on the express service tag.
        f_badge = font(max(8, round(2.3 / 1000 * ppm / 0.729)), True)
        bb = d.textbbox((0, 0), "R660", font=f_badge)
        d.text((px(self.TAG_X) - (bb[2] - bb[0]) / 2 - 0.010 * ppm,
                py(self.TAG_Z) - (bb[3] - bb[1]) / 2 - bb[1]),
               "R660", font=f_badge, fill=(142, 143, 144, 255))

        tex = save_texture("r660_silkscreen.png", img)
        rack.materials["r660_silktex"] = PBRMaterial(
            name="R660 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        # 1.8mm proud: in front of the ear plates and the status strip so
        # the icons print on them, behind the carriers and the connector
        # shells so it never lies across a socket.
        rack.textured_plane(self.slug, "r660_silktex",
                            (0, self.face(rack) - 0.0018, z), self.FACE_W, self.height)

    # ----------------------------------------------------------------- build

    def build(self, rack, z: float, filled: int | None = None) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h = self.height
        w = self.width
        total = self.BAY_COLS * self.BAY_ROWS
        filled = total if filled is None else filled

        def X(from_left: float) -> float:
            """Panel coordinate from a measurement off the manual figure.

            Metres from the left edge of the 482.6mm face, which is where
            every horizontal figure in this file was measured from.
            """
            return -self.FACE_W / 2 + from_left

        def Z(frac: float) -> float:
            return z + frac * h

        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.008, self.depth, h * 0.92))
        rack.rounded_prism(g, "r660_cast", (0, rack.front_y, z), (w, 0.0106, h),
                           radius=0.0011, bevel=0.0006, steps=6)
        rack.box(g, "r660_lid", (0, y + 0.0090, z + h * 0.480), (w + 0.0016, 0.020, 0.0022))
        rack.box(g, "r660_cast_lit", (0, y - 0.0004, z + h * 0.452), (w - 0.004, 0.0008, 0.0012))
        rack.box(g, "r660_shadow", (0, y - 0.0004, z - h * 0.472), (w - 0.004, 0.0008, 0.0018))

        # The punched vent strip that runs above the top row of bays. It is
        # 5.9mm of the 42.8mm face, which is why the drive field on this
        # machine sits visibly low rather than centred.
        tv0, tv1 = self.TOPVENT_Z
        field_l = self.COL_X0 - self.CARRIER_W / 2 - 0.0032
        field_r = self.COL_X0 + (self.BAY_COLS - 1) * self.COL_PITCH + self.CARRIER_W / 2 + 0.0032
        tvz = z + (tv0 + tv1) / 2 * h
        # Light webs on a dark ground, not the other way round. The first
        # pass painted the strip in shadow grey and the slots in vent black,
        # two values four points apart, and 46 louvres came out as one flat
        # band nobody could see at any distance.
        rack.box(g, "r660_vent", (X((field_l + field_r) / 2), y - 0.0004, tvz),
                 ((field_r - field_l), 0.0010, (tv0 - tv1) * h))
        for i in range(47):
            vx = field_l + 0.0030 + i * (field_r - field_l - 0.0060) / 46
            rack.box(g, "r660_cast_lit", (X(vx), y - 0.0008, tvz),
                     (0.0016, 0.0008, (tv0 - tv1) * h * 0.70))

        # The cage aperture the ten carriers sit in.
        top = self.ROW_Z[0] + self.CARRIER_H / 2
        bot = self.ROW_Z[1] - self.CARRIER_H / 2
        rack.box(g, "r660_shadow", (X((field_l + field_r) / 2), y - 0.0002,
                                    z + (top + bot) / 2 * h),
                 ((field_r - field_l), 0.0008, (top - bot) * h + 0.0022))

        for col in range(self.BAY_COLS):
            for row, frac in enumerate(self.ROW_Z):
                self.sled(rack, g, X(self.COL_X0 + col * self.COL_PITCH), Z(frac),
                          populated=(col * 2 + row) < filled)

        # ---- left ear ---------------------------------------------------
        self.ear(rack, g, z, X(0.0), X(self.EAR), X(0.0071))
        sx0, sx1 = self.STRIP_X
        rack.box(g, "r660_strip", (X((sx0 + sx1) / 2), y - 0.0010, z),
                 (sx1 - sx0, 0.0012, h * 0.86))
        pt, pb = self.PIPE_Z
        bt, bb = self.PIPE_BLUE_Z
        rack.box(g, "r660_pipe_pale", (X(self.PIPE_X), y - 0.0023, z + (pt + pb) / 2 * h),
                 (0.0024, 0.0008, (pt - pb) * h))
        rack.box(g, "r660_pipe_blue", (X(self.PIPE_X), y - 0.0025, z + (bt + bb) / 2 * h),
                 (0.0024, 0.0008, (bt - bb) * h))

        # ---- VGA on the casting, then the right ear ---------------------
        self.dsub(rack, g, X(self.VGA_X), Z(self.VGA_Z), *self.VGA)
        self.ear(rack, g, z, X(self.FACE_W - self.EAR), X(self.FACE_W), X(0.4753))

        pw, ph = self.PWR
        rack.rounded_prism(g, "r660_pwr_cap", (X(self.PWR_X), y - 0.0018, Z(self.PWR_Z)),
                           (pw, 0.0012, ph), radius=0.0008, bevel=0.0004, steps=5)
        rack.torus_front(g, "r660_pwr", (X(self.PWR_X), y - 0.0026, Z(self.PWR_Z)),
                         0.0024, 0.0004, 20, 6)
        rack.box(g, "r660_pwr", (X(self.PWR_X), y - 0.0027, Z(self.PWR_Z + 0.028)),
                 (0.0006, 0.0004, 0.0022))

        self.usb(rack, g, X(self.USB_X), Z(self.USB_Z), *self.USB)
        iw, ih = self.IDRAC
        rack.rounded_prism(g, "r660_shell", (X(self.IDRAC_X), y - 0.0018, Z(self.IDRAC_Z)),
                           (iw, 0.0010, ih), radius=0.0008, bevel=0.0003, steps=6)
        rack.box(g, "r660_bore_dark", (X(self.IDRAC_X), y - 0.0022, Z(self.IDRAC_Z)),
                 (iw - 0.0014, 0.0008, ih - 0.0022))

        # The express service tag, the one pull out card on the front.
        rack.box(g, "r660_tag", (X(self.TAG_X), y - 0.0006, Z(self.TAG_Z)),
                 (self.TAG_W, 0.0012, 0.0038))
        rack.box(g, "r660_tag_blue", (X(self.TAG_X + self.TAG_W / 2 - 0.0070), y - 0.0010,
                                      Z(self.TAG_Z)), (0.0086, 0.0008, 0.0010))

        self.silkscreen(rack, z)
