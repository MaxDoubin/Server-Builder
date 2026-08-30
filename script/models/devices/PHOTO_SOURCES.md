# Photograph sources for the rack device library

Every device under `script/models/devices/` is modelled by looking at the
product, not by reading a port count off a datasheet. This file is the
index of what was looked at.

Each entry was found by a research pass that checked the URL end to end:
HTTP 200, an `image/*` content type, over 20KB, and then the image opened
and eyeballed to confirm it is the right product from a usable angle. That
last step is the one that matters. A search result that claims to be a
Nexus 9336C-FX2 and is actually a 93180YC-EX will produce a beautifully
detailed model of the wrong switch.

## How to use one of these

The sandbox browser cannot reach these hosts, but `curl` can, and the Read
tool renders a local image. So the loop is:

    curl -sL -o photo.jpg '<url>'          # -A "Mozilla/5.0" for dl.dell.com
    python3 -c "from PIL import Image; ..."  # resize to about 1500px
    # then Read the file, crop into it, and measure

Measure rather than eyeball. Calibrate the picture against the one
dimension every rack product publishes: the 482.6mm across a 19 inch face
plate. That fixes millimetres per pixel, and every other feature on the
panel can then be read off in real units. `mikrotik_crs354_48g.py` carries
a worked example of this in its measurement block.

Beware of two things these hosts do. Reseller photographs often carry a
watermark, which is usually harmless because it sits below the port row but
occasionally crosses the panel. And a product photographed from slightly
above is foreshortened vertically: horizontal measurements stay true,
vertical ones do not, so check the aspect of something you know (an 8P8C
opening is about as tall as it is wide) before trusting a height.



## MikroTik

All 20 URLs verified (HTTP 200, `image/png`, all >20 KB). Every one was also opened and visually inspected before selection.

PRODUCT: CRS354-48G-4S+2Q+RM
    https://cdn.mikrotik.com/web-assets/rb_images/1901_hi_res.png   (image/png, 1001639 B, 4382x1652 — front-on with slight top-down; full 48x RJ45 in two rows, 4x SFP+, 2x QSFP+, console + MGMT RJ45, PWR1/PWR2/FAULT LEDs, reset, rack ears; model text "CRS354-48G-4S+2Q+" readable)
    https://cdn.mikrotik.com/web-assets/rb_images/1899_hi_res.png   (image/png, 3175953 B, 5687x2687 — front 3/4 from the left; gives bezel depth, side vent grille and rack-ear profile)

PRODUCT: CRS326-24G-2S+RM
    https://cdn.mikrotik.com/web-assets/rb_images/1301_hi_res.png   (image/png, 479973 B, 2560x1695 — essentially front-on, mild top-down; console RJ45, PWR/RES/USR LEDs, 24x RJ45 as three 8-port blocks in two rows, SFP+1/SFP+2, "Cloud Router Switch" badge, MikroTik logo)
    https://help.mikrotik.com/docs/download/attachments/17956889/crs326-24g-2s.png   (image/png, 40476 B, 600x109 — manual's front 3/4; same panel, useful only as a cross-check, low resolution)
    Note: MikroTik's gallery for this model has only three images — this front shot, an internal PCB photo, and the rear. No higher-res straight-on front exists on their CDN.

PRODUCT: CRS328-24P-4S+RM
    https://cdn.mikrotik.com/web-assets/rb_images/1493_hi_res.png   (image/png, 494929 B, 2560x951 — front-on with slight top-down; orange PoE band, 24x RJ45 in two rows, 4x SFP+ in a 2x2 block, CONSOLE RJ45, RESET and MODE buttons, PoE/status LED cluster at far left)
    https://cdn.mikrotik.com/web-assets/rb_images/1494_hi_res.png   (image/png, 312496 B, 2560x1560 — front 3/4 from the left, shows chassis depth and rack ears)

PRODUCT: CRS518-16XS-2XQ-RM
    https://cdn.mikrotik.com/web-assets/rb_images/2196_hi_res.png   (image/png, 1052344 B, 2793x802 — dead-on straight front, the cleanest shot in this set; 2x QSFP28 40/100G, 16x SFP28 in eight stacked pairs, console RJ45, MANAGEMENT RJ45, RESET, USB-A, USER/FAULT/PWR2/PWR1 LEDs, full-width chevron vent band)
    https://cdn.mikrotik.com/web-assets/rb_images/2198_hi_res.png   (image/png, 1398665 B, 2924x933 — high 3/4 from the left, for lid contour and side panel)

PRODUCT: CRS309-1G-8S+IN
    https://cdn.mikrotik.com/web-assets/rb_images/1730_hi_res.png   (image/png, 1395349 B, 3840x2407 — front-on; 8x SFP+ with per-port ACT/10G LED pairs, hexagonal honeycomb vent band above the ports, PoE/BOOT RJ45, DB9 console, RESET, USER/PWR LEDs)
    https://cdn.mikrotik.com/web-assets/rb_images/1733_hi_res.png   (image/png, 946922 B, 3840x2407 — same front panel fitted into the 1U rackmount plate, angled left; shows how the half-width unit sits in the ear kit)

PRODUCT: CRS310-1G-5S-4S+IN
    https://cdn.mikrotik.com/web-assets/rb_images/2147_hi_res.png   (image/png, 2629211 B, 2880x1620 — front-on; CONSOLE RJ45, ETH/PoE-in RJ45, RESET, USR/PWR LEDs, 5x SFP 1G then 4x SFP+ 10G, diagonal-hatch vent motif, MikroTik badge with model text)
    https://cdn.mikrotik.com/web-assets/rb_images/2149_hi_res.png   (image/png, 2745345 B, 2880x1620 — front 3/4 from the left, desktop-case body and side profile)

PRODUCT: CCR2216-1G-12XS-2XQ
    https://cdn.mikrotik.com/web-assets/rb_images/2123_hi_res.png   (image/png, 1307705 B, 3000x1600 — front-on with rack ears; 2x QSFP28 100G, 12x SFP28 25G in six stacked pairs, ETH/BOOT + CONSOLE RJ45s, RESET, USER/FAULT/PWR2/PWR1 LEDs, chevron vent band)
    https://cdn.mikrotik.com/web-assets/rb_images/2122_hi_res.png   (image/png, 1999869 B, 3000x1600 — high 3/4 from the left, shows 1U lid, side venting and ear geometry)
    https://cdn.mikrotik.com/web-assets/rb_images/2125_hi_res.png   (image/png, 1752016 B, 1967x802 — front panel straight-on in the lower half with the lid removed above; good for correlating port cages to internal cards)

