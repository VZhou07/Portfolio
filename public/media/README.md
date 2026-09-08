# Flight footage

Web deliverables served from here. Both are ground-observer video of real
flight tests — **not** onboard camera. The onboard imagery is the recovered
frame set in `lib/teach-repeat.ts` and `public/media/teach-repeat/`.

```
non-optimal-landing.{mp4,webm}   section 04 — the teach-and-repeat landing
non-optimal-landing-poster.jpg
apriltag-landing.{mp4,webm}      section 05 — the AprilTag baseline
apriltag-landing-poster.jpg
teach-repeat/f01..f12-{teach,repeat}.webp
```

Paths and captions live in `lib/content.ts` under `FOOTAGE` and
`APRILTAG_FOOTAGE`. If a clip is missing, section 05's downlink panel reports
`NO SIGNAL` on purpose: the sim-to-real handover still runs, it just fades to a
missing-media notice.

## Regenerating them

The originals are iPhone captures: 1920×1080 10-bit HEVC in BT.2020/HLG with a
Dolby Vision RPU, 185 MB and 87 MB. That combination is not web-deliverable —
HEVC playback is not dependable across browsers, and HLG decoded as SDR looks
washed out. They are kept **outside** `public/` at `../../source-footage/` so
Next never serves them.

`tmp/transcode.py` rebuilds the deliverables: it linearises HLG, tone-maps with
`hable`, converts to BT.709, crops to the descent corridor (located by
background-differencing the static shot), trims to the touchdown, and writes
H.264 + VP9 + a poster. Each clip lands around 1 MB.

`tmp/export_frames.py` rebuilds the recovered frame set and regenerates
`lib/teach-repeat.ts`.

## Notes

- Players start muted so browsers allow playback, with an UNMUTE control.
- The clips are unstabilised and labelled as such. Section 05's `CROP 1.14×`
  button hides edge wobble without pretending to stabilise anything.
