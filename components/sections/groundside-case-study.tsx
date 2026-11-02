import { LinkChip, MicroLabel } from "@/components/gcs/primitives";
import { GROUNDSIDE_FLOW, GROUNDSIDE_NOTES } from "@/lib/groundside";

export function GroundsideCaseStudy() {
  return (
    <section
      id="groundside-systems"
      aria-labelledby="groundside-title"
      className="border-rule mt-5 scroll-mt-20 border-t pt-5"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MicroLabel>3DS · GROUNDSIDE SYSTEMS</MicroLabel>
        <span className="text-micro text-caution border-caution/40 border px-2 py-1">
          IN DEVELOPMENT
        </span>
      </div>
      <h4 id="groundside-title" className="text-h3 text-ink mb-3">
        From a survey boundary to usable fleet coverage
      </h4>
      <p className="text-data text-mid mb-4 max-w-4xl">
        I lead the groundside architecture for a coordinated drone fleet, owning
        the MVP scope, component boundaries and algorithm tradeoffs across coverage
        planning, task assignment, fleet state and image reconstruction. I’m
        sequencing development around a shared 2D orthomosaic, with simulation
        to validate integration before fleet deployment and 3D reconstruction later.
      </p>

      <ol aria-label="Groundside architecture and responsibility boundaries" className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {GROUNDSIDE_FLOW.map((step, i) => (
          <li key={step.title} className="border-rule bg-void/50 border p-3">
            <span className="text-micro text-data mb-2 block">0{i + 1}</span>
            <h5 className="text-data text-ink mb-1">{step.title}</h5>
            <p className="text-data text-mid">{step.detail}</p>
          </li>
        ))}
      </ol>
      <p className="text-data text-dim mb-4">
        My decision criteria: usable coverage, flight and turn cost, reliable task
        ownership, processing latency and integration complexity. The MVP establishes
        a working baseline; proposed optimizations must justify their added complexity.
      </p>

      <div className="border-rule divide-rule divide-y border-y">
        {GROUNDSIDE_NOTES.map((note) => (
          <details key={note.title} className="group">
            <summary className="text-data text-ink cursor-pointer py-4 pr-2 marker:text-signal">
              <span className="ml-1">{note.title}</span>
              <span className="text-micro text-dim mt-2 ml-5 block">{note.status}</span>
            </summary>
            <div className="pb-5 sm:pl-5">
              <div className="text-data text-mid max-w-4xl space-y-3">
                {note.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            </div>
          </details>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <LinkChip label="PROJECT REPOSITORY" href="https://github.com/UWARG/autonomy-monorepo" />
        <LinkChip label="H3 REFERENCE" href="https://h3geo.org/docs/" />
      </div>
    </section>
  );
}
