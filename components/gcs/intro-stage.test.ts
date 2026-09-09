// @vitest-environment jsdom

/**
 * The arrival sequence's state machine, end to end. The animation itself is a
 * browser thing, but the contract around it is testable: the deck is gated
 * while it plays, scrolling is locked, one skip path releases everything, and
 * the gate is fully cleaned up afterwards.
 */

import { act, createElement } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { introDuration, WATCHDOG_MS } from "@/lib/intro-profile";

/** Lines the power-on self test probes — keep in step with intro-profile.test. */
const POST_LINES = 9;
/** Long enough for the release animation and the gate teardown. */
const RELEASE_MS = 1200;

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root | null = null;

/** Whatever the inline gate in app/layout.tsx would have done, done here. */
function arm(): void {
  document.documentElement.dataset.intro = "armed";
  document.documentElement.classList.add("gcs-locked");
}

async function mount(): Promise<void> {
  /* fresh module registry so IntroStage re-reads the gate for each scenario */
  vi.resetModules();
  const { FlightComputer } = await import("@/lib/flight-computer");
  const { IntroStage } = await import("@/components/gcs/intro-stage");

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(FlightComputer, null, createElement(IntroStage)),
    );
  });
}

/**
 * Mount the way a real visitor does. IntroStage renders nothing on the server,
 * so the container starts empty and hydration matches — but
 * useSyncExternalStore reports the *server* snapshot during that first pass,
 * which is the condition that once left the sequence stuck on its last card.
 */
async function hydrate(): Promise<void> {
  vi.resetModules();
  const { FlightComputer } = await import("@/lib/flight-computer");
  const { IntroStage } = await import("@/components/gcs/intro-stage");

  container.innerHTML = "";
  await act(async () => {
    root = hydrateRoot(
      container,
      createElement(FlightComputer, null, createElement(IntroStage)),
    );
  });
}

/**
 * Advance the clock in slices. Each act() boundary lets React commit and run
 * effects — one big jump would starve its scheduler, and the sequence's later
 * stages are started by effects.
 */
async function advance(ms: number): Promise<void> {
  const slice = 100;
  for (let left = ms; left > 0; left -= slice) {
    const step = Math.min(slice, left);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(step);
    });
  }
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();

  /* jsdom has none of these, and the flight computer expects all three */
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  window.scrollTo = () => {};
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;

  sessionStorage.clear();
  document.documentElement.removeAttribute("data-intro");
  document.documentElement.className = "";
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  if (root) {
    const r = root;
    act(() => r.unmount());
    root = null;
  }
  container.remove();
  vi.useRealTimers();
});

describe("arrival sequence", () => {
  it("holds the deck, then releases it and cleans the gate up", async () => {
    arm();
    await mount();

    /* the overlay is up and scrolling is still locked */
    expect(container.querySelector("button")).not.toBeNull();
    expect(document.documentElement.dataset.intro).toBe("armed");
    expect(document.documentElement.classList.contains("gcs-locked")).toBe(true);

    /* mid-flight it is still gated */
    await advance(introDuration(POST_LINES) - 500);
    expect(document.documentElement.dataset.intro).toBe("armed");

    /* the sequence ends by firing the reveal */
    await advance(700);
    expect(document.documentElement.dataset.intro).toBe("release");
    expect(document.documentElement.classList.contains("gcs-locked")).toBe(false);
    expect(sessionStorage.getItem("gcs.booted")).toBe("1");

    /* and then removes itself entirely */
    await advance(RELEASE_MS);
    expect(document.documentElement.hasAttribute("data-intro")).toBe(false);
    expect(container.innerHTML).toBe("");
  });

  it("skips to the reveal on a keypress", async () => {
    arm();
    await mount();

    await advance(300);
    expect(document.documentElement.dataset.intro).toBe("armed");

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    });

    expect(document.documentElement.dataset.intro).toBe("release");
    expect(document.documentElement.classList.contains("gcs-locked")).toBe(false);
  });

  it("skips on the skip control, and only fires once", async () => {
    arm();
    await mount();
    await advance(300);

    const skip = container.querySelector("button");
    expect(skip).not.toBeNull();
    await act(async () => {
      skip?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    expect(document.documentElement.dataset.intro).toBe("release");

    /* a second interaction must not re-arm or re-run anything */
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.documentElement.dataset.intro).toBe("release");
  });

  it("renders nothing and locks nothing when the gate never armed", async () => {
    await mount();

    expect(container.innerHTML).toBe("");
    expect(document.documentElement.hasAttribute("data-intro")).toBe(false);
    expect(document.documentElement.classList.contains("gcs-locked")).toBe(false);

    /* and it stays out of the way */
    await advance(introDuration(POST_LINES) + RELEASE_MS);
    expect(container.innerHTML).toBe("");
  });

  it("still reaches the reveal when hydrated, not just client-rendered", async () => {
    arm();
    await hydrate();

    /* it actually played: the overlay came up */
    expect(container.querySelector("button")).not.toBeNull();

    await advance(introDuration(POST_LINES) + 200);
    expect(document.documentElement.dataset.intro).toBe("release");
    expect(document.documentElement.classList.contains("gcs-locked")).toBe(false);

    await advance(RELEASE_MS);
    expect(document.documentElement.hasAttribute("data-intro")).toBe(false);
    expect(container.innerHTML).toBe("");
  });

  it("hands the site over even if the sequence never finishes", async () => {
    arm();
    await hydrate();

    /* the watchdog is the backstop for anything that stalls the timeline */
    await advance(WATCHDOG_MS + RELEASE_MS + 200);
    expect(document.documentElement.hasAttribute("data-intro")).toBe(false);
    expect(document.documentElement.classList.contains("gcs-locked")).toBe(false);
    expect(container.innerHTML).toBe("");
  });

  it("does not arm on hydration when the gate is absent", async () => {
    await hydrate();

    await advance(introDuration(POST_LINES) + RELEASE_MS);
    expect(container.innerHTML).toBe("");
    expect(document.documentElement.hasAttribute("data-intro")).toBe(false);
  });
});
