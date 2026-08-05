"use client";

import { useRef } from "react";
import { clamp, pad } from "@/lib/derive";
import { useFlight, useTelemetry, useTelemetryThrottled } from "@/lib/flight-computer";

/**
 * Artificial horizon. Roll and pitch are real inputs, not a loop:
 *   roll  = pointer offset from centre + scroll velocity
 *   pitch = pointer height + descent rate
 * On touch devices there is no pointer, so scroll alone flies it.
 */
export function AttitudeIndicator() {
  const { reducedMotion } = useFlight();

  const horizon = useRef<SVGGElement>(null);
  const rollPtr = useRef<SVGGElement>(null);
  const hdg = useRef<HTMLSpanElement>(null);
  const alt = useRef<HTMLSpanElement>(null);
  const vsi = useRef<SVGRectElement>(null);
  const state = useRef({ roll: 0, pitch: 0 });

  useTelemetry((t) => {
    const s = state.current;

    const pointerRoll = t.pointerInside ? t.pointerNX * 16 : 0;
    const pointerPitch = t.pointerInside ? -t.pointerNY * 9 : 0;
    const scrollRoll = clamp(-t.vspeed * 0.35, -14, 14);
    const scrollPitch = clamp(t.vspeed * 0.5, -12, 12);

    const wantRoll = clamp(pointerRoll + scrollRoll, -26, 26);
    const wantPitch = clamp(pointerPitch + scrollPitch, -16, 16);

    const k = reducedMotion ? 1 : 0.09;
    s.roll += (wantRoll - s.roll) * k;
    s.pitch += (wantPitch - s.pitch) * k;

    /* pitch is 2.2 units of the 100-unit viewBox per degree */
    horizon.current?.setAttribute(
      "transform",
      `rotate(${s.roll.toFixed(2)} 50 50) translate(0 ${(s.pitch * 1.15).toFixed(2)})`,
    );
    rollPtr.current?.setAttribute("transform", `rotate(${s.roll.toFixed(2)} 50 50)`);

    if (vsi.current) {
      /* vertical speed bar: grows down when descending the page */
      const h = clamp(Math.abs(t.vspeed) * 1.4, 0, 26);
      vsi.current.setAttribute("height", h.toFixed(1));
      vsi.current.setAttribute("y", (t.vspeed < 0 ? 50 : 50 - h).toFixed(1));
    }
  });

  useTelemetryThrottled((t) => {
    if (hdg.current) hdg.current.textContent = pad(t.heading, 3, 0);
    if (alt.current) alt.current.textContent = pad(t.altitude, 3, 0);
  }, 8);

  return (
    <div className="relative">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Artificial horizon reacting to pointer position and scroll rate"
        className="block w-full"
      >
        <defs>
          <clipPath id="adi-clip">
            <circle cx="50" cy="50" r="37" />
          </clipPath>
        </defs>

        <g clipPath="url(#adi-clip)">
          {/* the moving world */}
          <g ref={horizon}>
            <rect x="-60" y="-70" width="220" height="120" fill="#0c1c24" />
            <rect x="-60" y="50" width="220" height="140" fill="#1b1408" />
            <line x1="-60" y1="50" x2="160" y2="50" stroke="#e4f3f7" strokeWidth="0.7" />
            {/* pitch ladder — labelled every 10° */}
            {[-20, -10, 10, 20].map((deg) => (
              <g key={deg} stroke="#a9c2c8" strokeWidth="0.45">
                <line x1="38" y1={50 - deg * 1.15} x2="62" y2={50 - deg * 1.15} />
              </g>
            ))}
            {[-5, 5, 15, -15].map((deg) => (
              <line
                key={deg}
                x1="44"
                y1={50 - deg * 1.15}
                x2="56"
                y2={50 - deg * 1.15}
                stroke="#7e979e"
                strokeWidth="0.35"
              />
            ))}
          </g>
        </g>

        {/* fixed scope furniture */}
        <circle cx="50" cy="50" r="37" fill="none" stroke="#1c2f36" strokeWidth="1" />
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
          <line
            key={deg}
            x1="50"
            y1="9"
            x2="50"
            y2={deg % 90 === 0 ? "13.5" : "11.5"}
            stroke="#2b4a54"
            strokeWidth="0.7"
            transform={`rotate(${deg} 50 50)`}
          />
        ))}

        {/* roll pointer */}
        <g ref={rollPtr}>
          <path d="M50 12.5 L47.6 8.4 H52.4 Z" fill="#56dcff" />
        </g>

        {/* aircraft reference — always level, amber */}
        <g stroke="#ffb44a" strokeWidth="1.4" fill="none">
          <line x1="34" y1="50" x2="44" y2="50" />
          <line x1="56" y1="50" x2="66" y2="50" />
          <circle cx="50" cy="50" r="1.5" fill="#ffb44a" stroke="none" />
        </g>

        {/* vertical speed bar on the right edge */}
        <rect x="88" y="24" width="3" height="52" fill="#0d1418" stroke="#1c2f36" strokeWidth="0.5" />
        <rect ref={vsi} x="88" y="50" width="3" height="0" fill="#56dcff" />
        <line x1="86" y1="50" x2="93" y2="50" stroke="#2b4a54" strokeWidth="0.5" />
      </svg>

      {/* digital cross-check under the dial */}
      <dl className="text-micro mt-2 grid grid-cols-2 gap-2">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-dim">HDG</dt>
          <dd className="tnum text-signal">
            <span ref={hdg}>000</span>°
          </dd>
        </div>
        <div className="flex items-baseline justify-end gap-1.5">
          <dt className="text-dim">ALT</dt>
          <dd className="tnum text-data">
            <span ref={alt}>000</span> m
          </dd>
        </div>
      </dl>
    </div>
  );
}
