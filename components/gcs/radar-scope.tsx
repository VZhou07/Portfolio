"use client";

import { useCallback, useRef, useState } from "react";
import { CONTACTS, clamp, statusStyle } from "@/lib/derive";
import { useFlight, useTelemetry, useTelemetryThrottled } from "@/lib/flight-computer";

/** Sweep beamwidth in degrees — how wide a contact "paints". */
const BEAM = 24;

/**
 * Mission scope. The contacts are the real mission list:
 *   bearing = engineering domain (fixed sectors)
 *   range   = position in the mission log, newest closest in
 * The sweep is not on a fixed loop — it accelerates with your scroll speed, and
 * contacts brighten as the beam crosses them. Each contact is a real button that
 * slews the page to that mission.
 */
export function RadarScope() {
  const { goTo, reducedMotion } = useFlight();

  const sweep = useRef<SVGGElement>(null);
  const dots = useRef<(HTMLButtonElement | null)[]>([]);
  const rate = useRef<HTMLSpanElement>(null);
  const angle = useRef(0);
  const [held, setHeld] = useState<number | null>(null);

  useTelemetry((t) => {
    /* sweep rate responds to how fast you are moving through the document */
    const degPerSec = reducedMotion ? 0 : clamp(38 + t.groundSpeed * 22, 38, 260);
    angle.current = (angle.current + degPerSec * t.dt) % 360;
    const a = angle.current;

    sweep.current?.setAttribute("transform", `rotate(${a.toFixed(2)} 100 100)`);

    for (let i = 0; i < CONTACTS.length; i += 1) {
      const el = dots.current[i];
      if (!el) continue;
      /* shortest angular distance from the beam to this contact, 0 = painted */
      const off = Math.abs(((a - CONTACTS[i].bearing + 540) % 360) - 180);
      const paint = held === i ? 1 : clamp(1 - off / BEAM, 0, 1);
      el.style.opacity = (0.4 + paint * 0.6).toFixed(2);
      el.style.setProperty("--paint", paint.toFixed(2));
    }
  });

  useTelemetryThrottled((t) => {
    if (rate.current) {
      const rpm = reducedMotion ? 0 : clamp(38 + t.groundSpeed * 22, 38, 260) / 6;
      rate.current.textContent = rpm.toFixed(1);
    }
  }, 6);

  const bind = useCallback(
    (i: number) => ({
      onPointerEnter: () => setHeld(i),
      onPointerLeave: () => setHeld((h) => (h === i ? null : h)),
      onFocus: () => setHeld(i),
      onBlur: () => setHeld((h) => (h === i ? null : h)),
    }),
    [],
  );

  return (
    <div>
      <div className="relative aspect-square w-full">
        <svg
          viewBox="0 0 200 200"
          aria-hidden="true"
          className="absolute inset-0 h-full w-full"
        >
          {/* range rings */}
          {[30, 58, 86].map((r) => (
            <circle
              key={r}
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="#1c2f36"
              strokeWidth="1"
            />
          ))}
          <circle cx="100" cy="100" r="92" fill="none" stroke="#2b4a54" strokeWidth="1" />

          {/* bearing graticule */}
          {Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => (
            <line
              key={deg}
              x1="100"
              y1="8"
              x2="100"
              y2={deg % 45 === 0 ? "16" : "12"}
              stroke="#1c2f36"
              strokeWidth="1"
              transform={`rotate(${deg} 100 100)`}
            />
          ))}
          <line x1="8" y1="100" x2="192" y2="100" stroke="#16272e" strokeWidth="1" />
          <line x1="100" y1="8" x2="100" y2="192" stroke="#16272e" strokeWidth="1" />

          {/* sweep: leading edge plus a short decaying tail */}
          <g ref={sweep}>
            <line x1="100" y1="100" x2="100" y2="10" stroke="#ffb44a" strokeWidth="1.4" />
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="14"
              stroke="#ffb44a"
              strokeWidth="1"
              opacity="0.45"
              transform="rotate(-7 100 100)"
            />
            <line
              x1="100"
              y1="100"
              x2="100"
              y2="22"
              stroke="#ffb44a"
              strokeWidth="1"
              opacity="0.18"
              transform="rotate(-15 100 100)"
            />
          </g>

          <circle cx="100" cy="100" r="2" fill="#ffb44a" />
        </svg>

        {/* cardinal labels */}
        <span className="text-micro text-dim absolute top-0 left-1/2 -translate-x-1/2">
          N
        </span>
        <span className="text-micro text-dim absolute top-1/2 right-0 -translate-y-1/2">
          E
        </span>
        <span className="text-micro text-dim absolute bottom-0 left-1/2 -translate-x-1/2">
          S
        </span>
        <span className="text-micro text-dim absolute top-1/2 left-0 -translate-y-1/2">
          W
        </span>

        {/* real, focusable contacts layered over the scope */}
        {CONTACTS.map((c, i) => {
          const rad = (c.bearing * Math.PI) / 180;
          const left = 50 + Math.sin(rad) * c.range * 46;
          const top = 50 - Math.cos(rad) * c.range * 46;
          const tone = statusStyle(c.mission.status);

          return (
            <button
              key={c.mission.id}
              ref={(el) => {
                dots.current[i] = el;
              }}
              type="button"
              onClick={() => goTo(c.mission.id)}
              {...bind(i)}
              style={{ left: `${left}%`, top: `${top}%` }}
              className="group absolute -translate-x-1/2 -translate-y-1/2"
              aria-label={`Contact ${c.mission.id.toUpperCase()}, ${c.mission.name}, ${c.mission.status}. Slew to this mission.`}
            >
              <span
                aria-hidden="true"
                className={`block h-2 w-2 rotate-45 ${tone.dot} transition-transform duration-150 group-hover:scale-150 group-focus-visible:scale-150`}
              />
              <span
                aria-hidden="true"
                className="text-micro text-mid bg-void/85 group-hover:border-signal group-hover:text-signal pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 border border-transparent px-1 whitespace-nowrap opacity-[var(--paint,0)] group-hover:opacity-100 group-focus-visible:opacity-100"
              >
                {c.mission.id.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>

      <dl className="text-micro mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-dim">CONTACTS</dt>
          <dd className="tnum text-signal">{CONTACTS.length}</dd>
        </div>
        <div className="flex items-baseline justify-end gap-1.5">
          <dt className="text-dim">SWEEP</dt>
          <dd className="tnum text-data">
            <span ref={rate}>6.3</span> RPM
          </dd>
        </div>
        <p className="text-dim/80 col-span-2 mt-1 leading-relaxed">
          BEARING = DOMAIN · RANGE = LOG POSITION
        </p>
      </dl>
    </div>
  );
}
