/**
 * The silkscreen: everything printed on a faceplate.
 *
 * Up to here the 3D faces were correct and blank, and a blank face is the
 * loudest remaining tell. Every real panel is covered in small print: the
 * vendor's name, the model, a number under every single port, a mark at
 * each group boundary, PoE bolts on the ports that carry power, and a block
 * of regulatory marks at the far right. Take all of that off a switch and
 * what is left does not look like a switch with the labels removed, it
 * looks like a placeholder.
 *
 * Modelling it as geometry is not an option, since a 48 port switch has
 * over a hundred separate marks on it. So it is drawn once per device into
 * a canvas and mapped onto the face, with the port block punched out as
 * transparent so the modelled jacks show through the hole rather than being
 * painted over.
 *
 * Everything is positioned from the same chassisLayout the jacks use, so a
 * port number sits under its own port by construction and cannot drift.
 */

import * as THREE from "three";
import type { RackDevice } from "@/lib/rackTypes";
import { MATERIALS } from "./RackDefs";
import { CHASSIS_WIDTH, chassisLayout } from "./chassisLayout";
import { bodyColour } from "./surfaces";
import { U } from "@/components/cinematic/rack3d/rackConfig";

/** The chassis width at this resolution, enough that 2mm print is legible. */
const TEX_W = 2048;
const PX_PER_M = TEX_W / CHASSIS_WIDTH;

const cache = new Map<string, THREE.CanvasTexture | null>();

/** Ink colour: dark print on a pale chassis, pale print on a dark one. */
function inkFor(finish: string): string {
  const spec = MATERIALS[finish] ?? MATERIALS.dark;
  return spec.pale ? "rgba(58,64,72,0.92)" : "rgba(198,204,212,0.86)";
}

