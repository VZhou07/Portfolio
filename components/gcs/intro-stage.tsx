"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useFlight } from "@/lib/flight-computer";
import { BootSequence } from "./boot-sequence";
import { LandingIntro } from "./landing-intro";

const SESSION_KEY = "gcs.booted";
/** How long the deck's punch-in animation needs before the gate can be dropped. */
const RELEASE_MS = 1100;

type Stage = "post" | "flight" | "bang" | "over";

/* Whether the cold-open is armed is a fact about the document, decided before
   hydration. Read it through useSyncExternalStore and cache it, so the value is
   stable for the life of the page and never fights the render. */
let armedOnce: boolean | null = null;
const NEVER = () => () => {};
const readArmed = () => {
  if (armedOnce === null) {
    armedOnce = document.documentElement.dataset.intro === "armed";
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

  /* Nothing to play: hand the chrome over at once. */
  useEffect(() => {
    if (armed) {
      window.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    released.current = true;
    markBooted();
  }, [armed, markBooted]);

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

      {flying && (
        <button
          type="button"
          onClick={release}
          /* --intro-hud is written by the landing stage so the chip fades out
             with the rest of the HUD as the aircraft flares. */
          style={{ opacity: "var(--intro-hud, 1)" }}
          className="border-rule text-micro text-dim hover:border-data hover:text-data absolute right-4 bottom-4 border px-3 py-2 transition-colors"
        >
          SKIP INTRO · SPACE
        </button>
      )}
    </div>
  );
}
