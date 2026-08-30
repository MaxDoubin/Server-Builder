/**
 * The order a PowerEdge R760 comes apart in, and which way each piece goes.
 *
 * Dell's own service model has the machine as 34 named assemblies, so the
 * hard part of an exploded view is already done: the parts exist, they are
 * separated, and they carry the names a technician would use. What is left
 * is deciding where each one travels, and that is not an arbitrary choice.
 * A real teardown has an order. The bezel comes off before the cover, the
 * cover before the shrouds, the shrouds before anything on the board, and a
 * drive slides forward while a power supply slides back.
 *
 * So each part gets a direction, a distance, and a place in the sequence.
 * The sequence is what makes it read as a machine being taken apart rather
 * than a bag of components being shaken out: parts move in waves, each wave
 * finishing before the next begins.
 *
 * This replaced the 1U R660, which had 22 assemblies to the R760's 34 and
 * none of what makes a 2U interesting: no GPUs, one riser instead of four,
 * no PERC, no rear drive cage. A 2U is not a taller 1U, it is a machine
 * with room for the things that do not fit in a 1U, and those are exactly
 * the parts worth watching come out.
 *
 * Axes are the model's own, measured from it rather than assumed. Z is
 * depth and the front of the chassis is +Z, which is why the front bezel
 * sits at 264mm and the power supplies at -402mm. Y is height, X is width.
 */

export interface TeardownPart {
  /** Substring matched against the assembly's node name, case insensitive. */
  match: string;
  /** What a person would call it. */
  label: string;
  /** Unit vector the piece travels along, in model space. */
  dir: [number, number, number];
  /** How far it travels at full explode, in metres. */
  distance: number;
  /**
   * Which wave it leaves in. Waves run in order and overlap slightly, so
   * the cover is clear before the shroud starts moving.
   */
  wave: number;
  /** One line on why it comes out when it does. */
  note?: string;
}

/**
 * Nothing here moves the chassis. Everything else is positioned relative to
 * it, so it is the one part that has to stay still for the rest to read as
 * coming out of something.
 */
export const CHASSIS_MATCH = "chasis";

