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
  /** Tone, 0..1. Also decides which stones ORB fires on. */
  v: number;
  /** Which way the stone is lying. */
  a: number;
}

function scatter(
  seed: number,
  count: number,
  spread: number,
  rMin: number,
  rMax: number,
): Grain[] {
  const rand = mulberry32(seed);
  const out: Grain[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = Math.sqrt(rand()) * spread;
    const t = rand() * Math.PI * 2;
    out.push({
      x: Math.cos(t) * d,
      y: Math.sin(t) * d,
      r: rMin + rand() * (rMax - rMin),
      v: rand(),
      a: rand() * Math.PI,
    });
  }
  return out;
}

/**
 * Asphalt aggregate, in octaves. Deterministic: this is a fixed patch of
 * ground, and it is the same patch every time.
 *
 * One scale of stones is not enough for this shot. The descent is a continuous
 * pinhole zoom, so the coarse layer that fills the frame at seven metres is
 * half a dozen scattered discs at one metre — and a surface with six things on
 * it stops looking like a surface. Each octave below the first is about a
 * third the size and an order more dense, and only fades in once its patch is
 * wide enough to cover the frame on its own.
 */
const OCTAVES: { grains: Grain[]; spread: number }[] = [
  { grains: scatter(20260819, 520, 5.2, 0.012, 0.042), spread: 5.2 },
  { grains: scatter(31415926, 1700, 1.9, 0.0042, 0.015), spread: 1.9 },
  { grains: scatter(27182818, 2600, 0.95, 0.0015, 0.0055), spread: 0.95 },
];

/** The coarse layer, which is the one the vision pipeline is matching on. */
const GRAIN: Grain[] = OCTAVES[0].grains;

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
  /**
   * Fly the frame as live footage rather than a diagram: airframe attitude,
   * its shadow, the lens and the sensor. Left off, this draws the clean
   * schematic view the scrolled teach/repeat panels want.
   */
  camera?: { pose: CameraPose; exposure: number; frame: number };
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

/* -------------------------------------------------------------------------- */
/* THE CAMERA ITSELF — frame clock, attitude, exposure                        */
/* -------------------------------------------------------------------------- */

/**
 * Frame rate of the payload feed. Sampling the descent at the display's rate
 * instead of this one is the single thing that makes a rendered camera look
 * rendered: real footage steps, and a 60 Hz interpolation of it does not.
 */
export const FEED_HZ = 24;
const FEED_PERIOD_MS = 1000 / FEED_HZ;

/**
 * Which feed frame is on screen at `tMs`. Roughly one in twelve never makes it
 * across the link, and the last good frame stays up for two periods instead.
 */
export function feedFrame(tMs: number): number {
  const i = Math.floor(tMs / FEED_PERIOD_MS);
  const h = Math.sin(i * 12.9898) * 43758.5453;
  return h - Math.floor(h) < 0.085 ? i - 1 : i;
}

/** `tMs` quantised onto the feed's frame clock. */
export function feedTime(tMs: number): number {
  return feedFrame(tMs) * FEED_PERIOD_MS;
}

/** Where the boresight is pointing, relative to straight down. */
export interface CameraPose {
  /** Tilt about the image axes, radians. */
  tiltX: number;
  tiltY: number;
  /** Heading error, radians. */
  yaw: number;
}

/** Peak tilt excursion of an airframe holding position, radians (~1.1°). */
const TILT_PEAK = 0.019;
/** Peak heading excursion, radians (~1.5°). */
const YAW_PEAK = 0.026;

/**
 * Attitude of a hovering airframe. Not noise — a sum of a few slow modes, the
 * way a controller fighting wind actually behaves, so the frame breathes
 * instead of buzzing.
 *
 * The projection makes this self-scaling: a tilt puts `agl · tan θ` metres of
 * ground offset in the frame, which is `f · tan θ` pixels whatever the height.
 * The shake therefore reads at one constant amplitude the whole way down, and
 * stays at a fixed fraction of the alignment cone rather than tripping it.
 */
