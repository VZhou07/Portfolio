"use client";

import { useEffect, useRef } from "react";
import { clamp } from "@/lib/derive";
import { useFlight, useTelemetry } from "@/lib/flight-computer";

const HOT = "a,button,input,textarea,select,summary,[role='button']";

/** Launch tubes. Capped on purpose: a salvo should read as a salvo, not confetti. */
const TUBES = 4;
const BURST_S = 0.26;

interface Missile {
  live: boolean;
  /** Flight progress 0..1, then burst progress 0..1. */
  t: number;
  burst: number;
  dur: number;
  sx: number;
  sy: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  trail: number[];
}

function blank(): Missile {
  return {
    live: false,
    t: 0,
    burst: 0,
    dur: 0.4,
    sx: 0,
    sy: 0,
    cx: 0,
    cy: 0,
    tx: 0,
    ty: 0,
    trail: [],
  };
}

/** Quadratic Bézier — the missile climbs out of the tube then arcs into target. */
function bez(a: number, b: number, c: number, t: number): number {
  const u = 1 - t;
  return u * u * a + 2 * u * t * b + t * t * c;
}

/**
 * Cursor companion.
 *
 * Tracks the pointer with lag, reports its real screen coordinates and what kind
 * of control it is over, and closes to a LOCK when that control is actionable.
 * Clicking a locked target fires a missile from the launch rail: it flies a real
 * Bézier arc to the point you clicked and bursts on impact. Four tubes, and the
 * tube ticks in the readout show what is loaded, so the cap is visible rather
 * than arbitrary.
 *
 * Mounted only for fine pointers, runs on the shared frame loop, and does
 * nothing at all under prefers-reduced-motion. Never blocks a click: the whole
 * overlay is pointer-events: none.
 */
