# Vincent Zhou — Flight Ops Portfolio

A single-page portfolio built as a drone ground control station. Dark cockpit
deck, amber primary signal, cyan live data. Every readout on the page is measured
from something real — scroll kinematics, device state, the mission list, or the
recovered flight data — and every animation is driven by scroll position,
pointer position, or a value you changed.

Next.js 16 (App Router) · React 19 · Tailwind v4 · TypeScript. No animation
library: motion is CSS transforms plus one shared `requestAnimationFrame` loop.

## Run it

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm lint
pnpm test     # vitest: flight profile, descent geometry, recovered flight data,
              #         arrival state machine
```

## Content

All copy and links live in **`lib/content.ts`**: profile, missions, experience,
skills, contact channels, and footage metadata. Sections are looked up by id
(`sectionOf("teach-repeat")`), never by array index, so inserting one cannot
silently repoint another section's chrome.

The measured flight data lives in **`lib/teach-repeat.ts`**, which is
**generated** — see below.

A few behaviours worth knowing:

- **Unset links never ship as dead anchors.** `isPlaceholder()` detects empty or
  invalid values, and those render as a disabled `UNSET` chip instead of a link.
  The contact form's TRANSMIT button stays disabled until `COMMS[0]` holds a real
  address.
- **Skill levels are computed, not typed.** Each skill declares `matches: []`
  stack tokens; `lib/derive.ts` counts how many missions list them and that count
  is the bar height. Keep stack strings consistent between `MISSIONS[].stack` and
  `SKILL_GROUPS[].skills[].matches` and the instrument panel stays honest. Real
  skills that no logged mission uses go in `ALSO_RUNNING` and render **without** a
  level, because there is no count to draw one from.
- **Verification wording is per mission.** Each mission has `verified` (does it
  actually work) and `airborne` (is it flight software at all). Flight software
  reads `FLOWN ON AIRFRAME` or `NOT FLIGHT-TESTED`; ground software reads
  `TESTED / RUNNING` or `UNVERIFIED`, so a web app is never described as flown.

## Section 04 — the recovered flight

The centrepiece is the flight-verified teach-and-repeat precision landing, taken
apart using the actual onboard frames.

The flight card was corrupted. 855 files were carved off it, of which only **12
are distinct images** — each one a `teach | repeat` pair the flight software wrote
the first time the descent matched a given teach-map rung. Filenames and
timestamps did not survive, and the filename is where the altitude lived.

What the section shows is nevertheless measured, not reconstructed:

- **Lateral error is exact.** `Processor._save_landing_overlay` drew the
  correction arrow at `min(250, 100/max(|tx|,|ty|))` pixels per metre, so any
  arrow short of its 100 px clamp inverts losslessly back to metres. One frame
  (`f07`) clamped and keeps only its direction; it is labelled `≥40`.
- **Altitude was re-measured.** Every surviving half views the same patch of
  ground from a different height, so the similarity scale between any two of them
  is their altitude ratio. 235 accepted pairwise links were solved as one
  least-squares system in log altitude, median residual 0.19%. Absolute metres
  are gone, so the ladder is stated as ratios and labelled as such.
- **The correspondences are real.** The cyan keypoints and the lines across the
  seam are the Lowe-filtered (0.55) ORB matches that survived RANSAC, re-run on
  the recovered frames.
- **The frames are provably untouched.** Each half is 1279×719, which is exactly
  the crop `getOptimalNewCameraMatrix` produces from the airframe's calibration.

The section also surfaces the measurement that motivates the CNN feature-matching
project: match count collapses as the teach/repeat scale gap widens (774 matches
at σ 0.83, 38 at σ 0.42), and the exposure gap between climb and descent widens
alongside it.

### Regenerating the flight assets

```bash
python tmp/export_frames.py   # WebP halves + regenerates lib/teach-repeat.ts
python tmp/transcode.py       # tone-mapped H.264 + VP9 + posters
python tmp/verify_overlay.py  # checks the drawn vector against the burned-in arrow
```

The original phone captures are 10-bit HEVC in BT.2020/HLG, 185 MB and 87 MB.
They are kept **outside** `public/` at `../source-footage/` so Next never serves
them. See `public/media/README.md`.

## The arrival sequence

The site opens with a cold-open, budgeted at **7.5 seconds** to the reveal:

1. **Power-on self test** — probes your real viewport, pointer class and
   connection, and the counts from `content.ts`.
2. **Mission card** — `MATCHING WHAT THE CAMERA REMEMBERS · STAND BY`, over a
   payload feed that is already live at the top of the teach ladder.
3. **The landing** — the autopilot flies a teach-and-repeat descent from 7.5 m
   (the real `last_image_altitude`) down to the 1.0 m LAND-mode handoff and then
   to touchdown. Altitude is a function of time; the keypoints, the match count,
   the alignment cone and the correction vector are all computed from it using
   the flight software's own constants. The window the feed shows through opens
   up as it descends, the HUD readouts and the skip chip fade out, and the image
   dissolves into the deck colour.
4. **Sign-off** — `LANDED ON WHAT IT REMEMBERED`, then a charge-up wobble.
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

## Layout of the code

```
app/
  layout.tsx           fonts (Chakra Petch + IBM Plex Mono), metadata, skip link
  page.tsx             composes the eight sections
  globals.css          design tokens, type scale, HUD surfaces, keyframes
  not-found.tsx        404 that still gets you somewhere