export const TEARDOWN_PARTS: TeardownPart[] = [
  {
    match: "frontbezel",
    label: "Front bezel",
    dir: [0, 0, 1],
    distance: 0.34,
    wave: 0,
    note: "Unlocks and pulls straight off the front. Nothing can be reached until it is gone.",
  },
  { match: "bezelkey", label: "Bezel key", dir: [-0.6, 0.5, 0.7], distance: 0.26, wave: 0 },
  {
    match: "systemcover",
    label: "System cover",
    dir: [0, 1, 0],
    distance: 0.30,
    wave: 1,
    note: "Release latch, slide back, lift. Every internal step starts here.",
  },
  { match: "backplanecover", label: "Backplane cover", dir: [0, 1, 0], distance: 0.24, wave: 1 },
  {
    match: "airshroud",
    label: "Air shroud",
    dir: [0, 1, 0],
    distance: 0.20,
    wave: 2,
    note: "Directs every cubic foot the fans move over the processors. Lifts straight out.",
  },
  { match: "reardriveshroud", label: "Rear drive shroud", dir: [0, 1, 0], distance: 0.18, wave: 2 },
  {
    match: "2.5 hdd",
    label: "Drive carriers",
    dir: [0, 0, 1],
    distance: 0.26,
    wave: 2,
    note: "Hot swap, so these come out with the machine running.",
  },
  {
    match: "coolingfan",
    label: "Cooling fans",
    dir: [0, 1, 0],
    distance: 0.15,
    wave: 3,
    note: "Hot swap too. The fan wall sits behind the drives and ahead of the board.",
  },
  {
    match: "power supply unity",
    label: "Power supplies",
    dir: [0, 0, -1],
    distance: 0.30,
    wave: 3,
    note: "Redundant pair, released by a handle and drawn out of the back.",
  },
  { match: "reardrive assembly", label: "Rear drive cage", dir: [0, 0.4, -0.9], distance: 0.26, wave: 3 },
  {
    match: "gpu1",
    label: "GPU 1",
    dir: [-0.25, 0.95, 0],
    distance: 0.26,
    wave: 4,
    note: "The reason to buy 2U rather than 1U. A full height card does not fit in a 1U at all.",
  },
  { match: "gpu2", label: "GPU 2", dir: [-0.25, 0.95, -0.15], distance: 0.22, wave: 4 },
  { match: "expansioncardriser1", label: "Riser 1", dir: [0.55, 0.8, -0.2], distance: 0.24, wave: 4 },
  { match: "expansioncardriser2", label: "Riser 2", dir: [0.15, 0.8, -0.55], distance: 0.24, wave: 4 },
  { match: "expansioncardriser3", label: "Riser 3", dir: [-0.1, 0.85, -0.5], distance: 0.24, wave: 4 },
  { match: "expansioncardriser4", label: "Riser 4", dir: [-0.6, 0.78, -0.2], distance: 0.24, wave: 4 },
  {
    match: "perc",
    label: "PERC controller",
    dir: [-0.7, 0.7, 0.15],
    distance: 0.22,
    wave: 4,
    note: "The RAID controller the front drives hang off.",
  },
  {
    match: "processor and heatsink",
    label: "Processors and heatsinks",
    dir: [0, 1, 0],
    distance: 0.24,
    wave: 5,
    note: "Four captive screws in a diagonal sequence, or the processor lifts with them.",
  },
  {
    match: "memory module",
    label: "Memory",
    dir: [0, 1, 0],
    distance: 0.17,
    wave: 5,
    note: "Thirty two slots. The shroud has to be out before a single one can be reached.",
  },
  {
    match: "bossn1",
    label: "BOSS-N1 module",
    dir: [0.6, 0.35, -0.7],
    distance: 0.24,
    wave: 5,
    note: "The pair of M.2 drives the hypervisor boots from, on their own carrier.",
  },
  { match: "lom", label: "LOM card", dir: [0.7, 0.3, -0.65], distance: 0.22, wave: 5 },
  { match: "ocp", label: "OCP card", dir: [0.2, 0.3, -0.9], distance: 0.22, wave: 5 },
  { match: "reario", label: "Rear I/O board", dir: [-0.6, 0.3, -0.75], distance: 0.22, wave: 5 },
  { match: "hdd backplane", label: "Drive backplane", dir: [0, 0.5, 0.75], distance: 0.24, wave: 6 },
  { match: "internalusb", label: "Internal USB", dir: [0.75, 0.6, 0], distance: 0.18, wave: 6 },
  {
    match: "intrusionswitch",
    label: "Intrusion switch",
    dir: [-0.85, 0.45, 0],
    distance: 0.18,
    wave: 6,
    note: "Tells the controller the lid has been off, whether or not anyone admits it.",
  },
  { match: "leftcp", label: "Left control panel", dir: [-0.95, 0.2, 0.2], distance: 0.20, wave: 6 },
  { match: "rightcp", label: "Right control panel", dir: [0.95, 0.2, 0.2], distance: 0.20, wave: 6 },
  { match: "sidewallbracket_left", label: "Side wall bracket, left", dir: [-1, 0.15, 0], distance: 0.16, wave: 6 },
  { match: "sidewallbracket_right", label: "Side wall bracket, right", dir: [1, 0.15, 0], distance: 0.16, wave: 6 },
  { match: "systembattery", label: "System battery", dir: [0.35, 0.9, 0], distance: 0.16, wave: 6 },
  {
    match: "tpm",
    label: "TPM",
    dir: [0.2, 0.95, -0.2],
    distance: 0.15,
    wave: 6,
    note: "A postage stamp that decides whether the machine will boot at all.",
  },
  {
    match: "systemboard",
    label: "System board",
    dir: [0, -1, 0],
    distance: 0.28,
    wave: 7,
    note: "Last out, because everything else is bolted to it or plugged into it.",
  },
];

/** How many waves there are, for pacing the animation. */
export const WAVE_COUNT = Math.max(...TEARDOWN_PARTS.map((p) => p.wave)) + 1;

/**
 * How far through its own travel a part is, given overall progress.
 *
 * Waves overlap by a third, which is enough that the motion never fully
 * stops and reads as one continuous opening, and little enough that the
 * order is still legible.
 */
export function waveProgress(progress: number, wave: number): number {
  const span = 1 / (WAVE_COUNT - (WAVE_COUNT - 1) / 3);
  const start = wave * span * (2 / 3);
  const t = (progress - start) / span;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // Smoothstep, so a part eases away and settles rather than snapping.
  return t * t * (3 - 2 * t);
}
