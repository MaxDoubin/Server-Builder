# Which vendors publish real 3D geometry

Ubiquiti turned out to serve a production glTF from every store product
page, which raised the obvious question about everyone else. This is the
answer, checked rather than assumed. Every URL recorded here was fetched
and every model parsed as valid glTF before being written down.

| vendor | geometry | how much | where |
| --- | --- | --- | --- |
| Ubiquiti | yes | 249 of 491 products | store product pages |
| Dell | yes | 3 PowerEdge platforms | WebXR repair guides |
| HPE | no | none | see below |
| Supermicro | no | none | see below |

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

Cisco, Juniper, MikroTik and APC/Schneider were checked separately. See
below.