export function cameraPose(tMs: number, agl: number): CameraPose {
  const t = tMs / 1000;
  /* least settled at the top, where the wind is, and in the last half metre,
     where its own rotor wash comes back off the ground */
  const gust = 0.62 + 0.38 * clamp01(agl / TEACH_TOP_M);
  const wash = 1 + 1.7 * clamp01((0.9 - agl) / 0.9);
  const amp = TILT_PEAK * gust * wash;

  return {
    tiltX:
      amp *
      (Math.sin(t * 1.71 + 0.4) * 0.6 +
        Math.sin(t * 4.13 + 1.9) * 0.27 +
        Math.sin(t * 9.7 + 0.2) * 0.13),
    tiltY:
      amp *
      (Math.sin(t * 1.33 + 2.2) * 0.6 +
        Math.sin(t * 3.57 + 0.5) * 0.28 +
        Math.sin(t * 11.3 + 2.7) * 0.12),
    yaw:
      YAW_PEAK *
      gust *
      (Math.sin(t * 0.79 + 1.1) * 0.72 + Math.sin(t * 2.31 + 0.3) * 0.28),
  };
}

/** Ground offset a boresight tilt puts in the frame, in metres. */
export function tiltOffset(pose: CameraPose, agl: number): { x: number; y: number } {
  return { x: Math.tan(pose.tiltX) * agl, y: Math.tan(pose.tiltY) * agl };
}

/**
 * Auto-exposure gain. The payload camera has no manual lock, so it hunts — and
 * on the way in it is chasing its own shadow, which takes more of the frame
 * every second and drags the average brightness down with it.
 */
export function autoExposure(tMs: number, agl: number): number {
  const t = tMs / 1000;
  const hunt = 0.045 * Math.sin(t * 0.83 + 0.6) + 0.022 * Math.sin(t * 2.17 + 2.4);
  return 1 + hunt + 0.17 * clamp01((1.6 - agl) / 1.6);
}

/* -------------------------------------------------------------------------- */

/** Nominal drift of the return-to-launch hover, converging as it descends. */
export function repeatOffset(alt: number): { x: number; y: number } {
  const k = Math.pow(clamp01(alt / TEACH_TOP_M), 1.25);
  return {
    x: 0.42 * k * Math.cos(alt * 1.9 + 0.7) + 0.05,
    y: 0.34 * k * Math.sin(alt * 1.4 + 0.2) - 0.03,
  };
}

/**
 * Station-keeping residual, metres. The mean RTL error is a function of
 * altitude; this is the airframe still hunting while it holds, so a pause
 * on a rung reads as a hover and not as a frozen frame.
 */
