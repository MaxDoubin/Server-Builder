# Dell's own PowerEdge models, saved as retrieved

Three glTF binaries, pulled on 30 August 2026: PowerEdge R660, R760 and
R7625. Like the Ubiquiti set next door, nothing in the site build reads
this directory.

Dell does not publish these as downloads. They are the scenes behind the
WebXR repair guides on the support site, exported from Unity by the Needle
build pipeline, and they are heavier than Ubiquiti's: 412,336 triangles for
the R660 across 887 meshes and 13,392 nodes.

## Why these are worth more than their triangle count suggests

They are repair guides, so they are modelled for disassembly. The parts
carry their real service names, down to individual fasteners:
`PEr760_ SystemCover_ Screw_ -1.001`, `R760_ SideWallBracket_Left`,
`Poweredge_R760_Drive_Carrier_Assembly-1.002`. Every internal component a
technician would remove is present as its own named node.

That happens to be exactly what an exploded view needs, and the site
already has one. A hand built chassis can be exploded into the parts
somebody bothered to model; this can be exploded into the parts Dell ships.

## How they were found, because none of this is linked

1. `https://www.dell.com/support/product-details/en-us/product/<code>/resources/3dguides`
2. That tab's content is POST only. A GET returns 405 and a form encoded
   body returns 415. POST JSON to
   `https://www.dell.com/support/resources/en-us/tabloader` with
   `Content-Type: application/json` and `X-Requested-With: XMLHttpRequest`:
   `{"ProductCode":"poweredge-r760","SourceType":"3dguides","Lob":"PowerEdge","ProductIdentification":"coexist","ProductGroup":"ISG","ServiceTag":"","SerialNumber":"","TagId":"","PlatformCode":"","IsNewCoProduct":"0","IsNewCoAsset":"0"}`
3. Each returned viewer page carries the app in a lazy loaded iframe, as
   `data-src` rather than `src`, so grepping for `<iframe src` finds nothing.
4. The app's `assets/index-<hash>.js` names the scene:
   `assets/mySceneClone.glb`. The `?v=<timestamp>` it appends is optional.

Platform ids are not the product names: `IC14000R66000` is the R660,
`IC14000R76000` the R760, `IC1400R762500` the R7625.

`www.dell.com` shop pages are hard 403 to curl behind Akamai, and the
support domain 403s a bare HEAD while answering a full browser GET. The
`glare.kaalo.com` bucket the models sit in has no such protection.

## Coverage, which is thin

Only R660, R760 and R7625 have guides. R6615, R7615, R760xd2, PowerVault
ME4084 and ME484, PowerStore, and the PowerSwitch S5248F-ON and
N3248TE-ON returned none. Storage and networking have nothing at all.

Each file is one scene covering every procedure for its platform, so it
holds parts beyond the bare chassis and some cross platform reuse: nodes
named for the R960 and the DD9900 appear inside the R760 scene.

## Licence

The only notice on Dell's viewer page is `Copyright (c) 2026 Dell Inc.`
Dell's terms of use are behind the same Akamai block, so they could not be
read to quote, and that is recorded here as unverified rather than guessed
at. Nothing found states these may be reused. Treat them as all rights
reserved: publicly served without authentication is not a licence.

Saved at Max's instruction so the set survives. HPE and Supermicro publish
no comparable geometry at all, which was checked and is written up in
`../VENDOR_3D.md`.
