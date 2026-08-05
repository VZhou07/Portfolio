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
  sim-render.ts        canvas renderer for the SITL viewports
components/
  gcs/                 HUD chrome: nav rail, telemetry strip, boot sequence,
                       attitude indicator, radar scope, panel primitives
  sections/            the seven sections
```

### How the interactions work

- **Boot sequence** reports your real viewport, pointer class, connection type
  and the counts from `content.ts`. Any key, tap or scroll skips it; it is hidden
  from screen readers, skipped entirely under `prefers-reduced-motion`, and only
  plays once per session.
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
- **Approach (04)** is driven by one altitude value. Scrolling flies it; the
  lever and `AUTO LAND` take manual control. Viewports are drawn with
  `pixels = metres · f / altitude` and `depth = h · √(1 + (r/f)²)`.
- **Instrument panel** bars grow from `scaleX(var(--level))` when the section
  scrolls into view, where `--level` is the computed mission count.

### Accessibility notes

Semantic landmarks and headings throughout, real anchors for all navigation
(works with JS disabled), visible focus rings, `aria-expanded`/`aria-controls` on
the flight logs, `inert` on collapsed panels so hidden content is not
tab-reachable, labelled and validated form fields with `aria-invalid` +
`aria-describedby`, one live region per interactive area, and body/label text at
4.5:1 or better on the dark deck. `prefers-reduced-motion` disables the boot
sequence, the radar sweep, the drone trail and video autoplay.
