/**
 * The simulation and the Canvas2D drawing behind SpineLeafFlows.
 *
 * Plain functions over preallocated state, with no React in sight: the
 * component owns the lifecycle (size, visibility, the frame loop) and calls
 * step() and draw(). Nothing in the per-frame path allocates. Flows live in
 * a fixed pool and are reused, path geometry goes through scratch arrays,
 * and colors are strings built once, with transparency set through
 * globalAlpha instead of a new rgba() string per stroke.
 *
 * What is modeled, so the picture stays honest:
 *
 *   - Every leaf has one link to every spine (the two-tier Clos of RFC 7938,
 *     section 3.2), so leaf to leaf is always leaf, spine, leaf.
 *   - A flow's spine is picked by pickNextHop() over the spines that still
 *     have a link to BOTH its source and destination leaf. A dead leaf-spine
 *     link takes that spine out of the source leaf's next-hop set, and, once
 *     the spine withdraws the route, out of every other leaf's set for
 *     destinations behind that leaf. Flows between other leaf pairs keep
 *     using the spine: it is the link that failed, not the switch.
 *   - Nothing moves a flow except a change to its next-hop set.
 */

import { flowKey, pickNextHop, type FiveTuple } from "./ecmp";

export type FabricPhase = "steady" | "down" | "restored";

export interface FabricStatus {
  phase: FabricPhase;
  /** Flows whose spine changed at the most recent topology change. */
  moved: number;
  /** Of those, the ones that were not riding the failed link. */
  collateral: number;
  /** The link that fails: always the large flow's uplink. */
  failLeaf: number;
  failSpine: number;
  /** The large flow, for the readout under the figure. */
  elephant: FiveTuple & { key: number; spine: number };
}

export interface FabricOptions {
  spines: number;
  leaves: number;
  /** How many small flows to keep alive. Scaled down on weak devices. */
  mice: number;
  onStatus: (status: FabricStatus) => void;
}

export interface Fabric {
  resize(width: number, height: number, dpr: number, font: string): void;
  /** Advance the simulation by dt seconds. */
  step(dt: number): void;
  /** Paint the current moment, with packets in motion. */
  draw(): void;
  /** Paint a still: every flow as a line along its path, nothing moving. */
  drawStatic(): void;
  destroy(): void;
}

interface Flow {
  src: number;
  dst: number;
  key: number;
  spine: number;
  /** Where it was before the last rehash, drawn fading out for a moment. */
  prevSpine: number;
  switchedAt: number;
  born: number;
  dies: number;
  /** Offset along the path so flows do not march in step. */
  phase: number;
  /** Sideways offset in px so flows sharing a link do not stack exactly. */
  lane: number;
  /** Packet speed as a fraction of the canvas height per second. */
  speed: number;
  elephant: boolean;
}

/* One loop of the story, in seconds. */
const STEADY_UNTIL = 9;
const DOWN_UNTIL = 17;
const LOOP = 23;

/** The large flow counts as this many small ones in the load bars. */
const ELEPHANT_WEIGHT = 8;
const ELEPHANT_COMETS = 9;
const MOUSE_COMETS = 2;
const TRAIL_STEPS = 4;
const FADE = 0.6;
const SWITCH_BLEND = 0.7;

/*
  One color per spine, so the eye can see the hash spreading flows without
  reading a label. The first three are the site's signal lime, cyan and
  amber; the rest only appear when a caller asks for more than three spines.
*/
const SPINE_COLORS = [
  "rgb(199,240,0)",
  "rgb(100,230,255)",
  "rgb(255,170,30)",
  "rgb(184,150,255)",
  "rgb(255,128,178)",
  "rgb(120,255,196)",
];
const SPINE_GLOWS = [
  "199,240,0",
  "100,230,255",
  "255,170,30",
  "184,150,255",
  "255,128,178",
  "120,255,196",
];
const DANGER = "rgb(255,92,98)";
const CHASSIS = "#0c0e12";
const DST_PORTS = [443, 80, 5432, 6379, 9092, 2049];

