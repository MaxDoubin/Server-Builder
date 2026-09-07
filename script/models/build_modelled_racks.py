"""Assemble the hand modelled devices into rack models.

The four racks added to the gallery from hardware modelled here shipped
without an authored model, so their detail pages fell back to the procedural
renderer: correct boxes in correct positions, drawn from the rack definition,
and nothing like the devices themselves. The detailed geometry existed the
whole time and nothing put it in a frame.

This is the step that was missing. Every device already knows how to draw
itself into a rack at a given height, because that is the signature the
preview harness has always called: `build(rack, z)`. So a rack model is that
call, once per device, at the height the definition says, inside a frame.

The composition is shared and the geometry is not. Each device still draws
its own jacks, cages, lamps and materials from its own photographs; this file
only decides what goes where, which is exactly the part a rack elevation is
allowed to have an opinion about.

Positions come from the same RackDefinition the page renders, read out of the
published dataset rather than restated here. A generator that keeps its own
copy of the layout is how the older rack models drifted from their
definitions twice, and check-rack-models exists because of it.

Usage: python3 script/models/build_modelled_racks.py [slug ...]
"""

from __future__ import annotations

import importlib
import inspect
import json
import os
import sys

import numpy as np
from pathlib import Path

sys.path.insert(0, "script/models")
sys.path.insert(0, "script/models/devices")

from _device import U, Device  # noqa: E402
from build_enterprise_base import EnterpriseRack, export_glb  # noqa: E402

# Where the uncompressed builds land. Defaults to the shipped models
# directory because that is where they are compressed in place, but honours
# RACK_OUT like every other generator here: running this without thinking
# overwrites four shipped, compressed artifacts with multi megabyte raw ones,
# and the only sign is the page suddenly pulling 6MB.
OUT_DIR = Path(os.environ.get("RACK_OUT", "client/public/models"))
CATALOGUE = Path("client/public/data/own-catalogue.json")

# Which rack definition each model is built from, and what the frame looks
# like. Finish is per vendor because a MikroTik stack in a white studio frame
# and a Dell row in a black cabinet are different rooms, and drawing both the
# same was the single biggest inaccuracy in the first pass of this library.
RACKS: dict[str, dict] = {
    "cisco-edge-16u": {
        "file": "ciscoEdge",
        "units": 16,
        "frame": "nexus_black",
        "note": "A 16U Cisco enterprise edge: an ASR on the circuit, an ISR 4451-X behind it, a Firepower, a Nexus spine and two Catalyst access switches.",
    },
    "juniper-mx-24u": {
        "file": "juniperMx",
        "units": 24,
        "frame": "nexus_black",
        "note": "A 24U Juniper provider edge: an MX240 card chassis, an MX204, a QFX5120 leaf, EX4400 and EX4300 access, and an SRX1500.",
    },
    "dell-row-24u": {
        "file": "dellRow",
        "units": 24,
        "frame": "nexus_black",
        "note": "A 24U Dell row: an 84 bay PowerVault under three generations of PowerEdge, with an S5248F-ON on top of the rack.",
    },
    "mikrotik-crs-12u": {
        "file": "mikrotikCrs",
        "units": 12,
        "frame": "nexus_black_dark",
        "note": "A 12U MikroTik stack: five Cloud Router Switches that look alike from a distance and share no geometry at all.",
    },
}


def device_index() -> dict[str, tuple[str, type[Device]]]:
    """Every modelled device, keyed by the node name its GLB group carries.

    Keyed on `dev.slug` rather than the module name because that is the name
    the rack definitions use as a device id, and keeping those two in step is
    what lets check-rack-models compare the shipped model against the
    published dataset at all.
    """
    out: dict[str, tuple[str, type[Device]]] = {}
    for path in sorted(Path("script/models/devices").glob("*.py")):
        if path.stem.startswith("_"):
            continue
        mod = importlib.import_module(path.stem)
        for _, obj in inspect.getmembers(mod, inspect.isclass):
            if issubclass(obj, Device) and obj is not Device and obj.__module__ == path.stem:
                slug = obj().slug
                if slug:
                    out[slug] = (path.stem, obj)
    return out


