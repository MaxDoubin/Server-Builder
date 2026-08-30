/**
 * One device's front panel, drawn as SVG from its RackDevice data.
 *
 * The layout rules here are taken from vendor product photography rather
 * than invented, because the details are what make an elevation readable:
 *
 * - Dense faceplates stack into TWO rows with odd port numbers on top and
 *   even below, numbered outward from the left. Nearly every 24 and 48 port
 *   switch made in the last twenty years does this, and a single row of 48
 *   jacks looks nothing like real hardware.
 * - Jacks are grouped in blocks with a gap every 6, 8 or 12, which is how a
 *   technician counts to port 34 without reading a label.
 * - The link LED lives in the top corners of the RJ45 throat itself, not on
 *   a separate strip above it.
 * - Chassis colour is a real identifying feature. UniFi is silver, a
 *   Catalyst 9300 is pale grey with teal port throats, MikroTik is black.
 *
 * SVG rather than WebGL: a rack elevation is a 2D drawing in real life,
 * vectors stay crisp at any zoom, every element can carry a native tooltip,
 * and the whole thing costs nothing at first paint.
 */

import type { RackDevice, RackPort } from "@/lib/rackTypes";

const LED_COLOURS: Record<string, string> = {
  green: "#3ddc84",
  blue: "#4cc3f1",
  amber: "#ffb020",
  red: "#ff4d4d",
  off: "#2a2f37",
};

/** Chassis fill, stroke and silkscreen colour per finish. */
const FINISHES: Record<string, { body: string; edge: string; ink: string; sub: string }> = {
  silver: { body: "#c8ccd0", edge: "#9aa0a6", ink: "#3a3f45", sub: "#6b7178" },
  light: { body: "#d6d9dc", edge: "#a8aeb4", ink: "#33383d", sub: "#666c72" },
  black: { body: "#16181c", edge: "#2c3138", ink: "#c9ced4", sub: "#7b828a" },
  dark: { body: "#1a1d22", edge: "#31363d", ink: "#c2c7cd", sub: "#787f87" },
};

/** Connector footprint in units of the port cell scale. */
function portShape(kind: RackPort["kind"]): { w: number; h: number } {
  switch (kind) {
    case "sfp":
    case "sfp-plus":
    case "sfp28":
      return { w: 1.55, h: 0.78 };
    case "qsfp":
      return { w: 1.85, h: 0.86 };
    case "power":
      return { w: 1.15, h: 1.0 };
    case "usb":
      return { w: 0.72, h: 0.52 };
    case "console":
      return { w: 1.0, h: 0.95 };
    default:
      return { w: 1.0, h: 0.95 };
  }
}

/** SFP-family cages stack two-high; copper stacks two-high; USB does not. */
const STACKS = new Set(["rj45", "console", "sfp", "sfp-plus", "sfp28", "blank", "power"]);

interface Props {
  device: RackDevice;
  /** Full faceplate width in SVG units, rack ears included. */
  width: number;
  /** Height of one rack unit in SVG units. */
  unitH: number;
  /** True on the enlarged detail render: port numbers and finer detail. */
  detail?: boolean;
  /** Disables blink animation, for thumbnails. */
  still?: boolean;
}

