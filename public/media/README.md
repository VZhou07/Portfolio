# Onboard footage

Landing clip paths used by section 04:

```
public/media/landing.mp4          # the clip (H.264 mp4 plays everywhere)
public/media/landing-poster.jpg   # optional first frame, shown before playback
```

Until `landing.mp4` exists the downlink panel reports `NO SIGNAL` on purpose —
the sim-to-real handover still runs, it just fades to the missing-media notice
instead of the video. Nothing else needs changing.

Notes:

- Keep it muted-friendly. The player starts muted so browsers allow autoplay,
  and there is an UNMUTE button.
- The clip is expected to be raw and shaky. It is framed as a raw onboard
  capture and labelled `UNSTABILISED`, and the `CROP 1.14×` button hides edge
  wobble without pretending to stabilise anything.
- Paths and the caption live in `lib/content.ts` under `FOOTAGE`.
