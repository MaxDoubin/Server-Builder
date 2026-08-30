/**
 * The material library: every gradient and pattern the racks paint with.
 *
 * The first version of these elevations filled each shape with one flat
 * colour, which is why it read as a diagram rather than as hardware. Real
 * equipment is legible almost entirely through light: a faceplate is
 * extruded aluminium with a brushed grain and a bevel that catches a
 * highlight along its top edge, a port is a hole with a shadow inside it,
 * and an LED is a bright point with a bloom around it.
 *
 * All of it is done with gradients and geometry rather than SVG filters.
 * A filter like feTurbulence gives a convincing metal grain but is
 * re-rasterised per element, and a 48 port switch has sixty filtered nodes
 * before the rack has drawn its second device. Gradients and a tiled line
 * pattern cost nothing by comparison and, at the sizes these render at,
 * are indistinguishable.
 *
 * Every id is prefixed with a per-SVG uid because a page can hold eight of
 * these at once and duplicate ids across SVGs in one document collide.
 */

export interface Material {
  /** Mid tone of the metal. */
  base: string;
  /** Where the light hits, along the top bevel. */
  hi: string;
  /** Shadowed lower edge. */
  lo: string;
  /** Silkscreen ink. */
  ink: string;
  /** Secondary silkscreen, for model numbers and port labels. */
  sub: string;
  /** True for pale finishes, which need a darker grain to read. */
  pale: boolean;
}

export const MATERIALS: Record<string, Material> = {
  // Anodised aluminium, as UniFi rack gear ships.
  silver: { base: "#b9bdc1", hi: "#eceef0", lo: "#7f858b", ink: "#2f3439", sub: "#5c6268", pale: true },
  // Catalyst pale grey, slightly warmer and lighter than UniFi.
  light: { base: "#c9ccce", hi: "#f2f3f4", lo: "#8d9297", ink: "#2b3035", sub: "#5a6066", pale: true },
  // MikroTik and PDU black: powder coated steel, low sheen.
  black: { base: "#1c1f23", hi: "#3d434a", lo: "#0b0d10", ink: "#c6cbd1", sub: "#7c838b", pale: false },
  // Generic dark chassis, a touch lighter than true black.
  dark: { base: "#24272c", hi: "#474d55", lo: "#101216", ink: "#c9ced4", sub: "#828992", pale: false },
};

export const LED_COLOURS: Record<string, string> = {
  green: "#4ef08a",
  blue: "#5ad2ff",
  amber: "#ffc043",
  red: "#ff5f5f",
  off: "#20242a",
};

/** Build the prefixed id for a def. */
export const defId = (uid: string, name: string) => `${uid}-${name}`;
/** Reference a prefixed def from a fill or stroke. */
export const defUrl = (uid: string, name: string) => `url(#${uid}-${name})`;

