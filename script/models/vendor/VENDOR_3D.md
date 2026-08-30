# Which vendors publish real 3D geometry

Ubiquiti turned out to serve a production glTF from every store product
page, which raised the obvious question about everyone else. This is the
answer, checked rather than assumed. Every URL recorded here was fetched
and every model parsed as valid glTF, or unzipped to a real Revit family,
before being written down.

| vendor | geometry | how much | where |
| --- | --- | --- | --- |
| Ubiquiti | glTF | 249 of 491 products | store product pages |
| Teltonika | glTF | roughly 110 devices | product page model viewers |
| Dell | glTF | 3 PowerEdge platforms | WebXR repair guides |
| Chatsworth | Revit | 65 archives | design tools pages |
| Legrand | Revit | racks are a minority of it | BIM resources, via their DAM |
| Schneider, APC | Revit | NetShelter enclosures | document download centre |
| Cisco | glTF | one router | a marketing page |
| Panduit | 2D only | 20 AutoCAD archives | support tools |
| HPE | none | | |
| Supermicro | none | | |
| Juniper | none | | |
| MikroTik | none | | |

`ubiquiti/` and `dell/` hold what was found and downloaded, each with its
own README recording provenance, the discovery chain, and the licence
position.

## Teltonika publishes glTF for most of its catalogue

The best find of the second sweep, and the only one besides Ubiquiti that
is real-time geometry rather than CAD. Every actual device page embeds a
`<model-viewer>` pointing at Teltonika's Wix 3D CDN.

Build the discovery chain like this. The sitemap index at
`https://www.teltonika-networks.com/sitemap.xml` has `dynamic-products_p_*`
children holding 256 product URLs. Fetch each product page and grep for
`"model":"https:\/\/static.wixstatic.com\/3d\/....glb"`. The asset URLs are
`https://static.wixstatic.com/3d/<acct>_<32 hex>.glb`, with four account
prefixes seen so far: `57c734`, `814ec4`, `944deb`, `7d9939`.

Coverage from a 48 page sample: 18 hits, 30 misses, and every single miss
was an accessory (antennas, power supplies, PoE injectors, cables, dust
covers, connectors) or a category index. Every router, switch, access
point, gateway and embedded system had one. So the realistic yield is
roughly 100 to 120 devices.

These are not placeholders. The RUTX11 is 4,948,996 bytes, 25 meshes, 10
materials, 658,589 triangles, glTF 2.0, generator
`Khronos glTF Blender I/O v4.5.49`. The SWM281 switch is 4,810,032 bytes.
That is a higher triangle budget than anything Ubiquiti ships, and it would
need decimating before it went anywhere near a page.

## Chatsworth publishes Revit from an open CDN, and forbids reuse

Two plain server rendered index pages with the file URLs inline. No API, no
login, no form: curl either page and grep for `.zip`.

- `https://www.chatsworth.com/en-us/resources/design-tools/bim-drawings/` gives 27 BIM archives
- `https://www.chatsworth.com/en-us/resources/design-tools/cad-blocks/` gives 38 CAD archives

They resolve to
`https://s3-eu-west-1.amazonaws.com/cdn.production.aws.eu-w1.pimberly.com/public/asset/raw/663b2857ae13c25e14022b2b/<8 hex>/<24 hex>/<Name>.zip`,
also served as `https://cdn.pimber.ly/public/asset/raw/663b2857.../<Name>.zip`.
`663b2857ae13c25e14022b2b` is CPI's Pimberly PIM tenant id.

The contents are genuine: `CPI_PDU-Monitored_eConnect_BIM.zip` unzips to a
1.29MB `Data_Equipment-PDU-Chatsworth-Monitored_eConnect.rfa` plus a spec
text file. Coverage is exactly the rack relevant catalogue: ZetaFrame and
Elevate cabinets, Z4 SeismicFrame, two post and four post racks, eConnect
PDUs in all four flavours, vertical and horizontal cable managers, cable
runway, cold aisle containment, shelves, grounding and wall mount systems.

Their terms of use are the most explicit of any vendor checked, and they
are a hard no:

> "Chatsworth Products, Inc. authorizes you to view and download the
> materials from this Website ("Site") only for your personal,
> non-commercial use, provided that you retain all copyright and other
> proprietary notices contained in the original materials on any copies of
> the materials. You may not modify the materials at this Site in any way
> or reproduce or publicly display, perform, or distribute or otherwise use
> them for any public or commercial purpose."

Nothing was downloaded from them.

## Legrand publishes Revit through a DAM, with a token trap

Index pages at `https://www.legrand.us/resources/bim-models` and
`https://www.legrand.us/resources/cad-drawings`, both paginated
`?q=%3Arelevance&page=1..4`.

The download URL is
`https://legrand.webdamdb.com/directdownload.php?ti=<id>&tok=<tok>&token=$2y$10$<bcrypt>`.
The `&token=$2y$10$...` third parameter is mandatory: without it the chain
403s at the S3 stage. All three parameters are in the listing HTML href, so
scrape the whole href rather than reconstructing it. The chain redirects
`webdamdb.com` to `global-downloads.webdamdb.com/extdownload_direct.php` to
a presigned `storestuff.s3-accelerate.amazonaws.com` URL, and that
signature is single use, so a `curl -I` probe burns it. Use GET.

Verified: 10,015,130 bytes of zip, unzipping to a 577KB `.rfa`, a 9.6MB
`.rvt`, a `.dwfx`, a PDF and a text file.

