import type { Scenario } from "../types";

/**
 * A wireless complaint that is not a wireless problem.
 *
 * The lesson is layered troubleshooting done honestly: the reader is pushed
 * hard towards the answer the users gave them ("the wifi is broken") and the
 * evidence available at each layer either supports it or does not. The actual
 * fault is a DHCP scope that has run out of addresses because a lease time of
 * eight days meets a school with a lot of visitors, and nothing about it is
 * visible from the access point.
 */
export const eastWingOffline: Scenario = {
  slug: "east-wing-offline",
  title: "Nobody in the East Wing Can Get Online",
  tagline: "Full signal, correct password, no internet. Only in one building.",
  difficulty: "easy",
  category: "Networking",
  role: "You are the IT technician at a secondary school. It is the first week of term, and you have about thirty minutes before period three.",
  clockStart: "Monday 10:05",
  brief: [
    "Three teachers have reported it and one of them has brought a laptop to show you. Full bars on the staff wireless, the password is accepted, and nothing loads.",
    "The west wing is fine. The library is fine. Everyone in the east wing, on any device, is not.",
  ],
  start: "the-laptop",
  reading: [
    { label: "DHCP snooping, and what a DHCP exchange actually looks like", href: "/blog/dhcp-snooping-arp-inspection" },
    { label: "Reading an IP address before you read anything else", href: "/blog/subnetting-practical-guide" },
    { label: "Subnet calculator", href: "/tools/subnet-calculator" },
  ],
  scenes: [
    {
      id: "the-laptop",
      where: "The laptop on your desk",
      body: [
        "It is associated to the access point and it has an address. You look at the address.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "ip addr, on the affected laptop",
          lines: [
            "2: wlp2s0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 state UP",
            "    link/ether 3c:58:c2:11:9f:04 brd ff:ff:ff:ff:ff:ff",
            "    inet 169.254.88.213/16 brd 169.254.255.255 scope link wlp2s0",
            "       valid_lft forever preferred_lft forever",
            "",
            "$ ip route",
            "169.254.0.0/16 dev wlp2s0 scope link metric 1000",
          ],
        },
      ],
      choices: [
        {
          label: "That is a link-local address, so DHCP is the problem",
          detail: "169.254 means nothing answered.",
          to: "dhcp-suspected",
          cost: 2,
        },
        {
          label: "Reboot the east wing access points",
          detail: "It is a wireless complaint, start with the wireless.",
          to: "rebooted-aps",
          cost: 10,
        },
        {
          label: "Set a static address on the laptop to see whether the network works at all",
          to: "static-test",
          cost: 5,
        },
        {
          label: "Ring the internet provider, it might be them",
          to: "end-blamed-the-isp",
          cost: 20,
        },
      ],
    },

    {
      id: "dhcp-suspected",
      where: "The DHCP server console",
      body: [
        "169.254.0.0/16 is what an operating system assigns itself when no DHCP server answered. It is not a wireless fault and it is not a password fault: association succeeded and the address request did not.",
        "You open the scope for the east wing VLAN.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Scope statistics, VLAN 30 (East Wing)",
          lines: [
            "Scope:            10.30.0.0/24",
            "Range:            10.30.0.100 - 10.30.0.250",
            "Total addresses:  151",
            "In use:           151    (100%)",
            "Available:        0      (0%)",
            "Lease duration:   8 days",
            "",
            "Scope:            10.20.0.0/23  (West Wing)",
            "Range:            10.20.0.100 - 10.20.1.250",
            "Total addresses:  407",
            "In use:           219    (54%)",
          ],
        },
      ],
      choices: [
        {
          label: "Look at who is holding the 151 leases before changing anything",
          to: "read-the-leases",
          cost: 6,
        },
        {
          label: "Widen the scope to a /23 and move on",
          to: "widened",
          cost: 12,
        },
        {
          label: "Shorten the lease to four hours so they recycle",
          to: "shortened-lease",
          cost: 8,
        },
      ],
    },

    {
      id: "read-the-leases",
      where: "The lease table",
      body: [
        "Ninety-one of the 151 leases were issued to devices that have not been seen since Wednesday of last week: open evening, when 200 visitors joined the guest network.",
        "The guest network is meant to be VLAN 40. Somebody set the east wing guest SSID to VLAN 30 while fixing something else on Wednesday afternoon, and nobody noticed because the visitors got working internet, which is all anyone was checking.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Leases by last-seen",
          lines: [
            "LAST SEEN            COUNT   TYPICAL HOSTNAME",
            "2026-09-08 (today)      60   staff-laptop-*, ipad-*",
            "2026-09-03 (Wed)        91   android-*, iPhone, Galaxy-*, (none)",
            "",
            "$ show wlan summary | grep -i east",
            "  SSID              VLAN   AUTH",
            "  Staff-East        30     WPA2-Enterprise",
            "  Visitor-East      30     WPA2-PSK        <-- should be 40",
            "  Visitor-West      40     WPA2-PSK",
          ],
        },
      ],
      choices: [
        {
          label: "Move Visitor-East back to VLAN 40 and release the stale leases",
          to: "fixed-vlan",
          cost: 15,
        },
        {
          label: "Just release the stale leases, that gets people working now",
          to: "released-only",
          cost: 5,
        },
        {
          label: "Widen the scope so both fit",
          to: "widened",
          cost: 12,
        },
      ],
    },

    {
      id: "fixed-vlan",
      where: "The wireless controller, then the DHCP server",
      body: [
        "Visitor-East goes back to VLAN 40. The 91 stale leases are released. The scope drops to 60 of 151 in use and everyone in the east wing gets an address within a minute of reconnecting.",
        "Period three starts on time.",
      ],
      choices: [
        {
          label: "Also shorten the guest lease so open evening cannot do this again",
          to: "end-fixed-and-hardened",
          cost: 10,
        },
        {
          label: "Also add an alert for scope utilisation over 85 percent",
          to: "end-fixed-and-monitored",
          cost: 20,
        },
        {
          label: "It is fixed. Go to period three",
          to: "end-fixed-only",
          cost: 0,
        },
      ],
    },

    {
      id: "released-only",
      where: "The DHCP server",
      body: [
        "You release the 91 stale leases. Addresses free up, devices reconnect, the east wing works.",
        "Visitor-East is still on VLAN 30, so every visitor device still takes an address out of the staff scope. There are 47 free addresses and parents' evening is on Thursday.",
      ],
      choices: [
        {
          label: "Look at why the visitors were on the staff VLAN",
          to: "fixed-vlan",
          cost: 12,
        },
        { label: "Working is working", to: "end-recurs-thursday", cost: 0 },
      ],
    },

    {
      id: "widened",
      where: "Renumbering the scope",
      body: [
        "You change 10.30.0.0/24 to 10.30.0.0/23 and extend the range. This means changing the interface address on the layer 3 switch too, which drops the east wing entirely for ninety seconds while it reconverges.",
        "It works. There are now 407 addresses, 151 in use, and a guest SSID quietly consuming them at about 200 per event.",
      ],
      choices: [
        {
          label: "Now find out what consumed 151 addresses in a building with 90 staff",
          to: "widened-found",
          cost: 6,
        },
        { label: "Plenty of headroom now", to: "end-bought-time", cost: 0 },
      ],
    },

    {
      id: "widened-found",
      where: "The lease table, after the fact",
      body: [
        "Ninety-one of the leases belong to devices last seen on Wednesday of last week, which was open evening.",
        "The east wing guest SSID is on VLAN 30. It should be on 40, and it has been since somebody changed it on Wednesday afternoon while fixing something else. The visitors got working internet, so nobody checked which VLAN gave it to them.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "show wlan summary",
          lines: [
            "  SSID              VLAN   AUTH",
            "  Staff-East        30     WPA2-Enterprise",
            "  Visitor-East      30     WPA2-PSK        <-- should be 40",
            "  Visitor-West      40     WPA2-PSK",
          ],
        },
      ],
      choices: [
        {
          label: "Move Visitor-East back to VLAN 40",
          to: "fixed-vlan",
          cost: 10,
        },
        {
          label: "Leave it. There is room for both now",
          to: "end-bought-time",
          cost: 0,
        },
      ],
    },

    {
      id: "shortened-lease",
      where: "Scope options",
      body: [
        "You drop the lease from eight days to four hours. Nothing changes for twenty minutes, because a shorter lease only helps when the existing ones expire, and the existing ones have up to eight days left.",
        "Then leases start expiring in the order they were issued and addresses trickle back. The east wing is usable by about 11:30 and fully normal by the afternoon.",
      ],
      choices: [
        {
          label: "Release the stale leases rather than waiting for them",
          to: "read-the-leases",
          cost: 5,
        },
        { label: "It sorted itself out", to: "end-waited-it-out", cost: 60 },
      ],
    },

    {
      id: "rebooted-aps",
      where: "The east wing riser",
      body: [
        "Nine access points reboot. Everyone who was connected is disconnected, including the west wing devices that had roamed east.",
        "They come back in four minutes. Every device reassociates and requests an address, and there are still no addresses, so now the whole east wing has 169.254 addresses instead of just most of it.",
      ],
      choices: [
        {
          label: "Look at what the client is actually being given",
          to: "dhcp-suspected",
          cost: 3,
        },
        {
          label: "Reboot the wireless controller as well",
          to: "end-rebooted-everything",
          cost: 15,
        },
      ],
    },

    {
      id: "static-test",
      where: "The laptop, with a static address",
      body: [
        "You set 10.30.0.60, mask /24, gateway 10.30.0.1, and a public resolver. It works immediately: the gateway pings, DNS resolves, pages load.",
        "So the wireless is fine, the VLAN is fine, routing is fine, and the internet is fine. The only thing that was not working was being given an address.",
      ],
      choices: [
        {
          label: "Go and look at the DHCP scope",
          to: "dhcp-suspected",
          cost: 3,
        },
        {
          label: "Set static addresses on the machines that have complained",
          detail: "Three teachers, three statics, thirty seconds each.",
          to: "end-static-everyone",
          cost: 10,
        },
      ],
    },
  ],

  endings: [
    {
      id: "end-fixed-and-hardened",
      title: "Right cause, and it cannot recur",
      grade: "best",
      body: [
        "Visitors back on their own VLAN, stale leases released, and the guest lease cut to two hours so a 200-person event returns its addresses the same evening.",
        "Total time about forty minutes, most of it reading. Nothing was rebooted and nobody outside the east wing noticed anything.",
      ],
      lesson: [
        "A 169.254 address is a complete diagnosis on its own: the client associated, sent a DHCPDISCOVER, and nothing answered. That rules out the radio, the password, the switch port and the internet in one line.",
        "The complaint was about wireless because that is the layer the user can see. The fault was two layers away, and the only way to get there is to read the evidence rather than the complaint.",
      ],
    },
    {
      id: "end-fixed-and-monitored",
      title: "Fixed, with a warning next time",
      grade: "good",
      body: [
        "VLAN corrected, leases released, and an alert at 85 percent scope utilisation, which is the thing that would have caught this on Wednesday evening instead of Monday morning.",
        "The eight-day guest lease is still eight days, so the alert will fire again after the next big event. At least somebody will see it coming.",
      ],
      lesson: [
        "Scope utilisation is one of the highest-value, least-monitored numbers on a school network: it goes from fine to total outage with no intermediate symptoms.",
        "An alert is worth more than a widened scope, because it survives the next thing that consumes addresses unexpectedly.",
      ],
    },
    {
      id: "end-fixed-only",
      title: "Right cause, no guard rail",
      grade: "good",
      body: [
        "The misconfiguration is corrected and the addresses are back. The east wing is fine.",
        "Nothing tells you when the scope fills next time, and an eight-day lease on a school network means the next capacity problem arrives eight days after the event that caused it, by which time nobody connects the two.",
      ],
      lesson: [
        "Fixing the specific cause is a complete fix for this incident. The delay between cause and symptom is the thing that makes it repeat: with an eight-day lease, Wednesday's mistake becomes Monday's outage.",
        "Long leases hide capacity problems until they are total.",
      ],
    },
    {
      id: "end-recurs-thursday",
      title: "Fine until parents' evening",
      grade: "mixed",
      body: [
        "Releasing the leases got everyone working in five minutes, which was the right call at 10:20 on a Monday.",
        "Thursday's parents' evening put 240 visitor devices onto the staff VLAN and the east wing went down at 18:15, in front of 240 parents.",
      ],
      lesson: [
        "Clearing the symptom is the right first move when a lesson starts in ten minutes. It is not the end of the job, and the gap between the two is usually measured in days.",
        "The lease table told you exactly what had consumed the scope. Reading it took six minutes.",
      ],
    },
    {
      id: "end-bought-time",
      title: "Twice the addresses, same leak",
      grade: "mixed",
      body: [
        "407 addresses instead of 151, and a ninety second outage to get them.",
        "The guest SSID keeps drawing from the staff scope at about 200 addresses per event. It fills again in November, and the next person to look at it finds a /23 that is 100 percent used and no obvious reason.",
      ],
      lesson: [
        "Adding capacity to a leak buys time proportional to the capacity, and makes the eventual diagnosis harder because the numbers no longer look absurd.",
        "151 addresses used in a building with 90 staff was the clue. Doubling the scope removed the clue.",
      ],
    },
    {
      id: "end-waited-it-out",
      title: "It sorted itself out",
      grade: "mixed",
      body: [
        "Shortening the lease did eventually work, over about ninety minutes, as the old leases expired one at a time.",
        "Period three ran with no internet in the east wing. Two lessons were rearranged. Nobody ever found out what had taken the addresses.",
      ],
      lesson: [
        "A shorter lease is the right long-term setting and does nothing for an existing exhaustion, because the leases already issued keep their original duration. Releasing them is instant; waiting is not.",
        "An incident that resolves without a cause is an incident that recurs without a warning.",
      ],
    },
    {
      id: "end-static-everyone",
      title: "Three teachers sorted",
      grade: "bad",
      body: [
        "The three who complained have static addresses and working internet. Everybody who did not complain does not.",
        "Two of the statics are inside the DHCP range, so in November two devices get handed the same addresses and there is a duplicate address problem in a building nobody associates with this morning.",
      ],
      lesson: [
        "Fixing the reporters rather than the fault is how a small outage becomes a long tail of individual complaints.",
        "A static address inside a DHCP range is a conflict waiting for the scope to reach it. If you must set one, set it outside the pool.",
      ],
    },
    {
      id: "end-rebooted-everything",
      title: "Everything rebooted, nothing fixed",
      grade: "bad",
      body: [
        "The controller reboot takes the whole school's wireless down for eleven minutes, including the west wing, the library and the exam hall, which is mid-assessment.",
        "The east wing still has no addresses afterwards, because there were never any addresses to have.",
      ],
      lesson: [
        "Rebooting is a reasonable move when you have a theory it tests. Here the theory was 'wireless complaint means wireless fault', and the client's own address had already disproved it.",
        "The blast radius of a controller reboot is every user, which makes it a poor first step and an acceptable last one.",
      ],
    },
    {
      id: "end-blamed-the-isp",
      title: "Twenty minutes on hold",
      grade: "bad",
      body: [
        "The provider's line test is clean, which you could have predicted from the fact that the west wing, on the same circuit, was working the whole time.",
        "Period three starts. The east wing still has no internet, and you are still on hold.",
      ],
      lesson: [
        "One building broken and the rest fine cannot be the internet connection they share. Scope the fault before escalating it: what is broken, what is not, and what do those two sets have in common.",
        "The affected set here was one VLAN, which pointed at everything that is per-VLAN, and DHCP is the first of those.",
      ],
    },
  ],
};
