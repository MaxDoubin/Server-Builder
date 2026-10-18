
## The problem

You have a PowerEdge with a PERC H755 and want ZFS, Ceph or a software-defined pool to see the raw disks, so you search for how to put the card into HBA or IT mode. Dell's documents, a few Dell community replies and third-party guides give different answers, and the H355 and the HBA355 come up as alternatives. You need to know whether the H755 can present raw disks and, if it cannot, which card to buy instead.

## Dell documents no HBA mode for the H755

A Dell moderator answered the question on November 13, 2025. The reply says the "PERC H755 would not be able to be configured as HBA mode or Passthrough mode." Individual drives can be set to Non-RAID, but the card "will not perform as well as HBA as the card sits in the data path" ([Dell Community, November 2025](https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/dell-perc-755-to-hba-mode/6914c99d65d5a212d2f3f3e3)). A second reply in the same thread, posted the same day, says: "The Dell PERC H755 does not support HBA mode." An April 2022 reply about the H750, posted by a DELL-prefixed account, gave the same answer: "H750 does not have a HBA mode" ([Dell Community, April 2022](https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/switch-perc-h750-to-hba-mode/647f9c17f4ccf8a8de0212ce)). The same thread shows the question that software-defined storage users ask. In February 2023, a user asked whether the setup would work for the vSAN requirement. The next day, a Dell staff reply said the question is "best addressed by VMWARE."

