/**
 * One device's front panel, drawn as SVG from its RackDevice data.
 *
 * SVG rather than WebGL on purpose: a rack elevation is a 2D drawing in
 * real life, crisp vectors survive any zoom, every element can carry a
 * native tooltip, and the whole thing costs nothing at first paint. The
 * geometry is derived entirely from `width` and `unitH`, so the same
 * component draws a 300px gallery card and a 700px detail view without a
 * second code path.
 *
 * Everything visual keys off the data: port kinds pick their connector
 * shape, `led` lights the indicator, `activity` sizes the traffic bar and
 * paces the blink, `family` picks the faceplate silhouette. Nothing is
 * drawn that the data does not claim.
 */

import type { RackDevice, RackPort } from "@/lib/rackTypes";

const LED_COLOURS: Record<string, string> = {
  green: "#3ddc84",
  blue: "#4cc3f1",
  amber: "#ffb020",
  red: "#ff4d4d",
  off: "#232830",
};

/** Connector footprint in units of the row height, per kind. */
function portShape(kind: RackPort["kind"]): { w: number; h: number } {
  switch (kind) {
    case "sfp":
    case "sfp-plus":
    case "sfp28":
      return { w: 1.7, h: 0.62 };
    case "qsfp":
      return { w: 2.1, h: 0.68 };
    case "power":
      return { w: 1.0, h: 1.0 };
    case "usb":
      return { w: 0.8, h: 0.5 };
    default:
      return { w: 1.0, h: 0.92 };
  }
}

interface Props {
  device: RackDevice;
  /** Full faceplate width in SVG units, rack ears included. */
  width: number;
  /** Height of one rack unit in SVG units. */
  unitH: number;
  /** True on the enlarged detail render: more labels, finer detail. */
  detail?: boolean;
  /** Disables the blink animation, mirroring prefers-reduced-motion. */
  still?: boolean;
}

export function DeviceFaceplate({ device, width, unitH, detail = false, still = false }: Props) {
  const H = device.u * unitH;
  const ear = Math.max(10, width * 0.028);
  const bodyX = ear;
  const bodyW = width - ear * 2;
  const inset = Math.max(1, unitH * 0.045);
  const accent = device.accent ?? "#8a93a6";
  const showText = unitH >= 34;

  const screws: JSX.Element[] = [];
  for (let u = 0; u < device.u; u++) {
    for (const side of [ear * 0.5, width - ear * 0.5]) {
      screws.push(
        <circle
          key={`s${u}-${side}`}
          cx={side}
          cy={u * unitH + unitH * 0.5}
          r={Math.max(1.4, unitH * 0.07)}
          className="rk-screw"
        />,
      );
    }
  }

  return (
    <g>
      {/* Rack ears, then the faceplate itself. */}
      <rect x={0} y={inset} width={ear} height={H - inset * 2} className="rk-ear" />
      <rect x={width - ear} y={inset} width={ear} height={H - inset * 2} className="rk-ear" />
      {screws}
      <rect
        x={bodyX}
        y={inset}
        width={bodyW}
        height={H - inset * 2}
        rx={Math.max(1.5, unitH * 0.06)}
        className={`rk-body rk-body-${device.family}`}
      />
      {/* A hairline of accent along the top edge identifies the device role
          at a glance, the same colour the detail panel uses. */}
      <rect x={bodyX + 2} y={inset + 1} width={bodyW - 4} height={1.2} fill={accent} opacity={0.85} />

      {showText && (
        <text
          x={bodyX + unitH * 0.22}
          y={inset + unitH * 0.3}
          className="rk-brand"
          fontSize={Math.max(6, unitH * 0.14)}
        >
          {device.vendor === "Generic" ? device.model : device.vendor}
        </text>
      )}

      <FaceContent device={device} bodyX={bodyX} bodyW={bodyW} unitH={unitH} inset={inset} detail={detail} still={still} />
      <ChassisLeds device={device} bodyX={bodyX} bodyW={bodyW} unitH={unitH} inset={inset} still={still} />
    </g>
  );
}

