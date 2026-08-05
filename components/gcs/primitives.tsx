import type { ReactNode } from "react";
import { isPlaceholder, type StatusCode } from "@/lib/content";
import { statusStyle } from "@/lib/derive";

/* ============================================================================
   HUD PRIMITIVES
   ----------------------------------------------------------------------------
   The whole site is built from these five shapes so it reads as one instrument
   suite. Panels are notched (top-left / bottom-right) with tick marks on the
   square corners — deliberately not rounded drop-shadow cards.
   ========================================================================== */

type Tone = "signal" | "data" | "dim";

const TONE_TICK: Record<Tone, string> = {
  signal: "border-signal/70",
  data: "border-data/70",
  dim: "border-rule-hi",
};

const TONE_TEXT: Record<Tone, string> = {
  signal: "text-signal",
  data: "text-data",
  dim: "text-dim",
};

export function Frame({
  code,
  title,
  aside,
  tone = "dim",
  className = "",
  bodyClassName = "",
  children,
}: {
  code?: string;
  title?: string;
  aside?: ReactNode;
  tone?: Tone;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`gcs-notch border-rule bg-panel/85 relative border ${className}`}
    >
      {/* tick marks on the two square corners */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -top-px -right-px h-2.5 w-2.5 border-t-2 border-r-2 ${TONE_TICK[tone]}`}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -bottom-px -left-px h-2.5 w-2.5 border-b-2 border-l-2 ${TONE_TICK[tone]}`}
      />

      {(code || title || aside) && (
        <header className="border-rule bg-panel-hi/70 flex items-center gap-3 border-b px-3 py-2">
          {code && (
            <span
              className={`text-micro tnum shrink-0 ${TONE_TEXT[tone === "dim" ? "signal" : tone]}`}
            >
              {code}
            </span>
          )}
          {title && (
            <h3 className="font-display text-label text-mid tracking-label truncate">
              {title}
            </h3>
          )}
          {aside && <div className="ml-auto shrink-0">{aside}</div>}
        </header>
      )}

      <div className={bodyClassName || "p-3"}>{children}</div>
    </div>
  );
}

/** Small uppercase field label. */
export function MicroLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-micro text-dim block ${className}`}>{children}</span>
  );
}

/** Hairline divider with a measurement tick, used between stacked blocks. */
export function Rule({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`border-rule relative border-t ${className}`}
    >
      <span className="bg-rule-hi absolute -top-1 left-0 h-2 w-px" />
      <span className="bg-rule-hi absolute -top-1 right-0 h-2 w-px" />
    </div>
  );
}

export function StatusChip({
  status,
  verification,
}: {
  status: StatusCode;
  /** Accurate per-mission verification wording from lib/derive.ts. */
  verification?: { label: string; ok: boolean };
}) {
  const s = statusStyle(status);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center gap-1.5 border px-2 py-1 ${s.border} ${s.text} text-micro`}
      >
        <span aria-hidden="true" className={`h-1.5 w-1.5 ${s.dot}`} />
        {status}
      </span>
      {verification && (
        <span
          className={`text-micro border px-2 py-1 ${
            verification.ok
              ? "border-nominal/40 text-nominal"
              : "border-fault/40 text-fault"
          }`}
        >
          {verification.label}
        </span>
      )}
    </span>
  );
}

/**
 * External link, or a clearly disabled chip when the URL is still a
 * placeholder. The site never renders an anchor that goes nowhere.
 */
export function LinkChip({
  label,
  href,
  tone = "signal",
}: {
  label: string;
  href: string;
  tone?: Tone;
}) {
  if (isPlaceholder(href)) {
    return (
      <span
        aria-disabled="true"
        title="Link not set yet — fill it in inside lib/content.ts"
        className="border-rule text-dim text-micro inline-flex cursor-not-allowed items-center gap-2 border border-dashed px-2.5 py-1.5"
      >
        <span aria-hidden="true">◇</span>
        {label} · UNSET
      </span>
    );
  }

  const accent =
    tone === "data"
      ? "hover:border-data hover:text-data"
      : "hover:border-signal hover:text-signal";

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`border-rule text-mid text-micro inline-flex items-center gap-2 border px-2.5 py-1.5 transition-colors ${accent}`}
    >
      <span aria-hidden="true">↗</span>
      {label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/**
 * Signal-strength bars. `level` is 0..1 and always derives from real counts —
 * see lib/derive.ts.
 */
export function SignalBars({
  level,
  segments = 7,
  tone = "data",
  className = "",
}: {
  level: number;
  segments?: number;
  tone?: Tone;
  className?: string;
}) {
  const lit = Math.round(level * segments);
  const fill =
    tone === "signal" ? "bg-signal" : tone === "data" ? "bg-data" : "bg-mid";

  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-end gap-[3px] ${className}`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={`w-[5px] ${i < lit ? fill : "bg-rule"}`}
          style={{ height: `${5 + i * 2.6}px` }}
        />
      ))}
    </span>
  );
}

/** Section heading: index, title, and a one-line operational subtitle. */
export function SectionHeading({
  code,
  title,
  subtitle,
  aside,
  titleId,
}: {
  code: string;
  title: string;
  subtitle: string;
  aside?: ReactNode;
  titleId?: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 sm:mb-10">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-signal text-micro tnum">{code}</span>
          <span aria-hidden="true" className="bg-rule-hi h-px w-8" />
          <span className="text-micro text-dim">{subtitle}</span>
        </div>
        <h2 id={titleId} className="font-display text-h2 text-ink tracking-tight">
          {title}
        </h2>
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}
