# Apple server hardware: fact sheet (agent, checked 2026-10-05). Verify key claims before publishing.

## Workgroup Server (1993-1998)
- WGS 80, 95 introduced 3/22/1993 (Apple): https://support.apple.com/en-us/112116 ; https://support.apple.com/en-us/112122
- WGS 60 announced with them, Apple says "Introduced: 7/26/1993": https://support.apple.com/en-us/112126 ; TidBITS https://tidbits.com/1993/03/29/apple-workgroup-servers/
- 68040 Macs: form factors "Centris 610" (60), "Quadra 800" (80), "Quadra 900" (95).
- WGS 95: "built-in PDS accelerator card", "two SCSI direct memory access (DMA) ports", "parity RAM"; "Orig SSW: A/UX 3.0.1". No hot swap/redundant power/ECC/LOM listed.
- Price: TidBITS about $3,000 (60) to "$13,000 for the snazziest AWS 95" (no Apple source).
- PowerPC 601 6150, 8150, 9150 "Introduced: 4/25/1994": https://support.apple.com/en-us/112115
- Later: 6150/66, 8150/110, 9150/120 on 4/3/1995; 7250/120, 8550/132 on 2/26/1996; 8550/200 on 9/14/1996; 7350/180, 9650/233 on 4/21/1997; 9650/350 on 8/5/1997 (Apple kb/SP263-SP273, e.g. https://support.apple.com/kb/SP273?locale=en_US)
- "sold from March 1993 to March 1998"; last discontinued March 2, 1998 = first Macintosh Server G3 date (EveryMac): https://everymac.com/systems/apple/mac_wgs/index-mac-wgs.html
- Disagreements: WGS 95 disc. 4/17/1995 (Apple) vs April 3, 1995 (EveryMac); Apple doubles 68040 clocks ("68040, 66") vs EveryMac 33 MHz.

## Apple Network Server (1996-1997)
- 500/132 and 700/150 "Introduced: 2/26/1996"; 700/200 "9/14/1996" (Apple): https://support.apple.com/kb/SP256?locale=en_US ; https://support.apple.com/kb/SP257?locale=en_US ; EveryMac Feb 15 / Oct 16, 1996: https://everymac.com/systems/apple/network_server/index-network-server.html ; Floodgap "January 1996 at the MacWorld Expo": https://www.floodgap.com/retrobits/ans/faq.html
- PowerPC 604 132/150 MHz, 604e 200 MHz. "Ships with AIX for Apple Network Servers"; "Orig SSW: AIX 4.1.4": https://support.apple.com/kb/SP255?locale=en_US
- "Supports optional redundant hot-pluggable disk drives"; 700s "redundant hot-pluggable power supplies"; "Supports parity memory". Floodgap: "an LCD front panel", "front key lock".
- "Weight (lbs): 84", "24.5 H x 16.5 W x 18 D": https://support.apple.com/en-us/112129
- Floodgap prices: $10,969 (500/132), $11,829 (700/150), $16,999 (700/200).
- Dropped April 1997: Floodgap "Gil Amelio canned the ANS on the advice of new returnee Steve Jobs after barely a year in April 1997". EveryMac "Disc. April 1, 1997".

## Macintosh Server G3/G4, Mac OS X Server 1.0
- Mac Server G3 minitower March 2, 1998; Blue & White Jan 5, 1999 (EveryMac): https://everymac.com/systems/apple/mac_server_g3/index-mac-server-g3.html
- Mac OS X Server 1.0 shipped March 16, 1999 at "U.S. $499 with an unlimited client license" (Apple release reprinted in MUUG Lines): https://centos.muug.ca/pub/muuglines/pdf/muug9904.pdf
- Blue & White server "became the first Mac to run Mac OS X Server 1.0": https://eclecticlight.co/2024/12/07/a-brief-history-of-mac-servers/
- Macintosh Server G4 Dec 2, 1999 to Jan 28, 2003, "quietly replaced by the Xserve": https://everymac.com/systems/apple/mac_server_g4/index-mac-server-g4.html
- Apple May 21, 2001: 533 MHz Macintosh Server G4 "$2,999 (US)", dual "$3,999 (US)": https://www.apple.com/newsroom/2001/05/21Apple-Introduces-Mac-OS-X-Server/

## Xserve (2002-2011), Xserve RAID
- G4 announced May 14, 2002: 1U, "up to 480GB on four hot-plug ATA/100 drives", Server Monitor; $2,999 single 1 GHz, $3,999 dual; shipped July 1, 2002: https://www.apple.com/newsroom/2002/05/14Apple-Introduces-Xserve-1U-Rack-Mount-Server/ ; https://www.apple.com/ie/newsroom/2002/07/01Apple-Ships-First-Xserve-Rack-Mount-Servers-to-Customers/
- Feb 10, 2003: 1.33 GHz G4, "up to 720GB of hot-plug storage", FireWire 800; $2,799/$3,799: https://www.apple.com/newsroom/2003/02/10Apple-Upgrades-Xserve/
- G4 Cluster Node March 17, 2003 "US$2799": https://www.macworld.com/article/160313/xserve-11.html
- G5 Jan 6, 2004: "up to 8GB of PC3200 error correcting code (ECC) memory", "three hot-plug Serial ATA drive modules"; $2,999/$3,999; cluster node $2,999; shipped March 23, 2004; dual 2.3 GHz Jan 4, 2005: https://www.apple.com/newsroom/2004/01/06Apple-Introduces-Xserve-G5/ ; https://www.apple.com/newsroom/2004/03/23Apple-Begins-Shipping-Xserve-G5-to-Customers/ ; https://www.apple.com/newsroom/2005/01/04Apple-Upgrades-Xserve-G5/
- Intel Aug 7, 2006: two dual-core Xeon up to 3.0 GHz, "DDR2 ECC FB-DIMM", optional "650W redundant power supply", "A new lights out management system"; $2,999; October 2006: https://www.apple.com/newsroom/2006/08/07Apple-Introduces-Xserve-with-Quad-64-bit-Xeon-Processors/
- Jan 8, 2008: two quad-core 3.0 GHz Xeon, optional "750W redundant power supply"; $2,999: https://www.apple.com/newsroom/2008/01/08Apple-Introduces-New-Xserve-Most-Powerful-Apple-Server-Ever/
- April 7, 2009: Xeon 5500 Nehalem, "Bonjour-enabled Lights-Out Management processor", "128GB SSD boot-drive option"; $2,999; spec page "Three independent hot-plug drive bays": https://www.apple.com/newsroom/2009/04/07Apple-Updates-Xserve-with-Twice-the-Performance/ ; https://support.apple.com/en-us/112625
- End: Xserve Transition Guide Nov 2010: "Apple will not be developing a future version of Xserve"; "Orders for Xserve will be accepted through January 31, 2011"; alternatives Mac Pro and Mac mini with Snow Leopard Server: https://cdn.macstories.net/002/L422277A_Xserve_Guide.pdf ; https://www.macrumors.com/2010/11/05/apple-discontinues-xserve-only-available-until-january-31st/
- Alleged Jobs email "Hardly anyone was buying them" (unconfirmed): https://appleinsider.com/articles/10/11/08/alleged_steve_jobs_e_mail_says_hardly_anyone_was_buying_apples_xserves
- Xserve RAID Feb 10, 2003: 3U, 14 ATA/100 drives up to 2.5TB, dual controllers, "Redundant hot swap power and cooling modules", dual 2Gb Fibre Channel; $5,999/$7,499/$10,999: https://www.apple.com/newsroom/2003/02/10Apple-Introduces-Xserve-RAID-Storage-System-With-Breakthrough-Performance-and-Pricing/
- Xserve RAID discontinued Feb 19, 2008; Apple pointed to Promise VTrak E-Class: https://tidbits.com/2008/02/19/apple-releases-xsan-2-discontinues-xserve-raid/

## Mac mini Server (2009-2014), Mac Pro Server (2010-2013)
- Oct 20, 2009: $999 Mac mini with Snow Leopard Server, two 500GB drives: https://www.apple.com/newsroom/2009/10/20Apple-Unveils-New-iMac-With-21-5-and-27-inch-Displays/
- "drops the optical drive to make room for two 500GB": https://appleinsider.com/articles/09/10/24/inside_apples_new_mac_mini_server
- Apple Nov 2010: Mac mini with Snow Leopard Server "has become Apple's most popular server system" (Transition Guide).
- Ended Oct 16, 2014: https://appleinsider.com/articles/14/10/16/apple-discontinues-mac-mini-server-limits-storage-options-with-latest-hardware-refresh
- Mac Pro Server Nov 5, 2010 $2,999; 2.8GHz quad Xeon, 8GB, two 1TB drives; "two units per 12U": https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-2.8-mid-2010-nehalem-server-specs.html
- Mac Pro Server (Mid 2012) June 11, 2012 $2,999; discontinued October 22, 2013: https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-3.2-mid-2012-nehalem-server-specs.html ; https://support.apple.com/en-us/102887

## Mac Pro (Rack)
- June 3, 2019 announcement "optimized version for rack deployment will be available this fall": https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/
- On sale Jan 14, 2020 from $6,499: https://www.macrumors.com/2020/01/14/mac-pro-rack-mount-now-available/
- "Mac Pro requires five rack units (5U)": https://support.apple.com/guide/mac-pro-rack/install-mac-pro-in-a-rack-apd56f1382d3/mac
- 2023 rack announced June 5, 2023 M2 Ultra $7,499 (tower $6,999), available June 13: https://www.apple.com/newsroom/2023/06/apple-unveils-new-mac-studio-and-brings-apple-silicon-to-mac-pro/ ; https://support.apple.com/en-us/111836
- DISCONTINUED March 26, 2026 (VERIFIED via MacRumors): "Apple said it does not plan to design a new version of the Mac Pro, and no new model will be coming in the future." Mac Studio is the successor: https://www.macrumors.com/2026/03/26/apple-discontinues-mac-pro/ ; https://tidbits.com/2026/03/30/apple-discontinues-the-mac-pro-for-good/ ; refurbished still sold in rack and desktop: https://9to5mac.com/2026/03/27/apple-still-selling-the-mac-pro-through-its-certified-refurbished-store/

## Apple datacenter hardware
- Private Cloud Compute June 10, 2024: "custom-built server hardware that brings the power and security of Apple silicon to the data center", "the Secure Enclave and Secure Boot": https://security.apple.com/blog/private-cloud-compute/ ; https://www.apple.com/newsroom/2024/06/introducing-apple-intelligence-for-iphone-ipad-and-mac/
- "multiple PCC nodes into a server chassis alongside an Apple silicon baseboard management controller (BMC)": https://security.apple.com/documentation/private-cloud-compute/hardwareintegrity
- Houston Feb 24, 2025: production of servers in Houston later this year; 250,000 sq ft facility opening 2026: https://www.apple.com/newsroom/2025/02/apple-will-spend-more-than-500-billion-usd-in-the-us-over-the-next-four-years/
- Aug 6, 2025: "in July, the facility produced its first test unit": https://www.apple.com/newsroom/2025/08/apple-increases-us-commitment-to-600-billion-usd-announces-ambitious-program/
- Oct 23, 2025 Tim Cook: servers "now shipping from our new Houston facility": https://x.com/tim_cook/status/1981464918932279798
- Feb 24, 2026: "Servers assembled in Houston — including logic boards produced onsite — are used in Apple data centers" (NOTE: quote contains an em dash; paraphrase): https://www.apple.com/newsroom/2026/02/apple-accelerates-us-manufacturing-with-mac-mini-production/
- REPORTING: Kuo, Foxconn, "TSMC's high-end M5 chips": https://www.macrumors.com/2025/02/24/apple-factory-texas-ai-servers-m5/
- REPORTING: Gurman May 2024 "M2 Ultra chips will be behind some of the most advanced AI tasks": https://www.macrumors.com/2024/05/09/apple-to-power-ai-features-with-m2-ultra-servers/
- REPORTING: Baltra with Broadcom, N3P, 2026: https://appleinsider.com/articles/24/12/11/apple-may-be-partnering-with-broadcom-to-make-ai-processors-for-servers
- REPORTING: Kuo Jan 2026 server chips mass production 2H 2026: https://appleinsider.com/articles/26/01/13/ming-chi-kuo-apple-will-get-serious-about-ai-server-chips-in-2026
- REPORTING: The Information July 2026 Baltra delayed; current servers M2 Ultra: https://www.techzine.eu/news/infrastructure/142924/apple-considers-acquiring-server-chip-companies/
- AppleInsider Aug 24, 2026 leak: "custom 2U rack-mountable chassis", "four columns of hardware, with each consisting of eight smaller computer elements", "a single fan" per column, needs a Mac Studio for "software control": https://appleinsider.com/articles/26/08/24/this-is-the-first-look-at-the-inside-of-apples-ai-servers ; MacRumors https://www.macrumors.com/2026/08/26/leaked-images-of-apple-ai-servers/

## Context
- Xsan previewed April 17, 2004 "US$999 per system"; shipped Jan 4, 2005: https://www.macworld.com/article/171803/xsan.html ; https://www.apple.com/newsroom/2005/01/04Apple-Ships-Xsan-Storage-Area-Network-File-System/
- "As of April 21, 2022, Apple has discontinued macOS Server.": https://support.apple.com/en-us/101601

## Commons photos (recheck license)
1. File:Workgroup_Server_9150.jpg (CC BY 2.0)
2. File:Workgroup_Server_8150_Booting_Up.jpg (CC BY 4.0)
3. File:Apple_Network_Server_700_150_-_transparent_background.png (CC0)
4. File:Xserve_cluster_NASA.jpg (PD-NASA)
5. File:Apple_Xserve_(Early_2008)_(26396570970).jpg (CC BY-SA 2.0; used as Xserve post cover)
6. File:Virginia_tech_xserve_cluster.jpg (CC BY-SA 2.0)

## Follow-up for the site
- Existing posts call the Mac Pro current ("the Mac Pro is your only option" in xserve-apple-server-legacy, and others). Mac Pro discontinued March 26, 2026. Needs a separate accuracy PR.