/** The per-family middle of the faceplate: ports, bays, vents, or a display. */
function FaceContent(props: {
  device: RackDevice;
  bodyX: number;
  bodyW: number;
  unitH: number;
  inset: number;
  detail: boolean;
  still: boolean;
}) {
  const { device, bodyX, bodyW, unitH, inset, detail, still } = props;

  if (device.family === "blank") {
    return <BlankFace look={device.look ?? "solid"} bodyX={bodyX} bodyW={bodyW} unitH={unitH} inset={inset} u={device.u} />;
  }
  if (device.family === "ups") {
    return <UpsFace bodyX={bodyX} bodyW={bodyW} unitH={unitH} u={device.u} detail={detail} />;
  }
  if (device.bays) {
    return <BayFace device={device} bodyX={bodyX} bodyW={bodyW} unitH={unitH} still={still} />;
  }
  if (device.ports?.length) {
    return <PortField device={device} bodyX={bodyX} bodyW={bodyW} unitH={unitH} inset={inset} detail={detail} still={still} />;
  }
  return null;
}

/** Ports flow left to right and wrap to a second row, like the real panel. */
function PortField(props: {
  device: RackDevice;
  bodyX: number;
  bodyW: number;
  unitH: number;
  inset: number;
  detail: boolean;
  still: boolean;
}) {
  const { device, bodyX, bodyW, unitH, inset, detail, still } = props;
  const ports = device.ports ?? [];
  const H = device.u * unitH;
  const isPatch = device.family === "patch";

  // Reserve a strip on the left for branding, then flow ports in up to two
  // rows. Base cell height comes from how many rows the count forces.
  const startX = bodyX + bodyW * (detail ? 0.02 : 0.1);
  const endX = bodyX + bodyW - unitH * 0.5;
  const avail = endX - startX;
  const widthUnits = ports.reduce((s, p) => s + portShape(p.kind).w, 0);
  const rows = widthUnits * (unitH * 0.5) > avail ? 2 : 1;
  const rowH = (H - inset * 4) / rows;
  const scale = Math.min(
    rowH * 0.72,
    (avail / Math.ceil(widthUnits / rows)) * 0.86,
  );
  const gap = scale * 0.18;

  let x = startX;
  let row = 0;
  const nodes: JSX.Element[] = [];

  ports.forEach((port, i) => {
    const shape = portShape(port.kind);
    const w = shape.w * scale;
    const h = shape.h * scale;
    if (x + w > endX && row < rows - 1) {
      row += 1;
      x = startX;
    }
    const cy = inset * 2 + rowH * row + rowH / 2;
    const y = cy - h / 2;
    const lit = port.led && port.led !== "off";
    const colour = LED_COLOURS[port.led ?? "off"];

    nodes.push(
      <g key={i}>
        <title>{`${port.label}${port.led ? `, ${port.led === "off" ? "no link" : "link"}` : ""}`}</title>
        {port.kind === "blank" ? (
          <rect x={x} y={y} width={w} height={h} rx={1} className="rk-hole" />
        ) : port.kind === "power" ? (
          <g>
            <rect x={x} y={y} width={w} height={h} rx={1.5} className="rk-port" />
            <rect x={x + w * 0.24} y={y + h * 0.2} width={w * 0.12} height={h * 0.34} fill="#0b0d10" />
            <rect x={x + w * 0.64} y={y + h * 0.2} width={w * 0.12} height={h * 0.34} fill="#0b0d10" />
            <circle cx={x + w * 0.5} cy={y + h * 0.74} r={w * 0.09} fill="#0b0d10" />
          </g>
        ) : (
          <g>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={1}
              className={port.kind === "console" ? "rk-port rk-console" : "rk-port"}
            />
            {/* The connector opening. RJ45 gets its clip notch, the SFP
                family gets the latch bar of a cage. */}
            {port.kind === "rj45" || port.kind === "console" ? (
              <>
                <rect x={x + w * 0.2} y={y + h * 0.18} width={w * 0.6} height={h * 0.5} fill="#0b0d10" rx={0.5} />
                <rect x={x + w * 0.38} y={y + h * 0.62} width={w * 0.24} height={h * 0.18} fill="#0b0d10" />
              </>
            ) : (
              <>
                <rect x={x + w * 0.12} y={y + h * 0.28} width={w * 0.76} height={h * 0.44} fill="#0b0d10" rx={0.5} />
                {port.kind === "sfp28" && <rect x={x + w * 0.12} y={y + h * 0.16} width={w * 0.76} height={2} fill="#4cc3f1" opacity={0.5} />}
                {port.kind === "qsfp" && <rect x={x + w * 0.12} y={y + h * 0.16} width={w * 0.76} height={2} fill="#9234ea" opacity={0.6} />}
              </>
            )}
            {/* Link LED and, on an active port, its traffic bar. Patch
                panels have neither, because a keystone has nothing to light. */}
            {!isPatch && port.led && (
              <circle
                cx={x + w * 0.5}
                cy={y - Math.max(2, scale * 0.14)}
                r={Math.max(0.9, scale * 0.09)}
                fill={colour}
                className={lit && !still ? "rk-led rk-led-on" : "rk-led"}
                style={lit && !still ? { animationDelay: `${(i % 7) * 0.37}s`, animationDuration: `${1.4 + (i % 5) * 0.25}s` } : undefined}
              />
            )}
            {lit && typeof port.activity === "number" && (
              <rect
                x={x}
                y={y + h + Math.max(1.2, scale * 0.1)}
                width={Math.max(1, w * port.activity)}
                height={Math.max(1, scale * 0.08)}
                fill={colour}
                opacity={0.75}
              />
            )}
          </g>
        )}
      </g>,
    );
    x += w + gap;
  });

  return <g>{nodes}</g>;
}