export function CursorReticle() {
  const { pointerFine, booted, reducedMotion } = useFlight();

  const root = useRef<HTMLDivElement>(null);
  const coords = useRef<HTMLSpanElement>(null);
  const kindText = useRef<HTMLSpanElement>(null);
  const tubes = useRef<(HTMLSpanElement | null)[]>([]);

  const groups = useRef<(SVGGElement | null)[]>([]);
  const trails = useRef<(SVGPolylineElement | null)[]>([]);
  const heads = useRef<(SVGGElement | null)[]>([]);
  const bursts = useRef<(SVGGElement | null)[]>([]);

  const pos = useRef({ x: 0, y: 0 });
  const nextText = useRef(0);
  const salvo = useRef<Missile[]>(Array.from({ length: TUBES }, blank));
  const loadedMask = useRef(-1);

  /* ── fire control ────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!pointerFine || reducedMotion) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      /* only a locked target gets a missile */
      const target = e.target instanceof Element ? e.target.closest(HOT) : null;
      if (!target) return;

      const slot = salvo.current.find((m) => !m.live);
      if (!slot) return;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tx = e.clientX;
      const ty = e.clientY;
      /* launch from the rail side nearest the target, below the fold */
      const sx = tx < vw / 2 ? Math.max(28, vw * 0.06) : Math.min(vw - 28, vw * 0.94);
      const sy = vh + 30;

      slot.live = true;
      slot.t = 0;
      slot.burst = 0;
      slot.sx = sx;
      slot.sy = sy;
      slot.tx = tx;
      slot.ty = ty;
      /* control point straight above the tube: climb, then bend in */
      slot.cx = sx;
      slot.cy = ty;
      slot.dur = clamp(0.28 + Math.hypot(tx - sx, ty - sy) / 2600, 0.28, 0.55);
      slot.trail = [];
    };

    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [pointerFine, reducedMotion]);

  /* ── one frame callback drives the reticle and every live missile ──────── */
  useTelemetry((t) => {
    const el = root.current;
    if (!el) return;

    const p = pos.current;
    const k = reducedMotion ? 1 : 0.22;
    p.x += (t.pointerX - p.x) * k;
    p.y += (t.pointerY - p.y) * k;

    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    el.style.opacity = t.pointerInside && booted ? "1" : "0";
    el.dataset.hot = t.pointerHot ? "true" : "false";

    if (t.elapsed > nextText.current) {
      nextText.current = t.elapsed + 0.1;
      if (coords.current) {
        coords.current.textContent = `${Math.round(t.pointerX)
          .toString()
          .padStart(4, "0")} ${Math.round(t.pointerY).toString().padStart(4, "0")}`;
      }
      if (kindText.current) {
        kindText.current.textContent = t.pointerHot
          ? `LOCK ${t.pointerKind}`
          : "TRK";
      }
    }

    /* ---- missiles ---- */
    let mask = 0;
    for (let i = 0; i < TUBES; i += 1) {
      const m = salvo.current[i];
      const g = groups.current[i];
      if (!m.live) {
        if (g && g.style.display !== "none") g.style.display = "none";
        mask |= 1 << i;
        continue;
      }
      if (g && g.style.display === "none") g.style.display = "";

      if (m.t < 1) {
        m.t = Math.min(1, m.t + t.dt / m.dur);
        /* smoothstep: quick out of the tube, settles into the target */
        const e = m.t * m.t * (3 - 2 * m.t);
        const x = bez(m.sx, m.cx, m.tx, e);
        const y = bez(m.sy, m.cy, m.ty, e);

        m.trail.push(x, y);
        if (m.trail.length > 20) m.trail.splice(0, 2);

        const line = trails.current[i];
        if (line) {
          let pts = "";
          for (let j = 0; j < m.trail.length; j += 2) {
            pts += `${m.trail[j].toFixed(1)},${m.trail[j + 1].toFixed(1)} `;
          }
          line.setAttribute("points", pts.trim());
        }

        const head = heads.current[i];
        if (head) {
          const px = m.trail.length >= 4 ? m.trail[m.trail.length - 4] : m.sx;
          const py = m.trail.length >= 4 ? m.trail[m.trail.length - 3] : m.sy;
          const deg = (Math.atan2(y - py, x - px) * 180) / Math.PI + 90;
          head.setAttribute(
            "transform",
            `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${deg.toFixed(1)})`,
          );
          head.style.opacity = "1";
        }
        bursts.current[i]?.setAttribute("opacity", "0");
      } else {
        /* impact */
        m.burst = Math.min(1, m.burst + t.dt / BURST_S);
        const b = bursts.current[i];
        if (b) {
          const s = 0.3 + m.burst * 1.2;
          b.setAttribute(
            "transform",
            `translate(${m.tx.toFixed(1)} ${m.ty.toFixed(1)}) scale(${s.toFixed(2)})`,
          );
          b.setAttribute("opacity", (1 - m.burst).toFixed(2));
        }
        const head = heads.current[i];
        if (head) head.style.opacity = "0";
        /* the trail burns back as the burst fades */
        if (m.trail.length > 4) m.trail.splice(0, 4);
        const line = trails.current[i];
        if (line) {
          let pts = "";
          for (let j = 0; j < m.trail.length; j += 2) {
            pts += `${m.trail[j].toFixed(1)},${m.trail[j + 1].toFixed(1)} `;
          }
          line.setAttribute("points", pts.trim());
        }

        if (m.burst >= 1) {
          m.live = false;
          m.trail = [];
          line?.setAttribute("points", "");
        }
      }
    }

    /* tube ticks: lit = loaded */
    if (mask !== loadedMask.current) {
      loadedMask.current = mask;
      for (let i = 0; i < TUBES; i += 1) {
        const tick = tubes.current[i];
        if (tick) tick.dataset.loaded = mask & (1 << i) ? "true" : "false";
      }
    }
  });

  if (!pointerFine) return null;

  return (
    <>
      {/* missile layer, viewport coordinates, never interactive */}
      {!reducedMotion && (
        <svg
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[45] h-full w-full"
        >
          {Array.from({ length: TUBES }, (_, i) => (
            <g
              key={i}
              ref={(node) => {
                groups.current[i] = node;
              }}
              style={{ display: "none" }}
            >
              <polyline
                ref={(node) => {
                  trails.current[i] = node;
                }}
                fill="none"
                stroke="var(--color-signal)"
                strokeWidth="1.6"
                strokeLinecap="round"
                opacity="0.8"
              />
              <g
                ref={(node) => {
                  heads.current[i] = node;
                }}
              >
                <path d="M0 -5 L2.6 4 L-2.6 4 Z" fill="var(--color-ink)" />
                <circle cx="0" cy="5" r="1.4" fill="var(--color-signal)" />
              </g>
              <g
                ref={(node) => {
                  bursts.current[i] = node;
                }}
                opacity="0"
              >
                <circle
                  r="9"
                  fill="none"
                  stroke="var(--color-signal)"
                  strokeWidth="1.4"
                />
                <path
                  d="M-13 0 H-7 M7 0 H13 M0 -13 V-7 M0 7 V13"
                  stroke="var(--color-data)"
                  strokeWidth="1.2"
                />
              </g>
            </g>
          ))}
        </svg>
      )}

      {/* the reticle itself */}
      <div
        ref={root}
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-50 opacity-0 transition-opacity duration-200 [&[data-hot='true']_.rt-box]:border-signal [&[data-hot='true']_.rt-box]:scale-75 [&[data-hot='true']_.rt-ring]:opacity-100 [&[data-hot='true']_.rt-txt]:text-signal [&[data-hot='true']_.rt]:bg-signal"
      >
        {/* crosshair, gapped so it never covers what you are pointing at */}
        <span className="rt bg-data/60 absolute -left-5 h-px w-3.5 transition-colors" />
        <span className="rt bg-data/60 absolute left-1.5 h-px w-3.5 transition-colors" />
        <span className="rt bg-data/60 absolute -top-5 h-3.5 w-px transition-colors" />
        <span className="rt bg-data/60 absolute top-1.5 h-3.5 w-px transition-colors" />

        {/* box tightens on lock */}
        <span className="rt-box border-data/50 absolute -top-1.5 -left-1.5 h-3 w-3 border transition-all duration-150" />
        {/* ring only appears when the target is actionable */}
        <span className="rt-ring border-signal/60 absolute -top-3.5 -left-3.5 h-7 w-7 rounded-full border opacity-0 transition-opacity duration-150" />

        <span className="rt-txt text-data/70 text-micro tnum absolute top-3.5 left-3.5 flex items-center gap-1.5 whitespace-nowrap transition-colors">
          <span ref={kindText}>TRK</span>
          <span ref={coords}>0000 0000</span>
          {/* loaded tubes */}
          <span className="flex items-center gap-[2px]">
            {Array.from({ length: TUBES }, (_, i) => (
              <span
                key={i}
                ref={(node) => {
                  tubes.current[i] = node;
                }}
                data-loaded="true"
                className="bg-rule-hi data-[loaded=true]:bg-signal h-2 w-[2px]"
              />
            ))}
          </span>
        </span>
      </div>
    </>
  );
}
