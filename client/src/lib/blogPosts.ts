export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  excerpt: string;
  coverImage: string;
  draft?: boolean;
  content: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "building-hyperscale",
    title: "Building Hyperscale: A 3D Datacenter Simulator",
    date: "2026-02-20",
    tags: ["three.js", "react", "simulation", "servers"],
    excerpt:
      "How I built an immersive 3D datacenter simulation with procedural generation, real-time thermal modeling, and React Three Fiber.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## Why I Built This

I wanted to build something that felt like walking through a real datacenter, not a simplified dashboard or an abstract visualization. The idea was straightforward: what if you could design, build, and operate a server room entirely from your browser?

The project started because I was spending a lot of time working with real rack hardware, cabling, and airflow planning. I wanted a way to prototype datacenter layouts and test ideas visually before committing to physical changes.

## Tech Stack

The foundation is **React Three Fiber**, which gives you the rendering power of Three.js with the component model of React. Every rack, server, and cable is a React component with its own state and lifecycle.

\`\`\`typescript
function Rack3D({ rack, position, isSelected, onSelect }) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (groupRef.current) {
      const targetY = hovered || isSelected ? 0.05 : 0;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y, targetY, 0.15
      );
    }
  });

  return <group ref={groupRef} position={position}>
    {/* Rack contents */}
  </group>;
}
\`\`\`

## Procedural Generation

The most interesting challenge was procedural generation. Each rack needs realistic equipment (servers, switches, storage arrays) placed in valid U-slots with realistic power and thermal profiles.

I used seeded randomization so the same seed always produces the same datacenter layout. The scene is deterministic but still feels organic and varied.

## Thermal Simulation

Every piece of equipment generates heat based on its power draw. Racks accumulate inlet and exhaust temperatures. The visual representation changes accordingly: racks shift from green (cool) through yellow and orange to red (critical).

This ties directly into real datacenter concepts like hot aisle/cold aisle containment and cooling capacity planning.

## What I Learned

Building this project taught me a lot about the relationship between software and physical infrastructure. Datacenter design is not just about putting servers in a room. It is about airflow, power distribution, redundancy, and monitoring. Translating those real constraints into a simulation forced me to understand them deeply.
`,
  },
  {
    slug: "why-homelabs-matter",
    title: "Why Homelabs Matter for Learning Networking",
    date: "2026-02-10",
    tags: ["networking", "homelab", "servers"],
    excerpt:
      "How running real enterprise hardware at home changed the way I learn about networking, systems, and troubleshooting.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Beyond the Textbook

Reading about VLANs and subnetting is one thing. Configuring them on real hardware, breaking something, and spending two hours figuring out why your trunk port is dropping tagged traffic is a completely different experience. That is why I run a homelab.

My homelab currently has 14 TB of RAM and over 500 TB of storage across multiple Dell enterprise servers. It is not a Raspberry Pi cluster or a single tower PC. It is enterprise hardware running enterprise workloads, and that is the point.

## What I Actually Run

The core of the lab is built around Dell servers. I use them for:

- **Virtualization workloads** to simulate multi-site environments
- **Network segmentation testing** with real VLANs, trunking, and inter-VLAN routing
- **Storage experiments** to understand capacity planning, redundancy, and performance
- **Security testing** with isolated segments for controlled lab exercises

## Why Scale Matters

A lot of people ask why I need that much hardware at home. The answer is that real environments are messy. When you only have one server and one switch, everything is simple. When you have multiple systems, multiple network segments, and real data moving between them, you start hitting the problems that professionals deal with every day.

That is where the real learning happens: debugging a routing issue across segments, figuring out why a firewall rule is blocking traffic you expected to pass, or tracing a performance problem through layers of infrastructure.

## Building Good Habits

The homelab also taught me documentation habits. When you have complex infrastructure, you cannot rely on memory. I keep diagrams, runbooks, and change logs. Every time I make a change, I document what I did, why I did it, and how to reverse it if something goes wrong.

These habits carry directly into professional environments. The difference between a good administrator and a great one is often just documentation and discipline.
`,
  },
  {
    slug: "ncl-competition-lessons",
    title: "Lessons from Competing in the National Cyber League",
    date: "2026-01-28",
    tags: ["cybersecurity", "competition", "networking"],
    excerpt:
      "What I learned from reaching the 99th percentile in competitive cybersecurity, and why the process matters more than the ranking.",
    coverImage: "/images/blog-cover-webdev.png",
    content: `
## What NCL Actually Tests

The National Cyber League is not about memorizing textbook definitions. It tests practical skills across categories like network traffic analysis, log investigation, scanning and reconnaissance, password cracking, web application security, and cryptography. Every challenge requires you to actually do the work, not just know the theory.

## How I Approach Challenges

My process for each challenge follows a consistent pattern:

1. **Read the problem carefully.** Most mistakes come from rushing past the details.
2. **Identify what tools and techniques apply.** Is this a packet capture? A log file? A web vulnerability?
3. **Work methodically.** Try the most likely explanation first, verify it, and move on.
4. **Document what you find.** Even during a timed competition, noting your process helps you avoid repeating dead ends.

## Tools I Use Most

- **Wireshark** for packet analysis challenges. Understanding TCP flows, DNS queries, and HTTP headers at the packet level is essential.
- **Nmap** for scanning and reconnaissance. Knowing how to interpret scan results tells you a lot about a target's configuration.
- **Python** for quick scripting when a challenge requires processing data or automating repetitive tasks.
- **Linux command line** for log analysis, file manipulation, and general problem solving.

## What Competitions Teach You

The ranking is nice, but the real value is in the habits you build. Competitions force you to stay calm under pressure, verify your work, and think logically when nothing is working the way you expect.

Those habits translate directly to real-world troubleshooting. When a network goes down at 2 AM, the person who stays methodical and follows evidence is the one who finds the problem.
`,
  },
  {
    slug: "mac-pro-rack-mount-homelab",
    title: "Running a Rack-Mount Mac Pro in a Homelab",
    date: "2026-02-18",
    tags: ["apple", "mac-pro", "servers", "homelab"],
    excerpt:
      "Why I added a rack-mount Mac Pro to my server infrastructure and what it actually brings to the table alongside Dell PowerEdge systems.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## Why a Mac Pro in a Server Rack

Most people do not think of Apple hardware when they think of server rooms. But the 2019 Mac Pro in rack-mount configuration is a legitimate piece of enterprise hardware. It is designed to be mounted in a standard 19-inch rack, it supports ECC memory, and it was built for sustained heavy workloads.

I picked one up because I wanted to see how it holds up in a real lab environment next to my Dell PowerEdge systems. The short answer: it is excellent at certain things and completely wrong for others.

## The Hardware

The rack-mount Mac Pro I run has a 28-core Intel Xeon W, 384 GB of ECC DDR4, and dual AMD Radeon Pro Vega II GPUs. Apple designed the internal layout around airflow, with three massive fans pulling air across the entire system. It is quiet for what it is, and thermals stay very manageable even under sustained loads.

The build quality is on another level compared to typical server hardware. Everything about the chassis feels overengineered. The handles, the mounting rails, the internal PCIe card cages. It is clearly built for a different audience than a PowerEdge, but the precision is impressive.

## Where It Fits

The Mac Pro handles media-heavy workloads that my Dell servers would struggle with. Video transcoding, Xcode builds, and GPU-accelerated compute tasks all benefit from the hardware. If you are running Final Cut Pro pipelines or Compressor jobs in a production environment, the rack-mount Mac Pro makes a lot of sense.

For general server workloads like virtualization, storage, and networking, Dell wins every time. The PowerEdge line is designed for exactly that, and the price-to-performance ratio is not even close. But the Mac Pro fills a gap that Dell cannot, and having both in the same rack gives me flexibility.

## The Reality

Running macOS Server alongside Linux VMs is not as smooth as you might hope. Apple has been slowly pulling back from the server space for years. There is no iDRAC equivalent, no IPMI, and remote management is limited compared to what Dell offers. You are also locked into Apple's hardware ecosystem for upgrades.

But for specific use cases, the rack-mount Mac Pro is hard to beat. It is the best way to run macOS workloads in a rack, and if you need that, nothing else really competes.
`,
  },
  {
    slug: "dell-poweredge-r740-deep-dive",
    title: "Dell PowerEdge R740: The Backbone of My Homelab",
    date: "2026-02-15",
    tags: ["dell", "servers", "homelab", "hardware"],
    excerpt:
      "A deep dive into the PowerEdge R740 and why it is still one of the best platforms for a serious home lab environment.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why the R740

The Dell PowerEdge R740 is a 2U rack server that hits a sweet spot between performance, expandability, and availability on the used market. I have multiple R740s in my lab, and they handle the bulk of my virtualization and storage workloads.

The R740 supports dual Intel Xeon Scalable processors, up to 3 TB of DDR4 ECC memory across 24 DIMM slots, and has room for up to 16 2.5-inch drives or 8 3.5-inch drives depending on the chassis configuration. For a homelab, that kind of flexibility is exactly what you want.

## iDRAC: The Killer Feature

One of the things that separates enterprise servers from consumer hardware is out-of-band management. Dell's iDRAC (Integrated Dell Remote Access Controller) gives you full remote control over the server, even when the OS is not running. You can monitor hardware health, view real-time power consumption, access the console remotely, and even mount virtual media for OS installations.

I cannot overstate how much this matters in a lab environment. When you are testing things and inevitably break an OS installation, being able to remotely access the console and reinstall without physically touching the machine saves hours.

## Storage Configuration

I run my R740s with a mix of SSDs and spinning drives. The front bays hold NVMe and SATA SSDs for VM storage, while a separate chassis extension handles bulk storage on larger drives. The PERC H740P RAID controller handles the hardware RAID, though I have been experimenting with passing drives through to ZFS for more flexibility.

## Noise and Power

The honest truth about running enterprise servers at home is that they are loud and power-hungry. An R740 under load pulls around 400 to 600 watts, and the fans are not subtle. I have spent time tuning fan profiles through iDRAC and making sure the ambient temperature stays reasonable, but it is never going to be silent.

If you are considering one for a homelab, plan for the power bill and the noise. It is worth it for the capabilities, but go in with realistic expectations.

## Getting One

Used R740s are available from resellers and auction sites. Prices vary a lot based on configuration, but you can get a solid base system for a reasonable price and add memory and drives over time. Buy from reputable sellers, check the service tag for warranty status, and inspect the drive backplane before committing.
`,
  },
  {
    slug: "apple-silicon-server-future",
    title: "Could Apple Silicon Replace x86 in the Server Room?",
    date: "2026-02-12",
    tags: ["apple", "servers", "hardware", "mac-pro"],
    excerpt:
      "Apple Silicon changed the laptop game. Here is why it probably will not replace x86 in datacenters any time soon, and what would need to change.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## The Performance Argument

Apple Silicon delivers incredible performance per watt. The M-series chips consistently outperform Intel and AMD in single-threaded workloads while sipping power. If you have used an M-series Mac, you know the difference is real. Fans rarely spin up, battery life is outstanding, and sustained performance is genuinely impressive.

So why not put that efficiency into a server?

## What Servers Actually Need

Server workloads are different from desktop workloads. Servers need massive memory capacity, ECC support at scale, high-bandwidth I/O, and standardized management interfaces. The current Apple Silicon lineup maxes out at 192 GB of unified memory on the M2 Ultra, which sounds like a lot until you realize that a single PowerEdge R740 can hold 3 TB.

Servers also need PCIe lanes for network cards, storage controllers, and accelerators. Apple's approach of integrating everything into the SoC is brilliant for laptops but limiting for servers that need to be configured for specific workloads.

## The Software Problem

Even if Apple built the perfect server chip, the software ecosystem is not ready. The vast majority of server software is built and tested for x86 Linux. Yes, ARM servers exist (AWS Graviton is a great example), but Apple's ARM implementation runs macOS, not Linux. Running Linux on Apple Silicon is possible through projects like Asahi Linux, but it is not production-ready for server workloads.

## What I Think Will Happen

Apple will probably never make a traditional rack-mount server again. But Apple Silicon will continue to find its way into edge computing, media processing pipelines, and development infrastructure. The Mac Pro with Apple Silicon (if and when it arrives) will likely be positioned as a workstation, not a server.

For general-purpose server workloads, x86 (and increasingly ARM via Graviton and Ampere) will remain dominant. The economics and ecosystem are just too established for Apple to disrupt without a fundamentally different approach.

## The Takeaway

Apple Silicon is incredible technology. It just solves a different problem than what most servers need. Understanding that distinction is important for anyone evaluating infrastructure decisions.
`,
  },
  {
    slug: "zfs-on-enterprise-hardware",
    title: "Running ZFS on Dell Enterprise Hardware",
    date: "2026-02-08",
    tags: ["storage", "zfs", "servers", "homelab"],
    excerpt:
      "How I set up ZFS on my Dell PowerEdge servers and why it changed my approach to storage management.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why ZFS

ZFS is a filesystem and volume manager that handles things most filesystems leave to external tools. It does its own RAID (called RAIDZ), snapshots, compression, deduplication, checksumming, and self-healing. Once you use ZFS, going back to traditional RAID controllers and ext4 feels primitive.

The killer feature is data integrity. ZFS checksums every block of data and can detect and correct silent corruption automatically. In a homelab where you are storing data you care about, that matters.

## Setting It Up on a PowerEdge

Running ZFS on Dell hardware requires some decisions. The PERC RAID controller that comes standard with most PowerEdge servers wants to manage the drives itself. For ZFS, you want the OS to see the raw drives. That means either flashing the PERC to IT mode (so it acts as a simple HBA) or using a separate HBA card.

I went with flashing the PERC H330 to IT mode on one of my R740s. The process involves downloading the firmware from Broadcom, booting into the UEFI shell, and running the flash utility. It is straightforward if you follow the steps carefully, but it is permanent (or at least annoying to reverse), so make sure you want ZFS before committing.

## Pool Layout

My main ZFS pool is a RAIDZ2 configuration across 8 drives. RAIDZ2 gives me double parity, meaning I can lose any two drives simultaneously without data loss. For a homelab, that is a good balance between capacity and safety.

I also run a separate pool of mirrored SSDs for VM storage. Mirrors give the best random I/O performance, which is what VMs need most.

\`\`\`bash
zpool create tank raidz2 /dev/sda /dev/sdb /dev/sdc /dev/sdd /dev/sde /dev/sdf /dev/sdg /dev/sdh
zpool create fast mirror /dev/nvme0n1 /dev/nvme1n1
\`\`\`

## Compression and Snapshots

I enable LZ4 compression on all datasets by default. LZ4 is fast enough that it actually improves performance in many cases because you are writing less data to disk. The compression ratios vary by workload, but I typically see 1.3x to 1.8x on general data.

Snapshots are the other game changer. I take automated snapshots every hour and keep daily snapshots for 30 days. Rolling back a VM or recovering a deleted file takes seconds instead of hours.

## Lessons Learned

ZFS rewards careful planning. Choose your pool layout thoughtfully because changing it later means destroying and recreating the pool. Buy drives from different batches to avoid correlated failures. And always have more RAM than you think you need, because ZFS uses memory aggressively for caching.
`,
  },
  {
    slug: "10gbe-networking-homelab",
    title: "Upgrading to 10GbE Networking in a Homelab",
    date: "2026-02-05",
    tags: ["networking", "homelab", "hardware"],
    excerpt:
      "How I moved from gigabit to 10 gigabit Ethernet across my lab and what actually changed in practice.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why 10GbE

Gigabit Ethernet was fine for a while. But once you start moving large VM images, running iSCSI or NFS storage, or doing bulk data transfers between servers, 1 Gbps becomes a real bottleneck. I was regularly saturating my gigabit links during backup windows and VM migrations.

10GbE gives you ten times the bandwidth, obviously, but the practical improvement is even bigger than that sounds. Operations that used to take minutes now take seconds. VM live migrations that were unreliable over gigabit become smooth and fast.

## The Hardware

For the network side, I picked up a used Mellanox ConnectX-3 SFP+ card for each server. These are dual-port 10GbE cards that you can find for very little money on the used market. They are well-supported in Linux with the mlx4 driver and work out of the box on most distributions.

For switching, I am using a Mikrotik CRS309-1G-8S+IN. It has eight SFP+ ports and one gigabit copper port for management. It is not a full L3 switch, but for a homelab it handles 10GbE switching at wire speed and costs a fraction of what Cisco or Arista would charge.

I am using DAC (Direct Attach Copper) cables between the switch and servers. DACs are cheaper than optical transceivers for short runs and work perfectly in a single-rack setup.

## Configuration

The nice thing about 10GbE with SFP+ is that it works exactly like gigabit Ethernet at the OS level. Assign an IP, set up your routes, and go. There is no special configuration needed beyond installing the NIC and connecting the cables.

I did set up jumbo frames (MTU 9000) across the 10GbE network to reduce overhead for large transfers. This requires consistent MTU settings on every device in the path, including the switch, or you will get fragmentation issues that are painful to debug.

## What Changed

The biggest quality-of-life improvement is VM storage. I run NFS datastores for some of my virtualization hosts, and going from gigabit to 10GbE made NFS feel local. Boot times dropped, snapshot operations got faster, and I stopped worrying about storage I/O being a bottleneck.

Backup windows also shrank significantly. A full backup that took 45 minutes over gigabit now finishes in about 5 minutes. That means I can take more frequent backups without impacting other workloads.
`,
  },
  {
    slug: "ipmi-remote-management",
    title: "IPMI and Out-of-Band Management Explained",
    date: "2026-02-02",
    tags: ["servers", "hardware", "networking"],
    excerpt:
      "Why out-of-band management is essential for running servers, and how IPMI and iDRAC actually work under the hood.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What Is Out-of-Band Management

Out-of-band (OOB) management means you can control and monitor a server independently of the main operating system. Even if the OS is crashed, the disk is failed, or the machine is powered off, you can still access the hardware remotely. This is accomplished through a dedicated management controller that has its own network interface, its own processor, and its own firmware.

On Dell servers, this is called iDRAC. On HP servers, it is iLO. On Supermicro, it is IPMI/BMC. The underlying protocol for all of them is IPMI (Intelligent Platform Management Interface), though each vendor adds their own web interface and features on top.

## Why It Matters

In a production environment, walking up to a server to plug in a monitor and keyboard is not always possible. The server might be in a different building, a different city, or a colocation facility where physical access takes time.

In a homelab, it still matters. My servers are in a closet, and I manage them entirely from my desk. If an OS hangs during a kernel update, I can remote into iDRAC, access the virtual console, and fix it without getting up. That might sound like a convenience, but multiply it by dozens of incidents over time and it becomes essential.

## How It Works

The management controller sits on a dedicated ARM processor on the server motherboard. It has its own ethernet port (or shares one with the host via a feature called shared LOM). It runs its own lightweight OS and web server.

When you connect to the iDRAC web interface, you can:

- View hardware health (temperatures, fan speeds, power draw)
- Access a virtual console (like plugging in a monitor remotely)
- Mount virtual media (boot from an ISO stored on your workstation)
- Power cycle the server
- Update firmware
- View system event logs

## Setting It Up

The most important thing is to put your management interfaces on a separate, isolated network. Never put iDRAC or IPMI on the same network as your production traffic. These management interfaces have had security vulnerabilities in the past, and exposing them to the internet is asking for trouble.

I have a dedicated management VLAN that only my administration workstation can reach. The iDRAC interfaces get static IPs on this VLAN, and the firewall blocks all traffic to them from any other segment.

## Practical Tips

Change the default password immediately. Enable HTTPS and disable HTTP. Keep the firmware updated. Set up email alerts for hardware failures so you know about a failed drive before it becomes a failed array. And document the IP addresses and credentials somewhere secure.
`,
  },
  {
    slug: "server-rack-cable-management",
    title: "Cable Management in a Server Rack",
    date: "2026-01-30",
    tags: ["servers", "homelab", "hardware"],
    excerpt:
      "Good cable management is not about aesthetics. It is about airflow, troubleshooting speed, and not hating yourself six months from now.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why It Matters

Cable management in a server rack is one of those things that seems optional until you need to trace a cable at 2 AM during an outage. Or until your servers start overheating because a rats nest of cables is blocking half the airflow through the rack.

I have seen racks where every cable was a mystery. Nobody knew what connected where, and pulling one cable meant risking disconnecting something important. That is what bad cable management looks like in practice.

## My Approach

Every cable in my rack serves a documented purpose. I label both ends of every cable with a label maker, using a consistent naming scheme. The label includes the source device, port, destination device, and port. It takes a few extra minutes during installation, and it saves hours during troubleshooting.

I route power cables on one side of the rack and data cables on the other. This keeps things organized and reduces electromagnetic interference, though at these distances EMI is rarely a real problem.

## Velcro Over Zip Ties

I use velcro straps exclusively, never zip ties. Zip ties seem convenient until you need to add or remove a cable. Then you are cutting zip ties, potentially nicking other cables in the process, and replacing them all. Velcro straps can be opened, adjusted, and resealed in seconds.

## Patch Panels

For Ethernet, I run all connections through a patch panel at the top of the rack. The servers connect to the rear of the patch panel with short cables, and the front of the patch panel connects to the switch with color-coded patch cables. This means I never need to reach behind a server to change a network connection.

## Service Loops

I leave a small service loop of excess cable at each connection point. This gives me enough slack to pull a server forward on its rails for maintenance without disconnecting anything. It also means I can reroute cables if I rearrange equipment.

## Power

Power cables get their own vertical cable manager on the right side of the rack. Each PDU (Power Distribution Unit) is mounted vertically, and power cables run straight from the PDU to the server's power supply. I use C13/C14 cables cut to the right length rather than coiling excess cable.
`,
  },
  {
    slug: "proxmox-vs-esxi",
    title: "Proxmox vs ESXi: Which Hypervisor for a Homelab",
    date: "2026-01-25",
    tags: ["virtualization", "servers", "homelab"],
    excerpt:
      "I have run both Proxmox and VMware ESXi in my lab. Here is how they compare for real workloads.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## The Two Contenders

VMware ESXi has been the gold standard for enterprise virtualization for years. Proxmox VE is the open-source alternative that has been gaining traction, especially in the homelab community. I have run both extensively, and the choice between them depends on what you are optimizing for.

## ESXi: The Enterprise Standard

ESXi is polished. The vSphere client is fast and well-organized. vMotion (live migration) works flawlessly. The ecosystem of third-party tools and integrations is massive. If you are studying for VMware certifications or want to match what most enterprises run, ESXi is the obvious choice.

The downside is licensing. VMware's free tier has become increasingly limited, and the paid licenses are expensive for a homelab. The acquisition by Broadcom has added uncertainty about future pricing and availability. For a lab where you are experimenting freely, licensing friction is a real concern.

## Proxmox: The Open-Source Powerhouse

Proxmox VE is built on Debian Linux with KVM for virtual machines and LXC for containers. It is completely free to use with no feature limitations. The web interface is functional, and you get full command-line access to the underlying Linux system, which means you can do anything the OS can do.

Proxmox also has native ZFS support, which is a big deal if you care about data integrity and storage flexibility. You can create ZFS pools directly from the Proxmox interface and use them for VM storage.

## My Experience

I ran ESXi for a year before switching most of my lab to Proxmox. The switch was driven by three things: licensing costs, ZFS support, and the flexibility of having a full Linux system underneath.

Proxmox handles my workloads just as well as ESXi did. VM performance is effectively identical (both use hardware virtualization). Live migration works, though it requires a shared storage backend. Backups are straightforward with Proxmox Backup Server, which is another free tool from the same team.

## What I Miss from ESXi

The vSphere client is genuinely better than the Proxmox web UI. It is more responsive, more polished, and handles large environments more gracefully. VMware's snapshot management is also more intuitive, and vMotion is slightly more reliable than Proxmox's live migration in my experience.

## Bottom Line

For a homelab, Proxmox wins on value. You get enterprise-class virtualization with no licensing restrictions, native ZFS, and full Linux flexibility. For enterprise environments or certification study, ESXi remains the standard. There is no wrong choice. Pick the one that matches your goals.
`,
  },
  {
    slug: "ecc-ram-explained",
    title: "ECC RAM: What It Is and Why Servers Use It",
    date: "2026-01-22",
    tags: ["hardware", "servers", "storage"],
    excerpt:
      "A practical explanation of ECC memory, why it matters for servers, and when you actually need it.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What ECC Does

ECC stands for Error-Correcting Code. Standard desktop RAM (non-ECC) can detect some memory errors but cannot fix them. ECC RAM adds an extra bit per byte that allows the memory controller to detect and correct single-bit errors automatically, and detect (but not correct) double-bit errors.

Single-bit errors happen more often than you might think. Cosmic rays, electrical noise, and manufacturing imperfections can all flip a bit in memory. On a desktop, this might cause a crash or a corrupted file once in a while. On a server running 24/7 with terabytes of RAM, the probability of a bit flip becomes a near certainty over time.

## Why Servers Need It

Servers store critical data in memory. Database pages, file system caches, VM memory, and application state all live in RAM. A single flipped bit in a database page could corrupt a record. A flipped bit in a file system write could silently damage data on disk.

ECC memory prevents this by catching and fixing errors before they can cause damage. The correction happens transparently, with no performance penalty and no software involvement. The server logs the correction so administrators can monitor memory health, and if a DIMM starts throwing too many errors, it can be replaced before it fails completely.

## The Performance Question

ECC RAM is often slightly slower than non-ECC RAM because of the additional error-checking overhead. In practice, the difference is negligible for server workloads. We are talking about single-digit percentage differences in memory bandwidth, which almost never matters for real applications.

The bigger factor is that server-class ECC DIMMs (RDIMMs and LRDIMMs) run at specific speeds that are often lower than what consumer DDR4 or DDR5 achieves. But servers compensate with more memory channels and more DIMMs, so total bandwidth is usually higher than a consumer system despite the lower per-DIMM speed.

## When You Need It

If you are running workloads where data integrity matters (databases, file servers, ZFS, virtualization), use ECC. ZFS in particular strongly recommends ECC RAM because it relies on the integrity of its in-memory data structures to maintain data consistency.

For a homelab, ECC is a strong recommendation but not an absolute requirement. If you are running ZFS or storing data you care about, get ECC. If you are just experimenting with VMs and do not mind the occasional crash, non-ECC will work, but you are accepting a risk that grows with the amount of RAM in the system.
`,
  },
  {
    slug: "mac-pro-vs-poweredge-comparison",
    title: "Mac Pro vs Dell PowerEdge: An Honest Comparison",
    date: "2026-01-20",
    tags: ["apple", "mac-pro", "dell", "servers"],
    excerpt:
      "Two very different approaches to rack-mount hardware. Here is how the Mac Pro and PowerEdge compare for real workloads.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## Different Tools for Different Jobs

Comparing a Mac Pro to a Dell PowerEdge is a bit like comparing a sports car to a truck. They are both vehicles, but they are designed for fundamentally different purposes. That said, they both live in my rack, so I have direct experience with each.

## Build Quality

The Mac Pro wins here, and it is not close. The aluminum chassis, the precision machining, the slide-in handles, everything about the physical hardware feels premium. Dell servers are built to be functional and cost-effective. They get the job done, but nobody is going to admire the craftsmanship of a PowerEdge chassis.

That said, the Mac Pro costs five to ten times more than an equivalent PowerEdge, so the build quality better be exceptional.

## Expandability

The PowerEdge R740 supports up to 3 TB of RAM across 24 DIMM slots. The Mac Pro tops out at 1.5 TB across 12 slots. For virtualization workloads where memory is the primary constraint, Dell wins decisively.

Storage is similar. The R740 supports up to 16 drives in a 2U chassis. The Mac Pro has limited internal storage, and expanding it means using PCIe NVMe cards or external storage.

## Management

iDRAC versus nothing. Dell gives you full out-of-band management with remote console, hardware monitoring, firmware updates, and alerting. The Mac Pro has none of this. You manage it through macOS, and if macOS crashes, you need physical access.

This is probably the biggest practical difference for server use. iDRAC means I can manage my Dell servers from anywhere. The Mac Pro requires me to be in front of it (or use VNC when macOS is running, which is not the same thing).

## Performance

For CPU-heavy server workloads, the PowerEdge with dual Xeon Platinum processors outperforms the Mac Pro's single Xeon W. For GPU-accelerated workloads, the Mac Pro's Radeon Pro Vega II cards are better suited for Apple's Metal framework and media processing pipelines.

## Cost

A used PowerEdge R740 with 512 GB of RAM costs a fraction of what a similarly-equipped Mac Pro costs. If you are building a lab on a budget, Dell is the only sensible choice. If you specifically need macOS in a rack, the Mac Pro is the only option.

## My Recommendation

Buy a PowerEdge for server workloads. Buy a Mac Pro only if you have a specific macOS requirement that justifies the cost. In my lab, the PowerEdges do 90% of the work. The Mac Pro handles the 10% that requires macOS or Apple's GPU ecosystem.
`,
  },
  {
    slug: "ups-sizing-homelab",
    title: "How to Size a UPS for a Home Server Rack",
    date: "2026-01-18",
    tags: ["hardware", "servers", "homelab", "power"],
    excerpt:
      "A practical guide to choosing the right UPS for your servers, including how to calculate your actual power needs.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why You Need a UPS

A UPS (Uninterruptible Power Supply) sits between your servers and the wall outlet. When power drops, the UPS battery kicks in immediately, keeping your servers running long enough to shut down gracefully. Without one, a power outage means your servers lose power instantly, which can corrupt filesystems, damage databases, and kill drives mid-write.

I learned this the hard way early on. A brief power flicker corrupted a ZFS pool that took hours to repair. After that, I invested in proper UPS protection for every piece of equipment in the rack.

## Calculating Your Needs

Step one is measuring your actual power consumption. I use a Kill-A-Watt meter on each server to measure draw under normal load and under peak load. Here is what my rack pulls:

- 2x Dell R740: ~450W each under typical load
- 1x Mac Pro: ~300W under typical load
- 1x Mikrotik switch: ~30W
- Miscellaneous (patch panel lighting, cooling fan): ~50W
- Total typical load: ~1,280W
- Total peak load: ~1,800W

## VA vs Watts

UPS capacity is rated in VA (Volt-Amps) and Watts. They are not the same thing. VA is apparent power, and Watts is real power. For server loads (which are mostly resistive), the power factor is typically around 0.8 to 0.9. That means a 2000VA UPS delivers about 1600 to 1800 watts of real power.

Always size based on watts, not VA. And always leave headroom. I target 70% utilization, so for my 1,800W peak load, I need a UPS rated for at least 2,600W (or about 3,000VA).

## Runtime

Runtime is how long the UPS can keep your servers running on battery. For a homelab, you probably do not need hours of runtime. You need enough time for your servers to detect the outage and shut down gracefully. Five to ten minutes is usually sufficient.

I have my servers configured to start a clean shutdown when the UPS signals a power loss. The UPS communicates via USB using NUT (Network UPS Tools) on Linux. The shutdown process takes about two minutes, so my UPS needs to provide at least three to four minutes of runtime at full load.

## My Setup

I run an APC Smart-UPS 3000VA rack-mount unit. It provides about 8 minutes of runtime at my typical load, which is plenty for graceful shutdowns. The rack-mount form factor keeps everything neat, and the network management card lets me monitor it remotely.

The total cost was significant, but it has already saved my data at least three times during power outages. That makes it one of the best investments in the entire lab.
`,
  },
  {
    slug: "vlan-segmentation-guide",
    title: "Network Segmentation with VLANs: A Practical Guide",
    date: "2026-01-15",
    tags: ["networking", "security", "homelab"],
    excerpt:
      "How I use VLANs to segment my home network into isolated zones for security, performance, and sanity.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What VLANs Actually Do

A VLAN (Virtual Local Area Network) lets you split a single physical switch into multiple logical networks. Devices on different VLANs cannot communicate directly, even if they are plugged into the same switch. Traffic between VLANs has to go through a router or layer-3 switch, where you can apply firewall rules and access controls.

This is the foundation of network segmentation, and it is how every serious network separates different types of traffic.

## My VLAN Layout

I run six VLANs in my homelab:

- **VLAN 10: Management.** iDRAC interfaces, switch management, UPS monitoring. Only accessible from my admin workstation.
- **VLAN 20: Servers.** Production server traffic. VMs, storage, and inter-server communication.
- **VLAN 30: User devices.** My workstations, laptops, and phones.
- **VLAN 40: IoT.** Smart home devices that have no business talking to my servers.
- **VLAN 50: Lab/Testing.** Isolated segment for experiments. Deliberately separated so a broken lab config cannot affect the rest of the network.
- **VLAN 99: Guest.** Internet-only access for visitors. No access to any internal resources.

## Trunk Ports and Access Ports

The key to VLANs working is the difference between trunk ports and access ports. An access port belongs to a single VLAN and sends untagged traffic. A trunk port carries traffic from multiple VLANs, with each frame tagged with its VLAN ID.

Between my switches and router, I use trunk ports that carry all VLANs. Server ports are access ports assigned to VLAN 20. User device ports are access ports on VLAN 30. This keeps the configuration clean and predictable.

## Inter-VLAN Routing

Traffic between VLANs goes through my FortiGate firewall. This lets me control exactly what crosses VLAN boundaries. My management VLAN can reach everything. My server VLAN can reach the internet. My IoT VLAN can reach the internet but nothing internal. My guest VLAN is completely isolated except for internet access.

## Why This Matters

Without VLANs, every device on your network can potentially reach every other device. A compromised IoT camera could scan your servers. A guest's infected laptop could reach your NAS. VLANs prevent this by creating boundaries that require explicit permission to cross.

It takes some effort to set up, but once it is running, you have a network that is structured, secure, and much easier to troubleshoot because traffic flows are predictable.
`,
  },
  {
    slug: "fortigate-firewall-homelab",
    title: "Running a FortiGate Firewall in a Homelab",
    date: "2026-01-12",
    tags: ["networking", "security", "homelab", "fortinet"],
    excerpt:
      "Why I chose Fortinet for my home network firewall and how I configured it for a segmented lab environment.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why Fortinet

I chose a FortiGate firewall for my homelab because Fortinet is widely used in enterprise environments, and learning it on real hardware translates directly to professional skills. The FortiOS interface is intuitive once you learn it, and the documentation is thorough.

I picked up a FortiGate 60F, which is designed for small office deployments but has more than enough throughput for a homelab. It supports hardware-accelerated firewall inspection, VPN, IPS (Intrusion Prevention System), and web filtering.

## Initial Setup

The first thing I did was configure the interfaces. The WAN port connects to my ISP modem. The internal ports are configured as a switch group that connects to my core switch. I also created sub-interfaces for each VLAN, so the FortiGate handles inter-VLAN routing and firewall policy enforcement.

\`\`\`
config system interface
  edit "VLAN10-Mgmt"
    set vdom "root"
    set ip 10.0.10.1 255.255.255.0
    set allowaccess ping https ssh
    set interface "internal"
    set vlanid 10
  next
end
\`\`\`

## Firewall Policies

FortiGate firewall policies are evaluated top-to-bottom. Each policy specifies source interface, destination interface, source address, destination address, service, and action (accept or deny). I created explicit policies for every allowed traffic flow and have an implicit deny-all at the bottom.

The key policies in my setup allow management traffic to reach all VLANs, server-to-internet traffic for updates and external services, and user-to-server traffic for specific services. Everything else is denied by default.

## Logging and Monitoring

FortiGate logs every session that matches a firewall policy. I review these logs regularly to understand traffic patterns and catch anything unexpected. The FortiView dashboard gives real-time visibility into what is happening on the network, including top talkers, most-used applications, and threat detections.

## What I Have Learned

Working with a FortiGate taught me how enterprise firewall management actually works. Writing policies forces you to think about traffic flows explicitly. You cannot just allow everything and hope for the best. You have to understand what should be allowed, what should be denied, and why.

The IPS features have also caught real threats. Even in a homelab, there is scanning and probing from the internet, and having a device that detects and blocks it gives you visibility into what is actually happening on your perimeter.
`,
  },
  {
    slug: "server-cpu-selection-guide",
    title: "Choosing the Right Server CPU: Xeon, EPYC, and Apple",
    date: "2026-01-10",
    tags: ["hardware", "servers", "apple"],
    excerpt:
      "A guide to picking the right processor for your server workload, covering Intel Xeon, AMD EPYC, and Apple's approach.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## Intel Xeon

Xeon has been the default server CPU for decades. The current Xeon Scalable lineup (Sapphire Rapids and beyond) offers high core counts, massive memory support, and a mature ecosystem. Every server vendor, every hypervisor, and every enterprise application is tested and certified on Xeon.

For a homelab, used Xeon processors from the previous generation (Cascade Lake, Skylake-SP) offer incredible value. A 24-core Xeon Gold that cost thousands new can be found for a fraction of that on the used market.

The Xeon ecosystem also means broad compatibility. BIOS updates, driver support, and firmware tools are all well-maintained by Intel and the server vendors.

## AMD EPYC

EPYC has disrupted the server market significantly. The current generation offers more cores per socket, more PCIe lanes, and better performance per watt than Xeon in many workloads. AMD's chiplet architecture lets them scale core counts without the yields problems that monolithic designs face.

The downside is that EPYC is newer in the server space, and some enterprise software vendors are still catching up with certification and optimization. That gap is closing fast, but it is worth checking if your specific workloads are validated on EPYC.

For homelabs, EPYC is harder to find used and the platforms (motherboards, etc.) are less common on the secondary market. But if you are buying new, EPYC offers better value than Xeon at most price points.

## Apple Xeon W

The Mac Pro uses Intel's Xeon W processors, which are essentially workstation-class Xeons. They offer high single-threaded performance and large cache sizes, making them good for workloads that do not scale perfectly across many cores.

The limitation is that the Mac Pro only supports a single socket. For workloads that benefit from dual-socket configurations (massive memory capacity, high core counts), Dell and HP platforms with dual Xeon or EPYC chips are the better choice.

## What I Run

My main workloads are virtualization and storage, which benefit from high core counts and memory capacity. I run dual Xeon Gold 6248R processors in my primary R740, giving me 48 cores and 96 threads total. For my workloads, this is more than enough.

If I were building from scratch today, I would seriously consider EPYC for the core count and memory bandwidth advantages. But the used Xeon market is hard to beat on price, and the Dell PowerEdge ecosystem makes it easy to get started.

## The Decision Framework

Pick your CPU based on your actual workload:
- **Virtualization with many VMs:** High core counts matter. EPYC or dual Xeon.
- **Database workloads:** Single-threaded performance matters. Xeon with high boost clocks.
- **Media processing on macOS:** Xeon W in a Mac Pro (or wait for Apple Silicon Mac Pro).
- **Budget homelab:** Used Xeon Gold on a Dell platform. Best value per dollar.
`,
  },
  {
    slug: "hot-cold-aisle-containment",
    title: "Hot and Cold Aisle Containment: Why Airflow Matters",
    date: "2026-01-08",
    tags: ["servers", "datacenter", "hardware"],
    excerpt:
      "The principles behind datacenter cooling and how I apply hot/cold aisle concepts even in a homelab environment.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## The Problem

Servers generate a lot of heat. A single fully loaded PowerEdge R740 can produce over 1,500 BTU per hour. In a datacenter with thousands of servers, managing that heat is the difference between reliable operation and cascading thermal shutdowns.

The fundamental challenge is that you need to deliver cool air to server intakes and remove hot air from server exhausts without the two mixing. If hot exhaust air recirculates back to the intakes, cooling efficiency drops and servers run hotter than they should.

## Hot Aisle / Cold Aisle

The standard approach is to arrange racks in alternating rows so that server intakes face one aisle (cold aisle) and server exhausts face the opposite aisle (hot aisle). Cool air is delivered to the cold aisle through raised floor vents or overhead ducting, and hot air is collected from the hot aisle and returned to the cooling units.

This simple arrangement dramatically improves cooling efficiency because it prevents mixing. Every server gets cool air, and the cooling system only has to deal with concentrated hot air instead of a warm mixture.

## Containment

Taking it further, you can physically enclose either the hot aisle or the cold aisle with doors, curtains, or rigid panels. This is called containment. Cold aisle containment seals the cold aisle so cool air can only go into server intakes. Hot aisle containment seals the hot aisle so hot exhaust is captured and returned to the cooling system directly.

In practice, hot aisle containment is more common because it lets the rest of the room stay cool, which is more comfortable for people working in the space.

## In a Homelab

I only have one rack, so traditional aisle containment does not apply. But the principle still matters. I make sure all my servers face the same direction, with intakes pulling air from the front of the rack and exhausting out the back. The back of the rack faces a wall with adequate clearance for hot air to dissipate.

I also added a small exhaust fan at the top rear of the rack to pull hot air up and out. Combined with blanking panels to fill empty rack space (preventing hot air from recirculating through gaps), this keeps my equipment running at comfortable temperatures even in a closet.

## Key Takeaways

Airflow management is not optional for servers. Hot air recirculation causes thermal throttling, shorter component life, and ultimately failures. Even in a single-rack homelab, filling blank spaces with panels and ensuring consistent airflow direction makes a measurable difference in temperatures.
`,
  },
  {
    slug: "pdu-selection-guide",
    title: "Choosing a PDU for Your Server Rack",
    date: "2026-01-05",
    tags: ["hardware", "servers", "power", "homelab"],
    excerpt:
      "A guide to power distribution units for server racks, from basic power strips to intelligent metered PDUs.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What Is a PDU

A PDU (Power Distribution Unit) is essentially a rack-mountable power strip, but they range from simple to very sophisticated. At the basic level, a PDU takes input power and distributes it across multiple outlets for your servers. At the high end, a smart PDU monitors per-outlet power consumption, supports remote power cycling of individual outlets, and provides environmental monitoring.

## Types of PDUs

**Basic PDU:** A rack-mount power strip. Takes one input, provides multiple outputs. No monitoring, no management. Cheap and reliable.

**Metered PDU:** Adds a display showing total power draw. Useful for knowing how much power your rack is consuming, but no per-outlet visibility.

**Monitored PDU:** Shows per-outlet power consumption via a web interface or SNMP. This is where it gets useful for a serious lab because you can see exactly how much power each server draws.

**Switched PDU:** Everything a monitored PDU does, plus you can remotely power-cycle individual outlets. This is incredibly useful when a server hangs and iDRAC is not responding.

## What I Use

I run two APC metered PDUs in my rack, mounted vertically on opposite sides. Having two PDUs provides redundancy. Each server has dual power supplies, one connected to each PDU. If one PDU fails or needs to be serviced, every server continues running on the other power supply.

The metered display tells me total rack power consumption at a glance, which is useful for tracking power costs and ensuring I am not overloading the circuit.

## Outlet Types

In the US, most server PDUs use C13/C14 connectors for standard equipment and C19/C20 connectors for high-draw devices. Make sure you have enough of each type for your equipment. My R740s use C13 connections, while the UPS input uses a C19/C20.

## Voltage

Running servers on 208V or 240V instead of 120V improves power supply efficiency and reduces current draw per device. Many enterprise PDUs are designed for higher voltage inputs. If your electrical setup supports it, 208V or 240V is the better choice for a rack with multiple servers.

I currently run on 120V because that is what my circuit supports, but if I expand further, rewiring for 240V would be the smart move.
`,
  },
  {
    slug: "wireshark-packet-analysis",
    title: "Practical Packet Analysis with Wireshark",
    date: "2026-01-02",
    tags: ["networking", "cybersecurity", "tools"],
    excerpt:
      "How I use Wireshark for real troubleshooting and competitive cybersecurity, not just looking at pretty packets.",
    coverImage: "/images/blog-cover-webdev.png",
    content: `
## More Than a Packet Viewer

Wireshark is the most powerful network analysis tool available, and it is free. But most people only scratch the surface. They open a capture, scroll through packets, and get overwhelmed by the volume of data. The real power of Wireshark comes from knowing how to filter, follow streams, and extract the information you actually need.

## Capture Filters vs Display Filters

Capture filters limit what Wireshark records. Display filters limit what you see after capture. For troubleshooting, I usually capture everything and use display filters to narrow down. For long-running captures, I use capture filters to avoid filling the disk.

Common display filters I use constantly:

\`\`\`
ip.addr == 10.0.20.5
tcp.port == 443
dns
http.request
tcp.analysis.retransmission
\`\`\`

## Following Streams

When I am troubleshooting a specific connection, I right-click a packet and select "Follow TCP Stream." This reconstructs the entire conversation between two endpoints in order, which is invaluable for understanding what happened in an HTTP request, an SMTP exchange, or any other protocol.

## Competition Use

In NCL competitions, Wireshark challenges typically give you a capture file and ask you to extract specific information. Common tasks include identifying what credentials were transmitted in plaintext, finding DNS queries to suspicious domains, and reconstructing file transfers.

The key to speed in competitions is knowing your filters cold. If you have to look up filter syntax during a timed challenge, you are losing minutes. I practice by generating my own captures in the lab and querying them until the syntax is automatic.

## Coloring Rules

I customize Wireshark's coloring rules to highlight problems immediately. TCP retransmissions get a red background. DNS errors get yellow. RST packets (connection resets) get orange. This means I can open a capture and immediately spot problem areas without reading every packet.

## Export and Scripting

For large-scale analysis, I use tshark (Wireshark's command-line counterpart) to extract specific fields into CSV format, then process the data with Python. This is much faster than scrolling through millions of packets in the GUI.

\`\`\`bash
tshark -r capture.pcap -T fields -e frame.time -e ip.src -e ip.dst -e tcp.dstport -Y "tcp.flags.syn==1" > connections.csv
\`\`\`

## Building Intuition

The best way to get good at packet analysis is to capture your own traffic and study it. Set up a span port on your switch, capture for an hour, and explore what you see. You will learn more about how protocols actually work than any textbook can teach.
`,
  },
  {
    slug: "nmap-scanning-techniques",
    title: "Nmap Scanning Techniques for Network Discovery",
    date: "2025-12-28",
    tags: ["cybersecurity", "networking", "tools"],
    excerpt:
      "How I use Nmap for network discovery and security assessment, with practical examples from my lab environment.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What Nmap Does

Nmap (Network Mapper) is a network scanning tool that discovers hosts, services, and vulnerabilities on a network. It is the standard tool for network reconnaissance in both legitimate security assessment and competitive cybersecurity.

## Basic Scans

The simplest scan discovers which hosts are up on a network:

\`\`\`bash
nmap -sn 10.0.20.0/24
\`\`\`

This sends ICMP echo requests and ARP requests to every address in the subnet and reports which ones respond. It is fast and non-intrusive. I use it regularly to audit what devices are on each VLAN.

## Port Scanning

A port scan checks which TCP or UDP ports are open on a target:

\`\`\`bash
nmap -sS -p- 10.0.20.5
\`\`\`

The \`-sS\` flag does a SYN scan (half-open scan), which is faster and less likely to be logged than a full TCP connection. The \`-p-\` flag scans all 65,535 ports. Without it, Nmap only scans the top 1,000 ports by default.

## Service Detection

Once you know which ports are open, service detection tells you what is actually running:

\`\`\`bash
nmap -sV -p 22,80,443,3306 10.0.20.5
\`\`\`

This connects to each open port and analyzes the response to determine the service name and version. It is incredibly useful for inventory and for finding outdated software versions.

## OS Detection

Nmap can identify the operating system of a target by analyzing how it responds to specific network probes:

\`\`\`bash
nmap -O 10.0.20.5
\`\`\`

This is based on TCP/IP stack fingerprinting. Different operating systems implement TCP slightly differently, and Nmap maintains a database of these fingerprints.

## In Competition

NCL and similar competitions often present scenarios where you need to discover services, identify versions, and find vulnerabilities. Knowing Nmap well means you can complete the reconnaissance phase quickly and move on to the actual challenge.

The most important habit is to always scan methodically. Do a host discovery first, then port scan the live hosts, then do service detection on open ports. Jumping straight to a full scan of everything wastes time and generates noise.

## Lab Practice

I regularly scan my own lab environment to practice and to verify my security posture. If a port is open that should not be, I want to know about it. Nmap is the fastest way to validate that my firewall rules are working as intended.
`,
  },
  {
    slug: "mac-pro-2019-teardown-analysis",
    title: "Inside the 2019 Mac Pro: Engineering Analysis",
    date: "2025-12-25",
    tags: ["apple", "mac-pro", "hardware"],
    excerpt:
      "A look at what makes the 2019 Mac Pro's internal design unique compared to traditional server hardware.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## The Design Philosophy

The 2019 Mac Pro is the most repairable and upgradeable Mac ever made, which is ironic given Apple's reputation for sealed devices. Every component is user-accessible. RAM, storage, PCIe cards, and even the processor can be replaced or upgraded. The internal layout is clean, logical, and clearly designed by engineers who care about serviceability.

## Airflow System

The cooling system uses three large fans at the front of the chassis that pull air across the entire system. Air flows front-to-back, passing over the RAM, CPU, and PCIe cards in sequence. The fan speed is dynamically controlled based on thermal sensors throughout the system.

What makes it interesting is the scale of the fans. Instead of many small fans (like you see in a Dell PowerEdge), Apple uses fewer but larger fans. Larger fans move more air at lower RPMs, which means the Mac Pro is remarkably quiet for a system of its power class.

## The MPX Module System

Apple's MPX (Mac Pro Expansion) module system provides both PCIe and auxiliary power through a single connector. Standard PCIe cards work in the Mac Pro, but Apple's MPX modules (like the Radeon Pro Vega II) get additional power and Thunderbolt connectivity through the custom connector.

This is clever engineering. It means GPU cards can draw much more power than the standard PCIe specification allows, which enables Apple to use high-power professional GPUs without external power cables.

## Memory Architecture

The Mac Pro supports up to 1.5 TB of DDR4 ECC memory across 12 DIMM slots. The memory is arranged in a six-channel configuration, which provides massive bandwidth. Apple uses industry-standard R-DIMMs, so you can buy memory from any server memory supplier.

## Compared to Traditional Servers

The biggest difference is density. A PowerEdge R740 packs dual processors, 24 DIMM slots, and 16 drive bays into a 2U chassis. The Mac Pro is a full tower (or 5U in rack-mount form) with a single processor and fewer DIMM slots. You give up density for noise, thermal management, and build quality.

For datacenter use where density matters, the Mac Pro loses. For a lab or studio environment where noise and quality of life matter, the Mac Pro is in a league of its own.
`,
  },
  {
    slug: "linux-server-hardening",
    title: "Linux Server Hardening: The Basics That Matter",
    date: "2025-12-22",
    tags: ["cybersecurity", "linux", "servers"],
    excerpt:
      "The fundamental security configurations I apply to every Linux server in my lab, and why each one matters.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Start with Updates

The single most important thing you can do for server security is keep it updated. Unpatched vulnerabilities are how most systems get compromised. I run unattended-upgrades on all my Debian/Ubuntu servers for security patches, and I schedule a maintenance window monthly for larger updates that require reboots.

\`\`\`bash
apt update && apt upgrade -y
apt install unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
\`\`\`

## SSH Configuration

SSH is usually the primary way you access a server, which makes it the primary target for attackers. My SSH hardening configuration:

- Disable root login: \`PermitRootLogin no\`
- Use key-based authentication only: \`PasswordAuthentication no\`
- Change the default port (not security, but reduces noise)
- Limit which users can SSH in: \`AllowUsers maxdoubin\`
- Use fail2ban to block brute force attempts

## Firewall

I use ufw (Uncomplicated Firewall) or iptables depending on the distribution. The principle is simple: deny everything by default, then explicitly allow only the traffic you need.

\`\`\`bash
ufw default deny incoming
ufw default allow outgoing
ufw allow from 10.0.10.0/24 to any port 22
ufw enable
\`\`\`

This allows SSH only from my management VLAN and blocks everything else inbound.

## User Management

Every person gets their own account. No shared accounts, no sharing passwords. Sudo is configured so users can elevate privileges when needed, and all sudo usage is logged.

I also disable any accounts that are not actively needed. Default service accounts that ship with the OS or installed packages get locked.

## Logging

I send all system logs to a central syslog server using rsyslog. This means that even if a server is compromised and the attacker clears local logs, the copies on the syslog server are intact.

Log everything. Disk space is cheap. Missing logs during an incident investigation is expensive.

## File Permissions

Review file permissions on sensitive files. \`/etc/shadow\` should only be readable by root. SSH keys should be 600. Configuration files should not be world-readable if they contain credentials.

These are basics, but basics done consistently are more valuable than advanced techniques done sporadically.
`,
  },
  {
    slug: "active-directory-homelab",
    title: "Setting Up Active Directory in a Homelab",
    date: "2025-12-18",
    tags: ["servers", "networking", "windows"],
    excerpt:
      "How I set up a full Active Directory domain in my lab to practice enterprise identity management.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why Active Directory

Active Directory (AD) is Microsoft's directory service, and it is the backbone of identity management in most enterprise environments. Understanding how AD works, how to configure it, and how to troubleshoot it is essential for anyone working in enterprise networking or cybersecurity.

I set up a full AD domain in my homelab to practice in an environment where mistakes are safe and learning is the priority.

## The Setup

My AD lab runs on two Windows Server 2022 VMs. One is the primary domain controller, and the other is a secondary domain controller for redundancy. Both are running DNS, which is required for AD to function.

The domain is a standard .local domain (not best practice for production, but fine for a lab). I created organizational units (OUs) for servers, workstations, and users, and applied different Group Policy Objects (GPOs) to each.

## Group Policy

Group Policy is where AD gets powerful. GPOs let you enforce configuration across every machine and user in the domain. I have policies for:

- Password complexity and rotation requirements
- Disabling USB storage on workstations
- Configuring Windows Firewall settings
- Deploying software packages automatically
- Restricting which users can log into specific machines

The GPO inheritance model takes some time to understand, but once you get it, you can manage hundreds of machines from a single console.

## DNS Integration

AD depends heavily on DNS. Every domain controller registers SRV records that clients use to find the DC. If DNS is broken, AD is broken. I learned this the hard way when a misconfigured DNS forwarder caused domain joins to fail. The error messages were unhelpful, and it took significant time to trace the problem back to DNS.

Always check DNS first. If AD is not working, DNS is the most likely culprit.

## Security Considerations

AD is a prime target in real-world attacks. Compromising a domain controller means owning the entire domain. In my lab, I practice common attack techniques (in an isolated environment) to understand how they work and how to defend against them. Kerberoasting, pass-the-hash, and DCSync are all things that work if AD is not configured carefully.

Understanding the attacks makes me better at configuring the defenses.
`,
  },
  {
    slug: "sfp-transceivers-explained",
    title: "SFP, SFP+, and QSFP: Transceivers Explained",
    date: "2025-12-15",
    tags: ["networking", "hardware"],
    excerpt:
      "A practical guide to network transceivers, DAC cables, and fiber optics for server networking.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What Transceivers Do

Network transceivers convert electrical signals from your switch or NIC into optical signals for fiber cables (or into electrical signals for copper cables). They plug into SFP (Small Form-factor Pluggable) slots on your networking equipment and provide the physical layer connection.

## SFP vs SFP+ vs QSFP28

**SFP** supports speeds up to 1 Gbps. This is the original standard, still used for 1 gigabit fiber connections and some legacy equipment.

**SFP+** supports speeds up to 10 Gbps. This is what most 10GbE networking uses. SFP+ slots are backward-compatible with SFP modules, but not the other way around.

**QSFP28** supports 100 Gbps. This is used for spine/leaf datacenter fabrics and high-performance computing. A single QSFP28 port can also be broken out into 4x25 Gbps connections.

## Fiber vs Copper

For distances under 5 meters, DAC (Direct Attach Copper) cables are the cheapest and simplest option. A DAC cable has transceivers permanently attached to both ends. They are passive, require no configuration, and work in any SFP+ slot.

For distances between 5 and 300 meters, multimode fiber with SR (Short Range) transceivers is the standard. You need separate transceivers for each end and a fiber patch cable between them.

For distances over 300 meters, single-mode fiber with LR (Long Range) transceivers is required. These are more expensive but can reach up to 10 kilometers.

## Third-Party vs OEM

Cisco, Juniper, and other vendors sell their own branded transceivers at premium prices. Third-party transceivers from companies like Finisar (now II-VI) or generic options from Amazon work identically in most cases at a fraction of the cost.

Some switches check for OEM transceivers and will display warnings or refuse to use third-party modules. Cisco is notorious for this. The workaround is usually a CLI command to accept non-certified transceivers:

\`\`\`
service unsupported-transceiver
\`\`\`

## My Setup

In my homelab, I use Mellanox ConnectX-3 NICs with generic DAC cables. Everything is within a single rack, so DAC is perfect. The total cost for 10GbE connectivity was a fraction of what it would cost with fiber and OEM transceivers. For a homelab, there is no reason to pay more.
`,
  },
  {
    slug: "backup-strategy-321-rule",
    title: "The 3-2-1 Backup Rule and How I Implement It",
    date: "2025-12-12",
    tags: ["storage", "servers", "homelab"],
    excerpt:
      "A practical guide to implementing a real backup strategy using the 3-2-1 rule with enterprise hardware.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## The Rule

The 3-2-1 rule is simple: keep at least 3 copies of your data, on at least 2 different types of media, with at least 1 copy offsite. It has been the gold standard for backup strategy for decades, and it works.

In practice, this means your data exists on your primary storage, a local backup, and a remote backup. If any single thing fails (a drive, a server, a fire), you still have copies.

## My Implementation

**Copy 1: Primary storage.** My data lives on ZFS pools across my Dell servers. ZFS provides checksumming and RAIDZ2 redundancy, so it handles drive failures gracefully. But RAID is not a backup. If I accidentally delete a file, RAID will happily delete it from every drive.

**Copy 2: Local backup.** I use Proxmox Backup Server to take daily backups of all VMs and LXC containers. These backups are stored on a separate server with its own ZFS pool. The backups are deduplicated and compressed, so storage efficiency is excellent.

**Copy 3: Offsite backup.** Critical data is replicated to an offsite location using ZFS send/receive over an encrypted SSH tunnel. This handles the scenario where my entire lab is physically destroyed (fire, theft, natural disaster).

## Testing Backups

A backup you have never tested is not a backup. I schedule quarterly restore tests where I pick a random VM backup and restore it to a test environment. If the restore works and the VM boots cleanly, the backup is valid. If it does not, I fix the backup process immediately.

## Retention

I keep daily backups for 30 days, weekly backups for 12 weeks, and monthly backups for 12 months. This gives me flexibility to recover from problems that are discovered long after they occurred. A ransomware infection that encrypted files two weeks ago would need a backup from before the infection.

## Automation

All of this is automated. Backups run on schedules, retention policies are enforced automatically, and I get email alerts if a backup fails. The only manual part is the quarterly restore test, and even that could be automated if I wanted to invest the time.
`,
  },
  {
    slug: "network-monitoring-tools",
    title: "Network Monitoring Tools I Actually Use",
    date: "2025-12-08",
    tags: ["networking", "tools", "homelab"],
    excerpt:
      "A practical look at the monitoring tools running in my homelab and what each one tells me about my network.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why Monitor

You cannot fix what you cannot see. Without monitoring, you find out about problems when something breaks. With monitoring, you find out about problems before they break anything, and you have data to diagnose the root cause quickly.

## Grafana + Prometheus

This combination is the backbone of my monitoring stack. Prometheus scrapes metrics from exporters running on each server (CPU, memory, disk, network) and stores them in a time-series database. Grafana visualizes those metrics on dashboards.

I have dashboards for per-server resource usage, ZFS pool health, network interface traffic, and UPS status. Each dashboard has alerts configured so I get notified if a metric crosses a threshold (like disk usage exceeding 85% or UPS battery dropping below 50%).

## SNMP Monitoring

My switches and FortiGate export metrics via SNMP (Simple Network Management Protocol). I use the Prometheus SNMP exporter to pull these into the same monitoring stack. This gives me visibility into switch port utilization, error counters, and CPU usage on network devices.

SNMP is not the most modern protocol, but it is universally supported by network equipment and provides consistent access to device metrics.

## Uptime Monitoring

I use a simple tool that pings every critical device every 60 seconds and alerts if anything goes down. It is basic, but knowing that your DNS server is unreachable before your users tell you is valuable.

## Log Aggregation

All syslog data flows to a central log server running rsyslog. I can search across all servers from a single interface, which is essential for troubleshooting issues that span multiple systems.

## The Dashboard

My main Grafana dashboard shows a high-level view of the entire lab: all servers, all network devices, storage capacity, and any active alerts. I check it once a day, and if anything is yellow or red, I investigate. This proactive approach has caught failing drives, memory errors, and network issues before they caused outages.
`,
  },
  {
    slug: "thunderbolt-networking",
    title: "Thunderbolt Networking: Apple's Approach to High-Speed Connectivity",
    date: "2025-12-05",
    tags: ["apple", "networking", "hardware"],
    excerpt:
      "How Thunderbolt networking works, where it fits, and why it is both brilliant and frustrating for mixed environments.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What Thunderbolt Networking Is

Thunderbolt supports native IP networking when you connect two Macs with a Thunderbolt cable. The connection appears as a standard network interface, and you get speeds up to 10 Gbps (Thunderbolt 3/4) with extremely low latency. No switches, no transceivers, no configuration beyond plugging in a cable.

For direct Mac-to-Mac file transfers, it is the fastest option available. Thunderbolt Bridge in macOS makes it completely transparent to applications.

## Where It Works

Thunderbolt networking is fantastic for specific scenarios: editing teams working with shared storage, direct transfers between workstations, and high-speed connections between a Mac Pro and a NAS. In a creative studio environment, it solves a real problem elegantly.

In my lab, I have used Thunderbolt networking between my Mac Pro and a Mac Mini for fast data transfers during media processing workflows. The speed is impressive and the latency is nearly zero.

## Where It Falls Short

Thunderbolt networking is point-to-point. You cannot build a network fabric with Thunderbolt. There are no Thunderbolt switches. If you need to connect more than two devices, you need to use standard Ethernet.

It is also Apple-only in practice. While Thunderbolt is technically an Intel/Apple standard that is now part of USB4, the native networking feature is a macOS thing. You cannot use Thunderbolt networking between a Mac and a Linux server.

## My Take

Thunderbolt networking is a great tool for specific problems, and a terrible general-purpose networking solution. I use it when I need fast direct connections between Apple devices, and I use 10GbE for everything else.

The ideal setup, which is what I have, is both. My Mac Pro has a Mellanox 10GbE card for connecting to the general network and a Thunderbolt port for direct connections when I need the extra speed.
`,
  },
  {
    slug: "cisco-switching-fundamentals",
    title: "Cisco Switching Fundamentals Every Network Engineer Needs",
    date: "2025-12-01",
    tags: ["networking", "cisco", "homelab"],
    excerpt:
      "The core switching concepts I learned on Cisco hardware and use every day in my lab environment.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why Cisco

Cisco is still the most widely deployed networking vendor in enterprise environments. Learning Cisco CLI, IOS configuration, and Cisco-specific features is directly transferable to real-world jobs. I run Cisco switches in my lab for exactly this reason.

## The CLI

Cisco IOS uses a hierarchical CLI with different privilege levels. You start in user EXEC mode, move to privileged EXEC mode with \`enable\`, and enter configuration mode with \`configure terminal\`. Every configuration change happens in this global configuration mode or a sub-mode.

\`\`\`
Switch> enable
Switch# configure terminal
Switch(config)# hostname LabSwitch
LabSwitch(config)# exit
\`\`\`

The CLI is text-based and powerful. Once you learn the command structure, configuration is fast and repeatable.

## Spanning Tree Protocol

STP prevents loops in switched networks. Without STP, a single cable plugged into two ports on the same switch would create a broadcast storm that takes down the entire network. I have seen it happen in lab environments, and it is not subtle. The network goes from working to completely dead in seconds.

Understanding STP means knowing which switch is the root bridge, how path costs determine which ports forward and which ports block, and how convergence works when the topology changes.

## Port Security

Port security limits which MAC addresses can use a switch port. In a lab, I use it to prevent unknown devices from connecting to sensitive VLANs. In production environments, it is a basic access control mechanism.

\`\`\`
LabSwitch(config-if)# switchport port-security
LabSwitch(config-if)# switchport port-security maximum 2
LabSwitch(config-if)# switchport port-security violation restrict
\`\`\`

## EtherChannel

EtherChannel bundles multiple physical links into a single logical link. This provides both increased bandwidth and redundancy. If one physical link fails, the EtherChannel continues working on the remaining links.

I use LACP (Link Aggregation Control Protocol) EtherChannels between my switches to provide 2 Gbps aggregated links with automatic failover.

## Saving Configuration

One of the most common mistakes on Cisco switches is forgetting to save the configuration. The running configuration is in memory and will be lost if the switch reboots. Always save with \`copy running-config startup-config\` or the shorthand \`write memory\`.
`,
  },
  {
    slug: "dell-idrac-tips-tricks",
    title: "Dell iDRAC Tips and Tricks for Power Users",
    date: "2025-11-28",
    tags: ["dell", "servers", "hardware"],
    excerpt:
      "Advanced iDRAC features that most people overlook, from virtual console to automated alerts and firmware management.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Beyond the Basics

Most people use iDRAC for its virtual console and power controls. But iDRAC 9 has features that make server management significantly easier if you take the time to set them up.

## Virtual Media

Virtual Media lets you mount an ISO file from your workstation to the server's virtual optical drive. This means you can install an operating system remotely without burning a disc or plugging in a USB drive. I use this constantly for OS installations and recovery boot media.

To use it, open the virtual console, go to Virtual Media, and map your local ISO file. The server sees it as a physical DVD drive.

## Automated Alerts

iDRAC can send email alerts for hardware events: disk failures, memory errors, temperature warnings, power supply issues, and more. Configure SMTP settings in iDRAC and select which events trigger alerts.

I have alerts configured for anything that indicates a hardware problem. Getting an email about a predictive disk failure gives me time to order a replacement before the drive actually dies.

## Firmware Updates

iDRAC can update server firmware (BIOS, iDRAC itself, drive firmware, NIC firmware) from its web interface. Dell hosts a firmware catalog that iDRAC can check against your current versions and identify what needs updating.

I schedule firmware reviews quarterly. Keeping firmware current prevents known bugs and closes security vulnerabilities.

## Performance Monitoring

The built-in performance monitoring shows real-time and historical CPU, memory, I/O, and power usage. This data is useful for capacity planning and for correlating performance issues with specific hardware events.

## Lifecycle Controller

The Lifecycle Controller is a separate environment built into iDRAC that provides hardware diagnostics, OS deployment tools, and RAID configuration. It boots independently of the OS and does not require any installed software. It is essentially a built-in recovery environment that is always available.

## RACADM

For scripting and automation, RACADM is iDRAC's command-line interface. You can configure every iDRAC setting via RACADM commands, which means you can script the setup of multiple servers identically.

\`\`\`bash
racadm set iDRAC.NIC.DNSRacName LabServer01
racadm set iDRAC.IPMILan.AlertEnable Enabled
racadm set iDRAC.Users.2.Password NewSecurePassword
\`\`\`

This is how I configure iDRAC on new servers. Run the script, and every setting is applied consistently.
`,
  },
  {
    slug: "mac-pro-storage-expansion",
    title: "Expanding Storage on the Mac Pro",
    date: "2025-11-25",
    tags: ["apple", "mac-pro", "storage", "hardware"],
    excerpt:
      "The options for adding storage to a Mac Pro, from internal NVMe to Thunderbolt expansion and network-attached storage.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## The Challenge

The Mac Pro does not have traditional drive bays like a PowerEdge. Internal storage options are limited to Apple's proprietary SSD modules and PCIe NVMe cards. If you need significant storage capacity, you need to look beyond the chassis.

## Internal Options

The Mac Pro has two proprietary SSD slots that support Apple's T2-connected SSDs up to 8 TB. These are fast (around 2.8 GB/s read) but expensive. You can also install standard M.2 NVMe drives using PCIe adapter cards in the Mac Pro's PCIe slots. I use a Sonnet M.2 4x4 adapter that holds four NVMe drives in a single PCIe slot.

This gives me fast local storage for active projects without paying Apple's premium for their proprietary modules.

## Thunderbolt Storage

For larger capacity, Thunderbolt 3 external enclosures provide high-speed connectivity. A multi-bay Thunderbolt enclosure with RAID can deliver sustained read/write speeds of 1.5 GB/s or more, which is fast enough for most production workloads.

I use a Thunderbolt RAID enclosure with four 18 TB drives in RAID 5 for media storage. It connects to the Mac Pro at full Thunderbolt 3 speed and appears as a local volume in macOS.

## Network Storage

For bulk storage that needs to be accessible from multiple machines, NFS and SMB shares from my Dell servers are the best option. The Mac Pro connects to my ZFS storage server over 10GbE, which provides close to 1 GB/s sustained throughput.

macOS works well with NFS shares if you configure the mount options correctly. I use automount with specific NFS options tuned for performance:

\`\`\`
nfs://10.0.20.10/storage/media -o rw,resvport,nfc,hard,intr
\`\`\`

## The Hierarchy

My storage hierarchy mirrors what you would see in a professional post-production environment: fast internal NVMe for active projects, Thunderbolt RAID for near-line storage, and network storage for archive and bulk data. Each tier balances speed, capacity, and cost differently.
`,
  },
  {
    slug: "subnetting-practical-guide",
    title: "Subnetting Made Practical: A Real-World Guide",
    date: "2025-11-22",
    tags: ["networking", "homelab"],
    excerpt:
      "How I think about subnetting in practice, with real examples from my network instead of textbook exercises.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why Subnetting Matters

Subnetting divides a large network into smaller, more manageable segments. Each subnet is its own broadcast domain, which means broadcast traffic stays within the subnet instead of flooding the entire network. This improves performance, security, and manageability.

In my lab, subnetting is how I give each VLAN its own address space and control routing between them.

## CIDR Notation

CIDR (Classless Inter-Domain Routing) notation uses a slash followed by the number of bits in the network portion of the address. A /24 network has 256 addresses (254 usable). A /25 has 128 (126 usable). A /28 has 16 (14 usable).

The quick mental math: start with 32, subtract the CIDR number, raise 2 to that power. That is your total addresses. Subtract 2 for network and broadcast.

## My Network Layout

I use 10.0.0.0/8 as my overall private address space, divided into /24 subnets for each VLAN:

- 10.0.10.0/24 for management (254 usable addresses, way more than I need, but clean)
- 10.0.20.0/24 for servers
- 10.0.30.0/24 for user devices
- 10.0.40.0/24 for IoT
- 10.0.50.0/24 for lab/testing
- 10.0.99.0/24 for guests

Using the third octet to match the VLAN ID makes the addressing scheme intuitive. If I see an IP starting with 10.0.40, I immediately know it is an IoT device.

## VLSM in Practice

Variable Length Subnet Masking (VLSM) lets you use different subnet sizes within the same network. My management VLAN only has about 15 devices, so a /24 is wasteful. I could use a /28 (14 usable) and conserve address space.

In practice, I keep everything at /24 because simplicity matters more than address conservation in a private network. If I were designing a public-facing network with limited IP space, VLSM would be essential.

## Common Mistakes

The most common subnetting mistake I see is overlapping subnets. If two VLANs have overlapping address ranges, routing breaks in confusing ways. Always plan your subnet layout on paper before configuring anything, and make sure every subnet uses a non-overlapping range.

The second most common mistake is forgetting the gateway. Every subnet needs a gateway address (usually .1) configured on the router or L3 switch for inter-subnet traffic to work.
`,
  },
  {
    slug: "server-bios-configuration",
    title: "Server BIOS Settings That Actually Matter",
    date: "2025-11-18",
    tags: ["servers", "hardware", "performance"],
    excerpt:
      "The BIOS settings I configure on every server and why each one makes a difference for performance and reliability.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why BIOS Settings Matter

Server BIOS settings control how the hardware behaves at the lowest level. A misconfigured BIOS can leave performance on the table, cause stability issues, or create security vulnerabilities. Most people never touch BIOS settings after initial setup, which means they are running with defaults that may not match their workload.

## System Profile

Dell servers offer system profiles that bundle related settings. The most important choice is between "Performance" and "Performance Per Watt (OS)." Performance mode runs CPUs at maximum frequency regardless of load. Performance Per Watt lets the OS manage frequency scaling, saving power during idle periods.

For virtualization workloads, I use "Performance Per Watt (OS)" because my servers are not constantly under full load. The power savings are real, and the performance impact is minimal because the OS scales frequency up instantly when load increases.

## Memory Settings

Memory interleaving should be enabled for maximum memory bandwidth. This spreads memory access across all channels evenly. I also enable ECC error logging so any memory errors are recorded in the system event log and trigger alerts through iDRAC.

Memory operating mode should be set to "Optimizer Mode" for best performance. "Mirror Mode" provides memory redundancy at the cost of half the usable capacity, which is only worth it for mission-critical production servers.

## Virtualization

If you are running a hypervisor, enable Intel VT-x (or AMD-V) and VT-d (or AMD-Vi). VT-x provides hardware-assisted CPU virtualization, and VT-d enables direct device passthrough to virtual machines. Both are required for modern hypervisors to work at full performance.

## Boot Configuration

Set the boot mode to UEFI rather than Legacy BIOS. UEFI is faster, supports larger disks, and provides Secure Boot capabilities. Unless you are running a very old operating system, there is no reason to use Legacy mode.

## Power Redundancy

If your server has dual power supplies, set the power redundancy policy to "Redundant." This means the server distributes load across both PSUs and can survive the failure of either one. "Non-Redundant" uses all available power capacity but offers no protection against PSU failure.

## Firmware Updates

Keep the BIOS firmware updated. Dell releases BIOS updates that fix bugs, improve stability, and patch security vulnerabilities. Use iDRAC or the Lifecycle Controller to apply updates without needing a bootable USB drive.
`,
  },
  {
    slug: "dns-fundamentals-infrastructure",
    title: "DNS: The Infrastructure Most People Ignore",
    date: "2025-11-15",
    tags: ["networking", "servers", "homelab"],
    excerpt:
      "Why DNS is the most critical piece of network infrastructure and how I run it in my lab.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## DNS Is Everything

If DNS is not working, nothing works. Web browsers cannot resolve domain names. Active Directory cannot find domain controllers. Email cannot route to mail servers. Monitoring systems cannot identify hosts. DNS is the foundation that everything else depends on, and it is the single most common cause of "the network is down" complaints.

## How DNS Works

DNS translates human-readable domain names into IP addresses. When you type a URL into a browser, your computer asks a DNS resolver for the IP address. The resolver checks its cache, and if it does not have the answer, it queries authoritative DNS servers in a hierarchical process that starts at the root servers and works down through the domain hierarchy.

## My DNS Setup

I run two BIND DNS servers in my lab on separate VMs for redundancy. They serve as authoritative servers for my internal domain and as recursive resolvers for external queries.

Internal DNS means I can access my servers by name instead of IP address. Instead of remembering that the Proxmox host is at 10.0.20.5, I type pve01.lab.local. When I reconfigure IP addresses, I update DNS once instead of updating every configuration file that references the old IP.

## Split DNS

I use split DNS (also called split-horizon DNS) so internal queries resolve to internal addresses and external queries resolve normally. My FortiGate handles this by directing DNS queries from internal VLANs to my internal DNS servers, while guest VLAN queries go directly to public DNS.

## Common Problems

The most common DNS issue I troubleshoot is stale records. If a server gets a new IP but the DNS record still points to the old one, connections fail in confusing ways. I handle this with short TTLs (time to live) on internal records, so changes propagate quickly.

The second most common issue is DNS forwarding misconfiguration. If your internal DNS server cannot resolve external domains because the forwarder is misconfigured, your servers cannot reach the internet for updates, NTP, or anything else.

## Testing DNS

I test DNS configurations with \`dig\` and \`nslookup\`. Both tools query DNS servers and show the response, including which server answered, the TTL, and the record type.

\`\`\`bash
dig @10.0.20.10 pve01.lab.local
nslookup pve01.lab.local 10.0.20.10
\`\`\`

Always test from the perspective of the client that is having the problem. DNS issues are often specific to which resolver a client is using.
`,
  },
  {
    slug: "xserve-apple-server-legacy",
    title: "The Apple Xserve: A Look at Apple's Server Legacy",
    date: "2025-11-12",
    tags: ["apple", "servers", "hardware", "history"],
    excerpt:
      "Apple used to make rack-mount servers. Here is why the Xserve mattered, why Apple killed it, and what it means for the Mac Pro.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## What Was the Xserve

The Apple Xserve was a 1U rack-mount server that Apple sold from 2002 to 2011. It was a real server: rack-mountable, hot-swappable drives, dual processors, ECC memory, and server-grade management tools. Apple paired it with macOS Server and Xsan (a clustered filesystem) to provide a complete Apple-native server stack.

## Why It Mattered

The Xserve was the only Apple product designed specifically for the datacenter. It ran macOS Server, which provided file sharing, directory services (Open Directory), email, web hosting, and other server functions natively on Apple hardware. For organizations running all-Apple environments, the Xserve was the obvious server choice.

Creative studios, universities, and media companies adopted Xserve for render farms, file servers, and collaboration infrastructure. It integrated seamlessly with Mac workstations in ways that Windows or Linux servers could not.

## Why Apple Killed It

Apple discontinued the Xserve in 2011 because the server market is fundamentally different from the consumer market that Apple dominates. Server customers want long product lifecycles, extensive support contracts, standardized management tools, and competitive pricing. Apple wanted to sell premium consumer devices.

The Xserve never achieved the volume needed to justify Apple's investment in server-specific engineering. Dell, HP, and IBM were selling millions of servers. Apple was selling thousands.

## The Mac Pro as Spiritual Successor

The 2019 Mac Pro in rack-mount configuration is the closest thing to a modern Xserve. It fits in a standard rack, supports ECC memory, and can run macOS server workloads. But it is designed as a workstation, not a server. It lacks the server-specific features (hot-swap drives, redundant power supplies, IPMI) that made the Xserve a real server.

## What This Means

Apple has effectively exited the server market. If you need macOS in a rack, the Mac Pro is your only option, and it is an expensive, imperfect one. For everything else, Dell, HP, and Supermicro offer better value, better management, and better support.

The Xserve was ahead of its time in build quality and design. But it was in a market that Apple was never willing to commit to fully. That tension is the story of Apple in the enterprise.
`,
  },
  {
    slug: "raid-levels-comparison",
    title: "RAID Levels Explained: When to Use Each One",
    date: "2025-11-08",
    tags: ["storage", "servers", "hardware"],
    excerpt:
      "A practical comparison of RAID levels with real performance and reliability tradeoffs from my lab experience.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What RAID Does

RAID (Redundant Array of Independent Disks) combines multiple physical drives into a logical unit for performance, redundancy, or both. The RAID level determines how data is distributed across the drives and how many drives can fail before data is lost.

## RAID 0: Speed, No Safety

RAID 0 stripes data across all drives with no redundancy. You get the combined capacity and performance of all drives, but if any single drive fails, all data is lost. I use RAID 0 for temporary scratch space where speed matters and the data is expendable.

## RAID 1: Simple Mirror

RAID 1 mirrors data across two drives. You get the capacity of one drive with the read performance of two. If either drive fails, the other has a complete copy. I use RAID 1 for boot drives on my servers because simplicity and reliability matter more than capacity.

## RAID 5: Balance

RAID 5 stripes data across three or more drives with one drive's worth of parity. Any single drive can fail without data loss. You lose one drive's worth of capacity to parity. RAID 5 is popular but has a dangerous weakness: during a rebuild after a drive failure, a second failure means total data loss. With modern large drives, rebuilds take hours or days.

## RAID 6: Better Safety

RAID 6 is like RAID 5 but with double parity. Any two drives can fail simultaneously without data loss. I prefer RAID 6 over RAID 5 for any array larger than four drives because the probability of a second failure during a rebuild is higher than most people realize.

## RAID 10: Performance and Redundancy

RAID 10 combines mirroring and striping. Pairs of drives are mirrored, and the mirrors are striped together. You get excellent read and write performance with the ability to survive at least one drive failure per mirror pair. The downside is that you lose 50% of your total capacity.

I use RAID 10 for VM storage where I/O performance is the priority. Random read and write performance on RAID 10 is significantly better than RAID 5 or 6.

## Software RAID vs Hardware RAID

Hardware RAID controllers (like Dell's PERC cards) handle RAID in dedicated hardware. Software RAID (like Linux mdadm or ZFS RAIDZ) does it in the CPU. Modern CPUs are fast enough that software RAID performs comparably to hardware RAID for most workloads, and software RAID gives you more flexibility and visibility into what the array is doing.

I use ZFS RAIDZ2 (which is conceptually similar to RAID 6) for my bulk storage and hardware RAID 1 for boot drives.
`,
  },
  {
    slug: "python-network-automation",
    title: "Automating Network Tasks with Python",
    date: "2025-11-05",
    tags: ["networking", "automation", "tools"],
    excerpt:
      "How I use Python to automate repetitive network configuration and monitoring tasks in my lab.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Why Automate

Configuring network devices manually works fine when you have two switches. When you have ten, or twenty, or a hundred, manual configuration becomes error-prone and time-consuming. Automation ensures consistency, saves time, and reduces human error.

In my lab, I use Python to automate configuration backups, monitoring checks, and bulk configuration changes.

## Netmiko for Device Access

Netmiko is a Python library that simplifies SSH connections to network devices. It handles the quirks of different vendors (Cisco, Fortinet, Juniper, etc.) and provides a clean interface for sending commands and receiving output.

\`\`\`python
from netmiko import ConnectHandler

device = {
    "device_type": "cisco_ios",
    "host": "10.0.10.2",
    "username": "admin",
    "password": "securepassword",
}

connection = ConnectHandler(**device)
output = connection.send_command("show running-config")
connection.disconnect()

with open("switch_backup.txt", "w") as f:
    f.write(output)
\`\`\`

This script connects to a Cisco switch, pulls the running configuration, and saves it to a file. I run it nightly on every network device to maintain configuration backups.

## Paramiko for Custom SSH

For tasks where Netmiko's abstraction gets in the way, I use Paramiko directly. Paramiko is the SSH library that Netmiko is built on, and it gives you lower-level control over the SSH connection.

## SNMP with PySNMP

For monitoring, I use PySNMP to query SNMP data from network devices. This lets me pull interface statistics, CPU usage, and environmental data programmatically.

\`\`\`python
from pysnmp.hlapi import *

iterator = getCmd(
    SnmpEngine(),
    CommunityData("public"),
    UdpTransportTarget(("10.0.10.2", 161)),
    ContextData(),
    ObjectType(ObjectIdentity("SNMPv2-MIB", "sysUpTime", 0))
)

errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
for varBind in varBinds:
    print(f"{varBind[0]} = {varBind[1]}")
\`\`\`

## Practical Scripts

My most-used automation scripts:

1. **Config backup:** Connects to every network device and saves the running config. Runs nightly via cron.
2. **Port audit:** Checks which ports are up, which are down, and which have errors. Outputs a report.
3. **VLAN audit:** Pulls VLAN assignments from all switches and checks for inconsistencies.
4. **Uptime check:** Queries sysUpTime from all devices and flags any that have rebooted unexpectedly.

Each script is simple, focused, and reliable. They save me hours of manual checking every week.
`,
  },
  {
    slug: "server-rack-planning",
    title: "Planning a Server Rack: Layout, Power, and Cooling",
    date: "2025-11-01",
    tags: ["servers", "hardware", "homelab"],
    excerpt:
      "How I planned and organized my server rack, from choosing the right size to power distribution and cooling.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Choosing a Rack

Server racks are measured in "U" units, where 1U equals 1.75 inches of vertical space. Common sizes are 42U (full height), 24U (half height), and 12U (quarter height). I run a 42U rack because I knew I would grow into it, and having empty space is better than outgrowing a smaller rack.

Important specifications: make sure it is a standard 19-inch wide rack with a depth of at least 36 inches (preferably 40+) to accommodate deep servers. Weight capacity matters too. A fully loaded R740 weighs about 60 pounds, and a rack full of them needs a frame rated for the load.

## Layout Planning

I planned my rack layout on paper before installing anything. The general rules:

- **Heavy equipment goes at the bottom.** Servers and UPS units are the heaviest items and should be low for stability.
- **Networking equipment goes at the top.** Switches, patch panels, and cable management sit at the top where cable runs are shortest.
- **Leave space between sections.** 1U blanking panels between groups of equipment improve airflow and organization.
- **Power distribution on the sides.** Vertical PDUs mount on the rear rack rails and keep power cables organized.

## My Layout (Top to Bottom)

- 1U: Patch panel
- 1U: Mikrotik 10GbE switch
- 1U: Cisco switch
- 1U: Blank
- 5U: Mac Pro (rack-mount)
- 1U: Blank
- 2U: Dell R740 #1
- 2U: Dell R740 #2
- 1U: Blank
- 2U: UPS
- Remaining: Empty (future expansion)

## Power Planning

I calculated total power draw before installing anything. Each circuit in my house is rated for 15A at 120V, which is 1,800 watts. My rack draws about 1,300 watts under typical load, leaving headroom for peaks. If I add more equipment, I will need a dedicated circuit.

## Cooling

The rack is in a closet with forced-air ventilation. I added a vent fan at the top of the closet door to exhaust hot air into the room. A temperature sensor inside the rack triggers an alert if ambient temperature exceeds 85 degrees Fahrenheit.

## Lessons Learned

Buy more rack than you think you need. Label everything during installation, not after. And always test power and network before racking a server. Debugging a cabling issue with a 60-pound server on rails is miserable.
`,
  },
  {
    slug: "stp-troubleshooting",
    title: "Troubleshooting Spanning Tree Protocol Issues",
    date: "2025-10-28",
    tags: ["networking", "cisco", "troubleshooting"],
    excerpt:
      "Real STP problems I have encountered and how I diagnosed them using show commands and packet captures.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## STP Is Everywhere

Spanning Tree Protocol runs on every enterprise switch, usually without anyone thinking about it. It prevents Layer 2 loops by blocking redundant paths, and it is absolutely essential for network stability. But when STP goes wrong, it goes wrong fast.

## The Broadcast Storm

The worst STP failure I experienced in my lab was a broadcast storm caused by a misconfigured port. I had a port set as a trunk that should have been an access port. When I connected a second cable between two switches (creating a physical loop), STP should have blocked one path. Instead, the misconfigured port did not participate in STP correctly, and the loop formed.

The result was immediate. Every device on the VLAN became unreachable. CPU utilization on the switches spiked to 100%. The switches were spending all their resources forwarding broadcast frames in an infinite loop.

## Diagnosis

The first thing I checked was \`show spanning-tree\`:

\`\`\`
LabSwitch# show spanning-tree vlan 20
\`\`\`

This showed me the root bridge, the port roles (root, designated, alternate, blocked), and the port states. The problem was immediately visible: the misconfigured port was not in a blocking state when it should have been.

## Root Bridge Election

Every STP instance has a root bridge. The root bridge is the switch with the lowest bridge ID, which is a combination of priority and MAC address. In my lab, I set the priority on my core switch to ensure it is always the root bridge:

\`\`\`
LabSwitch(config)# spanning-tree vlan 20 priority 4096
\`\`\`

If you do not explicitly set a root bridge, the election is based on MAC addresses, which means a new switch with a lower MAC could take over as root and change your entire network topology.

## PortFast and BPDU Guard

For access ports that connect to end devices (workstations, servers), PortFast skips the STP listening and learning states and brings the port to forwarding immediately. BPDU Guard disables the port if it receives a STP BPDU (Bridge Protocol Data Unit), which would indicate that someone plugged a switch into an access port.

\`\`\`
LabSwitch(config-if)# spanning-tree portfast
LabSwitch(config-if)# spanning-tree bpduguard enable
\`\`\`

These two features together prevent most common STP issues on access ports.
`,
  },
  {
    slug: "mac-pro-afterburner-card",
    title: "The Apple Afterburner Card: Hardware Video Acceleration",
    date: "2025-10-25",
    tags: ["apple", "mac-pro", "hardware"],
    excerpt:
      "What Apple's Afterburner accelerator card does, how it works, and why hardware-accelerated ProRes decoding matters.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## What Afterburner Does

The Apple Afterburner card is a PCIe accelerator designed to decode ProRes and ProRes RAW video in hardware. It handles up to 6.3 billion pixels per second, which translates to 3 streams of 8K ProRes RAW or 12 streams of 4K ProRes RAW simultaneously. Without Afterburner, these decode operations happen on the CPU, which limits how many streams you can play back in real time.

## Why It Matters

In video post-production, editors need to scrub through high-resolution footage in real time. ProRes is Apple's professional codec, used widely in film and broadcast. Raw footage from professional cameras is enormous. A single stream of 8K ProRes RAW produces about 4 GB per minute.

Without hardware acceleration, playing back multiple 4K or 8K streams simultaneously would require an extremely powerful CPU. Afterburner offloads this work to a dedicated FPGA (field-programmable gate array), freeing the CPU for other tasks like effects rendering and compositing.

## The Hardware

Afterburner is built on a Xilinx FPGA. Apple programmed the FPGA with their ProRes decode logic, creating a purpose-built accelerator that is more power-efficient than doing the same work on a general-purpose CPU or GPU. The card draws about 25 watts and occupies a half-length PCIe slot.

This approach is interesting from an engineering perspective. FPGAs can be reprogrammed, which means Apple could theoretically update the card to support new codecs or improved decode algorithms through a firmware update. Whether they actually will is another question.

## In Practice

In my setup, Afterburner makes a noticeable difference when working with ProRes footage in Final Cut Pro. Timeline scrubbing is instant, even with multiple 4K streams and effects applied. Without Afterburner, the same timeline would stutter and drop frames.

For anyone doing serious video work on a Mac Pro, the Afterburner card is one of the most cost-effective upgrades available. It turns the Mac Pro from a powerful workstation into a dedicated video processing machine.

## The Bigger Picture

Afterburner is a good example of how hardware acceleration can transform specific workloads. The same principle applies to GPU-accelerated machine learning, FPGA-based network packet processing, and ASICs designed for cryptocurrency mining. When you can move a compute-intensive task from general-purpose hardware to dedicated hardware, the performance and efficiency gains are dramatic.
`,
  },
  {
    slug: "firewall-policy-design",
    title: "Designing Firewall Policies That Actually Work",
    date: "2025-10-22",
    tags: ["security", "networking", "fortinet"],
    excerpt:
      "How I approach firewall policy design, with practical examples from my FortiGate configuration.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## The Principle of Least Privilege

Every firewall policy should allow exactly what is needed and nothing more. This is the principle of least privilege applied to network traffic. The default posture should be deny-all, with explicit allow rules for each legitimate traffic flow.

In practice, this means starting with a policy that blocks everything, then adding rules one at a time as you identify what needs to be allowed. It is more work upfront, but it is dramatically more secure than starting with allow-all and trying to block bad traffic.

## My Methodology

Before writing any policies, I map out every traffic flow I need to support:

1. What source zone needs to reach what destination zone?
2. What protocol and port does the traffic use?
3. Is the traffic bidirectional or one-way?
4. Does it need deep packet inspection?

I document each flow in a table, then translate each row into a firewall policy.

## Zone-Based Design

I organize my firewall policies by zone. Each VLAN maps to a zone, and policies control traffic between zones. This is cleaner than per-interface policies because it abstracts the physical topology.

Example zones in my FortiGate:
- Management
- Servers
- Users
- IoT
- Guest
- Internet

## Policy Order

FortiGate (and most firewalls) evaluates policies top to bottom and applies the first match. This means specific rules must come before general rules. A common mistake is putting a broad allow rule above a specific deny rule, which effectively makes the deny rule useless.

I organize my policies in groups: inter-zone allow rules first, then zone-to-internet rules, then the implicit deny-all at the bottom.

## Logging

Every policy should log traffic, at minimum for session start. Logging lets you verify that policies are working as intended and provides forensic data for security investigations. I enable full logging on security policies and session-start logging on routine traffic policies.

## Regular Review

Firewall policies are not set-and-forget. I review my policies monthly to remove stale rules, tighten overly broad rules, and verify that the policy set matches the current network design. This discipline prevents policy bloat, where rules accumulate over time and nobody knows what half of them do.
`,
  },
  {
    slug: "virtualization-networking-concepts",
    title: "Networking Inside Virtual Environments",
    date: "2025-10-18",
    tags: ["networking", "virtualization", "servers"],
    excerpt:
      "How virtual switches, port groups, and VLAN tagging work inside hypervisors, and how they connect to physical networks.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Virtual Switches

When you create a VM, it needs network access. The hypervisor provides this through virtual switches (vSwitches), which work like physical switches but exist entirely in software. VMs connect their virtual NICs to a vSwitch, and the vSwitch connects to a physical NIC on the host.

In Proxmox, the default virtual bridge is called vmbr0. In ESXi, it is a vSwitch or Distributed Switch. The concept is the same: a software-defined Layer 2 switch inside the hypervisor.

## Connecting to Physical Networks

The virtual switch connects to the physical network through one or more physical NICs (called uplinks). Traffic from VMs travels through the vSwitch, out the uplink NIC, and onto the physical network. From the physical switch's perspective, all VM traffic comes from the host's NIC.

## VLAN Tagging

To put VMs on different VLANs, you configure VLAN tagging on the virtual switch. The hypervisor adds VLAN tags to traffic leaving the vSwitch, and the physical switch must be configured with a trunk port that accepts those VLAN tags.

In Proxmox, you create VLAN-aware bridges or separate bridge interfaces for each VLAN. In ESXi, you create port groups with VLAN IDs. Either way, the result is the same: VMs can be placed on different VLANs without dedicated physical NICs for each VLAN.

## Common Problems

The most frequent issue I troubleshoot is mismatched VLAN configuration. If the hypervisor is tagging traffic with VLAN 20 but the physical switch port is configured as an access port on VLAN 10, the traffic gets dropped. Always verify that the physical switch port is configured as a trunk and allows the VLANs you need.

## Performance Considerations

Virtual networking adds a small amount of overhead compared to physical networking. For most workloads, the overhead is negligible. For high-throughput workloads (10GbE storage traffic, for example), techniques like SR-IOV (Single Root I/O Virtualization) can bypass the virtual switch entirely and give VMs near-native network performance.

I use SR-IOV for my NFS storage VMs that need maximum throughput, and standard vSwitch connectivity for everything else. The configuration complexity of SR-IOV is only worth it when you actually need the performance.
`,
  },
  {
    slug: "log-analysis-methodology",
    title: "How I Approach Log Analysis for Troubleshooting",
    date: "2025-10-15",
    tags: ["cybersecurity", "tools", "servers"],
    excerpt:
      "My methodology for analyzing logs to find problems, with examples from real troubleshooting sessions.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Logs Tell the Truth

When a system is misbehaving, logs are the first place I look. Unlike user reports or symptoms, logs provide objective, timestamped records of what the system actually did. They do not lie (though they can be incomplete or misleading if you do not know what you are looking at).

## My Process

1. **Define the problem clearly.** What broke? When did it start? What changed?
2. **Identify which logs to check.** System logs, application logs, authentication logs, and network device logs each tell different parts of the story.
3. **Narrow the time window.** If the problem started at 2:30 PM, focus on logs from 2:15 PM to 2:45 PM. Looking at hours of logs wastes time.
4. **Search for errors and warnings first.** Grep for ERROR, WARN, FAIL, and DENIED. These keywords surface the most relevant entries quickly.
5. **Expand from there.** Once you find a relevant log entry, look at the entries before and after it for context.

## Tools

For quick searches, I use grep and awk on the command line:

\`\`\`bash
grep -i "error" /var/log/syslog | tail -50
journalctl --since "2026-02-10 14:00" --until "2026-02-10 15:00"
\`\`\`

For more complex analysis, I pipe log data into Python scripts that parse timestamps, extract fields, and aggregate patterns.

## Common Patterns

Some log patterns I have learned to recognize immediately:

- **Rapid repeated authentication failures:** Brute force attempt or misconfigured service.
- **Disk I/O errors:** Failing drive. Check SMART data and replace.
- **Connection refused messages:** Service is not running, port is blocked, or wrong IP.
- **Out of memory (OOM) kills:** A process consumed too much RAM and the kernel killed it. Need more memory or the application has a memory leak.

## Centralized Logging

Checking logs on individual servers is fine for a few machines. Once you have more than five, centralized logging is essential. I send all syslog data to a central server where I can search across all machines from one interface. This also means I have log copies even if the original server's logs are lost.

## The NCL Connection

Log analysis is a major category in the National Cyber League competition. The skills transfer directly: you get a set of logs and need to extract specific information, identify attacks, and answer questions about what happened. The methodology is identical to real-world troubleshooting.
`,
  },
  {
    slug: "apple-t2-security-chip",
    title: "Apple's T2 Security Chip in the Mac Pro",
    date: "2025-10-12",
    tags: ["apple", "mac-pro", "security", "hardware"],
    excerpt:
      "What the T2 chip does in the Mac Pro, how it affects server use, and the tradeoffs between security and flexibility.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## What the T2 Does

The T2 chip in the 2019 Mac Pro is a custom Apple silicon processor that handles several security and utility functions: Secure Boot, encrypted storage, audio processing, and the system management controller. It is essentially a separate computer inside your Mac that runs its own OS (bridgeOS) and manages hardware security.

## Secure Boot

The T2 enforces Secure Boot, which means the Mac will only boot from a cryptographically signed operating system. By default, this means macOS. You can adjust the security level to "No Security" through the Startup Security Utility, which allows booting from external drives and non-Apple operating systems.

For server use, Secure Boot is a double-edged sword. It prevents rootkit-style attacks that modify the boot process, but it also makes it harder to run alternative operating systems or boot from custom recovery media.

## Encrypted Storage

The T2 encrypts all data on the internal SSD using hardware AES-256 encryption. The encryption keys are tied to the T2 chip itself, which means the SSD cannot be read if removed from the Mac Pro and placed in a different machine.

This is great for security but terrible for data recovery. If the T2 chip fails, the data on the SSD is unrecoverable. This is why backups are non-negotiable on any T2-equipped Mac.

## Impact on Linux

Running Linux on a T2-equipped Mac is possible but requires additional effort. The T2 controls the NVMe controller, the touch bar (on laptops), and the audio hardware. Linux support for T2 features has improved through community projects, but it is not seamless.

For the Mac Pro specifically, the T2's role is less intrusive because the Mac Pro does not have a touch bar. But Secure Boot configuration and SSD encryption still need to be considered.

## The Tradeoff

The T2 chip represents Apple's philosophy of security through hardware control. It makes the Mac Pro more secure by default but less flexible. For a personal workstation, the security benefits probably outweigh the flexibility costs. For a server that might need to boot different operating systems or have its storage transplanted for recovery, the T2 adds constraints that traditional server hardware does not have.

In my lab, I keep the Mac Pro on its default macOS configuration and use my Dell servers for anything that needs OS flexibility. The T2 is a non-issue when you use the Mac Pro for what it was designed to do.
`,
  },
  {
    slug: "network-documentation-best-practices",
    title: "Network Documentation That Actually Gets Used",
    date: "2025-10-08",
    tags: ["networking", "homelab", "tools"],
    excerpt:
      "How I document my network infrastructure in a way that is useful during outages, not just for show.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## The Problem

Most network documentation is either nonexistent or so outdated that it is worse than useless. Outdated documentation gives you false confidence. You think you know how the network is configured, but the documentation does not match reality, and you make decisions based on wrong information.

## What I Document

My documentation covers four categories:

**1. Topology diagrams.** Visual maps showing how devices connect, including interface names, IP addresses, and VLAN assignments. I update these whenever I add or remove equipment.

**2. IP address management (IPAM).** A spreadsheet listing every IP address assignment, what device it belongs to, and which VLAN it is on. This prevents duplicate IPs and makes it easy to find available addresses.

**3. Configuration backups.** Automated nightly backups of every network device configuration. Stored in git so I can see what changed and when.

**4. Runbooks.** Step-by-step procedures for common tasks: adding a new VLAN, configuring a switch port, troubleshooting a connectivity issue, failing over to a backup. Written so someone unfamiliar with the network could follow them.

## Tools

I use draw.io for topology diagrams because it is free, exports to multiple formats, and runs in a browser. For IPAM, a simple spreadsheet works for my scale. For configuration backups, I use Python scripts that pull configs via SSH and commit them to a git repository.

The git approach for configurations is powerful. When something breaks after a change, I can diff the current configuration against the last known good configuration and see exactly what changed.

## The Test

Good documentation passes the "2 AM test": if your network goes down at 2 AM and you are half asleep, can you find the information you need to diagnose and fix the problem? If the answer is no, your documentation needs work.

## Keeping It Current

The hardest part of documentation is keeping it updated. I make it a rule: no infrastructure change is complete until the documentation is updated. The change log, the diagram, the IPAM spreadsheet, everything gets updated as part of the change process, not after.
`,
  },
  {
    slug: "power-consumption-monitoring",
    title: "Monitoring and Reducing Server Power Consumption",
    date: "2025-10-05",
    tags: ["servers", "hardware", "homelab", "power"],
    excerpt:
      "How I monitor power usage in my rack and the settings that made the biggest difference in my electricity bill.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Measuring Power

You cannot optimize what you do not measure. I use three levels of power monitoring:

1. **Kill-A-Watt meter** on the rack's input circuit for total rack power draw
2. **PDU displays** showing per-PDU power consumption
3. **iDRAC power monitoring** showing per-server real-time and historical power usage

Together, these give me a complete picture of where power is going.

## What I Found

When I first measured, my rack was drawing about 1,600 watts continuously. At my electricity rate, that works out to roughly $140 per month. Not trivial.

Breaking it down:
- Dell R740 #1: ~500W (heavily loaded with VMs)
- Dell R740 #2: ~450W (moderate load)
- Mac Pro: ~280W (mostly idle)
- Networking equipment: ~80W
- UPS overhead: ~60W

## Optimizations

**BIOS power profiles:** Switching from "Performance" to "Performance Per Watt (OS)" on both R740s saved about 80W total with no noticeable performance impact.

**Idle server management:** The Mac Pro was drawing 280W while barely being used. I configured it to sleep when idle and wake on network access. Average draw dropped to about 40W.

**Consolidating VMs:** By rebalancing VM placement, I was able to keep R740 #2 at lower utilization, which reduced its power draw by about 60W.

**After optimization:** Total rack draw dropped from 1,600W to about 1,100W. That is a 30% reduction and saves roughly $40 per month.

## Temperature and Power

Server power draw is closely linked to cooling. Higher ambient temperatures cause fans to spin faster, which uses more power, which generates more heat. Keeping the rack area cool (below 75F) helps keep fan speeds and power draw lower.

I added better ventilation to the closet housing my rack, which dropped ambient temperature by about 5 degrees and resulted in measurably lower fan speeds and power consumption.

## The Long-Term View

Power costs add up over years. A 500W reduction saves over $500 per year at typical electricity rates. When evaluating new equipment, I now factor in power consumption alongside purchase price, performance, and features. A server that costs less but draws more power may actually cost more over its lifetime.
`,
  },
  {
    slug: "incident-response-methodology",
    title: "Incident Response: What to Do When Things Break",
    date: "2025-10-01",
    tags: ["cybersecurity", "networking", "servers"],
    excerpt:
      "My approach to handling infrastructure incidents, from detection through resolution and documentation.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Incidents Will Happen

No matter how well you design and maintain your infrastructure, things will break. Hardware fails. Software has bugs. Configuration changes have unintended consequences. The question is not whether incidents will happen, but how effectively you respond when they do.

## My Framework

I follow a structured approach based on established incident response frameworks:

### 1. Detect and Identify

The first step is knowing that something is wrong and understanding what is affected. Monitoring and alerting handle detection. Identification means determining the scope: what service is down, who is affected, and what is the business impact.

### 2. Contain

Stop the problem from getting worse. If a server is compromised, isolate it from the network. If a configuration change broke connectivity, roll it back. If a process is consuming all system resources, kill it. Containment is about limiting damage while you figure out the root cause.

### 3. Diagnose

Find the root cause. This is where log analysis, packet captures, and systematic troubleshooting come in. Start with what changed recently. Most incidents are caused by recent changes, even if the relationship is not immediately obvious.

### 4. Resolve

Fix the problem. Apply the patch, replace the hardware, correct the configuration, or restore from backup. Verify that the fix actually works and that the service is fully restored.

### 5. Document

Write down what happened, when it happened, what caused it, how it was fixed, and what will prevent it from happening again. This is the step most people skip, and it is arguably the most important one. Good incident documentation prevents recurring problems and helps you respond faster next time.

## Communication

During an incident, clear communication matters. Even in a homelab where I am the only user, I keep a running log of what I have tried, what I have found, and what I plan to do next. This prevents going in circles and provides a record for the post-incident review.

## Practice

I occasionally create intentional incidents in my lab environment to practice response procedures. Breaking something on purpose and then fixing it under time pressure is the closest thing to real-world incident response training you can get without actual production incidents.
`,
  },
  {
    slug: "mac-pro-gpu-compute",
    title: "GPU Compute on the Mac Pro: Metal and Beyond",
    date: "2025-09-28",
    tags: ["apple", "mac-pro", "hardware"],
    excerpt:
      "How the Mac Pro's dual Vega II GPUs handle compute workloads and where they fit in the GPU computing landscape.",
    coverImage: "/images/blog-cover-datacenter.png",
    content: `
## The Hardware

My Mac Pro has dual AMD Radeon Pro Vega II GPUs, each with 32 GB of HBM2 (High Bandwidth Memory). Together, that is 64 GB of GPU memory with massive bandwidth. These are workstation GPUs designed for sustained compute loads, not gaming.

The Infinity Fabric Link between the two GPUs allows them to share memory and work together on compute tasks, which is unusual for consumer/workstation hardware. This effectively gives you a single 64 GB GPU address space for workloads that support it.

## Metal for Compute

Apple's Metal API is the primary way to access GPU compute on macOS. Metal Performance Shaders (MPS) provide optimized implementations of common operations like matrix multiplication, convolution, and image processing. These are the building blocks for machine learning inference and media processing.

For video work, the GPUs accelerate ProRes encoding/decoding, color grading, and effects rendering in Final Cut Pro and DaVinci Resolve. The HBM2 memory bandwidth means large frames can be processed without bottlenecking on memory access.

## Machine Learning

The Mac Pro can run machine learning inference workloads through Core ML and Metal. For training, it is limited compared to NVIDIA GPUs because the ML ecosystem (PyTorch, TensorFlow) is built primarily around CUDA. AMD's ROCm framework provides some compatibility, but it is not at parity with CUDA.

For inference, the Mac Pro performs well. Apple has invested heavily in optimizing Core ML for their hardware, and many pre-trained models can be converted to Core ML format and run efficiently on the Vega II GPUs.

## The NVIDIA Gap

The elephant in the room is that most GPU compute workloads are optimized for NVIDIA CUDA. The Mac Pro does not support NVIDIA GPUs (Apple and NVIDIA parted ways years ago). This means the Mac Pro is excluded from the dominant GPU computing ecosystem.

For specific Apple-optimized workloads (media processing, Core ML inference, Metal compute), the Mac Pro is excellent. For general-purpose GPU computing (CUDA-based ML training, scientific computing), an NVIDIA-equipped server is the better choice.

## My Use

I use the Mac Pro's GPUs primarily for video processing and as a learning platform for Metal compute programming. For anything that needs CUDA, I run it on my Dell servers with passthrough GPUs or on cloud instances. The right tool for the right job.
`,
  },
  {
    slug: "ssl-tls-certificates-explained",
    title: "SSL/TLS Certificates: What They Are and How They Work",
    date: "2025-09-25",
    tags: ["security", "networking", "servers"],
    excerpt:
      "A practical explanation of TLS certificates, certificate authorities, and how to manage certificates on your own infrastructure.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What TLS Does

TLS (Transport Layer Security) encrypts communication between a client and a server. When you connect to a website over HTTPS, TLS ensures that nobody can read or modify the data in transit. It also verifies the identity of the server, so you know you are connected to the real site and not an impostor.

## How Certificates Work

A TLS certificate is a digital document that binds a public key to a domain name (or IP address). The certificate is signed by a Certificate Authority (CA) that the client trusts. When a client connects, the server presents its certificate, the client verifies the CA's signature, and if everything checks out, they establish an encrypted connection.

The trust chain goes: client trusts CA -> CA signed the certificate -> certificate proves the server's identity.

## Certificate Types

**Domain Validated (DV):** The CA verifies that you control the domain name. This is the most common type and what Let's Encrypt provides for free. Good for most use cases.

**Organization Validated (OV):** The CA also verifies that your organization exists. Adds the organization name to the certificate.

**Extended Validation (EV):** The CA performs thorough verification of the organization. Used to display the organization name in the browser's address bar (though most browsers have stopped showing this prominently).

## Self-Signed Certificates

For internal infrastructure, I use self-signed certificates generated with my own internal CA. This means I do not need to expose internal services to the internet for domain validation, and I can issue certificates for any internal hostname or IP.

I set up a simple CA using openssl:

\`\`\`bash
openssl req -x509 -newkey rsa:4096 -keyout ca-key.pem -out ca-cert.pem -days 3650 -nodes
\`\`\`

I distribute the CA certificate to all internal machines so they trust certificates signed by my internal CA.

## Let's Encrypt for Public Services

For any service exposed to the internet, I use Let's Encrypt certificates. They are free, automatically renewed, and trusted by all major browsers. Certbot handles the issuance and renewal process automatically.

## Certificate Management

The biggest challenge with certificates is tracking expiration dates. An expired certificate causes service outages and browser warnings. I monitor certificate expiration with a simple script that checks each certificate's validity date and alerts me 30 days before expiration.
`,
  },
  {
    slug: "apple-file-system-apfs",
    title: "APFS: Apple's Modern Filesystem and Its Server Implications",
    date: "2025-09-22",
    tags: ["apple", "storage", "mac-pro"],
    excerpt:
      "How APFS works, what it does well, and why it is not a replacement for ZFS in server environments.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## What APFS Is

Apple File System (APFS) is Apple's modern filesystem, introduced in 2017 to replace HFS+. It was designed primarily for flash storage (SSDs) and supports features like snapshots, clones, strong encryption, space sharing, and crash protection through copy-on-write metadata.

## What APFS Does Well

APFS is excellent for its intended use case: Apple devices with SSDs. Snapshots are instant and space-efficient. Encryption is hardware-accelerated and transparent. Space sharing lets multiple volumes share a single storage pool dynamically, which is perfect for devices with fixed internal storage.

File operations on APFS are fast because the filesystem was designed around the characteristics of flash storage rather than spinning disks.

## Where APFS Falls Short for Servers

APFS does not checksum file data. It checksums metadata (directory structures, file attributes) but not the actual file contents. This means APFS cannot detect or correct silent data corruption, which is a critical gap for server storage. ZFS, by contrast, checksums every block of data and can self-heal when corruption is detected.

APFS also does not support software RAID. There is no APFS equivalent of ZFS RAIDZ or Linux md RAID. For redundant storage, you need either hardware RAID (which APFS sits on top of) or Apple's now-deprecated software RAID from Disk Utility.

## APFS vs ZFS

For server storage:
- **Data integrity:** ZFS wins. Checksumming and self-healing are essential for data you care about.
- **RAID:** ZFS wins. RAIDZ provides integrated software RAID with flexible configurations.
- **Snapshots:** Both are excellent. APFS snapshots are lighter-weight for typical desktop use. ZFS snapshots are more powerful for server backup workflows (send/receive).
- **Encryption:** APFS is more tightly integrated with Apple hardware. ZFS encryption works but is a newer addition.
- **Performance on SSDs:** APFS is optimized for Apple's specific SSD controllers. ZFS performs well on SSDs but was originally designed for spinning disks.

## My Approach

On my Mac Pro, I use APFS for the boot volume and local workspace because it is the native macOS filesystem and works seamlessly with Apple's tools. For any data that needs integrity guarantees or redundancy, I store it on ZFS pools running on my Dell servers.

This hybrid approach uses each filesystem where it is strongest.
`,
  },
  {
    slug: "homelab-network-evolution",
    title: "How My Home Network Evolved Over Three Years",
    date: "2025-09-18",
    tags: ["networking", "homelab", "hardware"],
    excerpt:
      "From a consumer router to a full enterprise network. The stages, mistakes, and lessons from building my infrastructure.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Stage 1: Consumer Router

Like most people, I started with the router my ISP provided. A single device handled routing, switching, WiFi, DHCP, DNS, and firewall. It worked fine for basic internet access, but it was a black box. I could not configure VLANs, could not see detailed traffic logs, and had no visibility into what was happening on my network.

## Stage 2: Managed Switch and Separate Router

The first upgrade was adding a managed switch and replacing the ISP router with a dedicated device. Suddenly I could create VLANs, monitor port statistics, and configure trunks. This was the moment I went from using a network to understanding how networks work.

The managed switch taught me more about networking in a month than I had learned in the previous year. Being able to see MAC address tables, VLAN assignments, and port counters in real time made abstract concepts concrete.

## Stage 3: Enterprise Hardware

Adding Dell PowerEdge servers was the next step. This required proper network infrastructure: more switch ports, 10GbE for storage traffic, and a firewall with real policy enforcement. I added a FortiGate for routing and security, a Cisco switch for my learning goals, and Mellanox NICs for 10GbE.

This is also when I started treating the network as infrastructure rather than an accessory. Documentation, change management, monitoring, and backups all became necessary.

## Stage 4: Full Lab Environment

The current state includes multiple Dell servers, a Mac Pro, enterprise networking, segmented VLANs, centralized monitoring, automated backups, and proper documentation. It is closer to a small enterprise network than a home network.

## Mistakes I Made

- **Not labeling cables early.** I had to trace and label everything retroactively. Do it from the start.
- **Skipping documentation.** Same problem. Document as you build, not after.
- **Buying consumer-grade equipment.** I replaced cheap switches and routers multiple times before investing in enterprise hardware that did what I needed. Buy right once.
- **Not planning for power.** Adding servers without considering power draw and circuit capacity caused breaker trips. Measure before you install.

## What I Would Do Differently

Start with a managed switch and a firewall from the beginning. The consumer router phase taught me nothing. As soon as you have managed infrastructure, every addition builds on a solid foundation.
`,
  },
  {
    slug: "container-orchestration-basics",
    title: "Container Orchestration: Docker and LXC in a Homelab",
    date: "2025-09-15",
    tags: ["virtualization", "servers", "homelab"],
    excerpt:
      "How I use containers alongside virtual machines in my lab, and when each approach makes sense.",
    coverImage: "/images/blog-cover-default.png",
    content: `
## Containers vs VMs

Virtual machines emulate complete hardware. Each VM runs its own kernel, its own OS, and its own set of services. This provides strong isolation but consumes more resources because every VM needs its own copy of the operating system.

Containers share the host's kernel and only package the application and its dependencies. This makes them lighter, faster to start, and more resource-efficient. The tradeoff is weaker isolation compared to VMs.

## When I Use VMs

VMs are my choice for anything that needs strong isolation, runs a different OS, or represents a "server" in my mental model. My Windows Server domain controllers, my pfSense firewall test instances, and my Linux servers all run as full VMs.

VMs are also better for long-running services that need to survive host reboots and migrations. Proxmox's VM management (snapshots, backups, live migration) is mature and reliable.

## When I Use Containers

Containers (specifically LXC containers on Proxmox) are my choice for lightweight services that run on Linux and do not need strong isolation from the host. DNS servers, monitoring agents, small web services, and development environments all run in LXC containers.

An LXC container uses a fraction of the resources of a VM. A container running Pi-hole (DNS filtering) uses about 50 MB of RAM and negligible CPU. A VM running the same service would use 512 MB minimum just for the OS overhead.

## Docker

Docker containers are different from LXC. Docker is designed for packaging and distributing applications, with a focus on immutable images and declarative configuration. I run Docker inside VMs when I need Docker-specific tooling, but for most homelab services, LXC containers are simpler and lighter.

\`\`\`yaml
version: "3"
services:
  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
volumes:
  grafana-data:
\`\`\`

## The Right Tool

There is no universal answer to "containers or VMs." Both have their place. My rule of thumb: if it needs its own kernel or strong isolation, use a VM. If it is a Linux service that can share the host kernel, use a container. If it is a portable application packaged as a Docker image, use Docker.
`,
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug && !post.draft);
}

export function getAllPosts(): BlogPost[] {
  return blogPosts
    .filter((post) => !post.draft)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function getPostsByTag(tag: string): BlogPost[] {
  return getAllPosts().filter((post) => post.tags.includes(tag));
}

export function getAllTags(): string[] {
  const tags = new Set<string>();
  getAllPosts().forEach((post) => post.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).sort();
}