/** Small seeded generator, so the still frame is the same on every visit. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(v: number): number {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
}

function makeGlow(rgb: string): HTMLCanvasElement {
  const size = 96;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const g = sprite.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `rgba(${rgb},0.5)`);
    grad.addColorStop(0.4, `rgba(${rgb},0.16)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return sprite;
}

export function createFabric(ctx: CanvasRenderingContext2D, options: FabricOptions): Fabric {
  const S = options.spines;
  const L = options.leaves;
  const rand = mulberry32(0x5eed1eaf);

  /** up[leaf][spine]: is that link carrying traffic. */
  const up: boolean[][] = Array.from({ length: L }, () => new Array<boolean>(S).fill(true));
  const hopScratch = new Array<boolean>(S).fill(true);
  const load = new Array<number>(S).fill(0);
  const loadTarget = new Array<number>(S).fill(0);
  const glows = SPINE_GLOWS.slice(0, S).map(makeGlow);

  // Layout, filled in by resize().
  let width = 0;
  let height = 0;
  let dpr = 1;
  let font = "11px monospace";
  let spineY = 0;
  let leafY = 0;
  let spineW = 0;
  let spineH = 0;
  let leafW = 0;
  let leafH = 0;
  const spineX = new Array<number>(S).fill(0);
  const leafX = new Array<number>(L).fill(0);

  // Scratch for the four-point path of one flow: leaf port, spine port in,
  // spine port out, leaf port.
  const px = [0, 0, 0, 0];
  const py = [0, 0, 0, 0];
  const segLen = [0, 0, 0];
  let pathLen = 0;
  let outX = 0;
  let outY = 0;

  let simT = 0;
  let phase: FabricPhase = "steady";
  let phaseAt = 0;
  let downAmt = 0;
  let moved = 0;
  let collateral = 0;

  function nextHopSet(src: number, dst: number): boolean[] {
    for (let s = 0; s < S; s++) hopScratch[s] = up[src][s] && up[dst][s];
    return hopScratch;
  }

  /* The large flow: one fixed five-tuple, alive for the whole loop. */
  const elephantDst = Math.min(L - 1, Math.max(1, L - 2));
  const elephantTuple: FiveTuple = {
    srcIp: (10 << 24) | (1 << 8) | 11,
    dstIp: (10 << 24) | ((elephantDst + 1) << 8) | 20,
    proto: 6,
    srcPort: 40212,
    dstPort: 443,
  };
  const elephantKey = flowKey(elephantTuple);

  const flows: Flow[] = [];
  const tuple: FiveTuple = { srcIp: 0, dstIp: 0, proto: 6, srcPort: 0, dstPort: 0 };

  /** Give a pooled flow a new five-tuple, which is what makes it a new flow. */
  function spawn(f: Flow, now: number, warm: boolean): void {
    f.src = Math.floor(rand() * L);
    f.dst = (f.src + 1 + Math.floor(rand() * (L - 1))) % L;
    tuple.srcIp = ((10 << 24) | ((f.src + 1) << 8) | (10 + Math.floor(rand() * 200))) >>> 0;
    tuple.dstIp = ((10 << 24) | ((f.dst + 1) << 8) | (10 + Math.floor(rand() * 200))) >>> 0;
    // A new connection gets a new ephemeral source port, hence a new hash.
    tuple.srcPort = 32768 + Math.floor(rand() * 28232);
    tuple.dstPort = DST_PORTS[Math.floor(rand() * DST_PORTS.length)];
    f.key = flowKey(tuple);
    f.spine = pickNextHop(f.key, nextHopSet(f.src, f.dst));
    f.prevSpine = f.spine;
    f.switchedAt = -100;
    const life = 5 + rand() * 7;
    // On the first fill, start flows part way through their lives so they
    // do not all expire together.
    f.born = warm ? now - rand() * life : now;
    f.dies = f.born + life;
    f.phase = rand();
    f.lane = (rand() - 0.5) * 5;
    f.speed = 0.5 + rand() * 0.25;
  }

  flows.push({
    src: 0,
    dst: elephantDst,
    key: elephantKey,
    spine: pickNextHop(elephantKey, nextHopSet(0, elephantDst)),
    prevSpine: 0,
    switchedAt: -100,
    born: -100,
    dies: Infinity,
    phase: 0,
    lane: 0,
    speed: 0.6,
    elephant: true,
  });
  flows[0].prevSpine = flows[0].spine;
  for (let i = 0; i < options.mice; i++) {
    const f: Flow = { ...flows[0], elephant: false };
    spawn(f, 0, true);
    flows.push(f);
  }

  const failLeaf = 0;
  const failSpine = flows[0].spine;

  function emit(): void {
    options.onStatus({
      phase,
      moved,
      collateral,
      failLeaf,
      failSpine,
      elephant: { ...elephantTuple, key: elephantKey, spine: flows[0].spine },
    });
  }

  /** Re-run the pick for every flow after a next-hop set changed. */
  function rehash(): void {
    moved = 0;
    collateral = 0;
    for (const f of flows) {
      const next = pickNextHop(f.key, nextHopSet(f.src, f.dst));
      if (next === f.spine) continue;
      const wasOnFailedLink =
        f.spine === failSpine && (f.src === failLeaf || f.dst === failLeaf);
      f.prevSpine = f.spine;
      f.spine = next;
      f.switchedAt = simT;
      moved++;
      if (!wasOnFailedLink) collateral++;
    }
  }

  function enter(next: FabricPhase): void {
    phase = next;
    phaseAt = simT;
    if (next === "down") {
      up[failLeaf][failSpine] = false;
      rehash();
    } else if (next === "restored") {
      up[failLeaf][failSpine] = true;
      rehash();
    } else {
      moved = 0;
      collateral = 0;
    }
    emit();
  }

  function step(dt: number): void {
    simT += dt;
    const t = simT % LOOP;
    const want: FabricPhase = t < STEADY_UNTIL ? "steady" : t < DOWN_UNTIL ? "down" : "restored";
    if (want !== phase) enter(want);

    for (let i = 1; i < flows.length; i++) {
      if (simT >= flows[i].dies) spawn(flows[i], simT, false);
    }

    const ease = Math.min(1, dt * 4);
    downAmt += ((phase === "down" ? 1 : 0) - downAmt) * ease;

    measureLoad();
    for (let s = 0; s < S; s++) load[s] += (loadTarget[s] - load[s]) * Math.min(1, dt * 3);
  }

  /**
   * Each spine's share of traffic volume, into loadTarget. Volume, not flow
   * count, because that is where the large flow shows.
   */
  function measureLoad(): void {
    let total = 0;
    for (let s = 0; s < S; s++) loadTarget[s] = 0;
    for (const f of flows) {
      if (f.spine < 0) continue;
      const w = f.elephant ? ELEPHANT_WEIGHT : 1;
      loadTarget[f.spine] += w;
      total += w;
    }
    if (total > 0) for (let s = 0; s < S; s++) loadTarget[s] /= total;
  }

  function resize(w: number, h: number, ratio: number, fontSpec: string): void {
    width = w;
    height = h;
    dpr = ratio;
    font = fontSpec;
    const narrow = w < 520;
    spineY = h * (narrow ? 0.2 : 0.22);
    leafY = h * (narrow ? 0.86 : 0.84);
    spineW = Math.min(104, (w * 0.72) / S - 8);
    spineH = narrow ? 20 : 24;
    leafW = Math.min(84, (w * 0.92) / L - 8);
    leafH = narrow ? 20 : 22;
    for (let s = 0; s < S; s++) spineX[s] = w * (0.5 + 0.72 * ((s + 0.5) / S - 0.5));
    for (let l = 0; l < L; l++) leafX[l] = w * (0.5 + 0.94 * ((l + 0.5) / L - 0.5));
  }

  /* Each link lands on its own port, so the fan of links reads as cabling. */
  function leafPortX(leaf: number, spine: number): number {
    return leafX[leaf] + ((spine + 0.5) / S - 0.5) * leafW * 0.62;
  }
  function spinePortX(spine: number, leaf: number): number {
    return spineX[spine] + ((leaf + 0.5) / L - 0.5) * spineW * 0.74;
  }

  function setPath(src: number, dst: number, spine: number, lane: number): void {
    const top = spineY + spineH / 2;
    const bottom = leafY - leafH / 2;
    px[0] = leafPortX(src, spine) + lane;
    py[0] = bottom;
    px[1] = spinePortX(spine, src) + lane;
    py[1] = top;
    px[2] = spinePortX(spine, dst) + lane;
    py[2] = top;
    px[3] = leafPortX(dst, spine) + lane;
    py[3] = bottom;
    pathLen = 0;
    for (let i = 0; i < 3; i++) {
      segLen[i] = Math.hypot(px[i + 1] - px[i], py[i + 1] - py[i]);
      pathLen += segLen[i];
    }
  }

  /** Point at distance d along the current path, written to outX and outY. */
  function pointAt(d: number): void {
    let rest = d;
    for (let i = 0; i < 3; i++) {
      if (rest <= segLen[i] || i === 2) {
        const k = segLen[i] > 0 ? clamp01(rest / segLen[i]) : 0;
        outX = px[i] + (px[i + 1] - px[i]) * k;
        outY = py[i] + (py[i + 1] - py[i]) * k;
        return;
      }
      rest -= segLen[i];
    }
  }

  function strokePath(): void {
    ctx.beginPath();
    ctx.moveTo(px[0], py[0]);
    ctx.lineTo(px[1], py[1]);
    ctx.moveTo(px[2], py[2]);
    ctx.lineTo(px[3], py[3]);
    ctx.stroke();
  }

  /** The packets of one flow on one spine, as comets with fading tails. */
  function drawComets(f: Flow, spine: number, alpha: number): void {
    if (spine < 0 || alpha <= 0.01) return;
    setPath(f.src, f.dst, spine, f.lane);
    const color = SPINE_COLORS[spine];
    ctx.strokeStyle = color;

    if (f.elephant) {
      // A steady band under the packets: this is the one link carrying it.
      ctx.globalAlpha = alpha * 0.1;
      ctx.lineWidth = 9;
      strokePath();
      ctx.globalAlpha = alpha * 0.28;
      ctx.lineWidth = 2.5;
      strokePath();
    }

    // A flow that just moved is drawn a little heavier while the eye finds it.
    const fresh = 1 - clamp01((simT - f.switchedAt) / 2.5);
    const count = f.elephant ? ELEPHANT_COMETS : MOUSE_COMETS;
    const thick = (f.elephant ? 3.2 : 1.6) * (1 + 0.7 * fresh);
    const tail = (f.elephant ? 0.045 : 0.075) * height;
    const travel = (simT * f.speed * height) / pathLen + f.phase;

    for (let k = 0; k < count; k++) {
      const pos = travel + k / count;
      const u = pos - Math.floor(pos);
      // Ease in out of the leaf and into the far one instead of popping.
      const edge = Math.min(1, u * 12, (1 - u) * 12);
      const head = u * pathLen;
      for (let j = 0; j < TRAIL_STEPS; j++) {
        const d0 = head - (j * tail) / TRAIL_STEPS;
        const d1 = head - ((j + 1) * tail) / TRAIL_STEPS;
        if (d0 <= 0) break;
        const fade = 1 - j / TRAIL_STEPS;
        ctx.globalAlpha = alpha * edge * fade * fade;
        ctx.lineWidth = thick * (0.55 + 0.45 * fade);
        ctx.beginPath();
        pointAt(d0);
        ctx.moveTo(outX, outY);
        pointAt(Math.max(0, d1));
        ctx.lineTo(outX, outY);
        ctx.stroke();
      }
      pointAt(head);
      ctx.globalAlpha = alpha * edge * 0.9;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(outX, outY, thick * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The still version of a flow: its whole path as one line. */
  function drawStillFlow(f: Flow): void {
    if (f.spine < 0) return;
    setPath(f.src, f.dst, f.spine, f.lane);
    ctx.strokeStyle = SPINE_COLORS[f.spine];
    ctx.globalAlpha = f.elephant ? 0.95 : 0.3;
    ctx.lineWidth = f.elephant ? 4 : 1.2;
    strokePath();
  }

  function pill(x: number, y: number, w: number, h: number): void {
    const r = Math.min(5, h / 2);
    const left = x - w / 2;
    const top = y - h / 2;
    ctx.beginPath();
    ctx.moveTo(left + r, top);
    ctx.arcTo(left + w, top, left + w, top + h, r);
    ctx.arcTo(left + w, top + h, left, top + h, r);
    ctx.arcTo(left, top + h, left, top, r);
    ctx.arcTo(left, top, left + w, top, r);
    ctx.closePath();
  }

  function drawLinks(): void {
    const top = spineY + spineH / 2;
    const bottom = leafY - leafH / 2;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let l = 0; l < L; l++) {
      for (let s = 0; s < S; s++) {
        if (l === failLeaf && s === failSpine && downAmt > 0.02) continue;
        ctx.moveTo(leafPortX(l, s), bottom);
        ctx.lineTo(spinePortX(s, l), top);
      }
    }
    ctx.stroke();

    if (downAmt <= 0.02) return;
    // The failed link: dashed and red, eased in. One slow ring marks the
    // moment. Nothing here blinks.
    const ax = leafPortX(failLeaf, failSpine);
    const bx = spinePortX(failSpine, failLeaf);
    ctx.strokeStyle = DANGER;
    ctx.globalAlpha = 0.25 + 0.6 * downAmt;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(ax, bottom);
    ctx.lineTo(bx, top);
    ctx.stroke();
    ctx.setLineDash([]);

    const mx = ax + (bx - ax) * 0.5;
    const my = bottom + (top - bottom) * 0.5;
    ctx.globalAlpha = downAmt;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - 5, my - 5);
    ctx.lineTo(mx + 5, my + 5);
    ctx.moveTo(mx + 5, my - 5);
    ctx.lineTo(mx - 5, my + 5);
    ctx.stroke();

    const age = simT - phaseAt;
    if (phase === "down" && age < 1.4) {
      ctx.globalAlpha = (1 - age / 1.4) * 0.55;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 8 + smooth(age / 1.4) * 26, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = downAmt;
    ctx.fillStyle = DANGER;
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("link down", mx + 12, my);
  }

  function drawNodes(): void {
    ctx.font = font;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let s = 0; s < S; s++) {
      const color = SPINE_COLORS[s];

      // Load bar: this spine's share of traffic volume. Full is twice an
      // even share, so the spine under the large flow visibly runs hotter.
      const barY = spineY - spineH / 2 - 9;
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,0.09)";
      ctx.fillRect(spineX[s] - spineW / 2, barY, spineW, 3);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(spineX[s] - spineW / 2, barY, spineW * clamp01((load[s] * S) / 2), 3);

      ctx.globalAlpha = 1;
      ctx.fillStyle = CHASSIS;
      pill(spineX[s], spineY, spineW, spineH);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = color;
      ctx.fillText(`S${s + 1}`, spineX[s], spineY + 0.5);

      // Port lights along the bottom edge: steady, one per link.
      for (let l = 0; l < L; l++) {
        const dead = l === failLeaf && s === failSpine;
        ctx.fillStyle = dead && downAmt > 0.5 ? DANGER : color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(spinePortX(s, l), spineY + spineH / 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let l = 0; l < L; l++) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = CHASSIS;
      pill(leafX[l], leafY, leafW, leafH);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.28)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "rgba(236,232,222,0.9)";
      ctx.fillText(`L${l + 1}`, leafX[l], leafY + 0.5);
      for (let s = 0; s < S; s++) {
        const dead = l === failLeaf && s === failSpine;
        ctx.fillStyle = dead && downAmt > 0.5 ? DANGER : "rgba(236,232,222,0.7)";
        ctx.beginPath();
        ctx.arc(leafPortX(l, s), leafY - leafH / 2, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGlows(): void {
    ctx.globalCompositeOperation = "lighter";
    for (let s = 0; s < S; s++) {
      const size = spineW * 1.7;
      ctx.globalAlpha = clamp01(0.35 + load[s] * S * 0.3);
      ctx.drawImage(glows[s], spineX[s] - size / 2, spineY - size / 2, size, size);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /** Name the large flow on the canvas, beside its uplink. */
  function drawElephantLabel(): void {
    const f = flows[0];
    if (f.spine < 0) return;
    setPath(f.src, f.dst, f.spine, 0);
    pointAt(segLen[0] * 0.3);
    ctx.globalAlpha = smooth((simT - f.switchedAt) / SWITCH_BLEND);
    ctx.fillStyle = SPINE_COLORS[f.spine];
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("large flow", outX + 10, outY);
  }

  function begin(): void {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = "round";
  }

  function draw(): void {
    begin();
    drawLinks();
    drawGlows();

    ctx.globalCompositeOperation = "lighter";
    for (const f of flows) {
      const life = f.elephant
        ? 1
        : clamp01((simT - f.born) / FADE) * clamp01((f.dies - simT) / FADE);
      const blend = smooth((simT - f.switchedAt) / SWITCH_BLEND);
      drawComets(f, f.spine, life * blend);
      // Cross-fade from the old path so a rehash reads as a move.
      if (blend < 1) drawComets(f, f.prevSpine, life * (1 - blend));
    }
    ctx.globalCompositeOperation = "source-over";

    drawNodes();
    drawElephantLabel();
    ctx.globalAlpha = 1;
  }

  function drawStatic(): void {
    // No frames will run to ease the bars in, so set them outright.
    measureLoad();
    for (let s = 0; s < S; s++) load[s] = loadTarget[s];
    begin();
    drawLinks();
    drawGlows();
    ctx.globalCompositeOperation = "lighter";
    for (let i = flows.length - 1; i >= 0; i--) drawStillFlow(flows[i]);
    ctx.globalCompositeOperation = "source-over";
    drawNodes();
    drawElephantLabel();
    ctx.globalAlpha = 1;
  }

  function destroy(): void {
    // Zero-sized canvases give their backing store back straight away.
    for (const g of glows) {
      g.width = 0;
      g.height = 0;
    }
  }

  emit();
  return { resize, step, draw, drawStatic, destroy };
}
