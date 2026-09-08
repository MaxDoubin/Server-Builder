import type { Capture } from "../types";
import { eth, http, ip, packet, resetSequence, tcp } from "../builders";

/**
 * A capture from a network with one device still speaking plaintext HTTP.
 *
 * The teaching point is that finding it is a filter, not a search: there are
 * 30 packets and only three carry the answer, and the way to them is
 * `http.request.method == POST`, not scrolling.
 */
function build() {
  resetSequence();
  const MAC_WS = "3c:58:c2:11:9f:04";
  const MAC_GW = "52:54:00:aa:bb:01";
  const WS = "10.20.5.61";
  const GW = "10.20.5.1";
  const WEB = "10.20.9.40";
  const CDN = "93.184.216.34";
  const p = [];
  let t = 0;
  const step = (by: number) => (t = Number((t + by).toFixed(6)));

  /* Ordinary browsing to an HTTPS site, so the capture is not all evidence. */
  for (let i = 0; i < 6; i++) {
    step(0.31);
    p.push(
      packet({
        time: t,
        length: 1514,
        stream: 1,
        layers: [
          eth(MAC_WS, MAC_GW),
          ip(WS, CDN, 64, 1500, "TCP (6)"),
          tcp({ srcport: 51402 + i, dstport: 443, seq: 1 + i * 1448, ack: 1, flags: "PSH,ACK", window: 64240, payloadLen: 1448 }),
        ],
        info: `51402 → 443 [PSH, ACK] Seq=${1 + i * 1448} Len=1448`,
      }),
    );
  }

  /* The three-way handshake to the internal admin panel, over port 80. */
  step(0.4);
  p.push(
    packet({
      time: t,
      length: 74,
      stream: 2,
      layers: [
        eth(MAC_WS, MAC_GW),
        ip(WS, WEB, 64, 60, "TCP (6)"),
        tcp({ srcport: 51999, dstport: 80, seq: 0, flags: "SYN", window: 64240 }),
      ],
      info: "51999 → 80 [SYN] Seq=0 Win=64240 Len=0",
    }),
  );
  step(0.002);
  p.push(
    packet({
      time: t,
      length: 74,
      stream: 2,
      layers: [
        eth(MAC_GW, MAC_WS),
        ip(WEB, WS, 63, 60, "TCP (6)"),
        tcp({ srcport: 80, dstport: 51999, seq: 0, ack: 1, flags: "SYN,ACK", window: 65160 }),
      ],
      info: "80 → 51999 [SYN, ACK] Seq=0 Ack=1 Win=65160 Len=0",
    }),
  );
  step(0.001);
  p.push(
    packet({
      time: t,
      length: 66,
      stream: 2,
      layers: [
        eth(MAC_WS, MAC_GW),
        ip(WS, WEB, 64, 52, "TCP (6)"),
        tcp({ srcport: 51999, dstport: 80, seq: 1, ack: 1, flags: "ACK", window: 64240 }),
      ],
      info: "51999 → 80 [ACK] Seq=1 Ack=1 Win=64240 Len=0",
    }),
  );

  /* GET the login page. */
  step(0.004);
  p.push(
    packet({
      time: t,
      length: 396,
      stream: 2,
      payload:
        "GET /admin/login HTTP/1.1\r\nHost: printers.office.example\r\nUser-Agent: Mozilla/5.0\r\nAccept: text/html\r\n\r\n",
      layers: [
        eth(MAC_WS, MAC_GW),
        ip(WS, WEB, 64, 382, "TCP (6)"),
        tcp({ srcport: 51999, dstport: 80, seq: 1, ack: 1, flags: "PSH,ACK", window: 64240, payloadLen: 330 }),
        http({
          "http.request.method": "GET",
          "http.request.uri": "/admin/login",
          "http.host": "printers.office.example",
          "http.user_agent": "Mozilla/5.0",
        }),
      ],
      info: "GET /admin/login HTTP/1.1",
    }),
  );
  step(0.031);
  p.push(
    packet({
      time: t,
      length: 1102,
      stream: 2,
      payload: "HTTP/1.1 200 OK\r\nServer: lighttpd/1.4.55\r\nContent-Type: text/html\r\n\r\n<form method=post ...>",
      layers: [
        eth(MAC_GW, MAC_WS),
        ip(WEB, WS, 63, 1088, "TCP (6)"),
        tcp({ srcport: 80, dstport: 51999, seq: 1, ack: 331, flags: "PSH,ACK", window: 65160, payloadLen: 1036 }),
        http({
          "http.response.code": "200",
          "http.server": "lighttpd/1.4.55",
          "http.content_type": "text/html",
        }),
      ],
      info: "HTTP/1.1 200 OK  (text/html)",
    }),
  );

  /* The POST. This is the whole capture. */
  step(4.812);
  p.push(
    packet({
      time: t,
      length: 462,
      stream: 2,
      payload:
        "POST /admin/login HTTP/1.1\r\n" +
        "Host: printers.office.example\r\n" +
        "Content-Type: application/x-www-form-urlencoded\r\n" +
        "Content-Length: 46\r\n\r\n" +
        "username=svc_print&password=Pr1nt%21ng2019&go=1",
      layers: [
        eth(MAC_WS, MAC_GW),
        ip(WS, WEB, 64, 448, "TCP (6)"),
        tcp({ srcport: 51999, dstport: 80, seq: 331, ack: 1037, flags: "PSH,ACK", window: 63204, payloadLen: 396 }),
        http({
          "http.request.method": "POST",
          "http.request.uri": "/admin/login",
          "http.host": "printers.office.example",
          "http.content_type": "application/x-www-form-urlencoded",
          "http.file_data": "username=svc_print&password=Pr1nt%21ng2019&go=1",
        }),
      ],
      info: "POST /admin/login HTTP/1.1 (application/x-www-form-urlencoded)",
    }),
  );
  step(0.044);
  p.push(
    packet({
      time: t,
      length: 388,
      stream: 2,
      payload: "HTTP/1.1 302 Found\r\nLocation: /admin/status\r\nSet-Cookie: sid=8f21ab; path=/\r\n\r\n",
      layers: [
        eth(MAC_GW, MAC_WS),
        ip(WEB, WS, 63, 374, "TCP (6)"),
        tcp({ srcport: 80, dstport: 51999, seq: 1037, ack: 727, flags: "PSH,ACK", window: 64180, payloadLen: 322 }),
        http({
          "http.response.code": "302",
          "http.location": "/admin/status",
          "http.set_cookie": "sid=8f21ab; path=/",
        }),
      ],
      info: "HTTP/1.1 302 Found  (Location: /admin/status)",
    }),
  );

  /* More HTTPS noise afterwards, so the POST is not simply the last packet. */
  for (let i = 0; i < 8; i++) {
    step(0.22);
    p.push(
      packet({
        time: t,
        length: 1514,
        stream: 1,
        layers: [
          eth(MAC_WS, MAC_GW),
          ip(WS, CDN, 64, 1500, "TCP (6)"),
          tcp({ srcport: 51402, dstport: 443, seq: 8688 + i * 1448, ack: 1, flags: "PSH,ACK", window: 64240, payloadLen: 1448 }),
        ],
        info: `51402 → 443 [PSH, ACK] Seq=${8688 + i * 1448} Len=1448`,
      }),
    );
  }
  return p;
}