export function DeviceFaceplate({ device, width, unitH, detail = false, still = false }: Props) {
  const H = device.u * unitH;
  const ear = Math.max(9, width * 0.026);
  const bodyX = ear;
  const bodyW = width - ear * 2;
  const inset = Math.max(1, unitH * 0.05);
  const accent = device.accent ?? "#8a93a6";
  const fin = FINISHES[device.finish ?? "dark"];
  const showText = unitH >= 30;

  const screws: JSX.Element[] = [];
  for (let u = 0; u < device.u; u++) {
    for (const cx of [ear * 0.5, width - ear * 0.5]) {
      screws.push(
        <g key={`s${u}-${cx}`}>
          <circle cx={cx} cy={u * unitH + unitH * 0.5} r={Math.max(1.5, unitH * 0.075)} className="rk-screw" />
          <rect
            x={cx - Math.max(0.9, unitH * 0.045)}
            y={u * unitH + unitH * 0.5 - 0.4}
            width={Math.max(1.8, unitH * 0.09)}
            height={0.9}
            fill="#0d0f12"
            opacity={0.7}
          />
        </g>,
      );
    }
  }

  // Where the port field may live, after branding on the left and any
  // module bay on the right have taken their share.
  // A faceplate screen sits hard left, so the silkscreen starts after it.
  // Drawing the two at the same origin put the brand text under the LCD.
  const dispW = device.display ? Math.min(H * 0.62, bodyW * 0.07) : 0;
  const dispPad = device.display ? unitH * 0.14 : 0;
  const brandW = showText ? bodyW * (detail ? 0.1 : 0.13) : bodyW * 0.03;
  const textX = bodyX + dispW + dispPad + unitH * 0.16;
  const fieldX = bodyX + dispW + dispPad + brandW;
  const fieldW = bodyW - (fieldX - bodyX) - unitH * 0.14;

  return (
    <g>
      <rect x={0} y={inset} width={ear} height={H - inset * 2} className="rk-ear" />
      <rect x={width - ear} y={inset} width={ear} height={H - inset * 2} className="rk-ear" />
      {screws}

      {/* Chassis. A hairline highlight along the top edge reads as sheet
          metal catching light, which is most of what sells a faceplate. */}
      <rect
        x={bodyX}
        y={inset}
        width={bodyW}
        height={H - inset * 2}
        rx={Math.max(1.5, unitH * 0.055)}
        fill={fin.body}
        stroke={fin.edge}
        strokeWidth={0.8}
      />
      <rect x={bodyX + 1.5} y={inset + 0.8} width={bodyW - 3} height={0.7} fill="#ffffff" opacity={device.finish === "silver" || device.finish === "light" ? 0.55 : 0.07} />
      <rect x={bodyX + 2} y={inset + 2.2} width={Math.max(2, bodyW * 0.004)} height={H - inset * 2 - 4} fill={accent} opacity={0.9} />

      {showText && (
        <text x={textX} y={inset + unitH * 0.34} fill={fin.ink} className="rk-brand" fontSize={Math.max(5.5, unitH * 0.13)}>
          {device.vendor === "Generic" ? "" : device.vendor.toUpperCase()}
        </text>
      )}
      {showText && detail && (
        <text x={textX} y={inset + unitH * 0.56} fill={fin.sub} className="rk-brand" fontSize={Math.max(4.5, unitH * 0.1)}>
          {device.model.split("(")[0].trim().slice(0, 22)}
        </text>
      )}

      {device.display && (
        <Display kind={device.display} x={bodyX + unitH * 0.16} y={H / 2 - dispW / 2} w={dispW} h={dispW} fin={fin} />
      )}

      <FaceContent
        device={device}
        fieldX={fieldX}
        fieldW={fieldW}
        bodyX={bodyX}
        bodyW={bodyW}
        unitH={unitH}
        inset={inset}
        detail={detail}
        still={still}
        fin={fin}
      />
      <ChassisLeds device={device} bodyX={bodyX} bodyW={bodyW} unitH={unitH} inset={inset} still={still} />
    </g>
  );
}

/** A small screen on the faceplate. UniFi ships one on most rack gear. */
function Display(props: { kind: string; x: number; y: number; w: number; h: number; fin: { edge: string } }) {
  const { kind, x, y, w, h, fin } = props;
  const s = Math.min(w, h);
  return (
    <g>
      <rect x={x} y={y} width={s} height={s} rx={s * 0.16} fill="#10141a" stroke={fin.edge} strokeWidth={0.6} />
      {kind === "unifi" ? (
        <>
          <circle cx={x + s / 2} cy={y + s / 2} r={s * 0.26} fill="none" stroke="#4cc3f1" strokeWidth={Math.max(0.6, s * 0.05)} opacity={0.9} />
          <circle cx={x + s / 2} cy={y + s / 2} r={s * 0.07} fill="#4cc3f1" />
        </>
      ) : (
        <>
          <rect x={x + s * 0.16} y={y + s * 0.3} width={s * 0.68} height={s * 0.16} rx={1} fill="#6fe3b1" opacity={0.85} />
          <rect x={x + s * 0.16} y={y + s * 0.56} width={s * 0.42} height={s * 0.1} rx={1} fill="#6fe3b1" opacity={0.5} />
        </>
      )}
    </g>
  );
}

