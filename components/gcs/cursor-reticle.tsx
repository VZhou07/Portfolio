"use client";

import { useEffect, useRef } from "react";
import { clamp } from "@/lib/derive";
import { useFlight, useTelemetry } from "@/lib/flight-computer";

const INTERACTIVE = "a,button,input,textarea,select,summary,[role='button']";

/**
 * Cursor companion: a tracking reticle that lags the pointer and reports its
 * real screen coordinates, turning amber over anything clickable. Rendered only
 * for fine pointers — on touch it would be meaningless, so it is not mounted.
 * The native cursor is never hidden.
 */
export function CursorReticle() {
  const { pointerFine, booted, reducedMotion } = useFlight();

  const root = useRef<HTMLDivElement>(null);
  const coords = useRef<HTMLSpanElement>(null);
  const target = useRef({ x: 0, y: 0, hot: false, inside: false });
  const pos = useRef({ x: 0, y: 0 });
  const nextText = useRef(0);

  useEffect(() => {
    if (!pointerFine) return;

    const move = (e: PointerEvent) => {
      const t = target.current;
      t.x = e.clientX;
      t.y = e.clientY;
      t.inside = true;
      const el = e.target;
      t.hot = el instanceof Element ? el.closest(INTERACTIVE) !== null : false;
    };
    const leave = () => {
      target.current.inside = false;
    };

    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", move, { passive: true });
    document.addEventListener("pointerleave", leave);

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [pointerFine]);

  useTelemetry((t) => {
    const el = root.current;
    if (!el) return;

    const want = target.current;
    const p = pos.current;
    const k = reducedMotion ? 1 : 0.22;
    p.x += (want.x - p.x) * k;
    p.y += (want.y - p.y) * k;

    el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
    el.style.opacity = want.inside && booted ? "1" : "0";
    el.dataset.hot = want.hot ? "true" : "false";

    if (t.elapsed > nextText.current && coords.current) {
      nextText.current = t.elapsed + 0.1;
      coords.current.textContent = `${Math.round(want.x)
        .toString()
        .padStart(4, "0")} ${Math.round(want.y).toString().padStart(4, "0")}`;
    }
    /* keep the reticle inside the viewport on fast exits */
    want.x = clamp(want.x, 0, t.vw);
    want.y = clamp(want.y, 0, t.vh);
  });

  if (!pointerFine) return null;

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-50 opacity-0 transition-opacity duration-200 [&[data-hot='true']_.rt]:bg-signal [&[data-hot='true']_.rt-box]:border-signal [&[data-hot='true']_.rt-txt]:text-signal"
    >
      {/* crosshair with a centre gap so it never sits on top of content */}
      <span className="rt bg-data/60 absolute -left-5 h-px w-3.5" />
      <span className="rt bg-data/60 absolute left-1.5 h-px w-3.5" />
      <span className="rt bg-data/60 absolute -top-5 h-3.5 w-px" />
      <span className="rt bg-data/60 absolute top-1.5 h-3.5 w-px" />
      <span className="rt-box border-data/50 absolute -top-1.5 -left-1.5 h-3 w-3 border" />
      <span className="rt-txt text-data/70 text-micro tnum absolute top-3 left-3 whitespace-nowrap">
        <span ref={coords}>0000 0000</span>
      </span>
    </div>
  );
}
