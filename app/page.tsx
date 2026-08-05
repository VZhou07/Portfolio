import { JumpButton } from "@/components/gcs/controls";
import { SiteShell } from "@/components/gcs/site-shell";
import { Approach } from "@/components/sections/approach";
import { Comms } from "@/components/sections/comms";
import { Dossier } from "@/components/sections/dossier";
import { Instruments } from "@/components/sections/instruments";
import { Missions } from "@/components/sections/missions";
import { Preflight } from "@/components/sections/preflight";
import { Waypoints } from "@/components/sections/waypoints";
import { PROFILE, SECTIONS } from "@/lib/content";
import { FLEET } from "@/lib/derive";

export default function Page() {
  return (
    <SiteShell>
      {/* pt-11 clears the telemetry strip, pb-20 the mobile waypoint bar,
          lg:pl-18 the desktop rail */}
      <main className="gcs-grid pt-11 pb-20 lg:pb-0 lg:pl-18">
        <Preflight />
        <Dossier />
        <Missions />
        <Approach />
        <Waypoints />
        <Instruments />
        <Comms />

        <footer className="px-4 py-10 sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-micro text-signal">END OF LOG</span>
            <span className="text-micro text-dim tnum">
              {SECTIONS.length} SECTIONS · {FLEET.missions} SORTIES ·{" "}
              {FLEET.stackDepth} TOOLS
            </span>
            <span className="text-micro text-dim">
              BUILT BY {PROFILE.name} — NEXT.JS, TAILWIND, NO ANIMATION LIBRARY
            </span>
            <span className="ml-auto">
              <JumpButton to="preflight" variant="ghost">
                RETURN TO PREFLIGHT
              </JumpButton>
            </span>
          </div>
        </footer>
      </main>
    </SiteShell>
  );
}
