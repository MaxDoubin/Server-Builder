/**
 * One device's front panel, drawn as SVG from its RackDevice data.
 *
 * Layout follows vendor product photography, because the details are what
 * make an elevation readable:
 *
 * - Dense faceplates stack into TWO rows with odd port numbers on top and
 *   even below. Nearly every 24 and 48 port switch made in the last twenty
 *   years does this, and one flat row of 48 jacks looks nothing like real
 *   hardware.
 * - Jacks group in blocks with a gap every 6, 8 or 12, which is how a
 *   technician counts to port 34 without reading a label.
 * - The link LED sits in the top corners of the RJ45 throat itself.
 * - Chassis colour identifies a vendor: UniFi silver, Catalyst pale grey
 *   with teal port throats, MikroTik black.
 *
 * Everything is shaded from the material library in RackDefs rather than
 * filled flat. A port is a metal shell with a bevel, a recessed throat that
 * darkens toward the back, and gold pins catching light at the top; a lit
 * LED is a bright core inside a soft bloom. Those three things are the
 * difference between hardware and a wiring diagram.
 */

import type { RackDevice, RackPort } from "@/lib/rackTypes";
import { LED_COLOURS, MATERIALS, defUrl } from "./RackDefs";

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

/** Connector families that stack two-high on a dense panel. */
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
  /** Per-SVG id prefix, so eight racks on one page do not collide. */
  uid: string;
}

export function DeviceFaceplate({ device, width, unitH, detail = false, still = false, uid }: Props) {
  const H = device.u * unitH;
  const ear = Math.max(9, width * 0.026);
  const bodyX = ear;
  const bodyW = width - ear * 2;
  const inset = Math.max(1, unitH * 0.05);
  const accent = device.accent ?? "#8a93a6";
  const finish = device.finish ?? "dark";
  const m = MATERIALS[finish];
  const showText = unitH >= 30;
  const r = Math.max(1.5, unitH * 0.05);

  const dispW = device.display ? Math.min(H * 0.58, bodyW * 0.068) : 0;
  const dispPad = device.display ? unitH * 0.13 : 0;
  const brandW = showText ? bodyW * (detail ? 0.095 : 0.125) : bodyW * 0.03;
  const textX = bodyX + dispW + dispPad + unitH * 0.15;
  const fieldX = bodyX + dispW + dispPad + brandW;
  const fieldW = bodyW - (fieldX - bodyX) - unitH * 0.13;

  return (
    <g>
      {/* Shadow the chassis casts down onto the rail below it. */}
      <rect x={bodyX} y={H - inset} width={bodyW} height={Math.max(1.5, unitH * 0.1)} fill={defUrl(uid, "castshadow")} />

      <RackEars uid={uid} width={width} ear={ear} H={H} inset={inset} u={device.u} unitH={unitH} />

      {/* Chassis: shaded metal, then the brushed grain, then the bevels. */}
      <rect x={bodyX} y={inset} width={bodyW} height={H - inset * 2} rx={r} fill={defUrl(uid, `face-${finish}`)} />
      <rect
        x={bodyX}
        y={inset}
        width={bodyW}
        height={H - inset * 2}
        rx={r}
        fill={defUrl(uid, m.pale ? "grain-l" : "grain-d")}
      />
      {/* Machined top edge and the shadow line where it meets the next unit. */}
      <rect x={bodyX + r} y={inset + 0.35} width={bodyW - r * 2} height={0.6} fill="#fff" opacity={m.pale ? 0.75 : 0.16} />
      <rect x={bodyX + r} y={H - inset - 1} width={bodyW - r * 2} height={0.7} fill="#000" opacity={0.42} />
      <rect
        x={bodyX}
        y={inset}
        width={bodyW}
        height={H - inset * 2}
        rx={r}
        fill="none"
        stroke="#000"
        strokeOpacity={0.34}
        strokeWidth={0.6}
      />
      {/* Role stripe, the one non-physical marking, kept to a thin inlay. */}
      <rect x={bodyX + 1.6} y={inset + 1.8} width={Math.max(1.6, bodyW * 0.0035)} height={H - inset * 2 - 3.6} fill={accent} opacity={0.92} />

      {showText && (
        <text x={textX} y={inset + unitH * 0.32} fill={m.ink} className="rk-brand" fontSize={Math.max(5.5, unitH * 0.125)} opacity={0.9}>
          {device.vendor === "Generic" ? "" : device.vendor.toUpperCase()}
        </text>
      )}
      {showText && detail && (
        <text x={textX} y={inset + unitH * 0.53} fill={m.sub} className="rk-brand" fontSize={Math.max(4.5, unitH * 0.095)} opacity={0.85}>
          {device.model.split("(")[0].trim().slice(0, 24)}
        </text>
      )}

      {device.display && <Display uid={uid} kind={device.display} x={bodyX + unitH * 0.15} y={H / 2 - dispW / 2} s={dispW} />}

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
        m={m}
        uid={uid}
      />
      <ChassisLeds device={device} bodyX={bodyX} bodyW={bodyW} unitH={unitH} inset={inset} still={still} uid={uid} />
    </g>
  );
}

