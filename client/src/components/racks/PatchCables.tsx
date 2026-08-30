/**
 * Patch cables, drawn between the ports they actually connect.
 *
 * Modelled on the UniFi Etherlighting Patch Cable (UACC-Cable-Patch-EL),
 * which is the reason this layer is worth drawing at all: it is a Cat6A
 * cable with a 2.5mm white TPE jacket and two translucent booted RJ45
 * connectors, and the boot pipes the switch's own port LED out through the
 * connector. So a rack patched with these has a glowing point of colour at
 * every jack, and the colour means something: link state, VLAN, or
 * negotiated speed, depending on how the switch is configured.
 *
 * That detail is why the boots glow here and the jacket does not. A cable
 * whose whole length lit up would look like a novelty light strip; the real
 * product lights the connector and leaves the jacket white.
 *
 * Geometry: a cable leaves a jack pointing at the viewer, so head-on it
 * appears to leave the panel and immediately fall. Each run is a cubic
 * bezier whose control points push out and down from both ends, which
 * produces the belly a slack patch lead actually hangs in. Runs are sorted
 * long to short and drawn in that order so the short ones sit on top, the
 * way a bundle layers in a real rack.
 */

import type { LedState, RackDefinition, RackDevice } from "@/lib/rackTypes";
import { LED_COLOURS, defUrl } from "./RackDefs";
import { faceGeometry, layoutPorts } from "./portLayout";

/** A resolved endpoint: absolute coordinates of one jack's mouth. */
interface Endpoint {
  x: number;
  y: number;
  colour: LedState;
}

function resolve(
  rack: RackDefinition,
  deviceId: string,
  portIndex: number,
  faceW: number,
  unitH: number,
  originX: number,
  originY: number,
): Endpoint | null {
  let top = 0;
  let device: RackDevice | undefined;
  for (const d of rack.devices) {
    if (d.id === deviceId) {
      device = d;
      break;
    }
    top += d.u;
  }
  if (!device) return null;
  const cells = layoutPorts(device, faceW, unitH, false);
  const cell = cells.find((c) => c.index === portIndex);
  if (!cell) return null;
  return {
    x: originX + cell.x + cell.w / 2,
    y: originY + top * unitH + cell.y + cell.h * 0.62,
    colour: (cell.port.led ?? "green") === "off" ? "green" : (cell.port.led ?? "green"),
  };
}

