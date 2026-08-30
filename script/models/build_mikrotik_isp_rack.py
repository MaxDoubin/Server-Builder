#!/usr/bin/env python3
"""A 24U MikroTik ISP rack.

Half the height of the enterprise racks, on purpose. A 42U cabinet is a
data centre object and a great deal of MikroTik is deployed in a wall
cabinet at the bottom of a tower, so drawing this one at 42U would be the
same mistake as drawing a UniFi studio frame as a data centre cabinet.

Three things here exist nowhere else in the library, and they are why the
rack is worth drawing at all:

  - A shelf with desktop units standing on it. Plenty of MikroTik has no
    rack ears, so it goes on a shelf, and a shelf of small boxes is the
    single most recognisable thing about a WISP rack.
  - A tray of half width units side by side. Two devices in one rack
    unit, which nothing else in this library does.
  - An optical distribution frame: a drawer of LC couplers where the
    fibre from outside terminates.

Port counts are MikroTik's published figures, cited in the rack's data
file. The CRS354 is 48 gigabit copper plus four SFP+ and two QSFP+; the
CRS518 is sixteen SFP28 and two QSFP28; the CCR2216 is one gigabit copper,
twelve SFP28 and two QSFP28.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import trimesh

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from build_enterprise_base import export_glb, EnterpriseRack, OUT, PANEL_W, U
from build_unifi_hero_rack_clean_aligned import pbr


class MikroTikIspRack(EnterpriseRack):
    units = 24
    frame_material = 'nexus_black_dark'
    panel_material = 'mt_black'
    inset_material = 'mt_black_dark'

    def __init__(self) -> None:
        super().__init__()
        # MikroTik's black is a low sheen powder coat, not anodised metal.
        # At the enterprise racks' metalness it took so much of the studio
        # environment that it rendered barely darker than Cisco's pale grey,
        # which is the one thing about the brand you cannot get wrong.
        self.materials.update({
            'mt_black': pbr('MikroTik Black', [26, 28, 31, 255], 0.14, 0.62),
            'mt_black_dark': pbr('MikroTik Black Shadow', [17, 18, 20, 255], 0.12, 0.70),
            'mt_white': pbr('RouterBOARD White', [222, 224, 222, 255], 0.06, 0.48),
            'mt_shelf': pbr('Shelf Steel', [92, 96, 100, 255], 0.62, 0.44),
        })

    # --------------------------------------------------------------- parts

    def led_strip(self, group: str, x0: float, x1: float, z: float, count: int, lit: int) -> None:
        """The row of pinhead LEDs MikroTik puts above its port field."""
        for i, x in enumerate(np.linspace(x0, x1, count)):
            mat = 'green_led' if i < lit else 'black_matte'
            self.lens(group, float(x), z, mat, 0.0011, self.front_y - 0.0048)

    def lc_coupler(self, group: str, x: float, z: float) -> None:
        """A duplex LC coupler: two bores in one snap-in body."""
        self.rounded_prism(group, 'mt_black_dark', (x, self.front_y - 0.0034, z),
                           (0.0126, 0.0038, 0.0102), radius=0.0008, bevel=0.0003, steps=5)
        for dx in (-0.0030, 0.0030):
            self.rounded_prism(group, 'black_plastic', (x + dx, self.front_y - 0.0058, z),
                               (0.0042, 0.0030, 0.0068), radius=0.0006, bevel=0.0002, steps=4)
            self.front_cylinder(group, 'nickel', (x + dx, self.front_y - 0.0072, z), 0.0013, 0.0016, 12)

    def desktop_unit(self, group: str, x: float, z: float, width: float, height: float,
                     ports: int, face: str = 'mt_black') -> None:
        """A box with no rack ears, standing on a shelf."""
        depth = 0.115
        self.rounded_prism(group, face, (x, self.front_y + 0.010 + depth / 2, z),
                           (width, depth, height), radius=0.0035, bevel=0.0012, steps=8)
        for i in range(ports):
            px = x - width * 0.5 + width * (i + 0.5) / ports
            self.rj45_socket(group, px, z - height * 0.10, plugged=(i < ports - 1), led=True)
        self.led_strip(group, x - width * 0.4, x + width * 0.4, z + height * 0.30, ports, ports - 1)
        # Four rubber feet, which is what makes it a desktop unit.
        for fx in (-0.4, 0.4):
            self.front_cylinder(group, 'rubber', (x + width * fx, self.front_y + 0.020, z - height * 0.52),
                                0.0030, 0.0022, 14)

    # ------------------------------------------------------------- devices

    def build_patch_panel(self, z: float, group: str, patched: int = 24) -> list[float]:
        self.panel_shell(group, z, 1, 0.060, face=self.inset_material)
        xs = [float(x) for x in np.linspace(-0.185, 0.160, 24)]
        for i, x in enumerate(xs):
            self.rj45_socket(group, x, z, plugged=i < patched, led=False,
                             plug_color='blue_cable' if i >= 18 else 'clear_plug')
        return xs

    def build_crs354(self, z: float) -> list[float]:
        """48 gigabit copper in two rows, four SFP+ and two QSFP+."""
        g = 'CRS354_48G'
        self.panel_shell(g, z, 1, 0.240)
        xs = []
        for col in range(24):
            x = -0.200 + col * 0.01430
            xs.append(x)
            for dz in (0.0092, -0.0092):
                self.rj45_socket(g, x, z + dz, plugged=(col < 20), led=True)
        for i in range(4):
            self.sfp_cage(g, 0.150 + i * 0.0195, z + 0.0092, transceiver=(i < 2), blue=(i == 0))
        for i in range(2):
            self.rounded_prism(g, 'nickel', (0.162 + i * 0.032, self.front_y - 0.009, z - 0.0092),
                               (0.0270, 0.0032, 0.0110), radius=0.0010, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (0.162 + i * 0.032, self.front_y - 0.0118, z - 0.0092),
                               (0.0220, 0.0032, 0.0080), radius=0.0006, bevel=0.0002, steps=5)
        return xs

    def build_crs326(self, z: float) -> list[float]:
        g = 'CRS326_24G'
        self.panel_shell(g, z, 1, 0.200)
        xs = [float(x) for x in np.linspace(-0.198, 0.086, 24)]
        for i, x in enumerate(xs):
            self.rj45_socket(g, x, z - 0.0022, plugged=(i < 16), led=True)
        self.led_strip(g, -0.198, 0.086, z + 0.0148, 24, 16)
        for i in range(2):
            self.sfp_cage(g, 0.128 + i * 0.0205, z - 0.0022, transceiver=(i == 0), blue=True)
        self.screen(g, 'pdu', 0.196, z, 0.026, 0.021)
        return xs

    def build_crs518(self, z: float) -> None:
        """Sixteen 25G and two 100G, and no copper at all."""
        g = 'CRS518_16XS'
        self.panel_shell(g, z, 1, 0.290)
        for i in range(16):
            self.sfp_cage(g, -0.196 + i * 0.0206, z - 0.0020, transceiver=(i % 3 != 2), blue=(i % 4 == 0))
        self.led_strip(g, -0.196, 0.113, z + 0.0150, 16, 11)
        for i in range(2):
            self.rounded_prism(g, 'nickel', (0.156 + i * 0.033, self.front_y - 0.009, z),
                               (0.0280, 0.0032, 0.0122), radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (0.156 + i * 0.033, self.front_y - 0.0118, z),
                               (0.0230, 0.0032, 0.0090), radius=0.0007, bevel=0.0002, steps=5)

    def build_ccr2216(self, z: float) -> None:
        g = 'CCR2216_12XS'
        self.panel_shell(g, z, 1, 0.320)
        self.rj45_socket(g, -0.204, z, plugged=True, led=True)
        for i in range(12):
            self.sfp_cage(g, -0.170 + i * 0.0212, z, transceiver=(i < 8), blue=(i % 3 == 0))
        for i in range(2):
            self.rounded_prism(g, 'nickel', (0.126 + i * 0.033, self.front_y - 0.009, z),
                               (0.0280, 0.0032, 0.0122), radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (0.126 + i * 0.033, self.front_y - 0.0118, z),
                               (0.0230, 0.0032, 0.0090), radius=0.0007, bevel=0.0002, steps=5)
        self.screen(g, 'chassis', 0.202, z, 0.030, 0.024)

    def build_ccr2004(self, z: float) -> None:
        g = 'CCR2004_12S'
        self.panel_shell(g, z, 1, 0.290)
        self.rj45_socket(g, -0.204, z, plugged=True, led=True)
        for i in range(12):
            self.sfp_cage(g, -0.170 + i * 0.0212, z, transceiver=(i < 7), blue=(i % 4 == 0))
        for i in range(2):
            self.sfp_cage(g, 0.120 + i * 0.0215, z, transceiver=True, blue=True)
        self.screen(g, 'pdu', 0.196, z, 0.028, 0.022)

    def build_netpower(self, z: float) -> None:
        g = 'NETPOWER_16P'
        self.panel_shell(g, z, 1, 0.180)
        for i in range(16):
            self.rj45_socket(g, -0.196 + i * 0.0168, z - 0.0022, plugged=(i < 10), led=True)
        self.led_strip(g, -0.196, 0.056, z + 0.0148, 16, 10)
        for i in range(2):
            self.sfp_cage(g, 0.100 + i * 0.0205, z - 0.0022, transceiver=(i == 0), blue=True)
        self.perforations(g, 0.176, z, 0.070, 0.024, 12, 4)

    def build_desktop_shelf(self, z: float) -> None:
        """The signature: a shelf of units that have no rack ears at all."""
        g = 'DESKTOP_SHELF'
        # The shelf itself: a folded steel tray with a lip.
        self.rounded_prism(g, 'mt_shelf', (0, self.front_y + 0.140, z - U * 0.42),
                           (PANEL_W - 0.012, 0.270, 0.0035), radius=0.0012, bevel=0.0005, steps=5)
        self.rounded_prism(g, 'mt_shelf', (0, self.front_y + 0.008, z - U * 0.30),
                           (PANEL_W, 0.0075, U * 0.30), radius=0.0012, bevel=0.0005, steps=5)
        for x in (-0.222, 0.222):
            self.screw(g, x, z - U * 0.30)
        # An RB5009 in black metal, a hEX in white plastic, and an injector.
        self.desktop_unit(g, -0.132, z + U * 0.06, 0.148, U * 0.62, 6, face='mt_black')
        self.desktop_unit(g, 0.028, z + U * 0.02, 0.118, U * 0.46, 5, face='mt_white')
        self.rounded_prism(g, 'mt_black', (0.164, self.front_y + 0.055, z + U * 0.02),
                           (0.076, 0.090, U * 0.42), radius=0.0030, bevel=0.0010, steps=7)
        self.lens(g, 0.164, z + U * 0.14, 'green_led', 0.0016)

    def build_half_tray(self, z: float) -> None:
        """Two half width units in one rack unit, which nothing else does."""
        g = 'HALF_TRAY'
        self.panel_shell(g, z, 1, 0.030, face=self.inset_material)
        for side, gx in ((-1, -0.112), (1, 0.112)):
            self.rounded_prism(g, 'mt_black', (gx, self.front_y - 0.0022, z),
                               (0.196, 0.0090, U * 0.82), radius=0.0022, bevel=0.0008, steps=7)
            for i in range(5):
                self.sfp_cage(g, gx - 0.072 + i * 0.0215, z - 0.0018, transceiver=(i < 3), blue=(i == 0))
            self.rj45_socket(g, gx + 0.062, z - 0.0018, plugged=True, led=True)
            self.led_strip(g, gx - 0.072, gx + 0.062, z + 0.0140, 6, 4)
            self.screw(g, gx - 0.094, z)
            self.screw(g, gx + 0.094, z)

    def build_odf(self, z_top: float) -> None:
        """An optical distribution frame: where the fibre from outside lands."""
        g = 'FIBRE_ODF'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.290, face=self.inset_material)
        for row, dz in enumerate((h * 0.22, -h * 0.22)):
            for i in range(12):
                self.lc_coupler(g, -0.182 + i * 0.0332, z + dz)
        # The splice drawer handle.
        self.rounded_prism(g, 'mt_shelf', (0.196, self.front_y - 0.0064, z), (0.024, 0.0044, h * 0.52),
                           radius=0.0012, bevel=0.0005, steps=5)

    def build_pdu(self, z_top: float) -> None:
        g = 'MIKROTIK_PDU'
        h = 1 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 1, 0.110, face=self.inset_material)
        for col in range(8):
            self.nema_outlet(g, -0.170 + col * 0.0480, z, 0.030, 0.026, plugged=(col < 5))
        self.lens(g, 0.204, z, 'green_led', 0.0022)

    def build_ups(self, z_top: float) -> None:
        g = 'MIKROTIK_UPS'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.420, face=self.inset_material)
        self.screen(g, 'ups', -0.156, z, 0.056, 0.042)
        for i in range(3):
            self.lens(g, -0.096 + i * 0.014, z, 'green_led', 0.0020)
        self.perforations(g, 0.080, z, 0.200, 0.036, 28, 5)
        self.rounded_prism(g, 'mt_shelf', (0.204, self.front_y - 0.0064, z), (0.022, 0.0044, h * 0.44),
                           radius=0.0012, bevel=0.0005, steps=5)

    # --------------------------------------------------------------- build

    def build(self) -> trimesh.Scene:
        at = self.u_centre
        top = self.rail_top

        print('BUILD frame', flush=True)
        self.build_frame()

        print('BUILD access', flush=True)
        patch_a = self.build_patch_panel(at(0), 'PATCH_PANEL_A')
        crs354 = self.build_crs354(at(1))
        patch_b = self.build_patch_panel(at(2), 'PATCH_PANEL_B', patched=16)
        crs326 = self.build_crs326(at(3))
        self.build_cable_manager(at(4), 'CABLE_MANAGER_TOP')

        print('BUILD core', flush=True)
        self.build_crs518(at(5))
        self.build_ccr2216(at(6))
        self.build_ccr2004(at(7))
        self.build_netpower(at(8))

        print('BUILD shelf and tray', flush=True)
        self.build_desktop_shelf(at(9))
        self.build_half_tray(at(10))
        self.build_odf(top - 11 * U)
        self.build_cable_manager(at(13), 'CABLE_MANAGER_LOW')

        print('BUILD power', flush=True)
        self.build_pdu(top - 14 * U)
        self.build_ups(top - 15 * U)

        print('BUILD patch cables', flush=True)
        self.build_patch_cables(patch_a, crs354, patch_z=at(0), switch_z=at(1))
        self.build_patch_cables(patch_b[:16], crs326[:16], patch_z=at(2), switch_z=at(3))

        print('BUILD to_scene', flush=True)
        return self.to_scene()


if __name__ == '__main__':
    rack = MikroTikIspRack()
    scene = rack.build()
    out = OUT / 'MikroTik_ISP_24U.glb'
    export_glb(scene, out)
    faces = sum(len(g.faces) for g in scene.geometry.values())
    print(out)
    print(f'{faces:,} triangles, {len(scene.geometry)} geometry groups')