PRODUCT: CCR2004-1G-12S+2XS
    https://cdn.mikrotik.com/web-assets/rb_images/1937_hi_res.png   (image/png, 1822904 B, 3722x1657 — front-on; 2x SFP28 stacked at far left, 12x SFP+ in a single row with ACT/10G LED pairs, MGMT/BOOT RJ45, CONSOLE, RESET, four status LEDs, "Cloud Core Router" badge, arc-shaped slot vent band)
    https://cdn.mikrotik.com/web-assets/rb_images/1935_hi_res.png   (image/png, 2860090 B, 3804x2191 — front 3/4 from the left, ribbed lid and rear heatsink visible)

PRODUCT: netPower 16P (CRS318-16P-2S+OUT)
    https://cdn.mikrotik.com/web-assets/rb_images/1953_hi_res.png   (image/png, 4530503 B, 3167x3055 — outdoor enclosure with the lid swung open, port panel fully exposed at a moderate angle: DC1 18-30V and DC2 48-57V barrel jacks, 16x RJ45 in two rows as 8+8 blocks under an orange PoE-out band, Power LED, Reset, SFP+1/SFP+2 with ACT/10G LEDs, "netPower 16P / CRS318-16P-2S+OUT" label. Not straight-on — no straight-on port-panel photo exists on MikroTik's CDN)
    https://cdn.mikrotik.com/web-assets/rb_images/1951_hi_res.png   (image/png, 3808130 B, 2621x3646 — closed enclosure, near-front 3/4: finned heatsink cover, MikroTik logo, side latches, sealed lower cable bay)
    https://help.mikrotik.com/docs/download/attachments/28606548/netpower16p.png   (image/png, 147423 B, 600x569 — same lid-open framing from the user manual, tighter crop on the port panel but low resolution)

Notes on method and gaps:
- Correct MikroTik page slugs are irregular; I scraped them from `https://mikrotik.com/products/group/switches`. The pattern `+` → `plus` applies only to some (`crs354_48g_4splus2qplusrm`, `CRS326-24G-2SplusRM`), while others drop it (`crs309_1g_8s_in`).
- The CDN serves five variants per gallery image: `<id>_ts.webp`, `_tm.webp`, `_lg.webp`, `_xl.webp`, `_hi_res.png`. `_hi_res.png` is the original, so that is what I reported throughout.
- Wikimedia Commons has nothing for any of these nine models — only RB260GS board shots — so it contributed nothing.
- Reseller listings (Baltic Networks, wifi-stock) for the netPower 16P reuse MikroTik's own closed-enclosure render at lower resolution; no independent straight-on port photo turned up.
- Two products have no straight-on front render in existence as far as I can find: CRS326-24G-2S+RM (1301 is close, mild perspective) and netPower 16P (angled by necessity, since the ports are behind a hinged lid).


## Juniper

