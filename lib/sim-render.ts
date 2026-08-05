/* ============================================================================
   SITL VIEWPORT RENDERER
   ----------------------------------------------------------------------------
   A small downward-camera simulator, drawn with the same pinhole maths a real
   precision-landing pipeline uses:

     pixels = metres * f / altitude          (f = focal length in pixels)
     depth(r) = altitude * sqrt(1 + (r/f)^2) (flat ground plane)

   Every viewport below is the same scene through a different pass — RGB, depth,
   pad mask, feature flow — which is how the sim bay is actually laid out. The
   lateral offset converges to zero as altitude drops, because that is what the
   landing controller does.
   ========================================================================== */

export type SimMode = "rgb" | "depth" | "mask" | "features";

const PAD_SIZE = 1.4; /* metres, the painted pad */
const TAG_SIZE = 0.6; /* metres, the fiducial on it */

/* 4x4 payload inside the tag border — a fixed id, not random noise. */
const TAG_BITS = [
  [1, 0, 1, 1],
  [0, 1, 1, 0],
  [1, 1, 0, 1],
  [0, 1, 0, 0],
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Feature {
  x: number;
  y: number;
  w: number;
}

/** Ground texture, generated once and reused — deterministic, never re-rolled. */
const FEATURES: Feature[] = (() => {
  const rand = mulberry32(20260805);
  const out: Feature[] = [];
  for (let i = 0; i < 340; i += 1) {
    const r = Math.sqrt(rand()) * 9.5;
    const a = rand() * Math.PI * 2;
    out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, w: 0.5 + rand() * 1.1 });
  }
  return out;
})();

/** Fixed-pattern sensor noise — static, so it reads as a sensor not as sparkle. */
const FPN: { x: number; y: number; v: number }[] = (() => {
  const rand = mulberry32(7);
  return Array.from({ length: 90 }, () => ({
    x: rand(),
    y: rand(),
    v: rand(),
  }));
})();

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Lateral error of the approach, converging to zero at touchdown. */
export function approachOffset(alt: number): { x: number; y: number } {
  const k = Math.pow(clamp01(alt / 12), 1.4);
  return {
    x: 1.2 * k * Math.cos(alt * 1.7 + 0.4),
    y: 0.9 * k * Math.sin(alt * 1.25),
  };
}

/** Detection confidence rises as the tag grows in the frame. */
export function tagConfidence(alt: number, tagPx: number): number {
  if (tagPx < 10) return 0;
  return clamp01(1 - alt / 15) * clamp01(tagPx / 40) * 0.99;
}

/** Tag edge length in pixels at this altitude. */
export function tagPixels(alt: number, focal: number): number {
  return (TAG_SIZE * focal) / Math.max(0.12, alt);
}

export interface SimFrame {
  mode: SimMode;
  /** Altitude above ground in metres. */
  alt: number;
  /** Canvas size in CSS pixels. */
  w: number;
  h: number;
}

export function drawSim(ctx: CanvasRenderingContext2D, frame: SimFrame): void {
  const { mode, w, h } = frame;
  const alt = Math.max(0.12, frame.alt);
  /* ~62° horizontal field of view */
  const focal = w * 0.85;
  const off = approachOffset(alt);
  const cx = w / 2;
  const cy = h / 2;
  const scale = focal / alt;

  const px = (X: number) => cx + (X - off.x) * scale;
  const py = (Y: number) => cy + (Y - off.y) * scale;

  ctx.clearRect(0, 0, w, h);

  if (mode === "depth") {
    drawDepth(ctx, w, h, alt, focal, px, py);
    return;
  }
  if (mode === "mask") {
    drawMask(ctx, w, h, alt, focal, px, py);
    return;
  }
  if (mode === "features") {
    drawFeatures(ctx, w, h, alt, focal, off);
    return;
  }
  drawRgb(ctx, w, h, alt, focal, px, py);
}

/* -------------------------------------------------------------------------- */
/* RGB PASS — what the payload camera sees                                    */
/* -------------------------------------------------------------------------- */

