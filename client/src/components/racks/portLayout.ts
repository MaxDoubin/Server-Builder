/**
 * Where every connector sits on a faceplate.
 *
 * This was inline in DeviceFaceplate until the rack needed to draw patch
 * cables, which have to land exactly on the ports they connect. Two copies
 * of this arithmetic would drift the first time a gap changed, and a cable
 * that lands two pixels off its jack is worse than no cable at all, so the
 * geometry lives here and both the faceplate and the cable layer read it.
 *
 * Everything is in the device's own coordinate space: x from the left edge
 * of its rack ear, y from the top of its first rack unit.
 */

import type { RackDevice, RackPort } from "@/lib/rackTypes";

/**
 * A 19 inch panel is 482.6mm wide and one rack unit is 44.45mm tall, so a
 * 1U face is 10.86 times as wide as it is high. Everything derives its unit
 * height from this rather than picking one: the detail panel was drawing
 * 760 by 88, a ratio of 8.6, which made every device 26 percent too tall
 * and was the reason the faceplates read as chunky no matter how the parts
 * on them were shaded.
 */
export const RU_ASPECT = 482.6 / 44.45;

/** Unit height that makes a face of this width correctly proportioned. */
export const unitHeightFor = (faceWidth: number) => faceWidth / RU_ASPECT;

/** Connector footprint in units of the port cell scale. */
export function portShape(kind: RackPort["kind"]): { w: number; h: number } {
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
      return { w: 0.86, h: 1.0 };
    default:
      return { w: 0.86, h: 1.0 };
  }
}

/** Connector families that stack two-high on a dense panel. */
const STACKS = new Set(["rj45", "console", "sfp", "sfp-plus", "sfp28", "blank", "power"]);

export interface FaceGeometry {
  H: number;
  /** Width reserved for the silkscreen, so text can be sized to fit it. */
  brandW: number;
  ear: number;
  bodyX: number;
  bodyW: number;
  inset: number;
  showText: boolean;
  dispW: number;
  textX: number;
  fieldX: number;
  fieldW: number;
}

/** The faceplate's fixed regions: ears, branding, screen, port field. */
export function faceGeometry(device: RackDevice, width: number, unitH: number, detail: boolean): FaceGeometry {
  const H = device.u * unitH;
  const ear = Math.max(9, width * 0.026);
  const bodyX = ear;
  const bodyW = width - ear * 2;
  const inset = Math.max(1, unitH * 0.05);
  const showText = unitH >= 30;
  const dispW = device.display ? Math.min(H * 0.58, bodyW * 0.068) : 0;
  const dispPad = device.display ? unitH * 0.13 : 0;
  const brandW = showText ? bodyW * (detail ? 0.055 : 0.075) : bodyW * 0.025;
  const textX = bodyX + dispW + dispPad + unitH * 0.15;
  const fieldX = bodyX + dispW + dispPad + brandW;
  const fieldW = bodyW - (fieldX - bodyX) - unitH * 0.1;
  return { H, ear, bodyX, bodyW, inset, showText, dispW, brandW, textX, fieldX, fieldW };
}

export interface PortCell {
  /** Index into device.ports. */
  index: number;
  port: RackPort;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0 for the top row of a stacked block, 1 for the bottom. */
  row: number;
  /** Column within this connector run. */
  col: number;
}

/**
 * Lay the port field out: runs of like connectors, each stacked two-high
 * when dense, grouped in blocks, scaled to fit the available field.
 */
export function layoutPorts(device: RackDevice, width: number, unitH: number, detail: boolean): PortCell[] {
  const ports = device.ports ?? [];
  if (!ports.length) return [];

  const { H, inset, fieldX, fieldW } = faceGeometry(device, width, unitH, detail);

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
  /*
    Vertical allowance. Real switch faces give the jacks most of the unit's
    height: on the USW-Pro-48-POE the two rows plus their silkscreen occupy
    roughly three quarters of the 44.45mm. Ours used 58%, which meant this
    term bound before the width term did and every port came out a fifth
    too small with the right of the panel left empty.
  */
  /*
    The panel numbers both rows, odd above and even below, so the jacks get
    the middle of the unit and the two silkscreen bands get the rest. At the
    previous 0.82 the lower numbers fell off the bottom edge.
  */
  const vSpace = (H - inset * 2) * (detail ? 0.62 : 0.68);
  const scale = Math.min(fieldW / denom, vSpace / maxRows / 0.95);
  // Jacks on a dense panel very nearly touch; the visible separation comes
  // from the group gaps, not from space between neighbours.
  const gapX = scale * 0.03;
  const gapY = scale * 0.03;
  const midY = H / 2 + (detail ? unitH * 0.03 : 0);

  const cells: PortCell[] = [];
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
      cells.push({
        index: entry.i,
        port: entry.p,
        x: x + col * (pw + gapX) + gx,
        y: top + row * (ph + gapY),
        w: pw,
        h: ph,
        row,
        col,
      });
    });

    x += run.cols * (pw + gapX) + (group ? Math.max(0, Math.ceil(run.cols / group) - 1) * scale * 0.45 : 0) + scale * 0.9;
  }

  return cells;
}