/** Drive sleds for hardware whose face is storage. */
function BayFace(props: { device: RackDevice; bodyX: number; bodyW: number; unitH: number; still: boolean }) {
  const { device, bodyX, bodyW, unitH, still } = props;
  const bays = device.bays!;
  const H = device.u * unitH;
  const cols = Math.ceil(bays.count / device.u / 2) * 2;
  const rows = Math.ceil(bays.count / cols);
  const startX = bodyX + bodyW * 0.12;
  const fieldW = bodyW * 0.84;
  const cellW = fieldW / cols;
  const cellH = (H * 0.76) / rows;
  const top = H * 0.12;

  const sleds: JSX.Element[] = [];
  for (let i = 0; i < bays.count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = startX + c * cellW + cellW * 0.04;
    const y = top + r * cellH + cellH * 0.08;
    const w = cellW * 0.92;
    const h = cellH * 0.84;
    const occupied = i < bays.occupied;
    sleds.push(
      <g key={i}>
        <title>{`Bay ${i + 1}: ${occupied ? bays.label : "empty"}`}</title>
        <rect x={x} y={y} width={w} height={h} rx={1.5} className={occupied ? "rk-sled" : "rk-sled rk-sled-empty"} />
        <rect x={x + w * 0.06} y={y + h * 0.3} width={w * 0.1} height={h * 0.4} rx={1} fill="#0b0d10" />
        {occupied && (
          <>
            <circle cx={x + w * 0.88} cy={y + h * 0.32} r={Math.max(1, h * 0.09)} fill={LED_COLOURS.green} />
            <circle
              cx={x + w * 0.88}
              cy={y + h * 0.66}
              r={Math.max(1, h * 0.09)}
              fill={LED_COLOURS.amber}
              className={still ? undefined : "rk-led rk-led-on"}
              style={still ? undefined : { animationDelay: `${(i % 5) * 0.29}s`, animationDuration: `${0.9 + (i % 3) * 0.4}s` }}
            />
          </>
        )}
      </g>,
    );
  }
  return <g>{sleds}</g>;
}

