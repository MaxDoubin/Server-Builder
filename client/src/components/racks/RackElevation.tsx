/**
 * A full rack drawn as one SVG: frame, rails, RU scale, and every device.
 *
 * Interactive mode turns each device into a keyboard-reachable button, so
 * the elevation doubles as the navigation for the detail panel next to it.
 * RU numbers run bottom-up, because that is how real racks are numbered:
 * the heaviest gear mounts low, and elevations in vendor documentation
 * count from the floor.
 *
 * The blink animation is defined here once and shared by every faceplate.
 * It respects prefers-reduced-motion at the CSS layer, so no JS is needed
 * to hold still.
 */

import { useMemo } from "react";
import type { RackDefinition } from "@/lib/rackTypes";
import { DeviceFaceplate } from "./DeviceFaceplate";

/** Shared styles for every rack SVG on the page. Rendered once per SVG. */
const RACK_CSS = `
  .rk-frame { fill: hsl(220 10% 7%); stroke: hsl(220 8% 18%); stroke-width: 1; }
  .rk-rail { fill: hsl(220 8% 12%); }
  .rk-railhole { fill: hsl(220 12% 4%); }
  .rk-ear { fill: hsl(220 7% 14%); }
  .rk-screw { fill: hsl(220 6% 22%); stroke: hsl(220 10% 8%); stroke-width: 0.6; }
  .rk-body { fill: hsl(220 7% 11%); stroke: hsl(220 8% 19%); stroke-width: 0.8; }
  .rk-body-patch { fill: hsl(220 6% 9%); }
  .rk-body-blank { fill: hsl(220 7% 10%); }
  .rk-body-server { fill: hsl(220 6% 12%); }
  .rk-body-ups { fill: hsl(220 8% 13%); }
  .rk-brand { fill: hsl(40 10% 72%); font-family: "Space Grotesk", system-ui, sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
  .rk-port { fill: hsl(220 6% 20%); stroke: hsl(220 8% 28%); stroke-width: 0.5; }
  .rk-console { stroke: #4cc3f1; }
  .rk-hole { fill: hsl(220 12% 5%); }
  .rk-sled { fill: hsl(220 7% 16%); stroke: hsl(220 8% 24%); stroke-width: 0.6; }
  .rk-sled-empty { fill: hsl(220 8% 8%); stroke: hsl(220 8% 16%); }
  .rk-vent { fill: hsl(220 12% 5%); }
  .rk-ring { fill: none; stroke: hsl(220 6% 26%); stroke-width: 1.4; }
  .rk-lcd { fill: hsl(200 30% 8%); stroke: hsl(200 40% 22%); stroke-width: 0.8; }
  .rk-lcd-text { fill: #6fe3b1; font-family: ui-monospace, monospace; letter-spacing: 0.14em; }
  .rk-btn { fill: hsl(220 6% 22%); }
  .rk-shelf-lip { fill: hsl(220 7% 16%); }
  .rk-minipc { fill: hsl(220 8% 15%); stroke: hsl(220 8% 24%); stroke-width: 0.7; }
  .rk-unit { fill: hsl(220 5% 42%); font-family: ui-monospace, monospace; }
  .rk-dev { cursor: pointer; }
  .rk-dev:hover .rk-body, .rk-dev:focus-visible .rk-body { filter: brightness(1.28); }
  .rk-dev:focus-visible { outline: none; }
  .rk-dev:focus-visible .rk-body { stroke: hsl(174 82% 55%); stroke-width: 1.4; }
  .rk-sel .rk-body { stroke-width: 1.6; filter: brightness(1.2); }
  .rk-slide { transition: transform 420ms cubic-bezier(.16,.84,.34,1); }
  .rk-dev:hover .rk-slide { transform: translateX(6px); }
  .rk-sel .rk-slide { transform: translateX(26px); }
  .rk-shadow { opacity: 0; transition: opacity 420ms ease; }
  .rk-sel .rk-shadow { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .rk-slide { transition: none; }
    .rk-dev:hover .rk-slide, .rk-sel .rk-slide { transform: none; }
  }
  @keyframes rk-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
  .rk-led-on { animation: rk-blink 1.6s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .rk-led-on { animation: none; } }
`;

interface Props {
  rack: RackDefinition;
  /** Selected device id, highlighted with its accent colour. */
  selectedId?: string | null;
  /** Makes devices clickable buttons. Off for gallery thumbnails. */
  onSelect?: (id: string) => void;
  /** Simplified small render for cards. */
  mini?: boolean;
}

const W = 760;

export function RackElevation({ rack, selectedId, onSelect, mini = false }: Props) {
  const unitH = mini ? 20 : 56;
  const pad = mini ? 8 : 16;
  const railW = mini ? 10 : 26;
  const innerW = W - pad * 2;
  const H = rack.height * unitH + pad * 2;
  const interactive = Boolean(onSelect);

  /** Top offset of each device, in rack units from the top of the frame. */
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
      const s = Math.max(2, unitH * 0.11);
      holes.push(<rect key={`l${u}-${h}`} x={pad + railW * 0.32} y={cy - s / 2} width={s} height={s} rx={0.8} className="rk-railhole" />);
      holes.push(<rect key={`r${u}-${h}`} x={W - pad - railW * 0.32 - s} y={cy - s / 2} width={s} height={s} rx={0.8} className="rk-railhole" />);
    }
    if (!mini) {
      // Bottom-up numbering: the unit drawn at the top of a 12U frame is U12.
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
      style={{ display: "block" }}
    >
      <style>{RACK_CSS}</style>
      <rect x={0} y={0} width={W} height={H} rx={mini ? 4 : 8} className="rk-frame" />
      <rect x={pad} y={pad} width={railW} height={H - pad * 2} className="rk-rail" />
      <rect x={W - pad - railW} y={pad} width={railW} height={H - pad * 2} className="rk-rail" />
      {holes}
      {units}

      {rack.devices.map((d, i) => {
        const y = pad + offsets[i] * unitH;
        const selected = selectedId === d.id;
        const face = (
          <DeviceFaceplate device={d} width={innerW - railW * 2} unitH={unitH} still={mini} />
        );
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
            style={selected ? ({ ["--rk-accent" as string]: d.accent } as React.CSSProperties) : undefined}
            onClick={() => onSelect?.(d.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect?.(d.id);
              }
            }}
          >
            <title>{`${d.vendor === "Generic" ? "" : `${d.vendor} `}${d.model}`}</title>
            {/* The empty rail slot revealed behind a device as it slides. */}
            <rect x={-2} y={1} width={innerW - railW * 2 + 4} height={d.u * unitH - 2} rx={2} className="rk-shadow" fill="#05070a" />
            <g className="rk-slide">
              {face}
              {selected && (
                <rect
                  x={-2}
                  y={0.5}
                  width={innerW - railW * 2 + 4}
                  height={d.u * unitH - 1}
                  rx={3}
                  fill="none"
                  stroke={d.accent ?? "#4cf1f1"}
                  strokeWidth={1.6}
                />
              )}
            </g>
          </g>
        );
      })}
    </svg>
  );
}