/** Rack ears with countersunk screws, one pair per rack unit. */
function RackEars(props: { uid: string; width: number; ear: number; H: number; inset: number; u: number; unitH: number }) {
  const { uid, width, ear, H, inset, u, unitH } = props;
  const screws: JSX.Element[] = [];
  for (let i = 0; i < u; i++) {
    for (const cx of [ear * 0.5, width - ear * 0.5]) {
      const cy = i * unitH + unitH * 0.5;
      const rad = Math.max(1.5, unitH * 0.072);
      screws.push(
        <g key={`${i}-${cx}`}>
          {/* Countersink well, then the head, then a specular fleck. */}
          <circle cx={cx} cy={cy} r={rad * 1.28} fill="#000" opacity={0.42} />
          <circle cx={cx} cy={cy} r={rad} fill={defUrl(uid, "screw")} />
          <rect x={cx - rad * 0.62} y={cy - rad * 0.11} width={rad * 1.24} height={rad * 0.22} fill="#0a0c0f" opacity={0.85} />
          <rect x={cx - rad * 0.11} y={cy - rad * 0.62} width={rad * 0.22} height={rad * 1.24} fill="#0a0c0f" opacity={0.85} />
          <circle cx={cx - rad * 0.33} cy={cy - rad * 0.36} r={rad * 0.2} fill="#dfe3e7" opacity={0.5} />
        </g>,
      );
    }
  }
  return (
    <g>
      <rect x={0} y={inset} width={ear} height={H - inset * 2} fill={defUrl(uid, "rail")} />
      <rect x={width - ear} y={inset} width={ear} height={H - inset * 2} fill={defUrl(uid, "rail")} />
      {screws}
    </g>
  );
}

/** A backlit screen on the faceplate. */
function Display(props: { uid: string; kind: string; x: number; y: number; s: number }) {
  const { uid, kind, x, y, s } = props;
  return (
    <g>
      <rect x={x - 0.6} y={y - 0.6} width={s + 1.2} height={s + 1.2} rx={s * 0.19} fill="#000" opacity={0.5} />
      <rect x={x} y={y} width={s} height={s} rx={s * 0.16} fill={defUrl(uid, "lcd")} />
      {/* Glass reflection across the upper left. */}
      <path d={`M ${x} ${y + s * 0.44} L ${x + s * 0.52} ${y} L ${x + s} ${y} L ${x} ${y + s * 0.9} Z`} fill="#fff" opacity={0.05} />
      {kind === "unifi" ? (
        <>
          <circle cx={x + s / 2} cy={y + s / 2} r={s * 0.3} fill={defUrl(uid, "glow-blue")} />
          <circle cx={x + s / 2} cy={y + s / 2} r={s * 0.25} fill="none" stroke={LED_COLOURS.blue} strokeWidth={Math.max(0.5, s * 0.045)} />
          <circle cx={x + s / 2} cy={y + s / 2} r={s * 0.065} fill="#dff6ff" />
        </>
      ) : (
        <>
          <rect x={x + s * 0.17} y={y + s * 0.29} width={s * 0.66} height={s * 0.14} rx={0.6} fill="#7cf0bd" opacity={0.9} />
          <rect x={x + s * 0.17} y={y + s * 0.54} width={s * 0.4} height={s * 0.09} rx={0.6} fill="#7cf0bd" opacity={0.55} />
          <rect x={x + s * 0.17} y={y + s * 0.71} width={s * 0.52} height={s * 0.07} rx={0.6} fill="#7cf0bd" opacity={0.35} />
        </>
      )}
    </g>
  );
}

