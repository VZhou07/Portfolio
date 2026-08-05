"use client";

/* ============================================================================
   FLIGHT COMPUTER
   ----------------------------------------------------------------------------
   One passive scroll read and one requestAnimationFrame loop for the entire
   site. Instruments subscribe with useTelemetry() and write straight to the DOM
   (transform / textContent) instead of calling setState 60 times a second, so
   nothing re-renders per frame and nothing thrashes layout.

   All telemetry is real, measured from the document and the device:
     ALT   remaining scroll distance, scaled to metres (touchdown = page end)
     V/S   signed scroll velocity
     GS    smoothed scroll speed
     HDG   active section bearing, interpolated across the section
     FPS   measured frame rate
     T+    time since the flight computer came up
   ========================================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { SECTIONS } from "@/lib/content";
import { clamp } from "@/lib/derive";

/** Scroll pixels per simulated metre. Tuned so a full page ≈ 200–400 m. */
export const PX_PER_METRE = 20;

export type FlightMode = "AUTO" | "MANUAL" | "HOLD";

export interface Telemetry {
  scrollY: number;
  /** Document scroll progress, 0..1. */
  progress: number;
  /** Metres of "altitude" left before the page bottom. */
  altitude: number;
  /** Signed vertical speed in m/s. Negative = descending the page. */
  vspeed: number;
  /** Smoothed absolute speed in m/s. */
  groundSpeed: number;
  /** Interpolated compass heading in degrees. */
  heading: number;
  fps: number;
  /** Seconds elapsed since the previous frame. */
  dt: number;
  /** Seconds since mount. */
  elapsed: number;
  vw: number;
  vh: number;
  mode: FlightMode;
  sectionIndex: number;
  /** Progress through the active section, 0..1. */
  sectionProgress: number;
  /* -- pointer (one listener for the whole site) ------------------------- */
  pointerX: number;
  pointerY: number;
  /** Pointer offset from viewport centre, -1..1. */
  pointerNX: number;
  pointerNY: number;
  pointerInside: boolean;
  /** True when the pointer is over something clickable. */
  pointerHot: boolean;
}

type FrameCallback = (t: Telemetry) => void;

interface FlightApi {
  activeId: string;
  activeIndex: number;
  booted: boolean;
  markBooted: () => void;
  reducedMotion: boolean;
  /** True for mouse/trackpad. Gates hover-only affordances. */
  pointerFine: boolean;
  goTo: (id: string) => void;
  subscribe: (cb: FrameCallback) => () => void;
  telemetry: RefObject<Telemetry>;
}

const INITIAL: Telemetry = {
  scrollY: 0,
  progress: 0,
  altitude: 0,
  vspeed: 0,
  groundSpeed: 0,
  heading: SECTIONS[0].bearing,
  fps: 60,
  dt: 1 / 60,
  elapsed: 0,
  vw: 0,
  vh: 0,
  mode: "HOLD",
  sectionIndex: 0,
  sectionProgress: 0,
  pointerX: 0,
  pointerY: 0,
  pointerNX: 0,
  pointerNY: 0,
  pointerInside: false,
  pointerHot: false,
};

const FlightContext = createContext<FlightApi | null>(null);

interface Measured {
  id: string;
  top: number;
  height: number;
  bearing: number;
}

