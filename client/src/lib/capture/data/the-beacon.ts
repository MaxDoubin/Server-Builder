import type { Capture } from "../types";
import { dns, eth, ip, packet, resetSequence, tcp, tls, udp } from "../builders";

/**
 * A beacon hiding in ordinary traffic.
 *
 * The signal is not the destination or the port, both of which are
 * unremarkable. It is the interval: every check-in is 60 seconds apart to
 * within a second, for an hour, which no human-driven traffic ever is. The
 * lesson is that timing is a detection signal in its own right.
 */
function build() {
  resetSequence();
  const MAC_WS = "00:1a:4b:22:80:11";
  const MAC_GW = "52:54:00:aa:bb:01";
  const HOST = "10.4.2.9";
  const RESOLVER = "10.4.0.53";
  const C2 = "45.63.11.208";
  const CDN = "151.101.1.140";
  const p = [];
  let t = 0;
  const step = (by: number) => (t = Number((t + by).toFixed(3)));

  /* Ordinary bursty browsing: several connections close together, then nothing. */
  const browse = (at: number, n: number) => {
    t = at;
    for (let i = 0; i < n; i++) {
      step(0.08 + (i % 3) * 0.04);
      p.push(
        packet({
          time: t,
          length: 1514,
          stream: 10,
          layers: [
            eth(MAC_WS, MAC_GW),
            ip(HOST, CDN, 64, 1500, "TCP (6)"),
            tcp({ srcport: 49200 + i, dstport: 443, seq: 1, ack: 1, flags: "PSH,ACK", window: 64240, payloadLen: 1448 }),
            tls({ "tls.record.content_type": "Application Data", "tls.record.length": 1443 }),
          ],
          info: "Application Data",
        }),
      );
    }
  };

  browse(0.4, 5);
  browse(41.2, 7);
  browse(112.8, 4);
  browse(268.1, 6);

  /*
    The beacon. Every 60 seconds to within a second, DNS then a short TLS
    session, same length every time.
  */
  for (let i = 0; i < 12; i++) {
    const base = 12 + i * 60 + (i % 3) * 0.4;
    t = base;
    p.push(
      packet({
        time: t,
        length: 88,
        layers: [
          eth(MAC_WS, MAC_GW),
          ip(HOST, RESOLVER, 64, 74, "UDP (17)"),
          udp(53000 + i, 53, 54),
          dns({
            "dns.flags.response": 0,
            "dns.qry.name": "cdn-metrics.telemetry-svc.net",
            "dns.qry.type": "A",
          }),
        ],
        info: "Standard query A cdn-metrics.telemetry-svc.net",
      }),
    );
    step(0.011);
    p.push(
      packet({
        time: t,
        length: 104,
        layers: [
          eth(MAC_GW, MAC_WS),
          ip(RESOLVER, HOST, 63, 90, "UDP (17)"),
          udp(53, 53000 + i, 70),
          dns({
            "dns.flags.response": 1,
            "dns.qry.name": "cdn-metrics.telemetry-svc.net",
            "dns.a": C2,
            "dns.resp.ttl": 60,
          }),
        ],
        info: `Standard query response A cdn-metrics.telemetry-svc.net A ${C2}`,
      }),
    );
    step(0.014);
    p.push(
      packet({
        time: t,
        length: 74,
        stream: 20 + i,
        layers: [
          eth(MAC_WS, MAC_GW),
          ip(HOST, C2, 64, 60, "TCP (6)"),
          tcp({ srcport: 55000 + i, dstport: 443, seq: 0, flags: "SYN", window: 64240 }),
        ],
        info: `${55000 + i} → 443 [SYN] Seq=0 Win=64240 Len=0`,
      }),
    );
    step(0.086);
    p.push(
      packet({
        time: t,
        length: 571,
        stream: 20 + i,
        layers: [
          eth(MAC_WS, MAC_GW),
          ip(HOST, C2, 64, 557, "TCP (6)"),
          tcp({ srcport: 55000 + i, dstport: 443, seq: 1, ack: 1, flags: "PSH,ACK", window: 64240, payloadLen: 505 }),
          tls({
            "tls.handshake.type": "Client Hello",
            "tls.handshake.extensions_server_name": "cdn-metrics.telemetry-svc.net",
            "tls.handshake.ja3": "e7d705a3286e19ea42f587b344ee6865",
          }),
        ],
        info: "Client Hello (SNI=cdn-metrics.telemetry-svc.net)",
      }),
    );
    step(0.14);
    p.push(
      packet({
        time: t,
        length: 402,
        stream: 20 + i,
        layers: [
          eth(MAC_WS, MAC_GW),
          ip(HOST, C2, 64, 388, "TCP (6)"),
          tcp({ srcport: 55000 + i, dstport: 443, seq: 506, ack: 2801, flags: "PSH,ACK", window: 64240, payloadLen: 336 }),
          tls({ "tls.record.content_type": "Application Data", "tls.record.length": 331 }),
        ],
        info: "Application Data",
      }),
    );
    step(0.02);
    p.push(
      packet({
        time: t,
        length: 66,
        stream: 20 + i,
        layers: [
          eth(MAC_WS, MAC_GW),
          ip(HOST, C2, 64, 52, "TCP (6)"),
          tcp({ srcport: 55000 + i, dstport: 443, seq: 842, ack: 2801, flags: "FIN,ACK", window: 64240 }),
        ],
        info: `${55000 + i} → 443 [FIN, ACK] Seq=842 Ack=2801 Win=64240 Len=0`,
      }),
    );
  }

  return p.sort((a, b) => a.time - b.time).map((pkt, index) => ({ ...pkt, no: index + 1 }));
}

