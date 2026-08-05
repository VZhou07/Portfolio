"use client";

import { useEffect, useRef } from "react";
import { MicroLabel } from "@/components/gcs/primitives";
import { Section } from "@/components/gcs/section";
import { SECTIONS, WAYPOINTS } from "@/lib/content";
import { clamp } from "@/lib/derive";
import { useTelemetry } from "@/lib/flight-computer";

const DEF = SECTIONS[4];

/**
 * Flight-log route. The connector is drawn by scroll position — the amber
 * progress line is a scaleY transform tied to how far through the section you
 * are, and each waypoint latches to "REACHED" the moment the line passes its
 * measured position. Nothing here runs on a timer.
 */
export function Waypoints() {
  const list = useRef<HTMLOListElement>(null);
  const markers = useRef<(HTMLLIElement | null)[]>([]);
  const drawn = useRef<HTMLSpanElement>(null);
  const fractions = useRef<number[]>([]);

  /* measure where each waypoint sits along the route */
  useEffect(() => {
    const ol = list.current;
    if (!ol) return;

    const measure = () => {
      const total = ol.offsetHeight || 1;
      fractions.current = markers.current.map((el) =>
        el ? (el.offsetTop + 18) / total : 1,
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ol);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useTelemetry((t) => {
    if (t.sectionIndex < 4) {
      /* not there yet — keep the route undrawn */
      if (drawn.current) drawn.current.style.transform = "scaleY(0)";
      return;
    }

    /* the route draws across the first 70% of the section */
    const p = t.sectionIndex > 4 ? 1 : clamp(t.sectionProgress / 0.7, 0, 1);
    if (drawn.current) drawn.current.style.transform = `scaleY(${p.toFixed(4)})`;

    for (let i = 0; i < markers.current.length; i += 1) {
      const el = markers.current[i];
      if (!el) continue;
      const reached = p >= (fractions.current[i] ?? 1) ? "true" : "false";
      if (el.dataset.reached !== reached) el.dataset.reached = reached;
    }
  });

  return (
    <Section
      def={DEF}
      subtitle="THE ROUTE SO FAR — DRAWN AS YOU SCROLL"
      aside={
        <span className="text-micro text-dim">
          {WAYPOINTS.length} LEGS · NEWEST FIRST
        </span>
      }
    >
      <ol ref={list} className="relative">
        {/* route: static rail plus the amber portion the scroll has drawn */}
        <span
          aria-hidden="true"
          className="bg-rule absolute top-2 bottom-2 left-[13px] w-px sm:left-[17px]"
        />
        <span
          aria-hidden="true"
          className="absolute top-2 bottom-2 left-[13px] w-px overflow-hidden sm:left-[17px]"
        >
          <span
            ref={drawn}
            className="bg-signal block h-full w-full origin-top"
            style={{ transform: "scaleY(0)" }}
          />
        </span>

        {WAYPOINTS.map((wp, i) => (
          <li
            key={`${wp.org}-${i}`}
            ref={(el) => {
              markers.current[i] = el;
            }}
            data-reached="false"
            className="group relative pb-8 pl-10 last:pb-0 sm:pl-14"
          >
            {/* waypoint marker */}
            <span
              aria-hidden="true"
              className="border-rule-hi bg-void group-data-[reached=true]:border-signal absolute top-1 left-0 flex h-7 w-7 items-center justify-center border transition-colors sm:h-9 sm:w-9"
            >
              <span className="bg-rule-hi group-data-[reached=true]:bg-signal h-2 w-2 rotate-45 transition-colors" />
            </span>

            <div className="border-rule bg-panel/60 gcs-notch-sm group-data-[reached=true]:border-rule-hi border p-4 transition-colors sm:p-5">
              <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-micro text-signal tnum">
                  WP-{(WAYPOINTS.length - i).toString().padStart(2, "0")}
                </span>
                <span className="text-micro text-dim group-data-[reached=true]:text-nominal">
                  <span className="group-data-[reached=true]:hidden">AHEAD</span>
                  <span className="hidden group-data-[reached=true]:inline">
                    REACHED
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="bg-rule hidden h-3 w-px sm:block"
                />
                <span className="text-micro text-dim tnum">{wp.dates}</span>
                <span className="text-micro text-dim ml-auto">{wp.kind}</span>
              </div>

              <h3 className="font-display text-h3 text-ink tracking-tight">
                {wp.role}
              </h3>
              <p className="text-data text-signal/90 mb-3">
                {wp.org} <span className="text-dim">· {wp.location}</span>
              </p>

              <ul className="mb-3 space-y-1.5">
                {wp.details.map((d, j) => (
                  <li key={j} className="text-mid text-data flex gap-2">
                    <span aria-hidden="true" className="text-dim mt-px shrink-0">
                      ▸
                    </span>
                    {d}
                  </li>
                ))}
              </ul>

              {wp.tags.length > 0 && (
                <>
                  <MicroLabel className="mb-1.5">CARRIED</MicroLabel>
                  <ul className="flex flex-wrap gap-1.5">
                    {wp.tags.map((tag, k) => (
                      <li
                        key={`${tag}-${k}`}
                        className="border-rule text-micro text-dim border px-2 py-0.5"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}
