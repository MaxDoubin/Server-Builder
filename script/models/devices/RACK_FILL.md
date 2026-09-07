# What fills the racks instead of blanking panels

Five racks carried 45U of blanking panel between them: 8U of Cisco, 13U of
Juniper, 7U of MikroTik, 6U of Dell and 11U of storage. A blanking panel is
a real thing that goes in a real rack, but 45U of it is not a rack anybody
built, it is a rack somebody ran out of ideas for.

So this is the replacement, and the constraint that shaped it was not "find
something 8U tall". Each rack was read for what it was missing, and the
gaps turned out to be glaring once looked for. The Cisco rack had a UCS
5108 blade chassis and no fabric interconnects, which is a blade chassis
that cannot be switched on. The Dell rack had eight servers and an MX7000
and no out of band management switch. The storage rack had a tape library
and nothing driving it. Filling those is what makes a rack read as
somebody's rack rather than a shelf of hardware.

Every rack unit figure here comes from the vendor stating the number,
usually in words, not from dividing a millimetre height by 44.45. Two of
them contradict what you would assume: the Catalyst 9800-40 is 1RU, not
2RU, and the MX304 is 2U, not 1U.

One item is flagged rather than trusted. The MikroTik RB4011iGS+RM has a
30mm chassis and ships with ears that MikroTik rate for a 1U rack space, so
it occupies a unit without filling it. Every other MikroTik entry is a true
44mm box.

Photograph URLs below were verified the same way as those in
`PHOTO_SOURCES.md`, and the same caveats apply: three entries are reseller
hosted because the vendor publishes no front photo, and the two Juniper
chassis are hardware guide line drawings because no photographic front view
of them exists any more.

All research and image verification is complete. Here are the results.

---

# RACK A, Cisco enterprise campus rack (8U)

### 1. Cisco Catalyst 9800-40 Wireless Controller, **1 RU**
- **RU source:** Cisco hardware installation guide, Overview: the controller *"occupies one rack unit space."* https://www.cisco.com/c/en/us/td/docs/wireless/controller/9800/9800-40/installation-guide/b-wlc-ig-9800-40/overview.html
- **Why it belongs:** The rack has Catalyst access switches but no wireless control plane; the 9800-40 terminates up to 2,000 APs / 32,000 clients for the campus.
- **Front panel:** Left end carries the "Cisco Catalyst 9800 Series Wireless Controller" silkscreen with the "Model 9800-40" label and seven status LEDs (PWR, SYS, ALM, HA, EN, LINK, SSD). Then an RJ-45 console port, a mini-USB console port, two USB 3.0 Type-A ports, and two yellow-bordered RJ-45 gigabit ports, SP (service/management) and RP (redundancy). At the right, four 10 GE SFP+ cages (TE0–TE3) in a 2×2 block, each with an amber/green port LED, and the Cisco logo. Hex-perforated ventilation across the faceplate; silver-grey 1U chassis with rack ears.
- **Images (verified):**
  - `https://www.cisco.com/c/dam/en/us/products/collateral/wireless/catalyst-9800-series-wireless-controllers/nb-06-cat9800-wirel-cont-data-sheet-ctp-en.docx/_jcr_content/renditions/nb-06-cat9800-wirel-cont-data-sheet-ctp-en_2.png` (200, image/jpeg, 22,208 B), straight-on front
  - `https://www.cisco.com/c/dam/en/us/products/collateral/wireless/catalyst-9800-series-wireless-controllers/nb-06-cat9800-wirel-cont-data-sheet-ctp-en.docx/_jcr_content/renditions/nb-06-cat9800-wirel-cont-data-sheet-ctp-en_1.png` (200, image/png, 131,901 B), angled front
  - `https://www.cisco.com/c/dam/en/us/td/i/300001-400000/350001-360000/355001-356000/355452.jpg` (200, image/jpeg, 43,364 B), labelled front-panel callout

### 2. Cisco Secure Firewall 3120, **1 RU**
- **RU source:** Cisco Secure Firewall 3100 Series data sheet, *"1RU"*, 1.75 × 17 × 20 in., https://www.cisco.com/c/en/us/products/collateral/security/firewalls/secure-firewall-3100-series-ds.html
- **Why it belongs:** The Firepower 2140 is the previous generation; the 3120 is the current-gen second firewall for an HA pair or a separate DMZ/internal enforcement point.
- **Front panel:** White label block at the far left reads "Cisco Secure Firewall 3100 Series" with icon LEDs, M (management), alarm bell, S (system), power, plus SSD1, SSD2 and a status check. Next to it a management RJ-45 and a USB 3.0 Type-A (5 V 900 mA), an RJ-45 console with light-blue trim, then 8 × 10M/100M/1000BASE-T RJ-45 ports, then 8 × SFP/SFP+ cages (1/10 G). The right third is a removable network module bay (8 × 1/10 G option), taking the box to 24 Ethernet ports max. One 900 GB SSD fitted with a second spare slot. Hex-perforated faceplate, silver-grey.
- **Image (verified):** `https://www.cisco.com/c/dam/en/us/products/collateral/security/firewalls/secure-firewall-3100-series-ds.docx/_jcr_content/renditions/secure-firewall-3100-series-ds_0.png` (200, image/png, 4,073,931 B), front. *Caveat: badged "3100 Series", not "3120"; all 3100 models share this chassis.*

