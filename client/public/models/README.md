# unifi-hero-rack.glb

A procedurally generated UniFi rack, used by the hero model view on
`/racks/unifi-12u`. Original geometry, not a redistributed commercial mesh.

## Where it came from

The source is a Python generator that emits a 12.72 MB binary glTF with
484,958 triangles across 162 nodes. That is a fine thing to open in Blender
and a bad thing to send to a phone, so what ships here is a compressed
build of it.

## How it was compressed

```
npx @gltf-transform/cli@4.4.2 optimize in.glb unifi-hero-rack.glb \
  --compress meshopt --texture-compress webp \
  --join false --flatten false --instance false --palette false \
  --simplify-error 0.0005
```

12.72 MB to 629 KB, and 484,958 triangles to 110,150.

`--join`, `--flatten`, `--instance` and `--palette` are all off on purpose.
Every one of them merges meshes, and the node names are load bearing: the
model view picks parts by their top level group (`USW_PRO_24_POE`,
`UNVR_PRO_7`, and so on) and maps that to the device data, so a click on a
switch can open the switch's real figures. Merge the meshes and there is
nothing left to click.

The toolchain is deliberately not a dependency of this project. It runs once
by hand when the model changes, and the artifact is what gets committed.

## Decoding

meshopt compression needs a decoder at runtime. It comes from
`three/examples/jsm/libs/meshopt_decoder.module.js`, which is about 5 KB
gzipped and rides on the already lazy three.js chunk.