interface ContentProps {
  device: RackDevice;
  fieldX: number;
  fieldW: number;
  bodyX: number;
  bodyW: number;
  unitH: number;
  inset: number;
  detail: boolean;
  still: boolean;
  m: (typeof MATERIALS)[string];
  uid: string;
}

function FaceContent(props: ContentProps) {
  const { device } = props;
  if (device.family === "blank") return <BlankFace {...props} />;
  if (device.bays) return <BayFace {...props} />;
  if (device.ports?.length) return <PortField {...props} />;
  if (device.family === "ups") return <VentField {...props} count={24} />;
  return null;
}

/** Two rows, odd on top, grouped in blocks, one run per connector family. */
function PortField(props: ContentProps) {
  const { device, fieldX, fieldW, unitH, inset, detail, still, m, uid } = props;
  const ports = device.ports ?? [];
  const H = device.u * unitH;
  const isPatch = device.family === "patch";
  const throat = device.portTint ? defUrl(uid, "throat-teal") : defUrl(uid, "throat");

  const runs: Array<{ kind: RackPort["kind"]; items: Array<{ p: RackPort; i: number }> }> = [];
  ports.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.kind === p.kind) last.items.push({ p, i });
    else runs.push({ kind: p.kind, items: [{ p, i }] });
  });

  const group = device.groupsOf ?? 0;
  const plan = runs.map((run) => {
    const stack = !device.singleRow && STACKS.has(run.kind) && run.items.length >= 4;
    const rows = stack ? 2 : 1;
    return { ...run, rows, cols: Math.ceil(run.items.length / rows), shape: portShape(run.kind) };
  });

  const totalW = plan.reduce((s, x) => s + x.cols * x.shape.w, 0);
  const runGaps = (plan.length - 1) * 0.9;
  const groupGaps = group ? plan.reduce((s, x) => s + Math.max(0, Math.ceil(x.cols / group) - 1) * 0.45, 0) : 0;
  const denom = totalW + runGaps + groupGaps + plan.length * 0.3;

  const maxRows = Math.max(...plan.map((x) => x.rows));
  const vSpace = (H - inset * 2) * (detail ? 0.5 : 0.58);
  const scale = Math.min(fieldW / denom, vSpace / maxRows / 0.95);
  const gapX = scale * 0.13;
  const gapY = scale * 0.16;
  const midY = H / 2 + (detail ? unitH * 0.03 : 0);

  const nodes: JSX.Element[] = [];
  let x = fieldX;

  for (const run of plan) {
    const pw = run.shape.w * scale - gapX;
    const ph = run.shape.h * scale - gapY;
    const blockH = run.rows * ph + (run.rows - 1) * gapY;
    const top = midY - blockH / 2;

    run.items.forEach((entry, k) => {
      const col = run.rows === 2 ? Math.floor(k / 2) : k;
      const row = run.rows === 2 ? k % 2 : 0;
      const gx = group ? Math.floor(col / group) * scale * 0.45 : 0;
      const px = x + col * (pw + gapX) + gx;
      const py = top + row * (ph + gapY);
      nodes.push(
        <Port key={entry.i} uid={uid} port={entry.p} x={px} y={py} w={pw} h={ph} throat={throat} isPatch={isPatch} still={still} index={entry.i} />,
      );
      if (detail && run.kind === "rj45" && ph > 9) {
        nodes.push(
          <text
            key={`n${entry.i}`}
            x={px + pw / 2}
            y={row === 0 ? top - 1.5 : top + blockH + ph * 0.4}
            textAnchor="middle"
            fill={m.sub}
            fontSize={Math.max(3.2, ph * 0.28)}
            className="rk-portnum"
            opacity={0.85}
          >
            {k + 1}
          </text>,
        );
      }
    });

    x += run.cols * (pw + gapX) + (group ? Math.max(0, Math.ceil(run.cols / group) - 1) * scale * 0.45 : 0) + scale * 0.9;
  }

  return <g>{nodes}</g>;
}