function drawRgb(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alt: number,
  focal: number,
  px: (x: number) => number,
  py: (y: number) => number,
): void {
  /* ground */
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#141b1d");
  g.addColorStop(1, "#0b1113");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const scale = focal / alt;

  /* ground texture, size and brightness follow the projection */
  for (const f of FEATURES) {
    const x = px(f.x);
    const y = py(f.y);
    if (x < -8 || x > w + 8 || y < -8 || y > h + 8) continue;
    const r = Math.max(0.4, f.w * scale * 0.02);
    ctx.fillStyle = `rgba(150,175,182,${0.06 + f.w * 0.06})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* landing pad */
  const padPx = PAD_SIZE * scale;
  ctx.save();
  ctx.translate(px(0), py(0));
  ctx.rotate(0.28 * Math.pow(clamp01(alt / 12), 1.3));
  ctx.fillStyle = "#2c3a3f";
  ctx.fillRect(-padPx / 2, -padPx / 2, padPx, padPx);
  ctx.strokeStyle = "#4a6068";
  ctx.lineWidth = Math.max(1, padPx * 0.012);
  ctx.strokeRect(-padPx / 2, -padPx / 2, padPx, padPx);

  /* the fiducial itself, drawn bit by bit */
  const tagPx = TAG_SIZE * scale;
  const cell = tagPx / 6;
  ctx.fillStyle = "#05080a";
  ctx.fillRect(-tagPx / 2, -tagPx / 2, tagPx, tagPx);
  ctx.fillStyle = "#e8f4f7";
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      if (!TAG_BITS[r][c]) continue;
      ctx.fillRect(
        -tagPx / 2 + (c + 1) * cell,
        -tagPx / 2 + (r + 1) * cell,
        cell,
        cell,
      );
    }
  }
  ctx.restore();

  /* fixed-pattern noise */
  for (const n of FPN) {
    ctx.fillStyle = `rgba(230,245,250,${0.015 + n.v * 0.03})`;
    ctx.fillRect(n.x * w, n.y * h, 1, 1);
  }

  /* detection overlay */
  const conf = tagConfidence(alt, tagPx);
  const boxHalf = Math.max(6, (tagPx / 2) * 1.25);
  const tx = px(0);
  const ty = py(0);

  ctx.lineWidth = 1;
  if (conf > 0) {
    ctx.strokeStyle = "#ffb44a";
    ctx.strokeRect(tx - boxHalf, ty - boxHalf, boxHalf * 2, boxHalf * 2);
    /* corner ticks */
    const t = Math.min(10, boxHalf * 0.4);
    ctx.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      ctx.moveTo(tx + sx * boxHalf, ty + sy * boxHalf - sy * t);
      ctx.lineTo(tx + sx * boxHalf, ty + sy * boxHalf);
      ctx.lineTo(tx + sx * boxHalf - sx * t, ty + sy * boxHalf);
    }
    ctx.stroke();

    /* error vector from image centre to target centre */
    ctx.strokeStyle = "rgba(86,220,255,0.75)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ffb44a";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(
      `TAG 0  CONF ${conf.toFixed(2)}`,
      tx - boxHalf,
      ty - boxHalf - 4,
    );
  } else {
    ctx.strokeStyle = "rgba(255,99,99,0.8)";
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(w / 2 - 26, h / 2 - 26, 52, 52);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,99,99,0.9)";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText("SEARCHING", w / 2 - 26, h / 2 - 30);
  }
}

/* -------------------------------------------------------------------------- */
/* DEPTH PASS — real plane geometry, quantised to a visible cell grid          */
/* -------------------------------------------------------------------------- */

function drawDepth(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alt: number,
  focal: number,
  px: (x: number) => number,
  py: (y: number) => number,
): void {
  const cell = 6;
  const maxDepth = alt * 2.2;

  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      const dx = x + cell / 2 - w / 2;
      const dy = y + cell / 2 - h / 2;
      const r = Math.hypot(dx, dy);
      const depth = alt * Math.sqrt(1 + (r / focal) ** 2);
      const t = clamp01(depth / maxDepth);
      /* near = warm, far = cold: the ramp the sim bay uses */
      const rr = Math.round(255 * (1 - t) + 20 * t);
      const gg = Math.round(150 * (1 - t) + 40 * t);
      const bb = Math.round(40 * (1 - t) + 120 * t);
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(x, y, cell, cell);
    }
  }

  /* the pad sits 5 cm proud of the ground, so it reads slightly nearer */
  const padPx = PAD_SIZE * (focal / alt);
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(px(0) - padPx / 2, py(0) - padPx / 2, padPx, padPx);
}

/* -------------------------------------------------------------------------- */
/* MASK PASS — pad segmentation, noise falls away as confidence rises         */
/* -------------------------------------------------------------------------- */

function drawMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alt: number,
  focal: number,
  px: (x: number) => number,
  py: (y: number) => number,
): void {
  ctx.fillStyle = "#05080a";
  ctx.fillRect(0, 0, w, h);

  const padPx = PAD_SIZE * (focal / alt);
  const conf = tagConfidence(alt, tagPixels(alt, focal));

  ctx.fillStyle = "#e8f4f7";
  ctx.fillRect(px(0) - padPx / 2, py(0) - padPx / 2, padPx, padPx);

  /* false positives that the detector rejects as the target grows */
  const blobs = Math.round((1 - conf) * 16);
  const rand = mulberry32(99);
  for (let i = 0; i < blobs; i += 1) {
    const x = rand() * w;
    const y = rand() * h;
    const s = 2 + rand() * 5;
    ctx.fillStyle = "rgba(232,244,247,0.55)";
    ctx.fillRect(x, y, s, s);
  }

  ctx.strokeStyle = "rgba(86,220,255,0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(px(0) - padPx / 2, py(0) - padPx / 2, padPx, padPx);
}

/* -------------------------------------------------------------------------- */
/* FEATURE PASS — optical flow between this frame and 3% higher               */
/* -------------------------------------------------------------------------- */

function drawFeatures(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  alt: number,
  focal: number,
  off: { x: number; y: number },
): void {
  ctx.fillStyle = "#05080a";
  ctx.fillRect(0, 0, w, h);

  const prevAlt = alt * 1.04;
  const prevOff = approachOffset(prevAlt);
  const s = focal / alt;
  const ps = focal / prevAlt;

  for (const f of FEATURES) {
    const x = w / 2 + (f.x - off.x) * s;
    const y = h / 2 + (f.y - off.y) * s;
    if (x < 0 || x > w || y < 0 || y > h) continue;

    const x0 = w / 2 + (f.x - prevOff.x) * ps;
    const y0 = h / 2 + (f.y - prevOff.y) * ps;
    const mag = Math.hypot(x - x0, y - y0);

    ctx.strokeStyle = `rgba(255,180,74,${clamp01(mag / 14) * 0.85})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.fillStyle = "rgba(86,220,255,0.9)";
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }
}

/* -------------------------------------------------------------------------- */
/* ALTITUDE TRACE — plots the altitude you actually flew                      */
/* -------------------------------------------------------------------------- */

export function drawTrace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  history: number[],
  ceiling: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#05080a";
  ctx.fillRect(0, 0, w, h);

  /* graticule */
  ctx.strokeStyle = "#16272e";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  /* ground line */
  ctx.strokeStyle = "#2b4a54";
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(0, h - 1);
  ctx.lineTo(w, h - 1);
  ctx.stroke();
  ctx.setLineDash([]);

  if (history.length < 2) return;

  ctx.strokeStyle = "#56dcff";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < history.length; i += 1) {
    const x = (i / (history.length - 1)) * w;
    const y = h - clamp01(history[i] / ceiling) * (h - 2) - 1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  /* current sample */
  const last = history[history.length - 1];
  const ly = h - clamp01(last / ceiling) * (h - 2) - 1;
  ctx.fillStyle = "#ffb44a";
  ctx.fillRect(w - 3, ly - 1.5, 3, 3);
}
