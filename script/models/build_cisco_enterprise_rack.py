#!/usr/bin/env python3
"""A full 42U Cisco enterprise rack.

Built on the same part library as the UniFi hero rack, and deliberately
not the same shape. The UniFi rack is a shallow studio frame of ten
similar 1U boxes; a Cisco rack is the opposite, and drawing it the same
way would throw away everything that makes it recognisable:

  - A 6RU modular chassis with horizontal line cards and its own power bay
  - A 6RU blade chassis: eight half-width blades over four front supplies
  - Fiber-only spines that have no copper on them at all
  - Rack servers whose entire front is drive bays
  - And, yes, ordinary copper access switches

Every height below is Cisco's published RU figure. The 9404R is 6RU, the
9407R is 10RU and the 9410R is 13RU; the UCS 5108 is 6RU with eight
half-width slots and four front-accessible supplies. Sources are in the
rack's data file alongside the port counts.

Front panel conventions taken from Cisco's own hardware guides: the
Catalyst 9300 puts the beacon/UID button and status LEDs at the far left,
the USB console beside them, the downlink field in the middle and the
uplink network module bay at the far right.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np
import trimesh
from trimesh.visual.material import PBRMaterial

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from build_enterprise_base import export_glb, EnterpriseRack, OUT, PANEL_W, U

CHASSIS_DEPTH_DEEP = 0.815


class CiscoEnterpriseRack(EnterpriseRack):
    scene_title = 'Cisco Enterprise Rack, 42U'
    """Cisco's range, drawn to show how little of it looks alike."""

    frame_material = 'nexus_black'
    panel_material = 'cisco_grey'
    inset_material = 'cisco_grey_dark'

    # ------------------------------------------------------------- devices

    def build_patch_panel(self, z: float, group: str, patched: int = 24) -> list[float]:
        self.panel_shell(group, z, 1, 0.060, face='cisco_grey_dark')
        xs = list(np.linspace(-0.185, 0.160, 24))
        for i, x in enumerate(xs):
            self.rj45_socket(group, float(x), z, plugged=i < patched, led=False,
                             plug_color='blue_cable' if i >= 18 else 'clear_plug')
        return [float(x) for x in xs]

    def build_c9300_48p(self, z: float) -> list[float]:
        """48 PoE+ copper in two rows, with the uplink module bay at the right."""
        g = 'C9300_48P'
        self.panel_shell(g, z, 1, 0.445)
        h = U
        self.status_cluster(g, -0.209, z, h)
        xs = []
        for col in range(24):
            x = -0.176 + col * 0.01524
            xs.append(x)
            for row, dz in enumerate((0.0092, -0.0092)):
                self.rj45_socket(g, x, z + dz, plugged=True, led=True,
                                 plug_color='blue_cable' if col >= 20 else 'clear_plug')
        # The C9300-NM-8X uplink module: its own faceplate seam, then optics.
        self.rounded_prism(g, 'cisco_grey_dark', (0.160, self.front_y - 0.0012, z), (0.126, 0.0090, h * 0.86),
                           radius=0.0015, bevel=0.0006, steps=6)
        for i in range(4):
            for dz in (0.0092, -0.0092):
                self.sfp_cage(g, 0.116 + i * 0.0225, z + dz, transceiver=(i < 2), blue=(i == 0))
        return xs

    def build_c9300_24p(self, z: float) -> list[float]:
        g = 'C9300_24P'
        self.panel_shell(g, z, 1, 0.445)
        self.status_cluster(g, -0.209, z, U)
        xs = [float(x) for x in np.linspace(-0.176, 0.100, 24)]
        for i, x in enumerate(xs):
            self.rj45_socket(g, x, z, plugged=i < 14, led=True)
        self.rounded_prism(g, 'cisco_grey_dark', (0.176, self.front_y - 0.0012, z), (0.092, 0.0090, U * 0.86),
                           radius=0.0015, bevel=0.0006, steps=6)
        for i in range(4):
            self.sfp_cage(g, 0.146 + i * 0.0200, z, transceiver=(i == 0))
        return xs

    def build_c9500(self, z: float) -> None:
        """A fiber core switch: 48 SFP28 and four 100G, no copper at all."""
        g = 'C9500_48Y4C'
        self.panel_shell(g, z, 1, 0.460)
        self.status_cluster(g, -0.209, z, U)
        for col in range(24):
            x = -0.178 + col * 0.01380
            for dz in (0.0094, -0.0094):
                self.sfp_cage(g, x, z + dz, transceiver=(col % 3 != 2), blue=(col % 6 == 0))
        for i in range(4):
            # 100G QSFP28 cages are wider than SFP28 and sit on their own.
            x = 0.164 + (i % 2) * 0.030
            dz = 0.0094 if i < 2 else -0.0094
            self.rounded_prism(g, 'nickel', (x, self.front_y - 0.009, z + dz), (0.026, 0.0032, 0.0125),
                               radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (x, self.front_y - 0.0118, z + dz), (0.0215, 0.0032, 0.0092),
                               radius=0.0007, bevel=0.0002, steps=5)
            self.lens(g, x + 0.0095, z + dz + 0.0048, 'green_led', 0.0007, self.front_y - 0.0125)

    def build_nexus(self, z: float) -> None:
        """A spine switch: 36 QSFP28 in two rows, black, fiber only."""
        g = 'NEXUS_9336C'
        self.panel_shell(g, z, 1, 0.485, face='nexus_black')
        self.status_cluster(g, -0.209, z, U)
        for col in range(18):
            x = -0.176 + col * 0.01950
            for dz in (0.0095, -0.0095):
                self.rounded_prism(g, 'nickel', (x, self.front_y - 0.009, z + dz), (0.0182, 0.0032, 0.0122),
                                   radius=0.0010, bevel=0.0004, steps=5)
                self.rounded_prism(g, 'black_plastic', (x, self.front_y - 0.0118, z + dz), (0.0148, 0.0032, 0.0088),
                                   radius=0.0006, bevel=0.0002, steps=5)
                if col % 2 == 0:
                    self.rounded_prism(g, 'steel_plain', (x, self.front_y - 0.0150, z + dz),
                                       (0.0142, 0.0060, 0.0082), radius=0.0006, bevel=0.0002, steps=5)
                    self.lens(g, x + 0.0064, z + dz + 0.0046, 'green_led', 0.0007, self.front_y - 0.0150)

    def build_ucs6536(self, z: float, group: str) -> None:
        """A fabric interconnect: 36 QSFP28, and the L1/L2 pair that clusters it.

        A UCS 5108 has a passive midplane and no embedded switch. Cisco's
        own datasheet puts it plainly: the chassis "has no need for
        independent management". Its two I/O bays take fabric extenders,
        which is to say the chassis is only ever half of a thing, and the
        other half is a pair of these, where UCS Manager runs and where
        every blade's uplink terminates.

        The exception is worth knowing, because it is the reason "a 5108
        cannot run alone" is too strong: those same I/O bays will take a
        6324 instead, which is a fabric interconnect small enough to live
        in the chassis, and that configuration needs nothing outside it.
        This rack has neither, which is the actual fault, and drawing the
        pair is the ordinary way to fix it rather than the only way.

        The two sockets beside the status block are what the pair is for. L1
        to L1 and L2 to L2, patched directly between the two units and to
        nothing else, is the cluster link the pair elects a primary over.
        They are also the clearest way to tell a fabric interconnect from
        the spine switch six units up, which has the same 36 cages in the
        same two rows and no notion of a partner at all.

        Ports are numbered up each column, so the pair at the far left is 1
        and 2 and the pair at the far right is 35 and 36. That puts the four
        unified ports, 33 to 36, in the last two columns, under the painted
        band, which is the only thing on the face that says those four can be
        Fibre Channel and the other 32 cannot.
        """
        g = group
        self.panel_shell(g, z, 1, 0.495, face='ucs_grey')
        self.status_cluster(g, -0.209, z, U)

        # L1, L2, then out of band management. The first two are the cluster
        # heartbeat and are always patched to the other unit, so they carry
        # the same short blue cable at both ends.
        for i, x in enumerate((-0.190, -0.172, -0.154)):
            self.rj45_socket(g, x, z, plugged=True, led=True,
                             plug_color='blue_cable' if i < 2 else 'clear_plug')

        for col in range(18):
            x = -0.128 + col * 0.0182
            for row, dz in enumerate((0.0095, -0.0095)):
                self.rounded_prism(g, 'nickel', (x, self.front_y - 0.009, z + dz),
                                   (0.0166, 0.0032, 0.0122), radius=0.0010, bevel=0.0004, steps=5)
                self.rounded_prism(g, 'black_plastic', (x, self.front_y - 0.0118, z + dz),
                                   (0.0134, 0.0032, 0.0088), radius=0.0006, bevel=0.0002, steps=5)
                # Ports 1 to 4 to the blade chassis I/O modules, 5 to 7 to
                # the three rack servers, 31 and 32 north to the spine. Server
                # ports take the low numbers and uplinks the high ones, which
                # is the convention rather than a requirement. The rest of the
                # face is spare, which is what a real one looks like.
                if col < 3 or (col == 3 and row == 0) or col == 15:
                    self.rounded_prism(g, 'steel_plain', (x, self.front_y - 0.0150, z + dz),
                                       (0.0128, 0.0060, 0.0082), radius=0.0006, bevel=0.0002, steps=5)
                    self.lens(g, x + 0.0058, z + dz + 0.0046, 'green_led', 0.0007, self.front_y - 0.0150)

        # A painted band between the two rows, spanning the last two columns.
        # The unified ports are physically the same cage as the other thirty
        # two and a real one tells them apart with a marking rather than a
        # different connector, so this is a stripe on the panel and not a
        # coloured throat: colouring the hole would read as a fitted optic.
        self.box(g, 'unified_throat', (-0.128 + 16.5 * 0.0182, self.front_y - 0.0062, z),
                 (0.0182 * 2 + 0.0030, 0.0010, 0.0016))

    def build_c9404r(self, z_top: float) -> None:
        """The 6RU modular chassis: horizontal line cards over a power bay.

        This is the shape that makes a Cisco rack a Cisco rack. Cards slide
        in horizontally and stack, so the front is four wide slots with a
        handle and an ejector at each end, and the supplies live in their
        own bay along the bottom.
        """
        g = 'C9404R'
        h = 6 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 6, 0.470, face='cisco_grey')
        # Four horizontal slots: two supervisors in the middle, line cards
        # above and below, which is the published slot assignment.
        slot_h = h * 0.135
        for i in range(4):
            cz = z + h * 0.30 - i * (slot_h + h * 0.028)
            supervisor = i in (1, 2)
            self.rounded_prism(g, 'cisco_grey_dark', (0.006, self.front_y - 0.0022, cz),
                               (0.402, 0.0072, slot_h), radius=0.0016, bevel=0.0006, steps=6)
            # Ejector levers at both ends of every card.
            for lx in (-0.196, 0.208):
                self.rounded_prism(g, 'drive_handle', (lx, self.front_y - 0.0064, cz),
                                   (0.0075, 0.0040, slot_h * 0.82), radius=0.0012, bevel=0.0004, steps=5)
                self.screw(g, lx, cz, y=self.front_y - 0.0090, radius=0.0022)
            if supervisor:
                self.screen(g, 'chassis', -0.150, cz, 0.040, slot_h * 0.44)
                for k in range(4):
                    self.sfp_cage(g, -0.088 + k * 0.0210, cz, transceiver=(k < 2), blue=(k == 0))
                for k in range(2):
                    self.rj45_socket(g, 0.020 + k * 0.0170, cz, plugged=False, led=True)
                self.lens(g, 0.070, cz + slot_h * 0.28, 'blue_led', 0.0022)
            else:
                for k in range(24):
                    self.rj45_socket(g, -0.176 + k * 0.01524, cz, plugged=(k < 16), led=True)
        # Power bay along the bottom: two supplies with their own handles.
        for i, px in enumerate((-0.105, 0.105)):
            pz = z - h * 0.36
            self.rounded_prism(g, 'cisco_grey_dark', (px, self.front_y - 0.0022, pz),
                               (0.195, 0.0072, h * 0.20), radius=0.0018, bevel=0.0007, steps=6)
            self.fan(g, px - 0.052, pz, 0.016)
            self.rounded_prism(g, 'drive_handle', (px + 0.058, self.front_y - 0.0068, pz),
                               (0.050, 0.0044, 0.0090), radius=0.0016, bevel=0.0005, steps=5)
            self.lens(g, px + 0.030, pz + h * 0.055, 'green_led', 0.0016)
            self.nema_outlet(g, px + 0.030, pz - h * 0.055, 0.020, 0.018, plugged=True)

    def build_ucs5108(self, z_top: float) -> None:
        """6RU blade chassis: eight half-width bays over four front supplies."""
        g = 'UCS_5108'
        h = 6 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 6, 0.815, face='ucs_grey')
        # Eight half-width blades, four across and two high.
        bay_w = 0.0985
        bay_h = h * 0.29
        for row in range(2):
            for col in range(4):
                bx = -0.1665 + col * (bay_w + 0.013)
                bz = z + h * 0.30 - row * (bay_h + h * 0.035)
                self.rounded_prism(g, 'ucs_bezel', (bx, self.front_y - 0.0024, bz),
                                   (bay_w, 0.0076, bay_h), radius=0.0020, bevel=0.0007, steps=6)
                # Each blade shows two drive carriers, a handle and its LEDs.
                for k in range(2):
                    self.rounded_prism(g, 'drive_face', (bx - 0.028 + k * 0.030, self.front_y - 0.0064, bz + bay_h * 0.14),
                                       (0.026, 0.0040, bay_h * 0.34), radius=0.0010, bevel=0.0004, steps=5)
                    self.lens(g, bx - 0.038 + k * 0.030, bz + bay_h * 0.14, 'green_led', 0.0011, self.front_y - 0.0088)
                self.rounded_prism(g, 'drive_handle', (bx + 0.030, self.front_y - 0.0072, bz - bay_h * 0.26),
                                   (0.032, 0.0044, 0.0075), radius=0.0014, bevel=0.0005, steps=5)
                self.perforations(g, bx - 0.006, bz - bay_h * 0.30, 0.052, 0.010, 12, 2,
                                  y=self.front_y - 0.0070, radius=0.0009)
                for k, mat in enumerate(('green_led', 'blue_led')):
                    self.lens(g, bx + 0.0435, bz + bay_h * 0.30 - k * 0.006, mat, 0.0012, self.front_y - 0.0070)
        # Four front-accessible supplies across the bottom.
        for i in range(4):
            px = -0.1665 + i * 0.111
            pz = z - h * 0.37
            self.rounded_prism(g, 'ucs_bezel', (px, self.front_y - 0.0024, pz),
                               (0.104, 0.0076, h * 0.17), radius=0.0018, bevel=0.0006, steps=6)
            self.fan(g, px - 0.024, pz, 0.017)
            self.rounded_prism(g, 'drive_handle', (px + 0.030, self.front_y - 0.0070, pz),
                               (0.038, 0.0042, 0.0080), radius=0.0014, bevel=0.0005, steps=5)
            self.lens(g, px + 0.030, pz + h * 0.048, 'green_led', 0.0015)

    def build_ucs_c240(self, z_top: float) -> None:
        """2RU rack server: 24 small form factor bays in a three by eight grid."""
        g = 'UCS_C240'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.760, face='ucs_grey')
        for row in range(3):
            for col in range(8):
                bx = -0.150 + col * 0.0345
                bz = z + h * 0.26 - row * h * 0.26
                self.rounded_prism(g, 'drive_face', (bx, self.front_y - 0.0028, bz),
                                   (0.0300, 0.0072, h * 0.222), radius=0.0009, bevel=0.0004, steps=5)
                self.rounded_prism(g, 'drive_handle', (bx - 0.0115, self.front_y - 0.0068, bz),
                                   (0.0044, 0.0040, h * 0.180), radius=0.0008, bevel=0.0003, steps=4)
                self.lens(g, bx + 0.0110, bz + h * 0.070, 'green_led', 0.0011, self.front_y - 0.0072)
                self.lens(g, bx + 0.0110, bz - h * 0.070, 'blue_led', 0.0009, self.front_y - 0.0072)
        # Control panel on the right: power, ID, KVM.
        self.rounded_prism(g, 'ucs_bezel', (0.185, self.front_y - 0.0026, z), (0.052, 0.0074, h * 0.80),
                           radius=0.0016, bevel=0.0006, steps=6)
        self.power_button(g, 0.185, z + h * 0.22, radius=0.010)
        self.rounded_prism(g, 'black_plastic', (0.185, self.front_y - 0.0060, z - h * 0.18),
                           (0.026, 0.0040, 0.0110), radius=0.0010, bevel=0.0003, steps=5)

    def build_ucs_c220(self, z: float, group: str) -> None:
        """1RU rack server: ten small form factor bays in a single row."""
        self.panel_shell(group, z, 1, 0.760, face='ucs_grey')
        for col in range(10):
            bx = -0.150 + col * 0.0300
            self.rounded_prism(group, 'drive_face', (bx, self.front_y - 0.0028, z),
                               (0.0262, 0.0072, U * 0.70), radius=0.0009, bevel=0.0004, steps=5)
            self.rounded_prism(group, 'drive_handle', (bx - 0.0100, self.front_y - 0.0068, z),
                               (0.0040, 0.0040, U * 0.56), radius=0.0007, bevel=0.0003, steps=4)
            self.lens(group, bx + 0.0096, z + U * 0.20, 'green_led', 0.0010, self.front_y - 0.0072)
        self.rounded_prism(group, 'ucs_bezel', (0.185, self.front_y - 0.0026, z), (0.052, 0.0074, U * 0.78),
                           radius=0.0014, bevel=0.0005, steps=6)
        self.power_button(group, 0.178, z, radius=0.009)

    def build_asr1001x(self, z: float) -> None:
        g = 'ASR_1001X'
        self.panel_shell(g, z, 1, 0.470)
        self.status_cluster(g, -0.209, z, U)
        for i in range(6):
            self.sfp_cage(g, -0.150 + i * 0.0215, z, transceiver=(i < 3), blue=(i == 0))
        for i in range(2):
            self.rj45_socket(g, 0.010 + i * 0.0170, z, plugged=(i == 0), led=True)
        self.perforations(g, 0.130, z, 0.110, 0.024, 18, 4)

    def build_isr4451(self, z_top: float) -> None:
        """2RU branch router: onboard ports plus four NIM slots."""
        g = 'ISR_4451X'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.470)
        self.status_cluster(g, -0.209, z + h * 0.24, U)
        for i in range(4):
            self.rj45_socket(g, -0.160 + i * 0.0170, z + h * 0.24, plugged=(i < 2), led=True)
        for i in range(4):
            self.sfp_cage(g, -0.070 + i * 0.0215, z + h * 0.24, transceiver=(i < 2))
        # Four NIM bays across the lower half, two of them populated.
        for i in range(4):
            nx = -0.150 + i * 0.104
            self.rounded_prism(g, 'cisco_grey_dark', (nx, self.front_y - 0.0022, z - h * 0.22),
                               (0.098, 0.0072, h * 0.30), radius=0.0014, bevel=0.0005, steps=6)
            if i < 2:
                for k in range(4):
                    self.rj45_socket(g, nx - 0.030 + k * 0.0170, z - h * 0.22, plugged=(k < 2), led=True)
            else:
                self.perforations(g, nx, z - h * 0.22, 0.070, 0.018, 12, 3, y=self.front_y - 0.0066)

    def build_firepower(self, z: float) -> None:
        g = 'FIREPOWER_2140'
        self.panel_shell(g, z, 1, 0.470, face='nexus_black')
        self.status_cluster(g, -0.209, z, U)
        for i in range(12):
            self.rj45_socket(g, -0.166 + i * 0.0165, z, plugged=(i < 6), led=True)
        for i in range(4):
            self.sfp_cage(g, 0.050 + i * 0.0215, z, transceiver=(i < 2), blue=(i == 0))
        self.perforations(g, 0.165, z, 0.090, 0.024, 15, 4)



    def build_c9800_40(self, z: float) -> None:
        """The wireless control plane the campus rack was missing.

        Catalyst access switches with no controller is a rack that hands out
        no SSIDs. The 9800-40 terminates up to 2,000 access points, and it is
        1RU: the 9800-80 is the 2RU one, which is the wrong guess to make.

        SP and RP are the pair that matter and the reason they are drawn with
        an amber surround. SP is service, RP is the redundancy port to a
        second controller, and ringing both is how nobody patches a client
        VLAN into the box's own failover path.
        """
        g = 'C9800_40'
        self.panel_shell(g, z, 1, 0.470, face='cisco_grey')
        self.status_cluster(g, -0.209, z, U)
        # Console, mini USB, and two USB 3.0 type A.
        self.rj45_socket(g, -0.166, z, plugged=False, led=False)
        for i in range(3):
            self.rounded_prism(g, 'black_plastic', (-0.140 + i * 0.0150, self.front_y - 0.0038, z),
                               (0.0104, 0.0038, 0.0052), radius=0.0008, bevel=0.0003, steps=5)
        # SP and RP, ringed in amber so they are not mistaken for data ports.
        for i in range(2):
            x = -0.078 + i * 0.0210
            self.rounded_prism(g, 'port_bezel_amber', (x, self.front_y - 0.0034, z),
                               (0.0200, 0.0036, 0.0166), radius=0.0012, bevel=0.0004, steps=5)
            self.rj45_socket(g, x, z, plugged=(i == 0), led=True)
        # TE0 to TE3, a two by two block, then the intake grille that takes
        # up most of the right of the panel. The 9800-40 really is this
        # sparse: it is a controller, and almost nothing plugs into it.
        for i in range(4):
            self.sfp_cage(g, 0.010 + (i % 2) * 0.0215, z + (0.0094 if i < 2 else -0.0094),
                          transceiver=(i < 2), blue=(i == 0))
        self.perforations(g, 0.136, z, 0.148, 0.026, 24, 5)

    def build_firewall_3120(self, z: float) -> None:
        """The current generation firewall beside the previous one.

        A 2140 and a 3120 in one rack is not redundancy, it is a migration:
        two generations of the same job running side by side while policy
        moves across. That is the ordinary reason a rack holds both, and it
        is worth drawing, because a rack showing only current hardware is a
        rack nobody has actually run.
        """
        g = 'SECURE_FW_3120'
        self.panel_shell(g, z, 1, 0.470, face='cisco_grey')
        self.status_cluster(g, -0.209, z, U)
        # Management, USB, and the console Cisco trims in pale blue.
        self.rj45_socket(g, -0.170, z, plugged=True, led=True)
        self.rounded_prism(g, 'black_plastic', (-0.148, self.front_y - 0.0038, z),
                           (0.0104, 0.0038, 0.0052), radius=0.0008, bevel=0.0003, steps=5)
        self.rounded_prism(g, 'port_bezel_blue', (-0.126, self.front_y - 0.0034, z),
                           (0.0198, 0.0036, 0.0164), radius=0.0012, bevel=0.0004, steps=5)
        self.rj45_socket(g, -0.126, z, plugged=False, led=False)
        for i in range(8):
            self.rj45_socket(g, -0.094 + i * 0.0168, z, plugged=(i < 5), led=True)
        for i in range(8):
            self.sfp_cage(g, 0.052 + i * 0.0196, z, transceiver=(i < 3), blue=(i == 0))
        # The network module bay at the right, shipped blanked.
        self.rounded_prism(g, 'cisco_grey_dark', (0.186, self.front_y - 0.0018, z),
                           (0.070, 0.0086, U * 0.84), radius=0.0014, bevel=0.0005, steps=6)
        self.perforations(g, 0.186, z, 0.052, 0.022, 9, 4, y=self.front_y - 0.0062)

    def build_c8300(self, z: float) -> None:
        """A router doing the least glamorous job in the rack.

        With a 16 port async module in the NIM bay this is the console
        server: the thing you reach when the network you would normally
        manage a switch over is the thing that is broken. Every rack has one
        or wishes it did, and it is almost never the box anybody photographs.

        Both module bays are drawn blanked, which is how they ship and how
        most of them stay.
        """
        g = 'C8300_CONSOLE'
        self.panel_shell(g, z, 1, 0.320, face='cisco_grey')
        self.status_cluster(g, -0.209, z, U)
        # USB-C console and a USB 3.0 type A.
        self.rounded_prism(g, 'black_plastic', (-0.170, self.front_y - 0.0038, z),
                           (0.0090, 0.0038, 0.0042), radius=0.0018, bevel=0.0004, steps=6)
        self.rounded_prism(g, 'black_plastic', (-0.152, self.front_y - 0.0038, z),
                           (0.0104, 0.0038, 0.0052), radius=0.0008, bevel=0.0003, steps=5)
        self.rounded_prism(g, 'port_bezel_blue', (-0.128, self.front_y - 0.0034, z),
                           (0.0198, 0.0036, 0.0164), radius=0.0012, bevel=0.0004, steps=5)
        self.rj45_socket(g, -0.128, z, plugged=True, led=True)
        # Four 1G copper in a two by two block, ringed amber, then two 10G.
        for i in range(4):
            x = -0.094 + (i % 2) * 0.0206
            dz = 0.0094 if i < 2 else -0.0094
            self.rounded_prism(g, 'port_bezel_amber', (x, self.front_y - 0.0034, z + dz),
                               (0.0196, 0.0036, 0.0122), radius=0.0010, bevel=0.0004, steps=5)
            self.rj45_socket(g, x, z + dz, plugged=(i < 2), led=True)
        for i in range(2):
            dz = 0.0094 if i == 0 else -0.0094
            self.rounded_prism(g, 'port_bezel_amber', (-0.036, self.front_y - 0.0034, z + dz),
                               (0.0210, 0.0036, 0.0122), radius=0.0010, bevel=0.0004, steps=5)
            self.sfp_cage(g, -0.036, z + dz, transceiver=(i == 0), blue=(i == 0))
        # The NIM bay and the SM bay, blanked, each on captive thumbscrews.
        for bx, bw in ((0.030, 0.104), (0.150, 0.128)):
            self.rounded_prism(g, 'cisco_grey_dark', (bx, self.front_y - 0.0018, z),
                               (bw, 0.0086, U * 0.84), radius=0.0014, bevel=0.0005, steps=6)
            self.perforations(g, bx, z, bw - 0.030, 0.020, int(bw * 130), 3, y=self.front_y - 0.0062)
            for sx in (bx - bw / 2 + 0.008, bx + bw / 2 - 0.008):
                self.front_cylinder(g, 'port_bezel_blue', (sx, self.front_y - 0.0064, z), 0.0030, 0.0028, 20)

    def build_ucs_c225(self, z: float) -> None:
        """1RU AMD compute, and the only server here you cannot see into.

        The C220 next to it wears its ten drive carriers on the outside. This
        one puts the same ten bays behind a hinged perforated bezel, which is
        the visible difference between the two and the reason both are worth
        drawing: a rack photograph is mostly bezels, and which vendor hides
        its drives is a thing you learn by looking.
        """
        g = 'UCS_C225'
        self.panel_shell(g, z, 1, 0.760, face='ucs_grey')
        # Two hinged mesh panels with the badge plate between them.
        for side in (-1, 1):
            cx = side * 0.098
            self.rounded_prism(g, 'mesh_bezel', (cx, self.front_y - 0.0026, z),
                               (0.150, 0.0072, U * 0.78), radius=0.0016, bevel=0.0006, steps=6)
            self.perforations(g, cx, z, 0.136, 0.026, 24, 5, y=self.front_y - 0.0068)
            # The hinge is at the outer edge and the pull at the inner one.
            self.rounded_prism(g, 'ucs_bezel', (cx - side * 0.072, self.front_y - 0.0064, z),
                               (0.0042, 0.0044, U * 0.62), radius=0.0008, bevel=0.0003, steps=4)
        self.rounded_prism(g, 'ucs_bezel', (0, self.front_y - 0.0030, z), (0.020, 0.0074, U * 0.78),
                           radius=0.0010, bevel=0.0004, steps=6)
        self.lens(g, 0, z + U * 0.22, 'blue_led', 0.0014, self.front_y - 0.0070)
        # Left ear: power, health, unit ID and the KVM connector.
        self.power_button(g, -0.196, z + U * 0.16, radius=0.008)
        for i, mat in enumerate(('green_led', 'amber_led', 'blue_led')):
            self.lens(g, -0.206 + i * 0.0072, z - U * 0.16, mat, 0.0012, self.front_y - 0.0048)
        self.rounded_prism(g, 'black_plastic', (0.196, self.front_y - 0.0050, z),
                           (0.0180, 0.0040, 0.0090), radius=0.0009, bevel=0.0003, steps=5)

    def build_ucs_c245(self, z_top: float) -> None:
        """2RU AMD compute: twenty four bays in one row, not three.

        A 2U front holds twenty four small form factor carriers standing on
        edge, side by side, and that is a different picture from the C240's
        grid above it. Both are 24 bays and they do not look alike, which is
        the whole reason to draw the real layout rather than a tidy grid.
        """
        g = 'UCS_C245'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.780, face='ucs_grey')
        for col in range(24):
            bx = -0.166 + col * 0.01450
            self.rounded_prism(g, 'drive_face', (bx, self.front_y - 0.0028, z),
                               (0.0126, 0.0072, h * 0.74), radius=0.0007, bevel=0.0003, steps=4)
            self.rounded_prism(g, 'drive_handle', (bx - 0.0044, self.front_y - 0.0068, z),
                               (0.0028, 0.0040, h * 0.62), radius=0.0006, bevel=0.0002, steps=4)
            self.lens(g, bx + 0.0034, z + h * 0.30, 'green_led', 0.0009, self.front_y - 0.0072)
            self.lens(g, bx + 0.0034, z - h * 0.30, 'amber_led', 0.0008, self.front_y - 0.0072)
        # Left ear: power, health, unit ID, KVM. Right ear: the badge plate.
        self.rounded_prism(g, 'ucs_bezel', (-0.200, self.front_y - 0.0026, z), (0.036, 0.0074, h * 0.84),
                           radius=0.0014, bevel=0.0005, steps=6)
        self.power_button(g, -0.200, z + h * 0.26, radius=0.009)
        for i, mat in enumerate(('green_led', 'amber_led', 'blue_led')):
            self.lens(g, -0.210 + i * 0.0084, z, mat, 0.0013, self.front_y - 0.0068)
        self.rounded_prism(g, 'black_plastic', (-0.200, self.front_y - 0.0060, z - h * 0.26),
                           (0.0200, 0.0040, 0.0096), radius=0.0009, bevel=0.0003, steps=5)
        self.rounded_prism(g, 'ucs_bezel', (0.200, self.front_y - 0.0026, z), (0.036, 0.0074, h * 0.84),
                           radius=0.0014, bevel=0.0005, steps=6)

    def build_pdu(self, z_top: float) -> None:
        g = 'CISCO_PDU'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.120, face='nexus_black')
        for row in range(2):
            for col in range(8):
                self.nema_outlet(g, -0.164 + col * 0.0468, z + (h * 0.20 if row == 0 else -h * 0.20),
                                 0.030, 0.026, plugged=(col < 3))
        self.screen(g, 'pdu', 0.196, z, 0.030, 0.024)

    def build_ups(self, z_top: float) -> None:
        g = 'CISCO_UPS'
        h = 4 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 4, 0.640, face='nexus_black')
        self.screen(g, 'ups', -0.150, z + h * 0.18, 0.062, 0.046)
        for i in range(4):
            self.lens(g, -0.070 + i * 0.014, z + h * 0.18, 'green_led', 0.0022)
        self.perforations(g, 0.090, z + h * 0.18, 0.190, 0.034, 26, 5)
        # Battery tray across the bottom, with its own handle.
        self.rounded_prism(g, 'nexus_black_dark', (0, self.front_y - 0.0024, z - h * 0.24),
                           (0.400, 0.0072, h * 0.40), radius=0.0018, bevel=0.0006, steps=6)
        self.rounded_prism(g, 'drive_handle', (0, self.front_y - 0.0070, z - h * 0.24),
                           (0.090, 0.0044, 0.0100), radius=0.0016, bevel=0.0005, steps=5)

    # --------------------------------------------------------------- frame



    # --------------------------------------------------------------- build

    def build(self) -> trimesh.Scene:
        top = self.rail_top

        at = self.u_centre

        print('BUILD frame', flush=True)
        self.build_frame()

        print('BUILD access layer', flush=True)
        patch_a = self.build_patch_panel(at(0), 'PATCH_PANEL_A')
        sw48 = self.build_c9300_48p(at(1))
        patch_b = self.build_patch_panel(at(2), 'PATCH_PANEL_B', patched=14)
        sw24 = self.build_c9300_24p(at(3))
        self.build_cable_manager(at(4), 'CABLE_MANAGER_TOP')

        print('BUILD core and spine', flush=True)
        self.build_c9500(at(5))
        self.build_nexus(at(6))
        self.build_cable_manager(at(7), 'CABLE_MANAGER_MID')

        print('BUILD modular chassis', flush=True)
        self.build_c9404r(top - 8 * U)

        print('BUILD edge', flush=True)
        self.build_asr1001x(at(14))
        self.build_isr4451(top - 15 * U)
        self.build_firepower(at(17))
        self.build_firewall_3120(at(18))

        print('BUILD compute', flush=True)
        self.build_ucs5108(top - 19 * U)
        self.build_ucs_c240(top - 25 * U)
        self.build_ucs_c220(at(27), 'UCS_C220_A')
        self.build_ucs_c220(at(28), 'UCS_C220_B')
        self.build_ucs6536(at(29), 'UCS_6536_A')
        self.build_ucs6536(at(30), 'UCS_6536_B')

        print('BUILD services', flush=True)
        self.build_ucs_c225(at(31))
        self.build_ucs_c245(top - 32 * U)
        self.build_c9800_40(at(34))
        self.build_c8300(at(35))

        print('BUILD power', flush=True)
        self.build_pdu(top - 36 * U)
        self.build_ups(top - 38 * U)
        

        print('BUILD patch cables', flush=True)
        self.build_patch_cables(patch_a, sw48, patch_z=at(0), switch_z=at(1))
        self.build_patch_cables(patch_b[:14], sw24[:14], patch_z=at(2), switch_z=at(3))

        print('BUILD to_scene', flush=True)
        return self.to_scene()


if __name__ == '__main__':
    rack = CiscoEnterpriseRack()
    scene = rack.build()
    out = OUT / 'Cisco_Enterprise_42U.glb'
    export_glb(scene, out)
    faces = sum(len(g.faces) for g in scene.geometry.values())
    verts = sum(len(g.vertices) for g in scene.geometry.values())
    print(out)
    print(f'{faces:,} triangles, {verts:,} vertices, {len(scene.geometry)} geometry groups')
