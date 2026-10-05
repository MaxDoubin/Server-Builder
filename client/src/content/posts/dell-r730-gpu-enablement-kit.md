
## The short answer

The Dell R730 GPU enablement kit is the parts bundle Dell requires before any internal GPU: low-profile processor heat sinks, power cables from the riser to the card, and filler brackets for empty slots. Resellers list it as 490-BCDP or 490-BCKS. The server also needs two processors, redundant 1100 W power supplies and inlet air no warmer than 30 C, and it takes at most two 300 W double-wide or four 150 W single-wide passive cards of one model. The risky part is the cable: EPS12V and PCIe 8-pin plugs look alike but assign pins differently, Dell publishes no pin map for the riser end, and a wrong cable can put 12V on ground, so check it with a multimeter before you power on.

## What is in the Dell R730 GPU enablement kit?

Dell's [owner's manual](https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/gpu-card-installation-guidelines?guid=guid-c3605f65-c4ae-4beb-9a32-907a90753b81&lang=en-us) lists three items: low-profile heat sinks, power cables for the GPU cards, and filler brackets with a closeout EMI shield for unoccupied PCIe slots. A [December 2025 Dell Community reply](https://www.dell.com/community/en/conversations/rack-servers/dell-poweredge-r730xd-nvidia-tesla-p100-pcie-power-cabling-behavior/6941e991a056e951eeec0698) said the kit "comes with low profile heatsink and two cables."

Dell's manuals print no part numbers. Resellers list the kit as [490-BCDP](https://www.mcac.com/490-bcdp.html) or [490-BCKS](https://www.synigo.com/dell-r730-gpu-installation-kit/cat-p/c36118/p8585019/l_en). The December 2025 reply named the cables as J30DG ("ASSY,CBL,PWR,GRPHC,R730") and N08NH, the "V2" of that assembly, and a [Dell staff reply](https://www.dell.com/community/en/conversations/poweredge-hardware-general/gpu-installation-on-r730/647f6a14f4ccf8a8de729dd2) in April 2024 said four 150 W single-wide cards need "two of the split power cables np#N08NH." A third number, 9H6FV, appears in [reseller listings](https://expresscomputersystems.com/products/9h6fv), but one [third-party guide](https://www.itechguides.com/dell-poweredge-r730-rack-7910-riser-gpu-power-pinout-cables-n08nh-9h6fv-and-safe-verification/) says "the available evidence does not establish that 9H6FV and N08NH are electrically identical." Confirm the part numbers, both cables and the heat sinks before you buy.

## What else does an R730 need before it takes a GPU?

Dell's rules come from the [owner's manual](https://dl.dell.com/topicspdf/poweredge-r730_owners-manual_en-us.pdf) and the [technical guide](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf):

- **Processors:** both sockets filled, with the kit's low-profile heat sinks. The guide caps them at 120 W and the manual at 135 W, so stay at 120 W or less.
- **Power:** redundant 1100 W supplies. For a K80, both must be 1100 W and set to non-redundant mode.
- **Temperature:** 30 C maximum inlet, against 35 C normally. Dell's expanded-temperature restrictions say "GPU is not supported."
- **Airflow:** no special fan part is named, but solid PCIe blanks are required and every bay and fan position must hold a component or a blank.
- **Cards:** passive only, one type and model, compute only with no video output, no tape backup.
- **GPU memory:** the guide's "up to 6GB" per GPU is out of date, since it also lists the 12 GB [K40](https://international.download.nvidia.com/tesla/pdf/tesla-k40-passive-board-spec.pdf).

Slots 4 to 7 take full-height, full-length cards, and each supplies 75 W:

| Slot | Riser | Processor | Link |
|---|---|---|---|
| 4 | 2 | CPU 2 | x16 |
| 5 | 2 | CPU 1 | x8 |
| 6 | 3 | CPU 1 | x8, or x16 on the optional riser 3 |
| 7 | 3 | CPU 1 | x8, standard riser 3 only |

Two double-wide cards need the optional riser 3 (one x16 slot) and go in slots 6 and 4. Three or four single-wide cards need the standard riser 3 and go in slots 6, 4, 7 and 5.

## Which GPUs does Dell support in the R730?

Dell lists data center cards, mostly NVIDIA Tesla and GRID plus a few AMD FirePro and Intel Xeon Phi parts, and its documents differ, so the table shows where each card appears. The guide's Table 7 lists Xeon Phi coprocessors, K40, K10, GRID K1 and K2, S7000 and S9050. Dell's [March 2020 vSphere white paper](https://downloads.dell.com/manuals/common/dell-emc-poweredge-nvidia-vmware-vsphere.pdf) marks the R730 supported for the Grid K1, Grid K2, Tesla M60 and K40m, and for vGPU on the M10, M60, P4 and P40. The manual adds a K80 rule, a [2016 Dell staff answer](https://dell.com/community/PowerEdge-Hardware-General/GPU-Installation-on-R730/m-p/5148943) adds the M40, S9150, S7150 and Xeon Phi 7120P and 3120P, and [NVIDIA's May 2023 note](https://images.nvidia.com/content/grid/pdf/DA-09018-001_v10.pdf) lists the R730 for the K1, K2, P100, M60, P4, P40 and M10 but not the V100. Dell is not adding to the list: in June 2025 a Dell reply said, "we will not be revalidating anything on 13 Gen servers."

<figure>
<img src="/images/blog/dell-r730-gpu-enablement-kit/xeon-phi.jpg" alt="An Intel Xeon Phi 5110P coprocessor package" width="1200" height="900" loading="lazy" decoding="async">
<figcaption>An Intel Xeon Phi 5110P. Dell's R730 guide lists Xeon Phi coprocessors alongside its Tesla and GRID cards. Photo: Poi3212, <a href="https://creativecommons.org/publicdomain/zero/1.0/">CC0</a>, via <a href="https://commons.wikimedia.org/wiki/File:Xeon_Phi_5110p_IHS.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

| Card | Board power | Slot | Listed by |
|---|---|---|---|
| [Tesla K80](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-product-literature/Tesla-K80-BoardSpec-07317-001-v05.pdf) | 300 W | Dual | Manual, Dell staff |
| [Tesla K40 or K40m](https://international.download.nvidia.com/tesla/pdf/tesla-k40-passive-board-spec.pdf) | 235 W | Dual | Guide, Dell paper, Dell staff |
| [Tesla K10](https://international.download.nvidia.com/tesla/pdf/tesla-k10-board-spec.pdf) | 225 W | Dual | Guide |
| [GRID K1](https://images.nvidia.com/content/grid/pdf/DA-09018-001_v10.pdf) | 130 W | Dual | Guide, Dell paper, Dell staff, NVIDIA |
| [GRID K2](https://images.nvidia.com/content/grid/pdf/DA-09018-001_v10.pdf) | 225 W | Dual | Guide, Dell paper, Dell staff, NVIDIA |
| [Tesla M60](https://images.nvidia.com/content/pdf/tesla/tesla-m60-product-brief.pdf) | 300 W | Dual | Dell paper, Dell staff, NVIDIA |
| [Tesla M40](https://images.nvidia.com/content/tesla/pdf/nvidia-teslam40-datasheet.pdf) | 250 W | Dual | Dell staff |
| [Tesla M10](https://images.nvidia.com/content/grid/pdf/DA-09018-001_v10.pdf) | 225 W | Dual | Dell paper (vGPU), NVIDIA |
| [Tesla P40](https://images.nvidia.com/content/pdf/tesla/Tesla-P40-Product-Brief.pdf) | 250 W | Dual | Dell paper (vGPU), NVIDIA |
| [Tesla P4](https://images.nvidia.com/content/grid/pdf/DA-09018-001_v10.pdf) | 75 W | Single, low profile | Dell paper (vGPU), NVIDIA |
| [Tesla P100 PCIe](https://images.nvidia.com/content/tesla/pdf/NV-tesla-p100-pcie-PB-08248-001-v01.pdf) | 250 W | Dual | NVIDIA |
| [FirePro S7000](https://ir.amd.com/news-events/press-releases/detail/244/amd-introduces-industrys-most-powerful-server-graphics-processors) | 150 W | Single | Guide |
| FirePro S7150 | 150 W | Single | Dell staff |
| [FirePro S9050 or S9150](https://ir.amd.com/news-events/press-releases/detail/549/amd-unleashes-worlds-most-powerful-server-gpu-for-hpc) | 225 or 235 W | Dual | Guide (S9050), Dell staff (S9150) |
| [Xeon Phi 3120P, 5110P, 7120P](https://www.intel.com/content/dam/www/public/us/en/documents/datasheets/xeon-phi-coprocessor-datasheet.pdf) | 300 W (5110P: 225 W) | Not stated | Guide, Dell staff |

Card names link to the vendor document behind the power and slot figures. "Dell paper" is the white paper and "Dell staff" the forum answers. The P100 rests on NVIDIA's list and owner reports, since Dell's passthrough table marks it "N" for the R730, and V100 and A100 cards are owner reports only, on [ServeTheHome](https://forums.servethehome.com/index.php?threads/looking-for-feedback-on-what-models-of-older-dell-poweredge-servers-people-use-powered-tesla-gpus-in.43523/) and [Dell Community](https://www.dell.com/community/en/conversations/poweredge-hardware-general/gpu-installation-on-r730/647f6a14f4ccf8a8de729dd2).

## Which power cable does the riser need?

Dell labels the riser socket "power connector (for GPU cards)" on risers 2 and 3 and publishes no pin map for it. The kit cable ends in PCIe-style plugs, so a card with a CPU-style 8-pin input needs an adapter or a purpose-built cable.

### What Dell's cable connects

A [reseller listing for N08NH](https://www.itcreations.com/product/74531) describes a 14-inch Y cable: one white 8-pin riser plug to one 6+2-pin and one 6-pin plug. Dell's manual says to plug the cable into "the six-pin and eight-pin connectors on the GPU card," as on the K40.

The K80, P100, P40 and M60 use a CPU-style 8-pin instead. NVIDIA's [K80 specification](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-product-literature/Tesla-K80-BoardSpec-07317-001-v05.pdf) says the card "no longer uses the PCI Express auxiliary connectors" and ships a dongle from the CPU 8-pin to two PCIe 8-pin plugs, with both cables from "a common rail" and 225 W in total. The [P100](https://images.nvidia.com/content/tesla/pdf/NV-tesla-p100-pcie-PB-08248-001-v01.pdf), [P40](https://images.nvidia.com/content/pdf/tesla/Tesla-P40-Product-Brief.pdf) and [M60](https://images.nvidia.com/content/pdf/tesla/tesla-m60-product-brief.pdf) briefs list the same input, and a Dell Community reply said the K80 "needed a specific 8-pin cable." Sellers list straight 8-pin to 8-pin cables "For DELL R730 8pin to 8pin Power Cable Nvidia K80/M40/M60/P40/P100 PCIE GPU," but those are seller descriptions, not Dell parts.

### EPS12V and PCIe 8-pin: similar plugs, different pins

Intel's power supply design guide gives both pin maps, and NVIDIA's K80 drawing numbers both housings the same way, so pin n sits in the same place on each. By pin number they conflict:

<figure>
<img src="/images/blog/dell-r730-gpu-enablement-kit/pcie-8pin-pinout.jpg" alt="Pin map of a PCIe 8-pin power connector with pins 1 to 3 at +12V" width="1200" height="540" loading="lazy" decoding="async">
<figcaption>The PCIe 8-pin pin map: pins 1 to 3 carry +12V, pins 5, 7 and 8 are ground, and pins 4 and 6 are sense pins. An EPS12V plug puts +12V on pins 5 to 8 instead. Photo: Elmepi, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:PCIe8connector.svg">Wikimedia Commons</a>.</figcaption>
</figure>

| Pin | EPS12V (CPU) | PCIe 2x4 |
|---|---|---|
| 1 | Ground | +12V |
| 2 | Ground | +12V |
| 3 | Ground | +12V |
| 4 | Ground | Sense1 |
| 5 | +12V | Ground |
| 6 | +12V | Sense0 |
| 7 | +12V | Ground |
| 8 | +12V | Ground |

The [EPS table](https://cdrdv2-public.intel.com/613768/613768_2.11.pdf) is Intel's Table 5-6 and the PCIe table is Table 5-8, which matches NVIDIA's K40 table. A PCIe plug grounds both sense pins to signal 150 W.

### Why a wrong cable can put 12V on ground

Following the tables, a straight-through cable joins pin 1 at one end to pin 1 at the other. If one end follows the EPS map and the other the PCIe map, pins 1 to 3 join ground to +12V and pins 5, 7 and 8 join +12V to ground, so the card sees reversed polarity and the supply may see a short. Keying only checks the plug type, not the wiring. NVIDIA's dongle drawing shows a correct converter crossing the wires, from the CPU plug's pins 5 to 8 to pins 1 to 3 of each PCIe socket and from pins 1 to 4 to the grounds and sense pins.

Owners report the results. An R730xd owner said that with a single 8-pin EPS cable "the power supply goes into fault state (amber)." A [P100 owner](https://forums.developer.nvidia.com/t/need-help-with-p100-installation-r730-dell/262245) wrote that "there are a lot of cables that the sellers were selling as if they would work for R730" and fixed a missing GPU with a different cable. An [R720 owner](https://forum.dangerousthings.com/t/r720-riser-card-power-to-rtx-3060-gpus/24554) says the riser has a sensing pin that the cable must tie to ground. None of that is a Dell document for the R730, so treat the riser end as unpublished.

### Check the cable with a multimeter before you power on

This check is a method built on Intel's published pin maps, not a Dell procedure. If any reading does not match what the steps describe, do not power on.

1. Power off and disconnect the system from the electrical outlet (both cords), as Dell's "Before working inside your system" steps require, then unplug the cable from the riser and the card.
2. On the continuity setting, test the cable alone. Pins 1 to 3 of a PCIe plug and pins 5 to 8 of a CPU-style plug carry +12V, and every other pin is ground or a sense pin tied to ground, so a +12V pin must beep only to other +12V pins.
3. Repeat on a genuine Dell cable (J30DG or N08NH): its riser-end pins that beep to card-end pins 1 to 3 are +12V. Yours must match, with those pins reaching +12V at the card end (pins 1 to 3 on a PCIe plug, 5 to 8 on a CPU-style plug) and every other riser-end pin going where it goes on the Dell cable.
4. Plug the cable into the riser only, leave the server unplugged, and measure resistance from a card-end +12V pin to a ground pin. Near zero ohms is a short, so stop. Otherwise connect the card, power on and watch the supply lights, and if one turns amber, power off and unplug.

## Can you use a consumer GPU in an R730?

Dell says no. A Dell moderator wrote in 2024, ["I'm afraid we do not support graphic cards with server models- only GPUs"](https://www.dell.com/community/en/conversations/poweredge-hardware-general/r730-graphics-card/65ed22e9da5d404bffe17308). Owners do it anyway, within limits of power and cooling.

**Power.** Slots supply 75 W, a 6-pin plug adds 75 W and an 8-pin plug 150 W at PCIe ratings, so 75 plus 75 plus 150 reaches Dell's 300 W limit. Intel says the 12V-2x6 connector is "not compatible with the 2x3 or 2x4 auxiliary power connectors," so a card that needs it has no path from Dell's cable.

**Owner reports.** One Dell forum owner said dual RTX 2070 Supers "work just fine." A [2017 poster](https://www.dell.com/community/en/conversations/poweredge-hardware-general/poweredge-r730-gpu-configuration-help/647f727af4ccf8a8de025a94) warned that with a GTX card "the fans will ramp up to 75%." On an R730xd, a [ServeTheHome owner](https://forums.servethehome.com/index.php?threads/does-dell-r730xd-support-gpu.36236/) ran a GTX Titan X on Dell cable 0N08NH and measured "70c" under synthetic load. One owner advised a jumper between pins 5 and 6 on the GPU-side plug because the sense pin was "not sensing"; those are ground and Sense0 in Intel's table, which allows grounding a sense pin "via a jumper to an adjacent ground pin," but test the cable instead of improvising.

## How hot and loud does an R730 get with a GPU?

Dell's guide says any GPGPU card makes the system "significantly louder (about twice as loud)." Third-party cards also get a default cooling response: Dell's [13G knowledge base article](https://www.dell.com/support/kbdoc/en-us/000135682/how-to-disable-the-third-party-pcie-card-default-cooling-response-on-poweredge-13g-servers) says it "provisions airflow based on common industry card requirements" and targets 55 C inlet air at the card region. The commands to turn that off are in [Dell R730 quiet fans](/blog/dell-r730-quiet-fans).

iDRAC8 adds four settings under Overview, Hardware, Fans, Setup: thermal profile, maximum exhaust temperature (default 70 C), fan speed offset (Low, Medium, High, Max or Off) and minimum fan speed. Dell's [iDRAC8 guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf) says the offset's most common use is "non-standard PCIe adapter cooling," and a reboot is required.

## How do you install a GPU in an R730?

Dell's owner's manual procedure is the base, with the cable check added:

<figure>
<img src="/images/blog/dell-r730-gpu-enablement-kit/pcie-6-plus-2.jpg" alt="A 6+2-pin PCIe power plug beside its detached two-pin section" width="1200" height="663" loading="lazy" decoding="async">
<figcaption>A 6+2-pin PCIe power plug with its two-pin section detached. Dell's N08NH Y cable ends in one 6+2-pin plug and one 6-pin plug. Photo: Cybercobra, <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>, via <a href="https://commons.wikimedia.org/wiki/File:PCIe_6%2B2_connector.jpg">Wikimedia Commons</a>.</figcaption>
</figure>

1. Confirm two processors, 1100 W supplies, the kit and, for two double-wide cards, the optional riser 3.
2. Turn off the system, disconnect it from the electrical outlet, remove the cover and let the heat sinks cool. Remove the cooling shroud and heat sinks, loosening the four screws one at a time in a diagonal pattern.
3. Fit the kit's heat sinks and refit the shroud. Dell's heat sink steps use thermal grease from the processor kit's syringe, and the GPU steps do not say whether the kit includes any.
4. Lift the expansion card latch, remove the filler brackets for the GPU and replace the rest with the kit's brackets.
5. Run the multimeter checks above.
6. Seat the card in the riser slot, plug the cable into the card and press the card lock down.
7. Connect the cable to the "power connector (for GPU cards)" on the riser and close the latches.
8. Refit the cover, power on and confirm Memory Mapped I/O above 4 GB is Enabled.
9. Install the card's drivers. To pass it to a VM, see [GPU passthrough on Proxmox](/blog/gpu-passthrough-proxmox).

```bash
lspci | grep -i nvidia
nvidia-smi
```

The card should appear in both. One P100 owner's `lspci` line read `03:00.0 3D controller: NVIDIA Corporation GP100GL [Tesla P100 PCIe 16GB] (rev a1)`, and `nvidia-smi` printed "No devices were found" until the cable was replaced.

## Does the R730xd take the GPU kit?

Not by Dell's documents. The guide says "The R730xd does not support internal or external GPUs," and a 2020 Dell reply said "Internal GPU cards are supported on the PowerEdge R730 and not on the PowerEdge R730xd." Owners [report unsupported cards working there](https://www.dell.com/community/en/conversations/poweredge-hardware-general/gpu-install-in-a-r730xd/647f8334f4ccf8a8de201b2e). [R730 vs R730xd](/blog/dell-r730-vs-r730xd) covers the bay, slot and processor differences.

## What breaks

**A power supply turns amber and the server will not start after you connect the card.** Reports point to a pin map that does not match the riser or the card, or to a single feed that cannot carry the card, and the supply's protection trips. One owner fixed it with two 8-pin feeds from separate outputs, and a Dell reply said a single feed "triggers PSU protection." Fix: unplug, run the multimeter checks, and use a cable verified against a genuine Dell one.

**The card shows in `lspci` but `nvidia-smi` finds no GPU.** A P100 owner traced it to a seller's cable advertised for the R730 that did not work. Fix: replace it with a verified cable, then reinstall the driver if the error persists.

**Dell's 6-pin plus 6+2-pin cable cannot power a K80, M60, P40 or P100 on its own.** Those cards have a CPU-style 8-pin socket, and a Dell reply said "a standard GPU power connector is not compatible." Fix: use NVIDIA's CPU 8-pin to PCIe 8-pin dongle with Dell's cable, or a cable built for the riser and the card, checked as above.

**A VM with a passed-through M60 shows a blank screen or will not power on.** Dell's white paper lists two R730 causes: compute mode instead of graphics mode, or a hypervisor that cannot map the card's memory. Fix: switch the mode with NVIDIA's gpumodeswitch tool, enable Memory Mapped I/O above 4 GB, and on ESXi add pciPassthru.use64bitMMIO="TRUE" and pciPassthru.64bitMMIOSizeGB = "64" to the VM's VMX file.

## Frequently asked questions

### What is the Dell part number for the R730 GPU power cable?

Dell staff named J30DG and N08NH in December 2025, with N08NH as the "V2" assembly. Resellers also list 9H6FV, and the kit as 490-BCDP or 490-BCKS. Dell's manuals print none of these, so match the cable's ends to your card, not just the listing.

### Is there an official pinout for the R730 riser GPU power connector?

No. Dell's manuals only label the socket "power connector (for GPU cards)," and one third-party guide says they "do not verify one universal numbered riser-side pinout." Intel's design guide has the EPS12V and PCIe 8-pin maps.

### Does Dell still support GPUs in the R730?

Only the cards it already approved. A June 2025 Dell reply said Dell will not revalidate anything on 13th generation servers, and a 2024 reply said Dell had not validated the RTX 4000 Ada. The P40 is in Dell's 2020 white paper for vGPU, and the P100 rests on NVIDIA's certification.

## What this means

Buy the kit and cables as a matched set, fit two processors and 1100 W supplies, and keep the inlet under 30 C. Match the cable to the card: Dell's cable for PCIe-input cards, NVIDIA's dongle for the K80, M60, P40 and P100. For the circuit math behind two 300 W cards, see [GPU power and cooling at home](/blog/gpu-power-and-cooling). Treat any cable that did not come from Dell as untested until the multimeter says otherwise.

## References

- [Dell PowerEdge R730 Owner's Manual: GPU card installation guidelines](https://www.dell.com/support/manuals/en-us/poweredge-r730/r730_ompublication/gpu-card-installation-guidelines?guid=guid-c3605f65-c4ae-4beb-9a32-907a90753b81&lang=en-us)
- [Dell PowerEdge R730 Owner's Manual (PDF)](https://dl.dell.com/topicspdf/poweredge-r730_owners-manual_en-us.pdf)
- [Dell PowerEdge R730 and R730xd Technical Guide v1.7](https://i.dell.com/sites/doccontent/shared-content/data-sheets/en/Documents/Dell-PowerEdge-R730-and-R730xd-Technical-Guide-v1-7.pdf)
- [Dell EMC PowerEdge Servers with NVIDIA GPUs and VMware vSphere (March 2020)](https://downloads.dell.com/manuals/common/dell-emc-poweredge-nvidia-vmware-vsphere.pdf)
- [Dell KB 000135682: third-party PCIe card cooling response on 13G servers](https://www.dell.com/support/kbdoc/en-us/000135682/how-to-disable-the-third-party-pcie-card-default-cooling-response-on-poweredge-13g-servers)
- [Dell iDRAC8 Version 2.75.75.75 User's Guide](https://downloads.dell.com/topicspdf/idrac8-lifecycle-controller-v2757575_users-guide_en-us.pdf)
- [Dell Community: GPU Installation on R730 (replies 2016 to 2026)](https://www.dell.com/community/en/conversations/poweredge-hardware-general/gpu-installation-on-r730/647f6a14f4ccf8a8de729dd2)
- [Dell Community: GPU Installation on R730 (older URL, June 2025 reply)](https://dell.com/community/PowerEdge-Hardware-General/GPU-Installation-on-R730/m-p/5148943)
- [Dell Community: R730xd and Tesla P100 power cabling behavior](https://www.dell.com/community/en/conversations/rack-servers/dell-poweredge-r730xd-nvidia-tesla-p100-pcie-power-cabling-behavior/6941e991a056e951eeec0698)
- [Dell Community: R730 Graphics card?](https://www.dell.com/community/en/conversations/poweredge-hardware-general/r730-graphics-card/65ed22e9da5d404bffe17308)
- [Dell Community: GPU install in a R730xd](https://www.dell.com/community/en/conversations/poweredge-hardware-general/gpu-install-in-a-r730xd/647f8334f4ccf8a8de201b2e)
- [Dell Community: PowerEdge R730 + GPU Configuration Help](https://www.dell.com/community/en/conversations/poweredge-hardware-general/poweredge-r730-gpu-configuration-help/647f727af4ccf8a8de025a94)
- [NVIDIA Tesla K80 board specification BD-07317-001](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-product-literature/Tesla-K80-BoardSpec-07317-001-v05.pdf)
- [NVIDIA Tesla K40 passive board specification BD-06902-001](https://international.download.nvidia.com/tesla/pdf/tesla-k40-passive-board-spec.pdf)
- [NVIDIA Tesla K10 board specification BD-06280-001](https://international.download.nvidia.com/tesla/pdf/tesla-k10-board-spec.pdf)
- [NVIDIA Tesla P100 PCIe product brief](https://images.nvidia.com/content/tesla/pdf/NV-tesla-p100-pcie-PB-08248-001-v01.pdf)
- [NVIDIA Tesla P40 product brief](https://images.nvidia.com/content/pdf/tesla/Tesla-P40-Product-Brief.pdf)
- [NVIDIA Tesla M60 product brief](https://images.nvidia.com/content/pdf/tesla/tesla-m60-product-brief.pdf)
- [NVIDIA Tesla M40 datasheet](https://images.nvidia.com/content/tesla/pdf/nvidia-teslam40-datasheet.pdf)
- [NVIDIA application note DA-09018-001: certified OEM platforms](https://images.nvidia.com/content/grid/pdf/DA-09018-001_v10.pdf)
- [NVIDIA developer forums: P100 installation on a Dell R730](https://forums.developer.nvidia.com/t/need-help-with-p100-installation-r730-dell/262245)
- [Intel ATX12VO Desktop Power Supply Design Guide, Revision 2.11](https://cdrdv2-public.intel.com/613768/613768_2.11.pdf)
- [Intel Xeon Phi Coprocessor x100 Product Family Datasheet](https://www.intel.com/content/dam/www/public/us/en/documents/datasheets/xeon-phi-coprocessor-datasheet.pdf)
- [AMD press release: FirePro S9150 and S9050](https://ir.amd.com/news-events/press-releases/detail/549/amd-unleashes-worlds-most-powerful-server-gpu-for-hpc)
- [AMD press release: FirePro S7000](https://ir.amd.com/news-events/press-releases/detail/244/amd-introduces-industrys-most-powerful-server-graphics-processors)
- [ServeTheHome forums: Tesla GPUs in older Dell PowerEdge servers](https://forums.servethehome.com/index.php?threads/looking-for-feedback-on-what-models-of-older-dell-poweredge-servers-people-use-powered-tesla-gpus-in.43523/)
- [ServeTheHome forums: Does Dell R730xd support GPU?](https://forums.servethehome.com/index.php?threads/does-dell-r730xd-support-gpu.36236/)
- [itechguides: Dell PowerEdge R730 riser GPU power pinout](https://www.itechguides.com/dell-poweredge-r730-rack-7910-riser-gpu-power-pinout-cables-n08nh-9h6fv-and-safe-verification/)
- [IT Creations: Dell N08NH GPU power cable listing](https://www.itcreations.com/product/74531)
- [Express Computer Systems: 9H6FV riser to GPU power cable listing](https://expresscomputersystems.com/products/9h6fv)
- [MCA: Dell R730 GPU installation kit 490-BCDP listing](https://www.mcac.com/490-bcdp.html)
- [Synigo: Dell R730 GPU installation kit 490-BCKS listing](https://www.synigo.com/dell-r730-gpu-installation-kit/cat-p/c36118/p8585019/l_en)
- [Dangerous Things forum: R720 riser card power to RTX 3060 GPUs](https://forum.dangerousthings.com/t/r720-riser-card-power-to-rtx-3060-gpus/24554)
