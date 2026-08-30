# Which vendors publish real 3D geometry

Ubiquiti turned out to serve a production glTF from every store product
page, which raised the obvious question about everyone else. This is the
answer, checked rather than assumed. Every URL recorded here was fetched
and every model parsed as valid glTF before being written down.

| vendor | geometry | how much | where |
| --- | --- | --- | --- |
| Ubiquiti | glTF | 249 of 491 products | store product pages |
| Dell | glTF | 3 PowerEdge platforms | WebXR repair guides |
| Schneider, APC | Revit | NetShelter enclosures | document download centre |
| Cisco | glTF | one router | a marketing page |
| HPE | none | | |
| Supermicro | none | | |
| Juniper | none | | |
| MikroTik | none | | |

`ubiquiti/` and `dell/` hold what was found, each with its own README
recording provenance, the discovery chain, and the licence position.

## HPE publishes nothing extractable

The ProLiant DL380 Gen11 product page and its buy.hpe.com equivalent carry
no `.glb`, `.gltf`, `.usdz`, `.fbx`, model-viewer, three.js, babylon or
sketchfab reference at all. The `3d` and `360` matches in them are CSS:
`translate3d` and a `360px` media query.

HPE's actual 3D offering is the HPE 3D Catalog, built by Kaon Interactive,
at `m.kaon.com/c/hp`. Its app serves `js/conf.js` and `js/build.js` as
encrypted binary rather than readable JavaScript: a proprietary WebGL
format with no glTF anywhere in it and no export path. No HPE STEP, IGES
or 3D PDF portal was found either.

## Supermicro publishes nothing

No 3D or CAD token of any kind on its system product pages, and no CAD
download centre: the obvious URL for one is a 404. Everything findable is
community uploaded to GrabCAD or Cults3D, which is not first party and is
not the same thing.

## The pattern worth noticing

Neither vendor that publishes geometry publishes it as a download. Ubiquiti
serves it to a store page's 3D viewer and Dell serves it to a repair
guide's WebXR scene, and in both cases it is a static file on a CDN with no
authentication in front of it. That also means neither has a licence
attached, because neither is presented as a distribution channel. Both are
recorded here as all rights reserved.

## Schneider and APC publish Revit, which is real but not usable here

Schneider serve Autodesk Revit families for NetShelter enclosures, with no
login, from their document download centre. Both files checked are genuine
Revit families rather than stubs, OLE2 compound documents carrying Revit's
`PartAtom` and `PartitionTable` streams. Build the URL as
`https://download.schneider-electric.com/files?p_Doc_Ref=<REF>&p_enDocType=BIM+Model&p_File_Name=<NAME>`,
taking the reference and filename from the `documentReference` and
`documentName` records in a product page's inline JavaScript. The download
API itself is Akamai blocked, so mine the product HTML instead.

Two traps. The document type labelled CAD on an APC page is a Microsoft
Visio stencil, which is 2D. And coverage favours enclosures: the NetShelter
SX and WX have BIM models, an AP8959 rack PDU has only the Visio stencil,
and a Smart-UPS SMT3000RM2U has neither.

Nothing was downloaded from them, for two reasons that agree. Revit is not
a format anything here can read, so the files would need converting through
software this project does not have. And Schneider's terms of use are the
only ones of the four that address reuse explicitly, prohibiting
reproduction "other than for your own personal, non-commercial use ...
without Schneider Electric's permission, given in writing", and reserving
all other rights. Silence is one thing; this is not silence.

## Cisco has one model, for a router nobody asked about

Cisco publishes exactly one production glTF, for the 8608 router, hard
coded into their own three.js bundle at
`.../router_new/js/app.js` as
`.../router_new/models/model/oct10_10.glb`, with PBR textures and an
environment cubemap beside it.

It cannot be fetched from here. Every binary under cisco.com `/content/dam/`
and `/c/dam/` returns 403 to this egress, including the sibling textures and
the Visio stencil archives, while HTML from the same paths returns 200.
That is an Akamai rule rather than evidence the file is missing.

None of the products this project needs has anything. The Catalyst 9300
3d-model URL is an alias of the ordinary product page, the ASR 1000 one is
a 404, and the Catalyst 6800 one offers a Visio stencil. Cisco's actual
geometry library is 2D Visio, 113 archives of it. The 3D animation pages
in the hardware install guides are jQuery image sliders over pre rendered
frames, with no geometry behind them.

## Juniper and MikroTik publish nothing

Both were grepped across product pages, datasheets, download centres and,
for Juniper, the hardware compatibility tool: no glTF, USDZ, FBX, OBJ,
STEP, DWG, 3DS, SKP or Visio, and no model-viewer, three.js, babylon,
sketchfab or threekit. Juniper's mechanical dimensions exist only as PDF
drawings inside hardware guides. MikroTik's download page has no CAD
section at all.

## Licence, across all of them

Not one grants reuse. Cisco requires "the prior written consent of the
copyright owner". Juniper prohibits "the reproduction, modification,
distribution, transmission, republication, display, or performance" of site
content. Schneider reserves all rights beyond personal non-commercial
consultation. Dell's viewer carries a bare copyright line and its terms of
use are behind the same Akamai block that stops the models being fetched.
Ubiquiti's terms require prior written permission and say nothing specific
about the models.

So the position is uniform and worth stating plainly: several vendors serve
real geometry from open CDNs, and none of them has said anybody else may
use it.
