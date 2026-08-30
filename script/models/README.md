# Rack model generators

These build the GLB files in `client/public/models`. They do not run as
part of `npm run build`: models change rarely and deliberately, the
toolchain is heavy, and the compressed artifact is what gets committed.

## Running them

```
pip install numpy trimesh pillow scipy networkx
python3 build_unifi_hero_rack_clean_aligned.py
python3 build_cisco_enterprise_rack.py
```

Each writes an uncompressed GLB one directory up: 12.9 MB for the UniFi
rack, 18.2 MB for the Cisco one. Neither of those ships. Compress with
the command in `client/public/models/README.md`, which takes them to
about 650 KB and 960 KB.

## What is in here

`build_vega_edge_rack_extreme.py` is the base `Builder`: primitives,
materials, and a generic rack it can emit on its own.

`build_unifi_hero_rack_clean_aligned.py` is the UniFi studio frame, and
it carries the shared part library that everything else builds on:
`rj45_socket`, `sfp_cage`, `fan`, `nema_outlet`, `perforations`, `screw`,
`lens`, `power_button`, `screen`, `rounded_prism`, `curve_tube`.

`build_cisco_enterprise_rack.py` subclasses that for a full 42U
enterprise rack. It is deliberately a different shape: a 6RU modular
chassis with horizontal line cards, a 6RU blade chassis with eight
half-width bays over four front supplies, fiber-only spines with no
copper on them at all, and rack servers whose entire front is drive bays.
Every rack unit height is Cisco's published figure, cited in the rack's
data file.

## Adding a vendor

Subclass `UniFiHeroRack` for the part library, override `build_frame` if
the rack is a different shape, write a builder per device, and compose
them in `build()`. Then add the model and its part table to
`client/src/lib/racks/heroModels/`.

Keep the node names meaningful and one group per device: the site picks
parts by their top level group name, and that is also why the compression
step must not merge meshes.
