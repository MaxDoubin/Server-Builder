/**
 * A full rack drawn as one SVG: frame, rails, RU scale, and every device.
 *
 * Interactive mode turns each device into a keyboard-reachable button, so
 * the elevation doubles as the navigation for the detail panel next to it.
 * RU numbers run bottom-up, because that is how real racks are numbered:
 * the heaviest gear mounts low, and vendor elevations count from the floor.
 *
 * The frame is shaded like the equipment is. A rack is a steel enclosure
 * with a dark interior, and devices sit slightly proud of the rails and
 * cast a shadow into it. Drawing the frame flat while the faceplates were
 * shaded made the devices look pasted on rather than mounted.
 */

import { useId, useMemo } from "react";
import type { RackDefinition } from "@/lib/rackTypes";
import { DeviceFaceplate } from "./DeviceFaceplate";
import { RackDefs, defUrl } from "./RackDefs";
import { PatchCables } from "./PatchCables";

/** Shared styles for every rack SVG on the page. */
const RACK_CSS = `
  .rk-brand { font-family: "Space Grotesk", system-ui, sans-serif; letter-spacing: 0.1em; text-transform: uppercase; }
  .rk-portnum { font-family: ui-monospace, monospace; }
  .rk-unit { fill: #6b737c; font-family: ui-monospace, monospace; }
  .rk-dev { cursor: pointer; }
  .rk-dev:focus-visible { outline: none; }
  .rk-dev:focus-visible .rk-focus { opacity: 1; }
  .rk-focus { opacity: 0; }
  .rk-slide { transition: transform 460ms cubic-bezier(.16,.84,.34,1); }
  .rk-dev:hover .rk-slide { transform: translateX(7px); }
  .rk-sel .rk-slide { transform: translateX(30px); }
  .rk-cavity { opacity: 0; transition: opacity 460ms ease; }
  .rk-sel .rk-cavity { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .rk-slide { transition: none; }
    .rk-dev:hover .rk-slide, .rk-sel .rk-slide { transform: none; }
  }
  .rk-cables { transition: opacity 400ms ease; }
  .rk-has-sel .rk-cables { opacity: 0.22; }
  @keyframes rk-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  .rk-led-on { animation: rk-blink 1.6s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .rk-led-on { animation: none; } }
`;

interface Props {
  rack: RackDefinition;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Simplified small render for gallery cards. */
  mini?: boolean;
}

const W = 760;