export function PatchCables({
  rack,
  faceW,
  unitH,
  originX,
  originY,
  uid,
}: {
  rack: RackDefinition;
  faceW: number;
  unitH: number;
  originX: number;
  originY: number;
  uid: string;
}) {
  if (!rack.patches?.length) return null;

  const runs = rack.patches
    .map((patch, i) => {
      const a = resolve(rack, patch.from.device, patch.from.port, faceW, unitH, originX, originY);
      const b = resolve(rack, patch.to.device, patch.to.port, faceW, unitH, originX, originY);
      if (!a || !b) return null;
      const colour = patch.colour ?? a.colour;
      const style = patch.style ?? "plain";
      const jacket = patch.jacket ?? (style === "etherlighting" ? "white" : "blue");
      return { a, b, colour, style, jacket, i, span: Math.abs(a.y - b.y) + Math.abs(a.x - b.x) };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    // Long runs behind short ones, which is how a bundle actually layers.
    .sort((x, y) => y.span - x.span);

  // A 2.5mm jacket against a 44.45mm rack unit. Deriving it rather than
  // picking a number keeps the cable in proportion at any render scale.
  const jacket = Math.max(1.1, (2.5 / 44.45) * unitH);
  const bootW = jacket * 2.1;
  const bootH = jacket * 2.6;

  return (
    <g pointerEvents="none" aria-hidden="true">
      {runs.map(({ a, b, colour, style, jacket: jacketColour, i }) => {
        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        // Slack scales with how far the run has to travel, and every cable
        // in a rack is a slightly different length, so the sag is jittered
        // deterministically per run rather than being identical.
        const jitter = 0.82 + ((i * 37) % 41) / 100;
        const sag = Math.min(unitH * 1.5, (dy * 0.34 + dx * 0.12 + unitH * 0.42) * jitter);
        const out = jacket * 2.4;
        const c1x = a.x + out;
        const c1y = a.y + sag;
        const c2x = b.x + out;
        const c2y = b.y + sag * 0.72;
        const d = `M ${a.x} ${a.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${b.x} ${b.y}`;
        const glow = LED_COLOURS[colour];

        return (
          <g key={i}>
            {/* Shadow the lead casts on the faceplate behind it. */}
            <path d={d} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={jacket * 1.5} strokeLinecap="round" transform={`translate(${jacket * 0.5}, ${jacket * 0.7})`} />
            {/* The jacket: a dark rim, the white TPE, then a specular line
                along its upper surface where the light catches the round. */}
            <path d={d} fill="none" stroke="#5c6167" strokeWidth={jacket * 1.18} strokeLinecap="round" />
            <path d={d} fill="none" stroke={defUrl(uid, `jacket-${jacketColour}`)} strokeWidth={jacket} strokeLinecap="round" />
            <path
              d={d}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={jacketColour === "white" ? 0.5 : 0.34}
              strokeWidth={jacket * 0.24}
              strokeLinecap="round"
              transform={`translate(0, ${-jacket * 0.25})`}
            />
            <Boot x={a.x} y={a.y} w={bootW} h={bootH} glow={glow} uid={uid} colour={colour} style={style} jacket={jacketColour} />
            <Boot x={b.x} y={b.y} w={bootW} h={bootH} glow={glow} uid={uid} colour={colour} style={style} jacket={jacketColour} />
          </g>
        );
      })}
    </g>
  );
}

/**
 * A translucent RJ45 boot with the port LED shining through it.
 *
 * Drawn as a tapered strain relief rather than a rectangle, because the
 * silhouette of that moulded taper is most of what identifies the part.
 */
function Boot({
  x,
  y,
  w,
  h,
  glow,
  colour,
  uid,
  style,
  jacket,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  glow: string;
  colour: LedState;
  uid: string;
  style: "etherlighting" | "plain";
  jacket: string;
}) {
  const top = y - h * 0.52;
  const shape = `M ${x - w / 2} ${top} L ${x + w / 2} ${top} L ${x + w * 0.3} ${top + h} L ${x - w * 0.3} ${top + h} Z`;

  if (style === "plain") {
    // An ordinary moulded strain relief: opaque, the jacket's own colour,
    // with a highlight down one side and the latch tab on top.
    return (
      <g>
        <path d={shape} fill={defUrl(uid, `jacket-${jacket}`)} />
        <path d={shape} fill="none" stroke="#000" strokeOpacity={0.45} strokeWidth={w * 0.07} />
        <rect x={x - w * 0.3} y={top + h * 0.1} width={w * 0.16} height={h * 0.7} fill="#fff" opacity={0.22} />
        <rect x={x - w * 0.12} y={top - h * 0.14} width={w * 0.24} height={h * 0.18} rx={w * 0.06} fill={defUrl(uid, `jacket-${jacket}`)} />
      </g>
    );
  }

  // Etherlighting: the boot is translucent and the switch's port LED shines
  // out through it, which is the entire point of the part.
  return (
    <g>
      <circle cx={x} cy={y - h * 0.1} r={w * 1.5} fill={defUrl(uid, `glow-${colour}`)} opacity={0.75} />
      <path d={shape} fill={glow} opacity={0.5} />
      <path d={shape} fill="none" stroke="#ffffff" strokeOpacity={0.42} strokeWidth={w * 0.09} />
      <rect x={x - w * 0.24} y={top + h * 0.12} width={w * 0.48} height={h * 0.5} rx={w * 0.12} fill={glow} opacity={0.95} />
      <rect x={x - w * 0.13} y={top + h * 0.18} width={w * 0.26} height={h * 0.3} rx={w * 0.1} fill="#ffffff" opacity={0.7} />
    </g>
  );
}
