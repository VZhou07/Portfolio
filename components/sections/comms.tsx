"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MicroLabel } from "@/components/gcs/primitives";
import { Section } from "@/components/gcs/section";
import { COMMS, PROFILE, SECTIONS, isPlaceholder } from "@/lib/content";

const DEF = SECTIONS[6];

const BANDS = [
  "ROLE / INTERNSHIP",
  "PROJECT COLLABORATION",
  "QUESTION ABOUT A MISSION",
  "SOMETHING ELSE",
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Fields {
  callsign: string;
  freq: string;
  band: string;
  payload: string;
}

type Errors = Partial<Record<keyof Fields, string>>;

function validate(f: Fields): Errors {
  const e: Errors = {};
  if (f.callsign.trim().length < 2) e.callsign = "Enter a name of at least 2 characters.";
  if (!EMAIL_RE.test(f.freq.trim())) e.freq = "Enter an address I can reply to, e.g. you@domain.com.";
  if (!BANDS.includes(f.band as (typeof BANDS)[number])) e.band = "Pick a band.";
  if (f.payload.trim().length < 12) e.payload = "Give me at least 12 characters to work with.";
  return e;
}

export function Comms() {
  const primary = COMMS[0];
  const mailReady = !isPlaceholder(primary.value);

  const [fields, setFields] = useState<Fields>({
    callsign: "",
    freq: "",
    band: BANDS[0],
    payload: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Set<keyof Fields>>(new Set());
  const [status, setStatus] = useState<"IDLE" | "SENT" | "COPIED">("IDLE");

  const refs = useRef<Record<keyof Fields, HTMLElement | null>>({
    callsign: null,
    freq: null,
    band: null,
    payload: null,
  });

  const set = useCallback(
    (key: keyof Fields) =>
      (
        e: React.ChangeEvent<
          HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
        >,
      ) => {
        const value = e.target.value;
        setFields((prev) => ({ ...prev, [key]: value }));
        /* clear the complaint while they are fixing it; re-check on blur */
        setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
        setStatus("IDLE");
      },
    [],
  );

  const blur = useCallback(
    (key: keyof Fields) => () => {
      setTouched((prev) => new Set(prev).add(key));
      setErrors((prev) => ({ ...prev, [key]: validate(fields)[key] }));
    },
    [fields],
  );

  const transmission = useMemo(() => {
    const subject = `[${fields.band}] transmission from ${fields.callsign || "unknown callsign"}`;
    const body = [
      fields.payload,
      "",
      "—",
      `CALLSIGN: ${fields.callsign}`,
      `RETURN FREQ: ${fields.freq}`,
      `BAND: ${fields.band}`,
      `SENT FROM: ${PROFILE.name}'s ground station`,
    ].join("\n");
    return { subject, body };
  }, [fields]);

  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const found = validate(fields);
      setErrors(found);
      setTouched(new Set(Object.keys(fields) as (keyof Fields)[]));

      const firstBad = (Object.keys(found) as (keyof Fields)[])[0];
      if (firstBad) {
        refs.current[firstBad]?.focus();
        return;
      }

      if (!mailReady) return;

      const url = `mailto:${primary.value}?subject=${encodeURIComponent(
        transmission.subject,
      )}&body=${encodeURIComponent(transmission.body)}`;
      window.location.href = url;
      setStatus("SENT");
    },
    [fields, mailReady, primary.value, transmission],
  );

  const copyTransmission = useCallback(() => {
    const text = `To: ${mailReady ? primary.value : "[set EMAIL in lib/content.ts]"}\nSubject: ${transmission.subject}\n\n${transmission.body}`;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setStatus("COPIED"))
      .catch(() => undefined);
  }, [mailReady, primary.value, transmission]);

  const err = (k: keyof Fields) => (touched.has(k) ? errors[k] : undefined);

  return (
    <Section
      def={DEF}
      subtitle="SEND A TRANSMISSION — IT REALLY SENDS"
      aside={
        <span className="text-micro text-dim">
          {COMMS.filter((c) => !isPlaceholder(c.href)).length}/{COMMS.length}{" "}
          CHANNELS LIVE
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-12">
        {/* ── the form ──────────────────────────────────────────────────── */}
        <form
          onSubmit={submit}
          noValidate
          aria-labelledby="comms-form-title"
          className="border-rule bg-panel/70 gcs-notch lg:col-span-7 border p-4 sm:p-6"
        >
          <h3
            id="comms-form-title"
            className="font-display text-label text-ink tracking-label mb-1"
          >
            UPLINK COMPOSER
          </h3>
          <p className="text-micro text-dim mb-5">
            VALIDATED CLIENT-SIDE, THEN HANDED TO YOUR MAIL CLIENT. NO BACKEND, NO
            THIRD PARTY, NOTHING STORED.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="callsign"
              label="CALLSIGN"
              hint="your name"
              error={err("callsign")}
            >
              <input
                ref={(el) => {
                  refs.current.callsign = el;
                }}
                id="callsign"
                name="callsign"
                type="text"
                autoComplete="name"
                value={fields.callsign}
                onChange={set("callsign")}
                onBlur={blur("callsign")}
                aria-invalid={err("callsign") ? true : undefined}
                aria-describedby={err("callsign") ? "callsign-err" : "callsign-hint"}
                className="gcs-input"
                placeholder="A. Operator"
              />
            </Field>

            <Field
              id="freq"
              label="RETURN FREQUENCY"
              hint="where I reply"
              error={err("freq")}
            >
              <input
                ref={(el) => {
                  refs.current.freq = el;
                }}
                id="freq"
                name="freq"
                type="email"
                autoComplete="email"
                value={fields.freq}
                onChange={set("freq")}
                onBlur={blur("freq")}
                aria-invalid={err("freq") ? true : undefined}
                aria-describedby={err("freq") ? "freq-err" : "freq-hint"}
                className="gcs-input"
                placeholder="you@domain.com"
              />
            </Field>
          </div>

          <div className="mt-4">
            <Field id="band" label="BAND" hint="what this is about" error={err("band")}>
              <select
                ref={(el) => {
                  refs.current.band = el;
                }}
                id="band"
                name="band"
                value={fields.band}
                onChange={set("band")}
                onBlur={blur("band")}
                aria-invalid={err("band") ? true : undefined}
                aria-describedby={err("band") ? "band-err" : "band-hint"}
                className="gcs-input"
              >
                {BANDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4">
            <Field
              id="payload"
              label="PAYLOAD"
              hint={`${fields.payload.trim().length} chars · 12 minimum`}
              error={err("payload")}
            >
              <textarea
                ref={(el) => {
                  refs.current.payload = el;
                }}
                id="payload"
                name="payload"
                rows={6}
                value={fields.payload}
                onChange={set("payload")}
                onBlur={blur("payload")}
                aria-invalid={err("payload") ? true : undefined}
                aria-describedby={err("payload") ? "payload-err" : "payload-hint"}
                className="gcs-input resize-y"
                placeholder="What are you building, and where do you want a hand?"
              />
            </Field>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!mailReady}
              title={
                mailReady
                  ? undefined
                  : "Set EMAIL in lib/content.ts to enable transmission"
              }
              className="gcs-notch-sm bg-signal text-void text-micro hover:bg-caution disabled:bg-rule disabled:text-dim px-5 py-2.5 font-semibold transition-colors disabled:cursor-not-allowed"
            >
              TRANSMIT
            </button>
            <button
              type="button"
              onClick={copyTransmission}
              className="border-rule text-micro text-mid hover:border-data hover:text-data border px-4 py-2.5 transition-colors"
            >
              COPY TRANSMISSION
            </button>
          </div>

          {/* one live region for the whole form */}
          <p
            role="status"
            aria-live="polite"
            className="text-micro mt-4 min-h-4"
          >
            {status === "SENT" && (
              <span className="text-nominal">
                TRANSMISSION QUEUED — YOUR MAIL CLIENT SHOULD BE OPENING. IF IT DID
                NOT, USE COPY TRANSMISSION.
              </span>
            )}
            {status === "COPIED" && (
              <span className="text-data">
                TRANSMISSION COPIED TO CLIPBOARD.
              </span>
            )}
            {status === "IDLE" && Object.keys(errors).length > 0 && (
              <span className="text-fault">
                {Object.values(errors).filter(Boolean).length} FIELD(S) NEED
                ATTENTION.
              </span>
            )}
          </p>

          {!mailReady && (
            <p className="border-caution/40 text-caution text-micro mt-3 border border-dashed p-3 leading-relaxed">
              TRANSMIT IS DISABLED BECAUSE{" "}
              <code className="text-data">COMMS[0].value</code> IN{" "}
              <code className="text-data">lib/content.ts</code> IS STILL A
              PLACEHOLDER. DROP YOUR REAL ADDRESS IN AND THE BUTTON ARMS ITSELF —
              THE SITE WILL NOT SHIP A BUTTON THAT GOES NOWHERE.
            </p>
          )}
        </form>

        {/* ── channels ──────────────────────────────────────────────────── */}
        <div className="grid content-start gap-4 lg:col-span-5">
          <div className="border-rule bg-panel/70 gcs-notch border p-4 sm:p-5">
            <MicroLabel className="mb-3">DIRECT CHANNELS</MicroLabel>
            <ul className="divide-rule divide-y">
              {COMMS.map((c) => (
                <li key={c.code} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-micro text-signal tnum shrink-0">
                      {c.code}
                    </span>
                    <span className="text-micro text-dim shrink-0">{c.label}</span>
                    <span
                      aria-hidden="true"
                      className="border-rule min-w-3 flex-1 translate-y-[-3px] border-b border-dotted"
                    />
                    <span
                      className={`text-micro shrink-0 ${
                        isPlaceholder(c.href) ? "text-dim" : "text-nominal"
                      }`}
                    >
                      {isPlaceholder(c.href) ? "UNSET" : "LIVE"}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {isPlaceholder(c.href) ? (
                      <span
                        aria-disabled="true"
                        title="Fill this in inside lib/content.ts"
                        className="text-data text-dim cursor-not-allowed line-through"
                      >
                        {c.value}
                      </span>
                    ) : (
                      <a
                        href={c.href}
                        target={c.href.startsWith("mailto:") ? undefined : "_blank"}
                        rel={
                          c.href.startsWith("mailto:")
                            ? undefined
                            : "noopener noreferrer"
                        }
                        className="text-data text-mid hover:text-signal underline-offset-4 hover:underline"
                      >
                        {c.value}
                      </a>
                    )}
                    {c.label === "EMAIL" && mailReady && (
                      <CopyChip value={c.value} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-rule bg-panel/50 border p-4 sm:p-5">
            <MicroLabel className="mb-2">OPERATING NOTES</MicroLabel>
            <ul className="text-data text-dim space-y-2">
              <li>Based {PROFILE.location}.</li>
              <li>
                Fastest route is the primary channel above; I read everything.
              </li>
              <li>
                Mission code in the subject line gets you a faster, more specific
                answer.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-micro text-mid">
          {label}
        </label>
        <span id={`${id}-hint`} className="text-micro text-dim">
          {hint}
        </span>
      </div>
      {children}
      {error && (
        <p id={`${id}-err`} className="text-micro text-fault mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}

function CopyChip({ value }: { value: string }) {
  const [done, setDone] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1600);
          })
          .catch(() => undefined);
      }}
      className={`text-micro border px-2 py-0.5 transition-colors ${
        done
          ? "border-nominal text-nominal"
          : "border-rule text-dim hover:border-data hover:text-data"
      }`}
    >
      {done ? "COPIED" : "COPY"}
    </button>
  );
}
