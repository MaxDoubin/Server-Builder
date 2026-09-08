/**
 * Ten complaints, each with one ceiling actually responsible.
 *
 * The complaints are written the way somebody reports them, not the way a
 * diagram would: "the backup does not finish overnight any more" rather than
 * "the window is undersized for the path". Working out which of the three
 * ceilings is binding, from the numbers, is the exercise.
 *
 * Every redHerring is a real thing somebody has bought. That is the point of
 * the field: knowing the fix matters less than knowing which expensive change
 * would have done nothing.
 */

import type { Case } from "../types";

const KiB = 1024;
const MiB = 1024 * 1024;
const GiB = 1024 * 1024 * 1024;

export const CASES: Case[] = [
  {
    slug: "overnight-backup",
    title: "The overnight backup stopped finishing overnight",
    complaint:
      "We moved the backup target to the second site. Same 1 Gbps circuit at both ends, same data, and the job that used to finish by 3am now runs into the working day. The circuit graphs show it barely touching 4 Mbps.",
    link: { bandwidth: 1_000_000_000, rtt: 80, loss: 0, window: 64 * KiB, mss: 1460 },
    bytes: 400 * GiB,
    binding: "window",
    fix: "Turn on window scaling and let the receive buffer grow. A 64KiB window over an 80ms path is 6.6 Mbps no matter what the circuit is. Filling this pipe needs 10MB in flight, which is about a hundred and fifty times the window it has.",
    redHerring:
      "Upgrading the circuit. Both ends are already gigabit and the stream is using half a per cent of it, so a 10 Gbps circuit would move the same 6.5 Mbps.",
  },
  {
    slug: "upgraded-nothing-changed",
    title: "We went from 100 Mbps to 1 Gbps and nothing got faster",
    complaint:
      "The old line was saturating, so we bought ten times the bandwidth. The transfer that took forty minutes still takes forty minutes. Window scaling is on and the buffers are generous at both ends.",
    link: { bandwidth: 1_000_000_000, rtt: 60, loss: 0.0002, window: 16 * MiB, mss: 1460 },
    bytes: 40 * GiB,
    binding: "loss",
    fix: "Find the loss. Two packets in ten thousand caps a single stream at about 17 Mbps on a 60ms path, and that ceiling does not move when the line does. Loss on a path that is not congested is usually a duplex mismatch, a failing optic or a policer.",
    redHerring:
      "More bandwidth, which is what was already tried. The loss ceiling has the line rate nowhere in it: only the segment size, the round trip and the square root of the loss rate.",
  },
  {
    slug: "file-server-fine",
    title: "The file server feels slow and nobody can say why",
    complaint:
      "Copying a large ISO off the departmental server takes about fifteen minutes and people have started complaining. The server is on the same floor, one switch away, and it is a plain gigabit connection.",
    link: { bandwidth: 1_000_000_000, rtt: 1, loss: 0, window: 512 * KiB, mss: 1460 },
    bytes: 100 * GiB,
    binding: "link",
    fix: "Nothing is wrong. On a 1ms path a 512KiB window is worth 4.2 Gbps of headroom, so the stream is sitting on the wire itself and getting essentially all of it. A hundred gigabytes at a gigabit takes about fourteen minutes and always will.",
    redHerring:
      "Tuning TCP. The window is already four times larger than this path can use, and doubling it again changes nothing, because the ceiling that is binding is the one made of copper.",
  },
  {
    slug: "transatlantic-replication",
    title: "Database replication lags every afternoon",
    complaint:
      "Replication between London and Virginia keeps a few hundred megabytes behind during the working day and catches up overnight. The link is 10 Gbps, the buffers were tuned last year, and the network team says there is no congestion.",
    link: { bandwidth: 10_000_000_000, rtt: 75, loss: 0.00005, window: 32 * MiB, mss: 1460 },
    bytes: 8 * GiB,
    binding: "loss",
    fix: "Five packets in a hundred thousand is enough to hold one stream to about 27 Mbps on this path. Either find the loss or stop using one stream: parallel streams each get their own sawtooth, which is why every serious replication tool has a concurrency setting.",
    redHerring:
      "A bigger window. It is already 32MiB against a 94MB pipe, so the window is not what is stopping it, and going to 64MiB moves the ceiling that is not binding.",
  },
  {
    slug: "satellite-uplink",
    title: "The remote site's uplink is unusable for anything interactive",
    complaint:
      "The geostationary link at the survey camp is sold as 50 Mbps and a speed test roughly agrees. File transfers out of it run at about 1 Mbps, and a single large upload takes most of a day.",
    link: { bandwidth: 50_000_000, rtt: 600, loss: 0, window: 64 * KiB, mss: 1460 },
    bytes: 4 * GiB,
    binding: "window",
    fix: "A 64KiB window over a 600ms path is 874 kbps, which is what they are seeing. Filling 50 Mbps at that latency needs 3.75MB in flight. This is exactly what the performance-enhancing proxies in satellite gear exist to paper over.",
    redHerring:
      "The speed test, which is why nobody believed the users. Speed tests open many parallel connections precisely so the per-stream window ceiling does not show up.",
  },
  {
    slug: "firmware-fetch",
    title: "A five megabyte download takes four seconds on a 100 Mbps line",
    complaint:
      "The switches pull their firmware image from a server in the other region at boot. Five megabytes, a hundred megabit path at both ends, and it consistently takes a couple of seconds rather than the half a second the arithmetic says. Nothing is congested and there is no loss.",
    link: { bandwidth: 100_000_000, rtt: 200, loss: 0, window: 1 * MiB, mss: 1460 },
    bytes: 5 * MiB,
    binding: "ramp",
    fix: "Nothing is limiting the steady rate, because it never gets there. One round trip to connect and seven more with the window still doubling is 1.6 seconds before the transfer is even up to speed, and there is only two thirds of a second of transfer left after that. This is latency, and the only fix is to stop paying it: cache it regionally, or reuse the connection.",
    redHerring:
      "A faster link. The ramp is seven round trips at any line rate, so doubling the bandwidth removes a third of a second from a two second transfer and leaves the rest exactly where it was.",
  },
  {
    slug: "vpn-mtu",
    title: "Everything through the VPN runs at a third of the speed",
    complaint:
      "Direct transfers between the two offices are fine. The same transfer inside the site-to-site tunnel runs at roughly a third of the rate. There is a little loss on the path, under a tenth of a per cent, which the vendor says is normal.",
    link: { bandwidth: 500_000_000, rtt: 30, loss: 0.0005, window: 8 * MiB, mss: 1360 },
    bytes: 20 * GiB,
    binding: "loss",
    fix: "The tunnel shrinks the segment and the loss rate scales the result directly: smaller segments mean less data per round trip in the same sawtooth. At 0.05 per cent and 30ms this comes to about 20 Mbps, and the loss is worth chasing rather than accepting.",
    redHerring:
      "\"Under a tenth of a per cent is normal.\" It is not normal on a managed path, and the square root in the bound means the difference between 0.05 per cent and 0.005 per cent is a factor of three.",
  },
  {
    slug: "metro-fibre",
    title: "The new metro circuit is not delivering what we bought",
    complaint:
      "Two buildings, three kilometres apart, on a dedicated 10 Gbps wave. A single copy between servers tops out around 2.4 Gbps and the vendor is being asked to explain it.",
    link: { bandwidth: 10_000_000_000, rtt: 2, loss: 0, window: 512 * KiB, mss: 1460 },
    bytes: 200 * GiB,
    binding: "window",
    fix: "512KiB over 2ms is 2.1 Gbps, which is what they are getting. The wave is fine. Even a 2ms path needs 2.5MB in flight to fill 10 Gbps, and nothing about a short path makes the window irrelevant.",
    redHerring:
      "Escalating to the carrier. The circuit is delivering; the host's receive buffer is the ceiling, and it is one sysctl away from not being one.",
  },
  {
    slug: "cloud-egress",
    title: "Pulling the nightly export from the cloud region takes six hours",
    complaint:
      "A single-stream download of the nightly export from the other side of the continent. Well-provisioned at both ends, buffers autotuned to 64MiB, and the provider's status page is clean.",
    link: { bandwidth: 1_000_000_000, rtt: 70, loss: 0.00002, window: 64 * MiB, mss: 1460 },
    bytes: 300 * GiB,
    binding: "loss",
    fix: "Two packets in a hundred thousand holds one stream near 46 Mbps here. Nothing is broken and nothing will be found: at this distance a single stream simply cannot use the line, which is why every cloud transfer tool defaults to parallel parts.",
    redHerring:
      "Opening a support case. A loss rate this low is background on a long path, and the answer is concurrency rather than an engineer.",
  },
  {
    slug: "loopback-nic",
    title: "The 25 Gbps card is only doing 9 Gbps",
    complaint:
      "New 25 Gbps NICs in both hosts, same rack, same top-of-rack switch. Benchmarks between them will not go past about 9.4 Gbps, and the cards report no errors.",
    link: { bandwidth: 25_000_000_000, rtt: 0.2, loss: 0, window: 32 * KiB, mss: 1460 },
    bytes: 50 * GiB,
    binding: "window",
    fix: "A 32KiB window over a 0.2ms path is 1.3 Gbps per stream, so 9.4 Gbps is several streams, not one. Even inside a rack the window is the ceiling once the card is fast enough, and a 25 Gbps path still wants 625KB in flight.",
    redHerring:
      "The cable and the optics, which is where people look first because the number resembles a 10 Gbps link. The ceiling here is arithmetic, and it changes with a buffer setting rather than a part.",
  },
];