### 3 & 4. Cisco UCS 6536 Fabric Interconnect × 2, **1 RU each (2 RU total)**
- **RU source:** Cisco UCS 6536 data sheet, *"1RU"*, 1.72 × 17.3 × 24.7 in. Same sheet states it provides connectivity for the *"UCSB-5108 blade server chassis."*, https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs6536-fabric-interconnect-ds.html
- **Why it belongs:** The rack has a UCS 5108 blade chassis with no fabric interconnects. The chassis has a passive midplane and no embedded switch, so it needs either a pair of external FIs or a 6324 fitted in its own I/O bays, and it has neither. This is the single most conspicuous omission in the rack. *(Corrected: the first version of this line said a 5108 cannot run without a pair of FIs, which overlooks the 6324 in-chassis option.)*
- **Front panel (port side):** 36 QSFP28 cages in two staggered rows, numbered 1–36. Ports 1–32 are 40/100 GbE; ports 33–36 are unified and break out to sixteen 8/16/32 G Fibre Channel. All 36 support 4×10/25 G breakout (144 connections max). Left end: Cisco logo, model label, L1 and L2 cluster RJ-45s, a 10/100/1000 management RJ-45, an RS-232 console, one USB port, and system/beacon LEDs. Dark charcoal 1U chassis, ventilation slot along the top edge.
- **Image (verified):** `https://www.cisco.com/c/dam/en/us/products/collateral/servers-unified-computing/ucs6536-fabric-interconnect-ds.docx/_jcr_content/renditions/ucs6536-fabric-interconnect-ds_1.png` (200, image/png, 237,044 B), front/port side

### 5. Cisco Catalyst 8300-1N1S-4T2X, **1 RU** (terminal/console server with NIM-16A)
- **RU source:** Cisco Catalyst 8300 Series data sheet, *"1RU platform with 1 SM slot and 1 NIM slot plus 2 x 10Gbps and 4 x 1Gbps embedded Layer3 Ethernet ports."*, https://www.cisco.com/c/en/us/products/collateral/routers/catalyst-8300-series-edge-platforms/datasheet-c78-744088.html
- **Why it belongs:** Fitted with a NIM-16A (16-port async serial), it becomes the out-of-band console server for every switch, firewall and PDU in the rack, the classic Cisco terminal-server role. NIM-16A/NIM-24A module reference: https://www.cisco.com/c/en/us/products/collateral/routers/4000-series-integrated-services-routers-isr/datasheet-c78-739968.html *(caveat: the Catalyst 8300 datasheet itself does not enumerate NIM-16A compatibility; Cisco's async-NIM documentation and ordering guides do.)*
- **Front panel:** Far left: Cisco logo, "C8300-1N1S-4T2X" silkscreen, a USB-C "Catalyst Edge" console, a USB 3.0 Type-A, and three small status icons. Then a management RJ-45 with pale-blue trim, then a 2×2 block of yellow-bordered 1 G copper ports (4 × 1 GE) and 2 × 10 GE SFP+ cages, also yellow-bordered. The right half is the NIM bay and the SM bay, each with captive blue thumbscrews and shipped blanked. Round/hex perforations across the faceplate; half-depth silver chassis.
- **Image (verified):** `https://www.cisco.com/c/dam/en/us/products/collateral/routers/catalyst-8300-series-edge-platforms/datasheet-c78-744088.docx/_jcr_content/renditions/datasheet-c78-744088_3.png` (200, image/png, 227,511 B), front, model label legible as C8300-1N1S-4T2X

### 6. Cisco UCS C225 M8 Rack Server, **1 RU**
- **RU source:** Cisco UCS C225 M8 data sheet, *"1RU rack server"*, https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c225-m8-rack-server-ds.html
- **Why it belongs:** Adds single-socket AMD EPYC compute (up to 160 cores, 12 DDR5 DIMMs) alongside the existing Intel C220/C240s.
- **Front panel:** Ten 2.5-inch SFF hot-plug bays across the width behind two hinged perforated mesh panels (C225 M8S: SAS/SATA with up to 4 direct-attach NVMe; C225 M8N: 10 × NVMe PCIe Gen4). Cisco logo centred on the mesh; left ear carries the power button, system/health and unit-ID LEDs and the KVM connector; right ear carries the model badge. Silver/grey chassis with ear-mounted rack handles.
- **Image (verified):** `https://www.cisco.com/c/dam/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c225-m8-rack-server-ds.docx/_jcr_content/renditions/ucs-c225-m8-rack-server-ds_0.png` (200, image/png, 564,666 B)

### 7. Cisco UCS C245 M8 Rack Server, **2 RU**
- **RU source:** Cisco UCS C245 M8 data sheet, *"two rack unit (2RU) rack server"*, https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c245-m8-rack-server-ds.html
- **Why it belongs:** Dual-socket AMD EPYC 2U with up to 28 drives and 8 PCIe slots, the storage/GPU-capable workhorse the rack lacks.
- **Front panel:** Cisco shows two variants, an SFF configuration with up to 24 front 2.5-inch SAS/SATA/NVMe bays behind a perforated hex mesh with the Cisco logo centred, and a version with 24 exposed 2.5-inch drive carriers, each with amber/green activity LEDs and capacity labelling. Left ear: power button, health/unit-ID LEDs, KVM connector. Right ear: "UCS C245 M8" badge. 2U silver chassis, ear-mounted handles.
- **Image (verified):** `https://www.cisco.com/c/dam/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c245-m8-rack-server-ds.docx/_jcr_content/renditions/ucs-c245-m8-rack-server-ds_0.png` (200, image/png, 7,419,065 B)

