"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { useFlight } from "@/lib/flight-computer";
import { WATCHDOG_MS } from "@/lib/intro-profile";
import { BootSequence } from "./boot-sequence";
import { LandingIntro } from "./landing-intro";

const SESSION_KEY = "gcs.booted";
/** How long the deck's punch-in animation needs before the gate can be dropped. */
const RELEASE_MS = 1100;

type Stage = "post" | "flight" | "bang" | "over";

/* Whether the cold-open is armed is a fact about the document, decided before
   hydration by the inline gate. Read it straight from the DOM and cache it: the
   value must not depend on which render pass is asking, because
   useSyncExternalStore reports the server snapshot during hydration. */
let armedOnce: boolean | null = null;
const NEVER = () => () => {};
const readArmed = () => {
  if (armedOnce === null) {
    armedOnce =
      typeof document !== "undefined" &&
      document.documentElement.dataset.intro === "armed";
  }
  return armedOnce;
};
const notArmed = () => false;

/**
 * ARRIVAL SEQUENCE
 * ----------------------------------------------------------------------------
 * Owns the whole cold-open: power-on self test, then the precision landing,
 * then the shockwave that brings the deck up. One skip handler for all of it —
 * any key, tap or wheel jumps straight to the reveal.
 *
 * Whether it plays at all is decided before first paint by the inline gate in
 * app/layout.tsx, which sets data-intro="armed" on <html>. That attribute is
 * also what hides the deck, so there is no flash of an unstyled page and no-JS
 * visitors are never gated.
 */
export function IntroStage() {
  const { markBooted } = useFlight();
  const armed = useSyncExternalStore(NEVER, readArmed, notArmed);
  const [stage, setStage] = useState<Stage>("post");
  const released = useRef(false);

  /** Fire the reveal: unlock scrolling, let the HUD chrome in, punch the deck. */
  const release = useCallback(() => {
    if (released.current) return;
    released.current = true;

    const root = document.documentElement;
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      /* private mode: the sequence simply replays next visit */
    }
    root.dataset.intro = "release";
    root.classList.remove("gcs-locked");
    root.style.removeProperty("--intro-hud");
    markBooted();
    setStage("bang");

    window.setTimeout(() => {
      root.removeAttribute("data-intro");
      setStage("over");
    }, RELEASE_MS);
  }, [markBooted]);

  /* Nothing to play: hand the chrome over at once. This asks the DOM rather
     than the render pass — during hydration useSyncExternalStore reports the
     server snapshot, and trusting it here would mark the sequence released
     before it had run, leaving the last card on screen forever. */
  useEffect(() => {
    if (readArmed()) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    released.current = true;
    markBooted();
  }, [markBooted]);

  /* Failsafe: never leave a visitor stuck behind the overlay. WATCHDOG_MS
     is the same deadline as the inline gate in app/layout.tsx. */
  useEffect(() => {
    if (!armed) return;
    const guard = window.setTimeout(release, WATCHDOG_MS);
    return () => window.clearTimeout(guard);
  }, [armed, release]);

  /* Any interaction skips the rest of the sequence. */
  useEffect(() => {
    if (!armed || (stage !== "post" && stage !== "flight")) return;

    const skip = () => release();
    const opts = { passive: true } as const;
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip, opts);
    window.addEventListener("wheel", skip, opts);
    window.addEventListener("touchstart", skip, opts);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
    };
  }, [armed, stage, release]);

  const toFlight = useCallback(() => setStage("flight"), []);

  if (!armed || stage === "over") return null;

  const flying = stage === "post" || stage === "flight";

  return (
    <div
      className={`fixed inset-0 z-90 overflow-hidden ${
        flying ? "" : "pointer-events-none"
      }`}
    >
      {stage === "post" && <BootSequence onDone={toFlight} />}
      {stage === "flight" && <LandingIntro onDone={release} />}

      {stage === "bang" && (
        <div aria-hidden="true" className="absolute inset-0">
          <div className="gcs-flash absolute inset-0" />

          {/* rings and spokes share the flash's origin */}
          <div className="absolute top-[38vh] left-1/2 h-0 w-0">
            <div
              className="gcs-ring border-signal absolute h-[26vmax] w-[26vmax] border-2"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="gcs-ring border-data/80 absolute h-[26vmax] w-[26vmax] rounded-full border"
              style={{ animationDelay: "90ms" }}
            />
            {Array.from({ length: 8 }, (_, i) => (
              <div
                key={i}
                className="gcs-spoke bg-signal/70 absolute h-px w-[62vmax]"
                style={
                  {
                    ["--a" as string]: `${i * 45}deg`,
                    animationDelay: `${40 + i * 12}ms`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
      )}

      {flying && (
        <>
          <p className="sr-only" role="status">
            Arrival sequence playing. Press any key, or activate the skip
            control, to go straight to the site.
          </p>
          <button
            type="button"
            onClick={release}
            aria-label="Skip the arrival sequence"
            /* --intro-hud is written by the landing stage so the chip fades out
               with the rest of the HUD as the aircraft flares. */
            style={{ opacity: "var(--intro-hud, 1)" }}
            className="border-rule text-micro text-dim hover:border-data hover:text-data absolute right-4 bottom-4 border px-3 py-2 transition-colors"
          >
            SKIP INTRO · SPACE
          </button>
        </>
      )}
    </div>
  );
}
