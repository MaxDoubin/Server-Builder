import type { Capture } from "../types";
import { eth, ip, packet, resetSequence, tcp, udp } from "../builders";
import type { Layer } from "../types";

const arp = (fields: Record<string, string | number>): Layer => ({
  name: "Address Resolution Protocol",
  short: "arp",
  fields: Object.entries(fields).map(([name, value]) => ({
    name,
    label: name.split(".").slice(1).join(" ").replace(/_/g, " "),
    value,
  })),
});

/**
 * ARP spoofing, which is visible in a capture and invisible everywhere else.
 *
 * The teaching point is that the attack is a claim nobody is required to
 * check. There is no authentication in ARP, so the last answer wins, and the
 * only signal is that two different MAC addresses claim the same IP within a
 * few seconds of each other.
 */
function build() {
  resetSequence();
  const GW_IP = "10.50.0.1";
  const GW_MAC = "00:1b:17:00:01:18";
  const VICTIM_IP = "10.50.0.44";
  const VICTIM_MAC = "3c:97:0e:aa:14:02";
  const ATTACKER_MAC = "08:00:27:5f:c1:9a";
  const SERVER = "10.50.0.20";
  const p = [];
  let t = 0;
  const step = (by: number) => (t = Number((t + by).toFixed(3)));

  /* Normal ARP: a request, then one reply from the real gateway. */
  p.push(
    packet({
      time: 0,
      length: 42,
      layers: [
        eth(VICTIM_MAC, "ff:ff:ff:ff:ff:ff"),
        arp({
          "arp.opcode": 1,
          "arp.src.hw_mac": VICTIM_MAC,
          "arp.src.proto_ipv4": VICTIM_IP,
          "arp.dst.hw_mac": "00:00:00:00:00:00",
          "arp.dst.proto_ipv4": GW_IP,
        }),
      ],
      info: `Who has ${GW_IP}? Tell ${VICTIM_IP}`,
    }),
  );
  step(0.001);
  p.push(
    packet({
      time: t,
      length: 60,
      layers: [
        eth(GW_MAC, VICTIM_MAC),
        arp({
          "arp.opcode": 2,
          "arp.src.hw_mac": GW_MAC,
          "arp.src.proto_ipv4": GW_IP,
          "arp.dst.hw_mac": VICTIM_MAC,
          "arp.dst.proto_ipv4": VICTIM_IP,
        }),
      ],
      info: `${GW_IP} is at ${GW_MAC}`,
    }),
  );

  /* Ordinary traffic, correctly addressed to the gateway's real MAC. */
  for (let i = 0; i < 5; i++) {
    step(0.4);
    p.push(
      packet({
        time: t,
        length: 583,
        stream: 1,
        layers: [
          eth(VICTIM_MAC, GW_MAC),
          ip(VICTIM_IP, SERVER, 64, 569, "TCP (6)"),
          tcp({ srcport: 44120, dstport: 443, seq: 1 + i * 517, ack: 1, flags: "PSH,ACK", window: 64240, payloadLen: 517 }),
        ],
        info: "Application Data",
      }),
    );
  }

  /*
    The attack. Unsolicited replies claiming to be the gateway, repeated
    every two seconds because the victim's cache would otherwise time out.
  */
  for (let i = 0; i < 8; i++) {
    t = Number((3.2 + i * 2).toFixed(3));
    p.push(
      packet({
        time: t,
        length: 60,
        layers: [
          eth(ATTACKER_MAC, VICTIM_MAC),
          arp({
            "arp.opcode": 2,
            "arp.src.hw_mac": ATTACKER_MAC,
            "arp.src.proto_ipv4": GW_IP,
            "arp.dst.hw_mac": VICTIM_MAC,
            "arp.dst.proto_ipv4": VICTIM_IP,
          }),
        ],
        info: `${GW_IP} is at ${ATTACKER_MAC}  (unsolicited)`,
      }),
    );
    /* The same lie told to the gateway, so the attacker sees both directions. */
    step(0.004);
    p.push(
      packet({
        time: t,
        length: 60,
        layers: [
          eth(ATTACKER_MAC, GW_MAC),
          arp({
            "arp.opcode": 2,
            "arp.src.hw_mac": ATTACKER_MAC,
            "arp.src.proto_ipv4": VICTIM_IP,
            "arp.dst.hw_mac": GW_MAC,
            "arp.dst.proto_ipv4": GW_IP,
          }),
        ],
        info: `${VICTIM_IP} is at ${ATTACKER_MAC}  (unsolicited)`,
      }),
    );
  }

  /* After the poisoning, the victim's frames go to the attacker's MAC. */
  for (let i = 0; i < 7; i++) {
    t = Number((4.1 + i * 1.9).toFixed(3));
    p.push(
      packet({
        time: t,
        length: 583,
        stream: 1,
        layers: [
          eth(VICTIM_MAC, ATTACKER_MAC),
          ip(VICTIM_IP, SERVER, 64, 569, "TCP (6)"),
          tcp({ srcport: 44120, dstport: 443, seq: 2586 + i * 517, ack: 1, flags: "PSH,ACK", window: 64240, payloadLen: 517 }),
        ],
        info: "Application Data",
      }),
    );
  }

  /* A DNS lookup that also leaves via the wrong MAC. */
  t = 6.4;
  p.push(
    packet({
      time: t,
      length: 84,
      layers: [
        eth(VICTIM_MAC, ATTACKER_MAC),
        ip(VICTIM_IP, "10.50.0.53", 64, 70, "UDP (17)"),
        udp(41022, 53, 50),
      ],
      info: "Standard query A intranet.acme.example",
    }),
  );

  return p.sort((a, b) => a.time - b.time).map((pkt, index) => ({ ...pkt, no: index + 1 }));
}