The caveat is coverage. Legrand US is mostly Wiremold, AV and electrical.
The rack relevant subset is Ortronics and Middle Atlantic, a minority of
the catalogue, so this wants a targeted filter rather than a bulk pull.

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

Not one of the three vendors that publish real-time geometry publishes it
as a download. Ubiquiti serves it to a store page's 3D viewer, Teltonika to
a `<model-viewer>` element, and Dell to a repair guide's WebXR scene, and
in all three cases it is a static file on a CDN with no authentication in
front of it. That also means none of them has a licence attached, because
none is presented as a distribution channel. All are recorded here as all
rights reserved.

The CAD vendors are the mirror image. Chatsworth, Legrand and Schneider all
publish deliberately, to a named audience of specifiers and installers, and
all three say in writing what that audience may do with the files. Being
offered the file openly turns out to correlate with being told no.

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
software this project does not have. And Schneider's terms of use address
reuse explicitly, prohibiting reproduction "other than for your own
personal, non-commercial use ... without Schneider Electric's permission,
given in writing", and reserving all other rights. Silence is one thing;
this is not silence.

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

## Panduit looks like a win and is not

`https://www.panduit.com/en/support/tools/autocad.html` exposes 20
unauthenticated archives at
`https://www.panduit.com/content/dam/panduit/en/website/support/tools1/autocad/zip/autocad-{racks,cabinets,cable-management,cable-pathways,copper,fiber,outlets,power-and-grounding,zone,extras}.zip`,
and they really do download: `autocad-racks.zip` is 3,819,145 bytes of
`application/zip`.

They are flat linework. Unzipping `autocad-cabinets.zip` and parsing the
DXF gives 18,650 `LINE` entities and zero `3DSOLID`, `3DFACE`, `MESH`,
`POLYLINE`, `ACIS` or `REGION`. Panduit's only 3D route is a link out to a
3D Warehouse keyword search rather than a Panduit publisher account, so it
is not verifiable as first party either.

## Juniper and MikroTik publish nothing

Both were grepped across product pages, datasheets, download centres and,
for Juniper, the hardware compatibility tool: no glTF, USDZ, FBX, OBJ,
STEP, DWG, 3DS, SKP or Visio, and no model-viewer, three.js, babylon,
sketchfab or threekit. Juniper's mechanical dimensions exist only as PDF
drawings inside hardware guides. MikroTik's download page has no CAD
section at all.

## Checked properly, publish nothing

Full page fetched, then grepped for `.glb`, `.gltf`, `.usdz`, `.fbx` and
`.step`, and for `model-viewer|sketchfab|threekit|emersya|cylindo|kaon|three.js|babylon|ar-quick-look`.
All clean, no viewer, no asset, no AR: Extreme Networks, Fortinet, Palo
Alto Networks, F5, Netgear, Synology, QNAP, StarTech (including its
`?tab=resources` view), Opengear, and Panduit's product pages.

## Blocked from this sandbox, so genuinely inconclusive

These are not negatives and should not be recorded as any. Each one refused
to serve enough bytes to judge.

- Arista returns 406 to every request under any user agent. Not a byte came
  back. A 406 to everything smells like user agent filtering at the proxy
  rather than a real block, so it is worth another path.
- BIMobject serves a Cloudflare interstitial. This is the one most worth
  revisiting: search surfaced a manufacturer uploaded Tripp Lite by Eaton
  brand page at `bimobject.com/en-us/tripplite/` with per SKU children
  (`/product/sr4post`, `/product/evmi8365x`, `/product/srh45uwdp`) and a
  Vertiv brand page at `bimobject.com/en/vertiv`. Both are first party and
  Tripp Lite is squarely rack gear. Needs a real browser.
- TraceParts answers 202 with an empty body, so it is JS gated.
- 3D ContentCentral fails with HTTP/2 INTERNAL_ERROR.
- Truncated or refused outright: Zyxel (67 bytes), TP-Link (1,866 bytes),
  Vertiv (9 bytes), nVent and Schroff (403), Belden (403), Keysight (403),
  Corning (403), Eaton (stream errors).
- The GitHub API and codeload both 403 through the proxy, so whether
  NetBox's device-type-library carries any geometry is still unknown. Its
  README fetched fine from `raw.githubusercontent.com`, so a per file raw
  pull would work.

## Not reached, for a later sweep

Aruba and HPE Networking, Lenovo ThinkSystem, IBM, Huawei, Nokia, Ciena,
Infinera, Ruckus and CommScope, Digi, Lantronix, Raritan (fetched but not
grepped), Seagate, Western Digital, NetApp, Nutanix, Mimosa, and the DCIM
device libraries: Sunbird dcTrack, Device42, Netzoom and RackTables. The
two Sunbird and Device42 URLs tried came back 404 and 403.

## Licence, across all of them

Not one grants reuse. Chatsworth is quoted in full above and is the
clearest refusal of the set. Cisco requires "the prior written consent of
the copyright owner". Juniper prohibits "the reproduction, modification,
distribution, transmission, republication, display, or performance" of site
content. Schneider reserves all rights beyond personal non-commercial
consultation. Dell's viewer carries a bare copyright line and its terms of
use are behind the same Akamai block that stops the models being fetched.
Ubiquiti's terms require prior written permission and say nothing specific
about the models. Teltonika's site terms were not reached in the sweep and
should be read before anything of theirs is pulled.

So the position is uniform and worth stating plainly: several vendors serve
real geometry from open CDNs, and none of them has said anybody else may
use it.
