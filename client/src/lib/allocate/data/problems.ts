/**
 * Six address plans, in RFC 1918 and documentation space.
 *
 * The sizes are the kind that turn up rather than the kind that divide
 * evenly. A requirement for 500 hosts does not fit a /24 and wastes half a
 * /23, and there is nothing to be done about that: the exercise is spending
 * the waste where it does least harm rather than pretending it is avoidable.
 */

import type { Problem } from "../types";

export const PROBLEMS: Problem[] = [
  {
    slug: "one-building",
    title: "One Building",
    difficulty: "easy",
    tagline: "Four VLANs, one /24, and one of them needs more than a quarter of it.",
    brief: [
      "A single school building has a /24 to divide between four VLANs. Nothing here is subtle; the point is to get the arithmetic and the alignment right before anything else is added.",
      "Every subnet has to be a real network address for its prefix, sit inside the block, and not overlap anything else.",
    ],
    block: "192.168.10.0/24",
    requirements: [
      { id: "staff", label: "Staff", hosts: 100, note: "One device per member of staff, plus a margin." },
      { id: "students", label: "Student wifi", hosts: 60, note: "Peak concurrent, measured." },
      { id: "printers", label: "Printers and MFDs", hosts: 12 },
      { id: "mgmt", label: "Switch management", hosts: 10 },
    ],
    hints: [
      "Place the largest first. Fitting the big one around the small ones is how you end up with no room.",
      "100 hosts does not fit a /25 by one address. Work out why before you round up.",
      "A /28 gives 14 usable, which is what the printers need.",
    ],
    solution: {
      staff: "192.168.10.0/25",
      students: "192.168.10.128/26",
      printers: "192.168.10.192/28",
      mgmt: "192.168.10.208/28",
    },
    debrief: [
      "A /25 gives 126 usable, which covers 100. A /26 gives 62, which covers 60 with two to spare, and that margin is thinner than it looks: two more access points and the VLAN is full.",
      "Largest first is the whole technique. Allocate the small subnets wherever there is room and the large one has nowhere aligned to go, even when the arithmetic says the space exists. Alignment, not capacity, is what runs out.",
      "There is a /28 left over at 192.168.10.224. Leaving it unallocated is the right answer: an address plan with no gap is an address plan that cannot absorb anything.",
    ],
  },
  {
    slug: "the-summary-route",
    title: "The Summary Route",
    difficulty: "medium",
    tagline: "The core advertises one route for the wireless VLANs, so they have to be contiguous.",
    brief: [
      "The core switch summarizes all wireless VLANs into a single advertisement. That means the wireless subnets cannot be scattered: they have to sit inside one aligned block, or the summary covers addresses that belong to something else.",
      "The first attempt at this plan reserved a /23 for the summary and it did not fit, which is worth working out for yourself before you start. The reservation is now a /22.",
      "Everything else can go anywhere in the /21.",
    ],
    block: "10.40.0.0/21",
    requirements: [
      {
        id: "wifi-guest",
        label: "Wireless: guest",
        hosts: 400,
        note: "Summarized into one advertisement.",
        within: "10.40.0.0/22",
      },
      {
        id: "wifi-staff",
        label: "Wireless: staff",
        hosts: 200,
        note: "Summarized into one advertisement.",
        within: "10.40.0.0/22",
      },
      { id: "wired", label: "Wired clients", hosts: 300 },
      { id: "servers", label: "Servers", hosts: 40 },
      { id: "mgmt", label: "Out of band management", hosts: 25 },
    ],
    hints: [
      "Do the failed version first. A /23 holds 510 usable, and guest plus staff is 600 hosts.",
      "Inside the /22, place guest before staff: 400 hosts needs a /23 and it has to start at the bottom to stay aligned.",
      "Everything outside the summary starts at 10.40.4.0, because the /22 reservation runs to 10.40.3.255 whether or not it is full.",
    ],
    solution: {
      "wifi-guest": "10.40.0.0/23",
      "wifi-staff": "10.40.2.0/24",
      wired: "10.40.4.0/23",
      servers: "10.40.6.0/26",
      mgmt: "10.40.6.64/27",
    },
    debrief: [
      "The original /23 was the whole problem. Guest needs 400 hosts and staff needs 200, which is 600, and a /23 holds 510 usable. No amount of careful subnetting fixes that: the requirements do not fit the reservation, and the reservation is the thing that has to move.",
      "Recognizing an infeasible constraint is a real skill and it is worth doing before the addresses are deployed rather than after. The tell is arithmetic, not intuition: add the host counts, compare against the usable count of the block, and stop if it does not fit.",
      "Inside the widened /22 there is still 10.40.3.0/24 spare, and the summary advertises it. That is the cost of summarizing and it is fine as long as it is written down: anything dropped in there later is inside the wireless advertisement whether it is wireless or not.",
      "The subnets outside the summary start at 10.40.4.0 rather than 10.40.3.0, because the reservation occupies the whole /22 regardless of how much of it is allocated. A block reserved for a summary is spent the moment the summary exists.",
    ],
  },
  {
    slug: "point-to-point",
    title: "Point to Point",
    difficulty: "medium",
    tagline: "Nine router links, two hosts each, and a /24 that should be nowhere near enough.",
    brief: [
      "Nine point-to-point links between routers. Each needs exactly two addresses, one at each end.",
      "Fit them all in 172.16.5.0/28 and leave the rest of the /24 for anything else.",
    ],
    block: "172.16.5.0/28",
    requirements: [
      { id: "l1", label: "Core to Building A", hosts: 2 },
      { id: "l2", label: "Core to Building B", hosts: 2 },
      { id: "l3", label: "Core to Building C", hosts: 2 },
      { id: "l4", label: "Core to Building D", hosts: 2 },
      { id: "l5", label: "Core to the firewall", hosts: 2 },
      { id: "l6", label: "Core to the WAN router", hosts: 2 },
      { id: "l7", label: "A to B crosslink", hosts: 2 },
      { id: "l8", label: "C to D crosslink", hosts: 2 },
    ],
    hints: [
      "A /30 gives two usable addresses, and eight of them is 32 addresses. The block has 16.",
      "There is a prefix length that gives two usable addresses out of two total.",
      "RFC 3021. On a point-to-point link there is nobody to broadcast to.",
    ],
    solution: {
      l1: "172.16.5.0/31",
      l2: "172.16.5.2/31",
      l3: "172.16.5.4/31",
      l4: "172.16.5.6/31",
      l5: "172.16.5.8/31",
      l6: "172.16.5.10/31",
      l7: "172.16.5.12/31",
      l8: "172.16.5.14/31",
    },
    debrief: [
      "A /31 on a point-to-point link gives both addresses to hosts. There is no network address and no broadcast address because there is nobody else on the wire to address: everything you send reaches exactly one other interface.",
      "The habit of using /30 for links comes from equipment that predates RFC 3021, and it doubles the address cost of every link for nothing. Eight links at /30 is 32 addresses; at /31 it is 16.",
      "It is worth checking your kit before committing. Support is close to universal on anything current, and genuinely absent on some old and some embedded gear, which is exactly where an unnumbered surprise costs the most.",
    ],
  },
  {
    slug: "the-plan-that-has-to-grow",
    title: "The Plan That Has To Grow",
    difficulty: "hard",
    tagline: "Six sites in a /16, each one doubling within three years.",
    brief: [
      "Six sites share a /16. Each is sized for what it has now, and the brief is to allocate for what it will have: assume every site doubles.",
      "Allocate on the doubled numbers. The requirement listed for each site is already the doubled figure.",
      "Keep each site's allocation aligned so it can be summarized as one route, which is the whole reason for giving a site a block rather than a list of subnets.",
    ],
    block: "10.80.0.0/16",
    requirements: [
      { id: "hq", label: "Headquarters", hosts: 4000, note: "2000 today." },
      { id: "north", label: "North campus", hosts: 2000, note: "1000 today." },
      { id: "south", label: "South campus", hosts: 1000, note: "500 today." },
      { id: "depot", label: "Depot", hosts: 500, note: "250 today." },
      { id: "annex", label: "Annex", hosts: 250, note: "120 today." },
      { id: "dr", label: "DR site", hosts: 250, note: "Cold, but it has to be routable." },
    ],
    hints: [
      "Largest first, and check the alignment of each one before you place the next.",
      "4000 hosts needs a /20, which is 4094 usable. Start it at the bottom of the block.",
      "Each site's block has to start on a boundary of its own size, which is why placing them in descending order works and any other order fights you.",
    ],
    solution: {
      hq: "10.80.0.0/20",
      north: "10.80.16.0/21",
      south: "10.80.24.0/22",
      depot: "10.80.28.0/23",
      annex: "10.80.30.0/24",
      dr: "10.80.31.0/24",
    },
    debrief: [
      "Descending order of size, each block starting where the last one ended, and every allocation lands on its own boundary without any arithmetic beyond addition. That is not luck: a block whose size is a power of two, placed immediately after another whose size is a larger power of two, is always aligned.",
      "Place them in any other order and you have to leave holes to reach the next boundary. Try it: put the annex at 10.80.0.0/24 and the headquarters /20 cannot start until 10.80.16.0, wasting fifteen /24s that nothing can use.",
      "The whole /16 is 65536 addresses and this plan spends 8192 of them. That is the correct amount of restraint. Sizing to fill the space available is how the next acquisition ends up on a second, unrelated block that nobody can summarize.",
    ],
  },
  {
    slug: "the-overlap-nobody-saw",
    title: "The Overlap Nobody Saw",
    difficulty: "easy",
    tagline: "Two VLANs were configured with ranges that share addresses.",
    brief: [
      "This plan was inherited. Two of the four subnets overlap, and intermittently a device on one VLAN gets an address that another VLAN also thinks it owns.",
      "Rebuild the plan so that nothing overlaps and every VLAN still has room. All four have to fit in the /24.",
    ],
    block: "192.168.30.0/24",
    requirements: [
      { id: "voice", label: "Voice", hosts: 60 },
      { id: "data", label: "Data", hosts: 100 },
      { id: "cctv", label: "Cameras", hosts: 25 },
      { id: "bms", label: "Building management", hosts: 12 },
    ],
    hints: [
      "The overlap in the original was 192.168.30.0/25 against 192.168.30.64/26. Look at where each one ends.",
      "A /25 runs from .0 to .127. A /26 starting at .64 runs from .64 to .127.",
      "Place the largest first and each subsequent one immediately after the last.",
    ],
    solution: {
      data: "192.168.30.0/25",
      voice: "192.168.30.128/26",
      cctv: "192.168.30.192/27",
      bms: "192.168.30.224/28",
    },
    debrief: [
      "A /25 at .0 covers .0 to .127, and a /26 at .64 covers .64 to .127. The second is entirely inside the first, and a plan written as a list of starting addresses hides that completely: the two lines look like different numbers.",
      "The symptom is intermittent because it depends on which pool hands out an address first, so it survives testing and appears weeks later as a duplicate address complaint from one user.",
      "Writing a plan as ranges rather than as starting addresses makes this visible immediately. Every subnet has a last address, and the next one starts after it.",
    ],
  },
  {
    slug: "the-firewall-object",
    title: "The Firewall Object",
    difficulty: "hard",
    tagline: "One rule covers everything that may reach the payment segment, so those subnets must summarize.",
    brief: [
      "The firewall has one rule permitting a set of subnets to reach the payment segment, written as a single object. That object has to be one aligned block, and it must not cover anything that is not permitted.",
      "The three permitted subnets must therefore be contiguous and aligned as a group. The two that are not permitted must sit outside that block.",
    ],
    block: "10.90.0.0/21",
    requirements: [
      { id: "tills", label: "Tills (permitted)", hosts: 200, within: "10.90.0.0/22" },
      { id: "backoffice", label: "Back office (permitted)", hosts: 100, within: "10.90.0.0/22" },
      { id: "kiosks", label: "Kiosks (permitted)", hosts: 60, within: "10.90.0.0/22" },
      { id: "guest", label: "Guest wifi (not permitted)", hosts: 400, within: "10.90.4.0/22" },
      { id: "cctv", label: "Cameras (not permitted)", hosts: 100, within: "10.90.4.0/22" },
    ],
    hints: [
      "The three permitted subnets sum to 360 hosts, and they have to live inside one /22.",
      "The firewall object is 10.90.0.0/22 and it covers everything in that range, allocated or not.",
      "That means the spare space inside the /22 is also permitted. Decide whether that is acceptable before you leave it there.",
    ],
    solution: {
      tills: "10.90.0.0/24",
      backoffice: "10.90.1.0/25",
      kiosks: "10.90.1.128/26",
      guest: "10.90.4.0/23",
      cctv: "10.90.6.0/25",
    },
    debrief: [
      "A firewall object written as a CIDR permits the whole range, including the parts nobody has allocated. The three permitted subnets use about 900 of the /22's 1024 addresses, so roughly 124 addresses are permitted to reach the payment segment and belong to nothing.",
      "That is not a bug in this plan, it is the cost of summarizing, and it is the thing to be explicit about. Anything later dropped into the spare space inherits the permission silently, which is how a test VLAN ends up with access nobody granted it.",
      "The alternatives are worse in their own ways. Three separate firewall objects means three rules to keep in step, and a rule per subnet means the object list grows with the network. Most places choose the summary and write down, somewhere findable, that the block is reserved.",
    ],
  },
];

export const PROBLEM_ORDER: Problem["difficulty"][] = ["easy", "medium", "hard"];