The [PERC 11 user guide](https://www.dell.com/support/manuals/en-ca/perc-h755/perc11_ug/technical-specifications-of-perc-11-cards?guid=guid-aaaf8b59-903f-49c1-8832-f3997d125edf&lang=en-us) lists the H755 adapter with an 8 GB DDR4 2666 MT/s cache and PCIe Gen 4. The guide describes per-disk conversion and never uses the word HBA. The [PDF edition of the same guide](https://cdn.accentuate.io/8041890939192/8155358527573/dell-perc11-spec-sheet-v1695928871953.pdf) gives the H755 a Broadcom RAID-on-chip with a SAS3916 chipset and a controller queue depth of 5120.

The older PERC H730 is covered in [PERC H730 HBA mode](/blog/perc-h730-hba-mode), and that card's steps should not be assumed for the H755.

## Why some guides list eHBA for the H755

Dell's enhanced HBA mode, called eHBA, is documented for PERC 10 cards. Dell's knowledge base defines it as "a new operating mode available with H740P, H745, and H745P MX cards." It requires [PERC firmware 50.5.0.1750 or later](https://www.dell.com/support/kbdoc/en-us/000131170/poweredge-server-how-to-create-virtual-disk-in-ehba-mode-for-perc-10). The steps say "Once reboot the system, the Controller Mode should be in eHBA mode." Afterward, "All hard drives show as Non-RAID Disk."

[ProDisk Network](https://www.prodisknetwork.com/blog/dell-perc-raid-controller-guide) labels eHBA as "PERC 10/11, e.g., H740P/H745," which is broader than Dell's list. Dell's knowledge base names H740P, H745 and H745P MX, and the H755 is not among them, so check Dell's list for your exact card before you change any mode.

Forum reports point the same way, though they are not Dell statements. On the TrueNAS forum, a member replied on June 14, 2023: "No, of course not. It's still a [RAID](/blog/raid-levels-comparison) card. Get rid of it and use a true HBA" ([TrueNAS community](https://www.truenas.com/community/threads/dell-perc-h755-compatibility.110584/)). A Level1Techs user wrote on December 10, 2024: "Not happenin with that controller and do not recommend IT mode in prod" ([Level1Techs Forums](https://forum.level1techs.com/t/dell-r760xs-with-perc-h755-hba-mode/221430)). In a Proxmox forum thread from December 18, 2023, an owner reported running Ceph on six servers with the H355. The thread asks "Has anyone implemented PERC H755 as JBOD / Non-Raid?", but no post in it confirms an H755 in HBA or non-RAID mode ([Proxmox Forum](https://forum.proxmox.com/threads/ask-perc-h755-or-h355.138354/)).

A Dell Community post from June 4, 2026 asks Dell to confirm that H755 eHBA "is functionally equivalent to the Dell HBA355i with respect to drive pass-through semantics" for Ceph storage nodes. The thread has no replies, so it is a customer question with no Dell answer ([Dell Community, June 2026](https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/request-for-written-confirmation-perc-h755-ehba-mode-for-ceph-storage-nodes-on-poweredge-r760xs/6a218b1e205c2e50bffc6f63)).

## What per-disk Non-RAID mode gives you on the H755

Per-disk Non-RAID is the H755's stand-in for pass-through. In the PERC 11 configuration utility, open [Main Menu > Configuration Management > Convert to Non-RAID Disk](https://www.dell.com/support/manuals/en-us/perc-h755/perc11_ug/convert-to-nonraid-disk?guid=guid-d648190a-c942-4085-befe-824d44945403&lang=en-us), select the physical disk, and confirm. The guide says that "Virtual disks and non-RAID disks are presented to the operating system as SCSI devices" ([PERC 11 user guide, PDF](https://cdn.accentuate.io/8041890939192/8155358527573/dell-perc11-spec-sheet-v1695928871953.pdf)). The card still sits between each disk and the host, which is why Dell's moderator says the setup will not perform like an HBA. The card also controls the order in which the OS sees disks. For the H755 front SAS and H755 MX cards, the guide says "Non-RAID disks are enumerated first based on slot ID," ahead of virtual disks ([PDF](https://cdn.accentuate.io/8041890939192/8155358527573/dell-perc11-spec-sheet-v1695928871953.pdf)).

<figure>
<img src="/images/blog/perc-h755-hba-mode/photo-1.jpg" alt="PERC 4e/DC circuit board with heat sinks removed, exposing the Intel 80332 I/O processor and LSI53C1030 SCSI chip" width="1400" height="788" loading="lazy" decoding="async">
<figcaption>A Dell PERC 4e/DC with its heat sinks removed, showing the Intel 80332 I/O processor and the LSI53C1030 Ultra320 SCSI controller chip. On a PERC, each disk connects through the card's own controller chips rather than directly to the host, which is why Non-RAID disks on the H755 still pass through the card. Photo: Unknown, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:LSI_Logic_01-01037-07-2352.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The card's limits matter too. The H755 adapter supports RAID 0, 1, 5, 6, 10, 50 and 60, and it allows 16 SAS or SATA drives per controller without a SAS expander ([PDF](https://cdn.accentuate.io/8041890939192/8155358527573/dell-perc11-spec-sheet-v1695928871953.pdf)). The guide says the H755 adapter "supports either SAS, SATA, or NVMe drives depending on the backplane/ server configuration." The guide also warns that 14G PowerEdge servers do not support Gen 4 speeds, and the H750 adapter SAS downtrains to Gen 3 there.

## Which card to use for pass-through instead

Dell's [HBA355 user guide](https://www.dell.com/support/manuals/en-us/hba-355/hba355_ug/dell-hba355i-adapter-dell-hba355i-front-dell-hba355e-adapter-dell-hba350i-mx-dell-hba350i-adapter-~?guid=guid-4e5b127f-13ac-48cf-adfe-3964428b5f24&lang=en-us) describes the family as "solution cards that can be used as a boot controller and also as a data controller." Its contents list a "No RAID support" section, and the cards use "Gen 4 PCIe x eight host interfaces."

<figure>
<img src="/images/blog/perc-h755-hba-mode/photo-2.jpg" alt="Front of an LSI SAS9212-4i4e host bus adapter card with an external SFF-8088 port" width="1280" height="928" loading="lazy" decoding="async">
<figcaption>An LSI SAS9212-4i4e host bus adapter, photographed in 2022, with one external SFF-8088 connector and four internal connectors. A host bus adapter passes each disk straight to the operating system with no RAID layer in between. Photo: Phiarc, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:LSI_SAS9212-4i4e_front.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

The H355 is the simpler card in the same series, and its profile is different. Dell's [controller list](https://www.dell.com/support/kbdoc/en-us/000131648/list-of-poweredge-raid-controller-perc-types-for-dell-emc-systems) gives the H355 adapter "No Cache," with RAID levels "0,1,10 - Note 1" and PCIe Gen 4. The [PDF guide](https://cdn.accentuate.io/8041890939192/8155358527573/dell-perc11-spec-sheet-v1695928871953.pdf) says that "RAID levels 5, 6, 50, and 60 are not supported" on the H355 adapter SAS and that the H355 does not support NVMe drives. It also converts a drive to Non-RAID only if "the drive has never been used before by that specific PERC."

| Card | Cache | RAID levels | Non-RAID or pass-through | PCIe |
| --- | --- | --- | --- | --- |
| PERC H755 adapter | 8 GB DDR4 2666 MT/s | 0, 1, 5, 6, 10, 50, 60 | Per-disk Non-RAID | Gen 4 |
| PERC H355 adapter SAS | No cache (0 GB) | 0, 1, 10 | Per-disk Non-RAID, only for drives never used by that PERC | Gen 4 |
| HBA355 adapter | Not stated | No RAID support | Non-RAID solution card | Gen 4 x8 host |

If you need a plain disk path for ZFS, Ceph or vSAN, use the HBA355 family, which Dell describes as non-RAID solution cards. If you want hardware RAID with cache, the H755 is the card with the cache and the wider RAID list. Because the HBA355 has no RAID support, any hardware RAID array still needs a RAID controller such as the H755.

## What breaks

- **Expecting an IT-mode switch on the H755.** Dell's moderator says the card cannot be set to HBA or passthrough mode, and the PERC 11 guide never uses the word HBA, so no menu change produces one. Fix: Buy an HBA355i or HBA355e for pass-through, and treat per-disk Non-RAID on the H755 as a fallback.
- **Trusting an eHBA claim for the H755.** Dell's knowledge base ties eHBA to H740P, H745 and H745P MX and requires firmware 50.5.0.1750 or later. Some third-party guides apply the label more broadly. Fix: Check Dell's knowledge base for your exact controller and firmware before you change any mode, and do not assume a setting carries over from one card to another.
- **Mixing NVMe with SAS or SATA on one card.** The H755 takes SAS, SATA or NVMe depending on the backplane and server configuration, but the guide says "Mixing NVMe drives with SAS and SATA is not supported." Fix: Choose the drive type before you order the backplane, and keep NVMe and SAS or SATA drives in separate configurations that the server supports.
- **Putting shingled drives behind the card.** The guide says the controller "supports only conventional magnetic recording (CMR) drives, and does not support shingled magnetic recording (SMR) drives." Fix: Check each drive's recording technology before you buy, and choose CMR models.
- **Write-back falling to write-through when the battery fails.** The guide says that "If the battery is declared failed, then all the virtual disks in write-back mode transitions to write-through mode," and the firmware runs learn cycles until the battery is replaced. Fix: Replace the battery as soon as the controller reports it failed, because write-back caching returns only after the replacement.
- **Device names changing after you create virtual or Non-RAID disks.** The guide says "It is recommended to reboot the system for the final device enumeration after creating any virtual disks or non-RAID disks," because the operating system may name devices in the order they were created. The guide adds that on the H355 family, non-RAID disks "may not appear in the slot order." Fix: Reboot after creating any virtual or Non-RAID disk, and identify disks by serial number rather than by device name.

## What this means

For pass-through on an H755 platform, Dell's documents point to a separate HBA card rather than a mode change. Per-disk Non-RAID works as a fallback, but Dell says it will not perform as well as an HBA, and Dell's documents do not describe eHBA for the H755. Buy an HBA355i or HBA355e for ZFS, Ceph or vSAN disk paths, and use the H755 for hardware RAID. Before buying, check the controller and drive list in the Dell documentation for your server model. For vSAN, a Dell reply in the H750 thread defers to VMware, so check VMware's compatibility guidance as well ([Dell Community, February 2023](https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/switch-perc-h750-to-hba-mode/647f9c17f4ccf8a8de0212ce)).

For ZFS on Dell hardware more broadly, see [Running ZFS on Dell Enterprise Hardware](/blog/zfs-on-enterprise-hardware). For the Ceph side of the question, see [Ceph From First Principles](/blog/ceph-distributed-storage-intro).

## References

- https://www.dell.com/support/manuals/en-ca/perc-h755/perc11_ug/technical-specifications-of-perc-11-cards?guid=guid-aaaf8b59-903f-49c1-8832-f3997d125edf&lang=en-us
- https://www.dell.com/support/manuals/en-us/perc-h755/perc11_ug/convert-to-nonraid-disk?guid=guid-d648190a-c942-4085-befe-824d44945403&lang=en-us
- https://cdn.accentuate.io/8041890939192/8155358527573/dell-perc11-spec-sheet-v1695928871953.pdf
- https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/dell-perc-755-to-hba-mode/6914c99d65d5a212d2f3f3e3
- https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/switch-perc-h750-to-hba-mode/647f9c17f4ccf8a8de0212ce
- https://www.dell.com/support/kbdoc/en-us/000131170/poweredge-server-how-to-create-virtual-disk-in-ehba-mode-for-perc-10
- https://www.dell.com/support/kbdoc/en-us/000131648/list-of-poweredge-raid-controller-perc-types-for-dell-emc-systems
- https://www.dell.com/support/manuals/en-us/hba-355/hba355_ug/dell-hba355i-adapter-dell-hba355i-front-dell-hba355e-adapter-dell-hba350i-mx-dell-hba350i-adapter-~?guid=guid-4e5b127f-13ac-48cf-adfe-3964428b5f24&lang=en-us
- https://www.dell.com/community/en/conversations/poweredge-hddscsiraid/request-for-written-confirmation-perc-h755-ehba-mode-for-ceph-storage-nodes-on-poweredge-r760xs/6a218b1e205c2e50bffc6f63
- https://www.truenas.com/community/threads/dell-perc-h755-compatibility.110584/
- https://forum.level1techs.com/t/dell-r760xs-with-perc-h755-hba-mode/221430
- https://forum.proxmox.com/threads/ask-perc-h755-or-h355.138354/
- https://www.prodisknetwork.com/blog/dell-perc-raid-controller-guide
