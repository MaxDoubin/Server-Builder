#!/usr/bin/env python3
"""A 42U Juniper service provider edge rack.

Juniper's range splits differently from Cisco's, and the rack should show
that rather than restating it in a different grey. Two five rack unit
modular chassis sit in the middle of this one, an EX9204 switching and an
MX240 routing, and they are the reason the rack exists: everything above
them is access and leaf switching that feeds them, everything below is
security and power that serves them.

Published rack unit heights, cited in the rack's data file: the MX240 is
5U and the EX9204 is 5U, a four slot chassis with one dedicated host
subsystem slot, two dedicated line card slots and one multifunction slot
that takes either. QFX5120 and SRX4600 are both 1U.

The look is deliberately not Cisco's. Juniper ship graphite rather than
pale grey, their card handles are a long lever rather than a pair of
ejectors, and the status block sits to the right of the ports on the
switching platforms rather than to the left.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import trimesh

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from build_enterprise_base import OUT, PANEL_W, U, EnterpriseRack


class JuniperCoreRack(EnterpriseRack):
    frame_material = 'nexus_black_dark'
    panel_material = 'juniper_graphite'
    inset_material = 'juniper_graphite_dark'

    def juniper_badge(self, group: str, x: float, z: float) -> None:
        """The status block. Juniper put theirs to the right of the ports."""
        self.rounded_prism(group, 'nexus_black_dark', (x, self.front_y - 0.0032, z),
                           (0.0180, 0.0034, 0.0135), radius=0.0012, bevel=0.0004, steps=6)
        for i, mat in enumerate(('juniper_accent', 'green_led', 'amber_led')):
            self.lens(group, x - 0.0055 + i * 0.0055, z, mat, 0.0016, self.front_y - 0.0052)

    def card_lever(self, group: str, x: float, z: float, length: float) -> None:
        """A single long lever, which is how a Juniper card comes out."""
        self.rounded_prism(group, 'drive_handle', (x, self.front_y - 0.0068, z),
                           (0.0090, 0.0042, length), radius=0.0014, bevel=0.0005, steps=5)
        self.front_cylinder(group, 'nickel', (x, self.front_y - 0.0092, z + length * 0.36), 0.0030, 0.0028, 18)

    # ------------------------------------------------------------- devices

    def build_patch_panel(self, z: float, group: str, patched: int = 24) -> list[float]:
        self.panel_shell(group, z, 1, 0.060, face=self.inset_material)
        xs = [float(x) for x in np.linspace(-0.185, 0.160, 24)]
        for i, x in enumerate(xs):
            self.rj45_socket(group, x, z, plugged=i < patched, led=False,
                             plug_color='blue_cable' if i >= 18 else 'clear_plug')
        return xs

    def build_ex4400(self, z: float) -> list[float]:
        """48 PoE copper in two rows, with the uplink module at the right."""
        g = 'EX4400_48MP'
        self.panel_shell(g, z, 1, 0.440)
        xs = []
        for col in range(24):
            x = -0.196 + col * 0.01524
            xs.append(x)
            for dz in (0.0092, -0.0092):
                self.rj45_socket(g, x, z + dz, plugged=True, led=True,
                                 plug_color='blue_cable' if col >= 20 else 'clear_plug')
        self.rounded_prism(g, self.inset_material, (0.150, self.front_y - 0.0012, z), (0.104, 0.0090, U * 0.86),
                           radius=0.0014, bevel=0.0005, steps=6)
        for i in range(2):
            for dz in (0.0092, -0.0092):
                self.sfp_cage(g, 0.118 + i * 0.0230, z + dz, transceiver=(i == 0), blue=(i == 0))
        self.juniper_badge(g, 0.212, z)
        return xs

    def build_ex4300(self, z: float) -> list[float]:
        g = 'EX4300_48T'
        self.panel_shell(g, z, 1, 0.440)
        xs = []
        for col in range(24):
            x = -0.196 + col * 0.01524
            xs.append(x)
            for dz in (0.0092, -0.0092):
                self.rj45_socket(g, x, z + dz, plugged=(col < 16), led=True)
        for i in range(2):
            self.rounded_prism(g, 'nickel', (0.140 + i * 0.032, self.front_y - 0.009, z), (0.0270, 0.0032, 0.0126),
                               radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (0.140 + i * 0.032, self.front_y - 0.0118, z),
                               (0.0220, 0.0032, 0.0092), radius=0.0007, bevel=0.0002, steps=5)
        self.juniper_badge(g, 0.212, z)
        return xs

    def build_qfx5120(self, z: float, group: str) -> None:
        """A leaf switch: 48 SFP28 and eight 100G, no copper on it at all."""
        self.panel_shell(group, z, 1, 0.460)
        for col in range(24):
            x = -0.200 + col * 0.01330
            for dz in (0.0094, -0.0094):
                self.sfp_cage(group, x, z + dz, transceiver=(col % 3 != 2), blue=(col % 4 == 0))
        for i in range(4):
            x = 0.132 + (i % 2) * 0.029
            dz = 0.0094 if i < 2 else -0.0094
            self.rounded_prism(group, 'nickel', (x, self.front_y - 0.009, z + dz), (0.0250, 0.0032, 0.0124),
                               radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(group, 'black_plastic', (x, self.front_y - 0.0118, z + dz),
                               (0.0205, 0.0032, 0.0090), radius=0.0007, bevel=0.0002, steps=5)
        self.juniper_badge(group, 0.212, z)

    def build_qfx5220(self, z: float) -> None:
        """A spine: 32 QSFP28-DD cages and nothing else on the face."""
        g = 'QFX5220_32CD'
        self.panel_shell(g, z, 1, 0.480, face='nexus_black')
        for col in range(16):
            x = -0.196 + col * 0.02250
            for dz in (0.0095, -0.0095):
                self.rounded_prism(g, 'nickel', (x, self.front_y - 0.009, z + dz), (0.0206, 0.0032, 0.0124),
                                   radius=0.0010, bevel=0.0004, steps=5)
                self.rounded_prism(g, 'black_plastic', (x, self.front_y - 0.0118, z + dz),
                                   (0.0170, 0.0032, 0.0090), radius=0.0006, bevel=0.0002, steps=5)
                if col % 2 == 0:
                    self.rounded_prism(g, 'steel_plain', (x, self.front_y - 0.0152, z + dz),
                                       (0.0164, 0.0064, 0.0084), radius=0.0006, bevel=0.0002, steps=5)
                    self.lens(g, x + 0.0074, z + dz + 0.0046, 'green_led', 0.0007, self.front_y - 0.0152)
        self.juniper_badge(g, 0.212, z)

    def build_ex9204(self, z_top: float) -> None:
        """5U modular switch: one host subsystem, two line cards, one either."""
        g = 'EX9204'
        h = 5 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 5, 0.500)
        slot_h = h * 0.165
        for i in range(4):
            cz = z + h * 0.285 - i * (slot_h + h * 0.020)
            host = i == 0
            self.rounded_prism(g, self.inset_material, (0.004, self.front_y - 0.0022, cz),
                               (0.404, 0.0072, slot_h), radius=0.0014, bevel=0.0005, steps=6)
            self.card_lever(g, -0.198, cz, slot_h * 0.80)
            self.card_lever(g, 0.206, cz, slot_h * 0.80)
            if host:
                self.screen(g, 'chassis', -0.150, cz, 0.042, slot_h * 0.46)
                for k in range(2):
                    self.rj45_socket(g, -0.096 + k * 0.0172, cz, plugged=(k == 0), led=True)
                for k in range(2):
                    self.sfp_cage(g, -0.040 + k * 0.0220, cz, transceiver=True, blue=True)
                self.juniper_badge(g, 0.020, cz)
            else:
                for k in range(12):
                    self.sfp_cage(g, -0.176 + k * 0.0250, cz, transceiver=(k % 3 != 2), blue=(k % 4 == 0))
                self.perforations(g, 0.150, cz, 0.070, slot_h * 0.5, 12, 3, y=self.front_y - 0.0066)
        # Power bay across the bottom.
        for px in (-0.108, 0.108):
            pz = z - h * 0.36
            self.rounded_prism(g, self.inset_material, (px, self.front_y - 0.0022, pz),
                               (0.196, 0.0072, h * 0.20), radius=0.0016, bevel=0.0006, steps=6)
            self.fan(g, px - 0.054, pz, 0.017)
            self.card_lever(g, px + 0.062, pz, 0.020)
            self.nema_outlet(g, px + 0.022, pz, 0.020, 0.018, plugged=True)

    def build_mx240(self, z_top: float) -> None:
        """5U modular router: MPC slots over a card cage and a fan tray."""
        g = 'MX240'
        h = 5 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 5, 0.510, face='nexus_black')
        slot_h = h * 0.215
        for i in range(3):
            cz = z + h * 0.26 - i * (slot_h + h * 0.022)
            self.rounded_prism(g, 'nexus_black_dark', (-0.030, self.front_y - 0.0022, cz),
                               (0.336, 0.0072, slot_h), radius=0.0014, bevel=0.0005, steps=6)
            self.card_lever(g, -0.194, cz, slot_h * 0.78)
            self.card_lever(g, 0.128, cz, slot_h * 0.78)
            if i == 2:
                # The routing engine: a console, management copper, a screen.
                self.screen(g, 'chassis', -0.148, cz, 0.040, slot_h * 0.40)
                for k in range(2):
                    self.rj45_socket(g, -0.096 + k * 0.0172, cz, plugged=(k == 0), led=True)
                self.juniper_badge(g, -0.040, cz)
            else:
                for k in range(8):
                    self.sfp_cage(g, -0.160 + k * 0.0268, cz, transceiver=(k % 2 == 0), blue=(k == 0))
                for k in range(2):
                    self.rounded_prism(g, 'nickel', (0.048 + k * 0.030, self.front_y - 0.009, cz),
                                       (0.0250, 0.0032, 0.0124), radius=0.0011, bevel=0.0004, steps=5)
                    self.rounded_prism(g, 'black_plastic', (0.048 + k * 0.030, self.front_y - 0.0118, cz),
                                       (0.0205, 0.0032, 0.0090), radius=0.0007, bevel=0.0002, steps=5)
        # The fan tray is a tall column on the right of an MX240, not a
        # row along the bottom, and it is the fastest way to tell the
        # chassis apart from a switch of the same height.
        self.rounded_prism(g, 'nexus_black_dark', (0.176, self.front_y - 0.0022, z + h * 0.06),
                           (0.078, 0.0072, h * 0.74), radius=0.0016, bevel=0.0006, steps=6)
        for k in range(3):
            self.fan(g, 0.176, z + h * 0.30 - k * h * 0.24, 0.022)
        # Power supplies along the bottom.
        for px in (-0.150, -0.050, 0.050):
            pz = z - h * 0.38
            self.rounded_prism(g, 'nexus_black_dark', (px, self.front_y - 0.0022, pz),
                               (0.094, 0.0072, h * 0.16), radius=0.0014, bevel=0.0005, steps=6)
            self.lens(g, px - 0.032, pz, 'green_led', 0.0016)
            self.nema_outlet(g, px + 0.018, pz, 0.019, 0.017, plugged=True)

    def build_mx204(self, z: float) -> None:
        g = 'MX204'
        self.panel_shell(g, z, 1, 0.440, face='nexus_black')
        for i in range(4):
            self.rounded_prism(g, 'nickel', (-0.190 + i * 0.031, self.front_y - 0.009, z),
                               (0.0270, 0.0032, 0.0126), radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (-0.190 + i * 0.031, self.front_y - 0.0118, z),
                               (0.0220, 0.0032, 0.0092), radius=0.0007, bevel=0.0002, steps=5)
        for i in range(8):
            self.sfp_cage(g, -0.050 + i * 0.0230, z, transceiver=(i < 5), blue=(i == 0))
        self.juniper_badge(g, 0.196, z)

    def build_srx4600(self, z: float) -> None:
        g = 'SRX4600'
        self.panel_shell(g, z, 1, 0.470, face='nexus_black')
        for i in range(4):
            self.rounded_prism(g, 'nickel', (-0.192 + i * 0.031, self.front_y - 0.009, z),
                               (0.0270, 0.0032, 0.0126), radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (-0.192 + i * 0.031, self.front_y - 0.0118, z),
                               (0.0220, 0.0032, 0.0092), radius=0.0007, bevel=0.0002, steps=5)
        for i in range(8):
            self.sfp_cage(g, -0.048 + i * 0.0225, z, transceiver=(i < 4), blue=(i == 0))
        self.perforations(g, 0.176, z, 0.056, 0.024, 9, 4)
        self.juniper_badge(g, 0.214, z)

    def build_srx1500(self, z: float) -> None:
        g = 'SRX1500'
        self.panel_shell(g, z, 1, 0.430, face='nexus_black')
        for i in range(16):
            self.rj45_socket(g, -0.196 + i * 0.0168, z, plugged=(i < 8), led=True)
        for i in range(4):
            self.sfp_cage(g, 0.098 + i * 0.0225, z, transceiver=(i < 2))
        self.juniper_badge(g, 0.214, z)

    def build_console_server(self, z: float) -> None:
        g = 'CONSOLE_SERVER'
        self.panel_shell(g, z, 1, 0.240, face=self.inset_material)
        for i in range(16):
            self.rj45_socket(g, -0.196 + i * 0.0168, z, plugged=(i < 11), led=True)
        self.rj45_socket(g, 0.140, z, plugged=True, led=True)
        self.perforations(g, 0.196, z, 0.048, 0.022, 8, 4)

    def build_pdu(self, z_top: float) -> None:
        g = 'JUNIPER_PDU'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.120, face='nexus_black')
        for row in range(2):
            for col in range(8):
                self.nema_outlet(g, -0.164 + col * 0.0468, z + (h * 0.20 if row == 0 else -h * 0.20),
                                 0.030, 0.026, plugged=(col < 4))
        self.screen(g, 'pdu', 0.196, z, 0.030, 0.024)

    def build_ups(self, z_top: float) -> None:
        g = 'JUNIPER_UPS'
        h = 4 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 4, 0.640, face='nexus_black')
        self.screen(g, 'ups', -0.150, z + h * 0.18, 0.062, 0.046)
        for i in range(4):
            self.lens(g, -0.070 + i * 0.014, z + h * 0.18, 'green_led', 0.0022)
        self.perforations(g, 0.090, z + h * 0.18, 0.190, 0.034, 26, 5)
        self.rounded_prism(g, 'nexus_black_dark', (0, self.front_y - 0.0024, z - h * 0.24),
                           (0.400, 0.0072, h * 0.40), radius=0.0018, bevel=0.0006, steps=6)
        self.card_lever(g, 0, z - h * 0.24, 0.010)

    # --------------------------------------------------------------- build

    def build(self) -> trimesh.Scene:
        at = self.u_centre
        top = self.rail_top

        print('BUILD frame', flush=True)
        self.build_frame()

        print('BUILD access', flush=True)
        patch_a = self.build_patch_panel(at(0), 'PATCH_PANEL_A')
        ex4400 = self.build_ex4400(at(1))
        patch_b = self.build_patch_panel(at(2), 'PATCH_PANEL_B', patched=16)
        ex4300 = self.build_ex4300(at(3))
        self.build_cable_manager(at(4), 'CABLE_MANAGER_TOP')

        print('BUILD fabric', flush=True)
        self.build_qfx5120(at(5), 'QFX5120_A')
        self.build_qfx5120(at(6), 'QFX5120_B')
        self.build_qfx5220(at(7))
        self.build_cable_manager(at(8), 'CABLE_MANAGER_MID')

        print('BUILD chassis', flush=True)
        self.build_ex9204(top - 9 * U)
        self.build_mx240(top - 14 * U)

        print('BUILD edge', flush=True)
        self.build_mx204(at(19))
        self.build_srx4600(at(20))
        self.build_srx1500(at(21))
        self.build_console_server(at(22))
        self.build_blank(at(23), 2, 'BLANK_MID')

        # Nothing below the UPS. Eleven units of open rack is where the
        # cold air comes in, and it is what the bottom of a real rack looks
        # like once the kit that pays for it has been installed.
        print('BUILD power', flush=True)
        self.build_pdu(top - 25 * U)
        self.build_ups(top - 27 * U)

        print('BUILD patch cables', flush=True)
        self.build_patch_cables(patch_a, ex4400, patch_z=at(0), switch_z=at(1))
        self.build_patch_cables(patch_b[:16], ex4300[:16], patch_z=at(2), switch_z=at(3))

        print('BUILD to_scene', flush=True)
        return self.to_scene()


if __name__ == '__main__':
    rack = JuniperCoreRack()
    scene = rack.build()
    out = OUT / 'Juniper_Core_42U.glb'
    out.write_bytes(scene.export(file_type='glb'))
    faces = sum(len(g.faces) for g in scene.geometry.values())
    print(out)
    print(f'{faces:,} triangles, {len(scene.geometry)} geometry groups')