export const whoHasTheGateway: Capture = {
  slug: "who-has-the-gateway",
  title: "Who Has the Gateway?",
  tagline: "Two different MAC addresses claim to be 10.50.0.1, four seconds apart.",
  difficulty: "medium",
  brief: [
    "A capture from an access switch port. The workstation is 10.50.0.44 and the default gateway is 10.50.0.1.",
    "Something on this segment is claiming to be something it is not. Find it, and say how the workstation's traffic changes once it does.",
  ],
  packets: build(),
  questions: [
    {
      id: "attacker",
      prompt: "Which MAC address is falsely claiming to be the gateway?",
      hintFilter: "arp.src.proto_ipv4 == 10.50.0.1",
      hint: "Filter to ARP replies that claim to be the gateway's address and compare the hardware addresses.",
      accept: ["08:00:27:5f:c1:9a"],
      explain: [
        "Two MACs answer for 10.50.0.1. The first, 00:1b:17:00:01:18, replies once in response to a request. The second, 08:00:27:5f:c1:9a, replies eight times without being asked.",
        "There is nothing in ARP that decides which is right. It has no authentication at all, so the last answer received wins, and repeating the lie every two seconds guarantees it is the last one.",
      ],
    },
    {
      id: "unsolicited",
      prompt: "How many ARP requests were sent for the gateway in this capture?",
      hintFilter: "arp.opcode == 1",
      hint: "Compare the number of requests with the number of replies.",
      accept: ["1", "one", "just one", "a single"],
      explain: [
        "One request, seventeen replies. That ratio is the signal: sixteen of those replies answer a question nobody asked.",
        "Unsolicited ARP replies are called gratuitous ARP and they have legitimate uses, such as a failover announcing that an address has moved. What makes these different is that they repeat on a two-second timer, and that they tell the gateway a matching lie about the workstation so the attacker sits in both directions.",
      ],
    },
    {
      id: "effect",
      prompt: "After the poisoning, which destination MAC does the workstation's traffic use?",
      hintFilter: "ip.src == 10.50.0.44",
      hint: "Look at the Ethernet destination on the workstation's packets before and after 3.2 seconds.",
      accept: ["08:00:27:5f:c1:9a", "the attacker", "attackers mac"],
      explain: [
        "The IP layer is unchanged: still 10.50.0.44 to 10.50.0.20. Only the Ethernet destination changed, from the gateway's real MAC to the attacker's.",
        "That is why this is invisible from the host. Every tool on the workstation reports the same source and destination addresses, the same route, and the same gateway IP. Only the frame's destination MAC and the ARP cache know, and nothing on a normal desktop looks at either.",
        "The defenses are switch features rather than host ones: dynamic ARP inspection, validating ARP against the DHCP snooping binding table.",
      ],
    },
  ],
  reading: [
    { label: "DHCP snooping and dynamic ARP inspection", href: "/blog/dhcp-snooping-arp-inspection" },
    { label: "Network access control with 802.1X", href: "/blog/network-access-control-8021x" },
    { label: "MAC address lookup", href: "/tools/mac-lookup" },
  ],
};
