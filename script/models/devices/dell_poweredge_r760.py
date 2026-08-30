"""Dell PowerEdge R760, 24 x 2.5 inch SFF, drawn from Dell's front elevation.

Twenty four drive carriers standing on edge in one row is the whole face of
this machine. There is a status strip on the left ear and a power button,
USB, iDRAC micro-USB and VGA on the right ear, and between those two narrow
flanges there is nothing but carriers. So the carrier is the model: get one
right and repeat it, and the server is finished.

What the photographs show about one carrier, top to bottom:

  A black recess across the top with two green indicator lenses in it, side
  by side, the left one activity and the right one status. Under that a
  grey button plate, near enough square, with a copper coloured release
  ring sunk into it and a dark bore inside the ring. The plate is separated
  from the rest of the face by a shadow groove down each side.

  Below the plate the face runs the rest of the way down as a matte grey
  panel with a tall honeycomb vent milled into the middle of it, and a
  bright chrome rail up each side edge, which is the single feature that
  makes a wall of these read as twenty four separate objects rather than
  one perforated sheet. At the bottom a dark label plate.

  Between one carrier and the next is a slot of pure shadow, not a seam.

The carrier here is not the one on the 1U R660 next door and they are not
drawn from the same code. On a 2U the drive stands on its 69.85mm edge and
the carrier is a portrait 17.8 by 69.4mm; on a 1U it has to lie flat, so
the carrier is a landscape 80 by 14.6mm with the latch out at one end. Same
drive, two different mouldings, two different files.

Colours are sampled off the elevation, not guessed. The face is a graphite
grey around 69 of 255 with the vents near black, and the whole thing is
matte: at a low roughness the studio lays a specular band across a face
that is powder coat in life and the carrier comes out looking wet.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import Device, Reference


class PowerEdgeR760(Device):
    slug = "R760"
    name = "Dell PowerEdge R760"
    u = 2
    #: Dell's chassis dimensions page: Y 86.8mm, Xb 434.0mm across the body
    #: without the rack latches, Zb 700.7mm from the ear to the rear wall.
    width = 0.434
    depth = 0.7007
    source = "https://www.dell.com/support/manuals/en-us/oth-r760/per760_ism_pub/chassis-dimensions"
    references = [
        Reference("https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/"
                  "dell-enterprise-products/enterprise-systems/poweredge/r760/media-gallery/"
                  "server-poweredge-r760-black-gallery-2.psd?fmt=png-alpha&wid=2400",
                  "dead on front elevation, 2400x605, bezel fitted but the carriers "
                  "read through it; every figure below came off this"),
        Reference("https://expresscomputersystems.com/cdn/shop/files/"
                  "dell-poweredge-r760-front-24SFF_1600x.jpg?v=1698851668",
                  "a real 24 SFF machine with no bezel, for the bare carrier face"),
        Reference("https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/"
                  "dell-enterprise-products/enterprise-systems/poweredge/r760/media-gallery/"
                  "server-poweredge-r760-black-gallery-1.psd?fmt=png-alpha&wid=2400",
                  "front three quarter, for ear thickness and lid overhang"),

    ]

    # -------------------------------------------------------------- measured
    #
    # The elevation is 2400 pixels across the rack ears. A 19 inch face is
    # 482.6mm, which puts a pixel at 0.2011mm, and the chassis measures 445
    # pixels tall on the same picture, or 89.5mm, against a 2U of 88.9mm.
    # Better than one percent both ways, so the render is orthographic and
    # every number below is a measurement rather than an impression.
    #
    # Horizontal figures are metres from the left edge of the 434mm body.
    # Vertical figures are fractions of panel height with zero at the middle,
    # taken as (224.5 - y_pixel) / 445.

    #: The 19 inch face this was all measured across. Horizontal constants
    #: below are metres from ITS left edge, not the body's, because the
    #: status strip and the whole KVM cluster live out on the ear flanges
    #: and measuring them from the body would put them at negative x.
    FACE_W = 0.4826
    #: (482.6 - 434) / 2, and the ears are not decoration on this machine.
    EAR = 0.0243

    #: Twenty four bays. Release rings measured 88.4 pixels apart across the
    #: whole face, which is 17.78mm, and 24 of those is 426.7mm inside a
    #: 434mm body. The first ring sits 37.7mm from the panel's left edge.
    BAY_N = 24
    BAY_PITCH = 0.01778
    BAY_X0 = 0.03773
    #: Carrier body, narrower than the pitch by the shadow slot between two.
    CARRIER_W = 0.01590
    #: Top and bottom of the carrier: pixels 48 and 393, so 69.4mm of face.
    CARRIER_Z = (0.3966, -0.3787)

    #: The bright side rails, pixels 1737 to 1741 and 1804 to 1809 against a
    #: carrier centred on 1773.5.
    RAIL_DX = 0.00680
    RAIL_W = 0.00088
    #: The rail does not run the whole height. In the button plate band the
    #: pixels at 1737 read 59 to 67, the same grey as the face, and only in
    #: the vent band do they jump to 191 and over. So it starts under the
    #: plate, which is also where the moulded lever actually begins.

    #: Two green lenses in the top recess, pixels 1752.5 and 1792.5.
    LED_DX = 0.00402
    LED_Z = 0.3742
    LED = (0.0019, 0.0026)
    #: The recess they sit in, pixels 48 to 67.
    LED_BAND_Z = (0.3966, 0.3539)

    #: Button plate, pixels 68 to 119 vertically and 1746 to 1799 across.
    PLATE_Z = (0.3517, 0.2371)
    PLATE_W = 0.01066
    #: The release ring inside it, 27 pixels across, centred a little low.
    RING_Z = 0.2798
    RING_R = 0.00271

    #: The honeycomb vent, pixels 152 to 333 and 1749 to 1795.
    VENT_Z = (0.1629, -0.2438)
    VENT_W = 0.00925
    #: The label plate at the foot of the carrier, pixels 335 to 393.
    LABEL_Z = (-0.2483, -0.3787)

    #: Left flange: the status strip runs from 14.9mm to 25.7mm across the
    #: face, so it straddles the ear's inner edge by a millimetre.
    STRIP_X = (0.0149, 0.0257)
    ICON_X = 0.0178
    PIPE_X = 0.0227
    #: The light pipe is blue over its top third and unlit pale below.
    PIPE_Z = (0.3618, -0.0483)
    PIPE_BLUE_Z = (0.3618, 0.1607)

    #: Right flange, in metres from the panel's left edge. The inner strip
    #: carries power, USB and the iDRAC micro-USB, the outer one the VGA.
    PWR_X, PWR_Z, PWR = 0.4629, 0.4079, (0.0080, 0.0085)
    USB_X, USB_Z, USB = 0.4623, 0.1955, (0.0058, 0.0147)
    GRILL_X, GRILL_Z = 0.4630, 0.0135
    IDRAC_X, IDRAC_Z, IDRAC = 0.4634, -0.2382, (0.0044, 0.0038)
    VGA_X, VGA_Z, VGA = 0.4737, 0.2067, (0.0094, 0.0167)
    #: The pull latch on each flange: a recessed grip, not a handle, sunk
    #: into the outer part of the ear over the bottom half of the panel.
    GRIP_Z = (-0.0500, -0.4200)
    GRIP_W = 0.0092
    #: Fraction of the ear's width the grip is offset outward by, so it
    #: clears the status strip on the left ear and the ports on the right.
    GRIP_BIAS = 0.26

    def face(self, rack) -> float:
        """The plane the carriers stand in.

        `front_y` is the middle of the panel slab, not its face. Measuring
        from it buries a 0.9mm vent recess inside the sheet metal, and the
        first render of the reference device in this library lost every
        piece of surface detail exactly that way.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------- materials

    def register(self, rack) -> None:
        """This machine's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # The frame around the drive cage, sampled at 84,87,92 off the
            # elevation: a graphite that is faintly blue, not neutral.
            "r760_frame": pbr("R760 Frame", [58, 60, 64, 255], 0.20, 0.64),
            # The lit top edge of the casting, sampled at 84,87,92: a
            # graphite that is faintly blue rather than neutral.
            "r760_frame_lit": pbr("R760 Frame Edge", [84, 87, 92, 255], 0.20, 0.58),
            "r760_frame_dark": pbr("R760 Frame Shadow", [28, 29, 31, 255], 0.16, 0.68),
            # Ears are a coarser textured paint than the frame and read a
            # shade darker, sampled at 76 flat across the left flange.
            "r760_ear": pbr("R760 Ear", [76, 76, 78, 255], 0.18, 0.72),
            # The lid overhangs the bezel and is bare rolled steel, which is
            # the brightest thing on the machine by a long way at 205.
            "r760_lid": pbr("R760 Lid", [205, 205, 205, 255], 0.62, 0.34),
            # Carrier face at 69 of 255. This is the number that decides the
            # colour of the whole rack, because 24 of them is the face.
            "r760_carrier": pbr("R760 Carrier", [69, 69, 70, 255], 0.16, 0.68),
            "r760_plate": pbr("R760 Button Plate", [64, 64, 64, 255], 0.16, 0.66),
            # Matte, deliberately. At 0.34 the studio put a specular band
            # straight down the vent field and 24 carriers looked varnished.
            "r760_vent": pbr("R760 Vent", [8, 8, 9, 255], 0.0, 0.92),
            "r760_web": pbr("R760 Vent Web", [34, 34, 35, 255], 0.10, 0.80),
            "r760_slot": pbr("R760 Bay Slot", [4, 5, 9, 255], 0.0, 0.90),
            # The bright rail up each side of a carrier. Chromed plastic, so
            # metallic but not a mirror.
            # Chromed plastic, not a mirror. At metallic 0.58 the rails
            # rendered as polished steel columns and swamped the carriers.
            "r760_rail": pbr("R760 Latch Rail", [178, 179, 180, 255], 0.24, 0.46),
            # The release ring, a warm copper. Median of the ring pixels is
            # 185,95,46; the first pass used a traffic cone orange and every
            # carrier grew a warning light.
            "r760_ring": pbr("R760 Release Ring", [190, 98, 48, 255], 0.22, 0.44),
            "r760_bore": pbr("R760 Ring Bore", [30, 30, 31, 255], 0.0, 0.86),
            "r760_label": pbr("R760 Drive Label", [21, 21, 21, 255], 0.0, 0.84),
            # Indicator lenses, unlit. A drive light is normally off or
            # winking, so the emissive stays low enough to read as plastic.
            "r760_led": pbr("R760 Drive LED", [34, 112, 68, 255], 0.0, 0.36,
                            emissive=[0.015, 0.07, 0.03]),
            "r760_pwr": pbr("R760 Power Button", [64, 148, 96, 255], 0.0, 0.30,
                            emissive=[0.07, 0.24, 0.12]),
            "r760_pwr_body": pbr("R760 Power Cap", [122, 123, 124, 255], 0.20, 0.52),
            # The system health and ID pipe on the left flange, lit blue at
            # the top and a dead white plastic below it.
            "r760_pipe_blue": pbr("R760 ID Pipe", [30, 110, 210, 255], 0.0, 0.24,
                                  emissive=[0.06, 0.26, 0.62]),
            "r760_pipe_pale": pbr("R760 Health Pipe", [206, 208, 212, 255], 0.0, 0.36),
            "r760_strip": pbr("R760 Status Strip", [34, 34, 35, 255], 0.10, 0.72),
            "r760_port": pbr("R760 Port Shell", [188, 189, 190, 255], 0.54, 0.34),
            "r760_port_bore": pbr("R760 Port Bore", [10, 10, 11, 255], 0.0, 0.90),
            "r760_silk": pbr("R760 Silkscreen", [188, 189, 190, 255], 0.0, 0.70),
        })


    # ----------------------------------------------------------------- parts
    #
    # There is no hole in the sheet metal, so every recess on this face has
    # to be drawn a fraction of a millimetre PROUD of the surface it is
    # supposed to be sunk into, or the surface wins the depth test and the
    # detail vanishes. The first pass put the vent behind the carrier face
    # and got 24 grey slabs with a ladder of light rungs printed on them:
    # the web showed and the black field it was meant to sit in did not.
    # The offsets below are therefore a stacking order, not a depth model,
    # and they only have to be monotonic.

    #: How far the carrier stands out of the cage. Drives really do sit
    #: proud of a PowerEdge front casting, by about this much.
    CARRIER_PROUD = 0.0022

    def carrier(self, rack, g: str, x: float, z: float, populated: bool) -> None:
        """One 2.5 inch drive carrier, as this chassis wears it.

        `populated` swaps the copper release ring and the two lenses for the
        blank filler Dell ships in an empty bay, which is the same shell
        with no lights and no latch. A rack where every bay is lit looks
        like a stock photograph rather than a room.
        """
        y = self.face(rack)
        h = self.height
        p = self.CARRIER_PROUD
        top, bot = self.CARRIER_Z
        cz = z + (top + bot) / 2 * h
        hz = (top - bot) * h

        def slab(mat, cx, cz_, w, hh, proud, thick=0.0010):
            rack.box(g, mat, (cx, y - proud + thick / 2, cz_), (w, thick, hh))

        # The shadow slot behind the carrier, so the row reads as bays cut
        # into a casting rather than tiles glued to a wall.
        slab("r760_slot", x, cz, self.BAY_PITCH, hz + 0.0016, 0.0006)
        rack.rounded_prism(g, "r760_carrier", (x, y - p + 0.0011, cz),
                           (self.CARRIER_W, 0.0022, hz), radius=0.0006, bevel=0.0004, steps=4)

        # ---- top recess and its two lenses
        lt, lb = self.LED_BAND_Z
        slab("r760_vent", x, z + (lt + lb) / 2 * h, self.CARRIER_W - 0.0026, (lt - lb) * h, p + 0.0002)
        if populated:
            for dx in (-self.LED_DX, self.LED_DX):
                slab("r760_led", x + dx, z + self.LED_Z * h, self.LED[0], self.LED[1],
                     p + 0.0005, 0.0006)

        # ---- release button plate, ringed by its own shadow groove
        pt, pb = self.PLATE_Z
        pz = z + (pt + pb) / 2 * h
        ph = (pt - pb) * h
        slab("r760_slot", x, pz, self.PLATE_W + 0.0018, ph + 0.0008, p + 0.0001)
        rack.rounded_prism(g, "r760_plate", (x, y - p - 0.0002 + 0.0006, pz),
                           (self.PLATE_W, 0.0012, ph), radius=0.0008, bevel=0.0003, steps=4)
        if populated:
            rz = z + self.RING_Z * h
            # A ring, not a disc. The first pass drew two coplanar cylinders
            # and the dark bore lost the depth fight, so every carrier grew
            # a solid orange dot the size of a warning lamp.
            rack.front_cylinder(g, "r760_bore", (x, y - p - 0.0004, rz), self.RING_R * 0.75, 0.0008, 16)
            rack.torus_front(g, "r760_ring", (x, y - p - 0.0006, rz),
                             self.RING_R * 0.80, self.RING_R * 0.26, 20, 6)

        # ---- honeycomb vent: a black field with a thin web over it. Real
        #      hexagonal holes are thousands of triangles per carrier and
        #      read as exactly this from anywhere a rack is ever looked at.
        vt, vb = self.VENT_Z
        vz = z + (vt + vb) / 2 * h
        vh = (vt - vb) * h
        slab("r760_vent", x, vz, self.VENT_W, vh, p + 0.0002, 0.0014)
        rows = 7
        for i in range(rows + 1):
            slab("r760_web", x, vz + vh * (i / rows - 0.5), self.VENT_W, 0.00045, p + 0.0004, 0.0006)
        for i in range(rows):
            # Staggered uprights: centre on one course, edges on the next,
            # which is what turns a ladder into a honeycomb.
            wz = vz + vh * ((i + 0.5) / rows - 0.5)
            xs = (0.0,) if i % 2 == 0 else (-self.VENT_W * 0.25, self.VENT_W * 0.25)
            for dx in xs:
                slab("r760_web", x + dx, wz, 0.00045, vh / rows, p + 0.0004, 0.0006)

        # ---- drive label at the foot
        bt, bb = self.LABEL_Z
        slab("r760_label", x, z + (bt + bb) / 2 * h, self.CARRIER_W - 0.0032,
             (bt - bb) * h, p + 0.0002)

        # ---- the bright rails last, because they are the only thing on a
        #      carrier genuinely proud of everything else. They run from
        #      under the button plate to the foot, not the whole height.
        rt = self.PLATE_Z[1]
        rz = z + (rt + bot) / 2 * h
        rh = (rt - bot) * h
        for dx in (-self.RAIL_DX, self.RAIL_DX):
            slab("r760_rail", x + dx, rz, self.RAIL_W, rh, p + 0.0005, 0.0008)

    def flange(self, rack, g: str, z: float, x0: float, x1: float) -> None:
        """One rack ear, a folded plate with a recessed pull grip.

        These are not brackets bolted on. They are 24.3mm of the front of
        the machine, they carry the status strip on the left and the whole
        KVM cluster on the right, and drawing them as plain tabs throws
        away a tenth of what anybody looks at.
        """
        y = self.face(rack)
        h = self.height
        cx = (x0 + x1) / 2
        rack.rounded_prism(g, "r760_ear", (cx, y + 0.0040, z), (x1 - x0, 0.0100, h),
                           radius=0.0010, bevel=0.0006, steps=5)
        gt, gb = self.GRIP_Z
        # Bias the grip outward, away from the strip or the ports sharing
        # the flange with it. Centred, it merged with the status strip and
        # the left ear rendered as one undifferentiated dark blob.
        outward = -1 if cx < 0 else 1
        gx = cx + outward * (x1 - x0) * self.GRIP_BIAS
        rack.rounded_prism(g, "r760_frame_dark", (gx, y - 0.0014, z + (gt + gb) / 2 * h),
                           (self.GRIP_W, 0.0014, (gt - gb) * h),
                           radius=0.0012, bevel=0.0004, steps=6)

    def usb_a(self, rack, g: str, x: float, z: float, w: float, hgt: float) -> None:
        """The single USB-A on the right flange, stood on its end."""
        y = self.face(rack)
        rack.box(g, "r760_port", (x, y - 0.0018, z), (w, 0.0010, hgt))
        rack.box(g, "r760_port_bore", (x, y - 0.0022, z), (w - 0.0012, 0.0010, hgt - 0.0012))
        # The plastic tongue, which is the only thing that tells a USB-A
        # apart from a rectangular hole.
        rack.box(g, "r760_port", (x + w * 0.16, y - 0.0025, z), (w * 0.34, 0.0007, hgt - 0.0026))

    def vga(self, rack, g: str, x: float, z: float, w: float, hgt: float) -> None:
        """The VGA on the outer flange, portrait like everything else here."""
        y = self.face(rack)
        rack.rounded_prism(g, "r760_port", (x, y - 0.0018, z), (w, 0.0012, hgt),
                           radius=0.0020, bevel=0.0004, steps=8)
        rack.rounded_prism(g, "r760_port_bore", (x, y - 0.0023, z), (w - 0.0022, 0.0012, hgt - 0.0022),
                           radius=0.0016, bevel=0.0003, steps=8)
        # Fifteen pins in three columns of five, which is a D-sub end on.
        for col in range(3):
            for row in range(5):
                rack.box(g, "r760_frame_dark",
                         (x + (col - 1) * w * 0.19, y - 0.0027, z + (row - 2) * hgt * 0.155),
                         (0.0008, 0.0006, 0.0008))

    # ------------------------------------------------------------ silkscreen

    def silkscreen(self, rack, z: float) -> None:
        """The ear markings, as one transparent overlay.

        There is almost no lettering on a PowerEdge face, which is the point
        of it, but the left flange carries five service icons and the right
        one the port symbols, and those are drawings rather than shapes
        anyone can extrude. Geometry cannot spell and it cannot draw a
        thermometer either.

        Unlike the two reference devices this sheet spans the full 482.6mm
        face rather than the 434mm body, because on this machine every mark
        worth printing is out on an ear.
        """
        from PIL import Image, ImageDraw
        from build_unifi_hero_rack_clean_aligned import font, save_texture
        from trimesh.visual.material import PBRMaterial

        W = 3072
        H = round(W * self.height / self.FACE_W)
        ppm = W / self.FACE_W
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        ink = (196, 197, 198, 255)

        def px(x_m: float) -> float:
            return x_m * ppm

        def py(frac: float) -> float:
            return (0.5 - frac) * H

        r = 1.5 / 1000 * ppm                       # the service icons are 3mm

        def frame(cx, cy, w, hh, width=2):
            d.rectangle([cx - w, cy - hh, cx + w, cy + hh], outline=ink, width=width)

        # ---- left flange: drive, temperature, electrical, memory, network,
        #      in that order down the strip, which is the order Dell prints
        #      them and the order the iDRAC lists the subsystems in.
        ix = px(self.ICON_X)
        for k, name in enumerate(("drive", "temp", "power", "memory", "network")):
            cy = py(0.300 - k * 0.140)
            if name == "drive":
                d.ellipse([ix - r, cy - r * 0.75, ix + r, cy - r * 0.15], outline=ink, width=2)
                d.line([(ix - r, cy - r * 0.45), (ix - r, cy + r * 0.35)], fill=ink, width=2)
                d.line([(ix + r, cy - r * 0.45), (ix + r, cy + r * 0.35)], fill=ink, width=2)
                d.arc([ix - r, cy - r * 0.05, ix + r, cy + r * 0.75], 0, 180, fill=ink, width=2)
            elif name == "temp":
                d.line([(ix, cy - r), (ix, cy + r * 0.25)], fill=ink, width=3)
                d.ellipse([ix - r * 0.55, cy + r * 0.15, ix + r * 0.55, cy + r], outline=ink, width=2)
            elif name == "power":
                frame(ix, cy, r * 0.8, r * 0.9)
                d.line([(ix + r * 0.25, cy - r * 0.55), (ix - r * 0.15, cy + r * 0.05),
                        (ix + r * 0.15, cy + r * 0.05), (ix - r * 0.25, cy + r * 0.6)],
                       fill=ink, width=2)
            elif name == "memory":
                for j in range(3):
                    dy = (j - 1) * r * 0.5
                    d.line([(ix - r, cy + dy + r * 0.22), (ix, cy + dy - r * 0.22),
                            (ix + r, cy + dy + r * 0.22)], fill=ink, width=2)
            else:
                frame(ix, cy - r * 0.25, r * 0.9, r * 0.5)
                d.line([(ix, cy + r * 0.25), (ix, cy + r * 0.7)], fill=ink, width=2)
                d.line([(ix - r * 0.7, cy + r * 0.75), (ix + r * 0.7, cy + r * 0.75)], fill=ink, width=3)

        # The italic i over the light pipe, the system information mark.
        f_i = font(max(10, round(3.6 / 1000 * ppm / 0.729)), True)
        b = d.textbbox((0, 0), "i", font=f_i)
        d.text((px(self.PIPE_X) - (b[2] - b[0]) / 2, py(0.432) - (b[3] - b[1]) / 2 - b[1]),
               "i", font=f_i, fill=ink)

        # ---- right flange: the USB trident and the VGA monitor mark, each
        #      printed above the socket it belongs to.
        ux, uy = px(self.USB_X), py(self.USB_Z + 0.140)
        d.line([(ux - r * 1.2, uy), (ux + r * 1.1, uy)], fill=ink, width=2)
        d.ellipse([ux - r * 1.5, uy - r * 0.28, ux - r * 0.95, uy + r * 0.28], fill=ink)
        d.line([(ux + r * 1.1, uy), (ux + r * 0.5, uy - r * 0.5)], fill=ink, width=2)
        d.line([(ux + r * 0.4, uy), (ux - r * 0.1, uy + r * 0.5)], fill=ink, width=2)

        vx, vy = px(self.VGA_X), py(self.VGA_Z + 0.175)
        d.line([(vx - r * 0.95, vy - r * 0.5), (vx - r * 0.95, vy + r * 0.5)], fill=ink, width=3)
        d.line([(vx + r * 0.95, vy - r * 0.5), (vx + r * 0.95, vy + r * 0.5)], fill=ink, width=3)
        frame(vx, vy, r * 0.45, r * 0.5)

        # The wrench that marks iDRAC Direct.
        wx, wy = px(self.IDRAC_X), py(self.IDRAC_Z + 0.115)
        d.line([(wx - r * 0.8, wy + r * 0.6), (wx + r * 0.5, wy - r * 0.5)], fill=ink, width=3)
        d.ellipse([wx + r * 0.15, wy - r * 0.95, wx + r * 1.0, wy - r * 0.1], outline=ink, width=3)

        # The model, printed on the express service tag that pulls out of
        # the bottom right of the drive cage.
        f_badge = font(max(8, round(2.4 / 1000 * ppm / 0.729)), True)
        d.text((px(0.4020), py(-0.437)), "R760", font=f_badge, fill=(138, 139, 140, 255))

        tex = save_texture("r760_silkscreen.png", img)
        rack.materials["r760_silktex"] = PBRMaterial(
            name="R760 Silkscreen", baseColorFactor=[255, 255, 255, 255],
            baseColorTexture=tex, metallicFactor=0.0, roughnessFactor=0.60,
            alphaMode="BLEND", doubleSided=True,
        )
        # 1.9mm proud of the casting: in front of the ear plate and the
        # status strip so the icons print on them, behind the carriers and
        # the port shells so it never lies over a socket.
        rack.textured_plane(self.slug, "r760_silktex",
                            (0, self.face(rack) - 0.0019, z), self.FACE_W, self.height)

    # ----------------------------------------------------------------- build

    def build(self, rack, z: float, filled: int | None = None) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h = self.height
        w = self.width
        filled = self.BAY_N if filled is None else filled

        def X(from_left: float) -> float:
            """Panel coordinate from a measurement off the elevation.

            Metres from the left edge of the 482.6mm face, which is where
            every horizontal figure in this file was measured from.
            """
            return -self.FACE_W / 2 + from_left

        def Z(frac: float) -> float:
            return z + frac * h

        # Chassis body, then the front casting the drive cage is cut into.
        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.008, self.depth, h * 0.94))
        rack.rounded_prism(g, "r760_frame", (0, rack.front_y, z), (w, 0.0106, h),
                           radius=0.0012, bevel=0.0007, steps=6)
        # The lid overhangs the casting and is bare rolled steel, the one
        # bright thing on an otherwise graphite machine.
        rack.box(g, "r760_lid", (0, y + 0.0090, z + h * 0.487), (w + 0.0016, 0.020, 0.0024))
        rack.box(g, "r760_frame_dark", (0, y - 0.0004, z - h * 0.480), (w - 0.004, 0.0010, 0.0020))

        # The cage opening: one dark aperture the carriers stand inside.
        top, bot = self.CARRIER_Z
        field_w = self.BAY_N * self.BAY_PITCH
        field_cx = X(self.BAY_X0 + (self.BAY_N - 1) * self.BAY_PITCH / 2)
        rack.box(g, "r760_frame_dark", (field_cx, y - 0.0001, z + (top + bot) / 2 * h),
                 (field_w + 0.0026, 0.0010, (top - bot) * h + 0.0030))

        for i in range(self.BAY_N):
            self.carrier(rack, g, X(self.BAY_X0 + i * self.BAY_PITCH), z, populated=i < filled)

        # The express service tag, a thin card that pulls out under the last
        # few bays. It is the only marked feature on the casting itself.
        rack.box(g, "r760_frame_dark", (X(0.4130), y - 0.0006, Z(-0.4370)), (0.0560, 0.0012, 0.0044))
        rack.box(g, "r760_pipe_blue", (X(0.4360), y - 0.0010, Z(-0.4370)), (0.0090, 0.0008, 0.0011))

        # ---- left flange and its status strip ---------------------------
        self.flange(rack, g, z, X(0.0), X(self.EAR))
        sx0, sx1 = self.STRIP_X
        rack.box(g, "r760_strip", (X((sx0 + sx1) / 2), y - 0.0011, z),
                 (sx1 - sx0, 0.0012, h * 0.92))
        pt, pb = self.PIPE_Z
        bt, bb = self.PIPE_BLUE_Z
        rack.box(g, "r760_pipe_pale", (X(self.PIPE_X), y - 0.0024, z + (pt + pb) / 2 * h),
                 (0.0024, 0.0008, (pt - pb) * h))
        rack.box(g, "r760_pipe_blue", (X(self.PIPE_X), y - 0.0026, z + (bt + bb) / 2 * h),
                 (0.0024, 0.0008, (bt - bb) * h))

        # ---- right flange, power and the KVM cluster --------------------
        self.flange(rack, g, z, X(self.FACE_W - self.EAR), X(self.FACE_W))
        pw, ph = self.PWR
        rack.rounded_prism(g, "r760_pwr_body", (X(self.PWR_X), y - 0.0018, Z(self.PWR_Z)),
                           (pw, 0.0014, ph), radius=0.0008, bevel=0.0004, steps=5)
        rack.front_cylinder(g, "r760_pwr", (X(self.PWR_X), y - 0.0027, Z(self.PWR_Z)),
                            0.0026, 0.0006, 20)
        rack.front_cylinder(g, "r760_pwr_body", (X(self.PWR_X), y - 0.0029, Z(self.PWR_Z)),
                            0.0018, 0.0005, 20)
        rack.box(g, "r760_pwr", (X(self.PWR_X), y - 0.0031, Z(self.PWR_Z + 0.022)),
                 (0.0006, 0.0004, 0.0026))

        self.usb_a(rack, g, X(self.USB_X), Z(self.USB_Z), *self.USB)
        # The punched grille between the USB and the iDRAC socket.
        for row in range(3):
            for col in range(5):
                rack.box(g, "r760_port_bore",
                         (X(self.GRILL_X) + (col - 2) * 0.0013, y - 0.0016,
                          Z(self.GRILL_Z) + (row - 1) * 0.0014),
                         (0.0007, 0.0008, 0.0007))
        iw, ih = self.IDRAC
        rack.rounded_prism(g, "r760_port", (X(self.IDRAC_X), y - 0.0018, Z(self.IDRAC_Z)),
                           (iw, 0.0010, ih), radius=0.0008, bevel=0.0003, steps=6)
        rack.box(g, "r760_port_bore", (X(self.IDRAC_X), y - 0.0022, Z(self.IDRAC_Z)),
                 (iw - 0.0012, 0.0008, ih - 0.0014))
        self.vga(rack, g, X(self.VGA_X), Z(self.VGA_Z), *self.VGA)

        self.silkscreen(rack, z)
