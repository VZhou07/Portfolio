/* ============================================================================
   TEACH & REPEAT VIEWPORT RENDERER
   ----------------------------------------------------------------------------
   The downward camera during a visual teach-and-repeat descent, drawn with the
   same geometry and the same constants the flight software uses:

     pixels   = metres · f / altitude
     tolerance(agl) = max(MIN_ALIGN_TOLERANCE_M, ALIGN_TOLERANCE_RATIO · agl)
     taper          = clamp(2 − xyError / tolerance, 0, 1)

   Two consequences of that tolerance rule are worth seeing rather than reading:
   the alignment cone is a CONSTANT pixel radius (0.15 · f) for as long as the
   ratio term dominates, and descent authority fades out linearly between the
   1× and 2× cone instead of switching off at a threshold.

   Focal length and principal point are the real calibration from the airframe
   (fx 927.42 px over a 1279 px frame, principal point off-centre), so the
   reticle sits where the flight code actually aims from.
   ========================================================================== */

export type OrbMode = "repeat" | "teach" | "flow";

/* -- constants lifted from airside/src/nodes/nodes/processor.py ------------- */
/** Top of the teach ladder — `last_image_altitude`. */
export const TEACH_TOP_M = 7.5;
/** Teach keyframe spacing above 1 m — `image_rate`. */
export const TEACH_RUNG_M = 0.25;
/** Below this the aircraft is handed to ArduPilot LAND — `last_landing_altitude`. */
export const LAND_HANDOFF_M = 1.0;
/** `ALIGN_TOLERANCE_RATIO`. */
export const ALIGN_RATIO = 0.15;
/** `MIN_ALIGN_TOLERANCE_M`. */
export const ALIGN_FLOOR_M = 0.05;
/** `DESCENT_VZ` — the real vision-guided descent rate, in m/s. */
export const DESCENT_VZ = 0.1;
/** `lowe_ratio`. */
export const LOWE_RATIO = 0.55;
/** `min_inlier_ratio`. */
export const MIN_INLIER_RATIO = 0.4;
/** `MIN_TEACH_KEYPOINTS`. */
export const MIN_TEACH_KEYPOINTS = 150;

/** fx / frame width, from the airframe's calibration. ~63° horizontal FOV. */
const FOCAL_RATIO = 927.42 / 1279;
/** Principal point as a fraction of the frame — deliberately not the centre. */
const PP_X = 694.34 / 1279;
const PP_Y = 317.67 / 719;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Alignment tolerance in metres at a given height above ground. */
export function alignTolerance(agl: number): number {
  return Math.max(ALIGN_FLOOR_M, ALIGN_RATIO * agl);
}

/** Descent authority: 1 inside the cone, fading to 0 at twice the cone. */
export function descentTaper(xyError: number, agl: number): number {
  return clamp01(2 - xyError / alignTolerance(agl));
}

/** The teach keyframe the descent would select at this height. */
export function teachRungFor(agl: number): number {
  const rung = Math.floor(agl / TEACH_RUNG_M) * TEACH_RUNG_M;
  return Math.min(TEACH_TOP_M, Math.max(TEACH_RUNG_M, rung));
}

/**
 * Modelled match count for a teach/repeat pair whose altitude ratio is `sigma`.
 * Fitted to the recovered flight frames, where the surviving pairs run from 774
 * matches at sigma 0.80 down to 38 at sigma 0.42 — ORB's descriptor is simply
 * not scale-invariant enough to bridge a wide gap.
 */
export function modelledMatches(sigma: number): number {
  return Math.round(900 * Math.pow(Math.max(0, sigma - 0.35), 1.15));
}

/* -------------------------------------------------------------------------- */
/* GROUND MODEL — metres, origin at the launch point                          */
/* -------------------------------------------------------------------------- */

interface Grain {
  x: number;
  y: number;
  r: number;
  v: number;
}

/** Asphalt aggregate. Deterministic: this is a fixed patch of ground. */
const GRAIN: Grain[] = (() => {
  const rand = mulberry32(20260819);
  const out: Grain[] = [];
  for (let i = 0; i < 520; i += 1) {
    const r = Math.sqrt(rand()) * 5.2;
    const a = rand() * Math.PI * 2;
    out.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      r: 0.012 + rand() * 0.03,
      v: rand(),
    });
  }
  return out;
})();

/** The taped launch mark: a dark cross, light strips, and the tag square. */
const TAPE: { x: number; y: number; w: number; h: number; a: number; dark: boolean }[] = [
  { x: 0, y: 0, w: 0.62, h: 0.075, a: 0.72, dark: true },
  { x: 0, y: 0, w: 0.62, h: 0.075, a: -0.72, dark: true },
  { x: -0.16, y: 0.1, w: 0.34, h: 0.05, a: 1.35, dark: false },
  { x: 0.2, y: -0.05, w: 0.3, h: 0.05, a: 1.2, dark: false },
  { x: 0.05, y: 0.26, w: 0.26, h: 0.05, a: 0.15, dark: false },
];