/** A UPS face: the status display, not the outlets, which live on the rear. */
function UpsFace(props: { bodyX: number; bodyW: number; unitH: number; u: number; detail: boolean }) {
  const { bodyX, bodyW, unitH, u, detail } = props;
  const H = u * unitH;
  const lcdW = bodyW * 0.3;
  const lcdH = H * 0.44;
  const lcdX = bodyX + bodyW * 0.56;
  const lcdY = H * 0.28;
  return (
    <g>
      <rect x={lcdX} y={lcdY} width={lcdW} height={lcdH} rx={2} className="rk-lcd" />
      <text x={lcdX + lcdW / 2} y={lcdY + lcdH * 0.42} textAnchor="middle" className="rk-lcd-text" fontSize={Math.max(5, H * 0.13)}>
        ONLINE
      </text>
      <text x={lcdX + lcdW / 2} y={lcdY + lcdH * 0.82} textAnchor="middle" className="rk-lcd-text" fontSize={Math.max(4, H * 0.1)} opacity={0.7}>
        LOAD 34%
      </text>
      {/* Vent field on the left half of the face. */}
      {Array.from({ length: detail ? 14 : 8 }, (_, i) => (
        <rect
          key={i}
          x={bodyX + bodyW * 0.08 + (i % (detail ? 7 : 4)) * bodyW * (detail ? 0.055 : 0.09)}
          y={H * 0.3 + Math.floor(i / (detail ? 7 : 4)) * H * 0.24}
          width={bodyW * (detail ? 0.035 : 0.06)}
          height={H * 0.14}
          rx={1}
          className="rk-vent"
        />
      ))}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={lcdX + lcdW + bodyW * 0.035 * (i + 1)} cy={H * 0.5} r={Math.max(1.2, H * 0.045)} className="rk-btn" />
      ))}
    </g>
  );
}

/** Passive filler: vents, a solid plate, cable rings, or a loaded shelf. */
function BlankFace(props: { look: string; bodyX: number; bodyW: number; unitH: number; inset: number; u: number }) {
  const { look, bodyX, bodyW, unitH, inset, u } = props;
  const H = u * unitH;
  if (look === "vented") {
    return (
      <g>
        {Array.from({ length: 18 }, (_, i) => (
          <rect key={i} x={bodyX + bodyW * 0.06 + i * bodyW * 0.05} y={H * 0.32} width={bodyW * 0.028} height={H * 0.36} rx={1} className="rk-vent" />
        ))}
      </g>
    );
  }
  if (look === "fingers") {
    return (
      <g>
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x={bodyX + bodyW * 0.1 + i * bodyW * 0.14} y={H * 0.18} width={bodyW * 0.075} height={H * 0.64} rx={Math.max(2, H * 0.12)} className="rk-ring" />
        ))}
      </g>
    );
  }
  if (look === "shelf") {
    return (
      <g>
        <rect x={bodyX + 2} y={H - inset - Math.max(2, H * 0.12)} width={bodyW - 4} height={Math.max(2, H * 0.1)} className="rk-shelf-lip" />
        {/* The mini PC that lives on the shelf, one power LED and all. */}
        <rect x={bodyX + bodyW * 0.62} y={H * 0.22} width={bodyW * 0.2} height={H * 0.56} rx={2} className="rk-minipc" />
        <circle cx={bodyX + bodyW * 0.795} cy={H * 0.36} r={Math.max(1, H * 0.05)} fill={LED_COLOURS.green} />
      </g>
    );
  }
  return null;
}

/** Chassis indicators from the datasheet, drawn at the faceplate's right end. */
function ChassisLeds(props: { device: RackDevice; bodyX: number; bodyW: number; unitH: number; inset: number; still: boolean }) {
  const { device, bodyX, bodyW, unitH, inset, still } = props;
  if (!device.leds?.length) return null;
  const H = device.u * unitH;
  const x = bodyX + bodyW - unitH * 0.28;
  return (
    <g>
      {device.leds.map((led, i) => (
        <circle
          key={i}
          cx={x}
          cy={inset * 2 + ((H - inset * 4) / (device.leds!.length + 1)) * (i + 1)}
          r={Math.max(1, unitH * 0.055)}
          fill={LED_COLOURS[led]}
          className={led !== "off" && !still ? "rk-led rk-led-on" : "rk-led"}
          style={led !== "off" && !still ? { animationDuration: `${2.2 + i * 0.5}s` } : undefined}
        />
      ))}
    </g>
  );
}
