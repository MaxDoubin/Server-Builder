/**
 * Eight frames, each crossing a configuration somebody signed off.
 *
 * No path states its answer. Each declares the frame and the ports it
 * crosses, the model carries it, and the correct option is whichever one's
 * value matches. CI requires exactly one to match, so a case whose prose and
 * configuration disagree fails the build.
 *
 * The switch names and interfaces are constructed, like every host on this
 * site. The rules are 802.1Q and cited on the page.
 */

import type { Path, Port } from "../types";

const access = (name: string, vlan: number, note?: string): Port => ({
  name,
  mode: "access",
  accessVlan: vlan,
  ...(note ? { note } : {}),
});

const trunk = (name: string, native: number, allowed?: number[], note?: string): Port => ({
  name,
  mode: "trunk",
  nativeVlan: native,
  ...(allowed ? { allowed } : {}),
  ...(note ? { note } : {}),
});

export const PATHS: Path[] = [
  {
    slug: "the-native-mismatch",
    name: "The native VLAN nobody changed",
    brief:
      "Two switches, one trunk between them. The access layer switch was configured last year by somebody who moved the native VLAN off 1 as a hardening step. The new distribution switch arrived with the factory default and nobody touched the trunk, because the trunk came up and the VLANs passed.",
    hops: [
      {
        device: "acc-01",
        ingress: access("Gi1/0/7", 30, "a printer, VLAN 30"),
        egress: trunk("Gi1/0/48", 30, [10, 20, 30, 99], "native 30, moved off VLAN 1 deliberately"),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/1", 1, [1, 10, 20, 30, 99], "native 1, which is the default nobody changed"),
        egress: access("Gi1/0/4", 1, "a management workstation, VLAN 1"),
      },
    ],
    frame: { tags: [], label: "an ordinary untagged frame from the printer" },
    question: "The printer sends a broadcast. Which VLAN is it in when it reaches dist-01?",
    options: [
      { id: "a", claim: "VLAN 30. The frame started in 30 and a trunk carries VLANs without changing them.", value: "30" },
      { id: "b", claim: "VLAN 1. acc-01 sends its native VLAN untagged, and an untagged arrival joins dist-01's native VLAN, which is 1.", value: "1" },
      { id: "c", claim: "Dropped. The two ends disagree, so the trunk rejects the frame.", value: "dropped" },
      { id: "d", claim: "VLAN 99. The mismatch pushes traffic into the highest allowed VLAN on both sides.", value: "99" },
    ],
    why: "A trunk sends its native VLAN with no tag at all, which is the whole point of having a native VLAN: a switch on the other end that knows nothing about tagging still gets traffic. So VLAN 30 leaves acc-01 as bare Ethernet, and dist-01, seeing an untagged frame on a trunk, does the only thing it can and puts it in its own native VLAN. VLAN 30 and VLAN 1 are now one broadcast domain in that direction. Neither switch logs anything, because neither switch has done anything wrong: each is following its own configuration exactly.",
    breaks: "that a trunk carries a VLAN through unchanged, when the native VLAN crosses the wire with nothing on it to say which VLAN it was",
  },
  {
    slug: "tagged-both-ends",
    name: "The same link, with the native carrying nothing",
    brief:
      "The same two switches after somebody read about the mismatch. The native VLAN on both trunks is now 999, which exists in the VLAN database, is allowed on the trunk, and has no access port anywhere in it. The printer is still in VLAN 30.",
    hops: [
      {
        device: "acc-01",
        ingress: access("Gi1/0/7", 30, "the printer, still VLAN 30"),
        egress: trunk("Gi1/0/48", 999, [10, 20, 30, 999], "native 999, a VLAN with no hosts in it"),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/1", 999, [10, 20, 30, 999], "native 999 as well, which is the fix"),
        egress: access("Gi1/0/9", 30, "a print server, VLAN 30"),
      },
    ],
    frame: { tags: [], label: "an ordinary untagged frame from the printer" },
    question: "Which VLAN does the frame arrive in now?",
    options: [
      { id: "a", claim: "VLAN 30. It is not the native VLAN, so it crosses with a tag on it, and a tag says which VLAN it is.", value: "30" },
      { id: "b", claim: "VLAN 999. The native VLAN is what an untagged frame becomes.", value: "999" },
      { id: "c", claim: "Dropped. VLAN 30 is not the native VLAN on either end, so it cannot cross.", value: "dropped" },
      { id: "d", claim: "VLAN 1. Every trunk falls back to VLAN 1 for traffic it cannot classify.", value: "1" },
    ],
    why: "This is the control, and it is worth being able to recognize as fast as the fault. VLAN 30 is not native on this trunk, so it crosses carrying a tag, and a tagged frame tells the far end exactly which VLAN it belongs to. The mismatch is gone not because the natives now agree, though they do, but because the native VLAN has been made a VLAN that nothing uses: even if somebody changed one end tomorrow, the only traffic that would land in the wrong place is traffic that does not exist.",
    breaks: "that matching the native VLANs is the fix, when the durable fix is a native VLAN that carries nothing",
  },
  {
    slug: "double-tagged",
    name: "Two tags and an access port",
    brief:
      "A conference room port in VLAN 1. The trunk to the distribution switch has its native VLAN left at 1. Somebody on the conference room port sends a frame with an 802.1Q tag already in it, naming VLAN 20, which is the finance VLAN they have no access to.",
    hops: [
      {
        device: "acc-02",
        ingress: access("Gi1/0/22", 1, "the conference room, VLAN 1, which is also the trunk's native"),
        egress: trunk("Gi1/0/48", 1, [1, 10, 20], "native 1"),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/2", 1, [1, 10, 20]),
        egress: access("Gi1/0/11", 20, "a finance workstation, VLAN 20"),
      },
    ],
    frame: { tags: [20], label: "a frame the attacker has already tagged for VLAN 20" },
    question: "Where does the frame end up?",
    options: [
      { id: "a", claim: "Dropped at acc-02. An access port rejects a tagged frame.", value: "dropped" },
      { id: "b", claim: "VLAN 1. The access port classifies by port, so the tag is ignored and stays ignored.", value: "1" },
      { id: "c", claim: "VLAN 20. acc-02 puts the frame in VLAN 1 and sends it untagged because 1 is native, which leaves the attacker's tag as the outermost one for dist-01 to read.", value: "20" },
      { id: "d", claim: "VLAN 10. The middle allowed VLAN, since the frame matches neither end's configuration.", value: "10" },
    ],
    why: "This is VLAN hopping, and every step in it is a switch behaving correctly. The access port classifies by port and does not read the tag, so the frame is in VLAN 1 and the tag is just bytes. VLAN 1 is native on the trunk, so the switch adds nothing on the way out. What crosses the wire is a frame whose outermost tag says 20, written by the attacker, and dist-01 has no way to know who wrote it. The attack needs the access VLAN to be the trunk's native VLAN, which is why the advice is a native VLAN with no hosts in it, and why dropping tagged frames on access ports is the other half of the fix.",
    breaks: "that a host on an access port cannot influence which VLAN its frames end up in",
  },
  {
    slug: "double-tagged-defended",
    name: "The same attack, one VLAN away",
    brief:
      "The same conference room and the same attacker, after the native VLAN on the trunk was moved to 999. The conference room port is still VLAN 1. The attacker sends the same double tagged frame.",
    hops: [
      {
        device: "acc-02",
        ingress: access("Gi1/0/22", 1, "the conference room, VLAN 1"),
        egress: trunk("Gi1/0/48", 999, [1, 10, 20, 999], "native 999 now, and VLAN 1 is no longer it"),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/2", 999, [1, 10, 20, 999]),
        egress: access("Gi1/0/11", 20, "the finance workstation, VLAN 20"),
      },
    ],
    frame: { tags: [20], label: "the same frame, tagged for VLAN 20 by the attacker" },
    question: "What happens this time?",
    options: [
      { id: "a", claim: "VLAN 20, unchanged. Moving the native VLAN does not stop an attacker writing their own tag.", value: "20" },
      { id: "b", claim: "Dropped. The frame is in VLAN 1, which is not what the egress access port carries, so it does not get out.", value: "dropped" },
      { id: "c", claim: "VLAN 1. It crosses in VLAN 1 and arrives in VLAN 1, and the attacker's tag is carried along inside.", value: "1" },
      { id: "d", claim: "VLAN 999. The native VLAN swallows anything it cannot classify.", value: "999" },
    ],
    why: "The frame is in VLAN 1 at acc-02 exactly as before. The difference is that VLAN 1 is no longer native on the trunk, so acc-02 pushes a tag saying 1, and now the outermost tag on the wire is the switch's, not the attacker's. dist-01 reads 1, puts the frame in VLAN 1, and the attacker's tag is buried where nothing will look at it. It gets as far as the finance access port and stops, because that port is in VLAN 20 and the frame is in VLAN 1. One line of configuration, and the attack is a frame that goes nowhere.",
    breaks: "that VLAN hopping is a flaw in tagging itself, rather than a consequence of one specific configuration choice",
  },
  {
    slug: "pruned-in-the-middle",
    name: "The VLAN that stops halfway",
    brief:
      "Three switches in a row. A new VLAN 40 was added for the CCTV recorders and allowed on the trunk at each end of the path. The middle switch's trunks were configured by somebody working from a list that predates VLAN 40.",
    hops: [
      {
        device: "acc-03",
        ingress: access("Gi1/0/2", 40, "a camera, VLAN 40"),
        egress: trunk("Gi1/0/48", 999, [10, 20, 40, 999], "VLAN 40 allowed"),
      },
      {
        device: "acc-04",
        ingress: trunk("Gi1/0/47", 999, [10, 20, 40, 999], "allowed on the way in"),
        egress: trunk("Gi1/0/48", 999, [10, 20, 999], "and not on the way out"),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/3", 999, [10, 20, 40, 999], "allowed here too"),
        egress: access("Gi1/0/20", 40, "the recorder, VLAN 40"),
      },
    ],
    frame: { tags: [], label: "an untagged frame from the camera" },
    question: "The camera cannot reach the recorder. Where does the frame stop?",
    options: [
      { id: "a", claim: "It does not stop. VLAN 40 is allowed at both ends of the path, which is what matters.", value: "40" },
      { id: "b", claim: "VLAN 999. Not being allowed, it falls back to the native VLAN and crosses anyway.", value: "999" },
      { id: "c", claim: "VLAN 10. Pruned traffic is remapped to the lowest allowed VLAN.", value: "10" },
      { id: "d", claim: "Dropped, on acc-04, on the way out: that trunk's allowed list does not include VLAN 40.", value: "dropped" },
    ],
    why: "An allowed list is checked on every trunk the frame crosses, in both directions, and there is no fallback: a VLAN that is not permitted out of a port does not leave. The reason this takes so long to find is that the two switches anybody thinks to check are the two ends, and both are right. The middle switch is a transit device that nobody associates with the cameras, its trunk came up years ago, and nothing about it appears in a ticket about CCTV.",
    breaks: "that allowing a VLAN at both ends of a path is enough, when every trunk in between checks its own list",
  },
  {
    slug: "the-untagged-arrival",
    name: "A frame with no tag on a trunk that expects one",
    brief:
      "A hypervisor uplink. The virtual switch was configured to tag every VLAN it sends, including the one the management interface uses, and the physical trunk's native VLAN is 999. The management interface's VLAN is 10. Somebody has left one virtual port untagged by mistake.",
    hops: [
      {
        device: "esx-01 vSwitch",
        ingress: access("vmk0", 10, "the management interface, expected to be VLAN 10"),
        egress: trunk("vmnic0", 10, [10, 20, 30], "native 10 on the virtual side, which is the mistake"),
      },
      {
        device: "acc-05",
        ingress: trunk("Gi1/0/12", 999, [10, 20, 30, 999], "native 999 on the physical side"),
        egress: trunk("Gi1/0/48", 999, [10, 20, 30, 999]),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/4", 999, [10, 20, 30, 999]),
        egress: access("Gi1/0/30", 999, "nothing should be in VLAN 999 at all"),
      },
    ],
    frame: { tags: [], label: "an untagged management frame" },
    question: "Which VLAN does the hypervisor's management traffic end up in?",
    options: [
      { id: "a", claim: "VLAN 10. That is what the management interface is configured for at both ends.", value: "10" },
      { id: "b", claim: "Dropped. An untagged frame on a trunk with a native VLAN of 999 has no VLAN to join.", value: "dropped" },
      { id: "c", claim: "VLAN 20. The next allowed VLAN, since 10 could not be established.", value: "20" },
      { id: "d", claim: "VLAN 999. The virtual switch sends VLAN 10 untagged because 10 is native there, and the physical switch reads an untagged frame as its own native, which is 999.", value: "999" },
    ],
    why: "The same mismatch as the first case, in the place it is hardest to see, because one end of the trunk is not a switch anybody logs into and the two configurations live in different tools owned by different teams. The management interface disappears into a VLAN that was chosen precisely because nothing is in it, so there is no gateway, no DHCP and no route, and the symptom is a host that pings from the console and from nowhere else. Everything either side of that cable says VLAN 10.",
    breaks: "that a native VLAN mismatch is a switch-to-switch problem, when one end of a trunk is often a hypervisor configured by somebody else",
  },
  {
    slug: "access-to-access",
    name: "The right VLAN and the wrong port",
    brief:
      "A desk move. The user's workstation was in VLAN 20 and the new desk's port was patched and configured, from a template, as VLAN 10. The trunk in between is correct at both ends and every VLAN is allowed.",
    hops: [
      {
        device: "acc-06",
        ingress: access("Gi1/0/3", 20, "the workstation, VLAN 20"),
        egress: trunk("Gi1/0/48", 999, [10, 20, 999]),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/5", 999, [10, 20, 999]),
        egress: access("Gi1/0/14", 10, "the new desk, configured from a template as VLAN 10"),
      },
    ],
    frame: { tags: [], label: "an untagged frame from the workstation" },
    question: "What happens to the frame?",
    options: [
      { id: "a", claim: "VLAN 10. The egress port's VLAN wins, which is why the desk works but on the wrong network.", value: "10" },
      { id: "b", claim: "VLAN 20. The frame keeps the VLAN it was classified into and the port delivers it.", value: "20" },
      { id: "c", claim: "Dropped. The frame is in VLAN 20 and that port only carries VLAN 10, so it never leaves the switch.", value: "dropped" },
      { id: "d", claim: "VLAN 999. It falls through to the native VLAN of the trunk it arrived on.", value: "999" },
    ],
    why: "An access port is a filter as well as a classifier. On the way in it puts frames into its VLAN; on the way out it only lets that VLAN's frames go, and there is no rewriting. So this is the well behaved failure, and the useful contrast with the mismatch cases: the frame stops, the user reports that nothing works at all, and the fault is found in an afternoon. The mismatch cases do not stop anything, which is precisely why they last for months.",
    breaks: "that an access port changes a frame's VLAN on the way out the way it does on the way in",
  },
  {
    slug: "pruned-on-arrival",
    name: "It leaves, and it does not arrive",
    brief:
      "A trunk pruned on one end only. Somebody tightening the distribution switch removed VLAN 20 from the trunk's allowed list, on the reasonable grounds that the access switch below it had no VLAN 20 ports when they looked. It has one now, added a week later by somebody else, and the access switch's own trunk configuration still allows 20.",
    hops: [
      {
        device: "acc-08",
        ingress: access("Gi1/0/9", 20, "a new desk in VLAN 20"),
        egress: trunk("Gi1/0/48", 999, [10, 20, 999], "20 still allowed on the way out"),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/7", 999, [10, 999], "and pruned on the way in"),
        egress: access("Gi1/0/18", 20, "the VLAN 20 gateway is behind here"),
      },
    ],
    frame: { tags: [], label: "an untagged frame from the new desk" },
    question: "The interface counters on acc-08 show the frames leaving. What becomes of them?",
    options: [
      { id: "a", claim: "VLAN 20. It is allowed out of acc-08 and the port at the far end is in VLAN 20, so it gets there.", value: "20" },
      { id: "b", claim: "Dropped by dist-01 as it arrives. The tag says 20, and 20 is not in that trunk's allowed list.", value: "dropped" },
      { id: "c", claim: "VLAN 999. Refused as a tagged frame, it falls back to the trunk's native VLAN.", value: "999" },
      { id: "d", claim: "VLAN 10. The receiving trunk substitutes the lowest VLAN it does allow.", value: "10" },
    ],
    why: "An allowed list is enforced by the port it is configured on, in whichever direction traffic crosses it, and the two ends of a trunk keep separate lists that nothing reconciles. So acc-08 tags the frame and sends it, entirely correctly by its own configuration, and its transmit counters go up. dist-01 reads a tag for a VLAN it has been told not to accept and discards the frame without telling anyone. The reason this is hard is that the sending switch's evidence all says the traffic is leaving, which it is, and leaving is not arriving.",
    breaks: "that a frame leaving a switch is a frame arriving at the next one, when the allowed list is checked again by the receiving port",
  },
  {
    slug: "native-not-allowed",
    name: "The native VLAN that is not allowed",
    brief:
      "Somebody pruning a trunk down to what it actually needs removed VLAN 999 from the allowed list, having noticed that nothing is in it. VLAN 999 is still the trunk's native VLAN on both ends. There is, it turns out, one access port in VLAN 999, put there years ago by somebody testing something.",
    hops: [
      {
        device: "acc-07",
        ingress: access("Gi1/0/5", 999, "a port nobody should have put in 999"),
        egress: trunk("Gi1/0/48", 999, [10, 20, 999], "native 999, and still allowed here"),
      },
      {
        device: "dist-01",
        ingress: trunk("Te1/1/6", 999, [10, 20], "native 999, and 999 pruned from the allowed list"),
        egress: access("Gi1/0/16", 999, "the other end of whatever was being tested"),
      },
    ],
    frame: { tags: [], label: "an untagged frame from that port" },
    question: "The frame leaves acc-07 with nothing on it, because 999 is native there. What does dist-01 do with it?",
    options: [
      { id: "a", claim: "Drops it. An untagged arrival joins the native VLAN, which is 999, and 999 is not in this trunk's allowed list.", value: "dropped" },
      { id: "b", claim: "Puts it in VLAN 999 anyway. A trunk's native VLAN is always permitted on it, whatever the allowed list says.", value: "999" },
      { id: "c", claim: "Puts it in VLAN 10, the lowest allowed VLAN, since 999 is unavailable.", value: "10" },
      { id: "d", claim: "Puts it in VLAN 20, the only other VLAN this trunk allows.", value: "20" },
    ],
    why: "Being the native VLAN and being allowed on the trunk are two independent settings, and neither implies the other. So a trunk can be configured to treat untagged arrivals as VLAN 999 and then refuse VLAN 999, which is what this one does, and every untagged frame it receives is discarded without comment. As a security posture that is very nearly right, and it is why pruning the native VLAN is sometimes recommended. What makes it a fault here is the access port: the lesson is not to allow 999 back onto the trunk, it is that a host in the native VLAN should not exist.",
    breaks: "that a trunk's native VLAN is implicitly allowed on it, when native and allowed are independent settings and pruning one does not touch the other",
  },
];
