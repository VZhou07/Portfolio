import Link from "next/link";
import { MISSIONS, SECTIONS } from "@/lib/content";

export default function NotFound() {
  return (
    <main className="gcs-grid flex min-h-screen items-center px-5 py-16">
      <div className="mx-auto w-full max-w-2xl">
        <p className="text-micro text-fault mb-3">
          NAV FAULT · 404 · WAYPOINT NOT IN MISSION FILE
        </p>

        <h1 className="font-display text-h1 text-ink mb-4 tracking-tight">
          OFF ROUTE
        </h1>

        <p className="text-mid text-body border-rule mb-8 max-w-prose border-l-2 pl-4">
          The flight computer has no waypoint at that address. Everything on this
          site lives on one page — pick a section below and it will slew you
          there.
        </p>

        <nav aria-label="Sections">
          <ul className="border-rule grid grid-cols-2 gap-px border sm:grid-cols-4">
            {SECTIONS.map((s) => (
              <li key={s.id} className="bg-panel/60">
                <Link
                  href={`/#${s.id}`}
                  className="hover:bg-panel-hi block px-3 py-4 transition-colors"
                >
                  <span className="text-micro text-signal tnum block">
                    {s.code}
                  </span>
                  <span className="text-data text-mid">{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-micro text-dim mt-6">
          OR JUMP STRAIGHT INTO THE {MISSIONS.length}-SORTIE{" "}
          <Link
            href="/#missions"
            className="text-signal underline underline-offset-4"
          >
            MISSION LOG
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
