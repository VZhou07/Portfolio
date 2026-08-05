import { SiteShell } from "@/components/gcs/site-shell";
import { SectionHeading } from "@/components/gcs/primitives";
import { SECTIONS } from "@/lib/content";

export default function Page() {
  return (
    <SiteShell>
      {/* pt-11 clears the telemetry strip, pb-20 the mobile waypoint bar,
          lg:pl-18 the desktop rail */}
      <main className="gcs-grid pt-11 pb-20 lg:pb-0 lg:pl-18">
        {SECTIONS.map((s) => (
          <section
            key={s.id}
            id={s.id}
            aria-labelledby={`${s.id}-heading`}
            className="border-rule mx-auto max-w-7xl scroll-mt-16 border-b px-4 py-24 sm:px-6"
          >
            <div id={`${s.id}-heading`}>
              <SectionHeading
                code={`${s.code} / ${SECTIONS.length}`}
                title={s.label}
                subtitle={`BEARING ${s.bearing.toString().padStart(3, "0")}°`}
              />
            </div>
            <p className="text-dim text-data">
              Section under construction — milestone stub.
            </p>
          </section>
        ))}
      </main>
    </SiteShell>
  );
}
