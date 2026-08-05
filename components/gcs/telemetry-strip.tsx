"use client";

import { useEffect, useRef } from "react";
import { PROFILE, SECTIONS } from "@/lib/content";
import { pad } from "@/lib/derive";
import { useFlight, useTelemetry, useTelemetryThrottled } from "@/lib/flight-computer";

/* navigator.connection is not in the DOM lib types yet. */
interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
}
interface BatteryStatus {
  level: number;
  charging: boolean;
}

const MODE_CLASS: Record<string, string> = {
  AUTO: "text-signal",
  MANUAL: "text-data",
  HOLD: "text-dim",
};

/**
 * Top HUD strip. Every field is measured, not invented:
 * ALT/VS/GS come from scroll kinematics, HDG from the active section bearing,
 * FPS from the frame loop, LINK from the Network Information API and PWR from
 * the Battery API when the browser exposes them.
 */
export function TelemetryStrip() {
  const { activeIndex, reducedMotion } = useFlight();

  const alt = useRef<HTMLSpanElement>(null);
  const vs = useRef<HTMLSpanElement>(null);
  const gs = useRef<HTMLSpanElement>(null);
  const hdg = useRef<HTMLSpanElement>(null);
  const fps = useRef<HTMLSpanElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const mode = useRef<HTMLSpanElement>(null);
  const link = useRef<HTMLSpanElement>(null);
  const power = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);

  /* 10 Hz for digits — fast enough to feel live, slow enough to read. */
  useTelemetryThrottled((t) => {
    if (alt.current) alt.current.textContent = pad(t.altitude, 3, 1);
    if (vs.current) {
      vs.current.textContent =
        (t.vspeed >= 0 ? "+" : "") + t.vspeed.toFixed(1).padStart(4, "0");
    }
    if (gs.current) gs.current.textContent = pad(t.groundSpeed, 2, 1);
    if (hdg.current) hdg.current.textContent = pad(t.heading, 3, 0);
    if (fps.current) fps.current.textContent = Math.round(t.fps).toString();
    if (clock.current) {
      const total = Math.floor(t.elapsed);
      const m = Math.floor(total / 60)
        .toString()
        .padStart(2, "0");
      const s = (total % 60).toString().padStart(2, "0");
      clock.current.textContent = `${m}:${s}`;
    }
    if (mode.current && mode.current.textContent !== t.mode) {
      mode.current.textContent = t.mode;
      mode.current.className = `tnum ${MODE_CLASS[t.mode]}`;
    }
  }, 10);

  /* Progress bar gets every frame — it is a transform, so it is nearly free. */
  useTelemetry((t) => {
    if (bar.current) {
      bar.current.style.transform = `scaleX(${t.progress.toFixed(4)})`;
    }
  });

  /* One-off environment probes. Written to the DOM so the strip never re-renders. */
  useEffect(() => {
    const conn = (
      navigator as Navigator & { connection?: NetworkInformation }
    ).connection;
    if (link.current) {
      link.current.textContent = conn?.effectiveType?.toUpperCase() ?? "DIRECT";
    }

    const getBattery = (
      navigator as Navigator & {
        getBattery?: () => Promise<BatteryStatus>;
      }
    ).getBattery;

    if (typeof getBattery === "function") {
      void getBattery
        .call(navigator)
        .then((b) => {
          if (power.current) {
            power.current.textContent = `${Math.round(b.level * 100)}%${b.charging ? "+" : ""}`;
          }
        })
        .catch(() => {
          if (power.current) power.current.textContent = "EXT";
        });
    } else if (power.current) {
      power.current.textContent = "EXT";
    }
  }, []);

  const section = SECTIONS[activeIndex] ?? SECTIONS[0];

  return (
    <div className="border-rule bg-void/90 fixed inset-x-0 top-0 z-40 border-b backdrop-blur-sm">
      <div className="flex h-11 items-center gap-3 px-3 sm:gap-5 sm:px-4">
        {/* identity */}
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span aria-hidden="true" className="text-signal text-data leading-none">
            ◈
          </span>
          <span className="font-display text-micro text-ink hidden sm:inline">
            MISSION CONTROL
          </span>
          <span className="font-display text-micro text-ink sm:hidden">MC</span>
        </div>

        <span aria-hidden="true" className="bg-rule hidden h-5 w-px sm:block" />

        {/* live flight data */}
        <dl
          className="text-micro flex min-w-0 flex-1 items-center gap-3 overflow-hidden sm:gap-5"
          aria-label="Live page telemetry"
        >
          <Field label="ALT" unit="m">
            <span ref={alt} className="tnum text-data">
              000.0
            </span>
          </Field>
          <Field label="V/S" unit="m/s" hideOnMobile>
            <span ref={vs} className="tnum text-data">
              +00.0
            </span>
          </Field>
          <Field label="GS" unit="m/s" hideOnMobile>
            <span ref={gs} className="tnum text-data">
              00.0
            </span>
          </Field>
          <Field label="HDG" unit="°">
            <span ref={hdg} className="tnum text-signal">
              000
            </span>
          </Field>
          <Field label="WP">
            <span className="tnum text-signal">
              {section.code}
              <span className="text-dim">/{SECTIONS.length}</span>
            </span>
          </Field>
        </dl>

        {/* system data */}
        <dl className="text-micro hidden shrink-0 items-center gap-5 lg:flex">
          <Field label="LINK">
            <span ref={link} className="tnum text-mid">
              —
            </span>
          </Field>
          <Field label="PWR">
            <span ref={power} className="tnum text-mid">
              —
            </span>
          </Field>
          <Field label="FPS">
            <span ref={fps} className="tnum text-mid">
              60
            </span>
          </Field>
          <Field label="T+">
            <span ref={clock} className="tnum text-mid">
              00:00
            </span>
          </Field>
          <Field label="MODE">
            <span ref={mode} className="tnum text-dim">
              HOLD
            </span>
          </Field>
        </dl>

        <span className="text-micro text-dim hidden shrink-0 xl:inline">
          {PROFILE.callsign}
        </span>
      </div>

      {/* document progress — real scroll position, not a loading fake */}
      <div className="bg-rule/60 h-px w-full">
        <div
          ref={bar}
          className={`bg-signal h-px w-full origin-left ${
            reducedMotion ? "" : "transition-none"
          }`}
          style={{ transform: "scaleX(0)" }}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  unit,
  hideOnMobile = false,
  children,
}: {
  label: string;
  unit?: string;
  hideOnMobile?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex shrink-0 items-baseline gap-1.5 ${hideOnMobile ? "hidden md:flex" : ""}`}
    >
      <dt className="text-dim">{label}</dt>
      <dd className="flex items-baseline gap-0.5">
        {children}
        {unit && <span className="text-dim">{unit}</span>}
      </dd>
    </div>
  );
}
