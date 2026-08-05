"use client";

import { useCallback, useEffect, useRef } from "react";
import { SECTIONS } from "@/lib/content";
import { clamp, lerp } from "@/lib/derive";
import { useFlight, useTelemetry } from "@/lib/flight-computer";

/* Trail sample count. Short enough to read as a flight path, not a scribble. */
const TRAIL = 22;

interface Centre {
  x: number;
  y: number;
}

/**
 * Waypoint nav. One element, two layouts: a vertical rail on large screens and
 * a thumb-reachable bottom bar on touch. The drone is the active-section
 * indicator — its position is interpolated from real scroll progress between
 * waypoints, so it flies continuously as you scroll and lands on the waypoint
 * you jump to. Everything is a real anchor, so it works without JS and with a
 * keyboard.
 */
export function NavRail() {
  const { activeIndex, goTo, booted, reducedMotion } = useFlight();

  const list = useRef<HTMLUListElement>(null);
  const items = useRef<(HTMLAnchorElement | null)[]>([]);
  const centres = useRef<Centre[]>([]);
  const drone = useRef<SVGGElement>(null);
  const trail = useRef<SVGPolylineElement>(null);
  const route = useRef<SVGLineElement>(null);
  const progress = useRef<SVGLineElement>(null);

  /* live position + smoothed trail history, kept out of React */
  const pos = useRef<Centre>({ x: 0, y: 0 });
  const history = useRef<Centre[]>([]);
  const axis = useRef<"x" | "y">("y");
  const ready = useRef(false);

  /* -- measure waypoint centres; layout-agnostic so one component covers both
        orientations -------------------------------------------------------- */
  useEffect(() => {
    const ul = list.current;
    if (!ul) return;

    const measure = () => {
      /* Measure against the list's own box. offsetLeft/offsetTop cannot be used
         here: each <li> is positioned, so it becomes the offsetParent and every
         waypoint would report the same local centre. */
      const base = ul.getBoundingClientRect();
      const found: Centre[] = [];
      for (const el of items.current) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        found.push({
          x: r.left - base.left + r.width / 2,
          y: r.top - base.top + r.height / 2,
        });
      }
      if (found.length < 2) return;

      centres.current = found;

      const xs = found.map((c) => c.x);
      const ys = found.map((c) => c.y);
      const spreadX = Math.max(...xs) - Math.min(...xs);
      const spreadY = Math.max(...ys) - Math.min(...ys);
      axis.current = spreadY >= spreadX ? "y" : "x";

      const first = found[0];
      const last = found[found.length - 1];
      route.current?.setAttribute("x1", String(first.x));
      route.current?.setAttribute("y1", String(first.y));
      route.current?.setAttribute("x2", String(last.x));
      route.current?.setAttribute("y2", String(last.y));
      progress.current?.setAttribute("x1", String(first.x));
      progress.current?.setAttribute("y1", String(first.y));

      if (!ready.current) {
        ready.current = true;
        pos.current = { ...found[0] };
        history.current = [];
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ul);
    window.addEventListener("resize", measure);
    if ("fonts" in document) void document.fonts.ready.then(measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  /* -- fly the drone: target interpolated between waypoints by scroll ------ */
  useTelemetry((t) => {
    const marks = centres.current;
    const g = drone.current;
    if (!g || marks.length < 2) return;

    const i = clamp(t.sectionIndex, 0, marks.length - 1);
    const next = marks[Math.min(i + 1, marks.length - 1)];
    const here = marks[i];
    const tx = lerp(here.x, next.x, t.sectionProgress);
    const ty = lerp(here.y, next.y, t.sectionProgress);

    const p = pos.current;
    const k = reducedMotion ? 1 : 0.14;
    const dx = (tx - p.x) * k;
    const dy = (ty - p.y) * k;
    p.x += dx;
    p.y += dy;

    const travel = Math.hypot(dx, dy);
    /* Bank into the direction of travel — the tilt is the velocity, not decor. */
    const bank = axis.current === "y" ? clamp(dy * 2.6, -18, 18) : clamp(dx * 2.6, -18, 18);

    g.setAttribute(
      "transform",
      `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)}) rotate(${bank.toFixed(1)})`,
    );
    g.style.opacity = booted ? "1" : "0";

    /* rotor wash brightens with speed */
    const wash = clamp(0.25 + travel * 0.35, 0.25, 1);
    g.style.setProperty("--wash", wash.toFixed(2));

    /* flight-path trail */
    if (!reducedMotion) {
      const h = history.current;
      const lastPoint = h[h.length - 1];
      if (!lastPoint || Math.hypot(lastPoint.x - p.x, lastPoint.y - p.y) > 1.2) {
        h.push({ x: p.x, y: p.y });
        if (h.length > TRAIL) h.shift();
        trail.current?.setAttribute(
          "points",
          h.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" "),
        );
      }
    }

    progress.current?.setAttribute("x2", String(p.x));
    progress.current?.setAttribute("y2", String(p.y));
  });

  /* -- keyboard slew: 1..7 jumps to a waypoint ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      ) {
        return;
      }
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > SECTIONS.length) return;
      e.preventDefault();
      goTo(SECTIONS[n - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  const jump = useCallback(
    (id: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      goTo(id);
    },
    [goTo],
  );

  const active = SECTIONS[activeIndex] ?? SECTIONS[0];

  return (
    <nav
      aria-label="Mission waypoints"
      className={`gcs-chrome-gate bg-void/95 border-rule fixed z-40 border-t backdrop-blur-sm transition-opacity duration-500 lg:inset-x-auto lg:inset-y-0 lg:left-0 lg:h-auto lg:w-18 lg:border-t-0 lg:border-r ${
        booted ? "opacity-100" : "opacity-0"
      } inset-x-0 bottom-0`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* active label, mobile only — 7 full labels will not fit a phone bar */}
      <span
        aria-hidden="true"
        className="bg-void/95 border-rule text-micro text-signal absolute -top-7 left-1/2 -translate-x-1/2 border px-2 py-1 lg:hidden"
      >
        {active.code} {active.label}
      </span>

      <ul
        ref={list}
        className="relative flex h-14 items-stretch justify-between px-1 lg:h-auto lg:flex-col lg:items-center lg:justify-center lg:gap-2 lg:px-0 lg:py-6"
      >
        {/* route + trail overlay, drawn from measured waypoint centres */}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          <line
            ref={route}
            stroke="var(--color-rule-hi)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
          <polyline
            ref={trail}
            fill="none"
            stroke="var(--color-data)"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.35"
          />
          <line
            ref={progress}
            stroke="var(--color-signal)"
            strokeWidth="1"
            opacity="0.5"
          />
          <g ref={drone} style={{ opacity: 0 }}>
            <Quadcopter />
          </g>
        </svg>

        {SECTIONS.map((s, i) => {
          const isActive = i === activeIndex;
          return (
            <li key={s.id} className="relative z-10 flex flex-1 lg:flex-none">
              <a
                ref={(el) => {
                  items.current[i] = el;
                }}
                href={`#${s.id}`}
                onClick={jump(s.id)}
                aria-current={isActive ? "location" : undefined}
                data-active={isActive}
                className="group text-micro tnum relative flex flex-1 flex-col items-center justify-center gap-1 lg:h-11 lg:w-18"
                title={`${s.code} ${s.label}`}
              >
                <span
                  className={`transition-colors ${
                    isActive ? "text-signal" : "text-dim group-hover:text-mid"
                  }`}
                >
                  {s.code}
                </span>
                {/* waypoint diamond */}
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rotate-45 transition-colors ${
                    isActive
                      ? "bg-signal"
                      : "bg-rule-hi group-hover:bg-mid"
                  }`}
                />
                <span className="sr-only">{s.label}</span>
                {/* desktop hover/focus label */}
                <span
                  aria-hidden="true"
                  className="bg-panel border-rule text-mid pointer-events-none absolute left-full ml-2 hidden whitespace-nowrap border px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 lg:block"
                >
                  {s.label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>

      <span className="text-micro text-dim absolute bottom-2 left-1/2 hidden -translate-x-1/2 lg:block">
        1–7
      </span>
    </nav>
  );
}

/** Top-down quadcopter, 26px. Rotor wash opacity is driven per frame. */
function Quadcopter() {
  return (
    <g transform="translate(-13 -13)">
      {/* rotor wash */}
      <g style={{ opacity: "var(--wash, 0.3)" }} stroke="var(--color-data)" fill="none">
        <circle cx="6" cy="6" r="5" strokeWidth="1" />
        <circle cx="20" cy="6" r="5" strokeWidth="1" />
        <circle cx="6" cy="20" r="5" strokeWidth="1" />
        <circle cx="20" cy="20" r="5" strokeWidth="1" />
      </g>
      {/* arms */}
      <g stroke="var(--color-mid)" strokeWidth="1.6" strokeLinecap="round">
        <line x1="9" y1="9" x2="17" y2="17" />
        <line x1="17" y1="9" x2="9" y2="17" />
      </g>
      {/* body */}
      <rect
        x="10"
        y="9.5"
        width="6"
        height="7"
        fill="var(--color-panel-hi)"
        stroke="var(--color-ink)"
        strokeWidth="1.2"
      />
      {/* nose marker: which way is forward */}
      <path d="M13 7.4 L15.1 10 H10.9 Z" fill="var(--color-signal)" />
      {/* payload camera */}
      <circle cx="13" cy="14.4" r="1.2" fill="var(--color-data)" />
    </g>
  );
}
