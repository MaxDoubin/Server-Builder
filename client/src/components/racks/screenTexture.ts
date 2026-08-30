/**
 * What is on the little screen.
 *
 * UniFi's Pro switches and the UDM carry a small colour display on the
 * left of the faceplate, and a UPS carries a monochrome one. Rendering
 * them as a dark rectangle was the same mistake as rendering a port as a
 * black rectangle: it is the one lit thing on an otherwise white panel, so
 * it is where the eye goes, and a blank one says the hardware is off.
 *
 * Drawn once per display kind into a canvas, used as an emissive map so it
 * reads as a backlit screen rather than as a picture of one.
 */

import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture | null>();

export function screenTexture(kind: "unifi" | "ups" | "server"): THREE.CanvasTexture | null {
  if (cache.has(kind)) return cache.get(kind) ?? null;
  if (typeof document === "undefined") {
    cache.set(kind, null);
    return null;
  }
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cache.set(kind, null);
    return null;
  }

  ctx.fillStyle = kind === "ups" ? "#0d1712" : "#070b10";
  ctx.fillRect(0, 0, size, size);

  if (kind === "ups") {
    /*
      A UPS panel is a battery gauge and a load bar, in the green LCD every
      line-interactive unit has used for thirty years.
    */
    ctx.strokeStyle = "#5ef2a0";
    ctx.lineWidth = 6;
    ctx.strokeRect(size * 0.16, size * 0.2, size * 0.62, size * 0.26);
    ctx.fillStyle = "#5ef2a0";
    ctx.fillRect(size * 0.78, size * 0.28, size * 0.05, size * 0.1);
    ctx.fillRect(size * 0.19, size * 0.23, size * 0.5, size * 0.2);
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < 5; i += 1) {
      ctx.fillRect(size * 0.16 + i * size * 0.13, size * 0.62, size * 0.09, size * (0.06 + i * 0.04));
    }
    ctx.globalAlpha = 1;
  } else {
    /*
      A switch display shows throughput. A line that rises and falls says
      the box is passing traffic, which is the whole point of the screen.
    */
    ctx.strokeStyle = "#1d3550";
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(size * 0.1, (size * i) / 4);
      ctx.lineTo(size * 0.9, (size * i) / 4);
      ctx.stroke();
    }
    const grad = ctx.createLinearGradient(0, size * 0.2, 0, size * 0.9);
    grad.addColorStop(0, "rgba(90,210,255,0.55)");
    grad.addColorStop(1, "rgba(90,210,255,0)");
    ctx.beginPath();
    ctx.moveTo(size * 0.1, size * 0.9);
    for (let i = 0; i <= 20; i += 1) {
      const x = size * (0.1 + (i / 20) * 0.8);
      const t = i / 20;
      const y = size * (0.72 - (0.28 * (Math.sin(t * 7.1) * 0.4 + Math.sin(t * 2.3) * 0.6) + 0.28) * 0.7);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(size * 0.9, size * 0.9);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#7fe0ff";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.fillStyle = "#8ea8c4";
    ctx.font = `600 ${size * 0.11}px Helvetica, Arial, sans-serif`;
    ctx.fillText("1G", size * 0.1, size * 0.18);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(kind, tex);
  return tex;
}