def rack_devices(slug: str) -> list[dict]:
    """The device list the site actually renders, in top to bottom order.

    The published dataset is one flat list of devices tagged with their
    rack and their position in it, rather than a rack holding devices, so
    this filters and sorts rather than looking a rack up. Sorting on
    `position` explicitly instead of trusting file order, because the whole
    point of reading the dataset is not to depend on how it was written.
    """
    data = json.loads(Path("dist/public/data/rack-library.json").read_text())
    rows = [d for d in data["devices"] if d.get("rack") == slug]
    if not rows:
        raise SystemExit(f"{slug} is not in the published rack dataset")
    return sorted(rows, key=lambda d: d["position"])


def base_slug(device_id: str) -> str:
    """The product behind an id like `QFX5120_48Y_B`, which is the same
    product as `QFX5120_48Y_A`.

    Only a single trailing letter is stripped, and only after an underscore,
    so `UCS_C220_A` resolves and `CRS326_24S` is left alone.
    """
    head, sep, tail = device_id.rpartition("_")
    return head if sep and len(tail) == 1 and tail.isalpha() else device_id


class ModelledRack(EnterpriseRack):
    """A frame with hand modelled devices mounted in it."""

    def __init__(self, units: int, frame: str) -> None:
        self.units = units
        self.frame_material = frame
        self.rail_material = frame
        super().__init__()

    # ----------------------------------------------------------- furniture

    # Frame furniture is not a product and does not get a device module. The
    # device library models one real product per file, from photographs of
    # that product, down to its own connectors. A 24 position keystone panel
    # is not that: it is punched steel with holes in it, sold by everybody,
    # and there is no photograph of "the" one to draw. The rack definitions
    # already say so by giving all of it vendor "Generic".
    #
    # That distinction turned out to be why four racks in this library were
    # half blanking panel. This composer could draw products and nothing
    # else, so a rack assembled here could not have a patch panel, a cable
    # manager or a PDU, even though every procedurally generated rack has all
    # three. The gap did not read as missing furniture, it read as empty
    # rack, and got covered with a panel. Three of the four had a UPS and no
    # PDU at all, which is a rack nobody can plug in.

    def build_keystone_panel(self, z: float, group: str, patched: int = 24) -> None:
        """A 24 position keystone panel: a steel blank and whatever is in it.

        Drawn with unpopulated positions as open holes rather than as dark
        jacks, because an empty keystone and an unplugged one are different
        states and a patch panel is mostly the difference between them.
        """
        self.panel_shell(group, z, 1, 0.060, face=self.inset_material)
        for i, x in enumerate(np.linspace(-0.185, 0.185, 24)):
            if i < patched:
                self.rj45_socket(group, float(x), z, plugged=True, led=False,
                                 plug_color='blue_cable' if i >= patched - 4 else 'clear_plug')
            else:
                self.rounded_prism(group, 'black_matte', (float(x), self.front_y - 0.0044, z),
                                   (0.0150, 0.0030, 0.0128), radius=0.0010, bevel=0.0004, steps=5)

    def build_rack_pdu(self, z: float, u: int, group: str, outlets: int = 8) -> None:
        """A switched, metered strip. Shallow, because it is nearly all air."""
        self.panel_shell(group, z, u, 0.110, face=self.inset_material)
        rows = 2 if u > 1 else 1
        per = max(1, outlets // rows)
        span = 0.330
        for row in range(rows):
            dz = 0.0 if rows == 1 else (U * 0.44 if row == 0 else -U * 0.44)
            for i in range(per):
                x = -span / 2 + (i + 0.5) * span / per
                self.nema_outlet(group, x, z + dz, 0.030, 0.026, plugged=(i < per // 2))
        self.screen(group, 'pdu', 0.196, z, 0.030, 0.024)

    def build_rack_ups(self, z: float, u: int, group: str) -> None:
        """A line interactive UPS: a status panel, some lamps, and a lot of vent.

        Deep and heavy, which is why it is always at the bottom, and drawn
        deeper than anything else here because the depth is the batteries.
        """
        self.panel_shell(group, z, u, 0.440, face=self.inset_material)
        self.screen(group, 'ups', -0.156, z, 0.056, 0.042)
        for i in range(3):
            self.lens(group, -0.096 + i * 0.014, z, 'green_led', 0.0020)
        self.perforations(group, 0.070, z, 0.220, u * U * 0.42, 30, max(4, u * 3))
        self.rounded_prism(group, 'drive_handle', (0.204, self.front_y - 0.0064, z),
                           (0.022, 0.0044, u * U * 0.34), radius=0.0012, bevel=0.0005, steps=5)

    def build_console_panel(self, z: float, group: str, ports: int = 16) -> None:
        """Out of band access: one serial port per device, on its own network.

        The panel nobody thinks about until the day it is the only thing
        working, which is why a rack that has one is a rack somebody has
        actually had a bad night in.
        """
        self.panel_shell(group, z, 1, 0.240, face=self.inset_material)
        for i in range(ports):
            self.rj45_socket(group, -0.196 + i * 0.0168, z, plugged=(i < ports - 4), led=True)
        self.rj45_socket(group, 0.148, z, plugged=True, led=True)
        self.perforations(group, 0.196, z, 0.040, 0.024, 7, 4)

    def compose(self, devices: list[dict], index: dict[str, tuple[str, type[Device]]]) -> None:
        self.build_frame()
        at = 0
        for spec in devices:
            u = int(spec["u"])
            entry = index.get(spec["id"]) or index.get(base_slug(spec["id"]))
            if entry is None and spec.get("vendor") == "Generic":
                # Frame furniture. A Generic vendor is the definitions' own
                # way of saying "this is not a product", and the device
                # library only ever holds products, so nothing here will
                # arrive with a module and nothing here should.
                self.build_furniture(spec, self.u_centre(at, u), u)
                at += u
                continue
            if entry is None:
                # A real product with no module behind it would otherwise be
                # a silent hole. Better to know which.
                print(f"    no model for {spec['id']}, leaving {u}U empty")
                at += u
                continue
            _, cls = entry
            dev = cls()
            # A rack can hold two of the same product, and usually should:
            # leaves come in pairs and an SRX cluster is two nodes. The
            # definition tells them apart with a suffix, and the node group
            # has to carry that suffix rather than the product's own slug, or
            # the two draw on top of each other under one name and only one
            # of them can ever be clicked.
            dev.slug = spec["id"]
            dev.build(self, self.u_centre(at, u))
            at += u

    def build_furniture(self, spec: dict, z: float, u: int) -> None:
        """Draw one piece of generic frame furniture from its dataset row."""
        model = (spec.get("model") or "").lower()
        family = spec.get("family")
        if family == "patch":
            self.build_keystone_panel(z, spec["id"], patched=int(spec.get("ports") or 24))
        elif family == "pdu":
            self.build_rack_pdu(z, u, spec["id"], outlets=int(spec.get("ports") or 8))
        elif family == "server" and "console" in model:
            self.build_console_panel(z, spec["id"], ports=max(1, int(spec.get("ports") or 16) - 1))
        elif family == "ups":
            self.build_rack_ups(z, u, spec["id"])
        elif "cable manager" in model:
            self.build_cable_manager(z, spec["id"])
        elif family == "blank":
            self.build_blank(z, u, spec["id"], vented="vented" in model)
        else:
            # Falling back to a blanking panel for anything unrecognised is
            # how a UPS got drawn as a sheet of steel: the rack looked full,
            # the name check passed because the node group was there, and
            # nothing said the picture was wrong. An unknown family is drawn
            # as a panel because a hole is worse, but it says so.
            print(f"    no furniture builder for {spec['id']} (family {family!r}),"
                  f" drawing {u}U of blanking panel")
            self.build_blank(z, u, spec["id"])


def build(slug: str, index: dict[str, tuple[str, type[Device]]]) -> None:
    cfg = RACKS[slug]
    devices = rack_devices(slug)
    rack = ModelledRack(cfg["units"], cfg["frame"])
    rack.parts.clear()
    rack.compose(devices, index)
    scene = rack.to_scene()
    out = OUT_DIR / f"{slug}.glb"
    export_glb(scene, out)
    tris = sum(len(g.faces) for g in scene.geometry.values())
    size = out.stat().st_size / 1024 / 1024
    print(f"ok   {slug:18s} {tris:>8,} tris  {size:>5.1f}MB  {len(scene.geometry)} groups")


def main() -> int:
    wanted = [a for a in sys.argv[1:] if not a.startswith("-")] or list(RACKS)
    index = device_index()
    print(f"{len(index)} modelled devices available\n")
    for slug in wanted:
        if slug not in RACKS:
            print(f"skip {slug}: not a modelled rack")
            continue
        build(slug, index)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
