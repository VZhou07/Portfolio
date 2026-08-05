import { PROFILE } from "@/lib/content";
import { FLEET } from "@/lib/derive";

export default function Page() {
  return (
    <main className="gcs-grid min-h-screen p-10">
      <p className="text-signal text-micro tracking-hud">
        FOUNDATION CHECK · {FLEET.missions} MISSIONS
      </p>
      <h1 className="font-display text-h1 text-ink">{PROFILE.callsign}</h1>
      <p className="text-dim text-data">{PROFILE.tagline}</p>
    </main>
  );
}