export const theBeacon: Capture = {
  slug: "the-beacon",
  title: "Something Checks In Every Minute",
  tagline: "All of it is TLS on 443 to a name that sounds fine. One conversation is not a person.",
  difficulty: "medium",
  brief: [
    "Twelve minutes from a workstation. Everything here is encrypted and everything goes to port 443, so there is no payload to read and no obvious bad port.",
    "One of these conversations is not being driven by a human. Find it, and say what gives it away.",
  ],
  packets: build(),
  questions: [
    {
      id: "destination",
      prompt: "Which destination address is the suspicious traffic going to?",
      hintFilter: "tls.handshake.type",
      hint: "Filter for Client Hellos and look at how many go to each address, and how regularly.",
      accept: ["45.63.11.208"],
      explain: [
        "`tls.handshake.type` shows every new TLS session. Twelve of them go to 45.63.11.208 and the rest of the capture is one long-lived session to a CDN.",
        "The destination is not what makes it suspicious. Port 443 to a hosting provider is what most legitimate traffic looks like.",
      ],
    },
    {
      id: "interval",
      prompt: "How many seconds apart are the check-ins?",
      hintFilter: "ip.dst == 45.63.11.208 && tcp.flags.syn == 1",
      hint: "Filter to just the SYNs to that address and read the time column.",
      accept: ["60", "60 seconds", "every 60", "one minute", "60s"],
      explain: [
        "Sixty seconds, with a small jitter. Filtering to `tcp.flags.syn == 1 && ip.dst == 45.63.11.208` reduces the capture to twelve rows whose timestamps are 60 seconds apart.",
        "This is the actual signal. Human-driven traffic is bursty: several connections close together while a page loads, then nothing for minutes. Machine-driven traffic is regular, and regularity of this kind does not occur by accident.",
      ],
    },
    {
      id: "name",
      prompt: "What name is it resolving before each check-in?",
      hintFilter: "dns.qry.name contains telemetry",
      hint: "Each check-in starts with a DNS query. What is it asking for?",
      accept: ["cdn-metrics.telemetry-svc.net"],
      explain: [
        "cdn-metrics.telemetry-svc.net, re-resolved before every single check-in, with a 60 second TTL on the answer.",
        "The name is chosen to survive a glance at a proxy log. The two things that do not survive scrutiny are the interval and the fact that it re-resolves every time, which is how an operator keeps the ability to move the address.",
        "The SNI in the Client Hello carries the same name, which is worth knowing: even with encrypted payloads, the server name is usually in the clear.",
      ],
    },
  ],
  reading: [
    { label: "Firewall log analysis", href: "/blog/firewall-log-analysis" },
    { label: "DNS fundamentals", href: "/blog/dns-fundamentals-infrastructure" },
    { label: "Wireshark display filters", href: "/tools/wireshark-filters" },
  ],
};