export function RackElevation({ rack, selectedId, onSelect, mini = false }: Props) {
  // Per-instance id prefix. A gallery holds seven of these at once and
  // duplicate def ids across SVGs in one document collide.
  const uid = useId().replace(/:/g, "");
  const unitH = mini ? 20 : 56;
  const pad = mini ? 8 : 16;
  const railW = mini ? 10 : 26;
  const innerW = W - pad * 2;
  const H = rack.height * unitH + pad * 2;
  const interactive = Boolean(onSelect);
  const faceW = innerW - railW * 2;

  const offsets = useMemo(() => {
    let at = 0;
    return rack.devices.map((d) => {
      const o = at;
      at += d.u;
      return o;
    });
  }, [rack]);

  const holes: JSX.Element[] = [];
  const units: JSX.Element[] = [];
  for (let u = 0; u < rack.height; u++) {
    for (let h = 0; h < 3; h++) {
      const cy = pad + u * unitH + (unitH / 3) * h + unitH / 6;
      const s = Math.max(2, unitH * 0.1);
      for (const hx of [pad + railW * 0.3, W - pad - railW * 0.3 - s]) {
        holes.push(
          <g key={`${u}-${h}-${hx}`}>
            <rect x={hx} y={cy - s / 2} width={s} height={s} rx={0.6} fill={defUrl(uid, "hole")} />
            <rect x={hx} y={cy - s / 2} width={s} height={s * 0.18} fill="#000" opacity={0.9} />
          </g>,
        );
      }
    }
    if (!mini) {
      units.push(
        <text key={`u${u}`} x={pad + railW / 2} y={pad + u * unitH + unitH * 0.62} textAnchor="middle" className="rk-unit" fontSize={9}>
          {rack.height - u}
        </text>,
      );
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role={interactive ? "group" : "img"}
      aria-label={
        interactive
          ? `${rack.name} rack elevation. Each device is a button; select one to read its details.`
          : `${rack.name} rack elevation, ${rack.height} rack units`
      }
      className={selectedId ? "rk-has-sel" : undefined}
      style={{ display: "block" }}
    >
      <RackDefs uid={uid} />
      <style>{RACK_CSS}</style>

      {/* Enclosure, then the dark interior the equipment mounts into. */}
      <rect x={0} y={0} width={W} height={H} rx={mini ? 4 : 9} fill="#101317" />
      <rect x={0} y={0} width={W} height={H} rx={mini ? 4 : 9} fill="none" stroke="#3a4149" strokeWidth={1} opacity={0.8} />
      <rect x={1} y={1} width={W - 2} height={1.2} rx={1} fill="#fff" opacity={0.09} />
      <rect x={pad * 0.45} y={pad * 0.45} width={W - pad * 0.9} height={H - pad * 0.9} rx={mini ? 3 : 6} fill="#05070a" />

      {/* Vertical mounting rails. */}
      <rect x={pad} y={pad} width={railW} height={H - pad * 2} fill={defUrl(uid, "rail")} />
      <rect x={W - pad - railW} y={pad} width={railW} height={H - pad * 2} fill={defUrl(uid, "rail")} />
      {holes}
      {units}

      {rack.devices.map((d, i) => {
        const y = pad + offsets[i] * unitH;
        const selected = selectedId === d.id;
        const face = <DeviceFaceplate device={d} width={faceW} unitH={unitH} still={mini} uid={uid} />;

        if (!interactive) {
          return (
            <g key={d.id} transform={`translate(${pad + railW}, ${y})`}>
              {face}
            </g>
          );
        }

        return (
          <g
            key={d.id}
            transform={`translate(${pad + railW}, ${y})`}
            className={selected ? "rk-dev rk-sel" : "rk-dev"}
            role="button"
            tabIndex={0}
            aria-label={`${d.vendor === "Generic" ? "" : `${d.vendor} `}${d.model}, ${d.u}U`}
            aria-pressed={selected}
            onClick={() => onSelect?.(d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(d.id);
              }
            }}
          >
            <title>{`${d.vendor === "Generic" ? "" : `${d.vendor} `}${d.model}`}</title>
            {/* The empty bay revealed as the device slides out of the rails. */}
            <rect x={-2} y={1} width={faceW + 4} height={d.u * unitH - 2} rx={2} className="rk-cavity" fill={defUrl(uid, "cavity")} />
            <g className="rk-slide">
              {face}
              <rect
                className="rk-focus"
                x={-3}
                y={0}
                width={faceW + 6}
                height={d.u * unitH}
                rx={3}
                fill="none"
                stroke="#5eead4"
                strokeWidth={1.8}
              />
              {selected && (
                <rect x={-2.5} y={0.5} width={faceW + 5} height={d.u * unitH - 1} rx={3} fill="none" stroke={d.accent ?? "#4cf1f1"} strokeWidth={1.6} opacity={0.95} />
              )}
            </g>
          </g>
        );
      })}

      <g className="rk-cables">
        <PatchCables rack={rack} faceW={faceW} unitH={unitH} originX={pad + railW} originY={pad} uid={uid} />
      </g>

      {/*
        The lighting pass. Everything above is lit as if each part were on
        its own; this puts them all under one overhead fixture, which is
        what makes the frame and the equipment read as the same object in
        the same room. Non-interactive so it never eats a click.
      */}
      <rect
        x={pad * 0.45}
        y={pad * 0.45}
        width={W - pad * 0.9}
        height={H - pad * 0.9}
        rx={mini ? 3 : 6}
        fill={defUrl(uid, "roomlight")}
        pointerEvents="none"
      />
      <rect
        x={pad * 0.45}
        y={pad * 0.45}
        width={W - pad * 0.9}
        height={H - pad * 0.9}
        rx={mini ? 3 : 6}
        fill={defUrl(uid, "hotspot")}
        pointerEvents="none"
      />
    </svg>
  );
}
