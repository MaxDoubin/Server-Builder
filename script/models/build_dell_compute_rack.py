#!/usr/bin/env python3
"""A 42U Dell compute rack.

The one shape the rest of the library does not have. Every chassis drawn
so far stacks horizontally: Cisco's 9404R slides its line cards in flat,
the UCS 5108 lays its blades in two rows, Juniper's EX9204 does the same.
The PowerEdge MX7000 stands its eight compute sleds on end, and a wall of
vertical sleds looks nothing like a stack of horizontal ones from any
angle.

The drive bays are the other difference worth drawing. Cisco's C240 puts
its carriers in a three by eight grid; a 2U PowerEdge stands twenty four
2.5 inch drives upright in a single row across the whole front, because a
2U opening is tall enough to take a drive on its edge and that is the
densest way to do it.

Published figures, cited in the rack's data file: the MX7000 is a 7U
enclosure with eight front-accessible single-width sled slots, or four
double-width.
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


class DellComputeRack(EnterpriseRack):
    scene_title = 'Dell Compute Rack, 42U'
    frame_material = 'nexus_black_dark'
    panel_material = 'dell_graphite'
    inset_material = 'dell_graphite_dark'

    def __init__(self) -> None:
        super().__init__()
        # PowerEdge graphite, read off a product photograph rather than
        # guessed down. Two earlier passes hauled these numbers toward
        # black chasing a rack that rendered silver, which was the export
        # writing sRGB into a linear field and not the paint being wrong.
        # `export_glb` fixes the gamma, so these can be honest again.
        self.materials.update({
            'dell_graphite': pbr('Dell Graphite', [58, 61, 65, 255], 0.24, 0.52),
            'dell_graphite_dark': pbr('Dell Graphite Shadow', [42, 45, 48, 255], 0.22, 0.60),
            'dell_bezel': pbr('Dell Bezel', [32, 34, 37, 255], 0.18, 0.66),
            'dell_blue': pbr('Dell Status Blue', [70, 150, 220, 255], 0.10, 0.30,
                             emissive=[0.10, 0.38, 0.70]),
            # A PowerEdge carrier is dark with one bright release lever, and
            # a 2U server is twenty four of them across the whole face, so
            # this pair decides the rack's colour more than the chassis does.
            'drive_face': pbr('Carrier', [62, 66, 70, 255], 0.30, 0.50),
            'drive_handle': pbr('Carrier Release', [150, 155, 158, 255], 0.58, 0.40),
            'dell_latch': pbr('Carrier Latch', [178, 100, 42, 255], 0.16, 0.62),
        })

    # --------------------------------------------------------------- parts

    def upright_drive(self, group: str, x: float, z: float, width: float, height: float,
                      filled: bool = True) -> None:
        """A 2.5 inch carrier stood on its edge, which is how a 2U packs 24."""
        self.rounded_prism(group, 'drive_face' if filled else 'dell_bezel',
                           (x, self.front_y - 0.0028, z), (width, 0.0072, height),
                           radius=0.0008, bevel=0.0003, steps=5)
        # The release latch runs down the left edge of the carrier.
        self.rounded_prism(group, 'drive_handle', (x - width * 0.32, self.front_y - 0.0068, z),
                           (width * 0.16, 0.0040, height * 0.86), radius=0.0006, bevel=0.0002, steps=4)
        if filled:
            self.lens(group, x + width * 0.24, z + height * 0.38, 'green_led', 0.0010, self.front_y - 0.0072)
            self.lens(group, x + width * 0.24, z + height * 0.28, 'dell_blue', 0.0009, self.front_y - 0.0072)

    def control_panel(self, group: str, x: float, z: float, height: float) -> None:
        """Power, identify, and the little status readout Dell puts on the right."""
        self.rounded_prism(group, 'dell_bezel', (x, self.front_y - 0.0026, z), (0.044, 0.0074, height * 0.84),
                           radius=0.0014, bevel=0.0005, steps=6)
        self.power_button(group, x, z + height * 0.24, radius=0.0090)
        self.lens(group, x - 0.012, z - height * 0.06, 'dell_blue', 0.0022)
        self.lens(group, x + 0.012, z - height * 0.06, 'amber_led', 0.0018)
        self.rounded_prism(group, 'black_plastic', (x, self.front_y - 0.0062, z - height * 0.28),
                           (0.026, 0.0040, 0.0095), radius=0.0009, bevel=0.0003, steps=5)

    # ------------------------------------------------------------- devices

    def build_tor(self, z: float, group: str) -> None:
        """A top of rack switch: 48 SFP28 and eight 100G, all fibre."""
        self.panel_shell(group, z, 1, 0.470)
        self.status_cluster(group, -0.212, z, U)
        for col in range(24):
            x = -0.180 + col * 0.01330
            for dz in (0.0094, -0.0094):
                self.sfp_cage(group, x, z + dz, transceiver=(col % 3 != 2), blue=(col % 5 == 0))
        for i in range(4):
            x = 0.156 + (i % 2) * 0.030
            dz = 0.0094 if i < 2 else -0.0094
            self.rounded_prism(group, 'nickel', (x, self.front_y - 0.009, z + dz), (0.0260, 0.0032, 0.0124),
                               radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(group, 'black_plastic', (x, self.front_y - 0.0118, z + dz),
                               (0.0212, 0.0032, 0.0090), radius=0.0007, bevel=0.0002, steps=5)

    def build_mx7000(self, z_top: float) -> None:
        """7U enclosure, eight compute sleds standing on end."""
        g = 'MX7000'
        h = 7 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 7, 0.840, face='dell_graphite')

        sled_w = 0.0475
        sled_h = h * 0.615
        sled_z = z + h * 0.135
        for i in range(8):
            sx = -0.1745 + i * (sled_w + 0.0027)
            double = i in (4, 5)
            self.rounded_prism(g, 'dell_bezel', (sx, self.front_y - 0.0026, sled_z),
                               (sled_w, 0.0076, sled_h), radius=0.0016, bevel=0.0006, steps=6)
            # Each sled shows its own drives, stacked because the sled is
            # on its end, then a handle at the bottom and its status LEDs.
            for k in range(2):
                self.rounded_prism(g, 'drive_face', (sx, self.front_y - 0.0066, sled_z + sled_h * (0.30 - k * 0.20)),
                                   (sled_w * 0.66, 0.0040, sled_h * 0.155), radius=0.0008, bevel=0.0003, steps=4)
                self.lens(g, sx + sled_w * 0.24, sled_z + sled_h * (0.30 - k * 0.20), 'green_led', 0.0010,
                          self.front_y - 0.0090)
            self.perforations(g, sx, sled_z - sled_h * 0.06, sled_w * 0.74, sled_h * 0.16, 5, 7,
                              y=self.front_y - 0.0070, radius=0.0011)
            self.power_button(g, sx, sled_z - sled_h * 0.28, radius=0.0075)
            self.rounded_prism(g, 'drive_handle', (sx, self.front_y - 0.0074, sled_z - sled_h * 0.42),
                               (sled_w * 0.72, 0.0044, 0.0080), radius=0.0014, bevel=0.0005, steps=5)
            if double:
                # A double width sled spans two bays, so its neighbour has
                # no seam: draw the bridge over the gap.
                if i == 4:
                    self.rounded_prism(g, 'dell_bezel', (sx + (sled_w + 0.0027) / 2, self.front_y - 0.0024, sled_z),
                                       (sled_w * 2 + 0.0027, 0.0072, sled_h), radius=0.0016, bevel=0.0006, steps=6)
                    self.rounded_prism(g, 'drive_handle',
                                       (sx + (sled_w + 0.0027) / 2, self.front_y - 0.0072, sled_z - sled_h * 0.42),
                                       (sled_w * 1.5, 0.0044, 0.0080), radius=0.0014, bevel=0.0005, steps=5)
                    self.lens(g, sx + (sled_w + 0.0027) / 2, sled_z + sled_h * 0.42, 'dell_blue', 0.0022,
                              self.front_y - 0.0080)

        # Management module and the six front supplies along the bottom.
        self.rounded_prism(g, 'dell_graphite_dark', (0, self.front_y - 0.0022, z - h * 0.255),
                           (0.404, 0.0072, h * 0.075), radius=0.0014, bevel=0.0005, steps=6)
        self.screen(g, 'compute', -0.170, z - h * 0.255, 0.048, h * 0.052)
        for k in range(2):
            self.rj45_socket(g, -0.116 + k * 0.0172, z - h * 0.255, plugged=(k == 0), led=True)
        for i in range(6):
            px = -0.1720 + i * 0.0690
            pz = z - h * 0.375
            self.rounded_prism(g, 'dell_bezel', (px, self.front_y - 0.0026, pz),
                               (0.0645, 0.0076, h * 0.135), radius=0.0014, bevel=0.0005, steps=6)
            self.fan(g, px, pz + h * 0.020, 0.0155)
            self.rounded_prism(g, 'drive_handle', (px, self.front_y - 0.0072, pz - h * 0.045),
                               (0.040, 0.0042, 0.0070), radius=0.0012, bevel=0.0004, steps=5)
            self.lens(g, px + 0.024, pz - h * 0.045, 'green_led', 0.0014)

    def build_r760(self, z_top: float, group: str, filled: int = 24) -> None:
        """2U server: twenty four 2.5 inch drives stood upright in one row."""
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(group, z, 2, 0.780, face='dell_graphite')
        for i in range(24):
            self.upright_drive(group, -0.1725 + i * 0.01480, z, 0.0138, h * 0.80, filled=(i < filled))
        self.control_panel(group, 0.196, z, h)

    def build_r660(self, z: float, group: str, filled: int = 10) -> None:
        """1U server: ten 2.5 inch drives, laid flat because 1U is too short."""
        self.panel_shell(group, z, 1, 0.760, face='dell_graphite')
        for i in range(10):
            self.rounded_prism(group, 'drive_face' if i < filled else 'dell_bezel',
                               (-0.156 + i * 0.0300, self.front_y - 0.0028, z),
                               (0.0268, 0.0072, U * 0.70), radius=0.0009, bevel=0.0004, steps=5)
            self.rounded_prism(group, 'drive_handle', (-0.156 + i * 0.0300 - 0.0102, self.front_y - 0.0068, z),
                               (0.0040, 0.0040, U * 0.56), radius=0.0007, bevel=0.0003, steps=4)
            if i < filled:
                self.lens(group, -0.156 + i * 0.0300 + 0.0098, z + U * 0.20, 'green_led', 0.0010,
                          self.front_y - 0.0072)
        self.control_panel(group, 0.196, z, U * 1.05)

    def build_r960(self, z_top: float) -> None:
        """4U four socket server: thirty two 2.5 inch drives in two rows.

        The R960 is the shape a four socket box has to be. Four processors
        and sixty four DIMM slots do not fit under a 2U lid, so the chassis
        grows upward, and the extra height buys a second row of drives
        rather than a taller single one: a 2.5 inch carrier is 15mm wide
        and 100mm long however tall the opening is.
        """
        g = 'R960'
        h = 4 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 4, 0.869, face='dell_graphite')
        row_h = h * 0.36
        for row in range(2):
            rz = z + (row_h * 0.58 if row == 0 else -row_h * 0.58)
            for i in range(16):
                self.upright_drive(g, -0.1740 + i * 0.02230, rz, 0.0206, row_h, filled=(row * 16 + i < 26))
        self.control_panel(g, 0.196, z, h * 0.52)
        # The service tag pulls out of the left ear on every PowerEdge.
        self.rounded_prism(g, 'dell_bezel', (-0.207, self.front_y - 0.0030, z - h * 0.34),
                           (0.0130, 0.0064, 0.0180), radius=0.0008, bevel=0.0003, steps=5)

    def build_xe9680(self, z_top: float) -> None:
        """6U accelerator node: a wall of fans, eight bays, and not much else.

        This is the densest thing in the rack and the plainest to look at,
        and both facts have the same cause. Eight OAM accelerators and two
        processors is roughly ten kilowatts under one lid, so the entire
        front elevation above the drive row is intake: five fan modules
        across, each a rotor behind a punched guard. There is nowhere for a
        front panel to go, which is why the only markings on a 114 kilogram
        server are a control cluster the size of a phone.
        """
        g = 'XE9680'
        h = 6 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 6, 1.009, face='dell_graphite')

        # The intake wall: five fan modules, each behind its own guard.
        for i in range(5):
            fx = -0.1640 + i * 0.0820
            fz = z + h * 0.14
            self.rounded_prism(g, 'dell_bezel', (fx, self.front_y - 0.0022, fz),
                               (0.0780, 0.0070, h * 0.50), radius=0.0018, bevel=0.0006, steps=6)
            for k in range(2):
                self.fan(g, fx, fz + (h * 0.115 if k == 0 else -h * 0.115), 0.0330,
                         y=self.front_y - 0.0062, blades=9)
            self.lens(g, fx + 0.0330, fz - h * 0.215, 'green_led', 0.0013, self.front_y - 0.0066)

        # Eight 2.5 inch NVMe bays along the bottom, then the control cluster.
        for i in range(8):
            self.upright_drive(g, -0.1620 + i * 0.0232, z - h * 0.30, 0.0210, h * 0.24, filled=(i < 6))
        self.rounded_prism(g, 'dell_bezel', (0.140, self.front_y - 0.0026, z - h * 0.30),
                           (0.0560, 0.0074, h * 0.24), radius=0.0014, bevel=0.0005, steps=6)
        self.power_button(g, 0.140, z - h * 0.255, radius=0.0100)
        self.lens(g, 0.126, z - h * 0.335, 'dell_blue', 0.0024)
        self.lens(g, 0.154, z - h * 0.335, 'amber_led', 0.0020)
        self.screen(g, 'compute', 0.196, z - h * 0.30, 0.038, h * 0.14)

    def build_powervault(self, z_top: float) -> None:
        """A storage shelf: the same upright drives, no compute behind them."""
        g = 'POWERVAULT_ME5'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.560, face='dell_graphite')
        for i in range(24):
            self.upright_drive(g, -0.1725 + i * 0.01480, z, 0.0138, h * 0.80, filled=True)
        self.rounded_prism(g, 'dell_bezel', (0.196, self.front_y - 0.0026, z), (0.040, 0.0074, h * 0.84),
                           radius=0.0014, bevel=0.0005, steps=6)
        for k, mat in enumerate(('green_led', 'dell_blue', 'amber_led')):
            self.lens(g, 0.196, z + h * 0.22 - k * 0.010, mat, 0.0020)

    def build_n3248te(self, z: float) -> None:
        """The management switch, which the rack had no equivalent of.

        Two S5248F leaves at the top carry data and nothing carried
        management: eight servers and an MX7000 all present an iDRAC or an
        OME port and they have to land somewhere. Forty eight gigabit copper
        is what that somewhere looks like, and it is a different shape from
        the all fibre leaves because management is still copper almost
        everywhere.
        """
        g = 'N3248TE_ON'
        self.panel_shell(g, z, 1, 0.400)
        self.status_cluster(g, -0.212, z, U)
        for block in range(4):
            for i in range(6):
                x = -0.184 + block * 0.0700 + i * 0.0110
                for dz in (0.0094, -0.0094):
                    self.rj45_socket(g, x, z + dz, plugged=(block < 2 or i < 3), led=True)
        for i in range(4):
            self.sfp_cage(g, 0.104 + (i % 2) * 0.0200, z + (0.0094 if i < 2 else -0.0094),
                          transceiver=(i < 2), blue=(i == 0))
        for i in range(2):
            self.rounded_prism(g, 'nickel', (0.152, self.front_y - 0.009, z + (0.0094 if i == 0 else -0.0094)),
                               (0.0250, 0.0032, 0.0122), radius=0.0011, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (0.152, self.front_y - 0.0118, z + (0.0094 if i == 0 else -0.0094)),
                               (0.0205, 0.0032, 0.0090), radius=0.0007, bevel=0.0002, steps=5)
        self.rj45_socket(g, 0.184, z + 0.0094, plugged=True, led=True)
        self.rj45_socket(g, 0.184, z - 0.0094, plugged=False, led=False)
        self.rounded_prism(g, 'black_plastic', (0.208, self.front_y - 0.0038, z),
                           (0.0100, 0.0038, 0.0050), radius=0.0008, bevel=0.0003, steps=5)

    def build_r6615(self, z: float) -> None:
        """A 1U AMD node, wearing the bezel the Intel ones next to it are not.

        The R6615 and the R660 three units up are both 1U ten bay servers
        and their bare fronts are near enough identical, which is true and
        also useless to look at. Dell ship a plain snap on bezel for this
        chassis and plenty of racks run some machines with one and some
        without, usually because somebody pulled a drive and never put the
        cover back. So this one is drawn bezelled: the mix is the honest
        picture and it is the one that shows you the bezel exists.
        """
        g = 'R6615'
        self.panel_shell(g, z, 1, 0.780, face='dell_graphite')
        self.rounded_prism(g, 'dell_bezel', (-0.014, self.front_y - 0.0030, z),
                           (0.372, 0.0078, U * 0.80), radius=0.0018, bevel=0.0007, steps=6)
        # The bezel is perforated across its whole face, because the air
        # still has to get through it.
        self.perforations(g, -0.014, z, 0.344, 0.024, 58, 5, y=self.front_y - 0.0072)
        self.rounded_prism(g, 'drive_handle', (-0.192, self.front_y - 0.0074, z),
                           (0.0060, 0.0044, U * 0.52), radius=0.0010, bevel=0.0004, steps=4)
        self.lens(g, 0.150, z, 'dell_blue', 0.0022, self.front_y - 0.0076)
        self.control_panel(g, 0.196, z, U * 1.05)

    def build_r7615(self, z_top: float) -> None:
        """2U AMD, behind the LCD bezel Dell photograph it in.

        The status panel on the bezel is the point of paying for it: a
        service tag, a health state and a fault code readable from the cold
        aisle without opening anything or logging into anything. Everything
        behind it is twenty four two and a half inch carriers, which you
        cannot see and do not need to.
        """
        g = 'R7615'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.790, face='dell_graphite')
        self.rounded_prism(g, 'dell_bezel', (-0.014, self.front_y - 0.0030, z),
                           (0.372, 0.0078, h * 0.84), radius=0.0020, bevel=0.0008, steps=6)
        # Dell's bezel vent is a hexagon field. Two offset grids read as one
        # at this size and cost a third of the geometry of drawing hexagons.
        self.perforations(g, -0.070, z + h * 0.10, 0.226, h * 0.44, 34, 7, y=self.front_y - 0.0072)
        self.perforations(g, -0.070, z - h * 0.16, 0.226, h * 0.22, 34, 4, y=self.front_y - 0.0072)
        # The LCD sits right of centre, with the wordmark plate beside it.
        self.screen(g, 'chassis', 0.096, z, 0.060, h * 0.30)
        self.rounded_prism(g, 'dell_graphite_dark', (0.060, self.front_y - 0.0074, z - h * 0.28),
                           (0.070, 0.0034, 0.0060), radius=0.0008, bevel=0.0003, steps=4)
        self.rounded_prism(g, 'drive_handle', (-0.192, self.front_y - 0.0074, z),
                           (0.0060, 0.0044, h * 0.56), radius=0.0010, bevel=0.0004, steps=4)
        self.control_panel(g, 0.196, z, h * 0.60)

    def build_r7625(self, z_top: float) -> None:
        """Twelve three and a half inch carriers, in three rows of four.

        This is the other thing a 2U front can be. The R760 two units up
        holds twenty four small carriers standing on edge; the same two rack
        units hold twelve large ones lying flat, and the choice between them
        is capacity against spindle count rather than a styling difference.
        Drawing both is the only way that reads.

        The latch is orange because Dell's is, and on a face of twelve dark
        carriers the latches are the only thing you see from a distance.
        """
        g = 'R7625'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.800, face='dell_graphite')
        for row in range(3):
            for col in range(4):
                cx = -0.144 + col * 0.0960
                cz = z + h * 0.27 - row * h * 0.27
                self.rounded_prism(g, 'drive_face', (cx, self.front_y - 0.0028, cz),
                                   (0.0900, 0.0072, h * 0.235), radius=0.0010, bevel=0.0004, steps=5)
                self.rounded_prism(g, 'dell_latch', (cx - 0.0398, self.front_y - 0.0068, cz),
                                   (0.0058, 0.0042, h * 0.150), radius=0.0008, bevel=0.0003, steps=4)
                self.lens(g, cx + 0.0374, cz + h * 0.070, 'green_led', 0.0011, self.front_y - 0.0072)
                self.lens(g, cx + 0.0374, cz - h * 0.070, 'amber_led', 0.0010, self.front_y - 0.0072)
                self.perforations(g, cx, cz, 0.060, h * 0.12, 11, 3, y=self.front_y - 0.0070)
        self.control_panel(g, 0.196, z, h * 0.60)

    def build_pdu(self, z_top: float) -> None:
        g = 'DELL_PDU'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.120, face='dell_graphite_dark')
        for row in range(2):
            for col in range(8):
                self.nema_outlet(g, -0.164 + col * 0.0468, z + (h * 0.20 if row == 0 else -h * 0.20),
                                 0.030, 0.026, plugged=(col < 6))
        self.screen(g, 'pdu', 0.196, z, 0.030, 0.024)

    def build_ups(self, z_top: float) -> None:
        g = 'DELL_UPS'
        h = 4 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 4, 0.660, face='dell_graphite_dark')
        self.screen(g, 'ups', -0.150, z + h * 0.18, 0.062, 0.046)
        for i in range(4):
            self.lens(g, -0.070 + i * 0.014, z + h * 0.18, 'green_led', 0.0022)
        self.perforations(g, 0.090, z + h * 0.18, 0.190, 0.034, 26, 5)
        self.rounded_prism(g, 'dell_bezel', (0, self.front_y - 0.0024, z - h * 0.24),
                           (0.400, 0.0072, h * 0.40), radius=0.0018, bevel=0.0006, steps=6)
        self.rounded_prism(g, 'drive_handle', (0, self.front_y - 0.0070, z - h * 0.24),
                           (0.090, 0.0044, 0.0100), radius=0.0016, bevel=0.0005, steps=5)

    # --------------------------------------------------------------- build

    def build(self) -> trimesh.Scene:
        at = self.u_centre
        top = self.rail_top

        print('BUILD frame', flush=True)
        self.build_frame()

        print('BUILD fabric', flush=True)
        self.build_tor(at(0), 'S5248F_A')
        self.build_tor(at(1), 'S5248F_B')
        self.build_cable_manager(at(2), 'CABLE_MANAGER_TOP')

        print('BUILD modular', flush=True)
        self.build_mx7000(top - 3 * U)

        print('BUILD rack servers', flush=True)
        self.build_r760(top - 10 * U, 'R760_A', filled=24)
        self.build_r760(top - 12 * U, 'R760_B', filled=18)
        self.build_r660(at(14), 'R660_A', filled=10)
        self.build_r660(at(15), 'R660_B', filled=10)
        self.build_r660(at(16), 'R660_C', filled=6)
        self.build_r960(top - 17 * U)
        self.build_xe9680(top - 21 * U)

        print('BUILD storage', flush=True)
        self.build_powervault(top - 27 * U)
        self.build_cable_manager(at(29), 'CABLE_MANAGER_LOW')

        # Blank the gap between the last device and the power. Open rack
        # units are not neutral: hot exhaust turns straight back through
        # them into the intakes above, and every vendor's thermal guide
        # says to close them. Real panels come in 1U, 2U and 4U.
        print('BUILD management and AMD nodes', flush=True)
        self.build_n3248te(at(30))
        self.build_r6615(at(31))
        self.build_r7615(top - 32 * U)
        self.build_r7625(top - 34 * U)

        print('BUILD power', flush=True)
        self.build_pdu(top - 36 * U)
        self.build_ups(top - 38 * U)

        print('BUILD to_scene', flush=True)
        return self.to_scene()


if __name__ == '__main__':
    rack = DellComputeRack()
    scene = rack.build()
    out = OUT / 'Dell_Compute_42U.glb'
    export_glb(scene, out)
    faces = sum(len(g.faces) for g in scene.geometry.values())
    print(out)
    print(f'{faces:,} triangles, {len(scene.geometry)} geometry groups')