function FaceContent(props: {
  device: RackDevice;
  fieldX: number;
  fieldW: number;
  bodyX: number;
  bodyW: number;
  unitH: number;
  inset: number;
  detail: boolean;
  still: boolean;
  fin: { body: string; edge: string; ink: string; sub: string };
}) {
  const { device } = props;
  if (device.family === "blank") {
    return <BlankFace look={device.look ?? "solid"} bodyX={props.bodyX} bodyW={props.bodyW} unitH={props.unitH} inset={props.inset} u={device.u} fin={props.fin} />;
  }
  if (device.bays) return <BayFace {...props} />;
  if (device.ports?.length) return <PortField {...props} />;
  if (device.family === "ups") return <VentField bodyX={props.bodyX} bodyW={props.bodyW} unitH={props.unitH} u={device.u} fin={props.fin} />;
  return null;
}

/**
 * The port field: two rows, odd on top, grouped in blocks.
 *
 * Ports are laid out per kind-run so a 48 copper plus 4 SFP+ face puts the
 * copper in its own stacked block and the cages in theirs, which is how the
 * hardware is actually arranged.
 */
function PortField(props: {
  device: RackDevice;
  fieldX: number;
  fieldW: number;
  unitH: number;
  inset: number;
  detail: boolean;
  still: boolean;
  fin: { edge: string; sub: string };
}) {
  const { device, fieldX, fieldW, unitH, inset, detail, still, fin } = props;
  const ports = device.ports ?? [];
  const H = device.u * unitH;
  const isPatch = device.family === "patch";
  const tint = device.portTint ?? "#0d1014";

  // Split into runs of like connectors, preserving order.
  const runs: Array<{ kind: RackPort["kind"]; items: Array<{ p: RackPort; i: number }> }> = [];
  ports.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === p.kind) last.items.push({ p, i });
    else runs.push({ kind: p.kind, items: [{ p, i }] });
  });

  // Each run gets columns = ceil(n/rows). Total columns decide the scale.
  const group = device.groupsOf ?? 0;
  const plan = runs.map((r) => {
    const stack = !device.singleRow && STACKS.has(r.kind) && r.items.length >= 4;
    const rows = stack ? 2 : 1;
    const cols = Math.ceil(r.items.length / rows);
    return { ...r, rows, cols, shape: portShape(r.kind) };
  });

  const totalW = plan.reduce((s, r) => s + r.cols * r.shape.w, 0);
  const gapsBetweenRuns = (plan.length - 1) * 0.9;
  const groupGaps = group ? plan.reduce((s, r) => s + Math.max(0, Math.ceil(r.cols / group) - 1) * 0.45, 0) : 0;
  const denom = totalW + gapsBetweenRuns + groupGaps + plan.length * 0.3;

  const maxRows = Math.max(...plan.map((r) => r.rows));
  const vSpace = (H - inset * 2) * (detail ? 0.5 : 0.58);
  const scale = Math.min(fieldW / denom, vSpace / maxRows / 0.95);
  const cellGapX = scale * 0.13;
  const cellGapY = scale * 0.16;
  const midY = H / 2 + (detail ? unitH * 0.04 : 0);

  const nodes: JSX.Element[] = [];
  let x = fieldX;

  for (const run of plan) {
    const { shape } = run;
    const pw = shape.w * scale - cellGapX;
    const ph = shape.h * scale - cellGapY;
    const blockH = run.rows * ph + (run.rows - 1) * cellGapY;
    const top = midY - blockH / 2;

    run.items.forEach((entry, k) => {
      // Odd numbers on the top row, even on the bottom: index 0 top,
      // 1 bottom, 2 top, and so on, which walks left to right in pairs.
      const col = run.rows === 2 ? Math.floor(k / 2) : k;
      const row = run.rows === 2 ? k % 2 : 0;
      const gx = group ? Math.floor(col / group) * scale * 0.45 : 0;
      const px = x + col * (pw + cellGapX) + gx;
      const py = top + row * (ph + cellGapY);
      nodes.push(
        <Port
          key={entry.i}
          port={entry.p}
          x={px}
          y={py}
          w={pw}
          h={ph}
          tint={tint}
          edge={fin.edge}
          isPatch={isPatch}
          still={still}
          index={entry.i}
        />,
      );
      // Port numbers above the top row and below the bottom, the way the
      // silkscreen does it, but only where they would actually be legible.
      if (detail && run.kind === "rj45" && ph > 9) {
        const n = k + 1;
        nodes.push(
          <text
            key={`n${entry.i}`}
            x={px + pw / 2}
            y={row === 0 ? top - 1.6 : top + blockH + ph * 0.42}
            textAnchor="middle"
            fill={fin.sub}
            fontSize={Math.max(3.2, ph * 0.3)}
            className="rk-portnum"
          >
            {n}
          </text>,
        );
      }
    });

    const runW = run.cols * (pw + cellGapX) + (group ? Math.max(0, Math.ceil(run.cols / group) - 1) * scale * 0.45 : 0);
    x += runW + scale * 0.9;
  }

  return <g>{nodes}</g>;
}

