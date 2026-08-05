"use client";

import { useRef, type ReactNode } from "react";
import { useFlight, useTelemetryThrottled } from "@/lib/flight-computer";

/**
 * Slews the page to a section. Stays a real anchor so it works with keyboard,
 * middle-click and no JS; the handler only upgrades it to a smooth AUTO-mode
 * transit and keeps the URL shareable.
 */
export function JumpButton({
  to,
  children,
  variant = "primary",
}: {
  to: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const { goTo } = useFlight();

  const style =
    variant === "primary"
      ? "bg-signal text-void hover:bg-caution border-signal"
      : "border-rule text-mid hover:border-data hover:text-data";

  return (
    <a
      href={`#${to}`}
      onClick={(e) => {
        e.preventDefault();
        goTo(to);
      }}
      className={`gcs-notch-sm text-micro inline-flex items-center gap-2 border px-4 py-2.5 font-semibold transition-colors ${style}`}
    >
      {children}
    </a>
  );
}

/** Real wall clock: local time plus Zulu, the way a ground station shows it. */
export function LocalClock() {
  const local = useRef<HTMLSpanElement>(null);
  const zulu = useRef<HTMLSpanElement>(null);

  useTelemetryThrottled(() => {
    const now = new Date();
    const hh = (d: Date, utc: boolean) =>
      [
        utc ? d.getUTCHours() : d.getHours(),
        utc ? d.getUTCMinutes() : d.getMinutes(),
        utc ? d.getUTCSeconds() : d.getSeconds(),
      ]
        .map((n) => n.toString().padStart(2, "0"))
        .join(":");

    if (local.current) local.current.textContent = hh(now, false);
    if (zulu.current) zulu.current.textContent = `${hh(now, true)}Z`;
  }, 2);

  return (
    <span className="text-micro tnum text-dim inline-flex items-center gap-3">
      <span>
        LOCAL <span ref={local} className="text-mid">--:--:--</span>
      </span>
      <span aria-hidden="true" className="bg-rule h-3 w-px" />
      <span ref={zulu} className="text-mid">
        --:--:--Z
      </span>
    </span>
  );
}