**Rack A arithmetic:** 1 (9800-40) + 1 (SFW 3120) + 1 (6536) + 1 (6536) + 1 (C8300-1N1S-4T2X) + 1 (C225 M8) + 2 (C245 M8) = **8 U** ✓

---

# RACK B, Juniper service provider rack (13U)

### 1. Juniper MX480 Universal Routing Platform, **8 U**
- **RU source:** Juniper MX480 Site Guidelines, *"The chassis height of 14.0 in. (35.6 cm) is approximately 8 U."*, https://www.juniper.net/documentation/us/en/hardware/mx480/topics/topic-map/mx480-site-guidelines.html
- **Why it belongs:** The rack tops out at the 5U MX240; the MX480 is the larger edge/aggregation chassis (6 line-card slots vs. the MX240's 2) that a real SP rack builds around.
- **Front panel:** Craft interface panel across the top with the Juniper logo, a red circular *critical* alarm LED and a yellow triangular *warning* LED, an ACO/LT (alarm cutoff / lamp test) button, alarm relay contacts, and status LEDs for host subsystem, power supplies, fans and every card slot. Below it six horizontal line-card slots labelled DPC0–DPC5 (MPC/DPC/FPC), each with ejector levers and per-port LEDs, then two SCB slots (SCB0/SCB1) and two Routing Engines (RE0/RE1) with console, auxiliary and management ports plus offline buttons. Front-mounting flanges each side, ESD point top-left, and a full-height air-intake grille on the right side of the chassis.
- **Image (verified):** `https://www.juniper.net/documentation/us/en/hardware/mx480/images/g004200.png` (200, image/png, 300,070 B), labelled front view. *Caveat: Juniper line drawing, not a photograph.*

### 2. Juniper MX304 Universal Routing Platform, **2 U**
- **RU source:** Juniper MX304 Chassis, *"The MX304 is a compact 2 U router,"* chassis 3.5 in. (8.89 cm) high, https://www.juniper.net/documentation/us/en/hardware/mx304/topics/topic-map/mx304-chassis.html
- **Why it belongs:** Dense 400G metro-aggregation router, the modern step between the MX204 and MX240 that the rack skips over.
- **Front panel:** Entirely front-serviced. Two Routing Engine modules (JNP304-RE) side by side, each with ON/FAIL, ALARM and OFFLINE LEDs, an RJ-45 CONSOLE port, a RESET button, an RJ-45 MGMT port, a USB port, and DISK0/DISK1/ACTIVE LEDs. Beneath them the LMIC line modules, LMIC0, LMIC1, and LMIC2 occupying the second RE bay if fitted, each presenting two rows of QSFP cages configurable as 4 × 400 GbE QSFP56-DD or 16 × 100 GbE, with per-port LEDs. Pale-blue captive thumbscrew handles on every module, front-mounting flanges with ESD point, "juniper MX304" badge at the right.
- **Images (verified):**
  - `https://www.juniper.net/documentation/us/en/hardware/mx304/images/g101376.png` (200, image/png, 565,242 B), "Front View of the MX304 Router (Two Routing Engines Installed)"
  - `https://www.juniper.net/documentation/us/en/hardware/mx304/images/g101366.png` (200, image/png, 106,490 B), front-view component callout

### 3. Juniper QFX10002-60C, **2 U**
- **RU source:** Juniper QFX10002 System Overview, *"2 U fixed configuration"*; the -60C offers *"60 QSFP28 ports"*, https://www.juniper.net/documentation/us/en/hardware/qfx10002/topics/topic-map/qfx10002-system-overview.html
- **Why it belongs:** 12 Tbps / 4 Bpps deep-buffer spine, a class above the QFX5120/5220 leaves already installed.
- **Front panel (port panel):** 60 QSFP28 cages in two horizontal rows spanning most of the faceplate, each independently configurable as 100 G, 40 G or 4 × 10 G, with per-port link/activity LEDs. At the right end of the port panel: RJ-45 console, RJ-45 out-of-band management, USB, and system/alarm status LEDs, with the Juniper logo. Rack-mount flange and ESD point at the left. Four 1600 W AC or DC PSUs and three dual counter-rotating fan modules at the rear.
- **Image (verified):** `https://www.juniper.net/documentation/us/en/hardware/qfx10002/images/g050767.png` (200, image/png, 164,858 B), Juniper's "Figure 3: QFX10002-60C Port Panel". *Caveat: line drawing.*

### 4. Juniper PTX10001-36MR Packet Transport Router, **1 U**
- **RU source:** Juniper PTX10001-36MR System Overview, *"ultra-compact 1-U form factor"*, https://www.juniper.net/documentation/us/en/hardware/ptx10001/topics/topic-map/ptx10001-36mr-system-overview.html
- **Why it belongs:** Compact 400G transport/peering router, the MPLS/segment-routing transport tier the rack has no representative of.
- **Front panel (port panel):** 24 × QSFP56-DD cages (10/25/40/100/400 G) and 12 × QSFP28 cages (10/25/40/100 G) in two rows across the faceplate, grouped in blocks with per-port LEDs. At the right end: RJ-45 10/100/1000 management port, RJ-45 console + time-of-day (ToD) port, USB 2.0 port, system status/alarm LEDs, and the offline and reset buttons; 10 MHz and 1 PPS clock connectors for timing. ESD point at the left. Silver 1U chassis; the rear carries six orange-handled fan modules and two power supplies.
- **Images (verified):**
  - `https://www.juniper.net/documentation/us/en/hardware/ptx10001/images/g100790.png` (200, image/png, 332,679 B), front/port panel
  - `https://www.juniper.net/documentation/us/en/hardware/ptx10001/images/g100956.png` (200, image/png, 103,338 B), front-panel callout

**Rack B arithmetic:** 8 (MX480) + 2 (MX304) + 2 (QFX10002-60C) + 1 (PTX10001-36MR) = **13 U** ✓

---

# RACK C, MikroTik ISP rack (7U), seven 1U rackmount products

All seven confirmed at 44 mm chassis height (= 1U) except where noted. All images verified from MikroTik's own CDN.

### 1. CCR2116-12G-4S+, **1 U**
- **RU source:** MikroTik product page, Dimensions *443 × 199 × 44 mm*, *"1U rackmount"*, https://mikrotik.com/product/ccr2116_12g_4splus
- **Why:** MikroTik's highest-throughput 16-core ARM router below the CCR2216, the natural BGP edge/second core router.
- **Front:** Four SFP+ cages in a 2×2 block at the far left, then 12 Gigabit RJ-45 ports in a single row (1–12) under chevron vent strips, then CONSOLE RJ-45, USB Type-A, microSD slot and RESET button. Four stacked LEDs at the right (USER, FAULT, PWR2, PWR1); MikroTik logo and "CCR2116-12G-4S+" silkscreen at the far right. White 1U case with rack ears; dual redundant hot-swap PSUs at the rear.
- **Images:** `https://cdn.mikrotik.com/web-assets/rb_images/2625_hi_res.png` (200, image/png, 1,282,519 B); `https://cdn.mikrotik.com/web-assets/rb_images/2629_hi_res.png` (200, image/png, 2,179,690 B)

### 2. CCR2004-16G-2S+, **1 U**
- **RU source:** MikroTik product page, Dimensions *443 × 210 × 44 mm*, *"classic white 1U rackmount case"*, https://mikrotik.com/product/ccr2004_16g_2splus
- **Why:** 16 copper + 2 × SFP+ router with dual redundant PSUs, the customer-aggregation / CPE-handoff router.
- **Front:** Two SFP+ cages at the far left (SFP+1, SFP+2), then 16 Gigabit RJ-45 ports in two rows of eight split into two blocks, then CONSOLE RJ-45, RESET and USB Type-A. Four stacked LEDs (USER, FAULT, PWR2, PWR1) and the MikroTik logo with "CCR2004-16G-2S+" at the right. Chevron vent strips above the port rows.
- **Image:** `https://cdn.mikrotik.com/web-assets/rb_images/2563_hi_res.png` (200, image/png, 1,517,299 B)

### 3. CRS317-1G-16S+RM, **1 U**
- **RU source:** MikroTik product page, Dimensions *443 × 224 × 44 mm*, https://mikrotik.com/product/crs317_1g_16s_rm
- **Why:** 16-port pure-SFP+ 10 G fibre aggregation switch, distinct from the SFP28/QSFP boxes already racked.
- **Front:** 16 SFP+ cages in four groups of four (two rows of two per group), each group under a vent grille; then one Gigabit RJ-45 (boot/management) and an RJ-45 serial console. Four LEDs at the right (USR, FAULT, PWR2, PWR1). "Cloud Router Switch / CRS 317-1G-16S+" printed on the right of the faceplate with the MikroTik logo below. White 1U case, rack ears both ends.
- **Image:** `https://cdn.mikrotik.com/web-assets/rb_images/1324_hi_res.png` (200, image/png, 883,372 B)

### 4. CRS326-24S+2Q+RM, **1 U**
- **RU source:** MikroTik product page, Dimensions *443 × 200 × 44 mm*, 1U rackmount, https://mikrotik.com/product/crs326_24s_2q_rm
- **Why:** 24 × 10 G SFP+ plus 2 × 40 G QSFP+ uplinks, the high-density fibre distribution switch.
- **Front:** 24 SFP+ cages in two rows of 12, grouped in blocks of four and numbered 1–24; then two QSFP+ 40 G cages stacked; then a 10/100 management RJ-45, an RJ-45 console, a USB Type-A, a mode/reset button, and four LEDs (USER, FAULT, PWR2, PWR1). "Cloud Router Switch / CRS326-24S+2Q+RM" and the MikroTik logo at the right. White 1U case with ear handles.
- **Image:** `https://cdn.mikrotik.com/web-assets/rb_images/1831_hi_res.png` (200, image/png, 1,363,115 B)

### 5. CRS312-4C+8XG-RM, **1 U**
- **RU source:** MikroTik product page, Dimensions *443 × 183 × 44 mm*, *"a 1U rackmount case – fits all the standard racks"*, https://mikrotik.com/product/crs312_4c_8xg_rm
- **Why:** The only 10 GBASE-T copper switch in the lineup, needed for 10 G copper server/CPE handoffs the all-fibre switches can't serve.
- **Front:** Eight 10 G RJ-45 (10GBASE-T) ports in a row with blue port-group underlining, plus four combo 10 G Ethernet/SFP+ ports whose SFP+ cages sit in a 2×2 block to their right; then a 10/100 management RJ-45, an RJ-45 console and a USB Type-A. Four status LEDs at the right; "Cloud Router Switch / CRS312-4C+8XG" and the MikroTik logo. Chevron vents above the copper ports.
- **Image:** `https://cdn.mikrotik.com/web-assets/rb_images/1825_hi_res.png` (200, image/png, 1,282,074 B)

### 6. CRS328-24P-4S+RM, **1 U**
- **RU source:** MikroTik product page, Dimensions *443 × 300 × 44 mm*, 1U rackmount case, https://mikrotik.com/product/crs328_24p_4s_rm
- **Why:** 24-port 802.3af/at PoE-out switch with a 500 W internal supply (≈450 W PoE budget, 3 × 150 W per 8-port group), powers APs, cameras and CPE from the ISP rack.
- **Front:** 24 Gigabit RJ-45 PoE-out ports in two rows of 12, split into three blocks of eight, each port with green/amber LEDs; then four SFP+ cages in a 2×2 block; then an RJ-45 serial console (green), a MODE button and a reset/boot button. "Cloud Router Switch / CRS328-24P-4S+RM" and the MikroTik logo at the right. White 1U case with rack ears.
- **Images:** `https://cdn.mikrotik.com/web-assets/rb_images/1493_hi_res.png` (200, image/png, 494,929 B); `https://cdn.mikrotik.com/web-assets/rb_images/1494_hi_res.png` (200, image/png, 312,496 B)

### 7. RB4011iGS+RM, **1 U of rack space**
- **RU source:** MikroTik product page, *"RB4011iGS+RM (Ethernet model) includes two rackmount ears that will securely fasten the unit in a standard 1U rack space."* Chassis itself is 228 × 120 × 30 mm., https://mikrotik.com/product/rb4011igs_rm
- **⚠ Flag:** This is the one item whose chassis is shorter than 44 mm. MikroTik explicitly rates it for a **1U rack space**, so it consumes 1U, but it does not fill the opening the way the other six do. If you want a strict 44 mm box instead, swap in another 1U RM model.
- **Why:** Compact 10 × Gigabit + SFP+ router, the out-of-band/management or small-POP router.
- **Front:** Black brushed-aluminium face. Far left: a recessed RESET button with PWR and SFP+ LEDs. Then one SFP+ cage, then 10 Gigabit RJ-45 ports in two groups of five (1–5 and 6–10) with a 2×5 grid of green port LEDs between the groups; port 1 is labelled PoE-in (to 57 V) and port 10 PoE-out. Large embossed MikroTik wordmark on the top cover with finned heatsink ridges.
- **Image:** `https://cdn.mikrotik.com/web-assets/rb_images/1633_hi_res.png` (200, image/png, 903,464 B)

**Rack C arithmetic:** 1 + 1 + 1 + 1 + 1 + 1 + 1 = **7 U** ✓

---

# RACK D, Dell compute rack (6U)

### 1. Dell PowerSwitch N3248TE-ON, **1 U**
- **RU source:** Dell PowerSwitch N3248TE-ON spec sheet, 1U, *H 1.71" (43.44 mm) × W 17.09" × D 15.75"*, https://www.delltechnologies.com/asset/en-us/products/networking/technical-support/dell-powerswitch-n3248te-on-spec-sheet.pdf
- **Why it belongs:** The rack has two S5248F-ON data-plane leaves but nothing for out-of-band. Eight servers plus an MX7000 all need iDRAC/OME management ports, this is the 1 GbE management switch.
- **Front panel:** 48 × 10/100/1000BASE-T RJ-45 in two rows of 24, split into blocks of 12, each with link/activity LEDs. To their right, 4 × 10 G SFP+ cages and 2 × 100 G QSFP28 stacking cages. Far right: an RJ-45 console with RS-232 signalling, a USB Type-A (config from flash), a USB Type-B console, and a 10/100/1000BASE-T out-of-band management RJ-45. Left ear carries the "DELL EMC N3248TE-ON" badge and system/stack status LEDs. Dark grey 1U chassis; single 550 W AC PSU.
- **Images (verified):** `https://www.networktigers.com/cdn/shop/products/dell-N3248TE-ON_97bd9599-34ff-4c20-95b1-159ccf8be1d6.jpg` (200, image/jpeg, 58,465 B); `https://www.networktigers.com/cdn/shop/files/dell-N3248TE-ON-2.jpg` (200, image/jpeg, 61,898 B). *Caveat: reseller-hosted and watermarked, Dell's own CDN carries no front photo for this SKU.*

### 2. Dell PowerEdge R6615, **1 U**
- **RU source:** Dell PowerEdge R6615 spec sheet, 1U; H 1.7" (42.8 mm) × W 18.97" (482 mm) × D 32.39" with bezel, https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r6615-spec-sheet.pdf
- **Why it belongs:** Single-socket AMD EPYC 1U, the AMD counterpart to the Intel R660s already racked.
- **Front panel:** Up to 10 × 2.5-inch hot-plug NVMe/SAS/SATA bays across the width (also offered as 8 × 2.5" or 4 × 3.5"). Left rack ear: power button, system health/ID LED strip and iDRAC Direct micro-USB. Right ear: USB 3.0, VGA and the pull-out Express Service Tag. Optional plain Dell bezel or LCD bezel clipping over the drive bays.
- **Images (verified):** `https://i.dell.com/is/image/DellContent/content/dam/images/products/servers/poweredge/r6615/dell-per6615-10x2-5-no-bezel-ff-td.psd?fmt=png-alpha&wid=2000` (200, image/png, 532,223 B), straight front, no bezel; `https://i.dell.com/is/image/DellContent/content/dam/images/products/servers/poweredge/r6615/dell-per6615-10x2-5-dell-bezel-lf.psd?fmt=png-alpha&wid=2000` (200, image/png, 634,407 B), front with Dell bezel

### 3. Dell PowerEdge R7615, **2 U**
- **RU source:** Dell product page, *"2U rack server"*; bezel options listed as "PowerEdge 2U Standard Bezel" / "PowerEdge 2U LCD Bezel", https://www.dell.com/en-us/shop/dell-poweredge-servers/poweredge-r7615-rack-server/spd/poweredge-r7615/pe_r7615_tm_vi_vp_sb (spec sheet: https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r7615-spec-sheet.pdf)
- **Why it belongs:** Single-socket AMD 2U with heavy PCIe Gen5 and drive capacity, the AMD analogue of the R760s.
- **Front panel:** Configurable to 8 × 2.5", 16 × 2.5", 24 × 2.5", 8 × 3.5" or 12 × 3.5" hot-plug bays. Pictured configuration is 24 × 2.5-inch behind a Dell-branded hexagon-pattern LCD bezel, with the LCD status panel right of centre and the DELL wordmark centred. Left ear: power button and health/ID LEDs. Right ear: USB, VGA and the service-tag tab.
- **Images (verified):** `https://i.dell.com/assetlink/img/global/dell-per7615-24x2-5-lcd-bezel-ff-td-dl17166-large.png` (200, image/png, 1,830,416 B), straight front; `https://i.dell.com/assetlink/img/global/dell-per7615-24x2-5-lcd-bezel-lf-dl17144-large.png` (200, image/png, 2,028,086 B), angled front

### 4. Dell PowerEdge R7625, **2 U**
- **RU source:** Dell PowerEdge R7625 spec sheet, 2U dual-socket; *H 86.8 mm × W 482 mm × D 772.13 mm* with bezel, https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r7625-spec-sheet.pdf
- **Why it belongs:** Dual-socket AMD EPYC 2U, up to 24 × 2.5" drives and 8 PCIe Gen5 slots, the top-end AMD compute node completing the rack's CPU mix.
- **Front panel:** Pictured with 12 × 3.5-inch hot-plug SAS/SATA carriers in three rows of four (24 × 2.5-inch also offered), each carrier with orange release latch and green/amber LEDs. Left ear: power button and status LED strip with iDRAC Direct. Right ear: USB 3.0, VGA and pull-out service tag. Optional standard/LCD/filtered bezel.
- **Images (verified):** `https://i.dell.com/is/image/DellContent/content/dam/images/products/servers/poweredge/r7625/dell-per7625-e3-12x-3-5-sas-sata-ff.psd?fmt=png-alpha&wid=2000` (200, image/png, 966,393 B); `https://i.dell.com/is/image/DellContent/content/dam/images/products/servers/poweredge/r7625/dell-per7625-e3-12x-3-5-sas-sata-rf.psd?fmt=png-alpha&wid=2000` (200, image/png, 1,102,168 B)

**Rack D arithmetic:** 1 (N3248TE-ON) + 1 (R6615) + 2 (R7615) + 2 (R7625) = **6 U** ✓

---

# RACK E, Dense storage rack (11U)

### 1. Dell PowerVault ME484, **5 U**
- **RU source:** Dell PowerVault ME484 JBOD spec sheet, *"Rack size 5U"*; H 22.23 cm × W 48.30 cm × D 97.47 cm; 84 internal drive bays; dual IOMs, https://i.dell.com/sites/csdocuments/product_docs/en/powervault-me484-jbod-spec-sheet.pdf
- **Why it belongs:** The rack's ME4084s are heads/arrays; the ME484 is the pure 84-bay SAS expansion JBOD that hangs off them (up to 3 per ME4084 array, 336 drives across 4 enclosures).
- **Front panel:** The 5U84 chassis presents two full-width, top-loading drive drawers, 84 × 3.5-inch bays total (42 per drawer; 2.5-inch carriers supported), each drawer with a latch handle at each end and drawer status LEDs. The left front ear carries the Ops panel, system power, module fault, logical status and per-drawer fault LEDs. Dual 12 Gb SAS I/O modules and PSUs at the rear. Front-panel detail reference: https://www.dell.com/support/manuals/en-us/powervault-me4084/me4_series_om_pub/5u84-enclosure-front-panel
- **Image (verified):** `https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/storage-systems/powervault/me4-family/global-spi/enterprise-powervault-me4-series-ff-hero-504x350-ng.psd?fmt=jpg&wid=1400` (200, image/jpeg, 43,937 B). *Caveat: ME4-family front hero, the tall 5U84 enclosure at the rear of the shot is the ME484/ME4084 chassis; two 2U members are also in frame. No ME484-only photo exists on Dell's CDN.*

### 2. Dell PowerStore 500T, **2 U**
- **RU source:** Dell PowerStore Gen 2 spec sheet, *"Base enclosure: 2U enclosure with dual active/active nodes and twenty-five (25) NVMe drive slots"*, https://www.delltechnologies.com/asset/en-us/products/storage/technical-support/dell-powerstore-gen2-spec-sheet.pdf
- **Why it belongs:** Adds a unified (block + file) all-NVMe primary array next to the SAS capacity tier, the tier the rack's SAS/JBOD shelves can't serve.
- **Front panel:** Hexagon-pattern Dell bezel across the full 2U face with the DELL wordmark centred and a "PowerStore" badge lower-right; a power/status button and LED strip on the left edge; 25 × 2.5-inch NVMe drive carriers with orange latches visible through the hex openings. Dual redundant PSUs.
- **Image (verified):** `https://i.dell.com/is/image/DellContent/content/dam/images/products/storage/powerstore/dell-powerstore-base-bezel-ff.psd?fmt=png-alpha&wid=2400` (200, image/png, 1,329,359 B)

### 3. Dell PowerEdge R760xd2, **2 U**
- **RU source:** Dell PowerEdge R760xd2 Technical Guide, *"Form Factor 2U"*; *"Dimension HxWxD: 2U x 481.6 mm x 837 mm"*, https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r760xd2-technical-guide.pdf
- **Why it belongs:** The rack has a 4U LTO tape library but nothing driving it. The R760xd2 is the dense-drive backup/media server (up to 28 × 3.5" drives, 616 TB) that stages to disk and streams to tape.
- **Front panel:** 12 × 3.5-inch hot-plug SAS/SATA carriers in three rows of four (with a further 12 mid-bay and 4 rear bays for 28 total). Each carrier has an orange release latch and green/amber activity/status LEDs. Left ear: power button, system status LED strip, iDRAC Direct. Right ear: USB and VGA with the service-tag tab. Black/silver 2U chassis.
- **Images (verified):** `https://i.dell.com/is/image/DellContent/content/dam/ss2/product-images/dell-enterprise-products/enterprise-systems/poweredge/r760xd2/media-gallery/server-poweredge-per760xd2-black-silver-gallery-5.psd?fmt=png-alpha&wid=2000` (200, image/png, 1,508,646 B), angled front; `...gallery-2.psd?fmt=png-alpha&wid=2000` (200, image/png, 2,056,096 B), straight front

### 4. Dell PowerProtect DD3300, **2 U**
- **RU source:** Dell PowerProtect DD Series spec sheet, DD3300 is *"a compact, 2U protection storage appliance"*; 17.1" × 29.6" × 3.5", 2U EIA; metric 86.8 mm H × 434 mm W × 715.5 mm D, https://www.dell.com/support/manuals/en-us/dd-os-8.0/dd_p_8.0_spec_guide/dd3300-system-specifications
- **Why it belongs:** Deduplicating backup target sitting between the disk shelves and the LTO library, the piece that makes the tape library part of a real protection chain rather than an orphan.
- **Front panel:** Hexagon-pattern bezel with the DELL EMC wordmark centred and a "PowerProtect" badge lower-right. Behind it, 4, 10 or 12 front-mounted 3.5-inch HDD carriers depending on the capacity model, each with an activity indicator (blinks on I/O) and a status indicator (solid green online; slow-blink green rebuilding; amber-flashing four times per second on failure). Power button and system status LEDs on the left edge; USB/VGA on the right. Front-disk reference: https://www.dell.com/support/manuals/en-us/data-domain-3300/dd_p_dd3300_hw_overview_install_guide/front-disks
- **Image (verified):** `https://cdn.blueally.com/sanstorageworks/images/data-protection/dd-series/dd3300.png` (200, image/png, 185,300 B). *Caveat: reseller-hosted (BlueAlly/SANStorageWorks CDN), Dell publishes no front photo for this SKU on its own CDN.*

**Rack E arithmetic:** 5 (ME484) + 2 (PowerStore 500T) + 2 (R760xd2) + 2 (DD3300) = **11 U** ✓

---

## Confidence notes and caveats

**Highest confidence RU figures** (vendor states the U number in words, not inferred from millimetres): Catalyst 9800-40 (1RU), Secure Firewall 3120 (1RU), UCS 6536 (1RU), C8300-1N1S-4T2X (1RU), UCS C225 M8 (1RU), UCS C245 M8 (2RU), MX480 (8U), MX304 (2U), QFX10002-60C (2U), PTX10001-36MR (1U), PowerVault ME484 (5U), PowerStore 500T base enclosure (2U), R760xd2 (2U), DD3300 (2U), R7615 (2U), R7625 (2U), R6615 (1U), N3248TE-ON (1U).

**The one item to double-check before you commit it:** **MikroTik RB4011iGS+RM.** Its chassis is only 30 mm tall; MikroTik rates it for "a standard 1U rack space" with the supplied ears, so it occupies 1U but leaves a visible gap. Every other MikroTik item is a true 44 mm 1U box. If a strict 44 mm chassis matters for your rack rendering, replace it and I'll find a substitute.

**Two surprises worth flagging** (both verified, both counter to common assumption): the Catalyst 9800-40 is **1RU**, not 2RU (the 9800-80 is the 2RU model); and the MX304 is **2U**, not 1U.

**Images:** every URL above returned HTTP 200, `image/*`, and >20,000 bytes at verification time, and I visually inspected each one to confirm it shows the front (several first-pick candidates turned out to be rear views and were discarded). Three carry caveats noted inline: the Secure Firewall image is series-badged rather than 3120-badged; the ME484 image is a family shot; and the N3248TE-ON and DD3300 images are reseller-hosted because Dell publishes none. The Juniper MX480 and QFX10002-60C images are Juniper's own hardware-guide line drawings rather than photographs, no photographic front views exist on juniper.net (the site now redirects to HPE) or Wikimedia Commons.

**Sources:**
- [Cisco Catalyst 9800-40 Hardware Installation Guide](https://www.cisco.com/c/en/us/td/docs/wireless/controller/9800/9800-40/installation-guide/b-wlc-ig-9800-40/overview.html)
- [Cisco Secure Firewall 3100 Series Data Sheet](https://www.cisco.com/c/en/us/products/collateral/security/firewalls/secure-firewall-3100-series-ds.html)
- [Cisco UCS 6536 Fabric Interconnect Data Sheet](https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs6536-fabric-interconnect-ds.html)
- [Cisco Catalyst 8300 Series Data Sheet](https://www.cisco.com/c/en/us/products/collateral/routers/catalyst-8300-series-edge-platforms/datasheet-c78-744088.html)
- [Cisco Asynchronous Terminal Server Interface Modules Data Sheet](https://www.cisco.com/c/en/us/products/collateral/routers/4000-series-integrated-services-routers-isr/datasheet-c78-739968.html)
- [Cisco UCS C225 M8 Data Sheet](https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c225-m8-rack-server-ds.html)
- [Cisco UCS C245 M8 Data Sheet](https://www.cisco.com/c/en/us/products/collateral/servers-unified-computing/ucs-c-series-rack-servers/ucs-c245-m8-rack-server-ds.html)
- [Juniper MX480 Site Guidelines](https://www.juniper.net/documentation/us/en/hardware/mx480/topics/topic-map/mx480-site-guidelines.html) · [MX480 Chassis](https://www.juniper.net/documentation/us/en/hardware/mx480/topics/topic-map/mx480-chassis.html)
- [Juniper MX304 Chassis](https://www.juniper.net/documentation/us/en/hardware/mx304/topics/topic-map/mx304-chassis.html)
- [Juniper QFX10002 System Overview](https://www.juniper.net/documentation/us/en/hardware/qfx10002/topics/topic-map/qfx10002-system-overview.html)
- [Juniper PTX10001-36MR System Overview](https://www.juniper.net/documentation/us/en/hardware/ptx10001/topics/topic-map/ptx10001-36mr-system-overview.html)
- MikroTik: [CCR2116-12G-4S+](https://mikrotik.com/product/ccr2116_12g_4splus) · [CCR2004-16G-2S+](https://mikrotik.com/product/ccr2004_16g_2splus) · [CRS317-1G-16S+RM](https://mikrotik.com/product/crs317_1g_16s_rm) · [CRS326-24S+2Q+RM](https://mikrotik.com/product/crs326_24s_2q_rm) · [CRS312-4C+8XG-RM](https://mikrotik.com/product/crs312_4c_8xg_rm) · [CRS328-24P-4S+RM](https://mikrotik.com/product/crs328_24p_4s_rm) · [RB4011iGS+RM](https://mikrotik.com/product/rb4011igs_rm)
- [Dell PowerSwitch N3248TE-ON Spec Sheet](https://www.delltechnologies.com/asset/en-us/products/networking/technical-support/dell-powerswitch-n3248te-on-spec-sheet.pdf)
- [Dell PowerEdge R6615 Spec Sheet](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r6615-spec-sheet.pdf) · [R7615 Spec Sheet](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r7615-spec-sheet.pdf) · [R7625 Spec Sheet](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r7625-spec-sheet.pdf) · [R760xd2 Technical Guide](https://www.delltechnologies.com/asset/en-us/products/servers/technical-support/poweredge-r760xd2-technical-guide.pdf)
- [Dell PowerVault ME484 Spec Sheet](https://i.dell.com/sites/csdocuments/product_docs/en/powervault-me484-jbod-spec-sheet.pdf) · [ME4 5U84 Front Panel](https://www.dell.com/support/manuals/en-us/powervault-me4084/me4_series_om_pub/5u84-enclosure-front-panel)
- [Dell PowerStore Gen 2 Spec Sheet](https://www.delltechnologies.com/asset/en-us/products/storage/technical-support/dell-powerstore-gen2-spec-sheet.pdf)
- [Dell PowerProtect DD3300 System Specifications](https://www.dell.com/support/manuals/en-us/dd-os-8.0/dd_p_8.0_spec_guide/dd3300-system-specifications) · [DD3300 Front Disks](https://www.dell.com/support/manuals/en-us/data-domain-3300/dd_p_dd3300_hw_overview_install_guide/front-disks)