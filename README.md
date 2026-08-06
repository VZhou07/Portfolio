# Ground Control Station — flight-ops portfolio

A single-page portfolio built as a drone ground control station. Dark cockpit
deck, amber primary signal, cyan live data. Every readout on the page is measured
from something real — scroll kinematics, device state, or the mission list — and
every animation is driven by scroll position, pointer position, or a value you
changed.

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript. No animation
library: motion is CSS transforms plus one shared `requestAnimationFrame` loop.

## Run it

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm lint
pnpm test     # vitest: flight profile, approach geometry, arrival state machine
```

## Fill in your details

All content is in one file: **`lib/content.ts`**. Anything wrapped in
`[SQUARE BRACKETS]` is a placeholder — search for `[` and work through it.

| What                  | Where in `lib/content.ts` |
| --------------------- | ------------------------- |
| Name, tagline, bio    | `PROFILE`                 |
| Projects              | `MISSIONS`                |
| Experience timeline   | `WAYPOINTS`               |
| Skills                | `SKILL_GROUPS`            |
| Email / social links  | `COMMS`                   |
| Landing clip + caption| `FOOTAGE`                 |

Two things worth knowing:

- **Placeholder links never ship as dead links.** `isPlaceholder()` detects
  unfilled values, and those render as a disabled `UNSET` chip instead of an
  anchor. The contact form's TRANSMIT button stays disabled, with a visible
  explanation, until `COMMS[0]` holds a real address.
- **Skill levels are computed, not typed.** Each skill declares `matches: []`
  stack tokens; `lib/derive.ts` counts how many missions list them and that count
  is the bar height. Keep stack strings consistent between `MISSIONS[].stack` and
  `SKILL_GROUPS[].skills[].matches` and the instrument panel stays honest.
- **Verification wording is per mission.** Each mission has `verified` (does it
  actually work) and `airborne` (is it flight software at all). Flight software
  reads `FLOWN ON AIRFRAME` or `NOT FLIGHT-TESTED`; ground software reads
  `TESTED / RUNNING` or `UNVERIFIED`, so a web app is never described as flown.

## The arrival sequence

The site opens with a cold-open, budgeted at **7.5 seconds** to the reveal:

1. **Power-on self test** — probes your real viewport, pointer class and
   connection, and the counts from `content.ts`.
2. **Mission card** — `AUTONOMY IN COMMAND · STAND BY`, over a payload feed that
   is already live at 12 m.
3. **The landing** — the autopilot flies an AprilTag precision approach from 12 m
   to touchdown in 3.2 s. Altitude is a function of time, flared so it slows into
   the ground; every readout is computed from it. The window the feed shows
   through opens up as it descends, the HUD readouts and the skip chip fade out
   through the flare, and the image dissolves into the deck colour.
4. **Sign-off** — `MISSION COMPLETE`, then a charge-up wobble.
5. **The reveal** — flash, shockwave rings, spokes, and the deck punches in with
   the name plate thrown out of the blast.

`SKIP INTRO · SPACE` is on screen from the first frame; any key, tap or wheel
also jumps straight to the reveal. Scrolling is locked while it plays.

It does **not** play for `prefers-reduced-motion`, on a deep link
(`/#missions`), or on repeat visits in the same session — that decision is made
before first paint by an inline gate in `app/layout.tsx` which sets
`data-intro="armed"` on `<html>`. No attribute means the deck renders exactly as
it always has, so no-JS visitors are never gated. Clear `sessionStorage` to see
it again.

Pacing lives in one place, `lib/intro-profile.ts`, and
`lib/intro-profile.test.ts` fails if an edit pushes the sequence past 8 seconds.

## Add the landing footage

Section 04 flies a simulated descent and hands over to real onboard video at
touchdown. Drop your clip at:

```
public/media/landing.mp4
public/media/landing-poster.jpg   # optional
```

Until then the downlink panel reports `NO SIGNAL` on purpose. See
`public/media/README.md`.

## Layout of the code

```
app/
  layout.tsx           fonts (Chakra Petch + IBM Plex Mono), metadata, skip link
  page.tsx             composes the seven sections
  globals.css          design tokens, type scale, HUD surfaces, keyframes
  not-found.tsx        404 that still gets you somewhere
lib/
  content.ts           all copy and links  ← edit this
  derive.ts            counts and stats computed from MISSIONS
  flight-computer.tsx  one rAF loop + one scroll/pointer listener for the site
  intro-profile.ts     the cold-open's pacing and descent, as pure functions
  sim-render.ts        canvas renderer for the SITL viewports
components/
  gcs/                 HUD chrome: nav rail, telemetry strip, arrival sequence,
                       attitude indicator, radar scope, panel primitives
  sections/            the seven sections
```

### How the interactions work

- **Arrival sequence** (`gcs/intro-stage.tsx`) owns the cold-open described
  above: the self test, the landing, the shockwave. It is hidden from screen
  readers apart from the skip control, and one handler skips all of it.
- **Telemetry strip** — `ALT` is remaining scroll distance scaled to metres,
  `V/S` and `GS` are scroll velocity, `HDG` interpolates the active section's
  bearing, `FPS` is measured, `LINK`/`PWR` come from the Network Information and
  Battery APIs when the browser exposes them.
- **Nav rail** is one element with two layouts: a vertical rail on desktop, a
  thumb-reachable bar on touch. The drone is the position indicator — it is
  interpolated between waypoints from real scroll progress and leaves a fading
  flight path. Digits `1`–`7` slew between sections.
- **Radar scope** contacts are the missions: bearing is the engineering domain,
  range is position in the log. The sweep speeds up when you scroll faster, and
  contacts brighten as the beam crosses them. Each contact is a real button.
- **Approach (04)** is the replay of the arrival, with the controls the intro did
  not have: the descent lever, `AUTO LAND`, an injectable crosswind, an occluder
  you can put across the lens, and a detector event log that only records gates
  that actually changed. Viewports are drawn with
  `pixels = metres · f / altitude` and `depth = h · √(1 + (r/f)²)`. Past about
  4 m/s of crosswind the `LATERAL ALIGNED` gate genuinely fails.
- **Instrument panel** bars grow from `scaleX(var(--level))` when the section
  scrolls into view, where `--level` is the computed mission count.

### Accessibility notes

Semantic landmarks and headings throughout, real anchors for all navigation
(works with JS disabled), visible focus rings, `aria-expanded`/`aria-controls` on
the flight logs, `inert` on collapsed panels so hidden content is not
tab-reachable, labelled and validated form fields with `aria-invalid` +
`aria-describedby`, one live region per interactive area, and body/label text at
4.5:1 or better on the dark deck. `prefers-reduced-motion` disables the arrival
sequence, the radar sweep, the drone trail and video autoplay.