/** A single connector: shell, bevel, recessed throat, contacts, indicators. */
function Port(props: {
  uid: string;
  port: RackPort;
  x: number;
  y: number;
  w: number;
  h: number;
  throat: string;
  isPatch: boolean;
  still: boolean;
  index: number;
}) {
  const { uid, port, x, y, w, h, throat, isPatch, still, index } = props;
  const lit = Boolean(port.led && port.led !== "off");
  const colour = LED_COLOURS[port.led ?? "off"];
  const k = port.kind;
  const rr = Math.max(0.4, w * 0.06);

  if (k === "blank") {
    return (
      <g>
        <title>{`${port.label}: open position`}</title>
        <rect x={x} y={y} width={w} height={h} rx={rr} fill="#05070a" />
        <rect x={x} y={y} width={w} height={h * 0.14} fill="#000" opacity={0.85} />
        <rect x={x} y={y + h - h * 0.1} width={w} height={h * 0.1} fill="#585f66" opacity={0.5} />
      </g>
    );
  }

  if (k === "power") {
    return (
      <g>
        <title>{port.label}</title>
        <rect x={x} y={y} width={w} height={h} rx={rr * 2} fill={defUrl(uid, "shell-dark")} />
        <rect x={x + w * 0.06} y={y + h * 0.06} width={w * 0.88} height={h * 0.88} rx={rr * 1.6} fill={throat} />
        <rect x={x + w * 0.26} y={y + h * 0.2} width={w * 0.09} height={h * 0.3} rx={0.3} fill="#c3c9cf" opacity={0.7} />
        <rect x={x + w * 0.65} y={y + h * 0.2} width={w * 0.09} height={h * 0.3} rx={0.3} fill="#c3c9cf" opacity={0.7} />
        <circle cx={x + w * 0.5} cy={y + h * 0.71} r={Math.max(0.5, w * 0.075)} fill="#c3c9cf" opacity={0.7} />
        <rect x={x} y={y} width={w} height={h * 0.1} rx={rr} fill="#fff" opacity={0.14} />
      </g>
    );
  }

  if (k === "usb") {
    return (
      <g>
        <title>{port.label}</title>
        <rect x={x} y={y} width={w} height={h} rx={rr} fill={defUrl(uid, "shell")} />
        <rect x={x + w * 0.1} y={y + h * 0.24} width={w * 0.8} height={h * 0.56} fill={throat} />
        <rect x={x + w * 0.14} y={y + h * 0.44} width={w * 0.72} height={h * 0.26} fill="#2f6fb5" />
        <rect x={x} y={y} width={w} height={h * 0.12} rx={rr} fill="#fff" opacity={0.3} />
      </g>
    );
  }

  const copper = k === "rj45" || k === "console";

  return (
    <g>
      <title>{`${port.label}${port.led ? (lit ? ", link up" : ", no link") : ""}`}</title>
      {copper ? (
        <>
          {/* Shielded jack: metal shell with a lit top bevel. */}
          <rect x={x} y={y} width={w} height={h} rx={rr} fill={defUrl(uid, "shell")} />
          <rect x={x} y={y} width={w} height={h * 0.1} rx={rr} fill="#fff" opacity={0.42} />
          <rect x={x} y={y + h * 0.9} width={w} height={h * 0.1} fill="#000" opacity={0.3} />
          {/* The opening, plus the clip slot notched out of its top edge. */}
          <rect x={x + w * 0.1} y={y + h * 0.19} width={w * 0.8} height={h * 0.69} rx={rr * 0.7} fill={throat} />
          <rect x={x + w * 0.41} y={y + h * 0.07} width={w * 0.18} height={h * 0.16} rx={0.25} fill={throat} />
          {/* Eight contacts catching light at the back of the throat. */}
          <rect x={x + w * 0.23} y={y + h * 0.29} width={w * 0.54} height={h * 0.055} fill={defUrl(uid, "pins")} opacity={0.42} />
          {/* The lower lip of the opening picks up a reflection. */}
          <rect x={x + w * 0.11} y={y + h * 0.83} width={w * 0.78} height={h * 0.04} fill="#7d858d" opacity={0.55} />
          {!isPatch && port.led && (
            <>
              {lit && <circle cx={x + w * 0.21} cy={y + h * 0.27} r={w * 0.26} fill={defUrl(uid, `glow-${port.led}`)} />}
              <rect
                x={x + w * 0.13}
                y={y + h * 0.21}
                width={w * 0.15}
                height={h * 0.13}
                rx={0.3}
                fill={lit ? colour : LED_COLOURS.off}
                className={lit && !still ? "rk-led rk-led-on" : undefined}
                style={lit && !still ? { animationDelay: `${(index % 7) * 0.31}s`, animationDuration: `${1.3 + (index % 5) * 0.22}s` } : undefined}
              />
              <rect x={x + w * 0.72} y={y + h * 0.21} width={w * 0.15} height={h * 0.13} rx={0.3} fill={lit ? LED_COLOURS.amber : LED_COLOURS.off} opacity={lit ? 0.9 : 1} />
            </>
          )}
        </>
      ) : (
        <>
          {/* An SFP cage: EMI shell, dark aperture, latch bar, speed tab. */}
          <rect x={x} y={y} width={w} height={h} rx={rr} fill={defUrl(uid, "shell-dark")} />
          <rect x={x} y={y} width={w} height={h * 0.1} rx={rr} fill="#fff" opacity={0.3} />
          <rect x={x + w * 0.07} y={y + h * 0.22} width={w * 0.86} height={h * 0.56} rx={rr * 0.6} fill={defUrl(uid, "throat")} />
          <rect x={x + w * 0.07} y={y + h * 0.13} width={w * 0.86} height={h * 0.07} fill="#868d95" opacity={0.75} />
          <rect x={x + w * 0.07} y={y + h * 0.74} width={w * 0.86} height={h * 0.035} fill="#6b7278" opacity={0.6} />
          {(k === "sfp28" || k === "qsfp") && (
            <rect x={x + w * 0.07} y={y + h * 0.82} width={w * 0.86} height={h * 0.09} rx={0.3} fill={k === "qsfp" ? "#a855f7" : "#38bdf8"} opacity={0.9} />
          )}
          {lit && (
            <>
              <circle cx={x + w * 0.5} cy={y + h * 0.5} r={w * 0.3} fill={defUrl(uid, `glow-${port.led}`)} />
              <circle
                cx={x + w * 0.5}
                cy={y + h * 0.5}
                r={Math.max(0.6, h * 0.1)}
                fill={colour}
                className={still ? undefined : "rk-led rk-led-on"}
                style={still ? undefined : { animationDelay: `${(index % 5) * 0.4}s`, animationDuration: `${1.5 + (index % 4) * 0.3}s` }}
              />
            </>
          )}
        </>
      )}
      {lit && typeof port.activity === "number" && (
        <rect x={x} y={y + h + 0.8} width={Math.max(0.8, w * port.activity)} height={Math.max(0.6, h * 0.06)} rx={0.3} fill={colour} opacity={0.55} />
      )}
    </g>
  );
}