export function faceplateTexture(device: RackDevice): THREE.CanvasTexture | null {
  const key = `${device.id}:${device.finish ?? "dark"}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  if (typeof document === "undefined") {
    cache.set(key, null);
    return null;
  }

  const h = device.u * U;
  const TEX_H = Math.round(h * PX_PER_M);
  const canvas = document.createElement("canvas");
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cache.set(key, null);
    return null;
  }

  const finish = device.finish ?? "dark";
  const spec = MATERIALS[finish] ?? MATERIALS.dark;
  const ink = inkFor(finish);
  const pale = spec.pale;

  /** Metres to texture pixels. x from the chassis centre, y from its top. */
  const px = (x: number) => (x + CHASSIS_WIDTH / 2) * PX_PER_M;
  const py = (y: number) => (h / 2 - y) * PX_PER_M;
  const mm = (n: number) => (n / 1000) * PX_PER_M;

  ctx.fillStyle = bodyColour(finish);
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  /*
    Brushed grain. Extruded aluminium is drawn along its length, so the
    grain runs the width of a rack panel, and it is the reason a real face
    has a direction to its highlight instead of being flat colour.
  */
  ctx.save();
  ctx.globalAlpha = pale ? 0.05 : 0.07;
  for (let y = 0; y < TEX_H; y += 2) {
    const v = (Math.sin(y * 12.9898) * 43758.5453) % 1;
    ctx.fillStyle = v > 0 ? spec.hi : spec.lo;
    ctx.fillRect(0, y, TEX_W, 1);
  }
  ctx.restore();

  /*
    Baked occlusion.
    
    Nothing in the scene casts a shadow on anything else, and that is the
    last thing that reads as computer generated once the shapes and the
    print are right: a stack of boxes in a rack, each perfectly evenly lit
    from edge to edge, with no sign that there is another box a millimetre
    above it. Real ambient occlusion would mean a depth pass per frame for
    an object that never moves. This is the same information, drawn once.

    The gradient is asymmetric on purpose. The rack is lit from above, so
    the device overhead throws a real shadow onto the top of this face and
    the one below it catches only bounce.
  */
  const shade = (grad: CanvasGradient, rect: [number, number, number, number]) => {
    ctx.fillStyle = grad;
    ctx.fillRect(...rect);
  };
  const topShade = ctx.createLinearGradient(0, 0, 0, TEX_H * 0.34);
  topShade.addColorStop(0, pale ? "rgba(22,28,38,0.34)" : "rgba(0,0,0,0.34)");
  topShade.addColorStop(0.35, pale ? "rgba(22,28,38,0.1)" : "rgba(0,0,0,0.18)");
  topShade.addColorStop(1, "rgba(0,0,0,0)");
  shade(topShade, [0, 0, TEX_W, TEX_H * 0.34]);

  const bottomShade = ctx.createLinearGradient(0, TEX_H, 0, TEX_H * 0.78);
  bottomShade.addColorStop(0, pale ? "rgba(22,28,38,0.2)" : "rgba(0,0,0,0.2)");
  bottomShade.addColorStop(1, "rgba(0,0,0,0)");
  shade(bottomShade, [0, TEX_H * 0.78, TEX_W, TEX_H * 0.22]);

  // The rails shade the ends of every face the same way.
  for (const [x0, x1] of [
    [0, TEX_W * 0.05],
    [TEX_W, TEX_W * 0.95],
  ] as const) {
    const g = ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, pale ? "rgba(22,28,38,0.22)" : "rgba(0,0,0,0.22)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), TEX_H);
  }

  // A shallow seam along the top and bottom edges, where the lid folds over.
  ctx.fillStyle = pale ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.45)";
  ctx.fillRect(0, 0, TEX_W, Math.max(1, mm(0.5)));
  ctx.fillRect(0, TEX_H - Math.max(1, mm(0.5)), TEX_W, Math.max(1, mm(0.5)));

  /*
    Vent slots, drawn rather than modelled.
    
    They were geometry sitting a couple of millimetres behind the face,
    which the silkscreen plane then covered completely, because a blanking
    panel has no port block for the plane to punch a hole in. Drawn here
    they are visible, they cost nothing, and each one can carry the bright
    lip along its top edge that a punched slot actually has.
  */
  /*
    A blanked run is separate panels, and in 3D it was not reading as any.

    The elevation drawing has always shown the joints: a blanking panel is
    a pressed steel plate one or two units tall, and a twelve unit blanked
    section is a stack of them, each screwed to the rails on its own. The
    texture skipped all of that and drew one flat sheet with a seam at the
    very top and bottom, so in the model an eleven unit blank came out as a
    single featureless slab taller than a person, which is the one thing in
    the whole rack that looked like furniture rather than hardware.

    So the joints get drawn here too: a shadowed gap on every unit boundary,
    the stiffening rib each panel is pressed with, and the two cage nut
    screws that hold it. None of it is decoration. A sheet this thin without
    a rib would flex the moment somebody leaned on the rack, and the screws
    are the reason you can tell, at a glance, how many panels you are
    looking at.
  */
  if (device.family === "blank" && (device.look ?? "solid") !== "fingers") {
    const unitH = TEX_H / device.u;
    const screwR = Math.max(1.5, mm(2.4));
    for (let i = 0; i < device.u; i += 1) {
      const top = i * unitH;
      const mid = top + unitH / 2;

      /* The pressed rib across the middle of each panel. */
      const ribH = Math.max(2, unitH * 0.28);
      ctx.fillStyle = pale ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.3)";
      ctx.fillRect(TEX_W * 0.05, mid - ribH / 2, TEX_W * 0.9, ribH);
      ctx.fillStyle = pale ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.09)";
      ctx.fillRect(TEX_W * 0.05, mid - ribH / 2, TEX_W * 0.9, Math.max(1, ribH * 0.14));

      /* The joint to the panel above: a dark gap with a lit lower lip. */
      if (i > 0) {
        const g = Math.max(1.5, mm(1.1));
        ctx.fillStyle = "rgba(0,0,0,0.62)";
        ctx.fillRect(0, top - g / 2, TEX_W, g);
        ctx.fillStyle = pale ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.1)";
        ctx.fillRect(0, top + g / 2, TEX_W, Math.max(1, g * 0.45));
      }

      /* Two cage nut screws per panel, nine millimetres in from each end. */
      for (const cx of [mm(9), TEX_W - mm(9)]) {
        ctx.beginPath();
        ctx.arc(cx, mid, screwR, 0, Math.PI * 2);
        ctx.fillStyle = pale ? "rgba(30,36,44,0.5)" : "rgba(0,0,0,0.55)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, mid - screwR * 0.25, screwR * 0.72, 0, Math.PI * 2);
        ctx.fillStyle = pale ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.13)";
        ctx.fill();
      }
    }
  }

  if (device.family === "blank" && (device.look ?? "solid") === "vented") {
    /*
      A drilled grid, not a row of slots. Vented panels and equipment lids
      are perforated with a staggered field of small round holes, because
      that passes air without losing the panel's stiffness, and a row of
      long slots is a different part that looks like a cartoon of this one.
    */
    const cols = 58;
    const rows = 5;
    const r = mm(1.15);
    const fieldW = TEX_W * 0.9;
    const fieldH = TEX_H * 0.56;
    const x0 = TEX_W * 0.05;
    const y0 = (TEX_H - fieldH) / 2;
    for (let iz = 0; iz < rows; iz += 1) {
      const stagger = iz % 2 ? fieldW / cols / 2 : 0;
      for (let ix = 0; ix < cols; ix += 1) {
        const cx = x0 + ((ix + 0.5) * fieldW) / cols + stagger;
        const cy = y0 + ((iz + 0.5) * fieldH) / rows;
        if (cx > x0 + fieldW) continue;
        // Lit rim on the near side of the hole, then the hole itself.
        ctx.beginPath();
        ctx.arc(cx, cy - r * 0.22, r * 1.1, 0, Math.PI * 2);
        ctx.fillStyle = pale ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.12)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = pale ? "rgba(14,18,24,0.9)" : "rgba(0,0,0,0.92)";
        ctx.fill();
      }
    }
  }

  const layout = chassisLayout(device);

  /*
    Vendor and model, in the space to the left of the port block. Real
    panels put the wordmark hard left and the model number under it in a
    smaller weight, and both are printed rather than moulded.
  */
  const blockLeft = layout ? px(layout.field.x - layout.field.w / 2) : TEX_W * 0.5;
  const textLeft = mm(10);
  const textRoom = blockLeft - textLeft - mm(4);
  if (textRoom > mm(12)) {
    /*
      Print is sized in millimetres, not as a fraction of the panel. A
      wordmark on a rack device is about 4mm tall whether it is on a 1U
      switch or a 4U chassis, and scaling it to the box put UBIQUITI across
      a switch front in letters an inch high.
    */
    const brandSize = mm(3.8);
    ctx.fillStyle = ink;
    ctx.textBaseline = "middle";
    ctx.font = `700 ${brandSize}px Helvetica, Arial, sans-serif`;
    const brand = device.vendor.toUpperCase();
    if (ctx.measureText(brand).width <= textRoom) {
      const midY = TEX_H * 0.5;
      ctx.fillText(brand, textLeft, midY - brandSize * 0.72);
      const modelSize = mm(2.3);
      ctx.font = `500 ${modelSize}px Helvetica, Arial, sans-serif`;
      ctx.globalAlpha = 0.68;
      let model = device.model;
      while (model.length > 4 && ctx.measureText(model).width > textRoom) {
        model = model.slice(0, -1);
      }
      if (model !== device.model) model = `${model.slice(0, -1)}\u2026`;
      ctx.fillText(model, textLeft, midY + brandSize * 0.68);
      ctx.globalAlpha = 1;
    }
  }

  if (layout) {
    const numSize = Math.max(7, mm(2.4));
    ctx.font = `600 ${numSize}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = ink;

    const group = device.groupsOf ?? 0;
    for (const slot of layout.copper) {
      const cx = px(slot.x);
      const top = py(slot.y + slot.h / 2);
      const bottom = py(slot.y - slot.h / 2);
      // Numbers go above the top row and below the bottom one, which is how
      // a two row panel keeps both legible without printing inside a jack.
      const ty = slot.row === 0 ? top - mm(1.1) : bottom + mm(1.1) + numSize * 0.5;
      ctx.textBaseline = slot.row === 0 ? "bottom" : "middle";
      ctx.globalAlpha = slot.port.kind === "blank" ? 0.45 : 0.85;
      ctx.fillText(slot.port.label, cx, ty);
      ctx.globalAlpha = 1;

      /*
        A PoE bolt on the ports that carry power. It is a real marking and
        it is the thing a technician looks for before plugging in a camera.
      */
      if (slot.port.led === "amber" && slot.row === 0) {
        ctx.save();
        ctx.translate(cx + slot.w * PX_PER_M * 0.42, top - mm(1.4));
        const s = numSize * 0.42;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(-s * 0.45, s * 0.1);
        ctx.lineTo(-s * 0.05, s * 0.1);
        ctx.lineTo(-s * 0.2, s);
        ctx.lineTo(s * 0.5, -s * 0.15);
        ctx.lineTo(s * 0.05, -s * 0.15);
        ctx.closePath();
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.7;
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }

    // A tick at each group boundary, aligned with the wider gap.
    if (group) {
      ctx.strokeStyle = ink;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = Math.max(1, mm(0.35));
      const byCol = new Map<number, (typeof layout.copper)[number]>();
      layout.copper.forEach((s) => {
        const col = Math.round((s.x - layout.copper[0].x) / Math.max(1e-6, s.w));
        if (!byCol.has(col)) byCol.set(col, s);
      });
      layout.copper.forEach((slot, i) => {
        if (i === 0 || i % (group * 2) !== 0) return;
        const x = px(slot.x - slot.w * 0.62);
        ctx.beginPath();
        ctx.moveTo(x, py(layout.field.y + layout.field.h / 2));
        ctx.lineTo(x, py(layout.field.y - layout.field.h / 2));
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    for (const slot of layout.cages) {
      ctx.font = `600 ${Math.max(6, mm(2))}px Helvetica, Arial, sans-serif`;
      ctx.textBaseline = slot.row === 0 ? "bottom" : "top";
      ctx.globalAlpha = 0.8;
      ctx.fillText(
        slot.port.label,
        px(slot.x),
        slot.row === 0 ? py(slot.y + slot.h / 2) - mm(1) : py(slot.y - slot.h / 2) + mm(1),
      );
      ctx.globalAlpha = 1;
    }
  }

  /*
    Regulatory block at the far right: the marks every piece of listed
    equipment carries. Drawn as marks rather than as any real agency's
    logo, because a render should not counterfeit a certification.
  */
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.4;
  ctx.font = `500 ${Math.max(6, mm(1.9))}px Helvetica, Arial, sans-serif`;
  ctx.fillText("· · ·", TEX_W - mm(6), TEX_H * 0.5);
  ctx.globalAlpha = 1;

  /*
    Punch the port block out. The jacks are modelled geometry sitting in a
    milled recess behind this plane, so painting over them would bury a few
    hundred parts under a picture of a panel.
  */
  if (layout) {
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "#000";
    const pad = mm(0.4);
    ctx.fillRect(
      px(layout.field.x - layout.field.w / 2) - pad,
      py(layout.field.y + layout.field.h / 2) - pad,
      layout.field.w * PX_PER_M + pad * 2,
      layout.field.h * PX_PER_M + pad * 2,
    );
    ctx.globalCompositeOperation = "source-over";
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}
