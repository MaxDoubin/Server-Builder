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
import { faceGeometry, layoutPorts } from "./portLayout";

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
  /**
   * Hide the mounting ears. A product shot is of the bare unit, and the
   * ears with their screws only exist once it is racked, so drawing them
   * on the isolated device was a plain factual error.
   */
  bare?: boolean;
}

export function DeviceFaceplate({ device, width, unitH, detail = false, still = false, uid, bare = false }: Props) {
  const { H, ear, bodyX, bodyW, inset, showText, dispW, brandW, textX, fieldX, fieldW } = faceGeometry(
    device,
    width,
    unitH,
    detail,
  );
  const accent = device.accent ?? "#8a93a6";
  const finish = device.finish ?? "dark";
  const faceX = bare ? 1 : bodyX;
  const faceW2 = bare ? width - 2 : bodyW;
  const m = MATERIALS[finish];
  const r = Math.max(1.5, unitH * 0.05);

  return (
    <g>
      {/* Shadow the chassis casts down onto the rail below it. */}
      <rect x={bodyX} y={H - inset} width={bodyW} height={Math.max(1.5, unitH * 0.1)} fill={defUrl(uid, "castshadow")} />

      {!bare && <RackEars uid={uid} width={width} ear={ear} H={H} inset={inset} u={device.u} unitH={unitH} />}

      {/* Chassis: shaded metal, then the brushed grain, then the bevels. */}
      <rect x={faceX} y={inset} width={faceW2} height={H - inset * 2} rx={r} fill={defUrl(uid, `face-${finish}`)} />
      <rect
        x={faceX}
        y={inset}
        width={faceW2}
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

      {/*
        Silkscreen branding, sized to the strip actually reserved for it.
        Widening the port field to match the real part left the old fixed
        font size overlapping the first jacks, so the size is derived from
        the label length and the space available, and the text is dropped
        outright when that space cannot hold it legibly. Real faceplates
        set their branding small and out of the way for the same reason.
      */}
      {showText &&
        device.vendor !== "Generic" &&
        (() => {
          const label = device.vendor.toUpperCase();
          /*
            Size against the gap actually left between the screen and the
            first jack, not against brandW: textX already starts past the
            screen, so measuring the full strip overran by the display's
            width and clipped the wordmark. The 0.78 factor covers the
            0.1em letter-spacing the class applies.
          */
          const avail = fieldX - textX - unitH * 0.06;
          const size = Math.min(unitH * 0.105, avail / (label.length * 0.78));
          if (size < 3.6 || avail <= 0) return null;
          return (
            <text x={textX} y={H / 2 + size * 0.36} fill={m.ink} className="rk-brand" fontSize={size} opacity={0.85}>
              {label}
            </text>
          );
        })()}

      {device.display && <Display uid={uid} kind={device.display} x={bodyX + unitH * 0.15} y={H / 2 - dispW / 2} s={dispW} />}

      <FaceContent
        device={device}
        width={width}
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
  /** Full faceplate width, needed by the shared port layout. */
  width: number;
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
  const { device, unitH, detail, still, m, uid, width } = props;
  const isPatch = device.family === "patch";
  const throat = device.portTint ? defUrl(uid, "throat-teal") : defUrl(uid, "throat");
  const cells = layoutPorts(device, width, unitH, detail);
  const copper = cells.filter((c) => c.port.kind === "rj45");

  /*
    The silkscreen. A real switch prints the odd port number above each
    top-row jack, a PoE bolt beside it on ports that deliver power, and a
    rule between groups of eight. It is a large part of why a photograph of
    a switch reads as an instrument rather than as a block of connectors,
    and leaving it off was the single biggest thing still missing.
  */
  const topRow = copper.filter((c) => c.row === 0);
  const numSize = topRow.length ? Math.max(1.9, topRow[0].w * 0.21) : 0;
  const showNumbers = numSize >= 2.0 && !isPatch;
  const poe = /PoE/i.test(device.model) || /PoE/i.test(device.role);
  const groupSize = device.groupsOf ?? 0;

  return (
    <g>
      {/* The recess the connector bank is set into. */}
      {cells.length > 0 &&
        (() => {
          const x0 = Math.min(...cells.map((c) => c.x));
          const x1 = Math.max(...cells.map((c) => c.x + c.w));
          const y0 = Math.min(...cells.map((c) => c.y));
          const y1 = Math.max(...cells.map((c) => c.y + c.h));
          const b = (y1 - y0) * 0.045;
          return (
            <>
              <rect x={x0 - b} y={y0 - b} width={x1 - x0 + b * 2} height={y1 - y0 + b * 2} rx={b} fill="#0b0d10" opacity={0.55} />
              <rect x={x0 - b} y={y0 - b} width={x1 - x0 + b * 2} height={b * 0.5} fill="#000" opacity={0.5} />
            </>
          );
        })()}

      {showNumbers &&
        topRow.map((c) => (
          <text
            key={`n${c.index}`}
            x={c.x + c.w * (poe ? 0.36 : 0.5)}
            y={c.y - c.h * 0.1}
            textAnchor="middle"
            fill={m.sub}
            fontSize={numSize}
            className="rk-portnum"
            opacity={0.95}
          >
            {c.col * 2 + 1}
          </text>
        ))}
      {showNumbers &&
        copper
          .filter((c) => c.row === 1)
          .map((c) => (
            <text
              key={`e${c.index}`}
              x={c.x + c.w * (poe ? 0.36 : 0.5)}
              y={c.y + c.h + numSize * 0.88}
              textAnchor="middle"
              fill={m.sub}
              fontSize={numSize}
              className="rk-portnum"
              opacity={0.95}
            >
              {c.col * 2 + 2}
            </text>
          ))}
      {showNumbers &&
        poe &&
        topRow.map((c) => (
          // The lightning bolt beside a PoE port number, drawn rather than
          // set as a glyph so it stays legible at three SVG units tall.
          <path
            key={`b${c.index}`}
            d={`M ${c.x + c.w * 0.66} ${c.y - c.h * 0.1 - numSize * 0.78}
                l ${-numSize * 0.26} ${numSize * 0.52}
                h ${numSize * 0.2}
                l ${-numSize * 0.16} ${numSize * 0.42}
                l ${numSize * 0.46} ${-numSize * 0.6}
                h ${-numSize * 0.22} Z`}
            fill={m.sub}
            opacity={0.9}
          />
        ))}
      {/* Rules between groups of eight, as printed on the panel. */}
      {showNumbers &&
        groupSize > 0 &&
        topRow
          .filter((c) => c.col % groupSize === 0)
          .map((c, gi, arr) => {
            const last = arr[gi + 1];
            const endX = last ? last.x - c.w * 0.35 : topRow[topRow.length - 1].x + topRow[topRow.length - 1].w;
            return (
              <rect
                key={`r${c.index}`}
                x={c.x}
                y={c.y - c.h * 0.1 - numSize * 1.5}
                width={Math.max(1, endX - c.x)}
                height={Math.max(0.35, numSize * 0.13)}
                fill={m.sub}
                opacity={0.55}
              />
            );
          })}

      {cells.map((c) => (
        <Port
          key={c.index}
          uid={uid}
          port={c.port}
          x={c.x}
          y={c.y}
          w={c.w}
          h={c.h}
          throat={throat}
          isPatch={isPatch}
          still={still}
          index={c.index}
        />
      ))}
    </g>
  );
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
          {/*
            Proportions taken off Ubiquiti's product photo at matched scale.
            The jack is a thin bright shield with a dark rim, an opening that
            fills most of the face, copper across its lower half, and two
            small indicator windows riding the top edge. The earlier version
            had a thick bright frame and large rounded lamps, which made a
            packed bank read as a row of buttons.
          */}
          <rect x={x} y={y} width={w} height={h} rx={rr * 0.35} fill="#20242a" />
          <rect x={x} y={y} width={w} height={h * 0.06} fill="#9aa2aa" opacity={0.85} />
          <rect x={x} y={y + h * 0.94} width={w} height={h * 0.06} fill="#000" opacity={0.5} />
          <rect x={x} y={y} width={Math.max(0.2, w * 0.025)} height={h} fill="#000" opacity={0.45} />
          <rect x={x + w - Math.max(0.2, w * 0.025)} y={y} width={Math.max(0.2, w * 0.025)} height={h} fill="#000" opacity={0.45} />

          {/* The opening, with the clip channel notched from its top edge. */}
          <rect x={x + w * 0.09} y={y + h * 0.24} width={w * 0.82} height={h * 0.68} rx={rr * 0.3} fill={throat} />
          <rect x={x + w * 0.38} y={y + h * 0.17} width={w * 0.24} height={h * 0.13} fill={throat} />

          {/* Copper across the lower half: the eight contacts plus the
              plated shoulder behind them read as one mass at this size. */}
          {!isPatch && (
            <>
              <rect x={x + w * 0.15} y={y + h * 0.42} width={w * 0.7} height={h * 0.4} fill={defUrl(uid, "pins")} opacity={0.94} />
              {Array.from({ length: 7 }, (_, k) => (
                <rect
                  key={k}
                  x={x + w * (0.235 + k * 0.0875)}
                  y={y + h * 0.42}
                  width={Math.max(0.22, w * 0.022)}
                  height={h * 0.4}
                  fill="#4a3a12"
                  opacity={0.5}
                />
              ))}
              <rect x={x + w * 0.15} y={y + h * 0.42} width={w * 0.7} height={h * 0.06} fill="#fff3c4" opacity={0.45} />
              <rect x={x + w * 0.11} y={y + h * 0.86} width={w * 0.78} height={h * 0.06} fill="#000" opacity={0.55} />
            </>
          )}

          {/* Indicator windows sitting on the jack's top edge. */}
          {!isPatch && port.led && (
            <>
              {lit && <circle cx={x + w * 0.5} cy={y + h * 0.14} r={w * 0.5} fill={defUrl(uid, `glow-${port.led}`)} />}
              <rect
                x={x + w * 0.1}
                y={y + h * 0.1}
                width={w * 0.24}
                height={h * 0.13}
                rx={rr * 0.3}
                fill={lit ? LED_COLOURS.amber : LED_COLOURS.off}
                className={lit && !still ? "rk-led rk-led-on" : undefined}
                style={lit && !still ? { animationDelay: `${(index % 7) * 0.31}s`, animationDuration: `${1.3 + (index % 5) * 0.22}s` } : undefined}
              />
              <rect
                x={x + w * 0.66}
                y={y + h * 0.1}
                width={w * 0.24}
                height={h * 0.13}
                rx={rr * 0.3}
                fill={lit ? colour : LED_COLOURS.off}
                opacity={lit ? 0.95 : 1}
              />
            </>
          )}
          {isPatch && <rect x={x + w * 0.11} y={y + h * 0.12} width={w * 0.78} height={h * 0.12} rx={rr * 0.3} fill="#000" opacity={0.45} />}
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
      {lit && typeof port.activity === "number" && !copper && (
        <rect x={x} y={y + h + 0.8} width={Math.max(0.8, w * port.activity)} height={Math.max(0.5, h * 0.05)} rx={0.3} fill={colour} opacity={0.4} />
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
