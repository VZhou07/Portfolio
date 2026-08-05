"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LinkChip, MicroLabel, StatusChip } from "@/components/gcs/primitives";
import { Reveal } from "@/components/gcs/reveal";
import {
  MISSIONS,
  SECTIONS,
  type Mission,
  type StatusCode,
} from "@/lib/content";
import { STACK_INDEX, STATUS_INDEX, statusStyle, verification } from "@/lib/derive";

const DEF = SECTIONS[2];

/** Flown vs still on the bench — real grouping, not decoration. */
const FLOWN: StatusCode[] = ["DEPLOYED", "FLIGHT-VERIFIED", "COMPLETE"];

export function Missions() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusCode | "ALL">("ALL");
  const [stack, setStack] = useState<string>("ALL");
  const [open, setOpen] = useState<Set<string>>(new Set());

  /* Radar contacts and hash links both announce themselves — open that card. */
  useEffect(() => {
    const reveal = (id: string) => {
      if (!MISSIONS.some((m) => m.id === id)) return;
      setOpen((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    };
    const onGoto = (e: Event) => {
      reveal((e as CustomEvent<string>).detail);
    };
    const onHash = () => reveal(window.location.hash.slice(1));

    window.addEventListener("gcs:goto", onGoto);
    window.addEventListener("hashchange", onHash);
    /* deferred so it is not a synchronous setState inside the effect body */
    const t = setTimeout(onHash, 0);

    return () => {
      window.removeEventListener("gcs:goto", onGoto);
      window.removeEventListener("hashchange", onHash);
      clearTimeout(t);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MISSIONS.filter((m) => {
      if (status !== "ALL" && m.status !== status) return false;
      if (stack !== "ALL" && !m.stack.includes(stack)) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.subtitle.toLowerCase().includes(q) ||
        m.brief.toLowerCase().includes(q) ||
        m.domain.toLowerCase().includes(q) ||
        m.org.toLowerCase().includes(q) ||
        m.stack.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [query, status, stack]);

  const flown = filtered.filter((m) => FLOWN.includes(m.status));
  const bench = filtered.filter((m) => !FLOWN.includes(m.status));

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setQuery("");
    setStatus("ALL");
    setStack("ALL");
  }, []);

  const allOpen = open.size >= MISSIONS.length;

  return (
    <section
      id={DEF.id}
      aria-labelledby={`${DEF.id}-title`}
      className="border-rule scroll-mt-14 border-b px-4 py-16 sm:px-6 sm:py-20 lg:px-10"
    >
      <div className="mx-auto w-full max-w-7xl">
        {/* heading */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <span className="text-signal text-micro tnum">
                {DEF.code} / {SECTIONS.length}
              </span>
              <span aria-hidden="true" className="bg-rule-hi h-px w-8" />
              <span className="text-micro text-dim">
                EVERY SORTIE, WITH ITS FLIGHT LOG
              </span>
            </div>
            <h2
              id={`${DEF.id}-title`}
              className="font-display text-h2 text-ink tracking-tight"
            >
              {DEF.label}
            </h2>
          </div>

          <button
            type="button"
            onClick={() =>
              setOpen(allOpen ? new Set() : new Set(MISSIONS.map((m) => m.id)))
            }
            className="border-rule text-micro text-mid hover:border-data hover:text-data border px-3 py-2 transition-colors"
          >
            {allOpen ? "COLLAPSE ALL LOGS" : "EXPAND ALL LOGS"}
          </button>
        </div>

        {/* ── filter bar: all three controls actually filter ─────────────── */}
        <div className="border-rule bg-panel/60 gcs-notch-sm mb-6 border p-3 sm:p-4">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <label htmlFor="msn-q" className="text-micro text-dim mb-1.5 block">
                SEARCH LOG
              </label>
              <input
                id="msn-q"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="name, stack, domain, org…"
                className="gcs-input"
              />
            </div>

            <div className="lg:col-span-4">
              <label htmlFor="msn-stack" className="text-micro text-dim mb-1.5 block">
                STACK FILTER
              </label>
              <select
                id="msn-stack"
                value={stack}
                onChange={(e) => setStack(e.target.value)}
                className="gcs-input"
              >
                <option value="ALL">ALL TOOLING ({STACK_INDEX.length})</option>
                {STACK_INDEX.map((s) => (
                  <option key={s.token} value={s.token}>
                    {s.token} ({s.count})
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-3">
              <MicroLabel className="mb-1.5">STATUS</MicroLabel>
              <div className="flex flex-wrap gap-1.5">
                <FilterChip
                  label={`ALL ${MISSIONS.length}`}
                  active={status === "ALL"}
                  onClick={() => setStatus("ALL")}
                />
                {STATUS_INDEX.map((s) => (
                  <FilterChip
                    key={s.status}
                    label={`${s.status} ${s.count}`}
                    active={status === s.status}
                    onClick={() => setStatus(s.status)}
                    tone={statusStyle(s.status).text}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="border-rule mt-3 flex flex-wrap items-center gap-3 border-t pt-3">
            <p aria-live="polite" className="text-micro text-mid tnum">
              SHOWING {filtered.length.toString().padStart(2, "0")} /{" "}
              {MISSIONS.length.toString().padStart(2, "0")} SORTIES
            </p>
            {(query || status !== "ALL" || stack !== "ALL") && (
              <button
                type="button"
                onClick={reset}
                className="text-micro text-signal hover:text-caution underline underline-offset-4"
              >
                CLEAR FILTERS
              </button>
            )}
          </div>

          {/* status meanings, spelled out — not hidden in a hover tooltip */}
          <dl className="border-rule mt-3 grid gap-x-6 gap-y-1 border-t pt-3 sm:grid-cols-2">
            {STATUS_INDEX.map((s) => (
              <div key={s.status} className="flex gap-2">
                <dt
                  className={`text-micro shrink-0 ${statusStyle(s.status).text}`}
                >
                  {s.status}
                </dt>
                <dd className="text-data text-dim min-w-0">
                  {statusStyle(s.status).note}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── results ───────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div className="border-rule text-data text-dim border border-dashed p-10 text-center">
            NO SORTIE MATCHES THAT FILTER.
            <button
              type="button"
              onClick={reset}
              className="text-signal ml-2 underline underline-offset-4"
            >
              RESET
            </button>
          </div>
        ) : (
          <div className="space-y-10">
            {flown.length > 0 && (
              <MissionGroup
                code="A"
                title="FLOWN"
                note="Shipped, merged or verified on the airframe"
                missions={flown}
                open={open}
                onToggle={toggle}
                onStack={setStack}
              />
            )}
            {bench.length > 0 && (
              <MissionGroup
                code="B"
                title="ON THE BENCH"
                note="Active development — honest status, not marketing"
                missions={bench}
                open={open}
                onToggle={toggle}
                onStack={setStack}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  tone = "text-mid",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-micro border px-2 py-1 transition-colors ${
        active
          ? "border-signal bg-signal text-void"
          : `border-rule hover:border-rule-hi ${tone}`
      }`}
    >
      {label}
    </button>
  );
}

function MissionGroup({
  code,
  title,
  note,
  missions,
  open,
  onToggle,
  onStack,
}: {
  code: string;
  title: string;
  note: string;
  missions: Mission[];
  open: Set<string>;
  onToggle: (id: string) => void;
  onStack: (token: string) => void;
}) {
  return (
    <div>
      <div className="border-rule mb-4 flex items-baseline gap-3 border-b pb-2">
        <span className="text-micro text-signal">GROUP {code}</span>
        <h3 className="font-display text-label text-ink tracking-label">{title}</h3>
        <span className="text-micro text-dim truncate">{note}</span>
        <span className="text-micro text-dim tnum ml-auto shrink-0">
          {missions.length.toString().padStart(2, "0")}
        </span>
      </div>

      <ul className="space-y-3">
        {missions.map((m, i) => (
          <Reveal as="li" key={m.id} delay={i * 45}>
            <MissionRow
              mission={m}
              open={open.has(m.id)}
              onToggle={() => onToggle(m.id)}
              onStack={onStack}
            />
          </Reveal>
        ))}
      </ul>
    </div>
  );
}

function MissionRow({
  mission,
  open,
  onToggle,
  onStack,
}: {
  mission: Mission;
  open: boolean;
  onToggle: () => void;
  onStack: (token: string) => void;
}) {
  const panelId = `${mission.id}-log`;
  const tone = statusStyle(mission.status);
  const verify = verification(mission);
  const serial = mission.id.replace("msn-", "");

  return (
    <article
      id={mission.id}
      className={`gcs-notch border-rule bg-panel/70 hover:border-rule-hi scroll-mt-16 border transition-colors ${
        open ? "border-rule-hi" : ""
      }`}
    >
      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-12">
        {/* ident column */}
        <div className="lg:col-span-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-signal font-display text-h3 tnum">MSN-{serial}</span>
            <span aria-hidden="true" className={`h-2 w-2 rotate-45 ${tone.dot}`} />
          </div>
          <p className="text-micro text-dim mb-3">{mission.domain}</p>
          <StatusChip status={mission.status} verification={verify} />
          <dl className="text-micro mt-3 space-y-1">
            <div className="flex gap-2">
              <dt className="text-dim w-14 shrink-0">ORG</dt>
              <dd className="text-mid min-w-0">{mission.org}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-dim w-14 shrink-0">WINDOW</dt>
              <dd className="text-mid min-w-0">{mission.window}</dd>
            </div>
          </dl>
        </div>

        {/* body */}
        <div className="lg:col-span-9">
          <h4 className="font-display text-h3 text-ink mb-1 tracking-tight">
            {mission.name}
          </h4>
          <p className="text-micro text-signal/90 mb-3">{mission.subtitle}</p>
          <p className="text-mid text-body mb-4 max-w-3xl">{mission.brief}</p>

          {/* stack tokens double as filters */}
          <ul className="mb-4 flex flex-wrap gap-1.5">
            {mission.stack.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onStack(s)}
                  title={`Filter the log by ${s}`}
                  className="border-rule text-micro text-dim hover:border-data hover:text-data border px-2 py-1 transition-colors"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={open}
              aria-controls={panelId}
              className="border-signal/60 text-micro text-signal hover:bg-signal hover:text-void border px-3 py-2 font-semibold transition-colors"
            >
              {open ? "CLOSE FLIGHT LOG" : `FLIGHT LOG · ${mission.log.length} ENTRIES`}
              <span aria-hidden="true" className="ml-2">
                {open ? "▴" : "▾"}
              </span>
            </button>
            {mission.links.map((l) => (
              <LinkChip key={l.href} label={l.label} href={l.href} />
            ))}
          </div>
        </div>
      </div>

      {/* expandable log — stays in the DOM for SEO, inert while closed */}
      <div
        id={panelId}
        aria-hidden={!open}
        inert={!open}
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        className="gcs-collapse grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out"
      >
        <div className="min-h-0">
          <div className="border-rule bg-void/40 grid gap-6 border-t p-4 sm:p-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <MicroLabel className="mb-3">
                FLIGHT LOG · WHAT WAS ACTUALLY BUILT
              </MicroLabel>
              <ol className="space-y-2.5">
                {mission.log.map((entry, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="text-signal text-micro tnum mt-1 shrink-0">
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                    <span className="text-mid text-data">{entry}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* telemetry-style stat block */}
            <dl className="border-rule bg-panel/60 lg:col-span-5 border p-3">
              {[
                { k: "STATUS", v: mission.status, cls: tone.text },
                {
                  k: "VERIFIED",
                  v: verify.label,
                  cls: verify.ok ? "text-nominal" : "text-fault",
                },
                { k: "STACK", v: `${mission.stack.length} ITEMS`, cls: "text-data" },
                { k: "DOMAIN", v: mission.domain, cls: "text-mid" },
                { k: "WINDOW", v: mission.window, cls: "text-mid" },
              ].map((row) => (
                <div key={row.k} className="flex items-baseline gap-2 py-1.5">
                  <dt className="text-micro text-dim shrink-0">{row.k}</dt>
                  <span
                    aria-hidden="true"
                    className="border-rule min-w-4 flex-1 translate-y-[-3px] border-b border-dotted"
                  />
                  <dd className={`text-micro tnum shrink-0 text-right ${row.cls}`}>
                    {row.v}
                  </dd>
                </div>
              ))}
              <div className="border-rule mt-2 border-t pt-3">
                <MicroLabel className="mb-1.5">IMPACT</MicroLabel>
                <p className="text-data text-ink">{mission.impact}</p>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </article>
  );
}
