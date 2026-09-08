import type { CSSProperties } from "react";
import { Frame, MicroLabel } from "@/components/gcs/primitives";
import { Reveal } from "@/components/gcs/reveal";
import { Section } from "@/components/gcs/section";
import { ALSO_RUNNING, MISSIONS, isPlaceholder, sectionOf } from "@/lib/content";
import { SKILL_PEAK, SKILL_STATS } from "@/lib/derive";

const DEF = sectionOf("instruments");

/**
 * Instrument panel. There is no self-assessed "90% proficient" anywhere: each
 * channel's signal level is the number of missions in section 03 whose stack
 * lists that tool, normalised against the busiest channel. Add a mission and the
 * needles move.
 */
export function Instruments() {
  return (
    <Section
      def={DEF}
      subtitle="SIGNAL LEVEL = MISSIONS THAT ACTUALLY USED IT"
      aside={
        <span className="text-micro text-dim">
          PEAK {SKILL_PEAK}/{MISSIONS.length} SORTIES
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {SKILL_STATS.map((group, gi) => (
          <Reveal key={group.code} delay={gi * 70}>
            <Frame
              code={group.code}
              title={group.label}
              tone={gi % 2 === 0 ? "data" : "signal"}
              aside={
                <span className="text-micro text-dim tnum">
                  {group.missionCount}/{MISSIONS.length} SORTIES
                </span>
              }
              bodyClassName="p-3 sm:p-4"
            >
              <ul className="space-y-3">
                {group.skills.map((s, si) => (
                  <li key={`${s.name}-${si}`}>
                    <div className="mb-1 flex items-baseline gap-2">
                      <span className="text-data text-mid min-w-0 flex-1 truncate">
                        {s.name}
                      </span>
                      {!isPlaceholder(s.since) && (
                        <span className="text-micro text-dim tnum shrink-0">
                          SINCE {s.since}
                        </span>
                      )}
                      <span
                        className={`text-micro tnum w-14 shrink-0 text-right ${
                          s.count > 0 ? "text-signal" : "text-dim"
                        }`}
                      >
                        {s.count}/{MISSIONS.length}
                      </span>
                    </div>

                    {/* the bar: width is a CSS var from the real count */}
                    <div className="bg-void border-rule relative h-1.5 w-full border">
                      <div
                        aria-hidden="true"
                        className={`gcs-meter h-full w-full ${
                          s.count > 0 ? "bg-data" : "bg-rule"
                        }`}
                        style={{ "--level": s.normalised } as CSSProperties}
                      />
                    </div>

                    {/* which missions — click through and verify the claim */}
                    {s.missions.length > 0 ? (
                      <ul className="mt-1.5 flex flex-wrap gap-1">
                        {s.missions.map((m) => (
                          <li key={m.id}>
                            <a
                              href={`#${m.id}`}
                              title={`${m.name} — ${m.status}`}
                              className="text-micro text-dim hover:text-signal tnum underline-offset-2 hover:underline"
                            >
                              {m.id.toUpperCase()}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-micro text-dim mt-1.5">
                        NO LOGGED SORTIE YET
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Frame>
          </Reveal>
        ))}
      </div>

      <div className="border-rule bg-panel/50 mt-4 border p-4">
        <MicroLabel className="mb-2">HOW TO READ THIS PANEL</MicroLabel>
        <p className="text-data text-dim max-w-3xl leading-relaxed">
          Each bar is <span className="text-mid">missions using the tool ÷ busiest tool</span>
          , counted from the mission log in section 03 — so it measures how much of
          the work leaned on something, not how good anyone claims to be. The
          mission codes under each channel are links: follow them and check.
        </p>
      </div>

      {/* Everything real but unlogged. No bar, because there is no count to
          draw one from — a fabricated level here would undo the whole panel. */}
      <div className="border-rule bg-panel/50 mt-4 border p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <MicroLabel>ALSO IN THE TOOLBOX · NO LOGGED SORTIE</MicroLabel>
          <span className="text-micro text-dim tnum">
            {ALSO_RUNNING.reduce((n, g) => n + g.items.length, 0)} UNMETERED
          </span>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ALSO_RUNNING.map((group) => (
            <div key={group.group}>
              <dt className="text-micro text-signal mb-1.5">{group.group}</dt>
              <dd>
                <ul className="flex flex-wrap gap-1.5">
                  {group.items.map((item) => (
                    <li
                      key={item}
                      className="border-rule text-micro text-dim border border-dashed px-2 py-0.5"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-micro text-dim mt-3 leading-relaxed">
          COURSEWORK, HARDWARE LABS AND SUPPORTING TOOLING. LISTED WITHOUT A
          SIGNAL LEVEL BECAUSE NO MISSION ABOVE MEASURES THEM.
        </p>
      </div>
    </Section>
  );
}