/** A single connector, drawn to its kind. */
function Port(props: {
  port: RackPort;
  x: number;
  y: number;
  w: number;
  h: number;
  tint: string;
  edge: string;
  isPatch: boolean;
  still: boolean;
  index: number;
}) {
  const { port, x, y, w, h, tint, edge, isPatch, still, index } = props;
  const lit = Boolean(port.led && port.led !== "off");
  const colour = LED_COLOURS[port.led ?? "off"];
  const k = port.kind;

  if (k === "blank") {
    return (
      <g>
        <title>{`${port.label}: open position`}</title>
        <rect x={x} y={y} width={w} height={h} rx={1} fill="#0a0c0f" stroke={edge} strokeWidth={0.4} opacity={0.85} />
      </g>
    );
  }

  if (k === "power") {
    return (
      <g>
        <title>{port.label}</title>
        <rect x={x} y={y} width={w} height={h} rx={1.5} fill="#101318" stroke={edge} strokeWidth={0.5} />
        <rect x={x + w * 0.26} y={y + h * 0.22} width={w * 0.1} height={h * 0.3} rx={0.4} fill="#c8ccd0" opacity={0.55} />
        <rect x={x + w * 0.64} y={y + h * 0.22} width={w * 0.1} height={h * 0.3} rx={0.4} fill="#c8ccd0" opacity={0.55} />
        <circle cx={x + w * 0.5} cy={y + h * 0.72} r={Math.max(0.6, w * 0.08)} fill="#c8ccd0" opacity={0.55} />
      </g>
    );
  }

  if (k === "usb") {
    return (
      <g>
        <title>{port.label}</title>
        <rect x={x} y={y} width={w} height={h} rx={0.8} fill="#101318" stroke={edge} strokeWidth={0.4} />
        <rect x={x + w * 0.16} y={y + h * 0.42} width={w * 0.68} height={h * 0.3} fill="#3a6ea5" opacity={0.75} />
      </g>
    );
  }

  const isCopper = k === "rj45" || k === "console";

  return (
    <g>
      <title>{`${port.label}${port.led ? (lit ? ", link up" : ", no link") : ""}`}</title>
      {isCopper ? (
        <>
          {/* Shielded jack body, then the dark throat, then the clip slot
              cut into the top edge, which is what makes an RJ45 read as one. */}
          <rect x={x} y={y} width={w} height={h} rx={0.8} fill="#8f959c" stroke={edge} strokeWidth={0.4} />
          <rect x={x + w * 0.12} y={y + h * 0.2} width={w * 0.76} height={h * 0.66} rx={0.6} fill={tint} />
          <rect x={x + w * 0.38} y={y + h * 0.06} width={w * 0.24} height={h * 0.2} rx={0.4} fill={tint} />
          {/* Contact pins catching light at the back of the throat. */}
          <rect x={x + w * 0.2} y={y + h * 0.34} width={w * 0.6} height={h * 0.13} fill="#d8b45a" opacity={0.5} />
          {/* Link LEDs sit in the jack's own top corners on real hardware. */}
          {!isPatch && port.led && (
            <>
              <rect
                x={x + w * 0.13}
                y={y + h * 0.2}
                width={w * 0.16}
                height={h * 0.14}
                fill={colour}
                className={lit && !still ? "rk-led rk-led-on" : "rk-led"}
                style={lit && !still ? { animationDelay: `${(index % 7) * 0.31}s`, animationDuration: `${1.3 + (index % 5) * 0.22}s` } : undefined}
              />
              <rect x={x + w * 0.71} y={y + h * 0.2} width={w * 0.16} height={h * 0.14} fill={lit ? "#ffb020" : LED_COLOURS.off} opacity={lit ? 0.8 : 1} />
            </>
          )}
        </>
      ) : (
        <>
          {/* An SFP cage: metal shell, dark aperture, latch bar, and a
              coloured tab that identifies the speed class. */}
          <rect x={x} y={y} width={w} height={h} rx={0.8} fill="#7e848b" stroke={edge} strokeWidth={0.4} />
          <rect x={x + w * 0.08} y={y + h * 0.24} width={w * 0.84} height={h * 0.54} rx={0.6} fill="#0b0d10" />
          <rect x={x + w * 0.08} y={y + h * 0.14} width={w * 0.84} height={h * 0.08} fill="#5c6169" />
          {(k === "sfp28" || k === "qsfp") && (
            <rect x={x + w * 0.08} y={y + h * 0.82} width={w * 0.84} height={h * 0.1} fill={k === "qsfp" ? "#9234ea" : "#4cc3f1"} opacity={0.85} />
          )}
          {lit && (
            <circle
              cx={x + w * 0.5}
              cy={y + h * 0.51}
              r={Math.max(0.7, h * 0.11)}
              fill={colour}
              className={still ? "rk-led" : "rk-led rk-led-on"}
              style={still ? undefined : { animationDelay: `${(index % 5) * 0.4}s`, animationDuration: `${1.5 + (index % 4) * 0.3}s` }}
            />
          )}
        </>
      )}
      {lit && typeof port.activity === "number" && (
        <rect x={x} y={y + h + 0.9} width={Math.max(0.8, w * port.activity)} height={Math.max(0.7, h * 0.07)} fill={colour} opacity={0.7} />
      )}
    </g>
  );
}

