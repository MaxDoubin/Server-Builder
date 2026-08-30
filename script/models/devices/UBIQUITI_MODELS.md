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

**Weight, and what actually works.** The median model is 77,286 triangles
against 14,130 for the hand built CRS354, so these need reducing before a
rack of them is servable. Measured on the UDM-SE, which expands to 336,304
faces once its instanced parts are counted:

Uniform simplification does not work. `gltf-transform simplify` floors at
about 39,600 triangles no matter how loose the error bound is given, and
what comes out at that level is broken in exactly the places that matter:
the LCD panel disappears entirely, the drive bay tears into faceted
shading, and ports 10 and 11 collapse into a triangular smear. The screws
and pins reduce beautifully, from 6,245 and 5,648 faces to 61 and 56, and
the front panel is destroyed. That is the wrong trade in both directions.

Selective reduction does work, because the weight is not where it looks
like it is:

| part | faces | share |
| --- | --- | --- |
| body | 216,777 | 64% |
| screws, 11 instances | 68,695 | 20% |
| pins, 9 instances | 50,832 | 15% |

A third of the model is twenty instances of threaded fastener, each a few
millimetres across on a 443mm panel. Crushing those two meshes alone takes
119,527 faces to about 120. Then the body: 57% of it lies in the front
30mm, and a rack mounted device shows nothing else, so culling behind that
plane costs nothing visible and saves another 92,342.

Together that is 336,304 faces down to roughly 124,500, a 63% cut with no
visible change at all. Which is still too heavy to put ten of in one rack.

So the honest conclusion is that these are not whole rack geometry. They
are detail geometry. The architecture that fits is progressive: keep the
light hand built models for the rack overview, and load the vendor model
for the one device a reader has selected and zoomed into, which is the
only time anybody can see 124,000 triangles' worth of difference.

**Licence.** Ubiquiti's Terms of Service, section II(b), prohibits
reproducing or distributing their content "without the prior written
permission of Ubiquiti and its applicable licensors", and section II(d)
says the same of their marks. The store's own terms and conditions say
nothing about media reuse at all. No blanket grant to reuse these models
with attribution was found on ui.com, store.ui.com or help.ui.com. Until a
grant is located or obtained, this file is an index of public URLs rather
than a licence to serve the files it points at.