lib/
  content.ts           all copy and links; section lookup helpers
  teach-repeat.ts      GENERATED — measured data from the recovered flight frames
  derive.ts            counts and stats computed from MISSIONS
  flight-computer.tsx  one rAF loop + one scroll/pointer listener for the site
  intro-profile.ts     the cold-open's pacing and descent, as pure functions
  orb-render.ts        teach-and-repeat canvas renderer + the flight constants
  sim-render.ts        canvas renderer for the AprilTag SITL viewports
components/
  gcs/                 HUD chrome: nav rail, telemetry strip, arrival sequence,
                       attitude indicator, panel primitives
  sections/            the eight sections
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
  flight path. Digits `1`–`8` slew between sections.
- **Teach & repeat (04)** opens with a looping simulated descent laid out as the
  same `TEACH | REPEAT` pair the recovered frames use, so the idea and the
  evidence read as one thing — the keypoint count, the alignment cone and the
  correction vector are computed from altitude with the flight software's own
  constants. Below it, the recovered frames step or play down the measured
  altitude ladder; the pair viewer draws the real correspondences across the seam
  and the decoded correction vector on top of the arrow the flight software
  burned in, and both can be toggled off to see the raw frames. Jump chips at the
  top walk the section's panels.
- **Tag baseline (05)** is the AprilTag descent, with the controls a flight test
  does not give you: the descent lever, `AUTO LAND`, an injectable crosswind, an
  occluder you can put across the lens (holds hover, no target, degraded feature
  flow), and a detector event log that only records gates that actually changed.
  Viewports are drawn with `pixels = metres · f / altitude` and
  `depth = h · √(1 + (r/f)²)`. Past about 4 m/s of crosswind the
  `LATERAL ALIGNED` gate genuinely fails.
- **Instrument panel** bars grow from `scaleX(var(--level))` when the section
  scrolls into view, where `--level` is the computed mission count.

### Accessibility notes

Semantic landmarks and headings throughout, real anchors for all navigation
(works with JS disabled), visible focus rings, `aria-expanded`/`aria-controls` on
the flight logs, `inert` on collapsed panels so hidden content is not
tab-reachable, labelled and validated form fields with `aria-invalid` +
`aria-describedby`, one live region per interactive area, and body/label text at
4.5:1 or better on the dark deck. The frame ladder is arrow-key steppable and
announces the selected frame's numbers through a live region.
`prefers-reduced-motion` disables the arrival sequence, the drone trail, ladder
auto-play and video autoplay.