/** Drive sleds, with the latch handle and dual LEDs a real caddy carries. */
function BayFace(props: { device: RackDevice; fieldX: number; fieldW: number; unitH: number; still: boolean; fin: { edge: string } }) {
  const { device, fieldX, fieldW, unitH, still, fin } = props;
  const bays = device.bays!;
  const H = device.u * unitH;
  const rows = device.u >= 2 ? 2 : 1;
  const cols = Math.ceil(bays.count / rows);
  const cellW = fieldW / cols;
  const cellH = (H * 0.74) / rows;
  const top = H * 0.13;

  const sleds: JSX.Element[] = [];
  for (let i = 0; i < bays.count; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = fieldX + c * cellW + cellW * 0.05;
    const y = top + r * cellH + cellH * 0.06;
    const w = cellW * 0.9;
    const h = cellH * 0.88;
    const on = i < bays.occupied;
    sleds.push(
      <g key={i}>
        <title>{`Bay ${i + 1}: ${on ? bays.label : "empty"}`}</title>
        <rect x={x} y={y} width={w} height={h} rx={1.2} fill={on ? "#2b2f35" : "#0c0e11"} stroke={fin.edge} strokeWidth={0.5} />
        {on && (
          <>
            {/* The caddy handle: a vertical bar with a release catch. */}
            <rect x={x + w * 0.07} y={y + h * 0.14} width={w * 0.11} height={h * 0.72} rx={0.8} fill="#40454c" />
            <rect x={x + w * 0.09} y={y + h * 0.42} width={w * 0.07} height={h * 0.16} fill="#0b0d10" />
            {/* Vent slots across the sled face. */}
            {[0.32, 0.46, 0.6, 0.74].map((f) => (
              <rect key={f} x={x + w * f} y={y + h * 0.2} width={w * 0.05} height={h * 0.6} rx={0.5} fill="#14171b" />
            ))}
            <circle cx={x + w * 0.9} cy={y + h * 0.28} r={Math.max(0.9, h * 0.08)} fill={LED_COLOURS.green} />
            <circle
              cx={x + w * 0.9}
              cy={y + h * 0.66}
              r={Math.max(0.9, h * 0.08)}
              fill={LED_COLOURS.amber}
              className={still ? undefined : "rk-led rk-led-on"}
              style={still ? undefined : { animationDelay: `${(i % 6) * 0.24}s`, animationDuration: `${0.8 + (i % 4) * 0.35}s` }}
            />
          </>
        )}
      </g>,
    );
  }
  return <g>{sleds}</g>;
}