export function FlightComputer({ children }: { children: ReactNode }) {
  const telemetry = useRef<Telemetry>({ ...INITIAL });
  const subscribers = useRef<Set<FrameCallback>>(new Set());
  const sections = useRef<Measured[]>([]);
  const autoUntil = useRef(0);
  const fpsSamples = useRef<number[]>([]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [booted, setBooted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pointerFine, setPointerFine] = useState(false);

  /* Raw pointer state, folded into telemetry inside the loop. */
  const pointer = useRef({ x: 0, y: 0, inside: false, hot: false });

  const markBooted = useCallback(() => setBooted(true), []);

  const subscribe = useCallback((cb: FrameCallback) => {
    subscribers.current.add(cb);
    /* Push the current frame immediately so a late subscriber isn't blank. */
    cb(telemetry.current);
    return () => {
      subscribers.current.delete(cb);
    };
  }, []);

  /* -- environment queries ------------------------------------------------ */
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    const sync = () => {
      setReducedMotion(motion.matches);
      setPointerFine(pointer.matches);
    };
    sync();
    motion.addEventListener("change", sync);
    pointer.addEventListener("change", sync);
    return () => {
      motion.removeEventListener("change", sync);
      pointer.removeEventListener("change", sync);
    };
  }, []);

  /* -- pointer: one passive listener, shared by every instrument ---------- */
  useEffect(() => {
    const HOT = "a,button,input,textarea,select,summary,[role='button']";

    const move = (e: PointerEvent) => {
      const p = pointer.current;
      p.x = e.clientX;
      p.y = e.clientY;
      p.inside = true;
      p.hot = e.target instanceof Element ? e.target.closest(HOT) !== null : false;
    };
    const leave = () => {
      pointer.current.inside = false;
      pointer.current.hot = false;
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      document.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, []);

  /* -- geometry cache: measured on resize, never per frame ---------------- */
  useEffect(() => {
    const measure = () => {
      const scrollY = window.scrollY;
      sections.current = SECTIONS.map((s) => {
        const el = document.getElementById(s.id);
        if (!el) return { id: s.id, top: 0, height: 1, bearing: s.bearing };
        const rect = el.getBoundingClientRect();
        return {
          id: s.id,
          top: rect.top + scrollY,
          height: Math.max(1, rect.height),
          bearing: s.bearing,
        };
      });
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    /* Font swap changes layout height, so re-measure once fonts settle. */
    if ("fonts" in document) void document.fonts.ready.then(measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  /* -- the single animation loop ------------------------------------------ */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const started = last;
    let lastScroll = window.scrollY;
    let smoothed = 0;
    let indexNow = -1;

    const tick = (now: number) => {
      const dt = Math.min(0.1, Math.max(0.0005, (now - last) / 1000));
      last = now;

      /* --- reads (no writes above this line) --- */
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const docHeight = document.documentElement.scrollHeight;
      const scrollable = Math.max(1, docHeight - vh);

      const rawVelocity = (scrollY - lastScroll) / dt;
      lastScroll = scrollY;
      smoothed += (Math.abs(rawVelocity) - smoothed) * 0.12;

      const samples = fpsSamples.current;
      samples.push(1 / dt);
      if (samples.length > 40) samples.shift();
      const fps = samples.reduce((a, b) => a + b, 0) / samples.length;

      /* active section from the cached geometry */
      const list = sections.current;
      let idx = 0;
      for (let i = 0; i < list.length; i += 1) {
        if (scrollY + vh * 0.38 >= list[i].top) idx = i;
      }
      const active = list[idx];
      const sectionProgress = active
        ? clamp((scrollY + vh * 0.38 - active.top) / active.height, 0, 1)
        : 0;

      const next = list[idx + 1] ?? active;
      const heading = active
        ? active.bearing + (next.bearing - active.bearing) * sectionProgress
        : 0;

      const mode: FlightMode =
        now < autoUntil.current
          ? "AUTO"
          : smoothed > 12
            ? "MANUAL"
            : "HOLD";

      const t = telemetry.current;
      t.scrollY = scrollY;
      t.progress = clamp(scrollY / scrollable, 0, 1);
      t.altitude = Math.max(0, (scrollable - scrollY) / PX_PER_METRE);
      t.vspeed = -rawVelocity / PX_PER_METRE;
      t.groundSpeed = smoothed / PX_PER_METRE;
      t.heading = (heading + 360) % 360;
      t.fps = fps;
      t.dt = dt;
      t.elapsed = (now - started) / 1000;
      t.vw = vw;
      t.vh = vh;
      t.mode = mode;
      t.sectionIndex = idx;
      t.sectionProgress = sectionProgress;

      const ptr = pointer.current;
      t.pointerX = ptr.x;
      t.pointerY = ptr.y;
      t.pointerNX = vw ? (ptr.x / vw) * 2 - 1 : 0;
      t.pointerNY = vh ? (ptr.y / vh) * 2 - 1 : 0;
      t.pointerInside = ptr.inside;
      t.pointerHot = ptr.hot;

      /* --- writes --- */
      for (const cb of subscribers.current) cb(t);

      if (idx !== indexNow) {
        indexNow = idx;
        setActiveIndex(idx);
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const goTo = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      autoUntil.current = performance.now() + 1100;
      el.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
      /* Keep the URL shareable without pushing a history entry per click. */
      window.history.replaceState(null, "", `#${id}`);
    },
    [],
  );

  const api = useMemo<FlightApi>(
    () => ({
      activeId: SECTIONS[activeIndex]?.id ?? SECTIONS[0].id,
      activeIndex,
      booted,
      markBooted,
      reducedMotion,
      pointerFine,
      goTo,
      subscribe,
      telemetry,
    }),
    [activeIndex, booted, markBooted, reducedMotion, pointerFine, goTo, subscribe],
  );

  return <FlightContext.Provider value={api}>{children}</FlightContext.Provider>;
}

export function useFlight(): FlightApi {
  const ctx = useContext(FlightContext);
  if (!ctx) {
    throw new Error("useFlight must be used inside <FlightComputer>");
  }
  return ctx;
}

/**
 * Subscribe to the frame loop. The callback runs inside the shared rAF, so keep
 * it to DOM writes — never setState in here.
 */
export function useTelemetry(cb: FrameCallback): void {
  const { subscribe } = useFlight();
  const ref = useRef<FrameCallback>(cb);

  /* Keep the latest closure without resubscribing every render. */
  useEffect(() => {
    ref.current = cb;
  }, [cb]);

  useEffect(() => {
    return subscribe((t) => ref.current(t));
  }, [subscribe]);
}

/**
 * Throttled variant for text readouts — digits changing at 60 Hz are unreadable
 * and cost needless DOM writes. Default 10 Hz.
 */
export function useTelemetryThrottled(cb: FrameCallback, hz = 10): void {
  const nextAt = useRef(0);
  const interval = 1 / hz;
  useTelemetry((t) => {
    if (t.elapsed < nextAt.current) return;
    nextAt.current = t.elapsed + interval;
    cb(t);
  });
}
