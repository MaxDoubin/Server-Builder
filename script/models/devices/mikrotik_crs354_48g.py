"""MikroTik CRS354-48G-4S+2Q+RM, drawn from MikroTik's own product photography.

The first product in this library modelled by looking at it rather than by
reading its port count off a datasheet, and the difference starts before
any port is drawn: the old model painted this switch near black, and a
CRS354 is a warm off white box with a pale grey front panel. Everything
below is in the photographs and none of it is in the datasheet.

What the photographs show, working left to right:

  The lid overhangs the panel and is pressed into four shallow steps, with
  CLOUD SWITCH embossed across it and two rounded slots punched near the
  front edge. The rack ears are a separate folded piece, a shade lighter
  than the panel, each with two rounded rectangular slots rather than the
  round holes most vendors use.

  MikroTik's wordmark sits at the far left, and it is two weights: Mikro in
  a thin outline and Tik in heavy black. The model number runs beside it in
  a light grey technical face.

  The 48 gigabit ports are sunk into a milled pocket with a pale frame
  around it, twenty four columns two high, split into four groups of six
  columns by a gap the width of about half a port. Even numbers are
  silkscreened above the top row and odd below the bottom, and GIGABIT
  ETHERNET is centred above the whole field. Each jack carries a green lamp
  in one top corner and an amber in the other, and the two rows are
  mirrored, so the bottom row wears its lamps along its bottom edge.

  Then four SFP+ cages two by two, then two QSFP+ cages stacked. Both
  groups are labelled under a thin bracket line, and between the rows sits
  the detail that makes a MikroTik panel recognisable at a glance: the port
  lamps are small solid triangles pointing at the cage they belong to,
  alternating up and down, with a row of little squares between the QSFP
  lanes.

  The console and management jacks share their own recessed pocket at the
  right, console above and management below, and only the management jack
  has lamps. Above them four labels are joined to their lamps by hairline
  leaders, PWR 1 and FAULT on the left, RESET and PWR 2 on the right,
  around a single round reset button, with a long thin light pipe beneath.

Every dimension here is read off the photograph as a fraction of the panel
and then scaled by the real rack unit, so the proportions are the product's
own rather than a guess. Nothing in this file is shared with another
product: the jacks, cages, lamps and buttons are all drawn here, because a
MikroTik jack in its milled pocket does not look like a Cisco jack in its
stamped shield, and one generic jack on every rack is exactly what made
these look fake.
"""

from __future__ import annotations

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from _device import U, Device, Reference