/** A field of vent slots, for hardware whose face is mostly airflow. */
function VentField(props: { bodyX: number; bodyW: number; unitH: number; u: number; fin: { edge: string } }) {
  const { bodyX, bodyW, unitH, u } = props;
  const H = u * unitH;
  const n = 22;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={bodyX + bodyW * 0.2 + i * bodyW * 0.028} y={H * 0.26} width={bodyW * 0.014} height={H * 0.48} rx={0.8} fill="#0d1014" opacity={0.8} />
      ))}
    </g>
  );
}

/** Passive filler: vents, a solid plate, cable rings, or a loaded shelf. */
function BlankFace(props: { look: string; bodyX: number; bodyW: number; unitH: number; inset: number; u: number; fin: { edge: string; sub: string } }) {
  const { look, bodyX, bodyW, unitH, inset, u, fin } = props;
  const H = u * unitH;
  if (look === "vented") {
    return (
      <g>
        {Array.from({ length: 26 }, (_, i) => (
          <rect key={i} x={bodyX + bodyW * 0.05 + i * bodyW * 0.035} y={H * 0.3} width={bodyW * 0.018} height={H * 0.4} rx={0.8} fill="#0d1014" opacity={0.7} />
        ))}
      </g>
    );
  }
  if (look === "fingers") {
    return (
      <g>
        {Array.from({ length: 7 }, (_, i) => (
          <path
            key={i}
            d={`M ${bodyX + bodyW * 0.08 + i * bodyW * 0.128} ${H * 0.2}
                h ${bodyW * 0.062} v ${H * 0.6} h ${-bodyW * 0.062}`}
            fill="none"
            stroke={fin.sub}
            strokeWidth={Math.max(1, H * 0.05)}
            strokeLinejoin="round"
            opacity={0.75}
          />
        ))}
      </g>
    );
  }
  if (look === "shelf") {
    return (
      <g>
        <rect x={bodyX + 2} y={H - inset - Math.max(2, H * 0.14)} width={bodyW - 4} height={Math.max(2, H * 0.11)} fill="#2a2e34" />
        <rect x={bodyX + bodyW * 0.58} y={H * 0.2} width={bodyW * 0.24} height={H * 0.58} rx={2} fill="#1b1f24" stroke={fin.edge} strokeWidth={0.6} />
        {[0.3, 0.44, 0.58].map((f) => (
          <rect key={f} x={bodyX + bodyW * 0.61} y={H * f} width={bodyW * 0.05} height={H * 0.07} rx={0.6} fill="#0d1014" />
        ))}
        <circle cx={bodyX + bodyW * 0.785} cy={H * 0.32} r={Math.max(1, H * 0.05)} fill={LED_COLOURS.green} />
      </g>
    );
  }
  return null;
}

/** Chassis indicators from the datasheet, at the faceplate's right end. */
function ChassisLeds(props: { device: RackDevice; bodyX: number; bodyW: number; unitH: number; inset: number; still: boolean }) {
  const { device, bodyX, bodyW, unitH, inset, still } = props;
  if (!device.leds?.length) return null;
  const H = device.u * unitH;
  const x = bodyX + bodyW - unitH * 0.22;
  const n = device.leds.length;
  return (
    <g>
      {device.leds.map((led, i) => (
        <circle
          key={i}
          cx={x}
          cy={inset * 2 + ((H - inset * 4) / (n + 1)) * (i + 1)}
          r={Math.max(1, unitH * 0.05)}
          fill={LED_COLOURS[led]}
          className={led !== "off" && !still ? "rk-led rk-led-on" : "rk-led"}
          style={led !== "off" && !still ? { animationDuration: `${2.1 + i * 0.6}s` } : undefined}
        />
      ))}
    </g>
  );
}