export const credentialsInTheClear: Capture = {
  slug: "credentials-in-the-clear",
  title: "Credentials in the Clear",
  tagline: "Twenty-three packets from an office VLAN. One of them is a password.",
  difficulty: "easy",
  brief: [
    "This is a two-minute capture from a switch port in an office. Most of it is ordinary HTTPS browsing, which you cannot read and do not need to.",
    "One conversation is not encrypted. Find it, and answer the three questions.",
  ],
  packets: build(),
  questions: [
    {
      id: "host",
      prompt: "Which hostname was contacted over plain HTTP?",
      hintFilter: "http",
      hint: "Filter for the http protocol. Two packets carry a Host header.",
      accept: ["printers.office.example"],
      explain: [
        "`http` on its own filters to packets Wireshark has dissected as HTTP, which here is four packets out of twenty-three.",
        "The Host header is in the request. HTTPS traffic to the same capture shows as TCP on port 443 with nothing readable, which is the contrast worth noticing.",
      ],
    },
    {
      id: "username",
      prompt: "What username was submitted?",
      hintFilter: "http.request.method == POST",
      hint: "A login is a POST. Filter for it and read the form data.",
      accept: ["svc_print"],
      explain: [
        "`http.request.method == POST` finds it in one line. The form body is in http.file_data, and it is url-encoded, not encrypted: username=svc_print&password=Pr1nt%21ng2019.",
        "%21 is an exclamation mark. The password is Pr1nt!ng2019, and it is readable by anyone on the path, on any switch with a mirror port, and in any capture anyone ever took of this VLAN.",
      ],
    },
    {
      id: "outcome",
      prompt: "Did the login succeed? Give the HTTP status code that says so.",
      hintFilter: "http.response.code",
      hint: "Look at what the server sent back immediately after the POST.",
      accept: ["302", "302 found", "yes 302"],
      explain: [
        "302 Found with a Location of /admin/status and a Set-Cookie. A failed login on this device would return the login page again with a 200.",
        "The Set-Cookie is the second credential in this capture: sid=8f21ab is a valid session for as long as the device keeps it, and it is also in the clear.",
      ],
    },
  ],
  reading: [
    { label: "TLS, and what it is actually protecting", href: "/blog/tls-modern-encryption" },
    { label: "Wireshark display filters", href: "/tools/wireshark-filters" },
    { label: "Packet header reference", href: "/tools/packet-headers" },
  ],
};
