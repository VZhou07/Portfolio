import { AttitudeIndicator } from "@/components/gcs/attitude-indicator";
import { JumpButton, LocalClock } from "@/components/gcs/controls";
import { Frame, LinkChip, MicroLabel, Rule } from "@/components/gcs/primitives";
import { Reveal } from "@/components/gcs/reveal";
import { PROFILE, SECTIONS, sectionOf } from "@/lib/content";
import { FLEET } from "@/lib/derive";

const DEF = sectionOf("preflight");

/**
 * Hero. Deliberately not a centred stack: the identity plate is offset left with
 * a vertical section tab, and the live instrument column sits to the right at a
 * different rhythm.
 */
export function Preflight() {
  return (
    <section
      id={DEF.id}
      aria-labelledby={`${DEF.id}-title`}
      className="border-rule gcs-stipple relative border-b px-4 pt-12 pb-16 sm:px-6 sm:pt-16 lg:min-h-[calc(100svh-2.75rem)] lg:px-10"
    >
      <div className="mx-auto w-full max-w-7xl">
        {/* status line */}
        <div className="border-rule mb-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3">
          <span className="text-micro text-signal tnum">
            {DEF.code} / {SECTIONS.length}
          </span>
          <span className="text-micro text-dim">{DEF.label}</span>
          <span aria-hidden="true" className="bg-rule h-3 w-px" />
          <LocalClock />
          <span className="ml-auto inline-flex items-center gap-2">
            <span aria-hidden="true" className="bg-nominal h-1.5 w-1.5" />
            <span className="text-micro text-nominal">ALL SYSTEMS NOMINAL</span>
          </span>
        </div>

        <div className="grid items-start gap-8 lg:grid-cols-12 lg:gap-10">
          {/* ── identity ───────────────────────────────────────────────── */}
          <div className="lg:col-span-7 xl:col-span-8">
            <Reveal>
              <div className="flex gap-4">
                {/* vertical section tab */}
                <div
                  aria-hidden="true"
                  className="border-rule hidden w-8 shrink-0 items-center justify-center border sm:flex"
                >
                  <span className="text-micro text-dim [writing-mode:vertical-rl] rotate-180">
                    PILOT IDENT · {PROFILE.callsign}
                  </span>
                </div>

                <div className="gcs-hero-plate min-w-0 flex-1">
                  <MicroLabel className="mb-3">OPERATOR</MicroLabel>
                  <h1
                    id={`${DEF.id}-title`}
                    className="font-display text-h1 text-ink mb-4 tracking-tight break-words"
                  >
                    {PROFILE.name}
                  </h1>
                  <Rule className="mb-4" />
                  <p className="text-mid text-lede mb-2 max-w-2xl">
                    {PROFILE.title}
                  </p>
                  <p className="text-dim text-data max-w-2xl">{PROFILE.tagline}</p>
                </div>
              </div>
            </Reveal>

            {/* at-a-glance, all computed from the mission log */}
            <Reveal delay={90}>
              <dl className="border-rule mt-8 grid grid-cols-2 gap-px border sm:grid-cols-4">
                {[
                  { k: "LOCATION", v: PROFILE.location },
                  { k: "SORTIES", v: String(FLEET.missions) },
                  { k: "VERIFIED", v: `${FLEET.verified}/${FLEET.missions}` },
                  { k: "ACTIVE", v: String(FLEET.active) },
                ].map((cell) => (
                  <div key={cell.k} className="bg-panel/60 px-3 py-3">
                    <dt className="text-micro text-dim mb-1">{cell.k}</dt>
                    <dd className="font-display text-data text-h3 truncate">
                      {cell.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>

            <Reveal delay={150}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <JumpButton to="missions">OPEN MISSION LOG</JumpButton>
                <JumpButton to="teach-repeat" variant="ghost">
                  SEE THE LANDING
                </JumpButton>
                <JumpButton to="comms" variant="ghost">
                  OPEN COMMS
                </JumpButton>
                <LinkChip label="RESUME" href={PROFILE.resumeUrl} tone="data" />
              </div>

              <p className="text-micro text-dim mt-5">
                PRESS <span className="text-signal">1</span>–
                <span className="text-signal">{SECTIONS.length}</span> TO SLEW ·
                SCROLL TO DESCEND · THE DRONE ON THE RAIL IS YOUR POSITION
              </p>
            </Reveal>
          </div>

          {/* ── instruments ────────────────────────────────────────────── */}
          <div className="gcs-hero-bank grid gap-4 lg:col-span-5 xl:col-span-4">
            <Reveal delay={60}>
              <Frame
                code="ADI"
                title="ATTITUDE"
                tone="data"
                aside={<span className="text-micro text-dim">CURSOR + SCROLL</span>}
              >
                <AttitudeIndicator />
              </Frame>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
