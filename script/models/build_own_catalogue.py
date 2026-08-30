"""Build every hand modelled device to a GLB, and catalogue what came out.

The modules in `devices/` are generators, not models. Running one produces a
GLB; until something runs them, the work exists as code that could make a
switch rather than as a switch anybody can see. This is the step that was
missing: twenty three products were modelled, verified against photographs,
and committed, and not one of them was on the site.

Output mirrors the Ubiquiti catalogue's shape on purpose, because the rack
builder already reads that shape. A device from here and a device from
Ubiquiti differ in exactly two ways that matter downstream, and both are
recorded per entry rather than inferred: ours are Z up, because that is the
frame the generators draw in, and ours carry no baked textures, so they need
no KTX2 transcode.

Usage: python3 script/models/build_own_catalogue.py [--skip-existing]
"""

from __future__ import annotations

import importlib
import inspect
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, "script/models")
sys.path.insert(0, "script/models/devices")

from _device import Device  # noqa: E402
from build_mikrotik_isp_rack import MikroTikIspRack  # noqa: E402
from build_unifi_hero_rack_clean_aligned import export_glb  # noqa: E402

DEVICE_DIR = Path("script/models/devices")
OUT_DIR = Path("client/public/models/own")
CATALOGUE = Path("client/public/data/own-catalogue.json")

# Which vendor a module belongs to, from its filename. Kept as a table rather
# than split on the underscore because "poweredge" and "powerswitch" are Dell
# and "crs326" is not a vendor at all.
VENDORS = {
    "apc": "APC",
    "chatsworth": "Chatsworth",
    "cisco": "Cisco",
    "dell": "Dell",
    "juniper": "Juniper",
    "mikrotik": "MikroTik",
    "ubiquiti": "Ubiquiti",
}

# What a thing is, for the palette's group filter. Matched against the module
# name in order, first hit wins, so the more specific patterns come first.
GROUPS: list[tuple[tuple[str, ...], str]] = [
    (("pdu", "smt", "ups"), "Power"),
    (("rack", "cabinet"), "Racks and frames"),
    (("powervault", "poweredge", "ucs", "nas"), "Servers and storage"),
    (("firepower", "srx"), "Security"),
    (("asr", "isr", "mx2", "mx4", "ccr"), "Routing"),
]


# Not everything modelled is something you mount inside a rack, and the U
# field alone cannot tell you: a 45U frame and a 1825mm vertical PDU both
# report a large number of units because that is genuinely how tall they are.
# A frame is the thing devices go into, and a 0U PDU bolts to the side of the
# uprights rather than across the mounting rails, so neither is offered as a
# device to stack. Keyed by file slug because that is what is stable.
NOT_MOUNTABLE = {
    "cpi-55053": "frame",
    "cpi-ea3020": "vertical",
}


def group_for(module: str) -> str:
    for keys, name in GROUPS:
        if any(k in module for k in keys):
            return name
    return "Switching"


def vendor_for(module: str) -> str:
    return VENDORS.get(module.split("_")[0], "Other")


def file_slug(dev: Device, module_name: str) -> str:
    """A URL safe name for the file and the catalogue key.

    Not `dev.slug`. That is the node group name inside the GLB and it has to
    keep matching the device id in the rack definitions or check-rack-models
    fails, so it stays exactly as the module wrote it, in the shouty form the
    rack files use (C9300_48P). What goes in a path and a query string is the
    lowercase hyphenated form, and getting these the same way round matters:
    the wired rack already loads /models/own/usp-pdu-pro.glb, so USP_PDU_PRO
    has to normalise onto that file rather than forking a second copy.
    """
    raw = (dev.slug or module_name).lower().replace("_", "-")
    return "-".join(part for part in raw.split("-") if part)


