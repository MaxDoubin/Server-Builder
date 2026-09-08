import type { Scenario } from "../types";

/** Physical access, where the control is a person's willingness to be rude. */
export const badgeTailgate: Scenario = {
  slug: "badge-tailgate",
  title: "Somebody Held the Door",
  tagline: "A man with a laptop bag and no badge is in the second floor comms room.",
  difficulty: "medium",
  category: "Physical security",
  role: "You are the infrastructure lead. Somebody from finance has just messaged you privately because they let a man in behind them this morning and have started to worry about it.",
  clockStart: "Tuesday 14:05",
  brief: [
    "At 08:52 a man carrying a laptop bag and a lanyard with no card in it followed a finance employee through the turnstile. He said thanks, said he was there for the UPS survey, and went upstairs.",
    "There is no UPS survey booked. It is now 14:05.",
  ],
  start: "the-message",
  reading: [
    { label: "Network access control with 802.1X", href: "/blog/network-access-control-8021x" },
    { label: "DHCP snooping and dynamic ARP inspection", href: "/blog/dhcp-snooping-arp-inspection" },
  ],
  scenes: [
    {
      id: "the-message",
      mood: "tense",
      where: "Your desk",
      body: [
        "Five hours. The comms rooms are badge controlled, the ground floor plant room is not, and neither is the second floor riser cupboard, which has a patch panel and four spare ports in it.",
      ],
      choices: [
        { label: "Pull the badge and camera records for the whole day first", to: "records", cost: 20 },
        { label: "Walk the comms rooms and risers now, looking for hardware", to: "walk", cost: 25 },
        { label: "Check the switches for ports that came up today", to: "switches", cost: 12 },
        { label: "Call it a false alarm, he probably was a contractor", to: "end-assumed-fine", cost: 0 },
      ],
    },
    {
      id: "switches",
      mood: "critical",
      where: "The access switches",
      body: [
        "Two ports came up today that were down yesterday. One is a meeting room on the ground floor, which is normal. The other is Gi1/0/34 on the second floor riser, and it learned a MAC address whose OUI belongs to a manufacturer of single-board computers.",
        "It has an address from the office scope and it has been sending steadily since 09:14.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "sw-fl2-a",
          lines: [
            "Port      Name        Status   Vlan  Uptime     MAC",
            "Gi1/0/34  riser-spare connected  20  4:51:22    b8:27:eb:44:1a:0c",
            "",
            "b8:27:eb  Raspberry Pi Foundation",
            "",
            "$ show ip dhcp snooping binding | include b8:27:eb",
            "b8:27:eb:44:1a:0c   10.20.4.61   86400   dhcp-snooping   20  Gi1/0/34",
            "",
            "$ show interfaces Gi1/0/34 | include packets",
            "  8,441,203 packets input, 1,904,556,110 bytes",
            "  9,120,884 packets output, 6,140,229,004 bytes",
          ],
        },
      ],
      choices: [
        { label: "Shut the port, then go and collect the device", to: "shut-and-collect", cost: 6 },
        { label: "Capture its traffic for ten minutes before you touch it", to: "capture", cost: 12 },
        { label: "Unplug it physically first", to: "unplugged", cost: 10 },
      ],
    },
    {
      id: "capture",
      mood: "critical",
      where: "A SPAN session on Gi1/0/34",
      body: [
        "Ten minutes of traffic. It is an SSH reverse tunnel to a VPS, carrying an ongoing session, and alongside it a slow ARP scan of the whole /22 and repeated LLMNR and NBT-NS responses.",
        "It is answering name resolution requests on behalf of hosts that do not exist, which is how credentials get relayed.",
      ],
      evidence: [
        {
          kind: "terminal",
          title: "Ten minutes of Gi1/0/34",
          lines: [
            "PROTO  PEER                 BYTES      NOTE",
            "ssh    45.63.11.208:443     412 MB     outbound, established 09:14",
            "arp    broadcast            1.2 MB     sequential sweep 10.20.0.0/22",
            "llmnr  broadcast            880 KB     answering every query",
            "smb    10.20.7.14           41 MB      NTLM authentication observed",
            "smb    10.20.7.14           ...        SMB signing: not required",
          ],
        },
      ],
      choices: [
        { label: "Shut the port now, this is credential relay in progress", to: "shut-and-collect", cost: 3 },
        { label: "Keep capturing, the tunnel endpoint is useful intelligence", to: "end-captured-too-long", cost: 60 },
      ],
    },
    {
      id: "shut-and-collect",
      mood: "recovering",
      where: "The second floor riser",
      body: [
        "The port goes down and the tunnel drops. The device is a Raspberry Pi in a plastic case cable-tied behind the patch panel, with a 4G dongle as well as the ethernet, which means shutting the port removed one of its two paths.",
        "You photograph it in place, note the time, and pull the power and the dongle together.",
      ],
      choices: [
        { label: "Preserve it properly and work out what credentials it captured", to: "credentials", cost: 90 },
        { label: "Bin it and change the door code", to: "end-binned-it", cost: 20 },
      ],
    },
    {
      id: "unplugged",
      mood: "tense",
      where: "The riser cupboard",
      body: [
        "You pull the ethernet. The device keeps running, because it has a 4G dongle, and you have just told whoever is watching that they have been found.",
        "The tunnel goes quiet three minutes later. The SD card is wiped remotely before you get back to your desk with it.",
      ],
      choices: [
        { label: "Work out what it captured from the network side instead", to: "credentials", cost: 90 },
        { label: "It is gone. Change the door codes and move on", to: "end-binned-it", cost: 20 },
      ],
    },
    {
      id: "records",
      mood: "tense",
      where: "Badge logs and camera footage",
      body: [
        "08:52 at the turnstile behind a finance employee. 09:06 into the second floor riser, behind a cleaner. 09:21 out of the building, twenty-nine minutes total.",
        "He was carrying the laptop bag on the way in and not on the way out.",
      ],
      choices: [
        { label: "Check the switches for anything that came up in that window", to: "switches", cost: 12 },
        { label: "Walk the risers and find it physically", to: "walk", cost: 25 },
      ],
    },
    {
      id: "walk",
      mood: "tense",
      where: "Four risers and two comms rooms",
      body: [
        "Twenty-five minutes of looking behind patch panels with a torch. You find it on the second floor: a small device cable-tied out of sight, ethernet into a spare port, with a 4G dongle in its USB socket.",
        "Nothing has been logged, nothing has been captured, and it is still running.",
      ],
      choices: [
        { label: "Photograph it, then shut the switch port before touching it", to: "shut-and-collect", cost: 8 },
        { label: "Capture its traffic first", to: "capture", cost: 12 },
        { label: "Pull it out", to: "unplugged", cost: 4 },
      ],
    },
    {
      id: "credentials",
      mood: "tense",
      where: "Working out the blast radius",
      body: [
        "SMB signing is not required on the file server, LLMNR and NBT-NS are on across the estate, and the device answered name resolution for five hours.",
        "Every workstation that mistyped a share name in that window offered an NTLM authentication to a machine that was not the one it wanted.",
      ],
      choices: [
        { label: "Reset the affected accounts, require SMB signing, disable LLMNR estate-wide", to: "end-fixed-the-class", cost: 300 },
        { label: "Reset the accounts that authenticated to it", to: "end-reset-only", cost: 90 },
      ],
    },
  ],
  endings: [
    {
      id: "end-fixed-the-class",
      title: "The device, the credentials, and the protocols that helped it",
      grade: "best",
      body: [
        "Device recovered with its storage intact, tunnel endpoint handed to law enforcement, forty-one accounts reset, SMB signing required, LLMNR and NBT-NS disabled by policy, and 802.1X enabled on every access port so an unauthenticated device gets nothing but a guest VLAN.",
        "The turnstile is unchanged, because the turnstile was never going to be the control.",
      ],
      lesson: [
        "The physical failure got someone through a door. Everything after that was the network trusting whatever was plugged into it, which is the part you can actually fix.",
        "LLMNR and NBT-NS exist to answer name lookups that DNS could not, which in practice means answering typos. Turning them off removes an entire family of relay attacks and breaks almost nothing.",
      ],
    },
    {
      id: "end-reset-only",
      title: "Accounts reset, ports still open",
      grade: "good",
      body: [
        "The device is gone and the accounts that authenticated to it are reset.",
        "Every spare port in every riser still hands an address and full VLAN 20 access to anything plugged into it, and LLMNR is still on.",
      ],
      lesson: [
        "Resetting the credentials it captured is the immediate fix. The reason a plugged-in device could capture anything is the durable one.",
      ],
    },
    {
      id: "end-binned-it",
      title: "Binned, code changed",
      grade: "bad",
      body: [
        "The device is in a drawer, the riser code is changed, and nobody knows what it did for five hours or where its tunnel went.",
        "Forty-one NTLM authentications were relayed. Two of them belonged to accounts with local administrator rights on the file server.",
      ],
      lesson: [
        "The device is evidence, not litter. Its storage answers what it captured, its tunnel answers who was on the other end, and both are gone once it is unplugged and pocketed.",
        "'What did it do' matters more than 'is it still there'.",
      ],
    },
    {
      id: "end-captured-too-long",
      title: "An excellent capture",
      grade: "bad",
      body: [
        "An hour of traffic, a full picture of the tooling, and the tunnel endpoint.",
        "In that hour it relayed nineteen more authentications, one of them a domain administrator who was troubleshooting a share at the time.",
      ],
      lesson: [
        "Capturing before cutting is right when the thing you are watching is not actively taking credentials. This one was, and the trade reverses the moment you can see it succeeding.",
      ],
    },
    {
      id: "end-assumed-fine",
      title: "He was probably a contractor",
      grade: "catastrophic",
      body: [
        "The device stayed behind the patch panel for four months, tunnelling out over 4G after somebody eventually reused the ethernet port for a printer.",
        "It was found during a cabling refresh in January, by an electrician, who mentioned it in passing.",
      ],
      lesson: [
        "A report of an unbadged stranger in a comms room costs half an hour to check and is the cheapest hour in security.",
        "The finance employee did the hard part, which was saying something after the fact. Treating that as a false alarm teaches everyone not to bother next time.",
      ],
    },
  ],
};
