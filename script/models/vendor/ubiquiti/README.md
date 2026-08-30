# Ubiquiti's own product models, saved as retrieved

252 glTF binaries covering 249 of the 491 products in the United States
UniFi store, pulled on 30 August 2026 from Ubiquiti's own CDN at
`cdn.ecomm.ui.com`, which is where each store product page loads the model
its 3D viewer shows.

They are here so the set cannot be lost. Nothing in the site build reads
this directory: `client/public/` is what ships, and these are deliberately
not in it.

Every file is byte for byte what the CDN served. None has been decimated,
recompressed, retextured or renamed beyond taking the product slug for its
filename, so each one can still be checked against its source URL. That
mapping, along with each model's byte size, triangle count, mesh count and
material count, is in `../../devices/ubiquiti-store-models.json`, and
`../../devices/UBIQUITI_MODELS.md` explains how the catalogue was walked.

## What they are

Blender exports, Draco compressed, with WebP textures, and they are
production assets rather than marketing approximations. The UDM-SE is
228,670 triangles and carries its screws and its front panel pins as
separately named nodes; its rear panel label is legible down to the FCC ID.
The set totals 24.2 million triangles, median 77,286 per product, against
14,130 for the hand built CRS354 in `../../devices/`.

They arrive Y-up and in metres, with the quarter turn and the hundredfold
scale on the root node, and with the panel running along Z rather than the
X our own generators use. The preview harness in `../../preview/` takes an
up axis and a yaw for exactly this reason.

## Before any of this is served

**Weight.** At 77k triangles apiece these are ten to twenty times heavier
than the site's per device budget. A first pass with gltf-transform
simplify takes the UDM-SE from 228,670 to 42,145, which is still three
times too heavy, so real use needs selective decimation rather than a
uniform ratio. The parts are named well enough to make that possible.

**Licence.** Ubiquiti's Terms of Service section II(b) prohibits
reproducing or distributing their content "without the prior written
permission of Ubiquiti and its applicable licensors", and section II(d)
says the same of their marks. The store's own terms and conditions say
nothing about media reuse, `ui.com/legal/copyright/` redirects to the
store, and no attribution based grant was found on ui.com, store.ui.com or
help.ui.com. Max recalls seeing a use with credit statement, which would
most likely be in the store's 3D viewer overlay or a Design Center export
dialog; neither is reachable without a signed in session.

Saved here at Max's instruction so the set survives. Whether any of it is
served from the site is a separate decision that has not been made, and
publishing would want that grant located first, with the credit line it
asks for.
