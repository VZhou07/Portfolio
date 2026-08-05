"use client";

import type { ReactNode } from "react";
import { FlightComputer } from "@/lib/flight-computer";
import { BootSequence } from "./boot-sequence";
import { CursorReticle } from "./cursor-reticle";
import { NavRail } from "./nav-rail";
import { TelemetryStrip } from "./telemetry-strip";

/**
 * Client boundary for the whole deck. Sections stay server-rendered and are
 * passed through as children, so the HTML ships complete for SEO and for anyone
 * without JS — the HUD chrome is what needs the client.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <FlightComputer>
      <BootSequence />
      <TelemetryStrip />
      <NavRail />
      <CursorReticle />
      {children}
    </FlightComputer>
  );
}
