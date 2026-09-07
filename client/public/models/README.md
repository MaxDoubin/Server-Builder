# Rack models

Ten racks, used by the hero model view on each rack page. Original
geometry, not redistributed commercial meshes.

Six are procedural, one generator per vendor, where every device is drawn
by that generator from published dimensions.

| File | Page | Size | Triangles | Nodes |
| --- | --- | --- | --- | --- |
| `cisco-enterprise-42u.glb` | `/racks/cisco-enterprise-42u` | 1,112 KB | 253,282 | 343 |
| `juniper-core-42u.glb` | `/racks/juniper-core-42u` | 1,022 KB | 239,852 | 292 |
| `mikrotik-isp-24u.glb` | `/racks/mikrotik-isp-24u` | 939 KB | 216,560 | 277 |
| `dell-compute-42u.glb` | `/racks/dell-compute-42u` | 739 KB | 153,388 | 264 |
| `unifi-hero-rack.glb` | `/racks/unifi-12u` | 646 KB | 117,068 | 162 |
| `storage-42u.glb` | `/racks/storage-dense-42u` | 436 KB | 78,900 | 173 |

Four are assembled by `script/models/build_modelled_racks.py` out of the
device library in `script/models/devices/`, where each product is a module
of its own drawn from photographs of that product. Those read as noticeably
sharper than the procedural racks, because a generator shared across twenty
devices cannot know that a Catalyst's uplink bay has a hinged seam and a
MikroTik's port numbers are silkscreened in their own typeface.

| File | Page | Size | Triangles | Nodes |
| --- | --- | --- | --- | --- |
| `juniper-mx-24u.glb` | `/racks/juniper-mx-24u` | 920 KB | 192,326 | 280 |
| `dell-row-24u.glb` | `/racks/dell-row-24u` | 755 KB | 109,272 | 259 |
| `cisco-edge-16u.glb` | `/racks/cisco-edge-16u` | 736 KB | 136,110 | 225 |
| `mikrotik-crs-12u.glb` | `/racks/mikrotik-crs-12u` | 496 KB | 64,580 | 173 |

The composer draws products from that library and, separately, the frame
furniture that is not a product: patch panels, cable managers, blanking
panels and PDUs, all of which the rack definitions mark `vendor: "Generic"`.
It could only draw products for a while, and the effect was not a missing
patch panel, it was four racks that were between a third and a half
blanking panel with no PDU in three of them.

## Where they came from

The sources are the Python generators in `script/models/`. Each emits an
uncompressed binary glTF of 5 to 18 MB, which is a fine thing to open in
Blender and a bad thing to send to a phone, so what ships here is a
compressed build.

## How they were compressed

```
npx @gltf-transform/cli@4.4.2 optimize in.glb out.glb \
  --compress meshopt --texture-compress webp \
  --join false --flatten false --instance false --palette false \
  --simplify-error 0.0005
```

`--join`, `--flatten`, `--instance` and `--palette` are all off on purpose.
Every one of them merges meshes, and the node names are load bearing: the
model view picks parts by their top level group (`USW_PRO_24_POE`,
`MX7000`, and so on) and maps that to the device data, so a click on a
switch can open the switch's real figures. Merge the meshes and there is
nothing left to click.

The toolchain is deliberately not a dependency of this project. It runs
once by hand when a model changes, and the artifact is what gets committed.

## Colour

`baseColorFactor` is linear in glTF, and every colour in the generators is
authored as the sRGB triple you would read off a photograph, so
`export_glb` converts on the way out. Skipping that conversion brightens
everything by roughly a 2.2 gamma, which is invisible on a white UniFi rack
and turns a charcoal PowerEdge panel the colour of brushed aluminium.

## Decoding

meshopt compression needs a decoder at runtime. It comes from
`three/examples/jsm/libs/meshopt_decoder.module.js`, which is about 5 KB
gzipped and rides on the already lazy three.js chunk.