All 26 URLs verified (HTTP 200, image/*, >20 KB). I viewed every primary image to confirm it is the right device and front-facing.

PRODUCT: EX4300-48T
  https://www.networktigers.com/cdn/shop/files/juniper-EX4300-48T-2.jpg   (image/jpeg, 54617) Real photo, dead straight-on front: all 48 RJ-45 in two rows, honeycomb vent strip above, mini-USB CON port, LCD reading "EX4300 / RUNNING JUNOS" with Menu/Enter buttons, ALM/SYS/MST LEDs, blank uplink-module slot at right. Small NetworkTigers watermark across the lower third.
  https://www.networktigers.com/cdn/shop/files/juniper-EX4300-48T.jpg   (image/jpeg, 63856) Same unit, 3/4 front-left angle — good for bezel depth, chassis edge and embossed "juniper networks" top lid. Watermarked.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/ex-series/ex4300/ex4300-48p-front-high.jpg   (image/jpeg, 74758) Juniper studio front-on of the 48-port EX4300 — this is the 48P (PoE) SKU, physically the same 1U chassis, port grid, LCD and uplink slot as the 48T. Clean, no watermark. Use with that caveat.

PRODUCT: EX4400-48MP
  https://www.juniper.net/documentation/us/en/hardware/ex4400/images/g022645.png   (image/png, 213457) Juniper hardware-guide Figure 38 "Front View of an EX4400-48MP Switch" — photoreal render, straight-on: 48 RJ-45 in two rows (4 banks of 12), "juniper driven by Mist AI" logo left, "EX4400 MG PoE++" badge, USB-C console, SYS/ALM/MST/CLD + SPD/DX/EN/POE LED block, mode button, 4-port SFP+ extension module at right.
  https://www.juniper.net/documentation/us/en/hardware/ex4400/images/g022556.png   (image/png, 67353) Figure 40, labelled front-panel line drawing with numbered callouts 1-7 and full port numbering — best reference for exact port pitch, LED block and extension-module cutout.
  Note: no genuine photograph of the -48MP exists in Juniper's image library or on the resellers I checked. The NetworkTigers "EX4400-48MP" listing image is actually an EX4400-48P (badge reads "EX4400 PoE++", not "MG PoE++"), so I discarded it.

PRODUCT: QFX5120-48Y
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/qfx-series/qfx5120-48y/qfx5120-48y-front-high.jpg   (image/jpeg, 529727) Official studio photo, straight-on: 48 SFP28 cages in two rows (4 banks of 12) plus 8 QSFP28 at right, punched vent strips top and bottom, cyan accent at right edge.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/qfx-series/qfx5120-48y/qfx5120-48y-frontwtop-high.jpg   (image/jpeg, 582982) Same shot with the top lid visible — front-on but slightly elevated, gives chassis depth.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/qfx-series/qfx5120-48y/qfx5120-48y-front-low.png   (image/png, 219528) Same front view as PNG with transparent/alpha background — easiest to use as a texture reference.

PRODUCT: QFX5220-32CD
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/qfx-series/qfx5220-32cd/qfx5220-32cd-front-high.jpg   (image/jpeg, 546795) Studio photo, straight-on: MGMT RJ-45 and PPS/10M SMB coax at far left, 32 QSFP56-DD cages in two rows of 16, then 2 SFP+ ports, second mgmt RJ-45, USB and RESET, cyan "QFX5220-32CD" badge bottom right.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/qfx-series/qfx5220-32cd/qfx5220-32cd-frontwtop-high.jpg   (image/jpeg, 589726) Same, top lid visible.
  https://www.juniper.net/documentation/us/en/hardware/qfx5220/images/g051050.png   (image/png, 79050) Labelled port-panel line drawing with callouts 1-11 and port numbering 0-31 — exact geometry reference.

PRODUCT: MX204
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/mx-series/mx204/mx204-front-high.jpg   (image/jpeg, 257593) Studio photo, straight-on 1U with integral rack ears and captive thumbscrews: GM/PTP SFP, 4 QSFP28 (0/0-0/3), 8 SFP+ (1/0-1/7), MGMT, BITS, CON, ToD, USB, PPS/100MHz SMB, LED row, OFFLINE/RESET, "MX204" badge top right.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/mx-series/mx204/mx204-frontwtop-high.jpg   (image/jpeg, 272787) Same with top lid visible.
  https://www.juniper.net/documentation/us/en/hardware/mx204/images/g009860.png   (image/png, 59415) Hardware-guide Figure 1 "Front View of the MX204" — labelled line drawing showing every port label and the rack-ear hole pattern.

PRODUCT: MX240
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/mx-series/mx240/mx240-front-high.jpg   (image/jpeg, 378693) Studio photo, straight-on 5U: top fan-tray honeycomb vent, craft interface (JUNIPER MX240 badge, RE0/RE1 MASTER/ONLINE/OFFLINE, FAN, PEM 0-3, yellow+red alarm lamps, ACO/LT button, two green alarm-relay terminal blocks), then 4 card slots populated with DPC/SCB/RE, dark grey ejector levers on both sides.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/mx-series/mx240/mx240-frontwtop-high.jpg   (image/jpeg, 378573) Same with the chassis top visible — best single shot for overall proportions.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/mx-series/mx240/lbox-mx240-front.jpg   (image/jpeg, 90167) Smaller lightbox version of the front-on shot.

PRODUCT: EX9204
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/ex-series/ex9204/ex9204-front-high.jpg   (image/jpeg, 281723) Studio photo, straight-on 4-slot chassis: top vent grille, craft panel with "juniper EX9204" badge, LED clusters and alarm relay block, then line cards and two RE modules, blue ejector handles left and right of each slot.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/ex-series/ex9204/ex9204-frontwtop-high.jpg   (image/jpeg, 173451) Same with top visible.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/ex-series/ex9204/lbox-ex9204-front.jpg   (image/jpeg, 85017) Lightbox-size front-on version.

PRODUCT: SRX4600
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/srx-series/srx4600/srx4600-front-high.jpg   (image/jpeg, 361476) Studio photo, straight-on 1U with brushed silver bezel: "JUNIPER SRX4600" left, HA 0/0 SFP block + CTL/FAB, 4 QSFP28 (40G/100G 1/0), 8 SFP+ (10G 1/1), USB, MGMT, CON, two blue-latched SSD-1TB carriers, MST/HA/ALM LEDs, ToD, BITS, 10MHz/PPS SMB, RESET/OK-FAIL/ONLINE/OFFLINE.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/srx-series/srx4600/srx4600-frontwtop-high.jpg   (image/jpeg, 407789) Same with top lid visible.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/srx-series/srx4600/lbox-srx4600-front.jpg   (image/jpeg, 65883) Lightbox-size front-on version.

PRODUCT: SRX1500
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/srx-series/srx1500/srx1500-front-high.jpg   (image/jpeg, 335530) Studio photo, straight-on 1U: perforated left panel with "JUNIPER SRX1500", 16 RJ-45 in two rows, 4 SFP 1G + 4 SFP+ 10G, then darker right section with HA CONTROL SFP, USB, console RJ-45 + mini-USB, MGMT, STAT/ALARM/SSD/PWR/HA/RPS LEDs, RESET CONFIG pinhole and round power button.
  https://www.juniper.net/content/dam/www/assets/images/us/en/image-library/srx-series/srx1500/srx1500-frontwtop-high.jpg   (image/jpeg, 334142) Same with top lid visible.
  https://www.juniper.net/documentation/us/en/hardware/srx1500/images/g000860.png   (image/png, 94640) Hardware-guide Figure 1 "SRX1500 Firewall Front Panel" — labelled line drawing, callouts 1-12, shows the two blanked expansion-module bays at top right.

Useful for further digging: Juniper's own product photo library indexes every SKU at https://www.juniper.net/us/en/company/images/image-library-logos-and-product-photos/products.html, and each product page exposes direct `/content/dam/www/assets/images/us/en/image-library/<series>/<model>/<model>-{front,frontwtop,left,right,rear}-high.jpg` paths.


## Dell

All 24 URLs below were verified with the exact command specified — every one returned HTTP 200, an `image/*` content type, and >20000 bytes. I also opened and visually inspected each image to confirm what it shows.

```
PRODUCT: PowerEdge R660 (1U)
  https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/enterprise-systems/poweredge/r660/media-gallery/server-poweredge-r660-black-gallery-2.psd?fmt=png-alpha&wid=1600&qlt=100,1&resMode=sharp2
    (image/png, 389625) Dead-on front elevation, 10x 2.5in SFF chassis. Left control panel with LCD + status icons, hex bezel grille w/ DELL badge, right ear with USB + VGA + iDRAC micro-USB. Best reference of the three.
  https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/enterprise-systems/poweredge/r660/media-gallery/server-poweredge-r660-black-gallery-1.psd?fmt=png-alpha&wid=1600&qlt=100,1&resMode=sharp2
    (image/png, 422030) Same 10x SFF chassis, 3/4 front-left. Good for ear/handle depth and carrier latch profile.
  https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/enterprise-systems/poweredge/r660/media-gallery/server-poweredge-r660-black-gallery-4.psd?fmt=png-alpha&wid=1600&qlt=100,1&resMode=sharp2
    (image/png, 413253) Alternate 16x E3.S EDSFF front config, 3/4 front-left. Different carrier geometry than the SFF build.

PRODUCT: PowerEdge R760 (2U)
  https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/enterprise-systems/poweredge/r760/media-gallery/server-poweredge-r760-black-gallery-2.psd?fmt=png-alpha&wid=1600&qlt=100,1&resMode=sharp2
    (image/png, 783259) Dead-on front, 24x 2.5in in two rows behind the hex bezel. Control panel + LCD left, USB/VGA/iDRAC right. Best reference.
  https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/enterprise-systems/poweredge/r760/media-gallery/server-poweredge-r760-black-gallery-1.psd?fmt=png-alpha&wid=1600&qlt=100,1&resMode=sharp2
    (image/png, 694222) Same config, 3/4 front-left, shows chassis depth and ear thickness.
  https://expresscomputersystems.com/cdn/shop/files/dell-poweredge-r760-front-24SFF_1600x.jpg?v=1698851668
    (image/jpeg, 39617) 24x 2.5in with NO bezel, 3/4 front-right - clean view of bare carrier faces and latch buttons.

PRODUCT: PowerEdge R960 (4U)
  https://expresscomputersystems.com/cdn/shop/files/dell-poweredge-r960-24-top_1600x.jpg?v=1700606978
    (image/jpeg, 67036) Dead-on front, bezel off. Top band = 24x 2.5in in three 8-bay groups; lower two-thirds = three large perforated fan/filler panels. Best reference.
  https://expresscomputersystems.com/cdn/shop/files/dell-poweredge-r960-sff-16_18530995-3dcd-463b-ba82-d34ae3a79aed_1600x.jpg?v=1751482754
    (image/jpeg, 60849) Dell service-manual labelled front-view diagram, "Front view of 16 x 2.5-inch drive system", orthographic straight-on with callout leaders and bay numbering 0-15.
  https://expresscomputersystems.com/cdn/shop/files/dell-poweredge-r960-main_1600x.jpg?v=1751482754
    (image/jpeg, 55261) 3/4 front-left WITH the honeycomb bezel fitted, LCD panel lit. Shows bezel hex pattern and 4U ear proportions.

PRODUCT: PowerEdge R730, 8x 3.5 inch chassis (2U)
  https://savemyserver.com/cdn/shop/files/server-design-lab-dell-poweredge-r730-8-bay-35-drives-945983.png?v=1741212234&width=1445
    (image/png, 214278) Dead-on front photo, 8x 3.5in in 2 rows of 4. Shows 13G control panel (power, VGA, LCD arrows), 2x USB, optical drive bay, LFF carrier latch shape, both rack ears. Best reference.
  https://savemyserver.com/cdn/shop/files/server-design-lab-dell-poweredge-r730-8-bay-35-drives-147783.png?v=1741212234&width=1445
    (image/png, 225076) Same chassis, 3/4 front-right. Good for ear/latch depth and side profile.

PRODUCT: PowerEdge XE9680 (6U)
  https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/enterprise-systems/poweredge/xe9680/media-gallery/server-poweredge-xe9680-black-gallery-2.psd?fmt=png-alpha&wid=1600&qlt=100,1&resMode=sharp2
    (image/png, 1378293) Dead-on front, full 6U face. Upper hex-bezel band over 8x 2.5in NVMe + LCD, lower two-thirds is the front PCIe slot bank (numbered 31-40) and perforated fan wall. Best reference.
  https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/enterprise-systems/poweredge/xe9680/media-gallery/server-poweredge-xe9680-black-gallery-4.psd?fmt=png-alpha&wid=1600&qlt=100,1&resMode=sharp2
    (image/png, 1586413) Same face, 3/4 front-left, bezel removed so the bare drive carriers and slot brackets read clearly. Shows 6U depth.

PRODUCT: PowerEdge MX7000 modular enclosure (7U)
  https://expresscomputersystems.com/cdn/shop/products/MX7000_1600x.jpg?v=1669149289
    (image/jpeg, 200243) Dead-on front, fully populated: 8 vertical sled slots (4 left / 4 right), central column of 4 orange-latched fan modules, DELL EMC + PowerEdge MX7000 badge strip on left bezel, bottom row of 6 PSUs numbered 1-8. Best reference.
  https://expresscomputersystems.com/cdn/shop/products/4654724612181_1.resize-low_1600x.jpg?v=1668206501
    (image/jpeg, 83932) 3/4 front-left of the same enclosure with blank/filler sleds. Good for slot-rail depth and PSU bay geometry.

PRODUCT: PowerVault ME5024 (2U, 24 SFF)
  https://expresscomputersystems.com/cdn/shop/products/ME524-24Bay_1600x.jpg?v=1678387065
    (image/jpeg, 52886) Dead-on front, bezel off. All 24 SFF carriers with silver latch levers, bay numbers 0-23 printed on the chassis lip, ME5024 label on the left ear. Best reference.
  https://expresscomputersystems.com/cdn/shop/products/ME524-main_1600x.jpg?v=1764715080
    (image/jpeg, 52103) Dead-on front WITH the perforated bezel fitted - DELL EMC + PowerVault badges, ops panel and 7-seg enclosure-ID display exposed at far left.
  https://expresscomputersystems.com/cdn/shop/products/ME5024-drive-numbers_1600x.jpg?v=1764715080
    (image/jpeg, 59154) Dell manual line drawing, orthographic front elevation with bay numbering 0-23 and ops-panel icons. Useful for exact bay pitch.

PRODUCT: PowerVault ME4084 (5U, 84 bay top load)
  https://expresscomputersystems.com/cdn/shop/products/ME4084-Main_cf612967-1736-4b1d-b5f1-c5f0e8c16758_1600x.jpg?v=1678229791
    (image/jpeg, 99265) 3/4 front-left of the 5U enclosure, drawers closed. Shows the two stacked perforated drawer faces, DELL EMC + PowerVault badges, the four green LED strips / recessed pull handles, and the narrow ops panel on the left ear. Best front reference; no true dead-on shot found.
  https://expresscomputersystems.com/cdn/shop/products/ME4084-drive-tray_3101b1f0-7d59-42cc-9699-fe53fdabeda8_1600x.jpg?v=1678229791
    (image/jpeg, 88867) Real rack photo, upper drawer pulled out. Confirms drawer-face detail and the top-load drive layout inside.
  https://expresscomputersystems.com/cdn/shop/products/ME4084-dray-numbers_665c5bfa-17f4-44a0-8b45-07b167d970ba_1600x.jpg?v=1678229791
    (image/jpeg, 115929) Top-down drawer bay map, 3 columns x 14 rows, slots 0/42 through 41/83. NOT a front face - included because it pins down the 84-bay drawer geometry.

PRODUCT: PowerSwitch S5248F-ON (1U)
  https://expresscomputersystems.com/cdn/shop/products/S5248F-ON-front_1600x.jpg?v=1676679485
    (image/jpeg, 34997) Dell labelled front-view diagram, perfectly straight-on: Stack ID 7-seg at far left, LED status icon block beneath it, 48x SFP28 in 2 rows of 24 (three groups of 16), then 2x QSFP28-DD, then 4x QSFP28. Best reference.
  https://expresscomputersystems.com/cdn/shop/products/S5248F-ON-diagram_1600x.jpg?v=1676679485
    (image/jpeg, 57063) Dell labelled close-up of the same faceplate - port-cage detail, per-port activity LEDs, and the 5-icon LED cluster (power/system/locator/fan/master), plus the rear fan + serial/USB module.
  https://www.servethehome.com/wp-content/uploads/2022/01/Dell-S5248F-ON-Front-2.jpg
    (image/jpeg, 94423) Real photograph, straight-on front elevation on a bench (top cover removed). Confirms real-world port-cage depth, faceplate bezel edge and the Stack-ID window. Front face itself is fully front-on.
```

One honest gap worth knowing about: Dell's own Installation and Service Manual diagrams live at `https://dl.dell.com/content/guides/public/Html/<manual>_pub/images/GUID-*-low.jpg` (e.g. `per760_ism_pub`, `xe9680_ism_pub`) and are excellent labelled front views at ~600KB each — but Akamai blocks curl's default User-Agent there, so they return **403** under your verification command and I excluded them. They do return `200 image/jpeg` if you add `-A "Mozilla/5.0"`. The R960, ME5024 and S5248F entries above are those same Dell diagrams re-hosted on a CDN that does serve plain curl.

Two sizing knobs: on the `i.dell.com` Scene7 URLs change `wid=1600` to go larger (2000+ works); on the Shopify ones change `_1600x` (the `_1600x` and bare filename return the same source pixels — roughly 1080px square — so those are already at native resolution).


## Cisco

All 13 products covered; every URL below re-verified with the exact curl check (HTTP 200, `image/*`, >20 KB), and I visually opened each image to confirm the model and view.

```
PRODUCT: Catalyst 9300-48P (with C9300-NM-8X)
  https://cdn.shopify.com/s/files/1/0252/2280/7632/files/C9300-48P-E.jpg   (image/jpeg, 186252, real 2580x1600 unwatermarked photo, near front-on; "Catalyst 9300 48 PoE+" badge, 4x12 RJ-45 blocks, rack ears, NM-BLANK in uplink bay)
  https://www.cisco.com/c/dam/en/us/td/i/300001-400000/380001-390000/385001-386000/385446.jpg   (image/jpeg, 30023, Cisco HIG Fig.1 "C9300-48P Switch Front Panel", 3/4 front render WITH an 8-port SFP+ uplink module fitted)
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-C9300-NM-8X_1b52aeac-bea4-4dc5-9395-9a74b2f4851c.jpg   (image/jpeg, 132169, the C9300-NM-8X module alone, faceplate dead-on: 2x4 SFP+ cages, thumbscrew, port numbering)

PRODUCT: Catalyst 9300-24P (with C9300-NM-4G)
  https://cdn.shopify.com/s/files/1/0252/2280/7632/files/Cisco_Catalyst_C9300-24P-A.jpg   (image/jpeg, 143147, real 2580x1600 unwatermarked photo, front-on from slightly above; "Catalyst 9300 24 PoE+" badge, NM-BLANK-T1 in uplink bay)
  https://cdn.shopify.com/s/files/1/0252/2280/7632/files/C9300-NM-4G1.jpg   (image/jpeg, 244307, the C9300-NM-4G module alone, faceplate dead-on: 4 SFP cages, G1-G4 LED strip, two black thumbscrews)
  https://cdn.shopify.com/s/files/1/2388/1557/files/C930024PA_2.webp   (image/jpeg, 25722, 3/4 front of a C9300-24P with a populated uplink network module installed; small in frame)

PRODUCT: Catalyst 9200L-24T-4G
  https://cdn.shopify.com/s/files/1/0252/2280/7632/files/C9200L-24T-4G-E.jpg   (image/jpeg, 193726, best one: real 2580x1600 unwatermarked photo, 3/4 front; "Catalyst 9200L 24 4x1G" badge, 24 RJ-45, 4 SFP, LED/console/2x USB cluster)
  https://cdn.shopify.com/s/files/1/2388/1557/files/c9200l-24t-4g_1_9bc60167-6d12-4955-94f8-0adbaf551db3.png   (image/png, 836465, studio 3/4 front, very sharp panel detail; diagonal reseller watermark over the body)
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-C9200L-24T-4G-A_3e363000-6873-4dda-8f2d-597dc4fa8a0c.jpg   (image/jpeg, 50348, straight front-on photo; watermark sits below the port row)

PRODUCT: Catalyst 9500-48Y4C
  https://www.cisco.com/c/dam/en/us/td/i/300001-400000/350001-360000/356001-357000/356905.jpg   (image/jpeg, 153450, Cisco HIG Fig.3 "Front Panel of a 48-Port C9500 High Performance Switch (C9500-48Y4C)", dead-on plus a zoomed inset of the left LED/RFID/console/USB block)
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-C9500-48Y4C-E.jpg   (image/jpeg, 50029, real photo, 3/4 front; 48 SFP28 in two banks + 4 QSFP28 at right)

PRODUCT: Catalyst 9404R (4-slot, 6RU)
  https://cdn.shopify.com/s/files/1/2388/1557/products/Untitled_b99f7cb5-7a90-42dc-b3bc-f9761feaa6b0.png   (image/png, 433372, Cisco product render, 3/4 front, fully populated: 4 PSUs on top, 4 horizontal slots, 2 supervisors, left-side chassis handle, "C9404R" badge)
  https://www.cisco.com/c/dam/en/us/td/i/300001-400000/350001-360000/355001-356000/355574.jpg   (image/jpeg, 101743, Cisco HIG "Front View of the Catalyst 9404R Switch", callout-numbered 3/4 render, fan tray and ejector levers visible)

PRODUCT: Nexus 9336C-FX2
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-N9K-C9336C-FX2_b5653a4c-b325-458c-a3ad-077662034ae0.jpg   (image/jpeg, 49927, real photo, near front-on port side; 36 QSFP28 in 2 rows of 18, "N9K-C9336C-FX2" label at lower left; watermark below the ports)
  https://cdn.shopify.com/s/files/1/0252/2280/7632/products/Cisco_Nexus_N9K-C9336C-FX2.jpg   (image/jpeg, 20727, clean unwatermarked Cisco product photo, 3/4 port-side front)
  https://www.cisco.com/c/dam/en/us/td/i/500001-600000/500001-510000/501001-502000/501590.jpg   (image/jpeg, 29850, Cisco HIG "Port Side View of the Cisco N9336C-FX2 Switch", isometric line art with callouts)

PRODUCT: ASR 1001-X
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-ASR1001-X-1_2ee941ad-2516-486b-94a1-1800c445d047.jpg   (image/jpeg, 75002, real photo, dead-on front; SPA bay blank, console, GE0-GE5 SFP, TE0/TE1 SFP+, AUX/CON, USB/MGMT, NIM slot, "Cisco ASR1001-X" label)
  https://www.cisco.com/c/dam/en/us/td/i/300001-400000/370001-380000/371001-372000/371075.eps/_jcr_content/renditions/371075.jpg   (image/jpeg, 24497, Cisco HIG Fig.1 "Cisco ASR 1001-X Router Front View", orthographic line art with numbered callouts)

PRODUCT: ISR 4331
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-ISR4331-K9-1_9cd0a2ae-f636-45c3-b2df-e5e820c2adeb.jpg   (image/jpeg, 70193, real photo, 3/4 of the PORT/IO face: GE0/0-0/2, NIM 1, NIM 2, SM-BLANK, "CISCO 4331" side label)
  https://www.cisco.com/c/dam/en/us/td/i/300001-400000/390001-400000/391001-392000/391462.eps/_jcr_content/renditions/391462.jpg   (image/jpeg, 20930, Cisco HIG "Bezel Side Ports and LEDs on Cisco 4331 ISR", perfectly orthographic front elevation)
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-ISR4331-K9.jpg   (image/jpeg, 65205, real photo, 3/4 of the opposite bezel face: vent grille, LED cluster, IEC inlet, power switch)

PRODUCT: ISR 4451-X
  https://cdn.shopify.com/s/files/1/0989/9318/products/cisco-ISR4451-X-SEC-K9_ddbfc840-b74a-41f6-a197-b86679a1ede0.jpg   (image/jpeg, 72982, real photo, perfectly dead-on front bezel: dual PSU modules with fans/IEC inlets, hex vent bank, "Cisco 4400 Series" LED cluster, power switch)
  https://www.cisco.com/c/dam/en/us/td/i/200001-300000/280001-290000/285001-286000/285698.eps/_jcr_content/renditions/285698.jpg   (image/jpeg, 34899, Cisco HIG "Back Panel (I/O Side) Slots and Connectors on Cisco 4451-X ISR" - the port face, orthographic with 23 callouts: 4x RJ-45, 4x SFP, 3 NIM bays, 2 SM bays)
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-ISR4451-X-K9.jpg   (image/jpeg, 106408, real photo, 3/4 front bezel, single PSU fitted; good for the 2RU chassis proportions)

PRODUCT: Firepower 2140
  https://cdn.shopify.com/s/files/1/0989/9318/files/cisco-FPR2140-ASA-K9.jpg   (image/jpeg, 71793, real photo, dead-on front; "FPR-2100 SERIES" badge, GE MGMT + console, 12 RJ-45 in 2 rows, 4 SFP+, FPR2K-SSD200 bay, network module bay with thumbscrews)
  https://www.cisco.com/c/dam/en/us/td/i/400001-500000/440001-450000/448001-449000/448285.jpg   (image/jpeg, 26499, Cisco official product photo "Firepower 2130 and 2140", slight-angle front, clean white background)
  https://www.cisco.com/c/dam/en/us/td/i/400001-500000/410001-420000/415001-416000/415007.jpg   (image/png, 24407, Cisco HIG Fig.10 "Firepower 2130 and 2140 front panel", orthographic with callouts)

PRODUCT: UCS 5108 blade chassis (6RU)
  https://upload.wikimedia.org/wikipedia/commons/5/53/CiscoUCS.JPG   (image/jpeg, 5958788, best one: real 4608x3072 dead-on photo of a rack-mounted UCS 5108, 8 blade bays populated + 4 PSU bays, "UCS 5108" badge, slot numbering, rack-rail context)
  https://cdn.shopify.com/s/files/1/0252/2280/7632/products/Cisco_UCSB-5108-AC2_Blade_Server_Chassis.png   (image/png, 496245, Cisco product render, 3/4 front, fully populated with blades and 4 PSUs)
  https://www.cisco.com/c/dam/en/us/td/i/100001-200000/190001-200000/192001-193000/192744.eps/_jcr_content/renditions/192744.jpg   (image/jpeg, 54490, Cisco "LEDs on a UCS 5108 Server Chassis - Front View", orthographic front with LED callouts)

PRODUCT: UCS C240 rack server (2U, 24 SFF)
  https://cdn.shopify.com/s/files/1/0006/3029/2540/files/f_c67dc207-b6db-449d-a991-02bcc0a50386.jpg   (image/jpeg, 46216, real photo, dead-on front of a C240 M5SX 24-bay SFF; bays empty so the 24-bay backplane/divider geometry, ejector-handle rack ears, left LED cluster and right KVM are all clearly readable)
  https://www.cisco.com/c/dam/en/us/td/i/300001-400000/300001-310000/305001-306000/305989.jpg   (image/jpeg, 63366, Cisco Fig.1 "UCS C240 M5 Server (SFF Drives, 24-Drive) Front Panel", orthographic, all 24 slots numbered plus the operations-panel inset)
  https://cdn.shopify.com/s/files/1/0006/3029/2540/files/f_872c7d0a-6eb8-4a47-9c57-b8b53ec384f6.jpg   (image/jpeg, 114611, real photo, dead-on front of a C240 M5 with drives fitted - 12 LFF config, not 24 SFF, but the best shot of the bezel, handles, badge and LED cluster with carriers installed)

PRODUCT: UCS C220 rack server (1U)
  https://cdn.shopify.com/s/files/1/0998/1660/3987/files/product_17797_img1_5e3e2713f925.jpg   (image/jpeg, 109057, real photo, near dead-on front of a C220 M5SX; 10 SFF bays in 5 columns x 2 rows with carriers fitted, Cisco-logo rack ear left, power/ID buttons + KVM right)
  https://www.cisco.com/c/dam/en/us/td/i/300001-400000/300001-310000/305001-306000/305949.jpg   (image/jpeg, 63180, Cisco Fig.1 "UCS C220 M5 Server (SFF Drives) Front Panel", orthographic, 10 slots numbered plus operations-panel inset)
  https://cdn.shopify.com/s/files/1/0998/1660/3987/files/product_17797_img0_ec60c9843817.jpg   (image/jpeg, 173653, same unit shot wider, front visible; sitting in its packaging so background is busy)
```

Notes worth knowing before you model:

- **ISR 4331 / 4451-X face naming.** Cisco calls the PSU/vent face the "bezel side" and the connector face the "back panel (I/O side)". I gave you both faces for each so you can pick whichever you're treating as rack-front.
- **Uplink modules.** No photo exists of a 9300-48P shipping with an NM-8X or a 9300-24P with an NM-4G fitted, so I supplied dead-on shots of each bare module to composite into the uplink bay. The Cisco 385446 figure does show a 48P with an 8-port SFP+ module installed.
- **C240 24-SFF.** The only real 24-SFF photo I found has empty bays; the 12-LFF shot is included purely for populated-carrier and bezel detail.
- **Wikimedia Commons is essentially empty for this generation of gear.** Its API is also hard rate-limited from this egress IP. The one genuinely valuable Commons hit is the UCS 5108 photo. `Cisco_Nexus_N9K.jpg` on Commons is a **93180YC-EX**, not a 9336C-FX2 — discarded.
- Two watermark warnings: the NetworkTigers images carry a large centre watermark (it generally sits below the port row, so panels stay readable), and the networkdevicesinc 9200L PNG has a faint diagonal watermark across the chassis. The networkoutlet.com images (`C9300-48P-E.jpg`, `Cisco_Catalyst_C9300-24P-A.jpg`, `C9200L-24T-4G-E.jpg`, `C9300-NM-4G1.jpg`) are 2580x1600 and completely clean — those are your best references.


## Ubiquiti, Supermicro, APC and the rest

All 11 products found. Every URL below was fetched with the exact verification command and returned HTTP 200, `image/*`, >20000 bytes. I also visually inspected every image to confirm what it shows and its angle.

```
PRODUCT: Ubiquiti UDM-SE
  https://cdn.ecomm.ui.com/products/1b6fcc08-a6b8-4496-a831-6125a47c412f/c1d1e0e0-4ec6-4760-9bc2-81cdfdf3eaa5.png
    (image/png, 314818) Labeled front + rear elevations, dead straight-on. Calls out touchscreen, HDD bay, PoE/GbE port groups, SFP+. Best single reference.
  https://cdn.ecomm.ui.com/products/1b6fcc08-a6b8-4496-a831-6125a47c412f/1aaaac38-597b-4125-b0de-7a2671580b21.png
    (image/png, 1902372) Clean front-on product render, 3000x3000, very slight downward tilt.
  https://cdn.ecomm.ui.com/products/1b6fcc08-a6b8-4496-a831-6125a47c412f/80b68060-4c80-4ece-8d44-0a86befdb022.png
    (image/png, 45604) Flat front elevation, straight-on, good for port-position measuring.

PRODUCT: Ubiquiti USW-Pro-24-POE
  https://cdn.ecomm.ui.com/products/5b69cdb5-e7ea-44e6-ae16-8714339038fb/2d7dc5a5-3d6e-439e-9f70-286465989b37.png
    (image/png, 304868) Labeled front + rear elevations, straight-on. 16 PoE+ / 8 PoE++ split and 2x 10G SFP+ clearly delineated.
  https://cdn.ecomm.ui.com/products/5b69cdb5-e7ea-44e6-ae16-8714339038fb/b2409008-494c-4840-8e14-8c25eb005eed.png
    (image/png, 87188) Front elevation with rack ears fitted, straight-on.
  https://cdn.ecomm.ui.com/products/5b69cdb5-e7ea-44e6-ae16-8714339038fb/ca459cf0-f563-4958-9443-e30ce3bcdfa5.png
    (image/png, 1364320) Front-on render, 3000x3000, no ears.

PRODUCT: Ubiquiti USW-Pro-48-POE
  https://cdn.ecomm.ui.com/products/6e019f0c-26b5-4fdf-b4e1-994abd9ce6e1/19d0ce87-0b9b-45de-8c35-2bc19666e0a2.png
    (image/png, 327154) Labeled front + rear elevations, straight-on. 40 PoE+ / 8 PoE++ / 4x 10G SFP+.
  https://cdn.ecomm.ui.com/products/6e019f0c-26b5-4fdf-b4e1-994abd9ce6e1/8441cb41-3e78-4310-b447-ea3766b7155e.png
    (image/png, 103827) Front elevation with rack ears, straight-on.
  https://cdn.ecomm.ui.com/products/6e019f0c-26b5-4fdf-b4e1-994abd9ce6e1/7ea09372-3a31-4033-ae90-b05db552edfb.png
    (image/png, 171511) Tight close-up of the front-left: touchscreen, USW Pro badge, port numbering. Slight angle but the best detail shot.

PRODUCT: Ubiquiti USW-Pro-Aggregation
  https://cdn.ecomm.ui.com/products/35879d83-6169-4d6b-abf6-d3b98b1e8367/6e96315d-1967-44f6-91eb-4b39ac34d7d6.png
    (image/png, 312428) Labeled front + rear elevations, straight-on. 28x 10G SFP+ and 4x 25G SFP28; rear shows the 4-fan pattern.
  https://cdn.ecomm.ui.com/products/35879d83-6169-4d6b-abf6-d3b98b1e8367/23985b97-4807-465e-b375-2a5c7a969e63.png
    (image/png, 76656) Front elevation with rack ears, straight-on.
  https://cdn.ecomm.ui.com/products/35879d83-6169-4d6b-abf6-d3b98b1e8367/f6f0c75d-378f-4310-81c1-c38d21150ceb.png
    (image/png, 1016253) Front-on render, 3000x3000.

PRODUCT: Ubiquiti USP-PDU-Pro (2U)
  https://cdn.ecomm.ui.com/products/b178b896-3499-4fa3-8c56-ce2822be933f/9ef9e4a1-4564-4499-8cb5-3cef0aa84344.png
    (image/png, 654785) Labeled front + rear elevations, straight-on. 4x USB-C, 16 resettable outlets on the upper row, 4 lower outlets, touchscreen, breaker, RJ45.
  https://cdn.ecomm.ui.com/products/b178b896-3499-4fa3-8c56-ce2822be933f/ca2f3c51-3e11-4cc5-8161-e2baa295b61a.png
    (image/png, 165688) Front elevation with rack ears, straight-on.
  https://cdn.ecomm.ui.com/products/b178b896-3499-4fa3-8c56-ce2822be933f/6aee982b-e182-42fe-814a-93294d185775.png
    (image/png, 562065) Dimensioned view (442mm x 106mm x 87mm), near-front with slight angle.

PRODUCT: Ubiquiti UPS-2U-Pro
  https://cdn.ecomm.ui.com/products/bd1e065b-9ed7-4753-ac94-b4c0b06bb173/2b46a66e-c438-4f21-8842-b4423d6e58f3.png
    (image/png, 537306) Labeled front + rear elevations, straight-on. Front shows power button, 3.7in touchscreen, removable bezel and vent slots.
  https://cdn.ecomm.ui.com/products/bd1e065b-9ed7-4753-ac94-b4c0b06bb173/b982e9b6-0466-4662-a782-f74089cd316f.png
    (image/png, 3841107) Front-on with bezel fitted, 3000x3000.
  https://cdn.ecomm.ui.com/products/bd1e065b-9ed7-4753-ac94-b4c0b06bb173/8c4e7656-b3f5-42bc-8a1c-0656eb39c890.png
    (image/png, 3814507) Front-on with the bezel REMOVED, exposing battery bay and display module. Useful for the layer under the bezel.

PRODUCT: Ubiquiti UACC-Rack-Panel-Patch-Blank-24
  https://cdn.ecomm.ui.com/products/6ab1a848-c395-4ba6-8295-5caf711dd19e/f328952d-6fb9-4bec-92d7-55c553596e1d.png
    (image/png, 255240) TRUE FRONT, dead straight-on: black face, 24 keystone openings in one row split 12+12, cable management bar below, silver ears.
  https://cdn.ecomm.ui.com/products/6ab1a848-c395-4ba6-8295-5caf711dd19e/3940aa36-e016-48c1-8475-af1a3b3b7dad.png
    (image/png, 441632) Three-quarter front, shows panel depth and ear profile.
  https://cdn.ecomm.ui.com/products/6ab1a848-c395-4ba6-8295-5caf711dd19e/232ced5e-b247-49d6-8447-7ca17e0f9d3b.png
    (image/png, 579204) Three-quarter with cable management bar attached.
  NOTE: .../6cdb5534-72c5-4a3d-8fe3-0ca3181dc7d6.png is the straight-on REAR (grey) of this same panel - do not mistake it for the front.

PRODUCT: Synology RackStation RS1221+ (2U, 8 bay)
  https://www.synology.com/img/products/detail/RS1221plus/heading.png
    (image/png, 246797) Front, 8 bays in 2 rows of 4, Synology badge, status LED column, ear handles. Near straight-on, slight right-side perspective.
  https://www.synology.com/img/products/detail/RS1221plus/heading_mobile.png
    (image/png, 195908) Same framing, cleaner crop.
  https://www.synology.com/api/products/getPhoto?product=RS1221%2B&type=img&sort=1
    (image/webp, 58518) Dead straight-on front, the best angle of the three. Caveat: it is a direct image response but the URL has no file extension, so it may not suit an extension-based downloader.

PRODUCT: APC Smart-UPS SMT1500RM2U (2U)
  https://www.refurbups.com/refurbups-item-images-2021/UPS-APC-SMT1500RM2U_00.JPG
    (image/jpeg, 28622) Three-quarter front: APC badge, bezel vent ribs, LCD with 4 buttons, rack ears. Clearest overall front view.
  https://www.refurbups.com/refurbups-item-images-2021/UPS-APC-SMT1500RM2U_02.jpg
    (image/jpeg, 44409) Dimensioned drawing with a true front elevation (17.0in/432mm wide, 3.5in/89mm high). Best for proportions.
  https://www.refurbups.com/refurbups-item-images-2021/UPS-APC-SMT1500RM2U_09.jpg
    (image/jpeg, 101108) Close-up of the front bezel ribbing and LCD panel.
  NOTE: apc.com and se.com both return 403 to any scraper, so these come from a reseller using APC stock photography.

PRODUCT: HPE ProLiant DL380 Gen10, 8 SFF (2U)
  https://assets.ext.hpe.com/is/image/hpedam/s00003032?wid=2000&fmt=png-alpha#.png
    (image/png, 658765) Official HPE asset. 8 SFF configuration: single row of 8 carriers with green/magenta latches, universal media bay with DVD + 2 SFF at left, vent block centre, power button/LED cluster and iLO service port at right, ProLiant DL380 Gen10 pull-tab. Three-quarter, not straight-on, but the sharpest 8SFF front detail available.
  https://assets.ext.hpe.com/is/image/hpedam/s00006498?wid=2000&fmt=png-alpha#.png
    (image/png, 801529) Official HPE asset, dead straight-on, but with the security bezel fitted so the bays are hidden. Use for chassis outline, ear geometry and bezel shape.
  https://newserverlife.com/upload/resize_cache/iblock/24b/1636_841_100b5ea74d6c4224afe806d40d6ba51ce/DL380_gen10_8sff.jpg
    (image/jpeg, 107643) Near front-on photo of a real 8SFF unit. Carries small "NSL" reseller watermarks on the drive carriers.
  NOTE: the #.png / #.jpg suffix is a fragment; the server ignores it, so these are safe if your downloader keys on the extension. Also beware: hpedam s00009709 is the 8 LFF front and s00002872 is the 24 SFF front - neither is your chassis.

PRODUCT: Generic 24 port keystone patch panel, 1U (StarTech)
  https://media.startech.com/cms/products/gallery_large/c6panelstp241u.k.jpg
    (image/jpeg, 176088) StarTech C6PANELSTP241U, 1U 24-port blank keystone panel. Labeled FRONT and BACK, both dead straight-on elevations. Best match for the brief.
  https://media.startech.com/cms/products/gallery_large/c6panelutp241uft.k.jpg
    (image/jpeg, 230408) StarTech C6PANELUTP241UFT, 1U 24-port feed-through panel with RJ45 couplers fitted. Straight-on FRONT and BACK - use if you want the panel populated rather than blank.
  https://media.startech.com/cms/products/gallery_large/c6panelutp241ucm.main.jpg
    (image/jpeg, 82102) Three-quarter product shot of the 1U blank keystone panel with cable management bar.
  NOTE: blankpatch24.main.jpg on the same CDN is a superb dead straight-on front, but that SKU is 2U, not 1U.
```

Two things worth flagging: Ubiquiti's own product pages carry front+rear labeled elevation diagrams for all six powered devices, which are considerably better modeling references than the marketing renders, so I led with those. And the Ubiquiti patch panel page mixes five different products' images under separate CDN UUIDs — the panel itself is UUID `6ab1a848-c395-4ba6-8295-5caf711dd19e`; the other four are keystone jacks.