def device_classes(module_name: str) -> list[type[Device]]:
    """Every Device subclass a module defines itself.

    Defined itself matters: a module that imports Device for typing would
    otherwise register the base class and blow up on `build`.
    """
    mod = importlib.import_module(module_name)
    out = []
    for _, obj in inspect.getmembers(mod, inspect.isclass):
        if issubclass(obj, Device) and obj is not Device and obj.__module__ == module_name:
            out.append(obj)
    return out


def main() -> int:
    skip_existing = "--skip-existing" in sys.argv
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CATALOGUE.parent.mkdir(parents=True, exist_ok=True)

    modules = sorted(
        p.stem for p in DEVICE_DIR.glob("*.py") if not p.stem.startswith("_")
    )

    entries = []
    failed = []
    for module_name in modules:
        try:
            classes = device_classes(module_name)
        except Exception as exc:  # noqa: BLE001
            failed.append((module_name, f"import: {exc}"))
            continue
        if not classes:
            continue

        for cls in classes:
            try:
                dev = cls()
                slug = file_slug(dev, module_name)
                out = OUT_DIR / f"{slug}.glb"

                if not (skip_existing and out.exists()):
                    # A fresh rack per device, used only for its primitive
                    # helpers and material table. Reusing one would let a
                    # device inherit the previous device's materials, which
                    # is exactly the sharing every module is written to avoid.
                    rack = MikroTikIspRack()
                    rack.parts.clear()
                    dev.build(rack, 0.0)
                    scene = rack.to_scene()
                    export_glb(scene, out)
                    tris = sum(len(g.faces) for g in scene.geometry.values())
                    groups = len(scene.geometry)
                else:
                    tris = groups = 0

                entries.append(
                    {
                        "slug": slug,
                        "name": dev.name or slug,
                        "sku": dev.name or slug,
                        # The node group name inside the GLB, which the rack
                        # definitions key on and which is not the file slug.
                        "node": dev.slug or "",
                        "vendor": vendor_for(module_name),
                        "group": group_for(module_name),
                        "mount": NOT_MOUNTABLE.get(slug, "rack"),
                        "u": int(dev.u),
                        "widthM": round(float(dev.width), 4),
                        "depthM": round(float(dev.depth), 4),
                        "sizeM": [
                            round(float(dev.width), 4),
                            round(float(dev.height), 4),
                            round(float(dev.depth), 4),
                        ],
                        "triangles": tris,
                        "bytes": out.stat().st_size,
                        "model": f"/models/own/{slug}.glb",
                        "thumb": f"/models/own/thumbs/{slug}.webp",
                        # Where the dimensions came from, so a figure on the
                        # page can always be traced back to a vendor document.
                        "source": dev.source or "",
                        "own": True,
                        # The generators draw Z up; every vendor export is Y
                        # up. The viewer needs to know which without probing.
                        "up": "z",
                        "module": module_name,
                    }
                )
                print(f"ok   {slug:34s} {tris:>7,} tris  {out.stat().st_size/1024:>6.0f} KiB")
            except Exception as exc:  # noqa: BLE001
                failed.append((f"{module_name}.{cls.__name__}", str(exc)[:140]))
                print(f"FAIL {module_name}.{cls.__name__}: {str(exc)[:110]}")

    entries.sort(key=lambda e: (e["vendor"], e["name"]))
    CATALOGUE.write_text(
        json.dumps(
            {
                "source": "Modelled by hand from vendor photographs and dimensioned drawings.",
                "note": (
                    "Geometry is original work. The dimensions it was built to are "
                    "the vendors' published figures, cited per device."
                ),
                "generated": date.today().isoformat(),
                "count": len(entries),
                "totalBytes": sum(e["bytes"] for e in entries),
                "devices": entries,
            },
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    print(f"\n{len(entries)} devices, {sum(e['bytes'] for e in entries)/1024/1024:.1f}MB")
    print(f"catalogue: {CATALOGUE}")
    if failed:
        print(f"\n{len(failed)} failed:")
        for name, why in failed:
            print(f"  {name}: {why}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
