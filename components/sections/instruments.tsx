import type { CSSProperties } from "react";
import { Frame, MicroLabel } from "@/components/gcs/primitives";
import { Reveal } from "@/components/gcs/reveal";
import { Section } from "@/components/gcs/section";
import { MISSIONS, SECTIONS } from "@/lib/content";
import { SKILL_PEAK, SKILL_STATS } from "@/lib/derive";

const DEF = SECTIONS[5];

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
                {group.skills.map((s) => (
                  <li key={s.name}>
                    <div className="mb-1 flex items-baseline gap-2">
                      <span className="text-data text-mid min-w-0 flex-1 truncate">
                        {s.name}
                      </span>
                      <span className="text-micro text-dim tnum shrink-0">
                        SINCE {s.since}
                      </span>
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
    </Section>
  );
}
