"use client";

import { useRef } from "react";
import { useFlight, useTelemetry } from "@/lib/flight-computer";

/**
 * Cursor companion: a tracking reticle that lags the pointer and reports its
 * real screen coordinates, turning amber over anything clickable. Reads the
 * shared pointer telemetry, so it adds no listeners of its own. Mounted only for
 * fine pointers — on touch it would be meaningless. The native cursor is never
 * hidden.
 */
export function CursorReticle() {
  const { pointerFine, booted, reducedMotion } = useFlight();

  const root = useRef<HTMLDivElement>(null);
  const coords = useRef<HTMLSpanElement>(null);
  const pos = useRef({ x: 0, y: 0 });
  const nextText = useRef(0);

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

    if (t.elapsed > nextText.current && coords.current) {
      nextText.current = t.elapsed + 0.1;
      coords.current.textContent = `${Math.round(t.pointerX)
        .toString()
        .padStart(4, "0")} ${Math.round(t.pointerY).toString().padStart(4, "0")}`;
    }
  });

  if (!pointerFine) return null;

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-50 opacity-0 transition-opacity duration-200 [&[data-hot='true']_.rt-box]:border-signal [&[data-hot='true']_.rt-txt]:text-signal [&[data-hot='true']_.rt]:bg-signal"
    >
      {/* crosshair with a centre gap so it never covers what you are pointing at */}
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
