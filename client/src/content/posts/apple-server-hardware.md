
## The problem

You found an old Apple server for sale, or you need macOS in a rack, or you read that Apple is building AI servers in Texas and wondered how that squares with Apple having left the server business. All three questions have the same answer underneath. Apple has made server hardware in four separate eras, and only one of them produced a machine a datacenter would recognize as a server. This is the whole list, with dates from Apple's own records wherever they still exist.

## Every Apple server line at a glance

| Line | Sold | Processors | What made it a server | How it ended |
|---|---|---|---|---|
| Workgroup Server | 1993 to 1998 | 68040, then PowerPC 601, 604, 604e | Server software, parity RAM on some models, an A/UX option | Replaced by the Macintosh Server G3 |
| Network Server | 1996 to 1997 | PowerPC 604, 604e | AIX, hot-plug drives, optional redundant power on the 700 | Canceled in April 1997 |
| Macintosh Server G3 and G4 | 1998 to 2003 | PowerPC G3, G4 | Mac OS X Server bundled | Replaced by the Xserve |
| Xserve | 2002 to 2011 | PowerPC G4, G5, Intel Xeon | 1U, hot-plug drives, ECC from the G5, lights-out management, optional redundant power | Last orders January 31, 2011 |
| Xserve [RAID](/blog/raid-levels-comparison) | 2003 to 2008 | Storage array | 14 drives, dual controllers, redundant power and cooling | Discontinued February 2008 |
| Mac mini Server | 2009 to 2014 | Intel | Two drives, server OS bundled | Discontinued October 2014 |
| Mac Pro Server | 2010 to 2013 | Intel Xeon | Two drives, server OS bundled | Discontinued October 2013 |
| Mac Pro (Rack) | 2020 to 2026 | Intel Xeon W, then M2 Ultra | Rack rails, ECC on the Intel model | Mac Pro discontinued March 26, 2026 |
| Private Cloud Compute | 2024 onward | Apple silicon | Secure Enclave, Secure Boot, an Apple silicon BMC | In service, never sold |

## Workgroup Server, 1993 to 1998: Macs with a server badge

