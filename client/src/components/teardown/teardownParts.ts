/**
 * The order a PowerEdge R660 comes apart in, and which way each piece goes.
 *
 * Dell's own service model has the machine as 22 named assemblies, so the
 * hard part of an exploded view is already done: the parts exist, they are
 * separated, and they carry the names a technician would use. What is left
 * is deciding where each one travels, and that is not an arbitrary choice.
 * A real teardown has an order. The bezel comes off before the cover, the
 * cover before the shroud, the shroud before anything on the board, and a
 * drive slides forward while a power supply slides back.
 *
 * So each part gets a direction, a distance, and a place in the sequence.
 * The sequence is what makes it read as a machine being taken apart rather
 * than a bag of components being shaken out: parts move in waves, each wave
 * finishing before the next begins.
 *
 * Axes are the model's own, measured from it rather than assumed. Z is
 * depth and the front of the chassis is +Z, which is why the front bezel
 * sits at 829mm and the power supply at 146mm. Y is height, X is width.
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
export const CHASSIS_MATCH = "chasis_assembly";

export const TEARDOWN_PARTS: TeardownPart[] = [
  {
    match: "front_bezel",
    label: "Front bezel",
    dir: [0, 0, 1],
    distance: 0.30,
    wave: 0,
    note: "Unlocks and pulls straight off the front. Nothing can be reached until it is gone.",
  },
  {
    match: "system cover",
    label: "System cover",
    dir: [0, 1, 0],
    distance: 0.26,
    wave: 1,
    note: "Release latch, slide back, lift. Every internal step starts here.",
  },
  {
    match: "drive backplane cover",
    label: "Drive backplane cover",
    dir: [0, 1, 0],
    distance: 0.19,
    wave: 1,
  },
  {
    match: "air shroud",
    label: "Air shroud",
    dir: [0, 1, 0],
    distance: 0.15,
    wave: 2,
    note: "Directs every cubic foot the fans move over the processors. Lifts straight out.",
  },
  {
    match: "hard drive assembly",
    label: "Drive carriers",
    dir: [0, 0, 1],
    distance: 0.22,
    wave: 2,
    note: "Hot swap, so these come out with the machine running.",
  },
  {
    match: "cooling_fan",
    label: "Cooling fans",
    dir: [0, 1, 0],
    distance: 0.12,
    wave: 3,
    note: "Hot swap too. The fan wall sits behind the drives and ahead of the board.",
  },
  {
    match: "power supply unit",
    label: "Power supplies",
    dir: [0, 0, -1],
    distance: 0.26,
    wave: 3,
    note: "Redundant pair, released by a handle and drawn out of the back.",
  },
  {
    match: "heatsink",
    label: "Heatsinks",
    dir: [0, 1, 0],
    distance: 0.20,
    wave: 4,
    note: "Four captive screws in a diagonal sequence, or the processor lifts with them.",
  },
  {
    match: "system memorybb",
    label: "Memory",
    dir: [0, 1, 0],
    distance: 0.13,
    wave: 4,
    note: "Thirty two slots. The shroud has to be out before a single one can be reached.",
  },
  {
    match: "riser_2a_assembly",
    label: "Riser 2A",
    dir: [0.25, 0.55, -0.8],
    distance: 0.22,
    wave: 4,
  },
  {
    match: "riser_3a assembly",
    label: "Riser 3A",
    dir: [-0.35, 0.55, -0.75],
    distance: 0.22,
    wave: 4,
  },
  {
    match: "boss-n1",
    label: "BOSS-N1 module",
    dir: [0.55, 0.25, -0.8],
    distance: 0.20,
    wave: 5,
    note: "The pair of M.2 drives the hypervisor boots from, on their own carrier.",
  },
  {
    match: "backplane_10x2",
    label: "Drive backplane",
    dir: [0, 0.5, 0.7],
    distance: 0.20,
    wave: 5,
  },
  {
    match: "internalusbcard",
    label: "Internal USB card",
    dir: [0.5, 0.7, 0],
    distance: 0.15,
    wave: 5,
  },
  {
    match: "intrusion switch",
    label: "Intrusion switch",
    dir: [-0.85, 0.4, 0],
    distance: 0.15,
    wave: 5,
    note: "Tells the controller the lid has been off, whether or not anyone admits it.",
  },
  {
    match: "vga_port",
    label: "VGA port",
    dir: [0.9, 0.3, 0],
    distance: 0.16,
    wave: 5,
  },
  {
    match: "cp_left",
    label: "Left control panel",
    dir: [-0.9, 0.25, 0.2],
    distance: 0.18,
    wave: 5,
  },
  {
    match: "cp_right",
    label: "Right control panel",
    dir: [0.9, 0.25, 0.2],
    distance: 0.18,
    wave: 5,
  },
  {
    match: "system board",
    label: "System board",
    dir: [0, -1, 0],
    distance: 0.24,
    wave: 6,
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
