"use client";

import type { ReactNode } from "react";
import { FlightComputer } from "@/lib/flight-computer";
import { CursorReticle } from "./cursor-reticle";
import { IntroStage } from "./intro-stage";
import { NavRail } from "./nav-rail";
import { TelemetryStrip } from "./telemetry-strip";

/**
 * Client boundary for the whole deck. Sections stay server-rendered and are
 * passed through as children, so the HTML ships complete for SEO and for anyone
 * without JS — the HUD chrome is what needs the client.
 *
 * Children are wrapped in .gcs-deck: the arrival sequence holds that element
 * back and then punches it in, without touching the fixed HUD chrome.
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <FlightComputer>
      <IntroStage />
      <TelemetryStrip />
      <NavRail />
      <CursorReticle />
      <div className="gcs-deck">{children}</div>
    </FlightComputer>
  );
}