Apple's first servers were desktop Macs with server software and a few extras. Apple's specifications list the [Workgroup Server 80](https://support.apple.com/en-us/112116) and [Workgroup Server 95](https://support.apple.com/en-us/112122) as introduced on March 22, 1993, with the [Workgroup Server 60](https://support.apple.com/en-us/112126) following on July 26, 1993. Underneath they were 68040 machines in Centris 610, Quadra 800 and Quadra 900 cases. The top model, the 95, added a processor direct slot accelerator card, two SCSI DMA ports and parity RAM, and could ship with A/UX 3.0.1, Apple's UNIX. [TidBITS](https://tidbits.com/1993/03/29/apple-workgroup-servers/) put the range at roughly $3,000 to $13,000 when the line was announced.

PowerPC arrived on April 25, 1994 with the [Workgroup Server 6150, 8150 and 9150](https://support.apple.com/en-us/112115), and the line ran on through the 7250, 8550, 7350 and 9650 until March 1998, when [EveryMac](https://everymac.com/systems/apple/mac_wgs/index-mac-wgs.html) records the last of them giving way to the first Macintosh Server G3. Apple's pages and EveryMac disagree on several of these dates by days or weeks. Where they differ, the dates here are Apple's.

What none of them had, by Apple's own specifications, is anything a server buyer now takes for granted: no hot-swap drives, no redundant power supply, no ECC memory and no remote management.

<figure>
<img src="/images/blog/apple-server-hardware/workgroup-server-8150.jpg" alt="A beige Apple Workgroup Server 8150 tower beside a CRT monitor showing the Mac OS startup screen, with a keyboard on a lab bench" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>A Workgroup Server 8150, one of the first PowerPC models, booting at Bowling Green State University. Photo: Mbrickn, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Workgroup_Server_8150_Booting_Up.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

## Apple Network Server, 1996 to 1997: the one that did not run Mac OS

The Apple Network Server was Apple's most serious server before the Xserve and its strangest product of the decade. Apple dates the [500/132](https://support.apple.com/kb/SP255?locale=en_US) and 700/150 to February 26, 1996 and the [700/200](https://support.apple.com/kb/SP257?locale=en_US) to September 14, 1996, on PowerPC 604 and 604e processors. It did not run Mac OS. Apple's specification page says it "Ships with AIX for Apple Network Servers", which was IBM's UNIX, AIX 4.1.4.

The hardware matched the ambition. Apple lists optional redundant hot-pluggable drives across the line and optional redundant hot-pluggable power supplies on the 700 series, in a cabinet Apple puts at [84 pounds](https://support.apple.com/en-us/112129). The [Floodgap ANS FAQ](https://www.floodgap.com/retrobits/ans/faq.html), the best surviving history of the machine, adds an LCD front panel and a key lock, and lists prices from $10,969 to $16,999. It lasted about a year. Floodgap records that Gil Amelio canceled it in April 1997 on the advice of Steve Jobs, newly returned to Apple.

<figure>
<img src="/images/blog/apple-server-hardware/apple-network-server-700.jpg" alt="A large beige Apple Network Server 700 tower with a column of front drive bays and a key lock" width="720" height="720" loading="lazy" decoding="async">
<figcaption>An Apple Network Server 700/150. It shipped with IBM's AIX rather than Mac OS. Photo: NiiPii09, <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Apple_Network_Server_700_150_-_transparent_background.png">Wikimedia Commons</a>.</figcaption>
</figure>

## Macintosh Server G3 and G4, and Mac OS X Server 1.0

From March 2, 1998 the server became a configuration again: a [Power Macintosh G3 with server software](https://everymac.com/systems/apple/mac_server_g3/index-mac-server-g3.html). The software was what changed. On March 16, 1999 Apple shipped Mac OS X Server 1.0, its NeXT-derived server operating system, at $499 with an unlimited client license, according to Apple's announcement as [reprinted in the April 1999 MUUG Lines](https://centos.muug.ca/pub/muuglines/pdf/muug9904.pdf). [Eclectic Light](https://eclecticlight.co/2024/12/07/a-brief-history-of-mac-servers/) notes that the blue and white G3 server was the first Mac to run it.

The Macintosh Server G4 followed in December 1999, and in May 2001 Apple sold a [533 MHz model for $2,999 and a dual-processor one for $3,999](https://www.apple.com/newsroom/2001/05/21Apple-Introduces-Mac-OS-X-Server/), both with the unlimited-client server license. EveryMac dates its end to [January 28, 2003](https://everymac.com/systems/apple/mac_server_g4/index-mac-server-g4.html), by which time the Xserve had taken its place.

## Xserve, 2002 to 2011: the real one

Apple announced the Xserve on [May 14, 2002](https://www.apple.com/newsroom/2002/05/14Apple-Introduces-Xserve-1U-Rack-Mount-Server/): a 1U rack server holding up to 480GB on four hot-plug ATA/100 drives, with Server Monitor for checking its health remotely, at $2,999 for a single 1 GHz G4 and $3,999 for a dual. It shipped on July 1, 2002. Each generation added what a datacenter expects:

<figure>
<img src="/images/blog/apple-server-hardware/xserve-early-2008.jpg" alt="A one-unit Apple Xserve from early 2008 on a table, with three drive bays and its controls across the front panel" width="1200" height="675" loading="lazy" decoding="async">
<figcaption>An Xserve (Early 2008): one rack unit, three hot-plug drive bays across the front, and the power button, status lights and a USB port at the left. Photo: htomari, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Apple_Xserve_(Early_2008)_(26396570970).jpg">Wikimedia Commons</a>.</figcaption>
</figure>

- **G4, 2003:** [1.33 GHz processors, FireWire 800 and up to 720GB](https://www.apple.com/newsroom/2003/02/10Apple-Upgrades-Xserve/) of hot-plug storage, plus a cheaper headless cluster node.
- **G5, 2004:** [up to 8GB of ECC memory and three hot-plug SATA drive modules](https://www.apple.com/newsroom/2004/01/06Apple-Introduces-Xserve-G5/), with a $2,999 cluster node version; dual 2.3 GHz from January 2005.
- **Intel, 2006:** [two dual-core Xeons up to 3.0 GHz, ECC FB-DIMM memory, an optional 650W redundant power supply and "a new lights out management system"](https://www.apple.com/newsroom/2006/08/07Apple-Introduces-Xserve-with-Quad-64-bit-Xeon-Processors/).
- **Early 2008:** [two quad-core 3.0 GHz Xeons and an optional 750W redundant supply](https://www.apple.com/newsroom/2008/01/08Apple-Introduces-New-Xserve-Most-Powerful-Apple-Server-Ever/).
- **Early 2009:** [Nehalem Xeons, a Bonjour-enabled lights-out management processor and an optional 128GB SSD boot drive](https://www.apple.com/newsroom/2009/04/07Apple-Updates-Xserve-with-Twice-the-Performance/).

Beside it sat the [Xserve RAID](https://www.apple.com/newsroom/2003/02/10Apple-Introduces-Xserve-RAID-Storage-System-With-Breakthrough-Performance-and-Pricing/), announced on February 10, 2003: a 3U array with 14 drives, dual RAID controllers, redundant hot-swap power and cooling and dual 2Gb Fibre Channel, from $5,999. Apple discontinued it on February 19, 2008 and [pointed buyers to Promise's VTrak E-Class](https://tidbits.com/2008/02/19/apple-releases-xsan-2-discontinues-xserve-raid/).

<figure>
<img src="/images/blog/apple-server-hardware/xserve-g5-and-xserve-raid.jpg" alt="Shipping boxes for four Xserve G5 servers stacked beside four Xserve RAID boxes" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>Four Xserve G5 servers and four Xserve RAID arrays, still in their boxes. The RAID was its own 3U array, attached to the servers over Fibre Channel. Photo: Nick Cowie, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC BY-SA 2.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:4_Xserve_G5_%2B_4_Xserve_RAID.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The end arrived in Apple's November 2010 [Xserve Transition Guide](https://cdn.macstories.net/002/L422277A_Xserve_Guide.pdf): "Apple will not be developing a future version of Xserve," with orders accepted through January 31, 2011, as [MacRumors reported](https://www.macrumors.com/2010/11/05/apple-discontinues-xserve-only-available-until-january-31st/) at the time. Apple's suggested replacements were a Mac Pro or a Mac mini running Snow Leopard Server. Why Apple walked away, and what an Xserve is good for today, is in [The Apple Xserve: A Look at Apple's Server Legacy](/blog/xserve-apple-server-legacy).

## Mac mini Server and Mac Pro Server, 2009 to 2014

Apple's answer to its own exit was to sell server configurations of desktop Macs again. The Mac mini with Snow Leopard Server arrived on [October 20, 2009](https://www.apple.com/newsroom/2009/10/20Apple-Unveils-New-iMac-With-21-5-and-27-inch-Displays/) for $999, with two 500GB drives for 1TB of server storage. [AppleInsider found](https://appleinsider.com/articles/09/10/24/inside_apples_new_mac_mini_server) that Apple had dropped the optical drive to make room for the second disk. By November 2010 Apple's transition guide called it Apple's "most popular server system". It was discontinued on [October 16, 2014](https://appleinsider.com/articles/14/10/16/apple-discontinues-mac-mini-server-limits-storage-options-with-latest-hardware-refresh).

<figure>
<img src="/images/blog/apple-server-hardware/mac-mini-server.jpg" alt="A silver unibody Mac mini Server seen from above on a wooden desk" width="1200" height="939" loading="lazy" decoding="async">
<figcaption>A Mac mini Server. Apart from its second drive and the server software, it is the same small aluminum box Apple sold as a desktop. Photo: Amada44, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Apple_Mac_Mini_Server_9654.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The Mac Pro Server, from November 5, 2010, was a [$2,999 Mac Pro with a 2.8 GHz quad-core Xeon, 8GB of memory and two 1TB drives](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-2.8-mid-2010-nehalem-server-specs.html), and Apple's guide suggested shelving them two per 12U. A [Mid 2012 version](https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-3.2-mid-2012-nehalem-server-specs.html) followed, and EveryMac dates the end of the line to October 22, 2013. Since 2014 Apple has sold no Mac described as a server.

## Mac Pro (Rack), 2020 to 2026: a workstation that fits a rack

The rack Mac Pro was never sold as a server, but it is the closest Apple came after the Xserve. Apple promised it with the 2019 Mac Pro on [June 3, 2019](https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/), and it went on sale on [January 14, 2020 from $6,499](https://www.macrumors.com/2020/01/14/mac-pro-rack-mount-now-available/). It needs [five rack units](https://support.apple.com/guide/mac-pro-rack/install-mac-pro-in-a-rack-apd56f1382d3/mac), takes 8 to 28 core Xeon W processors and [up to 1.5TB of ECC memory](https://support.apple.com/en-us/111907), and has none of the Xserve's datacenter features: no redundant power supply and no lights-out management. The [M2 Ultra version](https://www.apple.com/newsroom/2023/06/apple-unveils-new-mac-studio-and-brings-apple-silicon-to-mac-pro/) replaced it on June 13, 2023 at $7,499.

On March 26, 2026 Apple confirmed the end of the line. "Apple said it does not plan to design a new version of the Mac Pro, and no new model will be coming in the future," [MacRumors reported](https://www.macrumors.com/2026/03/26/apple-discontinues-mac-pro/), and [TidBITS](https://tidbits.com/2026/03/30/apple-discontinues-the-mac-pro-for-good/) and [9to5Mac](https://9to5mac.com/2026/03/27/apple-still-selling-the-mac-pro-through-its-certified-refurbished-store/) noted refurbished units still on sale afterward, in both rack and tower form. The Mac Studio is now Apple's top desktop. If you already run one, [Running a Rack-Mount Mac Pro in a Homelab](/blog/mac-pro-rack-mount-homelab) covers what living with it is like.

## The servers Apple builds for itself

Apple came back to server hardware in 2024, for its own use. [Private Cloud Compute](https://security.apple.com/blog/private-cloud-compute/), announced on June 10, 2024, runs on what Apple's security team calls "custom-built server hardware that brings the power and security of Apple silicon to the data center," with the Secure Enclave and Secure Boot. Apple's [hardware integrity documentation](https://security.apple.com/documentation/private-cloud-compute/hardwareintegrity) describes several compute nodes in one chassis alongside an Apple silicon baseboard management controller, the lights-out controller every PowerEdge has and the rack Mac Pro never did.

Apple has been specific about where they are made:

- **February 24, 2025:** Apple said [production of servers in Houston](https://www.apple.com/newsroom/2025/02/apple-will-spend-more-than-500-billion-usd-in-the-us-over-the-next-four-years/) would begin later that year, in a 250,000 square foot facility slated to open in 2026.
- **August 6, 2025:** "in July, the facility produced its first test unit," [Apple said](https://www.apple.com/newsroom/2025/08/apple-increases-us-commitment-to-600-billion-usd-announces-ambitious-program/).
- **October 23, 2025:** Tim Cook [posted](https://x.com/tim_cook/status/1981464918932279798) that the servers were shipping from Houston to Apple's data centers.
- **February 24, 2026:** Apple said servers assembled in Houston, [with logic boards produced onsite](https://www.apple.com/newsroom/2026/02/apple-accelerates-us-manufacturing-with-mac-mini-production/), were running in its data centers.

Which chip is inside is reporting, not fact. Bloomberg's Mark Gurman [reported M2 Ultra](https://www.macrumors.com/2024/05/09/apple-to-power-ai-features-with-m2-ultra-servers/) in 2024, analyst Ming-Chi Kuo [said M5](https://www.macrumors.com/2025/02/24/apple-factory-texas-ai-servers-m5/), and The Information reported a dedicated server chip codenamed Baltra, [developed with Broadcom](https://appleinsider.com/articles/24/12/11/apple-may-be-partnering-with-broadcom-to-make-ai-processors-for-servers), then in July 2026 that the project was [delayed and current servers use M2 Ultra](https://www.techzine.eu/news/infrastructure/142924/apple-considers-acquiring-server-chip-companies/). Apple has named none of them. Photos posted on August 24, 2026 show what [AppleInsider](https://appleinsider.com/articles/26/08/24/this-is-the-first-look-at-the-inside-of-apples-ai-servers) calls "a custom 2U rack-mountable chassis" holding "four columns of hardware, with each consisting of eight smaller computer elements," with a single fan per column, and [MacRumors](https://www.macrumors.com/2026/08/26/leaked-images-of-apple-ai-servers/) noted an Apple logo on a chip package. None of this hardware is for sale.

## What breaks

**Buying an Apple Network Server to run Mac OS.** It shipped with AIX, not Mac OS, and Apple's page is explicit about it. Fix: treat it as an AIX machine or a collector's piece, and use the Floodgap FAQ as your manual.

**Putting a Workgroup Server or Macintosh Server on server duty.** By Apple's own specifications these are desktop Macs: no hot swap, no redundant power, no ECC. Fix: buy them for history, not uptime.

**Expecting a current OS on an Xserve.** The Early 2009 Xserve is on the [OS X El Capitan](https://support.apple.com/en-us/111989) compatibility list, and no later macOS release lists any Xserve. Fix: run a current Linux on it, or keep macOS on an isolated network with nothing you care about behind it.

**Assuming macOS Server still exists.** Apple [discontinued it on April 21, 2022](https://support.apple.com/en-us/101601). Fix: use the file sharing, content caching and Time Machine server that macOS now includes, and a current MDM for device management.

**Planning new work around a Mac Pro.** The line is discontinued. Fix: build around Mac minis or Mac Studios on shelves, or a hosted Mac, and if you buy a refurbished rack Mac Pro, check that its remaining support fits how long you need it.

**Expecting lights-out management on a Mac you can buy.** The rack Mac Pro has none, and the Apple silicon BMC exists only inside Apple's own servers. Fix: pair any racked Mac with a switched PDU and a KVM over IP, as described in [IPMI and Out-of-Band Management Explained](/blog/ipmi-remote-management).

## What this means

Apple has built server hardware for most of the last 33 years, but only the Xserve and its RAID were datacenter servers in the full sense: rack form, hot-plug drives, ECC, redundant power and lights-out management. Everything before them was a Mac with server software, everything after them was a Mac you could put on a shelf, and the only Apple servers being built today are the ones Apple keeps for itself. If you need macOS in a rack in 2026, you are buying desktop Macs and adding the server features yourself.

## References

- https://support.apple.com/en-us/112116
- https://support.apple.com/en-us/112122
- https://support.apple.com/en-us/112126
- https://support.apple.com/en-us/112115
- https://tidbits.com/1993/03/29/apple-workgroup-servers/
- https://everymac.com/systems/apple/mac_wgs/index-mac-wgs.html
- https://support.apple.com/kb/SP255?locale=en_US
- https://support.apple.com/kb/SP257?locale=en_US
- https://support.apple.com/en-us/112129
- https://www.floodgap.com/retrobits/ans/faq.html
- https://everymac.com/systems/apple/mac_server_g3/index-mac-server-g3.html
- https://centos.muug.ca/pub/muuglines/pdf/muug9904.pdf
- https://eclecticlight.co/2024/12/07/a-brief-history-of-mac-servers/
- https://www.apple.com/newsroom/2001/05/21Apple-Introduces-Mac-OS-X-Server/
- https://everymac.com/systems/apple/mac_server_g4/index-mac-server-g4.html
- https://www.apple.com/newsroom/2002/05/14Apple-Introduces-Xserve-1U-Rack-Mount-Server/
- https://www.apple.com/newsroom/2003/02/10Apple-Upgrades-Xserve/
- https://www.apple.com/newsroom/2004/01/06Apple-Introduces-Xserve-G5/
- https://www.apple.com/newsroom/2006/08/07Apple-Introduces-Xserve-with-Quad-64-bit-Xeon-Processors/
- https://www.apple.com/newsroom/2008/01/08Apple-Introduces-New-Xserve-Most-Powerful-Apple-Server-Ever/
- https://www.apple.com/newsroom/2009/04/07Apple-Updates-Xserve-with-Twice-the-Performance/
- https://www.apple.com/newsroom/2003/02/10Apple-Introduces-Xserve-RAID-Storage-System-With-Breakthrough-Performance-and-Pricing/
- https://tidbits.com/2008/02/19/apple-releases-xsan-2-discontinues-xserve-raid/
- https://cdn.macstories.net/002/L422277A_Xserve_Guide.pdf
- https://www.macrumors.com/2010/11/05/apple-discontinues-xserve-only-available-until-january-31st/
- https://www.apple.com/newsroom/2009/10/20Apple-Unveils-New-iMac-With-21-5-and-27-inch-Displays/
- https://appleinsider.com/articles/09/10/24/inside_apples_new_mac_mini_server
- https://appleinsider.com/articles/14/10/16/apple-discontinues-mac-mini-server-limits-storage-options-with-latest-hardware-refresh
- https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-2.8-mid-2010-nehalem-server-specs.html
- https://everymac.com/systems/apple/mac_pro/specs/mac-pro-quad-core-3.2-mid-2012-nehalem-server-specs.html
- https://www.apple.com/newsroom/2019/06/apple-unveils-powerful-all-new-mac-pro-and-groundbreaking-pro-display-xdr/
- https://www.macrumors.com/2020/01/14/mac-pro-rack-mount-now-available/
- https://support.apple.com/guide/mac-pro-rack/install-mac-pro-in-a-rack-apd56f1382d3/mac
- https://support.apple.com/en-us/111907
- https://www.apple.com/newsroom/2023/06/apple-unveils-new-mac-studio-and-brings-apple-silicon-to-mac-pro/
- https://www.macrumors.com/2026/03/26/apple-discontinues-mac-pro/
- https://tidbits.com/2026/03/30/apple-discontinues-the-mac-pro-for-good/
- https://9to5mac.com/2026/03/27/apple-still-selling-the-mac-pro-through-its-certified-refurbished-store/
- https://security.apple.com/blog/private-cloud-compute/
- https://security.apple.com/documentation/private-cloud-compute/hardwareintegrity
- https://www.apple.com/newsroom/2025/02/apple-will-spend-more-than-500-billion-usd-in-the-us-over-the-next-four-years/
- https://www.apple.com/newsroom/2025/08/apple-increases-us-commitment-to-600-billion-usd-announces-ambitious-program/
- https://x.com/tim_cook/status/1981464918932279798
- https://www.apple.com/newsroom/2026/02/apple-accelerates-us-manufacturing-with-mac-mini-production/
- https://www.macrumors.com/2024/05/09/apple-to-power-ai-features-with-m2-ultra-servers/
- https://www.macrumors.com/2025/02/24/apple-factory-texas-ai-servers-m5/
- https://appleinsider.com/articles/24/12/11/apple-may-be-partnering-with-broadcom-to-make-ai-processors-for-servers
- https://www.techzine.eu/news/infrastructure/142924/apple-considers-acquiring-server-chip-companies/
- https://appleinsider.com/articles/26/08/24/this-is-the-first-look-at-the-inside-of-apples-ai-servers
- https://www.macrumors.com/2026/08/26/leaked-images-of-apple-ai-servers/
- https://support.apple.com/en-us/111989
- https://support.apple.com/en-us/101601
