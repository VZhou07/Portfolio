import { SiteShell } from "@/components/gcs/site-shell";
import { Section } from "@/components/gcs/section";
import { Approach } from "@/components/sections/approach";
import { Dossier } from "@/components/sections/dossier";
import { Missions } from "@/components/sections/missions";
import { Preflight } from "@/components/sections/preflight";
import { SECTIONS } from "@/lib/content";

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

        {SECTIONS.slice(4).map((def) => (
          <Section
            key={def.id}
            def={def}
            subtitle={`BEARING ${def.bearing.toString().padStart(3, "0")}°`}
          >
            <p className="text-dim text-data">
              Section under construction — milestone stub.
            </p>
          </Section>
        ))}
      </main>
    </SiteShell>
  );
}