export function RackDefs({ uid }: { uid: string }) {
  return (
    <defs>
      {/*
        Brushed grain. One tile of fine horizontal lines at low opacity,
        tiled across a faceplate. Aluminium is brushed along its long axis
        during extrusion, so the grain runs left to right and catching it
        wrong is one of those details that reads as fake without anyone
        being able to say why.
      */}
      <pattern id={defId(uid, "grain-d")} width="5" height="2" patternUnits="userSpaceOnUse">
        <rect width="5" height="2" fill="none" />
        <line x1="0" y1="0.4" x2="5" y2="0.4" stroke="#000" strokeWidth="0.25" opacity="0.05" />
        <line x1="0" y1="1.3" x2="5" y2="1.3" stroke="#fff" strokeWidth="0.25" opacity="0.035" />
      </pattern>
      <pattern id={defId(uid, "grain-l")} width="5" height="2" patternUnits="userSpaceOnUse">
        <rect width="5" height="2" fill="none" />
        <line x1="0" y1="0.4" x2="5" y2="0.4" stroke="#000" strokeWidth="0.25" opacity="0.045" />
        <line x1="0" y1="1.3" x2="5" y2="1.3" stroke="#fff" strokeWidth="0.25" opacity="0.11" />
      </pattern>

      {/*
        Chassis shading. A faceplate is not evenly lit: the top bevel takes
        the light, the middle is the true colour and the bottom rolls into
        shadow where it meets the unit below.
      */}
      {Object.entries(MATERIALS).map(([name, m]) => (
        <linearGradient key={name} id={defId(uid, `face-${name}`)} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={m.hi} />
          <stop offset="7%" stopColor={m.base} />
          <stop offset="55%" stopColor={m.base} />
          <stop offset="93%" stopColor={m.lo} />
          <stop offset="100%" stopColor={m.hi} stopOpacity="0.5" />
        </linearGradient>
      ))}

      {/* The metal of a connector shell: bright top-left, shadowed bottom. */}
      <linearGradient id={defId(uid, "shell")} x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0%" stopColor="#e2e6ea" />
        <stop offset="22%" stopColor="#aeb4ba" />
        <stop offset="70%" stopColor="#7c8288" />
        <stop offset="100%" stopColor="#5b6167" />
      </linearGradient>
      <linearGradient id={defId(uid, "shell-dark")} x1="0" y1="0" x2="0.25" y2="1">
        <stop offset="0%" stopColor="#9aa1a8" />
        <stop offset="30%" stopColor="#6e747a" />
        <stop offset="100%" stopColor="#41464b" />
      </linearGradient>

      {/*
        The inside of a port. Light falls off fast into a connector, so the
        throat is darkest at the bottom rear and only the very top lip
        catches anything at all. This gradient is doing most of the work of
        making a rectangle read as a hole.
      */}
      <linearGradient id={defId(uid, "throat")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#000000" />
        <stop offset="35%" stopColor="#05070a" />
        <stop offset="100%" stopColor="#11151b" />
      </linearGradient>
      {/* A teal throat, for the Catalyst 9000 series. */}
      <linearGradient id={defId(uid, "throat-teal")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#04211f" />
        <stop offset="45%" stopColor="#0b423d" />
        <stop offset="100%" stopColor="#136b62" />
      </linearGradient>

      {/* Gold contact pins at the back of an RJ45. */}
      <linearGradient id={defId(uid, "pins")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffe9a8" />
        <stop offset="50%" stopColor="#d8b45a" />
        <stop offset="100%" stopColor="#8a6f2e" />
      </linearGradient>

      {/*
        LED bloom. A lit indicator behind a light pipe is a bright core in a
        soft halo, and the halo is what makes it look emissive rather than
        painted. Radial gradients rather than a blur filter, so a rack with
        two hundred lit ports still composites in one pass.
      */}
      {Object.entries(LED_COLOURS)
        .filter(([k]) => k !== "off")
        .map(([name, c]) => (
          <radialGradient key={name} id={defId(uid, `glow-${name}`)}>
            <stop offset="0%" stopColor={c} stopOpacity="0.7" />
            <stop offset="28%" stopColor={c} stopOpacity="0.22" />
            <stop offset="100%" stopColor={c} stopOpacity="0" />
          </radialGradient>
        ))}

      {/* A screw head: lit from above left, with a machined rim. */}
      <radialGradient id={defId(uid, "screw")} cx="0.35" cy="0.3">
        <stop offset="0%" stopColor="#9ba1a8" />
        <stop offset="60%" stopColor="#5e646b" />
        <stop offset="100%" stopColor="#2c3036" />
      </radialGradient>

      {/* Rack rail: cold rolled steel, lit from the front. */}
      <linearGradient id={defId(uid, "rail")} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#15181c" />
        <stop offset="35%" stopColor="#2a2f35" />
        <stop offset="65%" stopColor="#22262b" />
        <stop offset="100%" stopColor="#101317" />
      </linearGradient>

      {/* A square mounting hole: dark, with a lit lower bevel. */}
      <linearGradient id={defId(uid, "hole")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#000000" />
        <stop offset="70%" stopColor="#050709" />
        <stop offset="100%" stopColor="#3c434b" />
      </linearGradient>

      {/* Shadow cast by a device onto the unit below it. */}
      <linearGradient id={defId(uid, "castshadow")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#000" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#000" stopOpacity="0" />
      </linearGradient>

      {/* The dark cavity revealed behind a device that has slid out. */}
      <linearGradient id={defId(uid, "cavity")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#000" />
        <stop offset="45%" stopColor="#07090c" />
        <stop offset="100%" stopColor="#020304" />
      </linearGradient>

      {/* A drive sled face: brushed, with a sharper highlight than a panel. */}
      <linearGradient id={defId(uid, "sled")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4a5057" />
        <stop offset="8%" stopColor="#32373d" />
        <stop offset="80%" stopColor="#23272c" />
        <stop offset="100%" stopColor="#14171a" />
      </linearGradient>
      <linearGradient id={defId(uid, "sled-empty")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0d0f12" />
        <stop offset="60%" stopColor="#080a0c" />
        <stop offset="100%" stopColor="#15191d" />
      </linearGradient>

      {/* An LCD: backlit glass, brighter at the top where the film sits. */}
      <linearGradient id={defId(uid, "lcd")} x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0%" stopColor="#0d2a2c" />
        <stop offset="50%" stopColor="#07191b" />
        <stop offset="100%" stopColor="#040e10" />
      </linearGradient>

      {/* Room light: brighter across the top of the enclosure, falling into
          shadow at the floor, the way an overhead fixture actually lights a
          rack. Painted over the finished elevation at low opacity. */}
      <linearGradient id={defId(uid, "roomlight")} x1="0" y1="0" x2="0.15" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.075" />
        <stop offset="28%" stopColor="#ffffff" stopOpacity="0.022" />
        <stop offset="62%" stopColor="#000000" stopOpacity="0.05" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.26" />
      </linearGradient>
      {/* A soft hotspot where the fixture is brightest. */}
      <radialGradient id={defId(uid, "hotspot")} cx="0.42" cy="0.12" r="0.75">
        <stop offset="0%" stopColor="#dceaff" stopOpacity="0.09" />
        <stop offset="55%" stopColor="#dceaff" stopOpacity="0.02" />
        <stop offset="100%" stopColor="#dceaff" stopOpacity="0" />
      </radialGradient>

      {/* Vent slot: a slit with light on its lower lip. */}
      <linearGradient id={defId(uid, "vent")} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#000" />
        <stop offset="75%" stopColor="#04060a" />
        <stop offset="100%" stopColor="#4a5158" stopOpacity="0.8" />
      </linearGradient>
    </defs>
  );
}
