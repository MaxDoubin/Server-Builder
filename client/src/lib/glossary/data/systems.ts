/** Systems, storage and hardware terms. */
import type { Term } from "../types";

export const SYSTEMS: Term[] = [
  {
    term: "RAID",
    expansion: "Redundant Array of Independent Disks",
    field: "storage",
    definition:
      "Combining disks so the array survives one or more of them failing, at the cost of some capacity. RAID 5 keeps one parity's worth, RAID 6 two, and mirroring keeps a whole copy.",
    confusion:
      "It is not a backup. It protects against a disk failing and against nothing else: not a deletion, not ransomware, not a controller writing corruption to every member at once. An array survives hardware and a backup survives you.",
    see: ["URE", "rebuild", "ZFS"],
  },
  {
    term: "URE",
    expansion: "Unrecoverable Read Error",
    field: "storage",
    definition:
      "A sector a disk cannot read back. Manufacturers quote a rate, typically one in 10^14 bits for consumer drives and one in 10^15 for enterprise ones.",
    confusion:
      "That figure is a warranty bound, not a measured rate, and field studies consistently find better. The arithmetic behind RAID 5 is dead uses the spec number and reaches near-certainty; the same rebuild with observed rates is under ten per cent. The real objection to a wide RAID 5 is the fortnight-long rebuild window, not the probability.",
    see: ["RAID", "rebuild"],
  },
  {
    term: "rebuild",
    field: "storage",
    definition:
      "Reconstructing a failed disk's contents onto a replacement. A parity array reads every surviving member in full to do it, so the cost grows with the array rather than with the failed disk; a mirror reads only the partner.",
    confusion:
      "The window matters more than the odds. Two weeks at full read load, on disks the same age and from the same batch as the one that just died, is the risk that is not in any URE calculation, because correlated failure is exactly what those calculations assume away.",
    see: ["RAID", "URE", "ZFS"],
  },
  {
    term: "ZFS",
    field: "storage",
    definition:
      "A filesystem and volume manager in one, checksumming every block, taking snapshots cheaply, and resilvering only the blocks actually in use rather than every sector.",
    confusion:
      "The checksums are the part that matters most and gets discussed least. A conventional array can return corrupted data silently because it has no way to know; ZFS detects it and, with redundancy, repairs it.",
    see: ["RAID", "rebuild", "ECC"],
  },
  {
    term: "ECC",
    expansion: "Error-Correcting Code memory",
    field: "hardware",
    definition:
      "Memory with an extra chip per rank, able to correct a single-bit error and detect a double-bit one, and to report both.",
    confusion:
      "The reporting is the underrated half. Without it a machine with failing memory does not announce itself, it just corrupts things occasionally, and the fault is attributed to software for months.",
    see: ["DIMM", "ZFS"],
  },
  {
    term: "DIMM",
    expansion: "Dual In-line Memory Module",
    field: "hardware",
    definition:
      "A memory stick. Registered and load-reduced variants buffer the address lines so a board can carry more of them, which is why server boards take far more memory than desktop ones.",
    confusion:
      "Populating channels evenly matters more than total capacity for bandwidth. Four sticks across four channels beats two larger ones across two, and the difference shows up in anything memory-bound.",
    see: ["ECC", "NUMA"],
  },
  {
    term: "NUMA",
    expansion: "Non-Uniform Memory Access",
    field: "systems",
    definition:
      "On a multi-socket machine, each processor has its own memory attached directly and reaches the other socket's memory across a link. Local access is meaningfully faster than remote.",
    confusion:
      "A virtual machine allocated more memory or cores than one node holds gets split across both, and the resulting latency looks like a mysterious performance regression with no change in configuration to blame.",
    see: ["DIMM", "hypervisor"],
  },
  {
    term: "hypervisor",
    field: "systems",
    definition:
      "The layer that runs virtual machines. Type 1 runs on the hardware directly; type 2 runs as an application on a host operating system.",
    see: ["NUMA", "KVM"],
  },
  {
    term: "KVM",
    field: "systems",
    definition:
      "Two unrelated things that share three letters. In Linux, the Kernel-based Virtual Machine, the hypervisor built into the kernel. In a rack, a keyboard, video and mouse switch.",
    confusion:
      "Context usually settles it, but not always: a sentence about connecting to a server's KVM in a datacenter almost certainly means the console, not the hypervisor.",
    see: ["hypervisor", "IPMI"],
  },
  {
    term: "IPMI",
    expansion: "Intelligent Platform Management Interface",
    field: "operations",
    definition:
      "Out-of-band management: a small always-on controller on the board with its own network interface, able to power the machine on, mount media and give you a console when the operating system is gone.",
    confusion:
      "It is a computer inside your computer with its own firmware and its own vulnerabilities, and it is reachable when the host is off. It belongs on a management network that is genuinely separate, not on a VLAN that routes to everything.",
    see: ["BMC", "DMZ"],
  },
  {
    term: "BMC",
    expansion: "Baseboard Management Controller",
    field: "hardware",
    definition:
      "The physical controller that implements IPMI and the vendor's web console. iDRAC, iLO and IMM are vendors' names for theirs.",
    see: ["IPMI"],
  },
  {
    term: "UEFI",
    expansion: "Unified Extensible Firmware Interface",
    field: "systems",
    definition:
      "The firmware interface that replaced the BIOS, booting from a GPT partition with a filesystem the firmware can read, and supporting Secure Boot.",
    confusion:
      "Legacy or CSM boot mode is still present on much hardware and quietly changes the partition scheme an installer chooses. A machine that will not boot after a disk clone is very often one where the two ends disagree about which mode they are in.",
    see: ["BIOS", "Secure Boot"],
  },
  {
    term: "BIOS",
    field: "systems",
    definition:
      "The older firmware interface, booting from an MBR with a boot loader in the first sector. Superseded by UEFI but still present as a compatibility mode.",
    see: ["UEFI"],
  },
  {
    term: "Secure Boot",
    field: "security",
    definition:
      "Firmware refusing to run a boot loader that is not signed by a key it trusts, so a rootkit cannot insert itself before the operating system starts.",
    confusion:
      "It protects the boot chain and nothing above it. A machine with Secure Boot on and no disk encryption still hands over every file to anyone who removes the drive.",
    see: ["UEFI"],
  },
  {
    term: "CPU",
    expansion: "Central Processing Unit",
    field: "hardware",
    definition:
      "The processor. In a server context the numbers that matter are usually core count, base and boost clocks, cache, and the number of PCIe lanes it provides.",
    confusion:
      "Lane count is the specification most often overlooked and the one that decides what a board can actually carry. A processor with 24 lanes cannot feed two GPUs and an HBA regardless of how many cores it has.",
    see: ["PCIe", "NUMA"],
  },
  {
    term: "PCIe",
    expansion: "Peripheral Component Interconnect Express",
    field: "hardware",
    definition:
      "The bus that connects expansion cards, sold in lane counts. A slot's physical size and its electrical lane count are different things: an x16 slot may be wired for four lanes.",
    confusion:
      "That mismatch is silent. A card in a physically x16 slot wired x4 works and runs at a quarter of the bandwidth, and nothing reports it unless you go looking in lspci.",
    see: ["CPU", "NIC"],
  },
  {
    term: "NIC",
    expansion: "Network Interface Card",
    field: "hardware",
    definition:
      "The network adapter. Server ones offload checksums, segmentation and sometimes encryption, and present multiple queues so traffic spreads across cores.",
    see: ["SFP", "PCIe"],
  },
  {
    term: "SFP",
    expansion: "Small Form-factor Pluggable",
    field: "hardware",
    definition:
      "The modular transceiver cage on switches and NICs. SFP+ carries 10G, SFP28 25G, QSFP+ 40G and QSFP28 100G, with the optic or copper module chosen to match the medium and distance.",
    confusion:
      "Many switches only accept modules they recognise as their own vendor's. A third-party optic that is electrically identical is refused on a code in its EEPROM, which is a commercial decision presented as a compatibility one.",
    see: ["NIC"],
  },
  {
    term: "HBA",
    expansion: "Host Bus Adapter",
    field: "storage",
    definition:
      "A card presenting disks to the operating system directly, without a RAID layer in between. The usual choice for ZFS, which wants to see the physical devices.",
    confusion:
      "A RAID controller in so-called IT mode is the same card with different firmware, and flashing it is a step people skip. Leaving it in RAID mode hides the disks behind single-drive volumes and takes away exactly the visibility ZFS needs.",
    see: ["ZFS", "RAID"],
  },
  {
    term: "PDU",
    expansion: "Power Distribution Unit",
    field: "operations",
    definition:
      "The rack's power strip. Metered ones report draw; switched ones let you power-cycle an outlet remotely.",
    confusion:
      "Two PDUs are only redundancy if they are on separate feeds and every dual-supply device is plugged into both. A rack with two PDUs daisy-chained to one circuit has two power strips.",
    see: ["UPS"],
  },
  {
    term: "UPS",
    expansion: "Uninterruptible Power Supply",
    field: "operations",
    definition:
      "Battery backup that carries the load through a cut long enough for either the generator to start or the systems to shut down cleanly.",
    confusion:
      "Its purpose is a clean shutdown, not continued operation, unless it is sized for one. The batteries also age out on a schedule nobody tracks, and a UPS that has never been load-tested is a device that will fail at the only moment it matters.",
    see: ["PDU"],
  },
  {
    term: "SATA",
    expansion: "Serial ATA",
    field: "hardware",
    definition:
      "The consumer disk interface, 6 Gbit/s per port, one command queue. SAS is the enterprise equivalent with dual porting and deeper queuing.",
    see: ["HBA", "SSD"],
  },
  {
    term: "SSD",
    expansion: "Solid State Drive",
    field: "storage",
    definition:
      "Flash storage with no moving parts. Write endurance is finite and quoted as drive writes per day over the warranty period.",
    confusion:
      "Consumer drives have a fast cache and a much slower sustained rate once it is exhausted, which does not show up in a short benchmark and does show up in a resilver or a large restore.",
    see: ["SATA", "rebuild"],
  },
  {
    term: "NFS",
    expansion: "Network File System",
    field: "storage",
    definition:
      "A file-level network protocol, long the default for Unix-to-Unix sharing. Version 4 folds locking and mounting into one protocol on one port.",
    confusion:
      "Version 3 authenticates by trusting the client's reported user ID. On a network where anyone can plug in a machine, that is not authentication.",
    see: ["SMB"],
  },
  {
    term: "SMB",
    expansion: "Server Message Block",
    field: "storage",
    definition:
      "The Windows file sharing protocol, also spoken by Samba. Version 3 adds encryption and multichannel.",
    confusion:
      "Version 1 is still disabled less often than it should be. It has no meaningful integrity protection and is the vector WannaCry used.",
    see: ["NFS"],
  },
  {
    term: "VM",
    expansion: "Virtual machine",
    field: "systems",
    definition:
      "A whole guest operating system running on virtualised hardware, with its own kernel, its own memory, and virtual devices the hypervisor presents to it. It boots, panics and patches like a physical machine because as far as the guest can tell it is one.",
    confusion:
      "A VM is not a container, and the difference is the kernel. A container shares the host's kernel and isolates a process; a VM brings its own, which is why a VM can run a different operating system and why it costs a gigabyte of memory to do nothing. Sizing follows from that: a guest larger than one NUMA node's share of memory pays for every access that crosses the node.",
    see: ["hypervisor", "KVM", "NUMA"],
  },
  {
    term: "API",
    expansion: "Application Programming Interface",
    field: "systems",
    definition:
      "The documented surface one program offers another: the calls, the arguments they take, and the shape of what comes back. On infrastructure it is usually how a switch, a hypervisor or a certificate authority is driven by something other than a person clicking.",
    confusion:
      "An API being available is not the same as it being safe to automate against. Rate limits, partial failures and non-idempotent calls are the three that bite: a retry after a timeout can perform the same change twice unless the call was designed so that it cannot.",
    see: ["SNMP", "IPMI"],
  },
  {
    term: "T2",
    expansion: "Apple T2 Security Chip",
    field: "hardware",
    definition:
      "A coprocessor in Intel Macs from 2018 onward that owns the storage controller, the Secure Enclave, the boot policy and several of the peripherals. The main CPU reaches the internal SSD through it rather than directly.",
    confusion:
      "Because the T2 owns the controller, the internal storage is not a drive another machine can read. Pulling the SSD out of a T2 Mac gets you a module that only pairs with the logic board it was encrypted against, so a dead board is a dead disk unless the data was somewhere else too.",
    see: ["Secure Boot", "SSD", "UEFI"],
  },
];