export function hoverHunt(tMs: number, agl: number): { x: number; y: number } {
  const t = tMs / 1000;
  const k = 0.012 + 0.03 * clamp01(agl / TEACH_TOP_M);
  return {
    x: k * (Math.sin(t * 0.91 + 0.35) * 0.72 + Math.sin(t * 2.15 + 1.6) * 0.28),
    y: k * (Math.cos(t * 0.77 + 1.2) * 0.72 + Math.sin(t * 1.83 + 0.4) * 0.28),
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
  /* exposure gain can drive the bright end past the top of the range; the
     sensor clips there, so do the same rather than emitting a stray colour */
  const lv = (v: number) => Math.min(255, Math.round(v * luma));

  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, `rgb(${lv(28)},${lv(34)},${lv(37)})`);
  base.addColorStop(1, `rgb(${lv(18)},${lv(23)},${lv(26)})`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  /* aggregate: size follows the projection, so the texture "grows" as it drops */
  const reach = Math.hypot(w, h) / 2 / scale;
  OCTAVES.forEach((oct, i) => {
    /* the coarse layer is the ground; the rest earn their way in */
    const gain = i === 0 ? 1 : clamp01((oct.spread / reach - 1) / 0.6);
    if (gain < 0.06) return;

    for (const g of oct.grains) {
      const x = px(g.x);
      const y = py(g.y);
      if (x < -6 || x > w + 6 || y < -6 || y > h + 6) continue;
      const r = g.r * scale;
      if (r < 0.4) continue;
      const shade = 92 + g.v * 96;
      const a = gain * (0.22 + g.v * 0.5);

      if (r < 2.4) {
        ctx.fillStyle = `rgba(${lv(shade)},${lv(shade + 8)},${lv(shade + 12)},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.45, r), 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      /* close enough to read as a stone rather than a dot: where it beds into
         the surface, the stone itself, and the face turned towards the light */
      ctx.fillStyle = `rgba(4,7,9,${a * 0.66})`;
      ctx.beginPath();
      ctx.ellipse(x + r * 0.2, y + r * 0.22, r, r * 0.92, g.a, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${lv(shade)},${lv(shade + 8)},${lv(shade + 12)},${a})`;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.9, g.a, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = `rgba(${lv(shade + 46)},${lv(shade + 54)},${lv(shade + 58)},${a * 0.5})`;
      ctx.beginPath();
      ctx.ellipse(x - r * 0.22, y - r * 0.24, r * 0.58, r * 0.5, g.a, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  /* the taped launch mark */
  for (const t of TAPE) {
    ctx.save();
    ctx.translate(px(t.x), py(t.y));
    ctx.rotate(t.a);
    const bw = t.w * scale;
    const bh = t.h * scale;
    ctx.fillStyle = t.dark
      ? `rgba(${lv(14)},${lv(17)},${lv(19)},0.96)`
      : `rgba(${lv(222)},${lv(232)},${lv(236)},0.9)`;
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.restore();
  }

  /* the tag square that the AprilTag baseline used, still taped to the ground */
  const tag = 0.15 * scale;
  ctx.fillStyle = `rgba(${lv(232)},${lv(242)},${lv(246)},0.95)`;
  ctx.fillRect(px(0.34) - tag / 2, py(0.3) - tag / 2, tag, tag);
  ctx.fillStyle = `rgba(${lv(10)},${lv(13)},${lv(15)},0.95)`;
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
 * Sun elevation over the pad. Steep, and it has to be: the pinhole scales the
 * shadow's offset and the field of view by the same altitude, so a low sun
 * parks the airframe's shadow just outside the frame the whole way down.
 */
const SUN_ELEVATION = 1.19; /* 68° */
const SUN_AZIMUTH = -2.36; /* thrown up and to the left */
/** Rotor-tip span of the airframe, metres — the width of the shadow it casts. */
const SPAN_M = 0.42;

/**
 * The aircraft's own shadow. Its ground position tracks the aircraft, so it
 * holds a fixed spot in the frame and only grows — the thing that tells you,
 * without a single readout, that the camera is coming down rather than in.
 */
function drawShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  focal: number,
  scale: number,
  tiltPx: { x: number; y: number },
): void {
  const reach = focal / Math.tan(SUN_ELEVATION);
  const x = cx + tiltPx.x + Math.cos(SUN_AZIMUTH) * reach;
  const y = cy + tiltPx.y + Math.sin(SUN_AZIMUTH) * reach;
  const r = (SPAN_M * scale) / 2;
  if (r < 2) return;

  /* body, then the four rotor discs that make it read as an airframe */
  const blob = (bx: number, by: number, br: number, a: number) => {
    const g = ctx.createRadialGradient(bx, by, br * 0.1, bx, by, br);
    g.addColorStop(0, `rgba(2,5,7,${a})`);
    g.addColorStop(0.6, `rgba(2,5,7,${a * 0.66})`);
    g.addColorStop(1, "rgba(2,5,7,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(x, y, r * 0.46, 0.5);
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    blob(x + dx * r * 0.58, y + dy * r * 0.58, r * 0.42, 0.34);
  }
}

/**
 * Sensor grain, generated once and tiled. Kept dark and composited additively:
 * this is a dim scene, and grain that only ever adds light is what actually
 * happens on a sensor — it dithers the shadows and lifts the blacks off pure
 * black, which is most of what separates footage from a fill.
 */
let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement | null {
  if (grainTile) return grainTile;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(128, 128);
  const rand = mulberry32(4711);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.round(rand() * 60);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/**
 * What the lens and the sensor add to everything behind them: falloff towards
 * the corners, and grain that crawls a frame at a time. Drawn over the ground
 * but under the vision overlay, because the overlay is the ground station's,
 * not the camera's.
 */
function drawLens(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cx: number,
  cy: number,
  frame: number,
): void {
  const r = Math.hypot(w, h) * 0.62;
  const vg = ctx.createRadialGradient(cx, cy, r * 0.26, cx, cy, r);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(0.62, "rgba(0,0,0,0.17)");
  vg.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);

  const tile = grain();
  if (!tile) return;
  const pat = ctx.createPattern(tile, "repeat");
  if (!pat) return;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = pat;
  /* shift the tile every frame, or the grain sits still and reads as texture */
  const dx = -((frame * 37) % 128);
  const dy = -((frame * 53) % 128);
  ctx.translate(dx, dy);
  ctx.fillRect(-dx, -dy, w, h);
  ctx.restore();
}

/**
 * The live repeat frame: ground, ORB keypoints, the correspondences that
 * survived the ratio test, the alignment cone and the correction vector.
 */
export function drawOrb(ctx: CanvasRenderingContext2D, frame: OrbFrame): void {
  const { w, h, mode, camera } = frame;
  const alt = Math.max(0.12, frame.alt);
  const teachAlt = Math.min(frame.teachAlt ?? teachRungFor(alt), alt);
  const focal = w * FOCAL_RATIO;
  const cx = w * PP_X;
  const cy = h * PP_Y;

  /* the teach pass flies the launch point, so it has no lateral error */
  const isTeach = mode === "teach";
  const shown = isTeach ? teachAlt : alt;
  const scale = focal / shown;

  /* attitude puts ground in the frame that the position error did not */
  const tilt = camera ? tiltOffset(camera.pose, shown) : { x: 0, y: 0 };
  const base = isTeach ? { x: 0, y: 0 } : frame.err;
  const off = { x: base.x + tilt.x, y: base.y + tilt.y };

  const px = (X: number) => cx + (X - off.x) * scale;
  const py = (Y: number) => cy + (Y - off.y) * scale;

  /* heading error rotates everything the camera is looking at, about the
     boresight — but not the overlay the ground station draws on top of it */
  const held = (draw: () => void) => {
    if (!camera?.pose.yaw) return draw();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(camera.pose.yaw);
    ctx.translate(-cx, -cy);
    draw();
    ctx.restore();
  };

  ctx.clearRect(0, 0, w, h);
  held(() => {
    /* the teach frame was shot into the sun on the way up: it is the brighter
       of the two halves in every recovered pair */
    drawGround(ctx, w, h, scale, px, py, (isTeach ? 1.22 : 1) * (camera?.exposure ?? 1));
    if (camera) {
      drawShadow(ctx, cx, cy, focal, scale, { x: tilt.x * scale, y: tilt.y * scale });
    }
  });
  if (camera) drawLens(ctx, w, h, cx, cy, camera.frame);

  if (frame.overlay === false) return;

  const sigma = teachAlt / alt;
  const matchCount = frame.matches ?? modelledMatches(sigma);
  const xyError = Math.hypot(off.x, off.y);
  const tolerance = alignTolerance(alt);
  const cold = frame.handedOff === true;

  /* -- keypoints and correspondences -------------------------------------- */
  /* These are pinned to features on the ground, so they ride the heading
     error along with it. Everything below them is drawn in image space. */
  held(() => {
    /* the corners ORB would actually fire on */
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

    /* teach position -> live position, for the pairs that survived */
    if (isTeach || cold) return;
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
  });

  /* The teach keyframe is a stored picture, not a live fix: it gets the
     keypoints that were filed with it and nothing else. No cone, no
     correction — there is nothing to correct on the way up. */
  if (isTeach) return;

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
    held(() => {
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
    });
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
