import { Frame, LinkChip, MicroLabel, SignalBars } from "@/components/gcs/primitives";
import { Reveal } from "@/components/gcs/reveal";
import { Section } from "@/components/gcs/section";
import { COMMS, MISSIONS, PROFILE, SECTIONS } from "@/lib/content";
import { DOMAIN_INDEX, FLEET, STACK_INDEX } from "@/lib/derive";

const DEF = SECTIONS[1];

export function Dossier() {
  const orgs = Array.from(new Set(MISSIONS.map((m) => m.org)));

  return (
    <Section
      def={DEF}
      subtitle="WHO IS FLYING THIS"
      aside={
        <span className="text-micro text-dim">
          {FLEET.domains} DOMAINS · {FLEET.orgs} PROGRAMMES
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-12">
        {/* ── narrative ─────────────────────────────────────────────────── */}
        <Reveal className="lg:col-span-7">
          <Frame code="DSR" title="OPERATOR DOSSIER" tone="signal" bodyClassName="p-4 sm:p-6">
            <div className="space-y-4">
              {PROFILE.about.map((para, i) => (
                <p key={i} className="text-mid text-body max-w-prose">
                  {para}
                </p>
              ))}
            </div>

            <dl className="border-rule mt-6 grid gap-px border sm:grid-cols-3">
              <div className="bg-panel-hi/40 px-3 py-3">
                <dt className="text-micro text-dim mb-1">BASED</dt>
                <dd className="text-data text-mid">{PROFILE.location}</dd>
              </div>
              <div className="bg-panel-hi/40 px-3 py-3">
                <dt className="text-micro text-dim mb-1">CALLSIGN</dt>
                <dd className="text-data text-mid">{PROFILE.callsign}</dd>
              </div>
              <div className="bg-panel-hi/40 px-3 py-3">
                <dt className="text-micro text-dim mb-1">EKF HOME</dt>
                <dd className="text-data text-mid tnum">
                  {Math.abs(PROFILE.homeLat).toFixed(3)}
                  {PROFILE.homeLat >= 0 ? "N" : "S"}{" "}
                  {Math.abs(PROFILE.homeLon).toFixed(3)}
                  {PROFILE.homeLon >= 0 ? "E" : "W"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              <LinkChip label="RESUME" href={PROFILE.resumeUrl} tone="data" />
              {COMMS.filter((c) => c.label !== "EMAIL").map((c) => (
                <LinkChip key={c.code} label={c.label} href={c.href} />
              ))}
            </div>
          </Frame>
        </Reveal>

        {/* ── measured summary ──────────────────────────────────────────── */}
        <div className="grid gap-4 lg:col-span-5">
          <Reveal delay={70}>
            <Frame code="FLT" title="LOG SUMMARY" tone="data">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                {[
                  { k: "SORTIES LOGGED", v: FLEET.missions, tone: "text-data" },
                  { k: "VERIFIED", v: FLEET.verified, tone: "text-nominal" },
                  { k: "IN PROGRESS", v: FLEET.active, tone: "text-caution" },
                  { k: "STACK DEPTH", v: FLEET.stackDepth, tone: "text-signal" },
                ].map((s) => (
                  <div key={s.k}>
                    <dt className="text-micro text-dim mb-1">{s.k}</dt>
                    <dd className={`font-display text-readout tnum ${s.tone}`}>
                      {s.v.toString().padStart(2, "0")}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-micro text-dim mt-4 leading-relaxed">
                COUNTED FROM THE MISSION LOG BELOW — NOT HAND-WRITTEN
              </p>
            </Frame>
          </Reveal>

          <Reveal delay={130}>
            <Frame code="DMN" title="WHERE THE WORK SITS" tone="dim">
              <ul className="space-y-2.5">
                {DOMAIN_INDEX.map((d) => (
                  <li key={d.domain} className="flex items-center gap-3">
                    <span className="text-micro text-mid w-36 shrink-0 truncate">
                      {d.domain}
                    </span>
                    <SignalBars
                      level={d.count / FLEET.missions}
                      segments={FLEET.missions}
                      tone="signal"
                      className="flex-1"
                    />
                    <span className="text-micro text-dim tnum w-8 shrink-0 text-right">
                      {d.count}
                    </span>
                  </li>
                ))}
              </ul>
            </Frame>
          </Reveal>

          <Reveal delay={190}>
            <Frame code="ORG" title="PROGRAMMES" tone="dim">
              <ul className="text-data text-mid space-y-1.5">
                {orgs.map((o) => (
                  <li key={o} className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="text-signal">
                      ▸
                    </span>
                    {o}
                  </li>
                ))}
              </ul>
              <MicroLabel className="mt-4">MOST-USED TOOLING</MicroLabel>
              <p className="text-data text-dim mt-1">
                {STACK_INDEX.slice(0, 5)
                  .map((s) => `${s.token} (${s.count})`)
                  .join(" · ")}
              </p>
            </Frame>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