class CRS354_48G(Device):
    slug = "CRS354_48G"
    name = "MikroTik CRS354-48G-4S+2Q+RM"
    u = 1
    #: MikroTik publish 443 x 210 x 44 mm for this chassis.
    width = 0.443
    depth = 0.210
    source = "https://mikrotik.com/product/crs354_48g_4splus2qplus_rm"
    references = [
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1901_hi_res.png",
                  "front on, 4382x1652, the whole panel"),
        Reference("https://cdn.mikrotik.com/web-assets/rb_images/1899_hi_res.png",
                  "front three quarter, gives the lid steps and ear profile"),
    ]

    def face(self, rack) -> float:
        """The plane of the front panel, which is not `front_y`.

        The panel is a 10.5mm slab centred on the rack's front, so its
        visible face is 5.3mm proud of that. Measuring surface detail from
        `front_y` buries all of it inside the panel, which is exactly what
        the first render of this device did: a blank white slab with two
        faint smudges where the deepest recesses poked through.
        """
        return rack.front_y - 0.0053

    # ------------------------------------------------------------ materials

    def register(self, rack) -> None:
        """This product's own finishes. Nothing here is shared."""
        from build_unifi_hero_rack_clean_aligned import pbr

        rack.materials.update({
            # Read off the photograph: a warm off white, the lid a shade
            # lighter than the panel, and the ears lighter again.
            "mt354_panel": pbr("CRS354 Panel", [222, 222, 217, 255], 0.16, 0.52),
            "mt354_lid": pbr("CRS354 Lid", [231, 231, 227, 255], 0.18, 0.46),
            "mt354_ear": pbr("CRS354 Ear", [214, 214, 209, 255], 0.22, 0.44),
            # The milled pocket the ports sit in, and its pale lip.
            "mt354_pocket": pbr("CRS354 Port Pocket", [176, 177, 172, 255], 0.24, 0.58),
            "mt354_lip": pbr("CRS354 Pocket Lip", [236, 236, 232, 255], 0.20, 0.44),
            # A MikroTik RJ45 is a black moulding deep in the pocket with a
            # dull nickel shield and gold contacts well back from the mouth.
            "mt354_jack_shell": pbr("CRS354 Jack Shell", [26, 26, 27, 255], 0.10, 0.72),
            "mt354_jack_shield": pbr("CRS354 Jack Shield", [96, 98, 99, 255], 0.68, 0.36),
            "mt354_jack_gold": pbr("CRS354 Jack Contacts", [198, 158, 74, 255], 0.86, 0.24),
            "mt354_cage": pbr("CRS354 Cage", [58, 59, 60, 255], 0.52, 0.44),
            "mt354_cage_bore": pbr("CRS354 Cage Bore", [12, 12, 13, 255], 0.20, 0.86),
            "mt354_silk": pbr("CRS354 Silkscreen", [92, 93, 92, 255], 0.05, 0.72),
            "mt354_wordmark": pbr("CRS354 Wordmark", [24, 24, 25, 255], 0.05, 0.66),
            "mt354_button": pbr("CRS354 Reset", [70, 71, 72, 255], 0.42, 0.42),
            "mt354_pipe": pbr("CRS354 Light Pipe", [58, 60, 62, 255], 0.30, 0.30),
            "mt354_led_green": pbr("CRS354 Green", [64, 226, 118, 255], 0.0, 0.16,
                                   emissive=[0.10, 0.62, 0.24]),
            "mt354_led_amber": pbr("CRS354 Amber", [244, 186, 62, 255], 0.0, 0.18,
                                   emissive=[0.58, 0.36, 0.04]),
        })

    # --------------------------------------------------------------- parts

    def jack(self, rack, g: str, x: float, z: float, w: float, h: float, top_row: bool) -> None:
        """One gigabit jack as this switch wears it.

        Deep black moulding, a dull nickel shield around the mouth, gold
        contacts set well back, and the two corner lamps on whichever edge
        faces out of the pocket. The rows are mirrored, which is why the
        lamp edge is an argument rather than a constant.
        """
        y = self.face(rack)
        # A jack reads as a hole, not a tile. The first pass laid the nickel
        # shield across the whole opening, so 48 of them came out as flat
        # grey rectangles and the throat behind never showed at all. The
        # shield is a thin rim; what fills the middle is darkness.
        rim = 0.0011
        for dx, dz, bw, bh in (
            (0, h / 2 - rim / 2, w, rim),
            (0, -h / 2 + rim / 2, w, rim),
            (-w / 2 + rim / 2, 0, rim, h),
            (w / 2 - rim / 2, 0, rim, h),
        ):
            rack.box(g, "mt354_jack_shield", (x + dx, y - 0.0017, z + dz), (bw, 0.0014, bh))
        # There is no hole in the panel, so the darkness has to be drawn in
        # front of it and then stepped back behind the rim. Putting the
        # throat level with the panel let the white panel win the depth
        # test and 48 jacks came out as empty outlines.
        rack.box(g, "mt354_jack_shell", (x, y - 0.0006, z), (w - rim * 2, 0.0020, h - rim * 2))
        rack.box(g, "mt354_jack_shell", (x, y + 0.0048, z), (w * 0.84, 0.0090, h * 0.84))
        # The latch notch in the top edge of the opening, the tell that says
        # 8P8C rather than a plain rectangle.
        notch = 0.30 if top_row else -0.30
        rack.box(g, "mt354_jack_shield", (x, y - 0.0021, z + h * notch), (w * 0.28, 0.0012, h * 0.20))
        # Contacts, back from the mouth so they catch light rather than glare.
        for i in range(8):
            cx = x - w * 0.30 + i * (w * 0.60 / 7)
            rack.box(g, "mt354_jack_gold", (cx, y - 0.0002, z - h * notch * 0.50),
                     (w * 0.040, 0.0012, h * 0.26))
        # Corner lamps, green one side and amber the other.
        lamp_z = z + h * (0.36 if top_row else -0.36)
        for dx, mat in ((-w * 0.30, "mt354_led_green"), (w * 0.30, "mt354_led_amber")):
            rack.box(g, mat, (x + dx, y - 0.0021, lamp_z), (w * 0.22, 0.0010, h * 0.14))

    def cage(self, rack, g: str, x: float, z: float, w: float, h: float) -> None:
        """An SFP+ or QSFP+ opening, drawn as this panel presents it."""
        y = self.face(rack)
        rack.box(g, "mt354_cage", (x, y - 0.0014, z), (w, 0.0014, h))
        rack.box(g, "mt354_cage_bore", (x, y + 0.0040, z), (w * 0.88, 0.0100, h * 0.80))
        # The EMI fingers show as a pale ladder across the top of the mouth.
        for i in range(7):
            fx = x - w * 0.36 + i * (w * 0.72 / 6)
            rack.box(g, "mt354_cage", (fx, y - 0.0022, z + h * 0.34), (w * 0.05, 0.0010, h * 0.16))

    def triangle_lamp(self, rack, g: str, x: float, z: float, s: float, up: bool) -> None:
        """The solid triangle MikroTik uses for a port lamp.

        Three stacked slivers rather than a real triangle: at this size the
        silhouette is what reads, and it costs a fraction of the geometry.
        """
        for i in range(3):
            f = (i + 0.5) / 3
            wide = s * (1 - f) if up else s * f
            dz = s * (f - 0.5) * (1 if up else -1)
            rack.box(g, "mt354_silk", (x, self.face(rack) - 0.0012, z + dz), (max(wide, s * 0.12), 0.0008, s * 0.34))

    def bracket(self, rack, g: str, x: float, z: float, w: float) -> None:
        """The thin line that frames a group label, with turned down ends."""
        y = self.face(rack) - 0.0012
        rack.box(g, "mt354_silk", (x, y, z), (w, 0.0007, 0.0006))
        for dx in (-w / 2, w / 2):
            rack.box(g, "mt354_silk", (x + dx, y, z - 0.0012), (0.0006, 0.0007, 0.0024))

    # --------------------------------------------------------------- build

    def build(self, rack, z: float) -> None:
        g = self.slug
        self.register(rack)
        y = self.face(rack)
        h = self.height
        w = self.width

        # Chassis body behind the panel, then the panel itself.
        rack.uv_box(g, "steel_textured", (0, rack.front_y + 0.010 + self.depth / 2, z),
                    (w - 0.010, self.depth, h * 0.92))
        rack.rounded_prism(g, "mt354_panel", (0, rack.front_y, z), (w, 0.0105, h),
                           radius=0.0012, bevel=0.0006, steps=6)

        # The lid overhangs the panel and steps four times toward the back.
        for i in range(4):
            step = self.depth * (0.10 + i * 0.22)
            rack.box(g, "mt354_lid", (0, y + 0.012 + step, z + h * 0.47 - i * 0.0004),
                     (w - 0.012 - i * 0.004, self.depth * 0.20, 0.0016))
        # Two rounded slots punched in the lid near the front edge.
        for sx in (-0.070, 0.070):
            rack.box(g, "mt354_pocket", (sx, y + 0.026, z + h * 0.48), (0.020, 0.016, 0.0010))

        # Rack ears: a separate folded piece, lighter, with slotted cutouts.
        for sx in (-1, 1):
            ex = sx * (w / 2 + 0.0195)
            rack.rounded_prism(g, "mt354_ear", (ex, y + 0.0010, z), (0.039, 0.0085, h * 0.98),
                               radius=0.0016, bevel=0.0006, steps=6)
            for dz in (h * 0.27, -h * 0.27):
                rack.rounded_prism(g, "mt354_pocket", (ex, y - 0.0030, z + dz), (0.020, 0.0030, 0.0090),
                                   radius=0.0040, bevel=0.0008, steps=8)

        # Wordmark and model number, far left above the port pocket.
        rack.box(g, "mt354_wordmark", (-w / 2 + 0.0290, y - 0.0011, z + h * 0.385), (0.0250, 0.0007, 0.0038))
        rack.box(g, "mt354_silk", (-w / 2 + 0.0620, y - 0.0011, z + h * 0.385), (0.0340, 0.0006, 0.0026))

        # ---- the 48 gigabit ports -------------------------------------
        # Twenty four columns, two rows, in four groups of six columns.
        # Measured off the photograph: the port bank runs from a 16mm left
        # margin to 79 percent of the panel width, so 24 columns and three
        # group gaps share 333mm. That lands the pitch at 13.6mm, close to
        # the 0.6 inch a ganged RJ45 housing wants and nothing like the
        # 6.95mm the first pass guessed, which squeezed the whole bank into
        # the left half of the panel and left a third of it bare.
        col_w = 0.01360
        gap = 0.0022
        block_w = 24 * col_w + 3 * gap
        x0 = -w / 2 + 0.0165 + col_w / 2
        # The milled pocket and its pale lip.
        rack.box(g, "mt354_lip", (x0 + block_w / 2 - col_w / 2, y - 0.0007, z - h * 0.03),
                 (block_w + 0.0044, 0.0007, h * 0.76))
        rack.box(g, "mt354_pocket", (x0 + block_w / 2 - col_w / 2, y - 0.0003, z - h * 0.03),
                 (block_w + 0.0026, 0.0008, h * 0.72))

        jw, jh = col_w * 0.88, h * 0.320
        for col in range(24):
            cx = x0 + col * col_w + (col // 6) * gap
            for top in (True, False):
                self.jack(rack, g, cx, z - h * 0.03 + (jh * 0.53 if top else -jh * 0.53), jw, jh, top)
            # Port numbers: even above the top row, odd below the bottom.
            for above in (True, False):
                rack.box(g, "mt354_silk", (cx, y - 0.0011, z - h * 0.03 + (h * 0.375 if above else -h * 0.375)),
                         (col_w * 0.22, 0.0006, 0.0022))

        # GIGABIT ETHERNET, centred above the whole field.
        rack.box(g, "mt354_silk", (x0 + block_w * 0.46, y - 0.0011, z + h * 0.385), (0.0380, 0.0006, 0.0024))

        # ---- SFP+ block, four cages two by two ------------------------
        sfp_x = x0 + block_w + 0.0060
        for i in range(2):
            for top in (True, False):
                self.cage(rack, g, sfp_x + i * 0.0128, z - h * 0.02 + (h * 0.155 if top else -h * 0.155),
                          0.0116, h * 0.215)
        self.bracket(rack, g, sfp_x + 0.0064, z + h * 0.335, 0.0268)
        # The triangle lamps that sit between the two rows.
        for i in range(4):
            self.triangle_lamp(rack, g, sfp_x - 0.0038 + i * 0.0064, z - h * 0.02, 0.0034, up=(i % 2 == 0))

        # ---- QSFP+ block, two cages stacked ---------------------------
        qsfp_x = sfp_x + 0.0300
        for top in (True, False):
            self.cage(rack, g, qsfp_x, z - h * 0.02 + (h * 0.155 if top else -h * 0.155), 0.0210, h * 0.215)
        self.bracket(rack, g, qsfp_x, z + h * 0.335, 0.0270)
        # A triangle each end with the four lane squares between them.
        self.triangle_lamp(rack, g, qsfp_x - 0.0082, z - h * 0.02, 0.0034, up=True)
        self.triangle_lamp(rack, g, qsfp_x + 0.0082, z - h * 0.02, 0.0034, up=False)
        for i in range(4):
            rack.box(g, "mt354_silk", (qsfp_x - 0.0036 + i * 0.0024, y - 0.0012, z - h * 0.02),
                     (0.0014, 0.0008, 0.0014))

        # ---- console and management, in their own pocket --------------
        mg_x = qsfp_x + 0.0250
        rack.box(g, "mt354_lip", (mg_x, y - 0.0007, z - h * 0.02), (0.0166, 0.0007, h * 0.60))
        rack.box(g, "mt354_pocket", (mg_x, y - 0.0002, z - h * 0.02), (0.0146, 0.0008, h * 0.55))
        # Console above with no lamps, management below with them.
        self.jack(rack, g, mg_x, z + h * 0.12, 0.0122, h * 0.225, True)
        rack.box(g, "mt354_panel", (mg_x, y - 0.0026, z + h * 0.12 + h * 0.076), (0.0122, 0.0012, h * 0.05))
        self.jack(rack, g, mg_x, z - h * 0.16, 0.0122, h * 0.225, False)

        # ---- status cluster, top right --------------------------------
        cl_x = mg_x - 0.0020
        rack.front_cylinder(g, "mt354_button", (cl_x, y - 0.0016, z + h * 0.33), 0.0021, 0.0016, 20)
        # Four labels joined to their lamps by hairline leaders.
        for dx, dz in ((-0.0130, 0.0034), (-0.0130, -0.0002), (0.0116, 0.0034), (0.0116, -0.0002)):
            rack.box(g, "mt354_silk", (cl_x + dx, y - 0.0012, z + h * 0.33 + dz), (0.0072, 0.0007, 0.0020))
            lead = 0.0042 if dx < 0 else -0.0042
            rack.box(g, "mt354_silk", (cl_x + dx - lead, y - 0.0012, z + h * 0.33 + dz), (0.0028, 0.0007, 0.0005))
        # The light pipe under the cluster.
        rack.box(g, "mt354_pipe", (cl_x, y - 0.0014, z + h * 0.24), (0.0230, 0.0010, 0.0021))
