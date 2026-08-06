"use client";

import { useEffect, useRef } from "react";

/**
 * Stage two of the arrival sequence: the precision landing, flown by the
 * autopilot with no scroll involvement. Filled in over the next milestones —
 * for now it holds the deck dark and hands straight over.
 */
export function LandingIntro({ onDone }: { onDone: () => void }) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  useEffect(() => {
    const t = window.setTimeout(() => done.current(), 600);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div aria-hidden="true" className="bg-void absolute inset-0">
      <div className="gcs-grid pointer-events-none absolute inset-0 opacity-25" />
    </div>
  );
}
