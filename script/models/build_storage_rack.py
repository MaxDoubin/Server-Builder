#!/usr/bin/env python3
"""A 42U storage rack.

The opposite problem to every other rack in this library. Those are
covered in ports, carriers and indicators; a high density storage shelf
loads from the top, so its front is two flat drawer faces with a pull
handle and a light bar and nothing else at all. Eighty four drives, and
you cannot see one of them.

That is the thing worth drawing. A rack of these reads as almost blank
next to a rack of switches, and anyone who has only seen equipment
photography would not guess it holds more spinning storage than
everything else in this library put together.

The two exceptions on the face are at the ends of the rack: a controller
head, which is a normal 2U server front because that is what it is, and a
tape library, which has a window.

Published figures, cited in the rack's data file: the PowerVault ME4084
is a 5U enclosure with 84 3.5 inch bays, 222.3mm tall, which is exactly
five rack units.
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


class StorageRack(EnterpriseRack):
    scene_title = 'Dense Storage Rack, 42U'
    frame_material = 'nexus_black_dark'
    panel_material = 'store_grey'
    inset_material = 'store_grey_dark'

    def __init__(self) -> None:
        super().__init__()
        # A dense shelf is graphite with a lighter drawer face, which is the
        # only way to tell one drawer from the next on a wall of them. Same
        # note as the compute rack: these were pulled toward black chasing a
        # gamma bug in the exporter, and are back to what a photograph shows
        # now that `export_glb` writes linear colour.
        self.materials.update({
            'store_grey': pbr('Enclosure Grey', [72, 76, 80, 255], 0.28, 0.50),
            'store_grey_dark': pbr('Enclosure Shadow', [52, 55, 59, 255], 0.24, 0.58),
            'drawer_face': pbr('Drawer Face', [84, 88, 92, 255], 0.30, 0.46),
            'smoked_window': pbr('Library Window', [16, 20, 26, 190], 0.10, 0.10,
                                 alphaMode='BLEND', doubleSided=True),
            'tape_black': pbr('Library Black', [38, 40, 44, 255], 0.26, 0.56),
            'drive_face': pbr('Carrier', [60, 64, 68, 255], 0.30, 0.50),
            'drive_handle': pbr('Drawer Pull', [140, 145, 149, 255], 0.56, 0.40),
            'store_latch': pbr('Carrier Latch', [178, 100, 42, 255], 0.16, 0.62),
        })

    # --------------------------------------------------------------- parts

    def drawer_face(self, group: str, z: float, height: float, lit: int = 14) -> None:
        """A top load drawer: a pull handle, two latches and a light bar.

        This is the whole front of a high density shelf. Forty two drives
        live behind it and none of them are visible, because the drawer
        comes out upwards on rails and the disks are accessed from above.
        """
        self.rounded_prism(group, 'drawer_face', (0, self.front_y - 0.0026, z),
                           (PANEL_W - 0.026, 0.0078, height), radius=0.0022, bevel=0.0008, steps=7)
        # The recessed pull, running most of the width.
        self.rounded_prism(group, 'store_grey_dark', (0, self.front_y - 0.0072, z + height * 0.06),
                           (0.286, 0.0060, height * 0.30), radius=0.0018, bevel=0.0006, steps=6)
        self.rounded_prism(group, 'drive_handle', (0, self.front_y - 0.0108, z + height * 0.06),
                           (0.268, 0.0044, height * 0.13), radius=0.0016, bevel=0.0005, steps=5)
        # A latch at each end of the drawer.
        for lx in (-0.176, 0.176):
            self.rounded_prism(group, 'store_grey_dark', (lx, self.front_y - 0.0070, z),
                               (0.030, 0.0044, height * 0.44), radius=0.0012, bevel=0.0004, steps=5)
            self.screw(group, lx, z - height * 0.30, y=self.front_y - 0.0086, radius=0.0026)
        # The light bar: one indicator per drive row behind the face.
        for i, x in enumerate(np.linspace(-0.150, 0.150, 21)):
            mat = 'green_led' if i < lit else 'black_matte'
            self.lens(group, float(x), z - height * 0.30, mat, 0.0012, self.front_y - 0.0056)

    def enclosure_status(self, group: str, x: float, z: float, height: float) -> None:
        """The only readable thing on a shelf front: its own status block."""
        self.rounded_prism(group, 'store_grey_dark', (x, self.front_y - 0.0028, z),
                           (0.034, 0.0074, height), radius=0.0014, bevel=0.0005, steps=6)
        for k, mat in enumerate(('green_led', 'blue_led', 'amber_led')):
            self.lens(group, x, z + height * 0.28 - k * height * 0.28, mat, 0.0021,
                      self.front_y - 0.0062)

    # ------------------------------------------------------------- devices

    def build_sas_switch(self, z: float) -> None:
        g = 'SAS_FABRIC'
        self.panel_shell(g, z, 1, 0.440)
        self.status_cluster(g, -0.212, z, U)
        for i in range(16):
            self.rounded_prism(g, 'nickel', (-0.176 + i * 0.0228, self.front_y - 0.009, z),
                               (0.0200, 0.0032, 0.0124), radius=0.0010, bevel=0.0004, steps=5)
            self.rounded_prism(g, 'black_plastic', (-0.176 + i * 0.0228, self.front_y - 0.0118, z),
                               (0.0164, 0.0032, 0.0090), radius=0.0006, bevel=0.0002, steps=5)
            if i % 2 == 0:
                self.rounded_prism(g, 'steel_plain', (-0.176 + i * 0.0228, self.front_y - 0.0150, z),
                                   (0.0158, 0.0062, 0.0084), radius=0.0006, bevel=0.0002, steps=5)
        self.perforations(g, 0.184, z, 0.056, 0.024, 9, 4)

    def build_controller(self, z_top: float) -> None:
        """2U dual controller head: a normal server front, and the only one."""
        g = 'CONTROLLER_HEAD'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.640)
        for i in range(24):
            filled = i < 20
            self.rounded_prism(g, 'drive_face' if filled else 'store_grey_dark',
                               (-0.1725 + i * 0.01480, self.front_y - 0.0028, z),
                               (0.0138, 0.0072, h * 0.78), radius=0.0008, bevel=0.0003, steps=5)
            self.rounded_prism(g, 'drive_handle', (-0.1725 + i * 0.01480 - 0.0044, self.front_y - 0.0068, z),
                               (0.0022, 0.0040, h * 0.66), radius=0.0005, bevel=0.0002, steps=4)
            if filled:
                self.lens(g, -0.1725 + i * 0.01480 + 0.0038, z + h * 0.30, 'green_led', 0.0010,
                          self.front_y - 0.0072)
        # Two controller modules, which is what makes it a head and not a shelf.
        for k, cz in enumerate((z + h * 0.20, z - h * 0.20)):
            self.rounded_prism(g, 'store_grey_dark', (0.196, self.front_y - 0.0028, cz),
                               (0.044, 0.0074, h * 0.34), radius=0.0012, bevel=0.0005, steps=6)
            self.lens(g, 0.196, cz, 'green_led' if k == 0 else 'blue_led', 0.0020, self.front_y - 0.0062)

    def build_top_load(self, z_top: float, group: str, u: int, drawers: int, lit: int) -> None:
        """A high density shelf: nothing on the front but drawer faces."""
        h = u * U
        z = z_top - h / 2
        self.panel_shell(group, z, u, 0.900, face='store_grey')
        band = h * 0.86 / drawers
        for i in range(drawers):
            dz = z + h * 0.43 - band * (i + 0.5)
            self.drawer_face(group, dz, band * 0.88, lit=lit)
        self.enclosure_status(group, 0.204, z, h * 0.62)

    def build_flash_shelf(self, z_top: float) -> None:
        g = 'FLASH_SHELF'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.560, face='store_grey')
        for i in range(24):
            self.rounded_prism(g, 'drive_face', (-0.1725 + i * 0.01480, self.front_y - 0.0028, z),
                               (0.0138, 0.0072, h * 0.80), radius=0.0008, bevel=0.0003, steps=5)
            self.rounded_prism(g, 'drive_handle', (-0.1725 + i * 0.01480 - 0.0044, self.front_y - 0.0068, z),
                               (0.0022, 0.0040, h * 0.68), radius=0.0005, bevel=0.0002, steps=4)
            self.lens(g, -0.1725 + i * 0.01480 + 0.0038, z + h * 0.32, 'blue_led', 0.0010,
                      self.front_y - 0.0072)
        self.enclosure_status(g, 0.204, z, h * 0.62)

    def build_tape_library(self, z_top: float) -> None:
        """The other exception: a library, and the only window in the rack."""
        g = 'TAPE_LIBRARY'
        h = 4 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 4, 0.880, face='tape_black')
        # The viewing window, so an operator can see the robot move.
        self.rounded_prism(g, 'store_grey_dark', (-0.040, self.front_y - 0.0022, z),
                           (0.286, 0.0060, h * 0.72), radius=0.0028, bevel=0.0010, steps=7)
        self.rounded_prism(g, 'smoked_window', (-0.040, self.front_y - 0.0058, z),
                           (0.266, 0.0022, h * 0.64), radius=0.0022, bevel=0.0006, steps=6)
        # Cartridge slots behind the glass, in two magazines.
        for row in range(2):
            for i in range(10):
                self.box(g, 'tape_black', (-0.152 + i * 0.0248, self.front_y + 0.006,
                                           z + (h * 0.20 if row == 0 else -h * 0.18)),
                         (0.0210, 0.0180, h * 0.20))
                self.lens(g, -0.152 + i * 0.0248, z + (h * 0.29 if row == 0 else -h * 0.09),
                          'green_led' if i < 7 else 'black_matte', 0.0010, self.front_y - 0.0064)
        # Control panel, mailslot and the power button.
        self.rounded_prism(g, 'store_grey_dark', (0.176, self.front_y - 0.0026, z + h * 0.22),
                           (0.070, 0.0074, h * 0.24), radius=0.0016, bevel=0.0006, steps=6)
        self.screen(g, 'compute', 0.176, z + h * 0.22, 0.052, h * 0.16)
        self.rounded_prism(g, 'store_grey_dark', (0.176, self.front_y - 0.0060, z - h * 0.10),
                           (0.062, 0.0044, h * 0.10), radius=0.0014, bevel=0.0005, steps=5)
        self.power_button(g, 0.176, z - h * 0.30, radius=0.011)
        self.perforations(g, -0.040, z - h * 0.42, 0.260, h * 0.08, 34, 3)

    def hex_bezel(self, group: str, z: float, height: float, density: int = 40, rows: int = 9) -> None:
        """Dell's hexagon vent bezel, drawn as two offset grids.

        A real hexagonal field is three times the geometry of a square one
        and at the size a bezel occupies in this rack the two are the same
        picture. Offsetting the second grid by half a pitch is what stops it
        reading as a square lattice, which is the only part the eye catches.
        """
        self.rounded_prism(group, 'store_grey_dark', (-0.014, self.front_y - 0.0030, z),
                           (0.372, 0.0078, height), radius=0.0020, bevel=0.0008, steps=6)
        self.perforations(group, -0.014, z + height * 0.13, 0.340, height * 0.42, density, rows,
                          y=self.front_y - 0.0072)
        self.perforations(group, -0.014, z - height * 0.22, 0.340, height * 0.26, density, rows // 2,
                          y=self.front_y - 0.0072)
        # The pull tab at the hinged end, which is how the bezel comes off.
        self.rounded_prism(group, 'drive_handle', (-0.192, self.front_y - 0.0074, z),
                           (0.0060, 0.0044, height * 0.60), radius=0.0010, bevel=0.0004, steps=4)

    def build_me484(self, z_top: float) -> None:
        """Eighty four bays in five rack units, and nothing on the front.

        A 5U84 is two top load drawers with forty two disks in each, reached
        from above on rails, so its face is two drawer fronts and a status
        block and that is the entire product. It is the densest thing in the
        rack by a wide margin and the least interesting to look at, which is
        exactly what high density storage is.

        This one is a JBOD rather than an array: it has no controllers of
        its own and hangs off the ME4084s nine units up, up to three of them
        per array.
        """
        self.build_top_load(z_top, 'ME484', 5, 2, lit=19)

    def build_powerstore(self, z_top: float) -> None:
        """Twenty five NVMe carriers, run with the bezel off.

        Everything else in this rack is SAS: spinning capacity, reached over
        a fabric, measured in shelves. This is the flash tier those shelves
        cannot be, and the one array here where the drives cost more than
        the enclosure around them.

        Dell photograph it behind a hexagon bezel and plenty run that way,
        but the bezel is a cover and this is drawn without it, next to a
        DD3300 two units down that keeps its. Both are real configurations
        and showing one of each is worth more than showing two identical
        grey fronts: bezel on, you learn the vent pattern; bezel off, you
        learn what is behind every other bezel in the library.
        """
        g = 'POWERSTORE_500T'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.760, face='store_grey')
        for i in range(25):
            cx = -0.170 + i * 0.01420
            self.rounded_prism(g, 'drive_face', (cx, self.front_y - 0.0028, z),
                               (0.0132, 0.0072, h * 0.76), radius=0.0007, bevel=0.0003, steps=4)
            # The release is a tab at the top of the carrier, not a stripe
            # down it: twenty five full height bands of orange is a picture
            # of a fence, and the first pass at this drew exactly that.
            self.rounded_prism(g, 'store_latch', (cx - 0.0044, self.front_y - 0.0068, z + h * 0.26),
                               (0.0040, 0.0042, h * 0.16), radius=0.0006, bevel=0.0002, steps=4)
            self.rounded_prism(g, 'drive_handle', (cx - 0.0044, self.front_y - 0.0062, z - h * 0.06),
                               (0.0026, 0.0036, h * 0.40), radius=0.0005, bevel=0.0002, steps=4)
            self.lens(g, cx + 0.0040, z - h * 0.30, 'blue_led', 0.0009, self.front_y - 0.0072)
        # Power and status sit on the chassis edge, outside where a bezel
        # would clip on, which is why they stay readable with one fitted.
        self.power_button(g, -0.204, z + h * 0.22, radius=0.0080)
        for k, mat in enumerate(('green_led', 'blue_led', 'amber_led')):
            self.lens(g, -0.204, z - h * 0.04 - k * h * 0.11, mat, 0.0016, self.front_y - 0.0056)
        self.enclosure_status(g, 0.204, z, h * 0.62)

    def build_r760xd2(self, z_top: float) -> None:
        """The server that drives the tape library, which had nothing driving it.

        A library four units up with no host is an orphan: something has to
        stage backups to disk and stream them out, and this is the shape
        that job takes. Twelve three and a half inch carriers on the front
        and sixteen more inside, which is why a media server is a 2U box
        full of spinning disk rather than a thin one full of cores.
        """
        g = 'R760XD2'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.800, face='store_grey')
        for row in range(3):
            for col in range(4):
                cx = -0.144 + col * 0.0960
                cz = z + h * 0.27 - row * h * 0.27
                self.rounded_prism(g, 'drive_face', (cx, self.front_y - 0.0028, cz),
                                   (0.0900, 0.0072, h * 0.235), radius=0.0010, bevel=0.0004, steps=5)
                self.rounded_prism(g, 'store_latch', (cx - 0.0398, self.front_y - 0.0068, cz),
                                   (0.0058, 0.0042, h * 0.150), radius=0.0008, bevel=0.0003, steps=4)
                self.lens(g, cx + 0.0374, cz + h * 0.070, 'green_led', 0.0011, self.front_y - 0.0072)
                self.lens(g, cx + 0.0374, cz - h * 0.070, 'amber_led', 0.0010, self.front_y - 0.0072)
                self.perforations(g, cx, cz, 0.060, h * 0.12, 11, 3, y=self.front_y - 0.0070)
        self.enclosure_status(g, 0.204, z, h * 0.62)

    def build_dd3300(self, z_top: float) -> None:
        """The dedup target, and the piece that makes the library part of a chain.

        Without it the rack holds disk and it holds tape and nothing
        connects them. A deduplicating appliance is what a backup actually
        lands on: it takes the daily full that is ninety eight percent the
        same as yesterday's and stores the two percent, and the library
        behind it becomes the copy that leaves the building rather than the
        only copy there is.

        It keeps its bezel where the array two units up is drawn without
        one, which is the point of the pair: this is what all of them look
        like covered, and that is what a storage rack mostly looks like.
        """
        g = 'DD3300'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.720, face='store_grey')
        # The twelve disks behind this bezel are not drawn. The vent field is
        # painted on rather than cut through, so anything behind it renders
        # to nothing, and geometry nobody can see is weight in the file for
        # no picture. The array two units up is the one that shows carriers.
        self.hex_bezel(g, z, h * 0.84, density=26, rows=7)
        self.power_button(g, -0.212, z + h * 0.22, radius=0.0080)
        for k, mat in enumerate(('green_led', 'amber_led')):
            self.lens(g, -0.212, z - h * 0.06 - k * h * 0.12, mat, 0.0016, self.front_y - 0.0056)
        # USB and VGA on the right ear, which the array beside it does not have.
        self.rounded_prism(g, 'store_grey_dark', (0.204, self.front_y - 0.0028, z),
                           (0.034, 0.0074, h * 0.62), radius=0.0014, bevel=0.0005, steps=6)
        self.rounded_prism(g, 'black_plastic', (0.204, self.front_y - 0.0064, z + h * 0.14),
                           (0.0102, 0.0038, 0.0052), radius=0.0008, bevel=0.0003, steps=5)
        self.rounded_prism(g, 'black_plastic', (0.204, self.front_y - 0.0064, z - h * 0.10),
                           (0.0180, 0.0038, 0.0084), radius=0.0009, bevel=0.0003, steps=5)

    def build_pdu(self, z_top: float) -> None:
        g = 'STORAGE_PDU'
        h = 2 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 2, 0.120, face='store_grey_dark')
        for row in range(2):
            for col in range(8):
                self.nema_outlet(g, -0.164 + col * 0.0468, z + (h * 0.20 if row == 0 else -h * 0.20),
                                 0.030, 0.026, plugged=(col < 7))
        self.screen(g, 'pdu', 0.196, z, 0.030, 0.024)

    def build_ups(self, z_top: float) -> None:
        g = 'STORAGE_UPS'
        h = 4 * U
        z = z_top - h / 2
        self.panel_shell(g, z, 4, 0.660, face='store_grey_dark')
        self.screen(g, 'ups', -0.150, z + h * 0.18, 0.062, 0.046)
        for i in range(4):
            self.lens(g, -0.070 + i * 0.014, z + h * 0.18, 'green_led', 0.0022)
        self.perforations(g, 0.090, z + h * 0.18, 0.190, 0.034, 26, 5)
        self.rounded_prism(g, 'store_grey_dark', (0, self.front_y - 0.0024, z - h * 0.24),
                           (0.400, 0.0072, h * 0.40), radius=0.0018, bevel=0.0006, steps=6)
        self.rounded_prism(g, 'drive_handle', (0, self.front_y - 0.0070, z - h * 0.24),
                           (0.090, 0.0044, 0.0100), radius=0.0016, bevel=0.0005, steps=5)

    # --------------------------------------------------------------- build

    def build(self) -> trimesh.Scene:
        at = self.u_centre
        top = self.rail_top

        print('BUILD frame', flush=True)
        self.build_frame()

        print('BUILD fabric and head', flush=True)
        self.build_sas_switch(at(0))
        self.build_cable_manager(at(1), 'CABLE_MANAGER_TOP')
        self.build_controller(top - 2 * U)

        print('BUILD shelves', flush=True)
        self.build_top_load(top - 4 * U, 'ME4084_A', 5, 2, lit=21)
        self.build_top_load(top - 9 * U, 'ME4084_B', 5, 2, lit=18)
        self.build_top_load(top - 14 * U, 'DS460_C', 4, 3, lit=14)
        self.build_flash_shelf(top - 18 * U)

        print('BUILD library', flush=True)
        self.build_tape_library(top - 20 * U)
        self.build_cable_manager(at(24), 'CABLE_MANAGER_LOW')

        print('BUILD capacity, flash and protection', flush=True)
        self.build_me484(top - 25 * U)
        self.build_powerstore(top - 30 * U)
        self.build_r760xd2(top - 32 * U)
        self.build_dd3300(top - 34 * U)

        print('BUILD power', flush=True)
        self.build_pdu(top - 36 * U)
        self.build_ups(top - 38 * U)

        print('BUILD to_scene', flush=True)
        return self.to_scene()


if __name__ == '__main__':
    rack = StorageRack()
    scene = rack.build()
    out = OUT / 'Storage_42U.glb'
    export_glb(scene, out)
    faces = sum(len(g.faces) for g in scene.geometry.values())
    print(out)
    print(f'{faces:,} triangles, {len(scene.geometry)} geometry groups')