/** Hot-plug drive sleds with caddy handles and status indicators. */
function BayFace(props: ContentProps) {
  const { device, fieldX, fieldW, unitH, still, uid } = props;
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
    const rw = Math.floor(i / cols);
    const x = fieldX + c * cellW + cellW * 0.05;
    const y = top + rw * cellH + cellH * 0.06;
    const w = cellW * 0.9;
    const h = cellH * 0.88;
    const on = i < bays.occupied;
    sleds.push(
      <g key={i}>
        <title>{`Bay ${i + 1}: ${on ? bays.label : "empty"}`}</title>
        <rect x={x - 0.5} y={y - 0.5} width={w + 1} height={h + 1} rx={1.4} fill="#000" opacity={0.55} />
        <rect x={x} y={y} width={w} height={h} rx={1.2} fill={defUrl(uid, on ? "sled" : "sled-empty")} />
        {on && (
          <>
            <rect x={x} y={y} width={w} height={h * 0.08} rx={1.2} fill="#fff" opacity={0.16} />
            {/* Caddy handle with its release catch. */}
            <rect x={x + w * 0.06} y={y + h * 0.13} width={w * 0.12} height={h * 0.74} rx={0.9} fill="#565c64" />
            <rect x={x + w * 0.06} y={y + h * 0.13} width={w * 0.12} height={h * 0.08} rx={0.9} fill="#8d949c" opacity={0.7} />
            <rect x={x + w * 0.085} y={y + h * 0.42} width={w * 0.07} height={h * 0.16} rx={0.4} fill="#0a0c0f" />
            {/* Vent slots across the sled face. */}
            {[0.3, 0.44, 0.58, 0.72].map((f) => (
              <rect key={f} x={x + w * f} y={y + h * 0.18} width={w * 0.045} height={h * 0.64} rx={0.4} fill={defUrl(uid, "vent")} />
            ))}
            <circle cx={x + w * 0.89} cy={y + h * 0.27} r={Math.max(1.2, h * 0.13)} fill={defUrl(uid, "glow-green")} />
            <circle cx={x + w * 0.89} cy={y + h * 0.27} r={Math.max(0.7, h * 0.07)} fill={LED_COLOURS.green} />
            <circle cx={x + w * 0.89} cy={y + h * 0.66} r={Math.max(1.2, h * 0.13)} fill={defUrl(uid, "glow-amber")} />
            <circle
              cx={x + w * 0.89}
              cy={y + h * 0.66}
              r={Math.max(0.7, h * 0.07)}
              fill={LED_COLOURS.amber}
              className={still ? undefined : "rk-led rk-led-on"}
              style={still ? undefined : { animationDelay: `${(i % 6) * 0.24}s`, animationDuration: `${0.8 + (i % 4) * 0.35}s` }}
            />
          </>
        )}
        {!on && <rect x={x + w * 0.1} y={y + h * 0.4} width={w * 0.8} height={h * 0.2} rx={0.6} fill="#000" opacity={0.6} />}
      </g>,
    );
  }
  return <g>{sleds}</g>;
}

