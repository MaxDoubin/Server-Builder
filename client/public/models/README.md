# Rack models

Six procedurally generated racks, one per vendor, used by the hero model
view on each rack page. Original geometry, not redistributed commercial
meshes.

| File | Page | Size | Triangles | Nodes |
| --- | --- | --- | --- | --- |
| `unifi-hero-rack.glb` | `/racks/unifi-12u` | 646 KB | 117,068 | 162 |
| `cisco-enterprise-42u.glb` | `/racks/cisco-enterprise-42u` | 900 KB | 206,880 | 255 |
| `juniper-core-42u.glb` | `/racks/juniper-core-42u` | 847 KB | 198,134 | 253 |
| `mikrotik-isp-24u.glb` | `/racks/mikrotik-isp-24u` | 655 KB | 147,338 | 193 |
| `dell-compute-42u.glb` | `/racks/dell-compute-42u` | 535 KB | 100,618 | 219 |
| `storage-42u.glb` | `/racks/storage-dense-42u` | 333 KB | 55,120 | 143 |

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
