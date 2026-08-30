# Ubiquiti's own 3D models

Every product page in the United States UniFi store loads a glTF binary into
its 3D viewer. Those files are Ubiquiti's production assets, exported from
Blender, Draco compressed, with WebP textures, and they are not marketing
approximations: the UDM-SE is 228,670 triangles with its screws and its
front panel pins as separately named nodes.

`ubiquiti-store-models.json` beside this file is the whole catalogue: 491
products, 249 of which carry a model, 252 model files, 113MB, 24.2 million
triangles between them. Each entry has the product's slug, name, SKU,
category, collection, and for every model its URL, byte size, triangle
count, mesh count and material count.

## How the catalogue was walked

The store is a Next.js app, so every page has a JSON twin at
`https://store.ui.com/_next/data/<buildId>/us/en/<path>.json`, and the build
id is in the `buildId` field of any product page's HTML. Category pages
carry a `subCategories` array whose entries are themselves category slugs,
so a breadth first walk from the eight `all-*` categories reaches all 54 of
them and every product in them.

Two things will trip up a repeat of this. The build id changes on every
store deploy, so read it out of a page rather than pinning it. And roughly
half the catalogue answers the short `/products/<slug>.json` URL with a
Next.js 307 payload pointing at a longer
`/category/<c>/collections/<k>/products/<slug>.json`; following that one hop
is the difference between 245 products and 491.

UISP, airMAX and EdgeMax products have product pages but are not in the US
store's category tree, and the ones checked carry no 3D model.

## What this covers of our racks

Five of the eight Ubiquiti devices in the UniFi 12U rack have a model:
UDM-SE, USW-Pro-Aggregation, USW-Pro-48-PoE, USW-Pro-24-PoE and UPS-2U-Pro.
The two keystone patch panels and the USP-PDU-Pro are in the store and have
no model, so those three still need building by hand.

## Two things to settle before any of this ships

**Weight.** The median model is 77,286 triangles, against 14,130 for the
hand built CRS354. Five of these in one rack is more geometry than the
entire site currently loads. They need decimating, and the parts are named
well enough that decimation can be selective: nothing is lost by dropping
the screw threads.

**Licence.** Ubiquiti's Terms of Service, section II(b), prohibits
reproducing or distributing their content "without the prior written
permission of Ubiquiti and its applicable licensors", and section II(d)
says the same of their marks. The store's own terms and conditions say
nothing about media reuse at all. No blanket grant to reuse these models
with attribution was found on ui.com, store.ui.com or help.ui.com. Until a
grant is located or obtained, this file is an index of public URLs rather
than a licence to serve the files it points at.