/** A field of vent slots, for a face that is mostly airflow. */
function VentField(props: ContentProps & { count: number }) {
  const { bodyX, bodyW, unitH, device, uid, count } = props;
  const H = device.u * unitH;
  const step = (bodyW * 0.56) / count;
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} x={bodyX + bodyW * 0.22 + i * step} y={H * 0.24} width={Math.max(0.8, step * 0.42)} height={H * 0.52} rx={0.5} fill={defUrl(uid, "vent")} />
      ))}
    </g>
  );
}

/** Passive filler: vents, a solid plate, cable rings, or a loaded shelf. */
function BlankFace(props: ContentProps) {
  const { device, bodyX, bodyW, unitH, inset, uid, m } = props;
  const look = device.look ?? "solid";
  const H = device.u * unitH;

  if (look === "vented") {
    const n = 30;
    const step = (bodyW * 0.9) / n;
    return (
      <g>
        {Array.from({ length: n }, (_, i) => (
          <rect key={i} x={bodyX + bodyW * 0.05 + i * step} y={H * 0.28} width={Math.max(0.7, step * 0.4)} height={H * 0.44} rx={0.5} fill={defUrl(uid, "vent")} />
        ))}
      </g>
    );
  }
  if (look === "fingers") {
    return (
      <g>
        {Array.from({ length: 7 }, (_, i) => {
          const x = bodyX + bodyW * 0.075 + i * bodyW * 0.129;
          const w = bodyW * 0.066;
          return (
            <g key={i}>
              <path
                d={`M ${x} ${H * 0.18} h ${w} v ${H * 0.64} h ${-w}`}
                fill="none"
                stroke="#000"
                strokeOpacity={0.5}
                strokeWidth={Math.max(1.2, H * 0.062)}
                strokeLinejoin="round"
              />
              <path
                d={`M ${x} ${H * 0.18} h ${w} v ${H * 0.64} h ${-w}`}
                fill="none"
                stroke={m.pale ? "#9aa1a8" : "#5d646c"}
                strokeWidth={Math.max(0.9, H * 0.045)}
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </g>
    );
  }
  if (look === "shelf") {
    return (
      <g>
        <rect x={bodyX + 2} y={H - inset - Math.max(2, H * 0.15)} width={bodyW - 4} height={Math.max(2, H * 0.12)} fill={defUrl(uid, "sled")} />
        <rect x={bodyX + 2} y={H - inset - Math.max(2, H * 0.15)} width={bodyW - 4} height={0.7} fill="#fff" opacity={0.22} />
        {/* The mini PC the shelf exists for. */}
        <rect x={bodyX + bodyW * 0.575} y={H * 0.19} width={bodyW * 0.245} height={H * 0.59} rx={2} fill="#000" opacity={0.5} />
        <rect x={bodyX + bodyW * 0.58} y={H * 0.2} width={bodyW * 0.235} height={H * 0.57} rx={1.8} fill={defUrl(uid, "sled")} />
        <rect x={bodyX + bodyW * 0.58} y={H * 0.2} width={bodyW * 0.235} height={H * 0.05} rx={1.8} fill="#fff" opacity={0.14} />
        {[0.3, 0.44, 0.58].map((f) => (
          <rect key={f} x={bodyX + bodyW * 0.605} y={H * f} width={bodyW * 0.045} height={H * 0.065} rx={0.5} fill={defUrl(uid, "vent")} />
        ))}
        <circle cx={bodyX + bodyW * 0.783} cy={H * 0.31} r={Math.max(1.4, H * 0.065)} fill={defUrl(uid, "glow-green")} />
        <circle cx={bodyX + bodyW * 0.783} cy={H * 0.31} r={Math.max(0.8, H * 0.033)} fill={LED_COLOURS.green} />
      </g>
    );
  }
  return null;
}

/** Chassis indicators from the datasheet, at the faceplate's right end. */
function ChassisLeds(props: {
  device: RackDevice;
  bodyX: number;
  bodyW: number;
  unitH: number;
  inset: number;
  still: boolean;
  uid: string;
}) {
  const { device, bodyX, bodyW, unitH, inset, still, uid } = props;
  if (!device.leds?.length) return null;
  const H = device.u * unitH;
  const x = bodyX + bodyW - unitH * 0.2;
  const n = device.leds.length;
  return (
    <g>
      {device.leds.map((led, i) => {
        const cy = inset * 2 + ((H - inset * 4) / (n + 1)) * (i + 1);
        const lit = led !== "off";
        return (
          <g key={i}>
            {lit && <circle cx={x} cy={cy} r={Math.max(2, unitH * 0.13)} fill={defUrl(uid, `glow-${led}`)} />}
            <circle cx={x} cy={cy} r={Math.max(1.1, unitH * 0.052)} fill="#000" opacity={0.5} />
            <circle
              cx={x}
              cy={cy}
              r={Math.max(0.85, unitH * 0.042)}
              fill={LED_COLOURS[led]}
              className={lit && !still ? "rk-led rk-led-on" : undefined}
              style={lit && !still ? { animationDuration: `${2.1 + i * 0.6}s` } : undefined}
            />
          </g>
        );
      })}
    </g>
  );
}