/** Which grains ORB would fire on — the high-contrast tail, chosen once. */
const CORNERS: Grain[] = GRAIN.filter((g) => g.v > 0.62 && g.r > 0.019);

export interface OrbFrame {
  mode: OrbMode;
  /** Height above ground in metres. */
  alt: number;
  /** Height of the matched teach keyframe. Defaults to the ladder rung. */
  teachAlt?: number;
  /** Lateral error in metres, image axes. */
  err: { x: number; y: number };
  /** Canvas size in CSS pixels. */
  w: number;
  h: number;
  /** 0 draws no overlay at all — used for the teach keyframe. */
  overlay?: boolean;
  /** Force the match count instead of modelling it. */
  matches?: number;
  /** True once the autopilot owns the descent: vision overlay goes cold. */
  handedOff?: boolean;
}

export interface Surface {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
}

/**
 * Sizes a canvas backing store to its CSS box and returns a drawing surface.
 * Call on mount, on resize and on visibility change — never inside a frame
 * loop, because reading clientWidth forces layout.
 */
export function fitOrbCanvas(
  canvas: HTMLCanvasElement | null,
  maxDpr = 1.5,
): Surface | null {
  if (!canvas) return null;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return null;

  const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

/** Nominal drift of the return-to-launch hover, converging as it descends. */
export function repeatOffset(alt: number): { x: number; y: number } {
  const k = Math.pow(clamp01(alt / TEACH_TOP_M), 1.25);
  return {
    x: 0.42 * k * Math.cos(alt * 1.9 + 0.7) + 0.05,
    y: 0.34 * k * Math.sin(alt * 1.4 + 0.2) - 0.03,
  };
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  scale: number,
  px: (x: number) => number,
  py: (y: number) => number,
  luma: number,
): void {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, `rgb(${28 * luma},${34 * luma},${37 * luma})`);
  base.addColorStop(1, `rgb(${18 * luma},${23 * luma},${26 * luma})`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  /* aggregate: size follows the projection, so the texture "grows" as it drops */
  for (const g of GRAIN) {
    const x = px(g.x);
    const y = py(g.y);
    if (x < -6 || x > w + 6 || y < -6 || y > h + 6) continue;
    const r = Math.max(0.45, g.r * scale);
    const shade = Math.round((92 + g.v * 96) * luma);
    ctx.fillStyle = `rgba(${shade},${shade + 8},${shade + 12},${0.22 + g.v * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* the taped launch mark */
  for (const t of TAPE) {
    ctx.save();
    ctx.translate(px(t.x), py(t.y));
    ctx.rotate(t.a);
    const bw = t.w * scale;
    const bh = t.h * scale;
    ctx.fillStyle = t.dark
      ? `rgba(${14 * luma},${17 * luma},${19 * luma},0.96)`
      : `rgba(${222 * luma},${232 * luma},${236 * luma},0.9)`;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  /* the tag square that the AprilTag baseline used, still taped to the ground */
  const tag = 0.15 * scale;
  ctx.fillStyle = `rgba(${232 * luma},${242 * luma},${246 * luma},0.95)`;
  ctx.fillRect(px(0.34) - tag / 2, py(0.3) - tag / 2, tag, tag);
  ctx.fillStyle = `rgba(${10 * luma},${13 * luma},${15 * luma},0.95)`;
  const cell = tag / 5;
  for (const [r, c] of [
    [1, 1],
    [1, 3],
    [2, 2],
    [3, 1],
    [3, 2],
  ]) {
    ctx.fillRect(
      px(0.34) - tag / 2 + c * cell,
      py(0.3) - tag / 2 + r * cell,
      cell,
      cell,
    );
  }
}

/**
 * The live repeat frame: ground, ORB keypoints, the correspondences that
 * survived the ratio test, the alignment cone and the correction vector.
 */
export function drawOrb(ctx: CanvasRenderingContext2D, frame: OrbFrame): void {
  const { w, h, mode } = frame;
  const alt = Math.max(0.12, frame.alt);
  const teachAlt = Math.min(frame.teachAlt ?? teachRungFor(alt), alt);
  const focal = w * FOCAL_RATIO;
  const cx = w * PP_X;
  const cy = h * PP_Y;

  /* the teach pass flies the launch point, so it has no lateral error */
  const isTeach = mode === "teach";
  const off = isTeach ? { x: 0, y: 0 } : frame.err;
  const shown = isTeach ? teachAlt : alt;
  const scale = focal / shown;

  const px = (X: number) => cx + (X - off.x) * scale;
  const py = (Y: number) => cy + (Y - off.y) * scale;

  ctx.clearRect(0, 0, w, h);
  /* the teach frame was shot into the sun on the way up: it is the brighter
     of the two halves in every recovered pair */
  drawGround(ctx, w, h, scale, px, py, isTeach ? 1.22 : 1);

  if (frame.overlay === false) return;

  const sigma = teachAlt / alt;
  const matchCount = frame.matches ?? modelledMatches(sigma);
  const xyError = Math.hypot(off.x, off.y);
  const tolerance = alignTolerance(alt);
  const cold = frame.handedOff === true;

  /* -- keypoints: the corners ORB would actually fire on ------------------ */
  const budget = cold ? 0 : Math.min(96, Math.max(6, Math.round(matchCount / 6)));
  let drawn = 0;
  ctx.lineWidth = 1;
  for (const g of CORNERS) {
    if (drawn >= budget) break;
    const x = px(g.x);
    const y = py(g.y);
    if (x < 4 || x > w - 4 || y < 4 || y > h - 4) continue;
    drawn += 1;
    const s = 2.5;
    ctx.strokeStyle = `rgba(86,220,255,${0.3 + g.v * 0.45})`;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s);
    ctx.lineTo(x, y + s);
    ctx.stroke();
  }

  /* The teach keyframe is a stored picture, not a live fix: it gets the
     keypoints that were filed with it and nothing else. No cone, no
     correction — there is nothing to correct on the way up. */
  if (isTeach) return;

  /* -- correspondences: teach position -> live position ------------------- */
  if (!cold) {
    const tScale = focal / teachAlt;
    let links = 0;
    ctx.strokeStyle = "rgba(255,180,74,0.4)";
    ctx.beginPath();
    for (const g of CORNERS) {
      if (links >= 26) break;
      const lx = px(g.x);
      const ly = py(g.y);
      if (lx < 4 || lx > w - 4 || ly < 4 || ly > h - 4) continue;
      const tx = cx + g.x * tScale;
      const ty = cy + g.y * tScale;
      if (tx < 0 || tx > w || ty < 0 || ty > h) continue;
      links += 1;
      ctx.moveTo(tx, ty);
      ctx.lineTo(lx, ly);
    }
    ctx.stroke();
  }

  /* -- alignment cone: 1x solid, 2x dashed -------------------------------- */
  const coneR = (tolerance * focal) / alt;
  ctx.strokeStyle = cold ? "rgba(126,151,158,0.4)" : "rgba(142,242,160,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, coneR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = cold ? "rgba(126,151,158,0.2)" : "rgba(142,242,160,0.22)";
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.arc(cx, cy, coneR * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  /* -- the correction vector, aimed from the principal point -------------- */
  if (!cold) {
    const tipX = cx - off.x * scale;
    const tipY = cy - off.y * scale;
    const len = Math.hypot(tipX - cx, tipY - cy);
    const inside = xyError <= tolerance;
    ctx.strokeStyle = inside ? "#8ef2a0" : "#ffb44a";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    if (len > 8) {
      const a = Math.atan2(tipY - cy, tipX - cx);
      const head = Math.min(9, len * 0.3);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - head * Math.cos(a - 0.42), tipY - head * Math.sin(a - 0.42));
      ctx.lineTo(tipX - head * Math.cos(a + 0.42), tipY - head * Math.sin(a + 0.42));
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineWidth = 1;
  }

  /* -- principal-point reticle ------------------------------------------- */
  ctx.strokeStyle = "rgba(255,180,74,0.85)";
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy);
  ctx.lineTo(cx - 3, cy);
  ctx.moveTo(cx + 3, cy);
  ctx.lineTo(cx + 9, cy);
  ctx.moveTo(cx, cy - 9);
  ctx.lineTo(cx, cy - 3);
  ctx.moveTo(cx, cy + 3);
  ctx.lineTo(cx, cy + 9);
  ctx.stroke();
}

/** Plots the altitude actually flown, most recent sample on the right. */
export function drawDescentTrace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  history: number[],
  ceiling: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#05080a";
  ctx.fillRect(0, 0, w, h);

  /* the teach ladder, one line per keyframe rung */
  ctx.strokeStyle = "#16272e";
  ctx.lineWidth = 1;
  for (let a = TEACH_RUNG_M; a < ceiling; a += TEACH_RUNG_M * 4) {
    const y = h - (a / ceiling) * (h - 2) - 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  /* the LAND-mode handoff height */
  const hy = h - (LAND_HANDOFF_M / ceiling) * (h - 2) - 1;
  ctx.strokeStyle = "rgba(255,180,74,0.5)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(0, hy);
  ctx.lineTo(w, hy);
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

  const last = history[history.length - 1];
  const ly = h - clamp01(last / ceiling) * (h - 2) - 1;
  ctx.fillStyle = "#ffb44a";
  ctx.fillRect(w - 3, ly - 1.5, 3, 3);
}
