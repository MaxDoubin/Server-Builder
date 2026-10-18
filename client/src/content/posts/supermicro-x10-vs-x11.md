
## The problem

Someone searching "supermicro x10 vs x11" has a used board in hand or on a listing and needs four answers: which CPU socket it takes, how much memory it can hold, whether it can boot from NVMe, and whether remote management has its own network port. The generation name answers none of them, because each name covers boards on at least two unrelated sockets.

## X10 and X11 each cover at least two sockets

Supermicro gives one generation name to boards built on different Intel chipsets. The X10 name covers the [X10SLH-F](https://www.supermicro.com/en/products/motherboard/X10SLH-F), an LGA 1150 board that takes DDR3, and the [X10SRL-F](https://www.supermicro.com/en/products/motherboard/X10SRL-F), an LGA 2011 board that takes DDR4. The X11 name covers the [X11SSH-F](https://www.supermicro.com/en/products/motherboard/X11SSH-F), an LGA 1151 board, and the [X11SPM-F](https://www.supermicro.com/en/products/motherboard/X11SPM-F), an LGA 3647 board for Xeon Scalable processors. [ServeTheHome's launch coverage](https://www.servethehome.com/supermicro-x11-solutions-for-intel-xeon-scalable-processor-family/) describes X11 as the Skylake-SP LGA3647 generation, which is only one of the two X11 sockets.

| Board | Socket | Chipset | Memory | BMC |
|---|---|---|---|---|
| X10SLH-F | LGA 1150 (Socket H3) | C226 | 4 DDR3 slots, 32GB max | AST2400 |
| X10SRL-F | LGA 2011 (Socket R3) | C612 | 8 DDR4 slots, 1TB max with 3DS LRDIMM | AST2400 |
| X11SSH-F | LGA 1151 (Socket H4) | C236 | 4 DDR4 slots, 64GB max | AST2400 |
| X11SPM-F | LGA 3647 (Socket P) | C621 | 6 DDR4 slots, 1.5TB max with 3DS modules | AST2500 |

The socket is the first thing to read, because it decides which CPUs fit. The BMC column also differs within the X11 name.

## Which CPUs each socket takes

Each socket fixes the CPU family, and the CPU then sets most of the memory and PCIe budget. The X10SLH-F lists Xeon E3-1200 v3 and v4 chips on LGA 1150, along with Core i3, Pentium and Celeron parts. The X10SRL-F lists the Xeon E5-2600 v4 and v3 families and the E5-1600 v4 and v3 families for its LGA 2011 socket. The X11SSH-F takes Xeon E3-1200 v5 and v6 chips and 6th and 7th generation Core i3 parts on LGA 1151. The X11SPM-F takes Xeon Scalable processors, including second-generation parts, with up to 28 cores. The [X11SPM-F listing](https://www.supermicro.com/en/products/motherboard/X11SPM-F) requires BIOS 3.0a or above for second-generation Xeon Scalable processors, and BIOS 3.2 or above for the Cascade Lake-R variant of that generation.

<figure>
<img src="/images/blog/supermicro-x10-vs-x11/photo-1.jpg" alt="An Intel Xeon E5-1650 v3 processor sitting on the inner part of its retail box" width="1400" height="1050" loading="lazy" decoding="async">
<figcaption>An Intel Xeon E5-1650 v3, a Haswell-EP chip, resting on the inner part of its retail box, photographed in 2014. The X10SRL-F lists the E5-1600 v3 family for its LGA 2011 socket. Photo: Dsimic, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Intel_Xeon_E5-1650_v3_CPU.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

Intel's spec sheets show what one CPU in each socket can do:

| Socket | Intel example | Codename | Memory channels | PCIe lanes | Max memory |
|---|---|---|---|---|---|
| LGA 1151 | Xeon E3-1280 v5 | Skylake | 2 | 16 | 64GB |
| LGA 2011 | Xeon E5-2699 v4 | Broadwell | 4 | 40 | 1.5TB |
| LGA 3647 | Xeon Gold 6148 | Skylake | 6 | 48 | 768GB |

The LGA 1151 example has [2 memory channels and 16 PCIe lanes](https://www.intel.com/content/www/us/en/products/sku/88171/intel-xeon-processor-e31280-v5-8m-cache-3-70-ghz/specifications.html), with a 64GB ceiling. The LGA 2011 [E5-2699 v4](https://www.intel.com/content/www/us/en/products/sku/91317/intel-xeon-processor-e52699-v4-55m-cache-2-20-ghz/specifications.html) has 4 memory channels and 40 PCIe lanes. The LGA 3647 [Xeon Gold 6148](https://www.intel.com/content/www/us/en/products/sku/120489/intel-xeon-gold-6148-processor-27-5m-cache-2-40-ghz/specifications.html) has 6 memory channels and 48 PCIe lanes. [Wikipedia's LGA 3647 entry](https://en.wikipedia.org/wiki/LGA_3647) says the socket supports a six-channel memory controller, which is more than the two channels of the LGA 1151 example and the four of the LGA 2011 example.

For how lanes are split across slots, see [PCIe Lanes, Bifurcation, and Why Your Card Is Running at x4](/blog/pcie-lanes-explained). For the CPU choice itself, see [Choosing the Right Server CPU: Xeon, EPYC, and Apple](/blog/server-cpu-selection-guide).

## Memory: the board and the CPU both set the ceiling

The X10SLH-F is the outlier. It has four DDR3 slots and a 32GB maximum for unbuffered ECC UDIMMs at DDR3-1600. The X10SRL-F has eight DDR4 slots for RDIMM or LRDIMM, and Supermicro lists [up to 1TB of 3DS LRDIMM](https://www.supermicro.com/en/products/motherboard/X10SRL-F). That figure carries a footnote requiring BIOS 2.0 or later. The X11SSH-F has four unbuffered ECC DDR4 slots capped at 64GB. The X11SPM-F has [6 DIMM slots and up to 1.5TB of 3DS ECC memory](https://www.supermicro.com/en/products/motherboard/X11SPM-F).

<figure>
<img src="/images/blog/supermicro-x10-vs-x11/photo-2.jpg" alt="Two Crucial 8GB DDR4 ECC registered memory modules, with part of a third module from the same kit visible" width="1400" height="1050" loading="lazy" decoding="async">
<figcaption>Two 8GB DDR4-2133 ECC registered DIMMs from a Crucial four-module kit (CT8G4RFS4213), photographed in 2014 with part of a third module visible. The X10SRL-F's eight DDR4 slots take registered modules like these as well as LRDIMMs. Photo: Dsimic, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Two_8_GB_DDR4-2133_ECC_1.2_V_RDIMMs.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

So the X10 name covers DDR3 and DDR4 boards, and the X11 name covers both unbuffered and registered memory. For the X11SPM-F, the board and the CPU give different numbers: Supermicro lists 1.5TB for the board, while Intel lists 768GB as the maximum for the Xeon Gold 6148. The lower of the two is the ceiling for that chip. For how channels and DIMM slots interact, see [Server Memory Architecture: DIMM Slots, Channels, and ECC](/blog/server-memory-architecture).

## NVMe boot depends on the BIOS, not the generation

[Supermicro's FAQ for the X10DAi](https://www.supermicro.com/en/support/faqs/faq.php?faq=22269) says: "Yes, X10DAi supports PCI-E NVMe SSDs as a bootable device with UEFI mode BIOS." That FAQ covers PCI Express NVMe drives, and it recommends an SMC certified NVMe SSD, such as an Intel P3700 or P3600, for better compatibility. The X10SRL-F storage line lists SATA3 ports and SuperDOM connectors and names no M.2 slot, so an NVMe boot drive on that board would have to sit on a PCIe adapter card.

Owner reports on X10 boards are mixed. In a [Win-Raid thread about the X10SRi-F](https://winraid.level1techs.com/t/request-supermicro-x10sri-f-nvme-boot/38040), an owner's post from November 19, 2021 reports that the disk was not detected after setting the PCI slots to EFI. A reply says that "the latest bios already has the AMI NVMe module present by default" and suggests pure UEFI with CSM off. The original poster later reports that an X10SRF-i, a different board, booted Windows 10 from a Samsung 980 Pro through a simple adapter, though that post gives no BIOS settings.

On LGA 1151 the steps are more specific. [Supermicro's FAQ for the X11SSH-LN4F](https://www.supermicro.com/support/faqs/faq.cfm?faq=26953), a board in the same X11SSH series, was posted in 2017 and answers a question about a Samsung 960 Pro M.2 drive. Its BIOS steps are to set "NVMe FW source" to AMI native support, set the PCH slot's option ROM ("OPROM") to EFI, and set "Boot mode" to "UEFI only."

An owner thread on the [X11SSH-F-O](https://www.truenas.com/community/threads/supermicro-x11ssh-f-o-w-m-2-nvme-boot-drive-it-will-freenas.72816/) from January 2019 reports the same pattern. The thread says the drive "won't boot" under the default "Vendor Defined Firmware" and boots with NVMe Firmware Source set to "AMI Native Support." The same thread has one poster reporting that the slot is NVMe only and does not take a SATA M.2 drive.

Supermicro lists the X11SSH-F's M.2 slot as [PCIe 3.0 x2](https://www.supermicro.com/en/products/motherboard/X11SSH-F), while the X11SPM-F lists [a PCIe 3.0 x4 M.2 slot](https://www.supermicro.com/en/products/motherboard/X11SPM-F). The X11SPM-F listing does not address booting from that slot, so check the BIOS boot settings before you plan an NVMe boot.

## IPMI: a dedicated port is the difference

Both X10 boards in the table have a dedicated management port. The [X10SRL-F](https://www.supermicro.com/en/products/motherboard/X10SRL-F) lists "1 RJ45 Dedicated IPMI LAN port" with IPMI 2.0, virtual media over LAN and KVM-over-LAN, and the [X10SLH-F](https://www.supermicro.com/en/products/motherboard/X10SLH-F) lists the same "1 RJ45 Dedicated IPMI LAN port" in its specifications. The [X11SPM-F](https://www.supermicro.com/en/products/motherboard/X11SPM-F) lists "KVM with dedicated LAN" alongside IPMI 2.0. The [X11SSH-F](https://www.supermicro.com/en/products/motherboard/X11SSH-F) lists IPMI 2.0 but names no dedicated IPMI port.

<figure>
<img src="/images/blog/supermicro-x10-vs-x11/photo-3.jpg" alt="Rear I/O panel of a Supermicro X10SLM+-LN4F motherboard with serial, USB, five RJ45 network jacks and a VGA port" width="1400" height="897" loading="lazy" decoding="async">
<figcaption>The rear panel of a Supermicro X10SLM+-LN4F, an LGA 1150 board from the X10 line, with a dedicated remote management LAN port paired with two USB 3.0 ports, plus four gigabit Ethernet ports. A separate management jack like this one is what to look for on a used board. Photo: Phiarc, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Supermicro_X10SLM%2B-LN4F_server_motherboard_IO_panel_detail_view.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The BMC chip is another spec to check on the listing. [Supermicro's BMC resources listing](https://www.supermicro.com/en/solutions/management-software/bmc-resources) says the X10 platform's BMC is built on the ASPEED AST 2400 and the X11/H11/H12 platform's BMC is built on ASPEED AST 2500, so for the X11SSH-F the platform figure (AST 2500) and the board's own listing (AST2400) disagree, and the board listing is the one to use for a purchase decision. For how the BMC fits into remote management, see [IPMI and Out-of-Band Management Explained](/blog/ipmi-remote-management).

## Which used platform is the better homelab buy

For a new homelab build, the LGA 3647 X11 board is the better platform if the budget covers Xeon Scalable chips and registered memory. Xeon Scalable chips such as the Gold 6148 bring six memory channels and 48 PCIe lanes each, and the X11SPM-F adds a dedicated KVM LAN, an AST2500 BMC, a PCIe 3.0 x4 M.2 slot and 12 SATA3 ports. Its [listing](https://www.supermicro.com/en/products/motherboard/X11SPM-F) carries no discontinued notice, while the [X10SRL-F](https://www.supermicro.com/en/products/motherboard/X10SRL-F) and the [X11SSH-F](https://www.supermicro.com/en/products/motherboard/X11SSH-F) both say "Discontinued SKU (EOL)."

Pick the X10SRL-F instead when you need eight DIMM slots, or when you already own Xeon E5 v3 or v4 chips. It has a dedicated IPMI port and 10 SATA3 ports, but its storage line names no M.2 slot. Skip the X10SLH-F for most homelab work, because it stops at 32GB of DDR3. The X11SSH-F suits a small single-socket box whose memory needs stay within 64GB.

## What breaks

- **The CPU does not fit the socket.** LGA 3647 takes Skylake-SP and Cascade Lake-SP processors, and the X11SSH-F takes Xeon E3 chips on LGA 1151, so an LGA 1151 chip is not a substitute for an LGA 3647 one. Why: the socket's pin layout is physical, so a chip built for another socket will not seat. Fix: compare the socket on the board listing with the socket in Intel's specification for the CPU before you buy.
- **The X10SLH-F stops at 32GB.** It has four DDR3 slots, and its listing gives 32GB as the maximum. Why: the board is built for DDR3 memory, so DDR4 modules are not an option. Fix: move to an X10SRL-F or X11SPM-F class board if you need more memory.
- **The 1TB figure needs BIOS 2.0.** The [X10SRL-F listing](https://www.supermicro.com/en/products/motherboard/X10SRL-F) marks its 3DS LRDIMM capacity with a dagger, and the footnote says "BIOS version 2.0 or above is required." Why: the larger memory support depends on that BIOS release. Fix: update to BIOS 2.0 or later before you load 3DS LRDIMMs.
- **NVMe boot fails with the default firmware setting.** On the X11SSH-F-O thread, the drive did not boot under the default Vendor Defined Firmware and did boot under AMI Native Support. Why: the owner report shows the default failing, and Supermicro's FAQ for the X11SSH-LN4F changes the same setting. Fix: set NVMe FW source to AMI Native Support, set the slot option ROM to EFI, set boot mode to UEFI only, and use an NVMe M.2 drive, since owners report that the slot does not take SATA M.2.
- **The management port may not be there.** The X11SSH-F listing names IPMI 2.0 but no dedicated IPMI port. Why: [Supermicro's BMC resources listing](https://www.supermicro.com/en/solutions/management-software/bmc-resources) includes "Dedicated or Shared NIC" options, so the BMC can share a LAN port, and the board decides which. Fix: look at the rear panel for a separate RJ45 IPMI jack before you buy, and if there is none, plan on the BMC sharing a LAN port.

## What this means

Read the socket first, then the memory ceiling and the management port. For a new homelab build on a used board, the LGA 3647 X11 board is the better platform, and the X10SRL-F still makes sense for eight DIMM slots or existing E5 v3 and v4 chips. Both the X10SRL-F and X11SSH-F are discontinued, so check parts availability and the BIOS release your NVMe drive needs before you buy.

## References

- https://www.supermicro.com/en/products/motherboard/X10SLH-F
- https://www.supermicro.com/en/products/motherboard/X10SRL-F
- https://www.supermicro.com/en/products/motherboard/X11SSH-F
- https://www.supermicro.com/en/products/motherboard/X11SPM-F
- https://www.supermicro.com/en/solutions/management-software/bmc-resources
- https://www.supermicro.com/en/support/faqs/faq.php?faq=22269
- https://www.supermicro.com/support/faqs/faq.cfm?faq=26953
- https://www.intel.com/content/www/us/en/products/sku/91317/intel-xeon-processor-e52699-v4-55m-cache-2-20-ghz/specifications.html
- https://www.intel.com/content/www/us/en/products/sku/120489/intel-xeon-gold-6148-processor-27-5m-cache-2-40-ghz/specifications.html
- https://www.intel.com/content/www/us/en/products/sku/88171/intel-xeon-processor-e31280-v5-8m-cache-3-70-ghz/specifications.html
- https://winraid.level1techs.com/t/request-supermicro-x10sri-f-nvme-boot/38040
- https://www.truenas.com/community/threads/supermicro-x11ssh-f-o-w-m-2-nvme-boot-drive-it-will-freenas.72816/
- https://www.servethehome.com/supermicro-x11-solutions-for-intel-xeon-scalable-processor-family/
- https://en.wikipedia.org/wiki/LGA_3647
