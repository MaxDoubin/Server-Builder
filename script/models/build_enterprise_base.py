#!/usr/bin/env python3
"""Shared scaffolding for a full height 42U enterprise rack.

The UniFi hero rack is a shallow studio frame on casters and it carries
the part library everything else builds on. A vendor rack is a different
object: 42 units of four post steel bolted to the floor, rails punched
three holes per unit, and a stack of hardware that has nothing in common
with a studio frame except the 19 inch mounting width.

That difference is the same for every vendor, so it lives here, and a
vendor module only has to describe its own hardware.

Coordinates follow the UniFi builder: x across the face, y into the rack
with the front at `front_y`, z up.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import numpy as np

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from build_unifi_hero_rack_clean_aligned import UniFiHeroRack, export_glb, pbr, make_screen_texture

# Uncompressed output. These are 12 to 18 MB and never ship, so they go
# to the working directory by default and are gitignored, not into the
# tree next to the compressed artifacts that do ship.
OUT = Path(os.environ.get("RACK_OUT", "."))

U = 0.04445
RAIL_BOTTOM = 0.160
PANEL_W = 0.442

#: Default frame height. Override `units` on a subclass for a smaller rack:
#: a 42U cabinet is a data centre object and plenty of vendors are deployed
#: in half that, which is itself worth drawing.
UNITS = 42


class EnterpriseRack(UniFiHeroRack):
    """A 42U four post rack. Subclass it and describe your own hardware."""

    #: Rack units of mounting space. A vendor rack does not have to be 42.
    units = UNITS
    #: Powder coat on the frame itself.
    frame_material = 'nexus_black'
    #: Default front panel finish for this vendor.
    panel_material = 'cisco_grey'
    #: Finish used for recessed sub-panels, card faces and bezels.
    inset_material = 'cisco_grey_dark'
    #: Scene metadata. These racks are not the UniFi hero model and must
    #: not claim to be: the title is what a modelling tool shows when the
    #: file is opened, and it was the base class's until now.
    scene_author = 'Max Doubin'
    scene_note = (
        'Original procedural geometry generated from published vendor dimensions. '
        'No vendor mesh, texture or logo is included; product names are third-party trademarks '
        'used to identify the hardware being illustrated.'
    )

    #: The punched mounting rails. Every vendor at this end of the market
    #: paints theirs to match the cabinet, and the bright zinc this started
    #: with read as two strip lights running down the inside of the rack
    #: rather than as steel. Override it if a vendor really does ship zinc.
    rail_material = 'nexus_black'

    def __init__(self) -> None:
        super().__init__()
        self.rail_top = RAIL_BOTTOM + self.units * U
        self.materials.update({
            'cisco_grey': pbr('Panel Grey', [206, 209, 208, 255], 0.34, 0.44),
            'cisco_grey_dark': pbr('Panel Shadow', [166, 170, 170, 255], 0.34, 0.52),
            'cisco_edge': pbr('Panel Edge', [232, 234, 233, 255], 0.40, 0.28),
            'nexus_black': pbr('Chassis Black', [42, 45, 49, 255], 0.44, 0.46),
            'nexus_black_dark': pbr('Chassis Shadow', [26, 28, 31, 255], 0.40, 0.56),
            'ucs_grey': pbr('Compute Chassis', [58, 62, 66, 255], 0.52, 0.42),
            'ucs_bezel': pbr('Compute Bezel', [30, 33, 36, 255], 0.30, 0.58),
            'teal_throat': pbr('Teal Port Throat', [16, 74, 68, 255], 0.24, 0.72),
            'unified_throat': pbr('Unified Port Throat', [92, 62, 18, 255], 0.26, 0.68),
            'port_bezel_amber': pbr('Amber Port Bezel', [176, 138, 44, 255], 0.30, 0.52),
            'port_bezel_blue': pbr('Blue Port Bezel', [96, 138, 182, 255], 0.28, 0.50),
            'mesh_bezel': pbr('Perforated Bezel', [70, 75, 80, 255], 0.44, 0.52),
            'drive_face': pbr('Drive Carrier', [46, 50, 54, 255], 0.46, 0.44),
            'drive_handle': pbr('Carrier Handle', [150, 155, 158, 255], 0.72, 0.34),
            'juniper_graphite': pbr('Juniper Graphite', [64, 68, 73, 255], 0.46, 0.44),
            'juniper_graphite_dark': pbr('Juniper Graphite Shadow', [44, 47, 51, 255], 0.42, 0.54),
            'juniper_accent': pbr('Juniper Accent', [104, 178, 122, 255], 0.20, 0.36,
                                  emissive=[0.10, 0.45, 0.20]),
        })
        self._register_screen('chassis', make_screen_texture('Chassis', (86, 190, 240), 'network'))
        self._register_screen('compute', make_screen_texture('Compute', (110, 190, 255), 'storage'))

    # ------------------------------------------------------------- helpers

    def u_centre(self, u_from_top: float, u_high: int = 1) -> float:
        """Vertical centre of a device `u_from_top` units below the top rail."""
        return self.rail_top - (u_from_top + u_high / 2) * U

    def panel_shell(self, group: str, z: float, u: int, depth: float,
                    face: str | None = None, panel_width: float = PANEL_W) -> None:
        """An enterprise front panel: squarer than UniFi's, with a hard lip.

        Vendors at this end of the market fold their panels rather than
        machining them, so the edges are a crease and a shadow line rather
        than a generous radius. That is most of why a Catalyst does not
        look like a UniFi switch even before the ports go on.
        """
        face = face or self.panel_material
        height = u * U - 0.0015
        body_y = self.front_y + 0.010 + depth / 2
        self.uv_box(group, 'steel_textured', (0, body_y, z), (panel_width - 0.008, depth, height * 0.9))
        self.rounded_prism(group, face, (0, self.front_y, z), (panel_width, 0.0110, height),
                           radius=0.0018, bevel=0.0008, steps=6)
        # Crease lines top and bottom.
        self.box(group, 'cisco_edge', (0, self.front_y - 0.0060, z + height * 0.47),
                 (panel_width - 0.010, 0.0009, 0.0011))
        self.box(group, self.inset_material, (0, self.front_y - 0.0060, z - height * 0.47),
                 (panel_width - 0.010, 0.0009, 0.0011))
        # Rack ears and their screws.
        for x in (-0.236, 0.236):
            self.rounded_prism(group, face, (x, self.front_y + 0.0008, z), (0.030, 0.0100, height * 0.99),
                               radius=0.0018, bevel=0.0007, steps=6)
            for zz in (z - height * 0.32, z + height * 0.32):
                self.screw(group, x, zz)
        # Rear face and side vents.
        rear_y = self.front_y + 0.010 + depth
        self.uv_box(group, self.inset_material, (0, rear_y, z), (panel_width - 0.010, 0.0070, height * 0.86))
        for side_x in (-panel_width * 0.48, panel_width * 0.48):
            for iz in np.linspace(z - height * 0.3, z + height * 0.3, 5):
                self.box(group, 'black_matte', (side_x, body_y, float(iz)), (0.0012, depth * 0.4, 0.0020))

    def status_cluster(self, group: str, x: float, z: float, height: float) -> None:
        """Beacon/UID button, status LEDs and the console, far left.

        Cisco's hardware guide puts the beacon LED and UID button at the far
        left of a Catalyst front panel, then the status indicators, then the
        console port, and every other vendor at this end of the market puts
        much the same block in much the same place. It is how you identify a
        switch from the far end of a room.
        """
        self.rounded_prism(group, 'black_plastic', (x, self.front_y - 0.0035, z + height * 0.22),
                           (0.0090, 0.0035, 0.0090), radius=0.0012, bevel=0.0004, steps=6)
        self.lens(group, x, z + height * 0.22, 'blue_led', 0.0026, self.front_y - 0.0055)
        for i, mat in enumerate(('green_led', 'green_led', 'amber_led', 'green_led')):
            self.lens(group, x - 0.0075 + i * 0.0050, z - height * 0.10, mat, 0.0013, self.front_y - 0.0048)
        self.rounded_prism(group, 'black_plastic', (x + 0.019, self.front_y - 0.0035, z - height * 0.26),
                           (0.0100, 0.0035, 0.0056), radius=0.0009, bevel=0.0003, steps=5)

    # ------------------------------------------------------------- devices

    def build_cable_manager(self, z: float, group: str) -> None:
        self.panel_shell(group, z, 1, 0.080, face=self.inset_material)
        self.rounded_prism(group, self.panel_material, (0, self.front_y - 0.0098, z), (0.398, 0.0038, 0.015),
                           radius=0.0035, bevel=0.0006, steps=8)
        for x in np.linspace(-0.180, 0.180, 12):
            self.front_cylinder(group, 'silver_plain', (float(x), self.front_y - 0.0136, z), 0.0040, 0.0038, 24)
            self.torus_front(group, 'silver_plain', (float(x), self.front_y - 0.0160, z - 0.009), 0.0100, 0.0016, 36, 8)

    def build_blank(self, z: float, u: int, group: str, vented: bool = False) -> None:
        """A blanking panel over unused rack units.

        Solid by default, because blocking air is the entire job: a gap in
        the front of a rack lets hot exhaust turn back through it into the
        intake above, and the machine reads its own waste heat as room air.
        A vented panel is a different product for a different problem, so
        it has to be asked for.

        Steel panels are pressed with stiffening ribs, without which a 4U
        sheet this thin would oil can every time somebody leaned on it.

        Painted to match the cabinet rather than the equipment, because a
        blanking panel is a rack accessory and is sold in the rack's own
        colour. Wearing the vendor's panel grey instead put a five unit
        pale slab down the middle of a black rack, which is the one thing
        a panel meant to disappear must not do.
        """
        self.panel_shell(group, z, u, 0.024, face=self.frame_material)
        if vented:
            self.perforations(group, 0, z, 0.360, u * U * 0.54, 44, max(2, u * 3),
                              y=self.front_y - 0.0060, radius=0.0011)
            return
        for i in range(u):
            rz = z + (i - (u - 1) / 2) * U
            self.rounded_prism(group, 'steel_plain', (0, self.front_y - 0.0044, rz),
                               (0.384, 0.0022, U * 0.30), radius=0.0016, bevel=0.0006, steps=5)

    def build_frame(self) -> None:
        """A full height 42U four post rack, not a studio frame on casters.

        Rails are punched three square holes per rack unit, which is what a
        rack rail actually is and what makes the height of everything
        mounted in it legible at a glance.
        """
        g = 'RACK_FRAME'
        W, D = 0.605, 0.940
        z0, z1 = 0.055, self.rail_top + 0.070
        post = 0.036
        xp, yp = W / 2 - post / 2, D / 2 - post / 2
        for x in (-xp, xp):
            for y in (-yp, yp):
                self.uv_box(g, self.frame_material, (x, y, (z0 + z1) / 2), (post, post, z1 - z0))
                self.box('FRAME_EDGE_HIGHLIGHTS', 'silver_highlight',
                         (x + (-0.011 if x > 0 else 0.011), y - (0.011 if y > 0 else -0.011), (z0 + z1) / 2),
                         (0.0018, 0.0018, z1 - z0 - 0.03))
        for z in (z0, z1):
            for y in (-yp, yp):
                self.uv_box(g, self.frame_material, (0, y, z), (W, post, post))
            for x in (-xp, xp):
                self.uv_box(g, self.frame_material, (x, 0, z), (post, D, post))
        # Front and rear mounting rails, punched at real 1U spacing: three
        # square holes per unit, which is what a rack rail actually is.
        for x in (-0.258, 0.258):
            for y in (self.front_y + 0.030, 0.330):
                self.uv_box('MOUNTING_RAILS', self.rail_material, (x, y, (RAIL_BOTTOM + self.rail_top) / 2),
                            (0.022, 0.022, self.rail_top - RAIL_BOTTOM + 0.02))
                for i in range(self.units):
                    base = RAIL_BOTTOM + i * U
                    for frac in (0.18, 0.5, 0.82):
                        self.rounded_prism('RACK_HOLES', 'black_matte',
                                           (x, y - 0.011 if y < 0 else y + 0.011, base + frac * U),
                                           (0.0062, 0.0024, 0.0060), radius=0.0008, bevel=0.0002, steps=4)
        for x in (-xp, xp):
            for z in np.linspace(0.30, self.rail_top - 0.10, max(3, self.units // 6)):
                self.uv_box('SIDE_BRACES', 'nexus_black', (x, 0, float(z)), (0.016, D - 0.060, 0.016))
        # Levelling feet, because a 42U rack does not roll around a studio.
        for x in (-xp, xp):
            for y in (-yp, yp):
                self.front_cylinder('SHELF_FEET', 'steel_plain', (x, y, z0 - 0.018), 0.020, 0.014, 28)
                self.cylinder_between('SHELF_FEET', 'nickel', (x, y, z0 - 0.030), (x, y, z0), 0.0075, 20)

    def build_casters(self) -> None:  # noqa: D102 - a 42U rack is bolted down.
        return
